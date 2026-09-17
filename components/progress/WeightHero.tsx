"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { WeightGlanceCard } from "@/components/home/WeightGlanceCard";
import { useMounted } from "@/components/home/useMounted";
import { LogWeightPad } from "@/components/weight/LogWeightPad";
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
 *
 * The EMPTY card is the exception (feel pass): "Log your first weight" opens the
 * Log weight pad straight away rather than a Weight view with nothing to show.
 */
export function WeightHero({
  series,
  unit,
  compact = false,
}: {
  series: { key: DateKey; kg: number }[];
  unit: WeightUnit;
  /** Progress's two-up grid (spec 08 · part two). */
  compact?: boolean;
}) {
  const router = useRouter();
  const mounted = useMounted();
  const [padOpen, setPadOpen] = useState(false);
  // Focus goes back to whatever opened the pad (the card, on a keyboard).
  const opener = useRef<HTMLElement | null>(null);
  const lastKg = series.length ? series[series.length - 1].kg : null;

  return (
    <>
      <WeightGlanceCard
        series={series}
        unit={unit}
        compact={compact}
        onOpenDetail={() => router.push("/weight")}
        onLogFirst={() => {
          opener.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          setPadOpen(true);
        }}
        drawKey={compact ? "progress:weight" : null}
      />
      {/* On `<body>`: the card sits in a block that rises in with a transform,
          and a transformed ancestor would hold the pad's fixed "Weight logged"
          notice to that block instead of the top of the screen. */}
      {mounted
        ? createPortal(
            <LogWeightPad
              open={padOpen}
              onOpenChange={setPadOpen}
              unit={unit}
              lastKg={lastKg}
              returnFocusRef={opener}
            />,
            document.body,
          )
        : null}
    </>
  );
}
