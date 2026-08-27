"use client";

import Image from "next/image";
import Link from "next/link";

import { FLOW_EMPHASIS } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { FlowCta, FlowSub, FlowTitle, ScrollPort } from "../chrome";
import { HeroCards } from "../hero-cards";
import { useFlow } from "../flow-context";

/**
 * Screen 0 — Hook (Spec 3-01 §9).
 *
 * The value prop, and the first thing a stranger touches. No account, no wall,
 * nothing asked for.
 *
 * ## What this replaced, and why (Adrian, 2026-08-27)
 *
 * It was a drawn phone containing a draggable wipe between a screenshot of the
 * Notes app and a screenshot of the dashboard, with two annotation cards
 * hanging off opposite corners. It was carefully built and it did not work, for
 * reasons worth keeping so nobody rebuilds it:
 *
 *   - **The comparison had nothing to compare.** Both captures are near-black
 *     with white text. The whole rhetorical job of the wipe was "look at the
 *     difference", and the difference was a slightly nicer typeface.
 *   - **Nothing was legible.** The frame was height-driven and ~177px wide on a
 *     390 viewport, which put body copy at about 4px.
 *   - **It needed a fake light to exist.** A near-black device on a near-black
 *     canvas required a radial "pool of light" underneath just to separate —
 *     which is a symptom, not a fix.
 *   - **It asked for labour first.** "Slide to see the difference" is a drag
 *     gesture demanded before the screen has given a single reason to care.
 *   - **It led with the competitor.** The old headline was "Stop running your
 *     protocol out of a Notes app", which makes the first impression about a
 *     text file and about the reader's own failure.
 *
 * `notes-compare.tsx` and `device-frame.tsx` were deleted with it; they had no
 * other callers. So was `public/onboarding/notes-app.png` — which, as a side
 * effect rather than a reason, takes the named-compound screenshot off the one
 * surface that sits BEFORE the age gate.
 *
 * ## What it is now
 *
 * Four drawn cards — dose, stock, sites, progress — at full size, landing one
 * after another. See `hero-cards.tsx` for why they are drawn rather than
 * captured. The headline is forward-facing and names what you get rather than
 * what you are doing wrong.
 *
 * The backdrop slot is still here and still empty: Adrian wants a gym-floor
 * photo behind this screen, settling out of a slight overscale on entry. Drop a
 * file at `public/onboarding/hook-backdrop.jpg` and set HOOK_BACKDROP to its
 * path. Until then the screen renders on the plain canvas, which is the safe
 * default rather than a broken image.
 */
const HOOK_BACKDROP: string | null = null;

export function HookScreen() {
  const { goNext } = useFlow();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {HOOK_BACKDROP ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <Image
            src={HOOK_BACKDROP}
            alt=""
            fill
            priority
            sizes="100vw"
            className="animate-flow-hero object-cover opacity-30"
          />
          {/* The canvas has to win under the type, or the headline sits on
              texture and stops being legible. */}
          <div className="absolute inset-0 bg-gradient-to-b from-bg-base/70 via-bg-base/85 to-bg-base" />
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col px-5 pt-2">
        <ScrollPort>
          {/* The cards and the headline are ONE centred block. Centring the
              cards alone left a void between them and the type, and pushed the
              headline down the screen (Adrian, 2026-08-27: "move the whole
              bottom bit ... a lot more up"). */}
          {/* BOTTOM-WEIGHTED, not centred (Adrian, 2026-08-27: "bring all of
              the title text ... way back down ... too much negative space
              between the subtitle and the buttons").

              Centring split the slack evenly above and below the block, which
              on a tall handset left ~170px of dead canvas between the subtitle
              and the CTA. `justify-end` gives all of it to the top, so the
              type sits just above the button it belongs to and the breathing
              room lands under the wordmark where it reads as air rather than
              as a hole.

              `pb-12` is not decoration: `ScrollPort` fades its bottom 44px with
              a mask, so type flush to the end of the port renders half
              dissolved. Measured at `justify-end` with no padding, the
              subtitle's second line sat inside the fade AND against the button.
              48px clears the mask and leaves the gap the button needs. */}
          <div className="flex w-full flex-1 flex-col justify-end gap-2.5 pb-12 [@media(min-height:760px)]:gap-[30px]">
            <HeroCards />

            <div className="shrink-0 space-y-2 [@media(min-height:760px)]:space-y-3">
              <FlowTitle>
                Take your protocol out of your{" "}
                {/* The thing being replaced carries the weight of the sentence. */}
                <em className={cn(FLOW_EMPHASIS, "not-italic")}>notes app</em>.
              </FlowTitle>
              <FlowSub>
                Everything you&apos;re running, in one place you&apos;ll actually open.
              </FlowSub>
            </div>
          </div>
        </ScrollPort>

        {/* ⚠️ THE CTA SITS WHERE EVERY OTHER SCREEN'S DOES, and it was briefly
            lifted ~62px off the safe area on Adrian's request before he saw it
            on a handset and asked for it back (2026-08-27: "I actually want you
            to put it back to how it originally was ... bring the button down to
            where it always is on all the other ones"). It read fine on a laptop
            and wrong on a phone, which is the only place this flow runs. The
            standard inset is the house rule, and this screen is not special. */}
        <footer className="shrink-0 space-y-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <FlowCta onClick={goNext}>Begin</FlowCta>
          <p className="text-center text-[0.7rem] leading-relaxed text-text-subtle">
            Paid plan. 18+ only.{" "}
            <Link
              href="/terms"
              className="text-text-muted underline-offset-2 hover:text-foreground"
            >
              Terms
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
