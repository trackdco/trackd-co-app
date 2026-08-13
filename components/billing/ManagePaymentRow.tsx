"use client";

import { useState, useTransition } from "react";

import { CaretRight, CreditCard } from "@/components/icons";
import { openBillingPortal } from "@/app/(app)/billing/actions";

/**
 * "Payment method and invoices" — the row that hands off to Stripe.
 *
 * Everything about a card belongs to Stripe and nothing about it should pass
 * through this app, so this is the one control here that deliberately leaves.
 * It reads as a link row (caret, same height as Profile's) rather than a button,
 * because that is what it does.
 *
 * ## The navigation is done here, not by the action
 *
 * A `redirect()` inside a server action throws a control-flow signal, and any
 * `try/catch` around the call swallows it into a button that silently does
 * nothing. The action returns a URL and this assigns it.
 *
 * `window.location.assign`, not `router.push`: the destination is Stripe's
 * origin, so a client-side navigation is not an option, and a full document load
 * is also what brings the user back cleanly through `return_url`.
 */
export function ManagePaymentRow() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await openBillingPortal();
            if (result.ok && result.url) {
              window.location.assign(result.url);
            } else {
              setError(result.error ?? "Something went wrong.");
            }
          });
        }}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left outline-none transition-colors hover:bg-bg-surface-raised active:bg-bg-surface-raised focus-visible:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-60"
      >
        <CreditCard className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        <span className="flex-1 text-sm text-foreground">
          {pending ? "Opening…" : "Payment method and invoices"}
        </span>
        <CaretRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      </button>
      {error ? (
        <p className="px-4 pb-3 text-sm text-accent-destructive">{error}</p>
      ) : null}
    </>
  );
}
