"use client";

import { TRIAL_DAYS } from "@/lib/onboarding/pricing";

import { FlowCta, StepFrame } from "../chrome";
import { Confetti } from "../confetti";
import { useFlow } from "../flow-context";
import { Mascot } from "../mascot";

/**
 * Screen 11 — Welcome.
 *
 * Greets by the name they typed at housekeeping, which is the payoff for
 * asking up front: they set this up before the demo, and now it knows them.
 * `accountName` (from auth, once that is wired) wins if it is there, so the
 * real Google name takes over without this screen changing.
 *
 * The profile photo used to be a screen of its own (spec screen 12) and then a
 * control on this one. Both are gone: it is captured at housekeeping now, so
 * asking again here would be asking twice for the same thing.
 */
export function WelcomeScreen() {
  const { goNext, accountName, session } = useFlow();
  const name = accountName ?? session.name;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Confetti />

      <StepFrame
        center
        title={name ? `You're in, ${name}.` : "You're in."}
        sub={`${TRIAL_DAYS} days on us. Let's finish setting you up.`}
        footer={<FlowCta onClick={goNext}>Continue</FlowCta>}
      >
        <div className="flex items-center justify-center">
          <Mascot pose="happy" size={190} />
        </div>
      </StepFrame>
    </div>
  );
}
