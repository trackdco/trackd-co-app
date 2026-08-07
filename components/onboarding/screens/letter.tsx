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
 * steps down through amber to muted.
 *
 * The names are set in a handwriting face, which is the one place in the whole
 * product that happens. It is doing the job the signatures were there for.
 *
 * ## THE BUTTON IS NOT PINNED HERE, and this is the only screen where that is
 * true (Adrian, 2026-08-05)
 *
 * Everywhere else in the flow the CTA is welded to the bottom of the viewport,
 * because every other screen asks the user to make a decision and the one thing
 * they can do should never be off-screen. This screen asks them to READ
 * something. A button pinned under a letter is a Skip button that does not say
 * Skip: it is on screen from the first word, so the letter becomes optional.
 *
 * So the button sits AFTER the sign-off, in the scroll flow, and you reach it by
 * reaching the end. `StepFrame` renders no footer at all when it is given none,
 * so the bottom safe area is handled by the scroll port instead.
 *
 * Do not "fix" this back by moving it into `footer` — the pinned model is right
 * for the other thirteen screens and wrong for this one, deliberately.
 */

const PARAGRAPH =
  "text-[1.0625rem] font-light leading-[1.7] tracking-[-0.01em] text-foreground";

export function LetterScreen() {
  const { goNext } = useFlow();

  return (
    <StepFrame>
      {/* THE LETTER ITSELF DOES NOT ANIMATE (Adrian, 2026-08-05). A staggered
          paragraph entrance was tried and cut: it made the reader wait to be
          allowed to read, and the only thing on this screen that should be
          moving is the signature. The letter is simply there, and the names
          write themselves on underneath it. */}
      <div className="flex flex-1 flex-col justify-center pt-6">
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

            {/* The one handwritten line in the product (Adrian, 2026-08-01).
                Amber, mixed case, untracked — an uppercase tracked treatment
                would fight the face and read as a label rather than a hand.
                `--font-hand` is loaded in the root layout and referenced HERE
                and nowhere else; see `ui-context.md` for why that is a rule and
                not a habit. */}
            {/* It WRITES ITSELF ON (Adrian, 2026-08-05). The deleted signature
                SVGs had a stroke-dash reveal and this is the same gesture
                without the artwork he rejected — a soft-edged mask sweeping
                left to right over the handwriting face. See `.animate-hand-write`
                in `globals.css` for why it is a mask and not a width. */}
            <p className="animate-hand-write font-[family-name:var(--font-hand)] text-[2rem] leading-none text-accent-amber">
              Angus &amp; Adrian
            </p>
            <p className={cn(CARD_EYEBROW, "mt-2.5")}>Founders, Trackd Co</p>
          </div>

          {/* The way out, at the end of the letter rather than over it. The gap
              above is wider than the letter's own rhythm so the button reads as
              what happens next and not as part of the sign-off.

              IT NO LONGER SAYS "Enter Trackd" (Adrian, 2026-08-07). Install
              moved to the very end of the flow, so this is not the last screen
              any more and that label was a promise the next tap did not keep.
              "Enter Trackd" moved WITH the exit, onto the install screen, so
              the flow still ends on the same words.

              "Last step" (Adrian, 2026-08-07), over an interim "One last
              thing" and then "Almost there". It names WHAT COMES NEXT, and it
              is literally true: install is the final screen, so the tap really
              does open the last step. That is the thing "One last thing" got
              wrong — it claimed the letter itself was the end — and the thing
              "Almost there" ducked by describing a feeling instead.

              Sentence case, like every other CTA in the flow ("Continue",
              "See plans", "Add to home screen"). */}
          <div className="pt-8">
            <FlowCta onClick={goNext}>Last step</FlowCta>
          </div>
        </div>
      </div>
    </StepFrame>
  );
}
