import "server-only";

import { formatAccessDate } from "./manage";
import type { SaveOfferKind } from "./manage";
import {
  OFFER_SHOWN_KEY,
  OFFER_CLAIMED_KEY,
  offerStillOpen,
  offerWindowFor,
  periodIsUnpaid,
  primaryOfferSubscription,
} from "./saveOffer";
import { stripe } from "./stripe";

/**
 * ⚠️ THE SAVE OFFER SURVIVES AN INTERRUPTED SESSION (Group E).
 *
 * ## The defect, and it is ordinary behaviour rather than an edge case
 *
 * The offer burns on being SHOWN, not on being taken — deliberately, and that
 * ruling stands. So: the dialog renders, `trackd_save_offer_shown_at` is written,
 * and the person closes the tab, or their phone dies, or a call comes in. They
 * come back to a bare Resume control with the free week already spent, **never
 * having seen it**.
 *
 * `openOfferStore.ts` already remembers a DISMISSED offer, and it cannot help
 * here: it uses `sessionStorage`, which dies with the tab. That is the right
 * lifetime for a ten-minute window and the right isolation for a shared browser,
 * and it is exactly what closing the tab destroys.
 *
 * ## ⚠️ IT GRANTS NOTHING, AND IT IS THE SAME OFFER RATHER THAN A NEW ONE
 *
 * Same once-ever rule: `SHOWN_KEY` is not rewritten, so the marker keeps its
 * original instant and the countdown carries on from when the offer was FIRST put
 * on screen. Nobody buys a longer window by reloading. Past the window this
 * returns null and `grantExtraTime` still answers `expired` to anything that
 * reaches it anyway — which is the half that actually enforces it, since a client
 * can say whatever it likes.
 *
 * ## The four refusals, in the order they are cheapest to make
 *
 *   already claimed      they took it; there is nothing to restore
 *   never shown          nothing was ever offered
 *   past the ten minutes gone, exactly as it is today
 *   not cancelled        `grantExtraTime` refuses `not-cancelled`, so restoring
 *                        the dialog would be offering a button the server would
 *                        turn down. This is the (a)/(b) hole a cold review found:
 *                        cancel, un-cancel, then claim.
 *   unpaid period        D70's cohort is refused the offer outright, and a
 *                        restore must not be a way back to one they were never
 *                        shown.
 */

export interface RestorableOffer {
  kind: SaveOfferKind;
  /** The ORIGINAL instant, so the countdown does not restart. */
  shownAt: string;
  noun: "week" | "month";
  /** Formatted server-side in the user's stored zone, like every other date here. */
  chargeOn: string;
  /** F2: the free time starts at the current period end, not today. */
  startsOn: string;
}

/**
 * The offer this customer is still inside, or null.
 *
 * ⚠️ EVERY PATH RETURNS NULL RATHER THAN THROWING. `/billing` renders for people
 * whose subscription is in every imaginable state, and a retention offer that
 * could take the billing screen down would be the worst possible trade.
 */
export async function openOfferFor(
  customerId: string,
  tz: string,
): Promise<RestorableOffer | null> {
  try {
    const client = stripe();
    const customer = await client.customers.retrieve(customerId);
    if (customer.deleted) return null;

    // Taken. Nothing to restore, and `grantExtraTime` would answer already-claimed.
    if (customer.metadata?.[OFFER_CLAIMED_KEY]) return null;

    const shownAt = customer.metadata?.[OFFER_SHOWN_KEY];
    if (!shownAt) return null;
    /**
     * ⚠️ THE SAME WINDOW FUNCTION THE CLAIM IS CHECKED AGAINST, not a second
     * comparison. `grantExtraTime` calls `offerStillOpen(shownAt)` with the same
     * default clock, so a dialog this restores is one the server will still honour
     * and a dialog it withholds is one the server would refuse.
     */
    if (!offerStillOpen(shownAt)) return null;

    const primary = await primaryOfferSubscription(customerId);
    if (!primary) return null;

    /**
     * ⚠️ THEY HAVE TO STILL BE CANCELLED. `grantExtraTime` answers
     * `not-cancelled`, so without this the restored dialog is a button the server
     * turns down — and a cold review found the two ways round the flags alone:
     * cancel, take the un-cancel, then claim; or cancel, let it die, subscribe
     * again and claim on the new one.
     */
    if (!primary.cancel_at_period_end) return null;

    /** D70's cohort was never shown it, and a restore is not a way in. */
    if (periodIsUnpaid(primary)) return null;

    const window = offerWindowFor(primary, tz);
    /** No window, no offer — the same rule `offerAfterCancel` applies at first show. */
    if (!window) return null;

    return {
      kind: (primary.status === "trialing" ? "trial" : "paid") satisfies SaveOfferKind,
      shownAt,
      noun: window.noun,
      chargeOn: window.chargeOn,
      startsOn: window.startsOn,
    };
  } catch (err) {
    console.error(
      `[billing] could not restore the open save offer for ${customerId}:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/** Re-exported so a caller needing to format one more date has the same formatter. */
export { formatAccessDate };
