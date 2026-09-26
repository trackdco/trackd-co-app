/**
 * The reads behind the check-ups — server-only, called by the runner.
 *
 * Kept apart from `checkups.ts` so the decisions stay pure and testable, and
 * apart from `runner.ts` because none of this is needed to send a dose reminder:
 * every read here happens at most once an hour, and only for somebody who could
 * actually be sent a check-up (see `runForUser`).
 *
 * ⚠️ EVERY READ STANDS ALONE. Each one that fails leaves ITS fact null, which
 * leaves out only the check-ups built on it (`candidates` treats null as "could
 * not check" and says nothing). A failed photo read must not cost somebody their
 * weekly recap, and none of it may cost them a dose reminder.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  localParts,
  loggedDayOf,
  shiftDateKey,
  type ReminderCompound,
} from "@/lib/notifications/reminders";
import { dayStats, streakOf, type CheckupFacts, type HistoryLog } from "@/lib/notifications/checkups";
import { unitForPreference } from "@/lib/weight";

/** Long enough for a 100-day streak, a best run before it, and the one-year mark. */
export const HISTORY_DAYS = 400;

/**
 * PostgREST's row cap. Supabase serves at most this many rows per request
 * whatever `range` asks for, so the history is read in pages of it: a year of
 * three twice-daily compounds is over 2,000 rows, and a silently truncated read
 * would make a perfect month look like a patchy one.
 */
const PAGE = 1000;
const MAX_PAGES = 6;

type Client = SupabaseClient;

/** Dose logs from `sinceIso`, every page, or null if any page failed. */
async function readHistory(
  supabase: Client,
  userId: string,
  sinceIso: string,
  tz: string,
): Promise<HistoryLog[] | null> {
  const out: HistoryLog[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from("dose_logs")
      .select("protocol_compound_id, taken_at, logged_for, status")
      .eq("user_id", userId)
      .gte("taken_at", sinceIso)
      .order("taken_at", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return null;
    for (const row of data ?? []) {
      const r = row as Record<string, unknown>;
      const day = loggedDayOf(
        { logged_for: r.logged_for as string | null, taken_at: r.taken_at as string | null },
        tz,
      );
      if (day) out.push({ compoundId: r.protocol_compound_id as string, day, status: String(r.status ?? "") });
    }
    if ((data ?? []).length < PAGE) return out;
  }
  // More than MAX_PAGES pages is not a history this reads confidently.
  return null;
}

/** The first or the last day anything was logged, over all time. */
async function edgeLogDay(
  supabase: Client,
  userId: string,
  tz: string,
  ascending: boolean,
): Promise<string | null | undefined> {
  const { data, error } = await supabase
    .from("dose_logs")
    .select("taken_at, logged_for")
    .eq("user_id", userId)
    .order("taken_at", { ascending })
    .limit(1);
  if (error) return undefined;
  const r = (data ?? [])[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  return loggedDayOf({ logged_for: r.logged_for as string | null, taken_at: r.taken_at as string | null }, tz);
}

/**
 * The occasions already marked (`notification_log`), or null if unreadable.
 * Exported for the runner, which reads it on its own for the "Giving You Space"
 * pause without paying for everything else here.
 */
export async function readSentLog(supabase: Client, userId: string): Promise<Set<string> | null> {
  const { data, error } = await supabase
    .from("notification_log")
    .select("key")
    .eq("user_id", userId)
    .limit(PAGE);
  if (error) return null;
  return new Set((data ?? []).map((r) => (r as Record<string, unknown>).key as string));
}

/** The latest day anything was logged. Exported for the same pause check. */
export function lastLogDayOf(supabase: Client, userId: string, tz: string) {
  return edgeLogDay(supabase, userId, tz, false);
}

export async function collectCheckupFacts(
  supabase: Client,
  userId: string,
  base: {
    now: Date;
    tz: string;
    todayKey: string;
    nowMinutes: number;
    hideNames: boolean;
    compounds: ReminderCompound[];
  },
): Promise<CheckupFacts> {
  const { now, tz, todayKey } = base;
  const from = shiftDateKey(todayKey, -HISTORY_DAYS);
  // A day of slack either side of the window for timezones; `loggedDayOf` sorts
  // each row into its own day and the stats ignore anything outside the window.
  const sinceIso = new Date(now.getTime() - (HISTORY_DAYS + 1) * 86_400_000).toISOString();

  const [history, firstLogDay, lastLogDay, sent, profileRes, weightRes, photoRes, bloodRes, journalRes, stock, direction] =
    await Promise.all([
      readHistory(supabase, userId, sinceIso, tz),
      edgeLogDay(supabase, userId, tz, true),
      edgeLogDay(supabase, userId, tz, false),
      readSentLog(supabase, userId),
      supabase.from("profiles").select("created_at, goal, units_preference").eq("id", userId).maybeSingle(),
      supabase
        .from("weight_logs")
        .select("logged_for, weight")
        .eq("profile_id", userId)
        .order("logged_for", { ascending: false })
        .limit(60),
      supabase
        .from("progress_photos")
        .select("taken_on")
        .eq("user_id", userId)
        .order("taken_on", { ascending: true })
        .limit(PAGE),
      supabase
        .from("lab_panels")
        .select("drawn_on, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("journal_entries")
        .select("entry_date")
        .eq("user_id", userId)
        .order("entry_date", { ascending: false })
        .limit(30),
      readStock(supabase, userId),
      readGoalDirection(supabase, userId),
    ]);

  const profile = profileRes.error ? null : ((profileRes.data ?? null) as Record<string, unknown> | null);
  const signupDay =
    profile && typeof profile.created_at === "string"
      ? localParts(new Date(profile.created_at), tz).dateKey
      : null;
  const goal = profile?.goal as string | null | undefined;
  const goalDirection: 1 | -1 | null =
    goal === "bulk" ? 1 : goal === "cut" || goal === "contest_prep" ? -1 : null;

  const bloodDays = bloodRes.error
    ? null
    : (bloodRes.data ?? [])
        .map((r) => {
          const x = r as Record<string, unknown>;
          if (typeof x.drawn_on === "string") return x.drawn_on;
          return typeof x.created_at === "string" ? localParts(new Date(x.created_at), tz).dateKey : null;
        })
        .filter((d): d is string => !!d)
        .sort()
        .reverse();

  return {
    userId,
    todayKey,
    nowMinutes: base.nowMinutes,
    hideNames: base.hideNames,
    compounds: base.compounds,
    stats: history ? dayStats(base.compounds, history, from, todayKey) : null,
    logs: history,
    firstLogDay,
    lastLogDay,
    signupDay,
    sent,
    weights: weightRes.error
      ? null
      : (weightRes.data ?? []).map((r) => {
          const x = r as Record<string, unknown>;
          return { day: x.logged_for as string, kg: Number(x.weight) };
        }),
    weightUnit: unitForPreference(profile?.units_preference as string | null | undefined),
    // A training block's weight target says which way is progress more
    // precisely than the onboarding goal, so it wins when there is one.
    weightDirection: direction ?? goalDirection,
    photoDays: photoRes.error
      ? null
      : (photoRes.data ?? []).map((r) => (r as Record<string, unknown>).taken_on as string),
    bloodDays,
    journalDays: journalRes.error
      ? null
      : (journalRes.data ?? []).map((r) => (r as Record<string, unknown>).entry_date as string),
    stock,
  };
}

/** Active stock, with its compound's name and what is left of it. */
async function readStock(supabase: Client, userId: string): Promise<CheckupFacts["stock"]> {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("id, protocol_compound_id, reconstituted_on, protocol_compounds!inner(is_active, compounds(name))")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("protocol_compounds.is_active", true);
  if (error) return null;
  const items = (data ?? []) as Record<string, unknown>[];
  if (items.length === 0) return [];
  const { data: math, error: mathError } = await supabase
    .from("v_inventory_math")
    .select("inventory_item_id, doses_remaining")
    .in("inventory_item_id", items.map((r) => r.id as string));
  if (mathError) return null;
  const left = new Map<string, number | null>();
  for (const m of math ?? []) {
    const x = m as Record<string, unknown>;
    left.set(x.inventory_item_id as string, x.doses_remaining == null ? null : Number(x.doses_remaining));
  }
  return items.map((r) => {
    const pc = r.protocol_compounds as { compounds?: { name?: string } } | null;
    return {
      id: r.id as string,
      compoundId: r.protocol_compound_id as string,
      name: pc?.compounds?.name ?? "your compound",
      reconstitutedOn: (r.reconstituted_on as string | null) ?? null,
      dosesRemaining: left.get(r.id as string) ?? null,
    };
  });
}

/**
 * +1 or -1 from the active block's weight target, or null.
 *
 * Two plain reads rather than an embed: `block_targets` joins `blocks` on a
 * composite key, and a second relationship between two tables is exactly what
 * turns a PostgREST embed into PGRST201 in production.
 */
async function readGoalDirection(supabase: Client, userId: string): Promise<1 | -1 | null> {
  const { data: block, error } = await supabase
    .from("blocks")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error || !block) return null;
  const { data: target } = await supabase
    .from("block_targets")
    .select("direction")
    .eq("block_id", (block as Record<string, unknown>).id as string)
    .eq("variable", "weight")
    .maybeSingle();
  const dir = (target as Record<string, unknown> | null)?.direction;
  return dir === "up" ? 1 : dir === "down" ? -1 : null;
}

/**
 * The logging streak on its own, for the don't-forget slot: the streak alert is
 * decided at the moment that nudge goes out, once a day, and needs the history
 * and nothing else here.
 */
export async function readStreak(
  supabase: Client,
  userId: string,
  base: { now: Date; tz: string; todayKey: string; compounds: ReminderCompound[] },
) {
  const sinceIso = new Date(base.now.getTime() - (HISTORY_DAYS + 1) * 86_400_000).toISOString();
  const history = await readHistory(supabase, userId, sinceIso, base.tz);
  if (!history) return null;
  return streakOf(dayStats(base.compounds, history, shiftDateKey(base.todayKey, -HISTORY_DAYS), base.todayKey));
}

/**
 * Check-ups and the rotating wordings go out only with `NOTIFICATION_CHECKUPS=on`.
 *
 * A deploy switch, off until the new Notifications page ships with the check-up
 * engine, so the two go live together. There is no per-account Check-ins switch
 * (Adrian, 2026-09-26): the Notifications switch turns check-ups off with the rest.
 */
export function checkupsEnabled(): boolean {
  return process.env.NOTIFICATION_CHECKUPS === "on";
}
