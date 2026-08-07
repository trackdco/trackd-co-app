"use client";

import Image from "next/image";

import { TRIAL_DAYS } from "@/lib/onboarding/pricing";
import { FLOW_EMPHASIS, FLOW_TITLE } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { FlowCta, ScrollPort } from "../chrome";
import { DeviceFrame } from "../device-frame";
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

/** The screenshot behind the figure. Recapture with the others. */
const APP_SHOT = "/onboarding/app-home.png";

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

            {/* THE PHONE IS THE HERO. It is the only thing on this screen that
                shows what is actually being offered, so it takes the room the
                figure used to. */}
            {/* SIZED BY HEIGHT, NOT WIDTH (Adrian, 2026-08-05: "big enough
                that it looks nice, but not so big I have to scroll to see the
                whole phone").
                A `max-w` alone cannot promise that: how tall the phone ends up
                is width x aspect ratio, and on a short handset that overruns the
                space between the headline and the button. The screen area is
                capped against the VIEWPORT instead — `100svh` minus the fixed
                furniture above and below it — so the phone is as large as will
                fit and no larger, on every handset rather than the one it was
                eyeballed on. `svh`, never `dvh`, for the reason in
                `globals.css`: `dvh` moves as Safari's bar comes and goes. */}
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <DeviceFrame className="max-w-[15.5rem]">
                {/* EXPLICIT WIDTH/HEIGHT, NOT `fill` (2026-08-05).
                    Adrian saw the bezel, the status bar and the home indicator
                    with nothing between them — "a long rounded rectangle, it
                    doesn't go down". Measured first: the asset serves 200, the
                    optimiser serves 200, and `aspect-ratio: 390 / 660` IS in
                    the built stylesheet, so neither the image nor Tailwind was
                    at fault. What the broken cases had in common was `fill`,
                    which needs a positioned ancestor with a resolved height
                    before it can paint anything at all — and the one image
                    construct in this flow that has always worked (`Mascot`)
                    uses explicit dimensions. So does this now. The height comes
                    from the image itself, which cannot collapse. */}
                <div
                  className="relative w-full overflow-hidden"
                  style={{ maxHeight: "min(24rem, calc(100svh - 24rem))" }}
                >
                  <Image
                    src={APP_SHOT}
                    alt=""
                    width={1170}
                    height={2280}
                    sizes="320px"
                    priority
                    className="h-auto w-full object-cover object-top"
                  />
                  {/* Sits the shot into the canvas rather than letting a bright
                      rectangle punch out of it. */}
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-t from-bg-base/70 via-transparent to-transparent"
                  />
                </div>
              </DeviceFrame>
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
