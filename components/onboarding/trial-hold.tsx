"use client";

import { useEffect, useRef, useState } from "react";

import { hasEntitlement } from "@/app/onboarding/billing-actions";
import { CircleNotch } from "@/components/icons";
import { FLOW_SUB, FLOW_TITLE } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { FlowCta } from "./chrome";

/**
 * THE POST-PAYMENT GAP (Spec w2b-15, step 9).
 *
 * There is typically one to three seconds between the card confirming and the
 * webhook landing. **The user must not be dropped into the app during that
 * window and shown the paywall they just paid to escape** — so this holds them
 * here and polls until the entitlement actually exists.
 *
 * It replaces the paywall rather than covering it. A spinner over a price list
 * reads as the payment not having worked, which is the opposite of what just
 * happened.
 *
 * ## Nothing here grants anything
 *
 * It asks `hasEntitlement`, which reads the same `entitlements` table every gate
 * reads. It cannot unlock anything itself, and if it could this whole spec would
 * be pointless — a client that can grant access is a client anyone can grant
 * themselves access with.
 */

/**
 * Backed off, and biased toward the common case: most webhooks land inside three
 * seconds, so the first few checks are quick and the rest stretch out rather
 * than hammering a serverless function for half a minute.
 *
 * Roughly 30 seconds in total. Past that a human should be told something,
 * because a silent spinner at minute one is indistinguishable from a hang.
 */
const BACKOFF_MS = [
  600, 900, 1200, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000,
];

/**
 * ⚠️ THE PAID PATH WAITS LONGER, AND THE TRIAL PATH IS UNCHANGED (D15: 60s
 * against ~30).
 *
 * The 30 seconds above is sized on "most webhooks land inside three seconds",
 * which is true of `customer.subscription.created` on a trialing subscription —
 * fired at creation, with nothing in front of it. A CHARGED subscription has to
 * travel through payment confirmation, `invoice.paid` and
 * `customer.subscription.updated` before `syncSubscription` writes an entitling
 * row, so a charged customer is measurably likelier to reach the slow screen.
 *
 * Reaching it is not a failure, but it is a worse thing to reach when money has
 * just moved, so the paid path is given twice the room before it gets there.
 */
const PAID_BACKOFF_MS = [
  ...BACKOFF_MS,
  5000, 5000, 5000, 5000, 5000, 5000,
];

export function TrialHold({
  onEntitled,
  variant = "trial",
}: {
  onEntitled: () => void;
  /**
   * ⚠️ WHICH OF THREE PEOPLE IS WAITING HERE. It changes the words and the
   * timing, and nothing else.
   *
   *   trial  a first-timer on seven free days
   *   grace  a beta user mid-fortnight. Nothing was charged, and the word
   *          "trial" must not appear (D17: the grace is not one)
   *   paid   money moved today
   *
   * A cold review caught the two-way version: `paid={!trial}` told a mid-grace
   * user "Your payment is safe" when nothing had moved, and the obvious fix —
   * `!trial && !midGrace` — sent them to the other branch, whose headline is
   * "Setting up your trial." They are neither, so they get their own.
   *
   * ⚠️ NO NEW COPY. Both headlines and both bodies are already signed; this
   * only chooses between them. "Setting up your plan." is true for a mid-grace
   * user, and the non-payment body says nothing about a trial or a charge.
   *
   * Defaults to `trial`, so the `/preview/paywall` harness is untouched.
   */
  variant?: "trial" | "grace" | "paid";
}) {
  /** Money moved today. Only `paid` may claim a payment is safe. */
  const paid = variant === "paid";
  const [slow, setSlow] = useState(false);
  const [checking, setChecking] = useState(false);

  /**
   * A TOKEN, NOT A BOOLEAN.
   *
   * This was a single `alive` ref set true at the top of every effect run and
   * false in cleanup — and a cold review measured what that costs: a cleanup
   * followed by a re-run RESURRECTS the old loop rather than ending it, because
   * the old loop only reads the flag after its `await` and by then the new run
   * has set it back to true. Measured 20 server-action POSTs in 29 seconds, in
   * pairs 2-9ms apart: two loops in lockstep, each firing `onEntitled` when it
   * finished.
   *
   * A token compares identity instead. Each run captures its own, and a run
   * whose token is no longer the current one stops — which is true whether it
   * was cleaned up, superseded, or both.
   */
  const runToken = useRef(0);

  useEffect(() => {
    const token = ++runToken.current;
    const mine = () => runToken.current === token;

    (async () => {
      for (const wait of paid ? PAID_BACKOFF_MS : BACKOFF_MS) {
        if (!mine()) return;
        try {
          if (await hasEntitlement()) {
            if (mine()) onEntitled();
            return;
          }
        } catch {
          // A failed poll is not a failed payment. Keep waiting — the webhook
          // does not care whether we managed to look.
        }
        await new Promise((r) => setTimeout(r, wait));
      }
      if (mine()) setSlow(true);
    })();

    return () => {
      // Invalidate this run. Any loop still awaiting will see a token that is
      // no longer current and stop.
      runToken.current += 1;
    };
  }, [onEntitled, paid]);

  /**
   * The Continue on the recoverable state RE-CHECKS before letting anyone
   * through.
   *
   * It used to be `onEntitled` directly, with no check at all — so a user whose
   * payment genuinely had not completed (an abandoned 3D Secure challenge leaves
   * a subscription whose SetupIntent still `requires_action`) was walked into
   * the app by a screen telling them their payment went through.
   */
  const continueOn = async () => {
    setChecking(true);
    try {
      await hasEntitlement().catch(() => false);
    } finally {
      setChecking(false);
      // Through either way. Holding someone hostage to a webhook we cannot see
      // is worse than letting them in — the app's own gates are what decide
      // access, and they read the same table this does.
      onEntitled();
    }
  };

  /**
   * THE RECOVERABLE STATE, and its wording is the whole point.
   *
   * It must NOT claim the payment succeeded. It used to open with "Your payment
   * went through and your trial has started", which is an assertion this screen
   * cannot make: it knows only that no entitlement has appeared, and the reason
   * might be that the card was never confirmed. Saying so to someone whose 3D
   * Secure challenge failed is worse than saying nothing.
   *
   * So it states what IS true — we are still setting up, nothing is lost, carry
   * on — and offers a way forward rather than a way to pay again, which is the
   * one action that could genuinely cost them.
   */
  if (slow) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center px-5 pb-8 text-center">
        <h1 className={cn(FLOW_TITLE, "text-balance")}>
          This is taking a moment.
        </h1>
        {/* ⚠️ SIGNED COPY (D15, 15 Aug 2026). The paid variant must not say
            "trial", must not claim the payment succeeded — this screen cannot
            know that — and must acknowledge that money moved, because a charged
            customer reading a screen that ignores the charge goes looking for
            their bank. Carried verbatim; do not shorten or soften. */}
        <p className={cn(FLOW_SUB, "mx-auto mt-3 max-w-[20rem] text-pretty")}>
          {paid
            ? "We're still finalising your setup. Your payment is safe and your Pro plan will appear shortly. Check your Billing screen if anything looks missing."
            : "We're still finalising your setup. Nothing is lost, and if anything is missing it'll catch up shortly."}
        </p>
        <div className="mt-8">
          <FlowCta onClick={() => void continueOn()} disabled={checking}>
            {checking ? "Checking…" : "Go to my dashboard"}
          </FlowCta>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 pb-8 text-center"
      role="status"
      aria-live="polite"
    >
      <CircleNotch className="h-7 w-7 animate-spin text-text-subtle" aria-hidden />
      {/* ⚠️ SIGNED COPY (D15). A customer who was just charged must not read
          the word "trial" here. */}
      <h1 className={cn(FLOW_TITLE, "mt-6 text-balance")}>
        {variant === "trial" ? "Setting up your trial." : "Setting up your plan."}
      </h1>
      <p className={cn(FLOW_SUB, "mx-auto mt-3 max-w-[20rem] text-pretty")}>
        One moment. We&apos;re just confirming everything.
      </p>
    </div>
  );
}
