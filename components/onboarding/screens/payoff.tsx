"use client";

import { useEffect, useState } from "react";

import { track } from "@/lib/onboarding/analytics";
import { weeklyAnchor } from "@/lib/onboarding/pricing";
import { CARD_EYEBROW } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { FlowCta, StepFrame } from "../chrome";
import { useFlow } from "../flow-context";

/**
 * Screen 9 — Payoff (Spec 3-01 §9).
 *
 * The comparison is about TRACKING COMPLETENESS, never health results. There
 * are no percentages and no invented statistics anywhere on this screen (§14
 * bans both outright): the bars are relative and unlabelled by number, which is
 * the only honest way to draw this.
 *
 * The Trackd bar is amber, and it is the single amber beat on the screen.
 */

const BARS = [
  { label: "Notes app", height: 26, accent: false },
  { label: "Spreadsheet", height: 58, accent: false },
  { label: "Trackd", height: 100, accent: true },
];

export function PayoffScreen() {
  const { goNext } = useFlow();
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    track("payoff_viewed");
    // Next frame, so the bars have a zero-height state to grow FROM. Setting
    // it synchronously would paint them already grown.
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <StepFrame
      title="The longer you track, the more you see."
      sub="A tracker captures what guesswork drops."
      footer={
        <div className="space-y-3">
          <FlowCta onClick={goNext}>See plans</FlowCta>
          <p className="text-center text-[0.8rem] text-text-muted">{weeklyAnchor()}</p>
        </div>
      }
    >
      <div className="flex flex-1 flex-col justify-center">
        <div className="rounded-2xl bg-bg-surface p-5">
          <p className={CARD_EYEBROW}>What gets kept</p>

          <div className="mt-6 flex h-52 items-end justify-between gap-4">
            {BARS.map((bar, i) => (
              <div key={bar.label} className="flex h-full flex-1 flex-col justify-end">
                <div
                  className={cn(
                    "w-full rounded-t-lg",
                    "transition-[height] duration-[720ms] ease-[var(--motion-ease)]",
                    "motion-reduce:transition-none",
                    bar.accent ? "bg-accent-amber" : "bg-bg-surface-raised",
                  )}
                  style={{
                    height: grown ? `${bar.height}%` : "0%",
                    transitionDelay: `${i * 110}ms`,
                  }}
                />
                <p
                  className={cn(
                    "mt-3 text-center text-[10px] font-sans uppercase tracking-[0.12em]",
                    bar.accent ? "text-foreground" : "text-text-subtle",
                  )}
                >
                  {bar.label}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-5 text-[0.8rem] leading-relaxed text-text-muted">
            Doses, stock, sites, bloods, photos and notes. In one place, for as
            long as you keep them.
          </p>
        </div>
      </div>
    </StepFrame>
  );
}
