/**
 * Reminder runner (Spec 14, Phase 2) — server-only. Collects a user's data,
 * computes what's due (lib/notifications/reminders.ts), and sends via web-push.
 *
 * Parameterised by a Supabase client + userId so ONE path serves both:
 *   - the test harness  — session client (RLS), the current user, force = true
 *   - the scheduler     — service-role client, each founder, force = false
 *
 * NOT a "use server" module (it exports non-action helpers) and never imported by
 * client code — it pulls in web-push (Node). Times are interpreted in the user's
 * profiles.timezone (IANA), falling back to DEFAULT_TZ.
 */
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  dueUnlogged,
  localParts,
  lowStock,
  doseReminderMessage,
  missedNudgeMessage,
  lowStockMessage,
  PC_REMINDER_SELECT,
  type ReminderCompound,
  type LowStockItem,
  type PushMessage,
} from "@/lib/notifications/reminders";
import {
  trialReminderMessage,
  trialReminderVerdict,
  type TrialForReminder,
} from "@/lib/notifications/trialReminder";
import { cycleRuleFromColumns, type CycleColumns } from "@/lib/protocol/cycleRule";

const VAPID_PUBLIC =
  process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:notifications@trackdco.app";

/** Founders are AU; a user with no stored timezone falls back to this. */
const DEFAULT_TZ = "Australia/Sydney";


type Client = SupabaseClient;

export interface RunResult {
  ok: boolean;
  sent: number;
  dueCount: number;
  lowCount: number;
  reason?: string;
  /**
   * What happened to the trial reminder: `"sent"`, or the reason it was not.
   *
   * Reported rather than inferred because the cron's only output is this object,
   * and from outside, "no trial reminder went out" is identical whether the user
   * has no trial, the migration is unapplied, or the whole thing is broken. The
   * whole feature is a promise being kept, so it has to be observable that it
   * was. Undefined means nothing about a trial arose at all.
   */
  trialReminder?: string;
}

/* ------------------------------------------------------------- time helpers */

/** "HH:MM[:SS]" → minutes since midnight. */
function toMinutes(time: string | null): number {
  if (!time) return 0;
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Quiet window, allowing a wrap past midnight (e.g. 22:00 → 08:00). */
function inQuietHours(minutes: number, startMin: number, endMin: number): boolean {
  if (startMin === endMin) return false;
  return startMin < endMin
    ? minutes >= startMin && minutes < endMin
    : minutes >= startMin || minutes < endMin;
}

/* ------------------------------------------------------------- data collect */

interface UserData {
  prefs: Record<string, unknown> | null;
  tz: string;
  notificationsEnabled: boolean;
  compounds: ReminderCompound[];
  loggedTodayIds: Set<string>;
  stock: LowStockItem[];
  todayKey: string;
  nowMinutes: number;
  /** The user's trialing subscription, if they have one. */
  trial: TrialForReminder | null;
  /**
   * The reminder date already sent for, from `trial_reminder_sent_for`.
   *
   * `undefined` is a THIRD state and not the same as null: it means
   * `supabase/notifications/004` has not been applied, so there is nowhere to
   * record a send. Null means the column is there and empty.
   */
  trialSentFor: string | null | undefined;
}

/**
 * The trial reminder's own two reads, kept OUT of the preferences select.
 *
 * `trial_reminder_sent_for` arrives with `supabase/notifications/004`, which is
 * applied by hand. Adding it to the preferences select would mean that, for the
 * whole window between deploying this and pasting the SQL, the entire select
 * fails with `42703` and every preference falls back to its default — quiet
 * hours, each type's fire time, and all three dedupe stamps at once. A dose
 * reminder firing every fifteen minutes through the night is a far worse
 * outcome than a trial reminder that has not started yet.
 *
 * So it is its own query, and its failure is contained to its own feature.
 */
async function collectTrial(
  supabase: Client,
  userId: string,
): Promise<{ trial: TrialForReminder | null; sentFor: string | null | undefined }> {
  const [subRes, stampRes] = await Promise.all([
    supabase
      .from("subscriptions")
      // Reading the MIRROR, which no access check may read. This is not an
      // access check: it grants nothing and gates nothing, and telling somebody
      // their trial ends on the 14th is the exact job the mirror exists for.
      .select("status, trial_ends_at, cancel_at_period_end")
      .eq("user_id", userId)
      .eq("status", "trialing")
      // A user should only ever have one. If a stale row somehow survives, the
      // most recently updated one is the live truth.
      .order("updated_at", { ascending: false })
      .limit(1),
    supabase
      .from("notification_preferences")
      .select("trial_reminder_sent_for")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const row = subRes.data?.[0] as Record<string, unknown> | undefined;
  const trial: TrialForReminder | null = row
    ? {
        status: row.status as string,
        trialEndsAt: (row.trial_ends_at as string | null) ?? null,
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      }
    : null;

  // `42703` is Postgres's undefined_column. PostgREST also reports it as
  // `PGRST204` on some shapes, so both are read as "the migration is not applied
  // yet" rather than as a transient failure.
  const code = stampRes.error?.code;
  const migrationMissing = code === "42703" || code === "PGRST204";
  const sentFor = migrationMissing
    ? undefined
    : ((stampRes.data as Record<string, unknown> | null)?.trial_reminder_sent_for as
        | string
        | null
        | undefined) ?? null;

  return { trial, sentFor };
}

async function collectUserData(
  supabase: Client,
  userId: string,
  now: Date,
): Promise<UserData> {
  const [prefsRes, profileRes] = await Promise.all([
    supabase
      .from("notification_preferences")
      .select(
        "dose_reminders_on, unlogged_alert_on, low_inventory_alert_on, reminder_time, missed_cutoff_time, quiet_start, quiet_end, low_stock_days, last_dose_reminder_on, last_missed_nudge_on, last_low_stock_on",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("timezone, notifications_enabled")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  const profile = (profileRes.data ?? {}) as Record<string, unknown>;
  const tz = (profile.timezone as string | null) || DEFAULT_TZ;
  const { dateKey: todayKey, minutes: nowMinutes } = localParts(now, tz);

  // Active compounds (+ catalogue name) and recent "taken" logs to detect what's
  // already logged today. A 36h window covers any timezone offset around midnight.
  const since = new Date(now.getTime() - 36 * 3_600_000).toISOString();
  const [pcRes, logRes, invRes, pauseRes] = await Promise.all([
    supabase
      .from("protocol_compounds")
      // The `cycle_*` columns ride along because an off-cycle day is NOT due
      // (`supabase/protocol/006`). Without them this runner cannot know a cycle
      // exists and announces doses the app itself is correctly hiding.
      .select(PC_REMINDER_SELECT)
      .eq("user_id", userId)
      .eq("is_active", true),
    supabase
      .from("dose_logs")
      // NOT filtered to `taken`. A SKIPPED dose is dealt with — the user made a
      // decision about it — so it must not be nagged as forgotten. It still
      // counts against the consistency percentage (`lib/progress/consistency.ts`
      // explains why those are different questions), but a push saying "you
      // haven't logged this" about a dose you deliberately skipped is just wrong.
      .select("protocol_compound_id, taken_at, status")
      .eq("user_id", userId)
      .gte("taken_at", since),
    supabase
      .from("inventory_items")
      // `protocol_compound_id` rides along so a vial can be matched to a PAUSE.
      // Without it the paused lookup below silently reads `undefined` and never
      // matches, so a paused compound keeps sending low-stock nudges.
      .select("id, protocol_compound_id, protocol_compounds!inner(is_active, compounds(name))")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("protocol_compounds.is_active", true),
    // Pauses covering TODAY. A paused compound announces nothing and is nagged
    // about nothing — the same gate the client applies in `isDueOnFor`
    // (`supabase/protocol/018`). Selected separately rather than joined so a
    // compound with several historic pauses is not multiplied by them.
    //
    // Tolerant of `018` not being applied: the error is swallowed below and the
    // paused set is simply empty, which is exactly today's behaviour.
    supabase
      .from("compound_pauses")
      .select("protocol_compound_id, started_on, ends_on")
      .eq("user_id", userId)
      .eq("is_active", true)
      .lte("started_on", todayKey),
  ]);

  const pausedIds = new Set<string>();
  for (const row of pauseRes.data ?? []) {
    const r = row as Record<string, unknown>;
    const endsOn = r.ends_on as string | null;
    // `ends_on` is the LAST paused day, inclusive — so a pause ending today
    // still covers today.
    if (endsOn === null || endsOn >= todayKey) {
      pausedIds.add(r.protocol_compound_id as string);
    }
  }

  const compounds: ReminderCompound[] = (pcRes.data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const cmp = r.compounds as { name?: string } | null;
    return {
      id: r.id as string,
      name: cmp?.name ?? "your compound",
      schedule_type: r.schedule_type as ReminderCompound["schedule_type"],
      days_of_week: (r.days_of_week as number[] | null) ?? null,
      interval_days: (r.interval_days as number | null) ?? null,
      first_dose_on: r.first_dose_on as string,
      end_date: (r.end_date as string | null) ?? null,
      // Resolved with the SAME mapper the client uses, so the two cannot read
      // the same seven columns differently.
      cycle: cycleRuleFromColumns(r as Partial<CycleColumns>),
      paused: pausedIds.has(r.id as string),
    };
  });

  // Everything RESOLVED today, taken or skipped. Named for what it gates: the
  // "you have not logged this" nudge.
  const loggedTodayIds = new Set<string>();
  for (const row of logRes.data ?? []) {
    const r = row as Record<string, unknown>;
    const takenAt = r.taken_at as string | null;
    if (!takenAt) continue;
    if (localParts(new Date(takenAt), tz).dateKey === todayKey) {
      loggedTodayIds.add(r.protocol_compound_id as string);
    }
  }

  // Stitch each active vial to its v_inventory_math runway.
  const items = (invRes.data ?? []) as Record<string, unknown>[];
  const ids = items.map((r) => r.id as string);
  const mathById = new Map<string, Record<string, unknown>>();
  if (ids.length > 0) {
    const { data: math } = await supabase
      .from("v_inventory_math")
      // `days_to_empty` is the timezone-free count (`supabase/protocol/010`) the
      // Protocol card reads; `est_empty_date` stays only as the fallback.
      .select("inventory_item_id, est_empty_date, days_to_empty, doses_remaining")
      .in("inventory_item_id", ids);
    for (const m of math ?? []) {
      mathById.set((m as Record<string, unknown>).inventory_item_id as string, m as Record<string, unknown>);
    }
  }
  const stock: LowStockItem[] = items.map((r) => {
    const pc = r.protocol_compounds as { compounds?: { name?: string } } | null;
    const m = mathById.get(r.id as string) ?? {};
    return {
      // Not "a vial" — this row may be a tub or a bottle, and the fallback also
      // has to read as a NAME, since it is dropped into a comma-joined list.
      name: pc?.compounds?.name ?? "Something",
      // Its compound is paused, so the stock is not moving and "running low" is
      // noise. `019` already returns a longer (or null) runway for these; this
      // is the belt to that braces, and it holds even before 019 is applied.
      paused: pausedIds.has(r.protocol_compound_id as string),
      estEmptyDate: (m.est_empty_date as string | null) ?? null,
      daysToEmpty: m.days_to_empty == null ? null : Number(m.days_to_empty),
      dosesRemaining: m.doses_remaining == null ? null : Number(m.doses_remaining),
    };
  });

  const { trial, sentFor } = await collectTrial(supabase, userId);

  return {
    prefs: prefsRes.data as Record<string, unknown> | null,
    tz,
    notificationsEnabled: Boolean(profile.notifications_enabled),
    compounds,
    loggedTodayIds,
    stock,
    todayKey,
    nowMinutes,
    trial,
    trialSentFor: sentFor,
  };
}

/* --------------------------------------------------------------- sending */

/**
 * What a send actually achieved.
 *
 * `byTag` is per-MESSAGE and it is the half that matters. The dedupe stamps used
 * to be gated on the total alone, which quietly says "this went out" about a
 * message that did not: a user whose endpoint died partway through the loop got
 * their dose reminder, lost their low-stock alert, and had BOTH stamped as
 * delivered. It never mattered enough to notice while the three messages were
 * all protocol nudges that would come round again tomorrow.
 *
 * The trial reminder has no tomorrow. It has one promised day, it is a notice
 * that money is about to move, and a stamp claiming it was delivered when it was
 * not is the exact failure the whole feature exists to prevent. So each message
 * now carries its own count and each stamp is gated on its own message.
 */
interface SendReport {
  total: number;
  byTag: Record<string, number>;
}

/** Send each message to every device the user has, pruning dead endpoints. */
async function sendMessages(
  supabase: Client,
  userId: string,
  messages: PushMessage[],
): Promise<SendReport> {
  const empty: SendReport = { total: 0, byTag: {} };
  if (messages.length === 0) return empty;
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs || subs.length === 0) return empty;

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const byTag: Record<string, number> = {};
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (row) => {
      const s = row as Record<string, unknown>;
      const sub = {
        endpoint: s.endpoint as string,
        keys: { p256dh: s.p256dh as string, auth: s.auth as string },
      };
      for (const msg of messages) {
        try {
          await webpush.sendNotification(sub, JSON.stringify(msg), { timeout: 5000 });
          sent += 1;
          byTag[msg.tag] = (byTag[msg.tag] ?? 0) + 1;
        } catch (err) {
          const code = (err as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) {
            dead.push(sub.endpoint);
            break; // endpoint is gone — don't try the rest
          }
        }
      }
    }),
  );

  if (dead.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .in("endpoint", dead);
  }
  return { total: sent, byTag };
}

/* --------------------------------------------------------------- run */

/**
 * Compute + send a user's reminders.
 *  - force = true (test): ignore time-of-day, quiet hours, and dedupe; send the
 *    real dose + low-stock content, or a friendly "nothing due" if there's none,
 *    so the test always produces a visible notification. Does not touch stamps.
 *  - force = false (scheduler): respect the master flag, quiet hours, each type's
 *    fire time, and the once-per-day dedupe stamps (which it then advances).
 */
export async function runForUser(
  supabase: Client,
  userId: string,
  opts: { force?: boolean; now?: Date } = {},
): Promise<RunResult> {
  const force = opts.force ?? false;
  const now = opts.now ?? new Date();

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return { ok: false, sent: 0, dueCount: 0, lowCount: 0, reason: "vapid-unconfigured" };
  }

  const data = await collectUserData(supabase, userId, now);
  const p = data.prefs ?? {};

  if (!force && !data.notificationsEnabled) {
    return { ok: true, sent: 0, dueCount: 0, lowCount: 0, reason: "disabled" };
  }

  const quietStart = toMinutes((p.quiet_start as string) ?? "22:00:00");
  const quietEnd = toMinutes((p.quiet_end as string) ?? "08:00:00");
  if (!force && inQuietHours(data.nowMinutes, quietStart, quietEnd)) {
    return { ok: true, sent: 0, dueCount: 0, lowCount: 0, reason: "quiet-hours" };
  }

  const due = dueUnlogged(data.compounds, data.loggedTodayIds, data.todayKey);
  const lowDays = Number(p.low_stock_days ?? 7);
  const low = lowStock(data.stock, data.todayKey, lowDays);

  const messages: PushMessage[] = [];
  /**
   * Columns to advance after sending, each tied to the MESSAGE that earns it.
   *
   * The `tag` is the link. It was a flat `Record<column, value>` advanced on the
   * total send count, which stamps a message that never left as delivered —
   * see {@link SendReport}.
   */
  const stamps: Array<{ column: string; value: string; tag: string }> = [];

  /** Why the trial reminder did not go out, for {@link RunResult.trialReminder}. */
  let trialReason: string | undefined;

  const reminderMin = toMinutes((p.reminder_time as string) ?? "09:00:00");
  const missedMin = toMinutes((p.missed_cutoff_time as string) ?? "20:00:00");
  const doseOn = p.dose_reminders_on !== false;
  const missedOn = p.unlogged_alert_on !== false;
  const lowOn = p.low_inventory_alert_on !== false;

  if (force) {
    // Test send: real content if any, else a friendly confirmation.
    const dose = doseReminderMessage(due);
    const lowMsg = lowStockMessage(low);
    if (dose) messages.push(dose);
    if (lowMsg) messages.push(lowMsg);
    if (messages.length === 0) {
      messages.push({
        title: "Trackd",
        body: "Notifications are working. Nothing's due right now.",
        url: "/dashboard",
        tag: "trackd-test",
      });
    }
  } else {
    // Scheduled: each type fires at its time, once per local day.
    if (doseOn && due.length > 0 && data.nowMinutes >= reminderMin && p.last_dose_reminder_on !== data.todayKey) {
      const m = doseReminderMessage(due);
      if (m) {
        messages.push(m);
        stamps.push({ column: "last_dose_reminder_on", value: data.todayKey, tag: m.tag });
      }
    }
    if (missedOn && due.length > 0 && data.nowMinutes >= missedMin && p.last_missed_nudge_on !== data.todayKey) {
      const m = missedNudgeMessage(due);
      if (m) {
        messages.push(m);
        stamps.push({ column: "last_missed_nudge_on", value: data.todayKey, tag: m.tag });
      }
    }
    if (lowOn && low.length > 0 && data.nowMinutes >= reminderMin && p.last_low_stock_on !== data.todayKey) {
      const m = lowStockMessage(low);
      if (m) {
        messages.push(m);
        stamps.push({ column: "last_low_stock_on", value: data.todayKey, tag: m.tag });
      }
    }

    /**
     * THE TRIAL REMINDER — the promise the paywall makes out loud.
     *
     * Three things about where this sits.
     *
     * **It is not behind any of the three content toggles.** `dose_reminders_on`,
     * `unlogged_alert_on` and `low_inventory_alert_on` are preferences about
     * PROTOCOL nudges. This is a notice that money is about to leave someone's
     * account, promised on the screen where they entered their card, and turning
     * off dose reminders is not consent to be charged without warning.
     *
     * **It IS behind the master switch and quiet hours**, both of which have
     * already returned above. That is the honest limit of a push-only reminder:
     * a user who never granted notification permission has no channel, and there
     * is nothing here that can invent one. `next-tasks.md` carries that gap.
     *
     * **It fires from the same `reminder_time` as the morning digest**, so it
     * arrives at a chosen hour rather than at whatever minute of the night the
     * cron happened to tick over into the promised day.
     */
    if (data.trialSentFor === undefined) {
      // `supabase/notifications/004` is not applied — there is nowhere to record
      // a send, and sending without recording would repeat every fifteen
      // minutes for a whole day. Withholding is the safe direction, and it is
      // exactly today's behaviour rather than a regression.
      if (data.trial) {
        console.warn(
          "[reminders] a trial is running but `trial_reminder_sent_for` is missing; apply supabase/notifications/004_trial_reminder.sql",
        );
        trialReason = "migration-004-not-applied";
      }
    } else if (data.nowMinutes < reminderMin) {
      if (data.trial) trialReason = "before-reminder-time";
    } else {
      const verdict = trialReminderVerdict(
        data.trial,
        data.tz,
        data.todayKey,
        data.trialSentFor,
      );
      if (verdict.send && data.trial) {
        const m = trialReminderMessage(data.trial, data.tz);
        if (m) {
          messages.push(m);
          // The reminder's own DATE, not today. See `trialReminderVerdict` and
          // `supabase/notifications/004` — a catch-up send on day 6 stamps day 5,
          // so the next tick sees its own work.
          stamps.push({
            column: "trial_reminder_sent_for",
            // The reminder's own DATE, not today. See `trialReminderVerdict` and
            // `supabase/notifications/004` — a catch-up send on day 6 stamps day
            // 5, so the next tick sees its own work.
            value: verdict.forDate,
            tag: m.tag,
          });
        }
      } else if (!verdict.send) {
        trialReason = verdict.reason;
      }
    }
  }

  const report = await sendMessages(supabase, userId, messages);

  // Advance a dedupe stamp only for the scheduled path, and only for a message
  // that actually reached at least one device — so a transient send failure
  // retries next tick rather than silently claiming to have been delivered.
  const earned = stamps.filter((s) => (report.byTag[s.tag] ?? 0) > 0);
  if (!force && earned.length > 0) {
    const patch = Object.fromEntries(earned.map((s) => [s.column, s.value]));
    const { error } = await supabase
      .from("notification_preferences")
      .update(patch)
      .eq("user_id", userId);
    // Checked, because an unwritten stamp means the same message goes out again
    // on the next tick — every fifteen minutes until the day ends.
    if (error) {
      console.error(`[reminders] could not advance stamps for ${userId}:`, error.message);
    }
  }

  return {
    ok: true,
    sent: report.total,
    dueCount: due.length,
    lowCount: low.length,
    trialReminder: trialOutcome(report, stamps) ?? trialReason,
  };
}

/**
 * What became of the trial reminder's message, if one was built.
 *
 * `"send-failed"` is a state this originally could not express, and driving the
 * real runner against a real push endpoint is what surfaced it: a reminder that
 * was decided on, composed, and then reached no device at all reported
 * `undefined` — exactly the same as a user with no trial. The one case that most
 * needs to be visible was the one case that looked like nothing had happened.
 *
 * It is deliberately NOT stamped, so the next tick tries again.
 */
function trialOutcome(
  report: SendReport,
  stamps: Array<{ column: string; tag: string }>,
): string | undefined {
  const s = stamps.find((x) => x.column === "trial_reminder_sent_for");
  if (!s) return undefined;
  return (report.byTag[s.tag] ?? 0) > 0 ? "sent" : "send-failed";
}
