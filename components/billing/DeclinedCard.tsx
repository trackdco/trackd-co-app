"use client";

import { useState } from "react";

import { StripeHandoff } from "@/components/billing/StripeHandoff";

/**
 * THE DECLINED CARD — what a `past_due` account sees, and D37 decides all of it.
 *
 * `08-billing-screen.md` §1 names the gap this closes: "a user whose card has
 * just declined has no in-app surface at all — they find out from their bank."
 *
 * ## ⚠️ IT PRESENTS THE STATE AND NEVER DECIDES IT
 *
 * §3.5: three specs touch this and the boundaries are exact. `05` decides when
 * access lapses and writes the entitlement. **This renders what a user sees while
 * past-due.** `12` owns Stripe's retry configuration. Nothing here gates
 * anything, and nothing here writes.
 *
 * §3.9 places it: past-due "is a state of the payment rather than of the plan,
 * and it renders as the declined card ABOVE the plan card rather than replacing
 * any of the three".
 *
 * ## ⚠️ IT NEVER THREATENS DATA
 *
 * §3.5, and it is an invariant rather than a preference: "It says what happens to
 * access and when, and nothing about logs being lost, removed, or at risk,
 * because nothing is." The signed copy below says "goes read only", which is what
 * actually happens, and stops there.
 *
 * ## ⚠️ TWO DATES, TWO SOURCES, AND EACH SENTENCE IS WITHHELD WITHOUT ITS OWN
 *
 * §3.5: "Both dates come from the server and they are different dates. The first
 * is when the charge failed. The second is when access actually ends, which is
 * the end of the last period they paid for plus the grace — **the same value the
 * entitlement holds, not a guess and not the failure date plus a constant.**"
 *
 * So they arrive as two separately-resolved props, and **a sentence whose date is
 * null does not render.** Not reworded, not defaulted, not computed from the
 * other one — withheld. A declined card that invents either date is worse than
 * the gap it fills, and "the failure date plus three days" is the specific wrong
 * answer §3.5 rules out by name.
 *
 * The title and the buttons stand either way: "your payment didn't go through"
 * is true without a date, and the route to fix it is the whole point of the
 * surface.
 *
 * ## ⚠️ THE GRACE ASSUMPTION IS VISIBLE HERE
 *
 * §3.5: the three-day window is written to land inside Stripe's first retry, so a
 * card that works second time is never noticed. Smart Retries publishes no fixed
 * schedule. **If `12`'s measurement finds the first retry lands outside three
 * days, the second sentence is telling a recoverable customer they go read-only
 * before Stripe has finished trying.** That is why the measurement matters and it
 * belongs on this screen's record.
 */

/** ⚠️ SIGNED COPY, §3.5 / D37. Character for character. No em dash. */
const TITLE = "Your payment didn't go through";
const DECLINED_ON = (date: string) =>
  `Your card was declined on ${date}. Update your card details and we'll take it from there.`;
const ACCESS_UNTIL = (date: string) =>
  `Your account stays as it is until ${date}, and goes read only after that until a payment goes through.`;
const DISMISS = "Not now";
const PRIMARY = "Update my card";

export function DeclinedCard({
  declinedOn,
  accessEndsOn,
  accessLive,
}: {
  /** Formatted server-side, from the failed Stripe charge. Null = unknown. */
  declinedOn: string | null;
  /** Formatted server-side, from the entitlement row. Null = unknown. */
  accessEndsOn: string | null;
  /**
   * ⚠️ DOES THIS PERSON STILL HOLD ACCESS? From `entitlements`, the table that
   * decides it — never reconstructed from the date above.
   *
   * `accessEndsOn` includes DEAD rows by design (`entitlementEndDate` must, or
   * the screen over-promises), so a date being present says nothing about whether
   * access survives. Driven on a REVOKED account: the plan card read
   * "Access: Read only" while this card, two rows above it, read "Your account
   * stays as it is until 17 Sept 2026". Both from the same load.
   *
   * False here also covers "we could not read the table", which is correct: a
   * screen that cannot ask must not promise.
   */
  accessLive: boolean;
}) {
  /**
   * ⚠️ "Not now" DISMISSES FOR THIS VIEW ONLY, AND NOTHING IS PERSISTED.
   *
   * §3.5 gives the button and does not say what it does. Component state rather
   * than storage is the conservative reading and follows `03` §3.10's precedent,
   * which forbids persisting its own notice anywhere: a card that stays dismissed
   * would let somebody wave away the one warning they get and walk into read-only
   * having been told once. It comes back on the next load, which is what a state
   * that is still true should do.
   */
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <section className="mt-6">
      {/* Not amber and not destructive. §2: "Do NOT use amber for a button, a tab,
          or a call to action anywhere on this screen." The card is a surface, not
          an alarm, and the state is recoverable by design. */}
      <div className="rounded-2xl border border-border-default bg-bg-surface p-4">
        <h2 className="text-base font-medium text-foreground">{TITLE}</h2>
        {declinedOn ? (
          <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
            {DECLINED_ON(declinedOn)}
          </p>
        ) : null}
        {/**
          * ⚠️ THE PROMISE NEEDS BOTH A DATE AND LIVE ACCESS.
          *
          * "stays as it is until {date}, and goes read only after that" is a
          * statement about the FUTURE. Said to somebody whose access has already
          * gone — lapsed past the grace, or revoked — both halves are false, and
          * it renders directly above a plan card reading "Read only".
          *
          * Withheld rather than reworded: the title and the update-card route are
          * true in every state and stand on their own. Group 3.1 gives this
          * window its own signed sentence; until then it says nothing rather than
          * something false.
          */}
        {accessEndsOn && accessLive ? (
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            {ACCESS_UNTIL(accessEndsOn)}
          </p>
        ) : null}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="min-h-11 flex-1 rounded-2xl border border-border-default px-4 py-3 text-sm text-foreground outline-none transition-colors hover:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring"
          >
            {DISMISS}
          </button>
          {/**
            * D37's primary action, and it goes through the handoff like every
            * other route to Stripe. `StripeHandoff` owns the only
            * `openBillingPortal` call in the app, so this cannot become a second
            * caller that skips the dialog — which is §3.3's warning applied one
            * component further along than it was written for.
            */}
          <StripeHandoff button={{ label: PRIMARY }} />
        </div>
      </div>
    </section>
  );
}
