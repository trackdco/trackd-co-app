"use client";

import { ImageSquare } from "@/components/icons";
import { track } from "@/lib/onboarding/analytics";
import {
  DEMO_CONSISTENCY,
  DEMO_JOURNAL,
  DEMO_PHOTO_WEEKS,
} from "@/lib/onboarding/demo";
import { CARD_EYEBROW } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { FlowCta, StepFrame } from "../chrome";
import { useFlow } from "../flow-context";

/**
 * Screen 8 — Demo 4: History (Spec 3-01 §9).
 *
 * The longitudinal argument, which is the thing a five-day trial cannot
 * demonstrate on its own: photos, a consistency grid and a journal note, all
 * mapped to the same protocol.
 *
 * The grid is deliberately NOT evaluative. A logged day is a filled mark and a
 * missed day is an empty one; there is no red, no score and no "streak broken".
 * It reports what happened.
 */
export function DemoHistoryScreen() {
  const { goNext } = useFlow();

  return (
    <StepFrame
      eyebrow="Demo · 4 / 4"
      title="Your history compounds."
      sub="Photos, journal, and markers, mapped to the exact protocol."
      footer={
        <FlowCta
          onClick={() => {
            track("demo_completed");
            goNext();
          }}
        >
          Continue
        </FlowCta>
      }
    >
      <div className="flex flex-1 flex-col gap-4">
        {/* Progress photos. Placeholder tiles: real art is not needed to make
            the point, and a stock body shot would be the wrong promise. */}
        <div className="rounded-2xl bg-bg-surface p-5">
          <p className={CARD_EYEBROW}>Progress photos</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {DEMO_PHOTO_WEEKS.map((week) => (
              <div key={week} className="space-y-1.5">
                <div className="flex aspect-[3/4] items-center justify-center rounded-xl bg-bg-surface-raised">
                  <ImageSquare className="h-5 w-5 text-text-subtle" />
                </div>
                <p className="text-center text-[9px] font-sans uppercase tracking-[0.12em] text-text-subtle">
                  {week}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 28-day consistency. Four rows of seven. */}
        <div className="rounded-2xl bg-bg-surface p-5">
          <p className={CARD_EYEBROW}>Consistency · 28 days</p>
          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {DEMO_CONSISTENCY.map((day, i) => (
              <span
                key={i}
                className={cn(
                  "aspect-square rounded-[3px]",
                  day === "logged" && "bg-accent-primary/85",
                  day === "missed" && "border-[0.5px] border-border-strong",
                  day === "off" && "bg-bg-surface-raised",
                )}
              />
            ))}
          </div>
          <p className="mt-3 text-[0.75rem] text-text-muted">
            Filled is a logged day. Empty is a day it was due and nothing was
            recorded.
          </p>
        </div>

        {/* Journal */}
        <div className="rounded-2xl bg-bg-surface p-5">
          <p className={CARD_EYEBROW}>Journal</p>
          <p className="mt-3 text-[0.95rem] leading-relaxed text-foreground">
            &ldquo;{DEMO_JOURNAL.quote}&rdquo;
          </p>
          <p className="mt-1.5 font-mono text-[11px] tabular-nums text-text-muted">
            {DEMO_JOURNAL.day}
          </p>
        </div>
      </div>
    </StepFrame>
  );
}
