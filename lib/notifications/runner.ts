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
import { graceAsTrial } from "@/lib/billing/betaGrace";
import { billingGateEnabled } from "@/lib/billing/gate";

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
   * Whether `trial` is the BETA GRACE rather than a real Stripe trial.
   *
   * The two are deliberately the same shape so the date maths does not have to
   * know the difference — but the COPY does, because a grace ends in read-only
   * and a trial ends in a charge, and telling somebody money is about to move
   * when it is not is its own kind of wrong.
   */
  isBetaGrace: boolean;
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
): Promise<{
  trial: TrialForReminder | null;
  isBetaGrace: boolean;
  sentFor: string | null | undefined;
}> {
  const [subRes, stampRes, graceRes] = await Promise.all([
    supabase
      .from("subscriptions")
      // Reading the MIRROR, which no access check may read. This is not an
      // access check: it grants nothing and gates nothing, and telling somebody
      // their trial ends on the 14th is the exact job the mirror exists for.
      .select("status, trial_ends_at, cancel_at_period_end")
      .eq("user_id", userId)
      .eq("status", "trialing")
      // SOONEST-ENDING first. A user should only ever have one, but if a stale
      // row survives, the trial about to bill is the one that matters.
      .order("trial_ends_at", { ascending: true })
      .limit(1),
    supabase
      .from("notification_preferences")
      .select("trial_reminder_sent_for")
      .eq("user_id", userId)
      .maybeSingle(),
    /**
     * THE BETA GRACE PERIOD, which has no Stripe subscription at all.
     *
     * The ~90 accounts that were here before billing get an `entitlements` row
     * and nothing in the mirror, so the read above finds nothing and the day-5
     * warning that their access is about to end would never send. That is the
     * exact silence the grace period exists to prevent, and it is worse here
     * than on the banner: a push is the only channel that reaches somebody who
     * has not opened the app.
     *
     * `comp` WITH an expiry is the grace and nothing else produces that shape;
     * `graceAsTrial` enforces it. See `lib/billing/betaGrace.ts`.
     *
     * Its OWN query, beside the stamp's, for the reason `004` gives at length:
     * folding it into the subscriptions select would let one failure take the
     * whole trial reminder down, and the two facts are independent.
     */
    /**
     * ⚠️ ONLY WHEN THE GATE IS ON. With `BILLING_GATE_ENABLED` unset the grace
     * period ends nothing, so a push saying access is about to stop would be a
     * warning about a deadline that is not enforced. Skipped as an empty result
     * rather than a branch, so the `Promise.all` shape does not change.
     */
    billingGateEnabled()
      ? supabase
      .from("entitlements")
      .select("source, active_until, is_active, product")
      .eq("user_id", userId)
      .eq("product", "pro")
      .eq("source", "comp")
      .eq("is_active", true)
      .not("active_until", "is", null)
      // SOONEST-ENDING first, the same rule as the subscription read above.
      .order("active_until", { ascending: true })
      .limit(1)
      : Promise.resolve({ data: null, error: null }),
  ]);

  const row = subRes.data?.[0] as Record<string, unknown> | undefined;
  // Ordered by `trial_ends_at` ASCENDING by the query below, so a stale trialing
  // row cannot hide an imminent charge. It was ordered by `updated_at`, which is
  // bookkeeping rather than truth: a cold review put a stale row ending in
  // September beside a live one ending in August and the reminder went to the
  // stale one, reporting "too-early" and sending nothing on the real trial's
  // promised day.
  /**
   * A REAL TRIAL WINS. Somebody on the grace who then starts a trial has both,
   * and the one about to take money is the one worth warning about.
   */
  const graceRow = graceRes.data?.[0] as Record<string, unknown> | undefined;
  const grace = row
    ? null
    : graceAsTrial(
        graceRow
          ? {
              source: graceRow.source as string,
              activeUntil: (graceRow.active_until as string | null) ?? null,
            }
          : null,
      );

  const trial: TrialForReminder | null = row
    ? {
        status: row.status as string,
        trialEndsAt: (row.trial_ends_at as string | null) ?? null,
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      }
    : grace;

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

  return { trial, isBetaGrace: Boolean(grace) && trial === grace, sentFor };
}

/**
 * CLAIM THE TRIAL REMINDER BEFORE SENDING IT, NOT AFTER.
 *
 * ## The two failures this replaces, both measured
 *
 * The old order was send, then stamp, and a cold review broke it twice:
 *
 *   - **Two overlapping cron ticks each sent one.** Read-then-write with nothing
 *     between them. Measured: two pushes, same tag, one trial.
 *   - **A stamp write that failed re-sent forever.** The outcome was derived
 *     from what the push service said, never from whether the stamp persisted,
 *     so eight consecutive ticks each reported `"sent"` and delivered eight
 *     pushes. At a fifteen-minute cron that is ~96 notifications in a day, about
 *     somebody's money, while the cron's own JSON said everything was fine.
 *
 * A conditional UPDATE settles both: Postgres applies it atomically, and the
 * returned row count says whether THIS tick won. A tick that did not win does
 * not send.
 *
 * ## The failure direction, chosen deliberately
 *
 * Claiming first means a claim that succeeds and a send that fails would lose
 * the reminder. So a failed send RELEASES the claim and the next tick retries.
 * If the release also fails, the reminder is missed — and that is the right way
 * round: the banner on Home reaches everybody regardless, and a missed push is
 * recoverable where ninety-six pushes about a charge is not.
 *
 * ## Its own write, which is what makes the isolation real
 *
 * The three older stamps are still batched into one update. This one is
 * separate, so a failure here cannot take quiet hours and the dose stamps with
 * it — the containment `supabase/notifications/004` claims, which was true of
 * the read and false of the write until now.
 */
async function claimTrialReminder(
  supabase: Client,
  userId: string,
  forDate: string,
  previous: string | null,
): Promise<boolean> {
  let query = supabase
    .from("notification_preferences")
    .update({ trial_reminder_sent_for: forDate })
    .eq("user_id", userId);
  // Only claim from the exact value we read. Another tick that got there first
  // has already changed it, so this matches nothing.
  query = previous === null
    ? query.is("trial_reminder_sent_for", null)
    : query.eq("trial_reminder_sent_for", previous);

  const { data, error } = await query.select("user_id");
  if (error) {
    console.error(`[reminders] could not claim the trial reminder for ${userId}:`, error.message);
    return false;
  }
  // Zero rows means somebody else claimed it, or the row does not exist. A
  // PostgREST update that matches nothing reports no error at all, which is
  // exactly how the old code mistook a no-op for a stamp.
  return (data ?? []).length > 0;
}

/** Hand the claim back when the send did not reach a device, so the next tick
 *  can try again. */
async function releaseTrialReminder(
  supabase: Client,
  userId: string,
  previous: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("notification_preferences")
    .update({ trial_reminder_sent_for: previous })
    .eq("user_id", userId);
  if (error) {
    console.error(
      `[reminders] the trial reminder for ${userId} was claimed but not delivered, and the claim could not be released:`,
      error.message,
    );
  }
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

  const { trial, isBetaGrace, sentFor } = await collectTrial(supabase, userId);

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
    isBetaGrace,
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

  // `trialReminder` rides on the early returns too. Without it, a user whose
  // trial reminder was swallowed by quiet hours reported exactly the same shape
  // as a user with no trial at all, which is the blindness `RunResult` says it
  // exists to remove.
  if (!force && !data.notificationsEnabled) {
    return {
      ok: true, sent: 0, dueCount: 0, lowCount: 0, reason: "disabled",
      trialReminder: data.trial ? "notifications-disabled" : undefined,
    };
  }

  const quietStart = toMinutes((p.quiet_start as string) ?? "22:00:00");
  const quietEnd = toMinutes((p.quiet_end as string) ?? "08:00:00");
  if (!force && inQuietHours(data.nowMinutes, quietStart, quietEnd)) {
    return {
      ok: true, sent: 0, dueCount: 0, lowCount: 0, reason: "quiet-hours",
      trialReminder: data.trial ? "quiet-hours" : undefined,
    };
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
  /** Set once the reminder is CLAIMED, so a failed send can hand the claim back. */
  let trialClaim: { forDate: string; previous: string | null; tag: string } | null = null;

  const reminderMin = toMinutes((p.reminder_time as string) ?? "09:00:00");
  const missedMin = toMinutes((p.missed_cutoff_time as string) ?? "20:00:00");

  /**
   * WHEN THE TRIAL REMINDER MAY FIRE, WHICH IS NOT ALWAYS `reminder_time`.
   *
   * A cold review found a configuration that killed it permanently: a
   * `reminder_time` of 23:00 with quiet hours 22:00 to 08:00. Every tick before
   * 23:00 is "too early" and every tick from 22:00 is "quiet hours", so the two
   * gates never open at once and the reminder is never sent, on any day, with no
   * error anywhere. Three trial days were walked and zero pushes went out.
   *
   * It is reachable: `ReminderSettings` offers three unconstrained time inputs
   * and `prefsActions` validates only the HH:MM shape.
   *
   * The dose reminders can live with this — they come round again tomorrow. This
   * one has one promised day and is about money, so when the chosen time falls
   * inside the user's own quiet window it fires at the END of that window
   * instead. That is the earliest moment they have said they are willing to be
   * disturbed, which is the closest thing to their intent that still keeps the
   * promise.
   */
  const trialMin = inQuietHours(reminderMin, quietStart, quietEnd) ? quietEnd : reminderMin;
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
     * **Not behind any of the three content toggles.** `dose_reminders_on` and
     * its siblings are preferences about PROTOCOL nudges. This is a notice that
     * money is about to leave someone's account, promised on the screen where
     * they entered their card, and turning off dose reminders is not consent to
     * be charged without warning.
     *
     * **Behind the master switch and quiet hours**, both of which returned
     * above. That is the honest limit of a push: someone who never granted
     * permission has no channel, and the banner on Home exists for them.
     *
     * **CLAIMED BEFORE IT IS SENT**, and sent FIRST of the four. Both are
     * repairs from a cold review — see `claimTrialReminder`, and the ordering
     * note below.
     */
    if (data.trialSentFor === undefined) {
      // `supabase/notifications/004` is not applied — there is nowhere to record
      // a send, and sending without recording would repeat every fifteen
      // minutes for a whole day. Withholding is the safe direction.
      if (data.trial) {
        console.warn(
          "[reminders] a trial is running but `trial_reminder_sent_for` is missing; apply supabase/notifications/004_trial_reminder.sql",
        );
        trialReason = "migration-004-not-applied";
      }
    } else if (data.nowMinutes < trialMin) {
      if (data.trial) trialReason = "before-reminder-time";
    } else {
      const verdict = trialReminderVerdict(
        data.trial,
        data.tz,
        now,
        data.trialSentFor,
      );
      if (verdict.send && data.trial) {
        // The grace and a real trial need different words. `data.trial` is the
        // same shape either way (see `graceAsTrial`), so the flag rides along
        // rather than being re-derived from a shape that deliberately hides the
        // difference.
        const m = trialReminderMessage(data.trial, data.tz, data.isBetaGrace);
        if (!m) {
          trialReason = "no-message";
        } else if (await claimTrialReminder(supabase, userId, verdict.forDate, data.trialSentFor)) {
          /**
           * SENT FIRST, not last.
           *
           * `sendMessages` walks the messages in order per device and STOPS on a
           * dead endpoint, pruning it. Queued last, the trial reminder was the
           * first casualty of an endpoint that died mid-loop: the dose reminder
           * went out, the trial one did not, and the device was then pruned so
           * "the next tick retries" retried to nobody. The three protocol nudges
           * come round again tomorrow. This one has one promised day.
           */
          messages.unshift(m);
          trialClaim = { forDate: verdict.forDate, previous: data.trialSentFor, tag: m.tag };
        } else {
          // Another tick got there first, or the row would not take the write.
          trialReason = "not-claimed";
        }
      } else if (!verdict.send) {
        trialReason = verdict.reason;
      }
    }
  }

  const report = await sendMessages(supabase, userId, messages);

  /**
   * THE TRIAL REMINDER'S CLAIM IS RELEASED IF IT DID NOT LAND.
   *
   * Claiming first is what stops a duplicate send and a stamp-failure storm, but
   * it moves the risk: a claim that sticks while the push fails would lose the
   * reminder silently. So a claim with nothing delivered is handed straight
   * back and the next tick tries again.
   */
  let trialOutcome: string | undefined;
  if (trialClaim) {
    const delivered = (report.byTag[trialClaim.tag] ?? 0) > 0;
    if (delivered) {
      trialOutcome = "sent";
    } else {
      await releaseTrialReminder(supabase, userId, trialClaim.previous);
      trialOutcome = "send-failed";
    }
  }

  // Advance the three OLDER stamps, each only for a message that actually
  // reached a device. The trial stamp is deliberately not in here: it is claimed
  // before the send and released above, in its own write, so a failure on either
  // side cannot take quiet hours and the dose stamps down with it.
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
    trialReminder: trialOutcome ?? trialReason,
  };
}

