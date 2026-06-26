"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { openBillingPortal } from "@/lib/stripe/actions";

/**
 * Opens the Stripe-hosted Customer Portal (manage plan, switch cadence, update
 * card, cancel) via the server action, then redirects to the returned URL.
 */
export function ManageSubscriptionButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    setError(null);
    startTransition(async () => {
      const res = await openBillingPortal();
      if (res.url) {
        window.location.href = res.url;
        return;
      }
      setError(res.error ?? "Something went wrong. Please try again.");
    });
  }

  return (
    <div>
      <Button
        onClick={open}
        size="lg"
        variant="outline"
        disabled={pending}
        aria-busy={pending}
        className="h-12 w-full rounded-xl text-[0.95rem] duration-100 active:scale-[0.98] motion-reduce:active:scale-100"
      >
        {pending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : null}
        Manage subscription
      </Button>
      {error ? (
        <p
          role="alert"
          className="animate-in fade-in-0 slide-in-from-top-1 duration-200 mt-3 text-sm text-[var(--state-error)] motion-reduce:animate-none"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
