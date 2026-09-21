"use client";

import { fit } from "@/lib/onboarding/fit";
import { TRIAL_DAYS } from "@/lib/onboarding/pricing";
import { FLOW_EMPHASIS, FLOW_TITLE } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { FlowCta, FlowSub, FOOTER_BOTTOM, ScrollPort } from "../chrome";
import { useFlow } from "../flow-context";
import { PhoneVideo } from "../phone-video";

/**
 * The phone's width on this screen: 172px on Adrian's handset, 118px on an
 * iPhone SE in Safari. The recording's box is 2.21 phone widths tall, so that
 * is 380px and 261px, measured to fit between the headline and the offer line
 * at 402x700 and 375x548 with nothing to scroll. It sits at the TOP of its
 * space, close under the subtitle (Adrian, 2026-09-17: "a slight amount of
 * negative space between the subtitle and the phone ... increase the size
 * slightly and move it up"). On a phone taller than his, the spare height is
 * split one part above to two below, so it does not all pool under the phone.
 * See `lib/onboarding/fit.ts`.
 *
 * ⚠️ ON A LAPTOP OR A MONITOR IT GROWS (Adrian, 2026-09-17, on a 27-inch
 * screen: "way too small"). `fit()` only ever shrinks for a short phone, so a
 * 1300px-tall window still got the 172px phone. `--free-phone-lg` is defined
 * from the laptop breakpoint up only (`.free-stage` in `globals.css`), so on a
 * phone it is `0px` and this is exactly the handset figure.
 */
const PHONE_WIDTH = `max(${fit(172, 118)}, var(--free-phone-lg, 0px))`;

/**
 * The free-trial reveal, between the cost argument and the price list (Adrian,
 * 2026-08-05: "we want you to try Trakabl for free ... it should say $0 or no
 * payment needed, and a bit of a screenshot of the UI").
 *
 * ## Why this is its own step and not the top of the paywall
 *
 * The paywall has to do three jobs — remove the risk, show the prices, take the
 * decision — and on one screen the first gets scrolled past on the way to the
 * other two. A screen with a single job cannot be scrolled past. It also gives
 * the flow a proper three-beat shape at the point it matters most: `cost` makes
 * the argument, this removes the risk, `paywall` asks for the answer.
 *
 * ## "No card required" is load-bearing, not decoration
 *
 * A cold reviewer walking the flow as a customer finished it unsure whether he
 * had started a trial at all: "no Apple Pay sheet, no email, no account ... a
 * paywall that promises 'you'll be charged on 12 Aug unless you cancel' while
 * charging nothing reads as broken, not generous." He is right, and the fix is
 * to say it out loud rather than let the silence be read as a fault.
 *
 * **When billing is wired, check this line is still true.** If the provider
 * takes a $0 card authorisation, "No card required" becomes false and has to
 * change with it. It is a promise, not a slogan.
 *
 * Everything derives from `TRIAL_DAYS`, so a change to the trial length moves
 * this screen with the rest.
 */

export function FreeScreen() {
  const { goNext } = useFlow();

  return (
    <div className="free-stage relative flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col px-5 pt-2">
        {/* On a laptop the port reaches 10rem past the column each side and
            pads back in, so the text keeps the column's width while the
            recording's opening, which starts zoomed to 1.3 phone widths either
            side of centre, is not cut by the port's edge. */}
        <ScrollPort className="lg:-mx-40 lg:px-40">
          {/* A small gap: the video's phone sits close under the subtitle
              (Adrian, 2026-09-17). The 40px this used to be was for the
              carousel, whose front phone spilled out of the top of its ring;
              the video's phone stays inside its own box, and the box carries
              ~11px of transparent space above the phone already. */}
          <div
            className="flex w-full flex-1 flex-col justify-start"
            style={{ gap: fit(14, 10), paddingTop: fit(12, 0) }}
          >
            {/* ONE line of type, not three (Adrian, 2026-08-05: "too much
                text"). The eyebrow and the giant $0 both went: the eyebrow said
                the same thing as the line above the button, and a 4.5rem figure
                competed with the phone for the screen when the phone IS the
                message. The offer is stated once, warmly, and then shown. */}
            <header className="shrink-0 space-y-2 text-center">
              <h1 className={cn(FLOW_TITLE, "text-balance")}>
                We want you to have your{" "}
                <em className={FLOW_EMPHASIS}>first week on us</em>.
              </h1>
              {/* Back after being cut for length on 2026-08-05, deliberately
                  short this time (Adrian, 2026-08-27). Confident rather than
                  pleading: the product carries the argument. */}
              <FlowSub>
                We&apos;d rather you try it than take our word for it.
              </FlowSub>
            </header>

            {/* THE APP, PLAYING (Adrian, 2026-09-17). His own recording of the
                app on a phone, transparent round it, replacing the four-phone
                carousel that stood here. It plays once and holds its last
                frame (`phone-video.tsx`).

                The note below is the carousel's, and its argument still holds:
                this screen has to SHOW what the free week contains.

                THE CAROUSEL WAS THE HERO (Adrian, 2026-08-07), replacing a
                single still photo of the Home screen.

                This screen is the one that has to say what the free week
                actually contains, and one frozen screenshot says "there is an
                app" rather than "there is all of this". The ring shows four
                real screens with their features labelled, and it moves, which
                is the difference between being told and being shown. It came
                off the paywall, where it was competing with the prices for a
                decision the user is trying to make.

                No size cap needed here, unlike the still it replaces: the
                carousel is `shrink-0` and fixed-height by construction, so it
                cannot be squeezed to nothing on a short handset the way a
                photo sized by aspect ratio could. */}
            <div className="flex min-h-0 flex-1 flex-col items-center">
              <span aria-hidden className="flex-[1_0_0]" />
              <PhoneVideo
                phoneWidth={PHONE_WIDTH}
                label="A recording of the Trakabl app on an iPhone: the dashboard, a dose being logged, the injection site map and a new stack being built."
              />
              <span aria-hidden className="flex-[2_0_0]" />
            </div>
          </div>
        </ScrollPort>

        <footer
          className="shrink-0 space-y-3"
          style={{ paddingTop: fit(20, 10, 6), paddingBottom: FOOTER_BOTTOM }}
        >
          {/* The terms sit ON the button, not at the top of the screen. This is
              the sentence that removes the risk, and it is read at the moment
              the thumb is over the control — not four inches above it. */}
          <p className="text-center text-[0.9rem] text-foreground">
            {TRIAL_DAYS}{" "}days free.{" "}
            <span className="text-text-muted">$0 required now.</span>
          </p>
          <FlowCta onClick={goNext}>See plans</FlowCta>
        </footer>
      </div>
    </div>
  );
}
