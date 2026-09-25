"use client";

import { useSyncExternalStore } from "react";

import { useDeviceToday } from "@/components/home/useDeviceToday";

import { useMounted } from "@/components/home/useMounted";
import { Sk, SkGraph } from "@/components/feel/Skeleton";
import {
  getHydrationState,
  subscribeHydrationState,
  type HydrationState,
} from "@/lib/home/hydrationState";
import { ConsistencyGraph } from "@/components/progress/ConsistencyGraph";
import { DaysSketch, EmptySection } from "@/components/progress/EmptySection";
import {
  computeAdherence,
  hasAnyDose,
  type AdherencePoint,
} from "@/lib/progress/consistency";
import { getStackSnapshot, subscribeStack } from "@/lib/home/stack";
import {
  getDoseLogsSnapshot,
  subscribeDoseLogs,
  type DayLogs,
} from "@/lib/home/doseLog";
import { seedStack, type DateKey } from "@/lib/home/mockHomeData";

const EMPTY_LOGS: DayLogs = {};

/**
 * The Progress consistency section (Step 6). Adherence is derived from the same
 * device-local stack + dose log the Home screen uses (the dosing model isn't on
 * Postgres yet); the per-cycle breakdown is deferred until cycles exist. Reads
 * the stores after mount (SSR is deterministic) and feeds the graph. `sample`
 * lets the dev preview render without device data.
 */
export function ConsistencySection({
  userId,
  todayKey: serverTodayKey,
  sample,
  compact = false,
}: {
  userId: string;
  todayKey: DateKey;
  sample?: AdherencePoint[];
  /** Progress's two-up grid (spec 08 · part two). */
  compact?: boolean;
}) {
  const mounted = useMounted();
  const stack = useSyncExternalStore(
    subscribeStack,
    () => getStackSnapshot(userId, seedStack),
    () => seedStack,
  );
  const logs = useSyncExternalStore(
    subscribeDoseLogs,
    () => getDoseLogsSnapshot(userId),
    () => EMPTY_LOGS,
  );

  // The DEVICE's today. The page is a server component, so its date is UTC:
  // a day ahead adds a phantom future due-day and reads as a miss, a day behind
  // drops today's logged doses out of the window. The calendar was corrected for
  // exactly this; the consistency widget had been left on the server's clock.
  const todayKey = useDeviceToday(serverTodayKey);
  const points = sample ?? (mounted ? computeAdherence(stack, logs, todayKey) : []);
  // An empty device before its first pull would read "no doses": hold a
  // skeleton until the log is known (feel pass §1).
  const hydration = useSyncExternalStore<HydrationState>(
    subscribeHydrationState,
    () => getHydrationState(userId),
    () => "pending",
  );
  const known = sample !== undefined || (mounted && (stack.length > 0 || hydration !== "pending"));
  if (!known) {
    return (
      <section
        aria-busy="true"
        aria-label="Loading consistency"
        className="flow-card animate-shortcut-fade flex flex-col inst-card p-5"
      >
        <Sk w="60%" h={9} />
        <Sk w="46%" h={26} className="mt-3" />
        <SkGraph height={compact ? 64 : 120} seed={3} className="mt-3 flex-1" />
      </section>
    );
  }
  // Before the first dose there is nothing to be consistent with: the card
  // says what starts it, and has no plus (build-brief-final §3.15).
  if (!hasAnyDose(points)) {
    return (
      <EmptySection
        title="Consistency"
        preview={<DaysSketch />}
        note="Starts with your first dose"
      />
    );
  }
  return (
    <ConsistencyGraph
      points={points}
      compact={compact}
      drawKey={compact ? "progress:consistency" : null}
    />
  );
}
