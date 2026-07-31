"use client";

import { FlowCta, StepFrame } from "../chrome";
import { useFlow } from "../flow-context";

/**
 * Screen 16 — Founder letter (Spec 3-01 §9), then the hand-off.
 *
 * **Typography deviates from the spec deliberately.** §5 asks for Playfair
 * Display and a Caveat signature; `ui-context.md` retired the display serif
 * outright ("Remove the font load and the utility; no screen may reference
 * it") and the app ships two faces, Geist and Geist Mono. Loading a third and a
 * fourth for one screen would be the drift that rule exists to stop, so the
 * letter is set in Geist Light at a larger size with generous leading, which is
 * how this design system already makes something feel like a display moment.
 *
 * A handwritten signature ASSET (an SVG, like the wordmark) would be on-system
 * and is the right way to get the signature the spec wants. Flagged for Adrian
 * rather than approximated with a font.
 *
 * "Enter Trackd" hands off to the today-dashboard.
 */
export function LetterScreen() {
  const { finish } = useFlow();

  return (
    <StepFrame footer={<FlowCta onClick={finish}>Enter Trackd</FlowCta>}>
      <div className="flex flex-1 flex-col justify-center">
        <div className="space-y-5">
          <p className="text-[1.0625rem] font-light leading-[1.7] tracking-[-0.01em] text-foreground">
            We built Trackd because we were sick of running our own protocols
            out of a spreadsheet and a bad memory. It&apos;s a tool, not a
            coach. The decisions are yours. We just make sure nothing gets lost.
          </p>

          <p className="text-[1.0625rem] font-light leading-[1.7] tracking-[-0.01em] text-foreground">
            Thanks for backing us this early. It means the world.
          </p>

          <div className="pt-2">
            <p className="text-lg font-light tracking-[0.02em] text-foreground">
              Angus &amp; Adrian
            </p>
            <p className="mt-1 text-[10px] font-sans uppercase tracking-[0.18em] text-text-muted">
              Founders, Trackd Co
            </p>
          </div>
        </div>
      </div>
    </StepFrame>
  );
}
