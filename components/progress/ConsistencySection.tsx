"use client";

import { useSyncExternalStore } from "react";

import { useMounted } from "@/components/home/useMounted";
import { ConsistencyGraph } from "@/components/progress/ConsistencyGraph";
import { computeAdherence, type AdherencePoint } from "@/lib/progress/consistency";
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
  todayKey,
  sample,
}: {
  userId: string;
  todayKey: DateKey;
  sample?: AdherencePoint[];
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

  const points = sample ?? (mounted ? computeAdherence(stack, logs, todayKey) : []);
  return <ConsistencyGraph points={points} />;
}
