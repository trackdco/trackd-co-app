/**
 * Reminder computation (Spec 14, Phase 2) — PURE, no I/O, no React. Given a user's
 * already-fetched data, decide what's due and build the push messages. The same
 * functions back both the test harness (force, current user) and the scheduled
 * runner (all founders), so there is ONE source of truth for "what's due today".
 *
 * "Today" is a local date key (YYYY-MM-DD) the caller resolves in the user's
 * timezone — every date here is date-only and tz-independent once resolved.
 */
import type { ScheduleType } from "@/lib/db/types";
import { isOnCycle, type CycleRule } from "@/lib/protocol/cycleRule";
import {
  cyclePauseContext,
  effectiveCadenceStart,
  isPausedOn,
  type Pause,
} from "@/lib/home/pauses";

/** Minimal shape of an active protocol_compound the schedule logic needs. */
export interface ReminderCompound {
  id: string;
  name: string;
  /**
   * The day's scheduled dose times, "HH:MM[:SS]", in schedule order. An element
   * may be null: that is the stored "no time set" state, not a missing value.
   *
   * Needed because `unlogged_alert_wait` is measured FROM the dose's own time,
   * so a nudge cannot know whether a dose is overdue without knowing when it was
   * due. Empty or all-null means the compound has no time, and
   * {@link overdueUnlogged} falls back to the day's cutoff for it.
   */
  doseTimes?: (string | null)[];
  /**
   * The compound's pauses (`supabase/protocol/018`), passed as SPANS rather than
   * as a "paused today" boolean.
   *
   * Resolved by the caller, because this module is pure and pauses live in
   * another table. It exists for the same reason `cycle` does: this file is the
   * SERVER-SIDE MIRROR of the client's `isDueOnFor`, and a gate the client
   * applies but the push does not means the app correctly shows nothing due
   * while the notification announces the dose and then nags for "missing" it.
   *
   * ⚠️ IT WAS A BOOLEAN, AND THAT WAS NOT ENOUGH. A pause does three things on
   * the client and only the first survived the trip here:
   *
   *  1. today is not due while the pause covers it (`isPausedOn`);
   *  2. the CADENCE RE-ANCHORS to the day the compound came back
   *     (`effectiveCadenceStart`), so an every-third-day compound is due on the
   *     day it resumes rather than on whatever day the untouched grid picked;
   *  3. paused days do not advance the CYCLE clock (`cyclePauseContext`).
   *
   * Dropping 2 and 3 left the two grids permanently offset after any pause: a
   * cold review walked eleven days of an every-3-days compound paused for two and
   * found the app and the phone disagreeing on seven of them — announcing doses
   * the app never asked for, and staying silent on the days it did. Spans carry
   * everything all three need, so the mirror now runs the client's own functions
   * instead of a boolean's worth of them.
   */
  pauses?: readonly Pause[];
  /**
   * True when the schedule trail says the compound was STOPPED — deleted, and not
   * since re-added (`supabase/protocol/005`, resolved by `isStoppedOn`).
   *
   * Resolved by the caller for the same reason `paused` and `cycle` are: this
   * module is pure and the versions live in another table. It exists because
   * DELETING a compound writes two facts and only one of them is
   * `protocol_compounds.is_active` — the other is a `stopped` version, and when
   * the first write does not land the second is the only record of the user's
   * intent that reached Postgres at all.
   *
   * Measured, on the founder's own account: four compounds deleted on 31 July and
   * 7 August kept `is_active = true` for up to thirteen days because that one
   * write failed silently, and every day of it this runner announced them as due
   * and then nagged for "missing" them — while the app, which reads the trail,
   * had correctly shown nothing. The trail was in Postgres the whole time.
   */
  stopped?: boolean;
  schedule_type: ScheduleType;
  days_of_week: number[] | null; // ISO weekday (Mon=1 … Sun=7) for specific_days
  interval_days: number | null;
  first_dose_on: string; // YYYY-MM-DD
  end_date: string | null; // YYYY-MM-DD
  /**
   * The EARLIEST recorded schedule version's day, when the compound has a trail.
   *
   * The client anchors the cadence on the earlier of this and the compound's
   * current start date (`resolveScheduleOn`), deliberately: re-adding a deleted
   * compound writes a NEW `first_dose_on`, and anchoring on that alone shifts the
   * every-N-days grid onto a different residue — so the app and the phone pick
   * different days, every day, for the rest of the run. Absent = no trail, and
   * `first_dose_on` is then the whole truth.
   */
  scheduleOrigin?: string | null;
  /**
   * The compound's on/off cycle, resolved from the `cycle_*` columns by the
   * caller (`cycleRuleFromColumns`). Absent = uncycled, which is every compound
   * before spec 06 and every compound the user never put on a cycle.
   *
   * This exists because the cycle gate MUST be applied here too: the client's
   * `isDueOnFor` gates on stopped → cycle → schedule, and this function is the
   * server-side mirror of it. Shipping cycles to the client without this meant
   * the app correctly showed nothing due on an off-day while the push still
   * announced the dose and then nagged for "missing" it.
   */
  cycle?: CycleRule;
}

/**
 * The `protocol_compounds` columns needed to build a {@link ReminderCompound},
 * spelled out as one literal because PostgREST's typed client parses a select as
 * a string LITERAL and cannot follow a joined array or a concatenation.
 *
 * Lives here, beside the shape it fills, rather than in the runner: the seven
 * `cycle_*` names must stay in step with `CYCLE_COLUMNS`, and a missing one does
 * not fail loudly — it makes `cycleRuleFromColumns` return `undefined` and the
 * cycle gate silently stop gating, which is the exact defect this fixes.
 * `reminders.test.ts` asserts every `CYCLE_COLUMNS` entry appears here.
 */
export const PC_REMINDER_SELECT =
  "id, schedule_type, days_of_week, interval_days, first_dose_on, end_date, dose_times, cycle_anchor, cycle_on_days, cycle_off_days, cycle_end_type, cycle_end_date, cycle_end_rounds, cycle_colour, compounds(name)";

/**
 * The runner's `inventory_items` read, as one literal for the same reason as
 * {@link PC_REMINDER_SELECT}.
 *
 * ⚠️ THE EMBED NAMES ITS FOREIGN KEY. `026` adds a second key between these two
 * tables (`protocol_compounds.cycle_end_item_id` → `inventory_items`) and makes
 * `protocol_compound_schedules` a junction between them. PostgREST then finds
 * several relationships for a bare `protocol_compounds!inner(...)` and refuses
 * it (PGRST201): the inventory read fails and every low-stock push goes silent.
 * Naming `inventory_items_protocol_compound_id_fkey` picks the one this read
 * means, and works the same before `026` as after it. `embedHints.test.ts`
 * fails on any unhinted embed between the two tables.
 *
 * `acquired_on` says whether a container is STARTED: NULL is a spare (`026`),
 * which counts no doses. It is read off the row, not the view's `is_started`,
 * because the view only has that column after `026`, and a spare oral can be
 * written before it. `custom_name` names a custom compound, whose catalogue
 * join is null.
 */
export const INVENTORY_REMINDER_SELECT =
  "id, protocol_compound_id, acquired_on, protocol_compounds!inventory_items_protocol_compound_id_fkey!inner(is_active, custom_name, compounds(name))";

/**
 * One CONTAINER of stock, as the runner reads it. {@link lowStock} judges them
 * per COMPOUND: several containers of one compound can be open at once
 * (Adrian, 2026-09-24), so one container alone says nothing about whether the
 * compound is running low.
 */
export interface LowStockItem {
  name: string;
  /**
   * The compound this container belongs to (`protocol_compound_id`). Containers
   * that share it are judged together, as the screen's Runs dry judges them.
   * Absent: grouped by {@link name}, which is all a caller without the id has.
   */
  compoundId?: string;
  /**
   * False for a SPARE: held but not started (`acquired_on` NULL, `026`). A spare
   * counts no doses and no runway until it is mixed or opened, exactly as in
   * `v_compound_stock`. Absent = started, which is every row `main` writes.
   */
  started?: boolean;
  /** True when the compound this stock belongs to is paused today. Its stock is
   *  not moving, so "running low" is noise rather than news. */
  paused?: boolean;
  /** True when the compound this stock belongs to was DELETED (see
   *  {@link ReminderCompound.stopped}). Its vials belong to something the user
   *  stopped running, and "you're running low" about it is worse than noise —
   *  it names a compound they have already removed from the app. */
  stopped?: boolean;
  estEmptyDate: string | null; // YYYY-MM-DD from v_inventory_math
  /**
   * The view's own day COUNT (`supabase/protocol/010`), which is what the
   * Protocol card reads. Preferred over differencing `estEmptyDate`, because
   * that date is anchored to the DATABASE's date and Supabase runs UTC:
   * subtracting a local today from a UTC-anchored date is a day out for most of
   * the world for part of every day. Null falls back to the subtraction.
   */
  daysToEmpty: number | null;
  dosesRemaining: number | null;
}

/** A ready-to-send Web Push payload. */
export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/* --------------------------------------------------------------- timezone */

/** Validate an IANA timezone name (e.g. "Europe/London") before storing it —
 *  Intl throws RangeError on an unknown zone, so this rejects garbage. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The user-local date key (YYYY-MM-DD) and minutes-since-midnight for an instant.
 *
 * Lives in this pure module rather than in the runner because it is now read by
 * two callers — the runner's "what time is it for this user" and the trial
 * reminder's "which calendar day does this trial end on" — and a second copy of
 * a timezone conversion is precisely how the push pipeline fell out of step with
 * the client once already. One implementation, one set of tests.
 */
export function localParts(now: Date, tz: string): { dateKey: string; minutes: number } {
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

/**
 * Which LOCAL DAY a dose_logs row belongs to.
 *
 * `logged_for` is the day the device recorded the dose FOR, written by the one
 * machine that knew where the user was standing (`supabase/protocol/011`). It
 * wins outright. `taken_at` is only consulted for rows written before that
 * column existed, and consulting it is a genuinely different question — "which
 * day was this INSTANT, in the timezone the profile claims now" — whose answer
 * diverges for anyone who has since travelled, and for every back-dated dose,
 * where the instant of entry and the day it was entered for are days apart.
 *
 * Pure, and exported, because the runner used to answer this inline from
 * `taken_at` alone and nothing could test that it was wrong.
 */
export function loggedDayOf(
  row: { logged_for?: string | null; taken_at?: string | null },
  tz: string,
): string | null {
  if (row.logged_for) return row.logged_for;
  if (!row.taken_at) return null;
  const at = new Date(row.taken_at);
  if (Number.isNaN(at.getTime())) return null;
  return localParts(at, tz).dateKey;
}

/* --------------------------------------------------------------- schedule */

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Days since the Unix epoch for a YYYY-MM-DD (treated as UTC midnight, so the
 *  integer is tz-independent and safe to difference). */
export function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * A date key shifted by whole CALENDAR days. `shiftDateKey("2026-03-01", -2)`
 * is `"2026-02-27"`, and it crosses months, years and leap days by construction
 * because the arithmetic is done on the epoch day integer.
 *
 * Deliberately NOT `new Date(iso)` + `setDate`: a date-only string parses as UTC
 * midnight and `setDate` then works in the RUNTIME's zone, which is the exact
 * shape of the `logged_for` backfill bug (`supabase/protocol/012`). Nothing here
 * has a timezone at all — the caller resolves the local day first, then shifts.
 */
export function shiftDateKey(dateKey: string, days: number): string {
  const shifted = new Date((dayNumber(dateKey) + days) * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

/** ISO weekday (Mon=1 … Sun=7) for a YYYY-MM-DD. */
function isoWeekday(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun … 6=Sat
  return dow === 0 ? 7 : dow;
}

/**
 * Whether a compound is due on `todayKey`. Mirrors the client `isDueOnFor`
 * (lib/home/stack.ts) but reads the Postgres schedule columns directly: a stopped
 * (deleted) compound is never due; nothing before the run's start or after
 * end_date; a paused or off-cycle day is not due; every_n_days counts from the
 * start, re-anchored to the last resume; specific_days matches the ISO weekday.
 *
 * EVERY GATE HERE RUNS THE CLIENT'S OWN FUNCTION — `isOnCycle`, `isPausedOn`,
 * `effectiveCadenceStart`, `cyclePauseContext`, `isStoppedOn`. Not one of them is
 * reimplemented, because a parallel copy is exactly how this mirror fell out of
 * step with the client three times: cycles, then pauses, then deletes. What is
 * left here is the mapping from Postgres columns to those functions' arguments,
 * which is the only thing that genuinely differs between the two callers.
 */
export function isDueToday(c: ReminderCompound, todayKey: string): boolean {
  const today = dayNumber(todayKey);
  // STOPPED: the compound was not being run at all, so nothing was due and
  // nothing can be missed. FIRST, and above the date window, exactly where the
  // client puts it (`isDueOnFor` gates on `resolved.stopped` before anything
  // else) — a deleted compound has no schedule left to consult.
  if (c.stopped) return false;
  // The run's REAL beginning, which is not always `first_dose_on`: re-adding a
  // deleted compound writes a NEW start date, and the client deliberately keeps
  // the earliest recorded version as the anchor so the cadence phase does not
  // shift under a re-add. Same rule here, or the two disagree on every dose day
  // of the new run. See `ReminderCompound.scheduleOrigin`.
  const startKey =
    c.scheduleOrigin && c.scheduleOrigin < c.first_dose_on
      ? c.scheduleOrigin
      : c.first_dose_on;
  if (startKey && today < dayNumber(startKey)) return false;
  if (c.end_date && today > dayNumber(c.end_date)) return false;
  // PAUSED: nothing is due, so nothing is announced and nothing is nagged about.
  // Mirrors the client's gate, which sits in the same position — above the
  // cycle check and below the stopped one.
  if (isPausedOn(c.pauses, todayKey)) return false;
  // Off-cycle means the user is not taking it: nothing is due, so nothing can be
  // announced and nothing can be nagged about. Paused days do not advance the
  // cycle clock, which is what the context carries — without it a cycled
  // compound that had been paused was announced on days the app greyed out. No
  // `vialEmptyOn` for the same reason the client passes none: the "ends when the
  // vial runs out" condition is withheld behind `VIAL_END_SUPPORTED = false`.
  if (!isOnCycle(c.cycle, todayKey, cyclePauseContext(c.pauses, c.cycle, todayKey))) {
    return false;
  }

  switch (c.schedule_type) {
    case "every_day":
      return true;
    case "every_n_days": {
      const n = c.interval_days ?? 1;
      if (n <= 0) return false;
      // The cadence RE-ANCHORS to the day the last pause ended, so a compound is
      // due on the day it comes back rather than on whatever day the untouched
      // grid would have picked. The client's own function, not a copy of it.
      const anchorKey = startKey
        ? effectiveCadenceStart(startKey, c.pauses, todayKey)
        : null;
      const anchor = anchorKey ? dayNumber(anchorKey) : 0;
      return mod(today - anchor, n) === 0;
    }
    case "specific_days":
      return (c.days_of_week ?? []).includes(isoWeekday(todayKey));
    default:
      return false;
  }
}

/**
 * How long after a dose's own time the "still unlogged" nudge waits, in minutes.
 *
 * Mirrors the `unlogged_wait` enum. The column has existed since the
 * notification schema was written and, until now, NOTHING in the codebase read
 * it: the nudge fired at a fixed `missed_cutoff_time` regardless, so a user who
 * asked to be told two hours late was told at 8pm whatever they chose. It was
 * also unreachable from the settings screen, so nobody could have chosen at all.
 */
export const UNLOGGED_WAIT_MINUTES: Record<string, number> = {
  min_30: 30,
  hour_1: 60,
  hour_2: 120,
  hour_4: 240,
};

/** The stored wait as minutes, defaulting to two hours (the column's default). */
export function waitMinutes(pref: unknown): number {
  return UNLOGGED_WAIT_MINUTES[String(pref)] ?? UNLOGGED_WAIT_MINUTES.hour_2;
}

/**
 * Of the due-and-unlogged compounds, the ones actually OVERDUE by now.
 *
 * A dose is overdue once its own scheduled time plus the user's chosen wait has
 * passed. This is the difference between "you have not logged your evening dose"
 * at nine in the morning, which is not true yet, and the same sentence at eight
 * at night, which is.
 *
 * ⚠️ A COMPOUND WITH NO DOSE TIME FALLS BACK TO `cutoffMin`. The time is
 * optional by design (`Schedule.timeOfDay` may be ""), and "unset plus two
 * hours" is not a time. The day's cutoff is the honest answer for those: it is
 * the one moment we can say the day is late enough to ask about.
 *
 * Returns the subset, so the message names only what is genuinely late rather
 * than counting doses that are still to come.
 */
export function overdueUnlogged(
  due: ReminderCompound[],
  nowMinutes: number,
  waitMin: number,
  cutoffMin: number,
): ReminderCompound[] {
  return due.filter((c) => {
    const times = (c.doseTimes ?? []).filter(
      (t): t is string => typeof t === "string" && t.length > 0,
    );
    if (times.length === 0) return nowMinutes >= cutoffMin;
    // The LAST of the day's times: a twice-daily compound is not "still
    // unlogged" until its final dose has come and gone, or the morning slot
    // would nag about a compound whose evening dose is still ahead.
    const last = times.reduce((a, b) => (toMin(b) > toMin(a) ? b : a));
    return nowMinutes >= toMin(last) + waitMin;
  });
}

/** "HH:MM[:SS]" → minutes since midnight. Local to this module's pure maths. */
function toMin(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Active compounds due today that have NOT been logged today. */
export function dueUnlogged(
  compounds: ReminderCompound[],
  loggedTodayIds: Set<string>,
  todayKey: string,
): ReminderCompound[] {
  return compounds.filter(
    (c) => isDueToday(c, todayKey) && !loggedTodayIds.has(c.id),
  );
}

/**
 * How far ahead a runway is walked. The same number as `RUNS_DRY_HORIZON_DAYS`
 * in `lib/protocol/runsDry.ts`, restated rather than imported because that
 * module pulls the client's schedule model (and its sync actions) into the cron.
 * `lowStockPerCompound.test.ts` pins the two equal.
 */
export const STOCK_HORIZON_DAYS = 730;

/** What the runway walk needs to know about one compound, keyed by its id. */
export interface StockSchedule {
  compound: ReminderCompound;
  /**
   * How many of today's doses are already logged, taken or skipped: the
   * screen's `loggedCountFor`. A taken one already came out of the view's
   * figures, and neither needs stock any more, so only today's other slots are
   * still to spend.
   */
  loggedToday: number;
}

/**
 * Days from `todayKey` until a compound's stock runs dry: 0 = today's doses
 * cannot be covered. The server's copy of the screen's `runsDryInDays`
 * (`lib/protocol/runsDry.ts`): the same walk over the days a dose is DUE, asked
 * of {@link isDueToday}, which is this module's mirror of the client's
 * `isDueOnFor`. An average week (the view's `days_to_empty`) cannot see that
 * Mon/Thu from a Wednesday runs out on a Monday, that a cycle rests, or that
 * today's dose is already logged, so it put the push a day or more off the
 * screen at the amber line. `lowStockPerCompound.test.ts` runs both walks side
 * by side.
 *
 * Null when nothing is held (`dosesReady` null), or when no due day up to
 * `horizon` runs short.
 */
export function runsDryDays(
  c: ReminderCompound,
  dosesReady: number | null,
  todayKey: string,
  loggedToday = 0,
  horizon = STOCK_HORIZON_DAYS,
): number | null {
  if (dosesReady == null || !Number.isFinite(dosesReady)) return null;
  let left = Math.max(0, Math.floor(dosesReady));
  // `dose_times` holds one element per dose of the day (`dose_times_match`), a
  // NULL element included: the client's `timesPerDayOf`. Never below 1.
  const slots = Math.max(1, c.doseTimes?.length ?? 0);
  for (let d = 0; d <= horizon; d++) {
    const key = d === 0 ? todayKey : shiftDateKey(todayKey, d);
    if (!isDueToday(c, key)) continue;
    const need = d === 0 ? Math.max(0, slots - loggedToday) : slots;
    if (need > left) return d;
    left -= need;
  }
  return null;
}

/**
 * Containers folded into ONE item per compound: what the compound holds, and
 * when it runs dry.
 *
 * Adding stock no longer archives the compound's other containers, so a used-up
 * vial can sit open beside a full one. Judged alone, the empty one said "about 0
 * doses left" every day while the full one was right there, and two short ones
 * named the compound twice. So:
 *  - doses are SUMMED over started containers, the sum `v_compound_stock` makes
 *    (`026`) and the app's pre-`026` stand-in makes (`compoundsFromItems` in
 *    `lib/db/inventory.ts`). A spare counts nothing until it is started;
 *  - an empty container is left out while another open one still has doses, so
 *    its zero cannot speak for the compound;
 *  - days are walked from the sum over the compound's schedule
 *    ({@link runsDryDays}) when the schedule was read. Without it (the compounds
 *    read failed) they fall back to the view's own runways, added up: each open
 *    container's `days_to_empty` is its doses over the same weekly rate, so the
 *    sum is the runway of the sum, give or take a day of rounding. One
 *    container is exactly the old figure.
 *
 * Paused and stopped belong to the compound, so any container carrying them
 * marks the whole compound. The first container's name names it.
 */
export function stockPerCompound(
  stock: readonly LowStockItem[],
  todayKey: string,
  schedules?: ReadonlyMap<string, StockSchedule>,
  horizon = STOCK_HORIZON_DAYS,
): LowStockItem[] {
  const today = dayNumber(todayKey);
  const groups = new Map<string, LowStockItem[]>();
  for (const s of stock) {
    const key = s.compoundId != null ? `id:${s.compoundId}` : `name:${s.name}`;
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }
  const out: LowStockItem[] = [];
  for (const box of groups.values()) {
    const first = box[0];
    const started = box.filter((s) => s.started !== false);
    const withDoses = started.filter((s) => (s.dosesRemaining ?? 0) > 0);
    const counted = withDoses.length > 0 ? withDoses : started;

    let dosesRemaining: number | null = null;
    for (const s of counted) {
      if (s.dosesRemaining != null && Number.isFinite(s.dosesRemaining)) {
        dosesRemaining = (dosesRemaining ?? 0) + s.dosesRemaining;
      }
    }

    const schedule =
      first.compoundId != null ? schedules?.get(first.compoundId) : undefined;
    let daysToEmpty: number | null = null;
    if (schedule && dosesRemaining != null) {
      daysToEmpty = runsDryDays(
        schedule.compound,
        dosesRemaining,
        todayKey,
        schedule.loggedToday,
        horizon,
      );
    } else {
      for (const s of counted) {
        const days =
          s.daysToEmpty ?? (s.estEmptyDate ? dayNumber(s.estEmptyDate) - today : null);
        if (days != null && Number.isFinite(days)) daysToEmpty = (daysToEmpty ?? 0) + days;
      }
    }

    out.push({
      name: first.name,
      ...(first.compoundId != null ? { compoundId: first.compoundId } : {}),
      started: started.length > 0,
      paused: box.some((s) => s.paused === true),
      stopped: box.some((s) => s.stopped === true),
      estEmptyDate: null,
      daysToEmpty,
      dosesRemaining,
    });
  }
  return out;
}

/**
 * Compounds projected to run out within `withinDays` of today, ONE item per
 * compound however many containers it has open ({@link stockPerCompound}).
 *
 * With the compound's schedule (`schedules`, keyed by `protocol_compound_id`)
 * the runway is walked over the days a dose is due, which is the Protocol
 * card's Runs dry, so the phone and the screen cannot disagree about whether a
 * compound is running low. Without it, the view's own `days_to_empty` is read,
 * and `est_empty_date` is differenced only when the count is absent: that
 * subtraction takes a UTC-anchored date away from a local today and is a day
 * out for part of every day, which is why `supabase/protocol/010` added the
 * count.
 */
export function lowStock(
  stock: LowStockItem[],
  todayKey: string,
  withinDays: number,
  schedules?: ReadonlyMap<string, StockSchedule>,
): LowStockItem[] {
  // The walk need not look past the window: a runway beyond it is not low.
  const horizon = Number.isFinite(withinDays)
    ? Math.min(STOCK_HORIZON_DAYS, Math.max(0, Math.floor(withinDays)))
    : -1;
  return stockPerCompound(stock, todayKey, schedules, horizon).filter((s) => {
    // A paused compound is consuming nothing, so its stock is not running out —
    // it is simply sitting there. Nudging about it is noise, and the user has
    // already told us they are not taking it. A DELETED one said so louder.
    if (s.paused || s.stopped) return false;
    const daysLeft = s.daysToEmpty;
    if (daysLeft === null) return false;
    return daysLeft >= 0 && daysLeft <= withinDays;
  });
}

/* --------------------------------------------------------------- messages */

/**
 * How many names a push body will list before it falls back to the count alone.
 * One number for every message, so a long list is truncated the same way
 * wherever it appears rather than each message inventing its own limit.
 */
const NAME_LIST_MAX = 3;

/** "Doses due today" digest. Lists names when few, else just the count. */
export function doseReminderMessage(due: ReminderCompound[]): PushMessage | null {
  if (due.length === 0) return null;
  const names = due.map((c) => c.name);
  const body =
    names.length === 1
      ? `${names[0]} is due today.`
      : names.length <= NAME_LIST_MAX
        ? `Due today: ${names.join(", ")}.`
        : `You have ${names.length} doses due today.`;
  return { title: "Doses due today", body, url: "/dashboard", tag: "trackd-dose-daily" };
}

/** Later-in-the-day nudge for due doses still unlogged. */
export function missedNudgeMessage(due: ReminderCompound[]): PushMessage | null {
  if (due.length === 0) return null;
  const n = due.length;
  return {
    title: "Don't forget",
    body:
      n === 1
        ? `${due[0].name} is still unlogged today.`
        : `${n} doses are still unlogged today.`,
    url: "/dashboard",
    tag: "trackd-missed",
  };
}

/**
 * Combined low-stock heads-up (one message even for several compounds).
 *
 * Names are listed only while the list stays readable, then the count speaks for
 * itself — the same rule `doseReminderMessage` uses, so the three messages read
 * as one voice. Joining every name grew without bound: ten low items produced a
 * 146-character body that the notification shade truncates mid-list anyway.
 */
export function lowStockMessage(items: LowStockItem[]): PushMessage | null {
  if (items.length === 0) return null;
  const body =
    items.length === 1
      ? `${items[0].name} is running low${
          items[0].dosesRemaining != null
            ? `. About ${Math.floor(items[0].dosesRemaining)} doses left.`
            : "."
        }`
      : items.length <= NAME_LIST_MAX
        ? // "compounds", not "vials". The feeding query (`runner.ts`) selects
          // `inventory_items` with NO `inventory_type` filter, so tubs and
          // bottles are in scope — a user low on creatine and vitamin D3 was
          // told "2 vials are running low", naming two things that are neither.
          // There is no per-item form here to word it from (`LowStockItem` is a
          // name and a runway), and the message covers a mixed set anyway, so it
          // uses the one noun that is true of all three.
          `${items.length} compounds are running low: ${items.map((i) => i.name).join(", ")}.`
        : `${items.length} compounds are running low.`;
  return { title: "Running low", body, url: "/protocol", tag: "trackd-lowstock" };
}
