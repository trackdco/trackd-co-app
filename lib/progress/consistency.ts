/**
 * Consistency = adherence to the protocol over time (Context/Feature Specs/09 →
 * Step 6). Computed from the same device-local stack + dose log the Home screen
 * reads (the dosing model isn't on Postgres yet — see architecture). Per day:
 * how many of the doses DUE that day were logged. Rest days (nothing due) don't
 * count for or against you. Pure — no React.
 *
 * NOTE: this is a logging/behavioural read ("how closely you're sticking to it"),
 * NOT health data — so it's allowed an accent, unlike biomarker/marker values.
 */

import {
  dateKeyToDate,
  resolveDateKey,
  type DateKey,
} from "@/lib/home/mockHomeData";
import { isDueOn, type StackCompound } from "@/lib/home/stack";
import type { DayLogs } from "@/lib/home/doseLog";

export interface AdherencePoint {
  key: DateKey;
  /** Doses due that day. */
  due: number;
  /** Of those, how many were logged. */
  logged: number;
  /** logged / due as a %, or null on a rest day (nothing due). */
  pct: number | null;
}

const MAX_DAYS = 365;

/** One point per calendar day from day one (earliest start) → today, oldest first. */
export function computeAdherence(
  stack: StackCompound[],
  logs: DayLogs,
  todayKey: DateKey,
): AdherencePoint[] {
  const active = stack.filter((c) => !c.archived);
  if (active.length === 0) return [];

  const starts = stack
    .map((c) => c.schedule.startDate)
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
  const earliest = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : todayKey;

  const today = dateKeyToDate(todayKey);
  const span = Math.floor(
    (today.getTime() - dateKeyToDate(earliest).getTime()) / 86_400_000,
  );
  const days = Math.min(Math.max(span + 1, 1), MAX_DAYS);

  const points: AdherencePoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = resolveDateKey(today, i);
    const date = dateKeyToDate(key);
    const dueIds = active.filter((c) => isDueOn(c.schedule, date)).map((c) => c.id);
    const due = dueIds.length;
    if (due === 0) {
      points.push({ key, due: 0, logged: 0, pct: null });
    } else {
      const dayLogs = logs[key] ?? {};
      const logged = dueIds.filter((id) => dayLogs[id]).length;
      points.push({ key, due, logged, pct: Math.round((logged / due) * 100) });
    }
  }
  return points;
}

/** Overall adherence across a set of points (logged ÷ due), or null if no doses. */
export function overallPct(points: AdherencePoint[]): number | null {
  let due = 0;
  let logged = 0;
  for (const p of points) {
    due += p.due;
    logged += p.logged;
  }
  return due > 0 ? Math.round((logged / due) * 100) : null;
}

/** Days that actually had doses due (the bars). */
export function doseDayCount(points: AdherencePoint[]): number {
  return points.reduce((n, p) => n + (p.due > 0 ? 1 : 0), 0);
}
