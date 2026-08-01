"use client";

import { CARD_EYEBROW } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { FlowCta, StepFrame } from "../chrome";
import { useFlow } from "../flow-context";

/**
 * Screen 16 — the founder letter, then the hand-off.
 *
 * **The copy is Adrian and Angus's, verbatim** (given 2026-08-01). It is not
 * mine to tighten, so it has been set rather than edited. One thing to know:
 * it opens with an exclamation mark, which `ui-context.md` → Voice bans
 * outright. That ban is about the app's own system copy, where a chirpy tone
 * undermines an instrument; a signed letter from two founders is the one place
 * on the surface where a human is allowed to sound pleased. Flagged for Adrian
 * rather than silently overruled either way.
 *
 * ## No signatures
 *
 * Their real signatures were built here and then removed at Adrian's call
 * (2026-08-01, same day): amber inline SVG, writing themselves on when scrolled
 * to. He looked at them and did not want them. Recorded so nobody proposes it
 * again as a fresh idea, and so the reason is not mistaken for a technical one.
 *
 * The sign-off carries the weight on its own now, which is why the spacing
 * below is deliberate rather than default: a letter that simply stops after
 * "Best," reads as unfinished, so the closing block gets a beat of its own and
 * steps down white → muted.
 */

const PARAGRAPH =
  "text-[1.0625rem] font-light leading-[1.7] tracking-[-0.01em] text-foreground";

export function LetterScreen() {
  const { finish } = useFlow();

  return (
    <StepFrame footer={<FlowCta onClick={finish}>Enter Trackd</FlowCta>}>
      <div className="flex flex-1 flex-col justify-center">
        <div className="space-y-4">
          <p className={cn(CARD_EYEBROW, "text-accent-amber")}>
            To Trackd Co&apos;s newest user
          </p>

          <p className={PARAGRAPH}>
            Thank you for choosing Trackd Co! We built Trackd with one goal: to
            get your protocol out of a messy notes app and into something
            simple, effective, and built around how you <em>actually</em> track.
          </p>

          <p className={PARAGRAPH}>
            Log compounds, calculate reconstitution, track when stock runs out,
            manage cycle rotations, and monitor your progress through it all.
          </p>

          <p className={PARAGRAPH}>
            Our goal is to build the best compound tracker in the world, and
            you&apos;re actively helping us get there.
          </p>

          <p className={PARAGRAPH}>
            We&apos;re still early. Your feedback matters more than you know.
            We&apos;re just getting started, and we&apos;re glad to have you
            with us.
          </p>

          {/* The sign-off. A wider gap above it than between the paragraphs, so
              it reads as the end of the letter rather than a fifth paragraph,
              and a hairline to close the block off — without signatures there
              is nothing else marking where the letter finishes. */}
          <div className="border-t-[0.5px] border-border-default pt-5">
            <p className={cn(PARAGRAPH, "mb-3")}>Best,</p>

            <p className="text-[13px] font-sans uppercase tracking-[0.18em] text-foreground">
              Angus &amp; Adrian
            </p>
            <p className={cn(CARD_EYEBROW, "mt-1.5")}>Founders, Trackd Co</p>
          </div>
        </div>
      </div>
    </StepFrame>
  );
}
