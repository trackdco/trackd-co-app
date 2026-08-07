"use client";

import { TRIAL_DAYS } from "@/lib/onboarding/pricing";

import { FlowCta, FlowSub } from "../chrome";
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
        <div className="flow-scroll-fade flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
          <div className="flex w-full flex-1 flex-col items-center justify-center gap-6">
            {/* Nudged DOWN off the top of the block (Adrian, 2026-08-01). Kyle's
                render carries transparent padding at the top, so centring the
                group by its box left him sitting higher than he looks like he
                should. `mt-6` moves the drawing, not the layout. */}
            <Mascot pose="flex" size={280} className="mt-6 shrink-0" />

            <div className="shrink-0 space-y-3 text-center">
            {/* A 40px headline with a user-supplied name in it. The flow
                clips overflow, so without this a long name is silently cut in
                half on the one screen whose job is showing we know who they
                are. Same idiom ui-context prescribes for a pathological
                figure. */}
            <h1
              className={cn(
                FLOW_DISPLAY,
                "text-balance [overflow-wrap:anywhere]",
              )}
            >
              {name ? `You're in, ${name}!` : "You're in!"}
            </h1>
              <FlowSub className="mx-auto max-w-[20rem]">
                {TRIAL_DAYS}{" "}days on us. Let&apos;s finish setting you up.
              </FlowSub>
            </div>
          </div>
        </div>

        <footer className="shrink-0 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <FlowCta onClick={goNext}>Continue</FlowCta>
        </footer>
      </div>
    </div>
  );
}
