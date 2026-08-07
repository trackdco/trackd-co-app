"use client";

import { TRIAL_DAYS } from "@/lib/onboarding/pricing";
import { FLOW_EMPHASIS, FLOW_TITLE } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { AppCarousel } from "../app-carousel";
import { FlowCta, ScrollPort } from "../chrome";
import { useFlow } from "../flow-context";

/**
 * The free-trial reveal, between the cost argument and the price list (Adrian,
 * 2026-08-05: "we want you to try Trackd for free ... it should say $0 or no
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
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col px-5 pt-2">
        <ScrollPort>
          <div className="flex w-full flex-1 flex-col justify-start gap-4 pt-3">
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
            </header>

            {/* THE CAROUSEL IS THE HERO (Adrian, 2026-08-07), replacing a
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
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <AppCarousel />
            </div>
          </div>
        </ScrollPort>

        <footer className="shrink-0 space-y-3 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
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
