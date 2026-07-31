"use client";

import Image from "next/image";

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
 * ## The signatures
 *
 * Adrian wants his and Angus's real signatures here, in amber. That is why this
 * loads no handwriting font: the spec asks for Caveat, `ui-context.md` ships
 * exactly two faces, and a font is a poor imitation of a signature anyway. A
 * real signature is an ASSET, like the wordmark already is.
 *
 * ART NOT WIRED YET. Until the files exist the slot renders the names at
 * signature scale in amber, so the layout is final and nothing looks broken:
 *
 *     public/onboarding/signature-angus.svg
 *     public/onboarding/signature-adrian.svg
 *
 * then flip the entries in `SIGNATURES` from null. Use `fill="currentColor"`
 * and no hardcoded colour, so the amber comes from the token.
 */

const SIGNATURES: { name: string; src: string | null }[] = [
  { name: "Angus", src: null },
  { name: "Adrian", src: null },
];

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

          <div className="pt-2">
            <p className={cn(PARAGRAPH, "mb-2")}>Best,</p>

            {/* The signatures go in this gap. Space is RESERVED for them so
                the block below does not jump when the art lands. */}
            <div className="flex min-h-[4.5rem] items-end gap-8">
              {SIGNATURES.map((sig) =>
                sig.src ? (
                  <Image
                    key={sig.name}
                    src={sig.src}
                    alt={sig.name}
                    width={160}
                    height={64}
                    className="h-14 w-auto text-accent-amber"
                  />
                ) : null,
              )}
            </div>

            {/* Same tracked-uppercase treatment as the line below it, one notch
                bigger, in white (Adrian, 2026-08-01). */}
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
