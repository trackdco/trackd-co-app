import "server-only";

import type Stripe from "stripe";

/**
 * ⚠️ EVERY LIST OF A CUSTOMER'S SUBSCRIPTIONS GOES THROUGH HERE.
 *
 * ## The defect this exists to make unrepeatable
 *
 * `stripe.subscriptions.list({ limit: 100 })` returns ONE page, newest first, and
 * says nothing about it. There is no error, no warning, and `has_more` is simply
 * not read. So a customer with more than a hundred subscription objects gets a
 * silently truncated answer, and **the truncation always hides the OLDEST
 * subscriptions** — which is precisely where a long-lived yearly plan lives.
 *
 * Driven by a cold review: one live trial behind a hundred dead objects. The
 * screen offered the cancel control (it reads the mirror, which was right), the
 * action answered "There's no active subscription on this account", and Stripe
 * carried on billing. There was no route out from inside the app.
 *
 * Four call sites asked Stripe this question and only one of them was correct.
 * The rule is now the function rather than a comment repeated four times:
 *
 *   - **page to the cap**, never one page;
 *   - **ask for one MORE than the cap**, so overflow is detectable rather than
 *     indistinguishable from a full page;
 *   - **throw rather than answer short.** Every caller is deciding something
 *     that costs money — what to cancel, what floor to protect an entitlement
 *     at, which subscription an offer's date is computed from — and a short list
 *     is a confident wrong answer in all three.
 *
 * ## Why throwing is the safe direction here specifically
 *
 * A caller that throws surfaces an error the user can retry. A caller handed a
 * truncated list cancels some subscriptions and reports success, or sets an
 * entitlement floor below what somebody paid for, and nothing anywhere reports
 * a fault. Silence is the failure mode this project keeps paying for.
 *
 * ## The one place that deliberately does NOT use this
 *
 * `sync.ts`'s invoice sweep reads one page on a recorded trade toward REVOKING
 * rather than granting, where a short list errs toward taking access away and is
 * therefore safe in the direction that matters. It is left alone deliberately.
 */
export const SUBSCRIPTION_PAGE_CAP = 1000;

export async function listAllSubscriptions(
  client: Stripe,
  customerId: string,
  params: { expand?: string[] } = {},
): Promise<Stripe.Subscription[]> {
  const all = await client.subscriptions
    .list({
      customer: customerId,
      // `status: "all"` then filtered by the caller, rather than one request per
      // status: Stripe's list endpoint takes a single status, and asking for each
      // separately is several round trips that can disagree with each other.
      status: "all",
      limit: 100,
      ...(params.expand ? { expand: params.expand } : {}),
    })
    // ⚠️ CAP + 1. Asking for exactly the cap makes "there are exactly 1000" and
    // "there are more than 1000" the same observation.
    .autoPagingToArray({ limit: SUBSCRIPTION_PAGE_CAP + 1 });

  if (all.length > SUBSCRIPTION_PAGE_CAP) {
    throw new Error(
      `subscription history for ${customerId} exceeds ${SUBSCRIPTION_PAGE_CAP}; refusing to answer from a truncated list`,
    );
  }
  return all;
}
