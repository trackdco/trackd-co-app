/**
 * Check-ups — PURE, no I/O. The notifications that are not "a dose is due":
 * streaks, recaps, quiet spells, weigh-ins, photos, bloodwork, cycles, milestones,
 * plus the rotating wordings of the three daily reminders.
 *
 * Every word below was signed off by Adrian in the check-up swipe deck (six
 * rounds, 2026-09-25/26; the final list is the `final/checkups` document in that
 * artifact). The copy is his; what this module adds is WHEN each one is true.
 *
 * ## The rules the set was signed off with
 *
 *  - No line ends in a full stop. The one exception is his: Clean Sweep ends
 *    "Frame it." because he asked for the stop.
 *  - Emoji only where they appear below. They were asked for one by one.
 *  - No mascot by name.
 *  - At most ONE check-up a day (`last_checkup_on`), and a one-off occasion only
 *    ever once (`notification_log`). "We don't want to bombard our users."
 *  - With compound names hidden, anything that names a compound is simply not
 *    eligible. There is no approved count-only wording for those, and inventing
 *    one here would be writing copy he has not seen.
 *
 * ## The three kinds
 *
 *  1. SWAPS replace the wording of a daily reminder that was going out anyway
 *     (dose, don't-forget, low stock). They add no notification. Half the days
 *     keep the plain wording, so the jokes stay jokes.
 *  2. The STREAK ALERT is a swap too — it takes the don't-forget slot when a
 *     streak is at stake — so it never lands on top of a don't-forget.
 *  3. CHECK-UPS are extra notifications, one a day at most, highest priority
 *     first among those whose time has come.
 */
import {
  dayNumber,
  isDueToday,
  isoWeekday,
  joinNames,
  shiftDateKey,
  type LowStockItem,
  type PushMessage,
  type ReminderCompound,
} from "@/lib/notifications/reminders";
import { cycleStatusOn } from "@/lib/protocol/cycleRule";
import { cyclePauseContext } from "@/lib/home/pauses";

/* ------------------------------------------------------------------ basics */

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "08:00" / "08:00:00" → "8:00". The way the cards wrote a time. */
export function shortTime(t: string): string {
  const [h, m] = t.split(":");
  return `${Number(h)}:${(m ?? "00").padStart(2, "0")}`;
}

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-09-27" → "27 Sep", the way every other push writes a date. */
export function shortDate(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

/**
 * A stable pick for this user and this day. FNV-1a, because the only thing asked
 * of it is that the same inputs always give the same answer (so a retried tick
 * does not change its mind) and that neighbouring days differ.
 */
export function stableIndex(seed: string, n: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % Math.max(1, n);
}

/**
 * Plain wording or one of the swaps. Half the days are plain: with one swap
 * eligible it goes out on about half the days, with three each gets about one in
 * six. The plain wording is the voice of the app; the swaps are seasoning.
 */
function rotate<T>(seed: string, swaps: T[]): T | null {
  if (swaps.length === 0) return null;
  const i = stableIndex(seed, swaps.length * 2);
  return i < swaps.length ? swaps[i] : null;
}

/* ------------------------------------------------------------ day records */

/** One dose log, reduced to what the check-ups ask of it. */
export interface HistoryLog {
  compoundId: string;
  /** The user-local day the dose belongs to (`loggedDayOf`). */
  day: string;
  status: string;
}

/**
 * One calendar day, counted the way Progress counts consistency: in DOSES, one
 * per dose time (a twice-daily compound is two), and a rest day has `due` 0 and
 * counts neither way (`lib/progress/consistency.ts`).
 */
export interface DayStat {
  key: string;
  due: number;
  /** Doses logged as taken, capped at what was due. The recap figure. */
  taken: number;
  /** Doses dealt with, taken OR skipped. A skip is a decision, not a lapse. */
  resolved: number;
}

const slotsOf = (c: ReminderCompound) =>
  Math.max(1, (c.doseTimes ?? []).filter((t) => typeof t === "string" && t.length > 0).length);

/** Per-day due / taken / resolved from `from` to `to`, oldest first. */
export function dayStats(
  compounds: ReminderCompound[],
  logs: HistoryLog[],
  from: string,
  to: string,
): DayStat[] {
  const byDay = new Map<string, Map<string, { taken: number; resolved: number }>>();
  for (const l of logs) {
    const m = byDay.get(l.day) ?? new Map();
    const e = m.get(l.compoundId) ?? { taken: 0, resolved: 0 };
    e.resolved += 1;
    if (l.status === "taken") e.taken += 1;
    m.set(l.compoundId, e);
    byDay.set(l.day, m);
  }
  const out: DayStat[] = [];
  const last = dayNumber(to);
  for (let n = dayNumber(from); n <= last; n++) {
    const key = shiftDateKey(from, n - dayNumber(from));
    let due = 0;
    let taken = 0;
    let resolved = 0;
    const logged = byDay.get(key);
    for (const c of compounds) {
      if (!isDueToday(c, key)) continue;
      const slots = slotsOf(c);
      due += slots;
      const e = logged?.get(c.id);
      if (e) {
        taken += Math.min(e.taken, slots);
        resolved += Math.min(e.resolved, slots);
      }
    }
    out.push({ key, due, taken, resolved });
  }
  return out;
}

export interface Streak {
  /** Complete days in a row, counting today only once today is complete. */
  current: number;
  /** The day the current run began, or null with no run. The key for one-offs. */
  since: string | null;
  /** The longest run BEFORE the current one. */
  bestBefore: number;
  todayDue: number;
  todayComplete: boolean;
}

/**
 * The logging streak: days in a row on which every due dose was dealt with.
 *
 * Two judgements, the same two `lib/admin/insights.ts` makes for founders:
 *  - TODAY BEING UNFINISHED DOES NOT BREAK IT. The day is not over; that is the
 *    whole point of the streak alert.
 *  - A REST DAY IS NEUTRAL. Nothing was due, so there was nothing to keep.
 */
export function streakOf(stats: DayStat[]): Streak {
  const today = stats[stats.length - 1];
  const todayDue = today?.due ?? 0;
  const todayComplete = !!today && today.due > 0 && today.resolved >= today.due;

  const runs: Array<{ len: number; start: string | null }> = [];
  let len = 0;
  let start: string | null = null;
  const upto = todayComplete ? stats.length : stats.length - 1;
  for (let i = 0; i < upto; i++) {
    const d = stats[i];
    if (d.due === 0) continue;
    if (d.resolved >= d.due) {
      if (len === 0) start = d.key;
      len += 1;
    } else {
      if (len > 0) runs.push({ len, start });
      len = 0;
      start = null;
    }
  }
  const current = len;
  const bestBefore = runs.reduce((b, r) => Math.max(b, r.len), 0);
  return { current, since: current > 0 ? start : null, bestBefore, todayDue, todayComplete };
}

/** Sum of a span of days. */
function total(stats: DayStat[]): { due: number; taken: number } {
  return stats.reduce((t, d) => ({ due: t.due + d.due, taken: t.taken + d.taken }), {
    due: 0,
    taken: 0,
  });
}

/* ------------------------------------------------------------------ swaps */

export interface SwapContext {
  userId: string;
  todayKey: string;
  nowMinutes: number;
  hideNames: boolean;
}

const seedFor = (ctx: SwapContext, slot: string) => `${ctx.userId}|${ctx.todayKey}|${slot}`;

/** The earliest dose time of the day among `due`, with its compound. */
function firstDose(due: ReminderCompound[]): { c: ReminderCompound; time: string } | null {
  let best: { c: ReminderCompound; time: string } | null = null;
  for (const c of due) {
    for (const t of c.doseTimes ?? []) {
      if (typeof t !== "string" || !t) continue;
      if (!best || toMin(t) < toMin(best.time)) best = { c, time: t };
    }
  }
  return best;
}

/**
 * Another wording for the morning dose reminder, or null for the plain one.
 *
 * Every swap names a compound, so none is eligible with names hidden. The two
 * morning ones need the first dose to be in the MORNING and still AHEAD: "up
 * first today" at 9:00 about an 8:00 dose would be telling somebody about a dose
 * they are already late for.
 */
export function doseSwap(due: ReminderCompound[], ctx: SwapContext): PushMessage | null {
  if (ctx.hideNames || due.length === 0 || due.length > 3) return null;
  const names = joinNames(due.map((c) => c.name));
  const one = due.length === 1;
  const saturday = isoWeekday(ctx.todayKey) === 6;
  const first = firstDose(due);
  const morningAhead =
    !!first && toMin(first.time) < 12 * 60 && ctx.nowMinutes < toMin(first.time);

  const swaps: Array<{ title: string; body: string }> = [];
  if (one) swaps.push({ title: "Dose Reminder", body: `${names} is due today. It's not going to log itself` });
  if (!one) swaps.push({ title: "Dose Reminder", body: `${names} are due today. You know the drill` });
  if (!one) swaps.push({ title: "Today's Lineup", body: names });
  if (saturday && one) swaps.push({ title: "Saturday", body: `Rest day for you? Maybe...\nFor ${names}? Apparently not 🤷` });
  if (saturday) swaps.push({ title: "Weekend", body: `Weekends count too. ${names} ${one ? "is" : "are"} due today` });
  if (morningAhead && first) {
    swaps.push({ title: "Rise and Shine ☀️", body: `${first.c.name} is up first today\nStart the day strong 💪` });
    swaps.push({ title: "", body: `Good morning ☀️\nCoffee first, then ${first.c.name}\nIt's due at ${shortTime(first.time)} this morning` });
  }
  const pick = rotate(seedFor(ctx, "dose"), swaps);
  return pick ? { ...pick, url: "/dashboard", tag: "trackd-dose-daily" } : null;
}

/**
 * The don't-forget slot: the STREAK ALERT when a streak is at stake, otherwise
 * maybe one of the single-compound swaps.
 *
 * The streak alert names no compound, so it survives hidden names. It needs a
 * streak worth keeping (three days) and a today that is not finished.
 */
export function missedSwap(
  overdue: ReminderCompound[],
  ctx: SwapContext,
  streak: Streak | null,
): PushMessage | null {
  if (streak && streak.current >= 3 && streak.todayDue > 0 && !streak.todayComplete) {
    const n = streak.current;
    const hoursLeft = Math.floor((24 * 60 - ctx.nowMinutes) / 60);
    const alerts = [`Your ${n}-day streak ends at midnight\nNo pressure... 🫣`];
    if (hoursLeft >= 1 && hoursLeft <= 6) {
      alerts.push(`${hoursLeft} ${plural(hoursLeft, "hour", "hours")} left to keep your ${n}-day streak`);
    }
    const body = alerts[stableIndex(seedFor(ctx, "streak"), alerts.length)];
    return { title: "Streak Alert", body, url: "/dashboard", tag: "trackd-missed" };
  }
  if (ctx.hideNames || overdue.length !== 1) return null;
  const c = overdue[0];
  const swaps: Array<{ title: string; body: string }> = [
    { title: "Don't Forget", body: `${c.name} is still unlogged. We're pretending not to notice` },
    { title: "Still Waiting", body: `${c.name} is still unlogged. We'll just wait here 🧍` },
    { title: "Did You?", body: `Did ${c.name} happen today? One tap and it's logged` },
  ];
  const lastTime = (c.doseTimes ?? []).filter((t): t is string => typeof t === "string" && !!t).sort().pop();
  if (lastTime) {
    swaps.push({ title: "Hmm", body: `${c.name} was due at ${shortTime(lastTime)}. Your log says otherwise 🤨` });
  }
  const pick = rotate(seedFor(ctx, "missed"), swaps);
  return pick ? { ...pick, url: "/dashboard", tag: "trackd-missed" } : null;
}

/**
 * The low-stock slot, for one compound with a known count. Neither swap tells
 * anybody to buy anything (Adrian's worry about grey-market compounds); both only
 * say how much is left.
 */
export function lowSwap(items: LowStockItem[], ctx: SwapContext): PushMessage | null {
  if (ctx.hideNames || items.length !== 1 || items[0].dosesRemaining == null) return null;
  const left = Math.floor(items[0].dosesRemaining);
  if (left < 1) return null;
  const name = items[0].name;
  const doses = `${left} ${plural(left, "dose", "doses")}`;
  const swaps = [{ title: "Low Stock", body: `About ${doses} of ${name} left at your current pace` }];
  if (left <= 2) swaps.push({ title: "Almost Out", body: `${name} has about ${doses} left. Don't get caught short` });
  const pick = rotate(seedFor(ctx, "low"), swaps);
  return pick ? { ...pick, url: "/protocol", tag: "trackd-lowstock" } : null;
}

/* --------------------------------------------------------------- check-ups */

/** What the runner could find out. `null` means UNREAD, and makes its check-ups ineligible. */
export interface CheckupFacts {
  userId: string;
  todayKey: string;
  nowMinutes: number;
  hideNames: boolean;
  compounds: ReminderCompound[];
  /** Days from about 13 months ago up to and including today; null if logs were unreadable. */
  stats: DayStat[] | null;
  /** Every log in that window, for first doses. */
  logs: HistoryLog[] | null;
  /** The latest and the earliest day with any dose logged, over all time. */
  lastLogDay: string | null | undefined;
  firstLogDay: string | null | undefined;
  signupDay: string | null;
  /** Occasions already marked, by key (`notification_log`). */
  sent: Set<string> | null;
  /** Newest first. */
  weights: Array<{ day: string; kg: number }> | null;
  weightUnit: "kg" | "lbs";
  /** +1 when their goal is to gain, -1 to lose, null when unknown. */
  weightDirection: 1 | -1 | null;
  /** Oldest first. */
  photoDays: string[] | null;
  /** Newest first. */
  bloodDays: string[] | null;
  /** Newest first. */
  journalDays: string[] | null;
  stock: Array<{
    id: string;
    compoundId: string;
    name: string;
    reconstitutedOn: string | null;
    dosesRemaining: number | null;
  }> | null;
}

export interface Checkup {
  /** The occasion. Written to `notification_log` when the one-off must never repeat. */
  key: string;
  /** Minutes since midnight, user-local, before which it waits. */
  at: number;
  /** Lower goes first. */
  priority: number;
  /** Whether to log `key` so it never goes out again. */
  once: boolean;
  message: PushMessage;
}

const H = (h: number) => h * 60;
const daysBetween = (a: string, b: string) => dayNumber(b) - dayNumber(a);
const CHECKUP_TAG = "trackd-checkup";

function msg(title: string, body: string, url: string): PushMessage {
  return { title, body, url, tag: CHECKUP_TAG };
}

/**
 * Every check-up that is true today, in no particular order.
 *
 * Each rule reads only the facts it needs, and a fact that could not be read
 * (null) leaves its rules out rather than guessing: a "3 weeks, no logs" built
 * from a failed log read would be the same fault the dose reminders were fixed
 * for (see the FAIL CLOSED note in runner.ts).
 */
export function candidates(f: CheckupFacts): Checkup[] {
  const out: Checkup[] = [];
  const t = f.todayKey;
  const seed = (s: string) => `${f.userId}|${t}|${s}`;
  const wasSent = (k: string) => f.sent?.has(k) ?? true;
  const add = (c: Checkup) => {
    if (c.once && wasSent(c.key)) return;
    out.push(c);
  };
  const named = !f.hideNames;
  const weekday = isoWeekday(t); // Mon=1 … Sun=7

  const stats = f.stats;
  const today = stats?.[stats.length - 1];
  const streak = stats ? streakOf(stats) : null;

  /* ---- all gone: the dose that emptied the last of a compound's stock ---- */
  if (named && f.stock && f.logs) {
    const loggedToday = new Set(f.logs.filter((l) => l.day === t).map((l) => l.compoundId));
    for (const item of f.stock) {
      if (item.dosesRemaining == null || item.dosesRemaining >= 1) continue;
      if (!loggedToday.has(item.compoundId)) continue;
      const more = f.stock.some(
        (o) => o.id !== item.id && o.compoundId === item.compoundId && (o.dosesRemaining ?? 0) >= 1,
      );
      if (more) continue;
      add({
        key: `gone:${item.id}`, at: H(20), priority: 1, once: true,
        message: msg("All Gone", `That was the last of your ${item.name}\nPause it in your protocol until you have more stock 👍`, "/protocol"),
      });
    }
  }

  /* ---- cycles: ending in three days, a break starting, a break over ---- */
  if (named) {
    for (const c of f.compounds) {
      if (c.stopped || !c.cycle) continue;
      const status = (k: string) => cycleStatusOn(c.cycle, k, cyclePauseContext(c.pauses, c.cycle, k));
      const now = status(t);
      const yest = status(shiftDateKey(t, -1));
      const pattern = c.cycle.pattern;
      const longBreak = pattern.type === "onOff" && pattern.offDays >= 7;
      if (longBreak && yest.on && !now.on && !now.ended && !now.pending) {
        let back: string | null = null;
        for (let i = 1; i <= 120 && !back; i++) {
          const k = shiftDateKey(t, i);
          const s = status(k);
          if (s.ended) break;
          if (s.on) back = k;
        }
        if (back) {
          add({
            key: `cycle-off:${c.id}:${t}`, at: H(9), priority: 2, once: true,
            message: msg("Off Week", `${c.name} is on its break. Nothing due until ${shortDate(back)}`, "/protocol"),
          });
        }
      }
      if (longBreak && !yest.on && !yest.pending && !yest.ended && now.on) {
        add({
          key: `cycle-on:${c.id}:${t}`, at: H(9), priority: 2, once: true,
          message: msg("Back On", `${c.name} is back on today after its break`, "/protocol"),
        });
      }
      // The last day the cycle runs: today+3 is on and today+4 has ended.
      const end3 = shiftDateKey(t, 3);
      if (status(end3).on && status(shiftDateKey(t, 4)).ended) {
        add({
          key: `cycle-end:${c.id}:${end3}`, at: H(9), priority: 2, once: true,
          message: msg("Cycle Ending", `Your ${c.name} cycle ends on ${shortDate(end3)}`, "/protocol"),
        });
      }
    }
  }

  /* ---- a vial mixed four weeks ago, still in use ---- */
  if (named && f.stock) {
    for (const item of f.stock) {
      if (!item.reconstitutedOn || (item.dosesRemaining ?? 0) < 1) continue;
      const age = daysBetween(item.reconstitutedOn, t);
      if (age < 28 || age > 30) continue;
      const bodies = [
        `Your ${item.name} vial was mixed 28 days ago`,
        `${item.name} was mixed 4 weeks ago. Check the date before your next dose`,
      ];
      add({
        key: `vial:${item.id}`, at: H(9), priority: 3, once: true,
        message: msg("Vial Check", bodies[stableIndex(seed(item.id), 2)], "/protocol"),
      });
    }
  }

  /* ---- streak milestones, once today is finished ---- */
  if (streak && streak.todayComplete && streak.since) {
    if (streak.current === 100) {
      add({
        key: `streak-100:${streak.since}`, at: H(20), priority: 4, once: true,
        message: msg("100 Days", "100 days in a row 🥳🎉\nWe'd throw you a party, but you'd probably just log that too...", "/dashboard"),
      });
    } else if (streak.current > Math.max(streak.bestBefore, 13)) {
      // Two weeks at the least, so a new account is not told "longest streak
      // yet" on day two; after that, only when it beats their own best. Once
      // per run: the key carries the day the run began.
      add({
        key: `record:${streak.since}`, at: H(20), priority: 4, once: true,
        message: msg("New Record", `${streak.current} days straight\nThat's your longest streak yet 🔥`, "/dashboard"),
      });
    }
  }

  /* ---- a year since the first dose ---- */
  if (f.firstLogDay && f.firstLogDay.slice(5) === t.slice(5) && f.firstLogDay < t) {
    add({
      key: `year:${t.slice(0, 4)}`, at: H(10), priority: 5, once: true,
      message: msg("1 Year", "A year ago today, you logged your first dose...\nLook how far you've come 🥲", "/progress"),
    });
  }

  /* ---- the first of the month: last month ---- */
  if (stats && t.endsWith("-01")) {
    const prevMonth = shiftDateKey(t, -1).slice(0, 7);
    const m = total(stats.filter((d) => d.key.startsWith(prevMonth)));
    const month = MONTHS[Number(prevMonth.slice(5, 7)) - 1];
    if (m.due >= 10 && m.taken >= m.due) {
      const perfect = [
        msg("Perfect Month", `${m.taken} for ${m.due} in ${month}\nNot a single dose missed 🏆`, "/progress"),
        msg("Clean Sweep", `Every dose in ${month}, logged\nA perfect month. Frame it.`, "/progress"),
      ];
      add({
        key: `month:${prevMonth}`, at: H(10), priority: 6, once: true,
        message: perfect[Number(prevMonth.slice(5, 7)) % 2],
      });
    } else if (m.due >= 10 && m.taken / m.due >= 0.9) {
      add({
        key: `month:${prevMonth}`, at: H(10), priority: 6, once: true,
        message: msg("Your Month", `${month}: ${m.taken} of ${m.due} doses logged. Strong month`, "/progress"),
      });
    }
  }

  /* ---- Sunday: the week so far ---- */
  if (stats && today && weekday === 7) {
    const monday = shiftDateKey(t, -6);
    // Today counts only once it is finished, so the figure is never a claim
    // about a dose whose time has not come.
    const span = stats.filter((d) => d.key >= monday && (d.key < t || (today.due > 0 && today.resolved >= today.due)));
    const w = total(span);
    // A week with nothing logged gets no recap: "0 of 6" is a scolding, and a
    // quiet week is the quiet-spell check-ups' to speak to, in their words.
    if (w.due >= 3 && w.taken >= 1) {
      const tt = `${w.taken} of ${w.due} doses logged`;
      const pct = w.taken / w.due;
      let body: string;
      const moved = weightMovedTowardGoal(f, monday);
      if (moved && pct >= 0.85) {
        body = `${tt}, and your weight moved ${moved} toward your goal 🎉`;
      } else if (w.taken >= w.due) {
        body = `${tt}. Flawless`;
      } else if (pct >= 0.85) {
        body = `${tt}. Nearly perfect. Nearly`;
      } else {
        body = `${tt}. Next week's a clean slate`;
      }
      add({ key: `week:${monday}`, at: H(18), priority: 7, once: true, message: msg("Your Week", body, "/progress") });
    }
  }

  /* ---- quiet spells: a week, two, three ---- */
  if (f.lastLogDay && stats && f.compounds.some((c) => !c.stopped)) {
    const gap = daysBetween(f.lastLogDay, t);
    const dueSince = stats.some((d) => d.key > f.lastLogDay! && d.key <= t && d.due > 0);
    const spell = (days: number) => `quiet:${days}:${f.lastLogDay}`;
    if (dueSince && gap >= 21 && gap < 28) {
      add({
        key: spell(21), at: H(18), priority: 8, once: true,
        message: msg("Giving You Space", "3 weeks, no logs. We get it, you need space 💔\nReminders are paused until you're back", "/dashboard"),
      });
    } else if (dueSince && gap >= 14 && gap < 21) {
      add({
        key: spell(14), at: H(18), priority: 8, once: true,
        message: msg("Welcome Back?", "It's been 2 weeks since your last log\nPicking up where you left off takes 10 seconds 😤", "/dashboard"),
      });
    } else if (dueSince && gap >= 7 && gap < 14) {
      add({
        key: spell(7), at: H(10), priority: 8, once: true,
        message: msg("", "Nothing logged for a week\nJust make it happen. Today's a clean slate ✅", "/dashboard"),
      });
    }
  }

  /* ---- the first days ---- */
  if (f.signupDay) {
    const age = daysBetween(f.signupDay, t);
    const noCompounds = f.compounds.length === 0;
    if (noCompounds && age >= 3 && age <= 5) {
      add({
        key: "start:3", at: H(18), priority: 9, once: true,
        message: msg("Getting Started", "You signed up, then left us on read 😔\nAdd one compound and we'll take it from there", "/dashboard"),
      });
    } else if (noCompounds && age >= 1 && age <= 2) {
      add({
        key: "start:1", at: H(18), priority: 9, once: true,
        message: msg("Getting Started", "Your protocol's empty. Add your first compound in under a minute", "/dashboard"),
      });
    }
    if (f.lastLogDay && age >= 7 && age <= 8) {
      add({
        key: "first-week", at: H(18), priority: 9, once: true,
        message: msg("First Week", "One week in. Your log is starting to tell a story", "/progress"),
      });
    }
  }
  if (f.firstLogDay && f.firstLogDay === shiftDateKey(t, -1)) {
    add({
      key: "day-two", at: H(9), priority: 9, once: true,
      message: msg("Day Two", "Yesterday you logged your first dose. Let's make it two", "/dashboard"),
    });
  }

  /* ---- Monday: the week ahead ---- */
  if (weekday === 1) {
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const k = shiftDateKey(t, i);
      for (const c of f.compounds) if (isDueToday(c, k)) n += slotsOf(c);
    }
    if (n >= 1) {
      add({
        key: `new-week:${t}`, at: H(8), priority: 10, once: true,
        message: msg("New Week", `${n} ${plural(n, "dose", "doses")} on the schedule this week\nTime to lock in 😮‍💨💯`, "/dashboard"),
      });
    }
  }

  /* ---- a compound's very first dose, logged today ---- */
  if (named && f.logs && stats && stats.length >= 60) {
    const earlier = new Set(f.logs.filter((l) => l.day < t).map((l) => l.compoundId));
    const firstToday = new Set(f.logs.filter((l) => l.day === t && l.status === "taken" && !earlier.has(l.compoundId)).map((l) => l.compoundId));
    for (const c of f.compounds) {
      // Not their first compound ever (Day Two covers that), and started inside
      // the window, so "first dose" is a fact rather than the edge of the read.
      if (!firstToday.has(c.id) || !f.firstLogDay || f.firstLogDay >= t) continue;
      if (c.first_dose_on < stats[0].key) continue;
      add({
        key: `first-dose:${c.id}`, at: H(20), priority: 11, once: true,
        message: msg("New Addition", `First dose of ${c.name} logged. Welcome to the lineup`, "/protocol"),
      });
    }
  }

  /* ---- weigh-ins, for people who weigh in ---- */
  if (f.weights && f.weights.length >= 2) {
    const last = f.weights[0].day;
    const gap = daysBetween(last, t);
    const regular = f.weights.filter((w) => daysBetween(w.day, t) <= 90).length >= 2;
    if (regular && gap >= 7 && gap <= 9) {
      const bodies = [
        `It's been ${gap} days since your last weigh-in`,
        `The scale misses you. It's been ${gap} days`,
      ];
      add({
        key: `weigh:${last}`, at: H(8), priority: 12, once: true,
        message: msg("Weigh-In", bodies[stableIndex(seed("weigh"), 2)], "/weight"),
      });
    }
  }

  /* ---- progress photos ---- */
  if (f.photoDays && f.photoDays.length >= 1) {
    const first = f.photoDays[0];
    const last = f.photoDays[f.photoDays.length - 1];
    const sinceFirst = daysBetween(first, t);
    if (f.photoDays.length >= 2 && sinceFirst >= 84 && sinceFirst <= 90) {
      add({
        key: "glow-up", at: H(18), priority: 13, once: true,
        message: msg("Glow Up?", "Your first progress photo was 12 weeks ago\nPut them side by side 👀", "/progress"),
      });
    }
    const gap = daysBetween(last, t);
    if (gap >= 28 && gap <= 34) {
      const bodies = [
        "4 weeks since your last progress photo",
        "Same pose, same light, 4 weeks later. Time for a photo",
        "Future you will want this photo. It's been 4 weeks",
      ];
      add({
        key: `photo:${last}`, at: H(18), priority: 13, once: true,
        message: msg("Progress Photo", bodies[stableIndex(seed("photo"), 3)], "/progress"),
      });
    }
  }

  /* ---- bloodwork, for people who log it ---- */
  if (f.bloodDays && f.bloodDays.length >= 1) {
    const last = f.bloodDays[0];
    const gap = daysBetween(last, t);
    if (gap >= 84 && gap <= 90) {
      const options = [
        msg("Bloodwork", "It's been 12 weeks since your last blood test", "/progress"),
        msg("Bloodwork", "12 weeks since your last bloods. Worth booking in?", "/progress"),
        msg("New Results?", "Got new bloodwork? Add it and see how your markers moved", "/progress"),
      ];
      add({ key: `blood:${last}`, at: H(10), priority: 14, once: true, message: options[stableIndex(seed("blood"), 3)] });
    }
  }

  /* ---- the journal, for people who keep one ---- */
  if (f.journalDays && f.journalDays.filter((d) => daysBetween(d, t) <= 90).length >= 2) {
    const last = f.journalDays[0];
    const gap = daysBetween(last, t);
    if (gap >= 14 && gap <= 20) {
      add({
        key: `journal:${last}`, at: H(19), priority: 15, once: true,
        message: msg("Dear Diary", "2 weeks since your last journal entry. How's the protocol treating you?", "/progress"),
      });
    } else if (weekday === 3 && gap >= 3 && gap < 14) {
      const monday = shiftDateKey(t, -2);
      add({
        key: `journal-week:${monday}`, at: H(19), priority: 15, once: true,
        message: msg("Journal", "How's this week feeling? One line in your journal is enough", "/progress"),
      });
    }
  }

  return out;
}

/**
 * "0.6 kg" when their weight moved that far toward their goal this week, else
 * null. Only with a known goal: a loss is progress on a cut and the opposite on a
 * bulk, and congratulating the wrong one is worse than saying nothing.
 */
function weightMovedTowardGoal(f: CheckupFacts, monday: string): string | null {
  if (!f.weights || !f.weightDirection) return null;
  const latest = f.weights.find((w) => w.day >= monday && w.day <= f.todayKey);
  const before = f.weights.find((w) => w.day < monday);
  if (!latest || !before) return null;
  const deltaKg = (latest.kg - before.kg) * f.weightDirection;
  if (deltaKg < 0.2) return null;
  const value = f.weightUnit === "lbs" ? deltaKg / 0.45359237 : deltaKg;
  return `${value.toFixed(1)} ${f.weightUnit}`;
}

/**
 * The one check-up to send now, or null.
 *
 * Highest priority among those whose time has come. A higher one later in the
 * day does not hold back a lower one now: the day's cap is spent by whichever
 * gets there first, which is the price of never promising a notification the
 * runner cannot yet know about (an "All Gone" depends on a dose not logged yet).
 */
export function pickCheckup(f: CheckupFacts): Checkup | null {
  const ready = candidates(f).filter((c) => c.at <= f.nowMinutes);
  ready.sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
  return ready[0] ?? null;
}

/** The earliest hour any check-up waits for. Before it, the runner reads nothing. */
export const EARLIEST_CHECKUP_MIN = H(8);

/**
 * "Giving You Space" promised that reminders are paused until they are back.
 * True while that promise is in force: it went out for the CURRENT quiet spell
 * (the key carries the last log day), so any new log ends it by construction.
 */
export function remindersPausedForSpace(
  sent: Set<string> | null,
  lastLogDay: string | null | undefined,
): boolean {
  if (!sent || !lastLogDay) return false;
  return sent.has(`quiet:21:${lastLogDay}`);
}
