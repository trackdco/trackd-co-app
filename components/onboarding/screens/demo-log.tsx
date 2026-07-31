"use client";

import { useEffect, useRef, useState } from "react";

import { Check } from "@/components/icons";
import { Vial } from "@/components/containers";
import { track } from "@/lib/onboarding/analytics";
import { DEMO_COMPOUND } from "@/lib/onboarding/demo";
import { DATA_MONO } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { StepFrame } from "../chrome";
import { useFlow } from "../flow-context";

/** How long the tick is allowed to land before the screen moves on (§9). */
const ADVANCE_MS = 640;

/**
 * Screen 5 — Demo 1: Log a dose (Spec 3-01 §9, §10).
 *
 * Two taps to a logged dose, and the second one is this screen. It
 * AUTO-ADVANCES: there is no Next, because the point being made is that logging
 * takes one tap and then you are looking at your stock.
 *
 * Two things here have bitten this prototype before and are both handled:
 *  - the `logged` ref guards against a double-tap double-firing the advance;
 *  - the ring overlay is `pointer-events-none`, so it cannot swallow the tap it
 *    is drawn on top of.
 */
export function DemoLogScreen() {
  const { goNext } = useFlow();
  const [logged, setLogged] = useState(false);
  const fired = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onLog = () => {
    if (fired.current) return;
    fired.current = true;
    setLogged(true);
    track("demo_dose_logged", { screen: "demo1" });
    timer.current = setTimeout(goNext, ADVANCE_MS);
  };

  return (
    <StepFrame
      eyebrow="Demo · 1 / 4"
      title="Log a dose in two taps."
      sub="Here's a sample compound. Tap to log it, and you'll jump straight to your stock."
      footer={
        <p className="text-center text-xs text-text-subtle">Tap the circle to log</p>
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-10">
        {/* The sample compound, in the app's own list-row language: container,
            name and muted detail line, a right-railed mono figure. */}
        <div className="w-full rounded-2xl bg-bg-surface p-5">
          <div className="flex items-center gap-4">
            <Vial colour="var(--cat-anabolic)" fill={1} size={56} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.95rem] text-foreground">
                {DEMO_COMPOUND.name}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                {DEMO_COMPOUND.concentrationMgPerMl} mg/mL
              </p>
            </div>
            <span className={cn(DATA_MONO, "shrink-0 text-right")}>
              {DEMO_COMPOUND.doseMl.toFixed(1)} mL
            </span>
          </div>
        </div>

        <div className="relative flex items-center justify-center">
          {/* Decorative pulse. pointer-events-none is load-bearing: this sits
              directly over the button. */}
          {logged ? (
            <span
              aria-hidden
              className="animate-home-tick-ring pointer-events-none absolute h-24 w-24 rounded-full border border-accent-primary"
            />
          ) : null}

          <button
            type="button"
            onClick={onLog}
            disabled={logged}
            aria-label={`Log ${DEMO_COMPOUND.doseMl} mL of the sample compound`}
            className={cn(
              "flex h-24 w-24 items-center justify-center rounded-full",
              "transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-bg-base",
              "motion-reduce:transition-none",
              logged
                ? "bg-accent-primary text-bg-base"
                // Amber ring = the one due moment on the screen, which is
                // exactly what this is.
                : "border-2 border-accent-amber bg-transparent text-accent-amber active:scale-95",
            )}
          >
            {logged ? (
              <Check className="animate-home-tick-pop h-10 w-10" weight="bold" />
            ) : (
              <span className="font-mono text-sm tabular-nums">
                {DEMO_COMPOUND.doseMl.toFixed(1)} mL
              </span>
            )}
          </button>
        </div>
      </div>
    </StepFrame>
  );
}
