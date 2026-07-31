"use client";

import { useEffect, useRef, useState } from "react";

import { Vial } from "@/components/containers";
import { track } from "@/lib/onboarding/analytics";
import {
  DEMO_COMPOUND,
  DEMO_START,
  demoFill,
  demoProjectedEmpty,
  formatDemoDate,
  isDemoEmpty,
  logDemoDose,
  type DemoStock,
} from "@/lib/onboarding/demo";
import { CARD_EYEBROW, METRIC_LABEL } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { FlowCta, StepFrame } from "../chrome";
import { useFlow } from "../flow-context";

/**
 * Screen 6 — Demo 2: Stock reflow. THE AHA (Spec 3-01 §4, §9).
 *
 * "The highest-leverage surface in the app. Build it to feel good before
 * polishing anything else." Every logged dose visibly reflows four things at
 * once: the vial fill, the remaining mL, the doses left, and the projected
 * empty date. No maths are shown, because not doing the maths is the product.
 *
 * The figures COUNT to their new value rather than snapping, which is what
 * makes one tap read as a consequence rather than a repaint. The vial rides
 * the app's own `.container-fill` transition, so the demo and the real stock
 * screen ease identically.
 */

/** Ease a number to a new value over ~400ms, matching the house count-up. */
function useCountTo(value: number, decimals: number): string {
  // Resolved once, in a lazy initialiser: someone who has opted out of motion
  // gets the figure straight, and the animation effect never runs at all.
  const [reduce] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
  );
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (reduce) return;

    const start = performance.now();
    const origin = from.current;
    const delta = value - origin;
    const DURATION = 400;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      // The house ease-out, so this matches every other entrance.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(origin + delta * eased);
      if (t < 1) {
        raf.current = requestAnimationFrame(tick);
      } else {
        from.current = value;
      }
    };

    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      from.current = value;
    };
  }, [value, reduce]);

  return (reduce ? value : shown).toFixed(decimals);
}

function StatRow({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-3">
      <span className={METRIC_LABEL}>{label}</span>
      <span className="font-mono text-xl font-light tabular-nums text-foreground">
        {value}
        {unit ? <span className="ml-1 text-[11px] text-text-muted">{unit}</span> : null}
      </span>
    </div>
  );
}

export function DemoStockScreen() {
  const { goNext, todayKey } = useFlow();

  // Opens with the dose logged on the previous screen already taken off, so
  // arriving here is itself the first reflow.
  const [stock, setStock] = useState<DemoStock>(() => logDemoDose(DEMO_START));

  const empty = isDemoEmpty(stock);
  const remaining = useCountTo(stock.remainingMl, 1);
  const doses = useCountTo(stock.dosesLeft, 0);
  const projected = formatDemoDate(demoProjectedEmpty(stock, todayKey));

  const onLog = () => {
    if (empty) return;
    setStock(logDemoDose(stock));
    track("demo_dose_logged", { screen: "demo2" });
  };

  return (
    <StepFrame
      eyebrow="Demo · 2 / 4"
      title="Always know your stock."
      sub="Every dose reflows your inventory. No maths, ever."
      footer={
        <div className="space-y-3">
          <button
            type="button"
            onClick={onLog}
            disabled={empty}
            className={cn(
              "h-12 w-full rounded-2xl text-[0.9rem] font-medium",
              "transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "motion-reduce:transition-none",
              empty
                ? "bg-bg-surface text-text-subtle"
                : "bg-bg-surface-raised text-foreground active:scale-[0.98]",
            )}
          >
            {empty
              ? "Vial empty"
              : `Log another ${DEMO_COMPOUND.doseMl.toFixed(1)} mL`}
          </button>
          <FlowCta onClick={goNext}>Continue</FlowCta>
        </div>
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-7">
        <Vial
          colour="var(--cat-anabolic)"
          fill={demoFill(stock)}
          size={150}
          title={`Sample vial, ${stock.remainingMl.toFixed(1)} millilitres remaining`}
        />

        <div className="w-full rounded-2xl bg-bg-surface px-5 py-1">
          <p className={cn(CARD_EYEBROW, "pt-4")}>Sample vial</p>
          <div className="divide-y divide-border-default">
            <StatRow label="Remaining" value={remaining} unit="mL" />
            <StatRow label="Doses left" value={doses} />
            <StatRow label="Projected empty" value={projected} />
          </div>
        </div>
      </div>
    </StepFrame>
  );
}
