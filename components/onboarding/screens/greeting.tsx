"use client";

import { FlowCta } from "../chrome";
import { useFlow } from "../flow-context";
import { WelcomeStage, type WelcomeEffect } from "../welcome-effects";

/**
 * The greeting — "Welcome, <name>" — closing the housekeeping run and HANDING
 * INTO the goals questions (Adrian, 2026-08-05).
 *
 * It is the first moment the flow uses something the user gave it, which is
 * what makes asking for a name up front worth doing at all.
 *
 * ## Its last line points forward, deliberately
 *
 * "Let's see if Trackd is for you" was rejected: it invites a verdict on us at
 * the exact moment we want them talking about themselves, and it frames the
 * next two screens as a test they might fail. The line here says what happens
 * next and why it is worth answering — the two intent screens immediately
 * following are the ones that feed the whole rest of the flow, right through to
 * what the celebrate screen answers back.
 *
 * ## The effect is a constant, on purpose
 *
 * Four candidates live in `welcome-effects.tsx` and all four are reviewable at
 * `/onboarding/welcome-effects`. Swapping the shipped one is this line and
 * nothing else; once Adrian picks, the other three and the harness come out.
 */
const EFFECT: WelcomeEffect = "assemble";

export function GreetingScreen() {
  const { goNext, session } = useFlow();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col px-5 pt-2">
        <div className="flow-scroll-fade flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
          <WelcomeStage
            effect={EFFECT}
            name={session.name}
            sub="Let's learn a bit more, so Trackd can be built around what you actually run."
          />
        </div>

        <footer className="shrink-0 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <FlowCta onClick={goNext}>Let&apos;s go</FlowCta>
        </footer>
      </div>
    </div>
  );
}
