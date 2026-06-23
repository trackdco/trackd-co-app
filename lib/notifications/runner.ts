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
  lowStock,
  doseReminderMessage,
  missedNudgeMessage,
  lowStockMessage,
  type ReminderCompound,
  type LowStockItem,
  type PushMessage,
} from "@/lib/notifications/reminders";

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
}

/* ------------------------------------------------------------- time helpers */

/** The user-local date key (YYYY-MM-DD) and minutes-since-midnight for `now`. */
function localParts(now: Date, tz: string): { dateKey: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour")) % 24; // some runtimes emit "24" at midnight
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + Number(get("minute")),
  };
}

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
  const [pcRes, logRes, invRes] = await Promise.all([
    supabase
      .from("protocol_compounds")
      .select(
        "id, schedule_type, days_of_week, interval_days, first_dose_on, end_date, compounds(name)",
      )
      .eq("user_id", userId)
      .eq("is_active", true),
    supabase
      .from("dose_logs")
      .select("protocol_compound_id, taken_at")
      .eq("user_id", userId)
      .eq("status", "taken")
      .gte("taken_at", since),
    supabase
      .from("inventory_items")
      .select("id, protocol_compounds!inner(is_active, compounds(name))")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("protocol_compounds.is_active", true),
  ]);

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
    };
  });

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
      .select("inventory_item_id, est_empty_date, doses_remaining")
      .in("inventory_item_id", ids);
    for (const m of math ?? []) {
      mathById.set((m as Record<string, unknown>).inventory_item_id as string, m as Record<string, unknown>);
    }
  }
  const stock: LowStockItem[] = items.map((r) => {
    const pc = r.protocol_compounds as { compounds?: { name?: string } } | null;
    const m = mathById.get(r.id as string) ?? {};
    return {
      name: pc?.compounds?.name ?? "a vial",
      estEmptyDate: (m.est_empty_date as string | null) ?? null,
      dosesRemaining: m.doses_remaining == null ? null : Number(m.doses_remaining),
    };
  });

  return {
    prefs: prefsRes.data as Record<string, unknown> | null,
    tz,
    notificationsEnabled: Boolean(profile.notifications_enabled),
    compounds,
    loggedTodayIds,
    stock,
    todayKey,
    nowMinutes,
  };
}

/* --------------------------------------------------------------- sending */

/** Send each message to every device the user has, pruning dead endpoints. */
async function sendMessages(
  supabase: Client,
  userId: string,
  messages: PushMessage[],
): Promise<number> {
  if (messages.length === 0) return 0;
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs || subs.length === 0) return 0;

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

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
  return sent;
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
  const stamps: Record<string, string> = {}; // columns to advance after sending

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
        body: "Notifications are working — nothing's due right now.",
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
        stamps.last_dose_reminder_on = data.todayKey;
      }
    }
    if (missedOn && due.length > 0 && data.nowMinutes >= missedMin && p.last_missed_nudge_on !== data.todayKey) {
      const m = missedNudgeMessage(due);
      if (m) {
        messages.push(m);
        stamps.last_missed_nudge_on = data.todayKey;
      }
    }
    if (lowOn && low.length > 0 && data.nowMinutes >= reminderMin && p.last_low_stock_on !== data.todayKey) {
      const m = lowStockMessage(low);
      if (m) {
        messages.push(m);
        stamps.last_low_stock_on = data.todayKey;
      }
    }
  }

  const sent = await sendMessages(supabase, userId, messages);

  // Advance dedupe stamps only for the scheduled path, and only once we've sent
  // (so a transient send failure retries next tick rather than silently skipping).
  if (!force && sent > 0 && Object.keys(stamps).length > 0) {
    await supabase.from("notification_preferences").update(stamps).eq("user_id", userId);
  }

  return { ok: true, sent, dueCount: due.length, lowCount: low.length };
}
