"use client";

import Image from "next/image";

import { CARD_EYEBROW } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { FlowCta, StepFrame } from "../chrome";
import { useFlow } from "../flow-context";

/**
 * Screen 16 — the founder letter, then the hand-off.
 *
 * ## The signatures
 *
 * Adrian wants his and Angus's real signatures here, drawn as though written
 * out, in amber. That is the right call and it is why this does NOT load a
 * handwriting font: the spec asks for Caveat, `ui-context.md` ships exactly two
 * faces and retires everything else, and a font is a poor imitation of a
 * signature anyway. A real signature is an ASSET, like the wordmark already is.
 *
 * ART IS NOT WIRED YET. Until the files exist, the slot renders the names set
 * in Geist Light at signature scale, in amber, at the right size and position,
 * so the layout is final and nothing looks broken. Dropping the files in is the
 * only change needed:
 *
 *     public/onboarding/signature-angus.svg
 *     public/onboarding/signature-adrian.svg
 *
 * then flip the entries in `SIGNATURES` from null to their paths. Use SVGs with
 * `fill="currentColor"` and no hardcoded colour, so the amber comes from the
 * token and a retune never needs new art.
 *
 * ## The letter itself
 *
 * Geist Light at a larger size with generous leading, which is how this design
 * system already makes something feel like a display moment. The names are the
 * one amber beat on the screen.
 */

const SIGNATURES: { name: string; src: string | null }[] = [
  { name: "Angus", src: null },
  { name: "Adrian", src: null },
];

export function LetterScreen() {
  const { finish } = useFlow();

  return (
    <StepFrame footer={<FlowCta onClick={finish}>Enter Trackd</FlowCta>}>
      <div className="flex flex-1 flex-col justify-center">
        <div className="space-y-5">
          <p className={cn(CARD_EYEBROW, "text-center")}>
            A quick word from the founders
          </p>

          <p className="text-[1.0625rem] font-light leading-[1.7] tracking-[-0.01em] text-foreground">
            We built Trackd because we were sick of running our own protocols
            out of a spreadsheet and a bad memory. It&apos;s a tool, not a
            coach. The decisions are yours. We just make sure nothing gets lost.
          </p>

          <p className="text-[1.0625rem] font-light leading-[1.7] tracking-[-0.01em] text-foreground">
            Thanks for backing us this early. It means the world.
          </p>

          <div className="pt-3">
            <div className="flex items-end gap-6">
              {SIGNATURES.map((sig) =>
                sig.src ? (
                  <Image
                    key={sig.name}
                    src={sig.src}
                    alt={sig.name}
                    width={160}
                    height={64}
                    className="h-12 w-auto text-accent-amber"
                  />
                ) : (
                  <span
                    key={sig.name}
                    // The placeholder stands in for the signature at its real
                    // size, so the layout below it is already final.
                    className="text-[1.75rem] font-light leading-none tracking-[0.01em] text-accent-amber"
                  >
                    {sig.name}
                  </span>
                ),
              )}
            </div>

            <p className={cn(CARD_EYEBROW, "mt-4")}>Founders, Trackd Co</p>
          </div>
        </div>
      </div>
    </StepFrame>
  );
}
