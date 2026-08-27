"use client";

import { FlowError } from "@/components/billing/FlowError";

/**
 * The boundary for `/plans`. See `components/billing/FlowError.tsx` for why the
 * paid flow does not use the app-wide error screen.
 *
 * ⚠️ NO SECONDARY EXIT. This IS the start of the flow, so there is nowhere
 * further back to send somebody that is not the app itself — and handing the app
 * to somebody who never reached a card is the exact bug this file exists to
 * close. "Try again" re-fetches; that is the offer.
 */
export default function PlansError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <FlowError error={error} retry={unstable_retry} />;
}
