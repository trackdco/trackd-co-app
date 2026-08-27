"use client";

import { FlowError } from "@/components/billing/FlowError";

/**
 * The boundary for `/checkout`. See `components/billing/FlowError.tsx`.
 *
 * The secondary exit goes to `/plans` — one step BACK UP the flow, not out of
 * it. Somebody whose card screen failed to render has a real reason to want a
 * different plan, and it is the only destination from here that is not the app.
 */
export default function CheckoutError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <FlowError
      error={error}
      retry={unstable_retry}
      backHref="/plans"
      backLabel="Back to plans"
    />
  );
}
