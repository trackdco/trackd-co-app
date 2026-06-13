"use client";

import { useRouter } from "next/navigation";

import { WeightGlanceCard } from "@/components/home/WeightGlanceCard";
import type { DateKey } from "@/lib/home/mockHomeData";
import type { WeightUnit } from "@/lib/weight";

/**
 * The Progress weight hero (Context/Feature Specs/09 → Step 3). Weight leads the
 * Progress screen as a summary glance — latest reading + trend delta + a mini
 * sparkline — that taps through to the one canonical Weight view (`/weight`),
 * where the full Scale/Trend graph, range toggle, and scrubber live. We REUSE the
 * existing `WeightGlanceCard` primitive (the same card Home uses) rather than
 * building a second weight view, so there is exactly one interactive weight
 * surface. Logging happens in that view (and the + menu).
 */
export function WeightHero({
  series,
  unit,
}: {
  series: { key: DateKey; kg: number }[];
  unit: WeightUnit;
}) {
  const router = useRouter();
  return (
    <WeightGlanceCard
      series={series}
      unit={unit}
      onOpenDetail={() => router.push("/weight")}
    />
  );
}
