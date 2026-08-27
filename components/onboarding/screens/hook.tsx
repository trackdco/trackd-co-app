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
              48px clears the mask; 72px is where Adrian settled it, which also
              gives the button room to breathe (2026-08-27: "move the text so
              that there's a bit more space between the button and the text").

              The gap to the cards is the other half of the same note — widening
              it separates the type from the widgets AND lifts the widgets, both
              of which he asked for, because the block is anchored to the
              bottom.

              ⚠️ `justify-between`, NOT `justify-end`. Anchored only to the
              bottom, every extra pixel of a taller handset piled up ABOVE the
              cards — measured, the first card started at 75px on a 390x844 and
              163px on a 430x932, so the widgets sank as the phone got bigger,
              which is why they kept reading as too low on Adrian's own device
              however far the block was pushed. Split to both ends they pin to
              the top of the port at every size and the slack falls between the
              cards and the title, which is the other gap he asked to widen.
              `gap-16` becomes a FLOOR rather than the exact spacing.

              FINAL SHAPE (Adrian, 2026-08-27, from a screenshot on his own
              handset): the cards stay pinned to the top and the type block
              CENTRES in whatever they leave — "bring the text halfway between
              the button and the widget so the spacing is all even". Pinned to
              the bottom instead, Safari's own toolbar ate the padding and the
              subtitle ended up against the button on a real phone, which no
              simulated viewport showed. Centring is self-correcting: whatever
              the browser chrome takes comes off both gaps equally. */}
          <div className="flex w-full flex-1 flex-col">
            {/* ⚠️ THREE WEIGHTED SPACERS, NOT TWO EQUAL HALVES.
                
                The obvious version — cards centred in one `flex-1` half, type
                in the other — silently does nothing. `flex-1` is `flex: 1 1 0%`,
                so both halves bid for an equal share; the cards are ~370px and
                an equal share of this port is ~339, so their box clamps to
                content height, has no room left to centre within, and ALL the
                free space lands in the type's half. Measured: the gap above the
                cards stayed at 26px on every handset from a 375 to a 430 while
                the gap below them grew to 134.
                
                Grow-only spacers put the ratio where it can be read and
                changed, and it moved three times before it settled. 1 : 1 : 2
                dropped the cards halfway toward the type but left the gap under
                the type twice the one above it; 1 : 1 : 1 made every gap equal,
                which is what Adrian drew and which still read too high on a
                handset because the cards start close under the wordmark.

                It is 4 : 1 : 1 — "anchored low" (chosen from five real
                screenshots of this screen at 402x700), then nudged one step
                further down (Adrian, 2026-08-27). Two thirds of the slack goes
                above the cards, so the cards and the type sit low as ONE group
                with the button beneath them, rather than the content being
                spread down the whole screen.

                Note what a bigger first number costs: the slack is fixed, so
                every pixel added above the cards comes off the two gaps below
                them. Past about 5 : 1 : 1 the subtitle starts crowding the
                button on a short handset.
                
                `basis-0` matters: on a handset too short to hold everything the
                spacers collapse to nothing and the content simply stacks and
                scrolls, rather than three empty boxes competing with it.

                The header row's padding and this screen's own `pt-2` sit ABOVE
                this container, so they are not slack the spacers can divide —
                the gap you see above the cards is always ~26px larger than the
                first spacer's share. That used to be cancelled with a negative
                margin here; it is gone, because a negative margin on a spacer
                that can collapse to zero is a way to push content off the top
                of the screen, and the ratio below simply accounts for it
                instead. */}
            <span aria-hidden className="flex-[1_0_0]" />

            <HeroCards />

            <span aria-hidden className="flex-[1_0_0]" />

            <div className="hero-type flex shrink-0 flex-col">
              <FlowTitle>
                Take your protocol out of your{" "}
                {/* The thing being replaced carries the weight of the sentence. */}
                <em className={cn(FLOW_EMPHASIS, "not-italic")}>notes app</em>.
              </FlowTitle>
              <FlowSub>
                Everything you&apos;re running, in one place you&apos;ll actually open.
              </FlowSub>
            </div>

            <span aria-hidden className="flex-[1_0_0]" />
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
            Paid plan. 18+ only.
          </p>

          {/* ⚠️ THESE FOUR LINKS ARE A STATUTORY REQUIREMENT, NOT NAVIGATION.
           *
           * Washington's My Health My Data Act requires the consumer health data
           * privacy policy to be published under THAT NAME and reachable without
           * logging in. They used to live on `app/_components/first-run.tsx`,
           * which was the logged-out homepage; `/` redirects here now, so this
           * screen is the homepage for that purpose and inherits the duty with
           * the traffic. `lib/legal/verbatimQuotes.test.ts` reads this file and
           * fails if any of the four goes missing — it caught exactly this when
           * FirstRun was deleted.
           *
           * The full name is pinned deliberately. "Health Data" or "Your data"
           * reads better and fails the check the statute actually describes;
           * this is the kind of string a tidy-up shortens.
           *
           * `whitespace-nowrap` on the LINK, not the row: the statutory name may
           * wrap to its own line, but it must never be split or clipped. */}
          <p className="text-center text-[0.6rem] leading-relaxed text-text-subtle">
            {[
              { href: "/terms", label: "Terms" },
              { href: "/privacy", label: "Privacy" },
              { href: "/medical-disclaimer", label: "Disclaimer" },
              { href: "/consumer-health-data", label: "Consumer Health Data Privacy Policy" },
            ].map((doc, i) => (
              <span key={doc.href}>
                {i > 0 ? " · " : null}
                <Link
                  href={doc.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="whitespace-nowrap underline underline-offset-2 transition-colors hover:text-text-muted"
                >
                  {doc.label}
                </Link>
              </span>
            ))}
          </p>
        </footer>
      </div>
    </div>
  );
}
