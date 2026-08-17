import "server-only";

import { stripe } from "./stripe";

/**
 * WHEN THE CARD WAS DECLINED — the first of the declined card's two dates.
 *
 * `08-billing-screen.md` §3.5: "Both dates come from the server and they are
 * different dates. The first is when the charge failed. The second is when access
 * actually ends." §5 names the sources separately: "the failure date from Stripe,
 * the access date from the entitlement".
 *
 * ## ⚠️ WHY THIS ASKS STRIPE AT ALL, ON A SCREEN THAT OTHERWISE NEVER DOES
 *
 * The mirror has no failure column — probed directly, `subscriptions` carries
 * `status`, both period dates, the cancel flag, the price id and `courtesy_until`
 * and nothing else — and §2 forbids this spec from producing a migration. So the
 * failure date has exactly one available source, which is the one §5 names.
 *
 * **This is display, never access.** `architecture.md`'s rule is that no access
 * decision reads a Stripe status; nothing here decides anything. It runs only for
 * a `past_due` account, which is rare, and it is the only Stripe read on the page.
 *
 * ## ⚠️ THE FIELD IS MEASURED, NOT ASSUMED
 *
 * Driven on a test clock (`scratchpad/probe-declined-fields.mjs`), because
 * `Invoice` offers four plausible-looking fields and none of them is the answer:
 *
 *     invoice.status_transitions   finalized_at / paid_at / voided_at only.
 *                                  There is no "failed_at".
 *     invoice.attempted            a boolean.
 *     invoice.attempt_count        a number.
 *     invoice.next_payment_attempt the NEXT retry, which is the future.
 *     charge.created (status=failed)  ← the instant the card was declined.
 *
 * Captured from the real state, a weekly subscription whose renewal failed:
 *
 *     ch_3U5a8u…  status=failed     created=2026-08-17T23:40:38Z  card_declined
 *     ch_3U5a8f…  status=succeeded  created=2026-08-17T23:40:23Z
 *
 * ## ⚠️ AND A TEST-CLOCK TRAP WORTH KNOWING BEFORE IT COSTS A RUN
 *
 * **Charge timestamps do NOT follow a test clock; invoice timestamps do.** In the
 * same captured state the invoice read `2026-08-24` (simulated) while the failed
 * charge read `2026-08-17` (wall clock) — eight days apart. In production the two
 * agree, because there is no clock. A driver that asserts this value against a
 * SIMULATED date will fail for a reason that has nothing to do with the code, so
 * assert it against the charge object itself.
 *
 * ## The one live subscription is why the customer is enough
 *
 * `startTrial`'s lease and the reconcile both exist to guarantee a user has at
 * most one live subscription, so the newest failed charge on the customer is the
 * decline this screen is about. Scoping to an invoice id would be narrower and is
 * not currently buyable: the charge/invoice link moved to `invoice.payments` in
 * this API version and would need a second round trip to resolve.
 *
 * ## ⚠️ NULL MEANS "WE DO NOT KNOW", AND THE CALLER MUST WITHHOLD
 *
 * Rule 0. Stripe being unreachable, unconfigured, or simply having no failed
 * charge on file are all "unknown", and none of them may become a date on a
 * screen. The sentence that names this date is withheld rather than reworded —
 * never defaulted to today, to the period end, or to anything else convenient.
 */
export async function declinedOnFor(customerId: string): Promise<string | null> {
  try {
    const charges = await stripe().charges.list({ customer: customerId, limit: 10 });
    // Stripe lists newest first, so the first failure is the most recent one.
    const failed = charges.data.find((c) => c.status === "failed");
    if (!failed) return null;
    const at = new Date(failed.created * 1000);
    return Number.isNaN(at.getTime()) ? null : at.toISOString();
  } catch {
    /**
     * Swallowed on purpose, and the whole screen survives it. The same shape as
     * `courtesyUntilFor`: a display detail that cannot be read must not take down
     * the page somebody opened to find out what they are paying.
     */
    return null;
  }
}
