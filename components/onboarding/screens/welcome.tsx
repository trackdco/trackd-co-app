"use client";

import { TRIAL_DAYS } from "@/lib/onboarding/pricing";
import { firstNameOf } from "@/lib/profile/name";

import { FlowCta, FlowSub, ScrollPort } from "../chrome";
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
  const { goNext, accountName, session, eligibility } = useFlow();
  /**
   * The same server answer the checkout screen and the paywall read. Undefined
   * only where there is no server behind the flow (the preview harness), where
   * the generous default stands as it does everywhere else.
   */
  const trial = eligibility?.eligible ?? true;
  /**
   * ⚠️ A COMP IS CONGRATULATED WITH NOTHING ABOUT FREE DAYS (D77).
   *
   * A free-for-life comp reads as eligible on purpose — see `TrialEligibility.comp`
   * — so `trial` alone was true for them and this screen offered "7 days on us."
   * to somebody who already has the app for nothing and whose next tap is
   * refused. The server decides it; this only reads the answer.
   */
  const comp = eligibility?.comp ?? false;
  /**
   * ONE TOKEN, for the same reason Home's greeting is (2026-09-03). "You're in,
   * Adrian Schimizzi!" is the bug `profiles.display_name` was added to stop, and
   * this screen is the first place the claimed name is ever spoken back — the
   * onboarding field says "First name" but a placeholder is not a constraint.
   *
   * `accountName` is what the claim read back off `signup_intake`, which stores
   * the WHOLE string on purpose (it is the record of the answer), so the slice
   * has to happen on the way out here rather than being assumed upstream.
   */
  const name = firstNameOf(accountName) ?? firstNameOf(session.name);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Confetti />

      {/* Kyle leads and the greeting sits under him (Adrian, 2026-08-01), so
          the screen reads as him welcoming you rather than as a titled page
          with a picture on it. Everything is centred as one block. */}
      <div className="flex min-h-0 flex-1 flex-col px-5 pt-2">
        <ScrollPort>
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
            {/* ⚠️ NO KYLE HERE, AND HE WAS BRIEFLY ADDED IN ERROR.
                Adrian asked for Kyle on the going-paid / free-for-life NOTICE;
                putting him on all three welcome screens was over-reach and he
                asked for it back: "the small ones at the bottom, which I said to
                add before, I want you to take back." Kyle appears on the two
                notices and nowhere else in this flow. */}
            <h1
              className={cn(
                FLOW_DISPLAY,
                "text-balance [overflow-wrap:anywhere]",
              )}
            >
              {name ? `You're in, ${name}!` : "You're in!"}
            </h1>
              {/* ⚠️ THE TRIAL HALF IS WITHHELD, NOT REWORDED (Adrian, 2026-08-15).
                  A cold review found this line unconditional, so a returning
                  customer or a post-grace beta user read "7 days on us."
                  SECONDS AFTER BEING CHARGED $69.99, and a mid-grace user read
                  7 when they had a fortnight. It is newly false because of the
                  billing triple: before it, every cohort really did get seven
                  days. The second sentence is true for everybody and stays.

                  D77 added the comp to the same withhold "for the same reason and
                  by the same means: the line is REMOVED, not replaced. No spec
                  names a comp welcome state, so no copy was written for one."

                  ⚠️ ONE HAS BEEN WRITTEN NOW (Adrian, 2026-08-25). D77's withhold
                  was correct while there was nothing true to say; it was never a
                  decision that a comp should be told nothing. On the copy review
                  Adrian supplied the line: *"instead of saying seven days on us,
                  it says 'You've been given complimentary access', and then it
                  lines up and says 'Let's finish setting you up.'"*

                  So the comp is no longer a withhold, it is its own sentence.
                  The returning/post-grace cohort STILL withholds, unchanged —
                  they have no free time and there is still nothing true to say. */}
              <FlowSub className="mx-auto max-w-[20rem] text-pretty">
                {comp ? (
                  <>You&apos;ve been given complimentary access.{" "}</>
                ) : trial ? (
                  <>
                    {TRIAL_DAYS}{" "}days on us.{" "}
                  </>
                ) : null}
                Let&apos;s finish setting you up.
              </FlowSub>
            </div>
          </div>
        </ScrollPort>

        <footer className="shrink-0 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <FlowCta onClick={goNext}>Continue</FlowCta>
        </footer>
      </div>
    </div>
  );
}
