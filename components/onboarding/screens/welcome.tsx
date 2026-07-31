"use client";

import { TRIAL_DAYS } from "@/lib/onboarding/pricing";

import { FlowCta } from "../chrome";
import { FLOW_DISPLAY } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";
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

      {/* Kyle leads and the greeting sits under him (Adrian, 2026-08-01), so
          the screen reads as him welcoming you rather than as a titled page
          with a picture on it. Everything is centred as one block. */}
      <div className="flex min-h-0 flex-1 flex-col px-5 pt-2">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6">
          <Mascot pose="flex" size={280} />

          <div className="space-y-3 text-center">
            <h1 className={cn(FLOW_DISPLAY, "text-balance")}>
              {name ? `You're in, ${name}!` : "You're in!"}
            </h1>
            <p className="mx-auto max-w-[20rem] text-pretty text-[0.95rem] leading-relaxed text-text-muted">
              {TRIAL_DAYS}{" "}days on us. Let&apos;s finish setting you up.
            </p>
          </div>
        </div>

        <footer className="shrink-0 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <FlowCta onClick={goNext}>Continue</FlowCta>
        </footer>
      </div>
    </div>
  );
}
