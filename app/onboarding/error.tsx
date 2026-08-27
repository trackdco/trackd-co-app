"use client";

import { FlowError } from "@/components/billing/FlowError";

/**
 * The boundary for `/onboarding`. See `components/billing/FlowError.tsx`.
 *
 * ⚠️ THE EXIT IS `/onboarding`, NOT `/plans`, and the difference is who is
 * standing here. This route is reachable by a STRANGER — that is its job — and
 * `/plans` redirects anybody without a session to `/login`, so offering it would
 * send an anonymous visitor to a sign-in form after an error on screen three of
 * a flow they had not yet joined. Restarting the flow is the offer that is true
 * for every cohort that can reach this boundary.
 */
export default function OnboardingError({
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
      backHref="/onboarding"
      backLabel="Start over"
    />
  );
}
