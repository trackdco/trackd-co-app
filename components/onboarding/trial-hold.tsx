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

export function TrialHold({ onEntitled }: { onEntitled: () => void }) {
  const [slow, setSlow] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;

    (async () => {
      for (const wait of BACKOFF_MS) {
        if (!alive.current) return;
        try {
          if (await hasEntitlement()) {
            if (alive.current) onEntitled();
            return;
          }
        } catch {
          // A failed poll is not a failed payment. Keep waiting — the webhook
          // does not care whether we managed to look.
        }
        await new Promise((r) => setTimeout(r, wait));
      }
      if (alive.current) setSlow(true);
    })();

    return () => {
      alive.current = false;
    };
  }, [onEntitled]);

  /**
   * THE RECOVERABLE STATE, and its wording is the whole point.
   *
   * It must NOT imply the payment failed, because it did not — the card was
   * accepted and the subscription exists. What is late is our own webhook. So
   * this says the thing that is true ("you're set up, we're just catching up")
   * and offers a way forward rather than a way to pay again, which is the one
   * action that would genuinely cost the user something.
   */
  if (slow) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center px-5 pb-8 text-center">
        <h1 className={cn(FLOW_TITLE, "text-balance")}>You&apos;re all set.</h1>
        <p className={cn(FLOW_SUB, "mx-auto mt-3 max-w-[20rem] text-pretty")}>
          Your payment went through and your trial has started. It&apos;s taking
          us a moment to finish setting up — carry on, and everything will be
          waiting for you.
        </p>
        <div className="mt-8">
          <FlowCta onClick={onEntitled}>Continue</FlowCta>
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
      <h1 className={cn(FLOW_TITLE, "mt-6 text-balance")}>
        Setting up your trial.
      </h1>
      <p className={cn(FLOW_SUB, "mx-auto mt-3 max-w-[20rem] text-pretty")}>
        One moment — we&apos;re just confirming everything.
      </p>
    </div>
  );
}
