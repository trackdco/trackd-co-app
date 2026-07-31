/**
 * Onboarding funnel events (Spec 3-01 · §13).
 *
 * **There is no analytics destination wired on this project yet** — PostHog is
 * listed as deferred in `architecture.md` → Stack. So this is the seam, not
 * the integration: every event the spec asks for is fired through one function
 * with one call site per event, and pointing that function at PostHog (or
 * RevenueCat, where it owns the trial/entitlement events) is a contained
 * change.
 *
 * Until then events are buffered on `window` so a preview session can be
 * inspected, and echoed to the console in development only. Nothing is sent
 * anywhere, and nothing is persisted.
 */

export type OnboardingEvent =
  | "onboarding_start"
  | "age_gate_passed"
  | "running_selected"
  | "struggle_selected"
  | "demo_dose_logged"
  | "demo_completed"
  | "payoff_viewed"
  | "paywall_viewed"
  | "plan_selected"
  | "affiliate_code_applied"
  | "affiliate_code_invalid"
  | "auth_started"
  | "auth_completed"
  | "trial_started"
  | "install_confirmed"
  | "notifications_granted"
  | "attribution_selected"
  | "onboarding_completed";

export interface BufferedEvent {
  event: OnboardingEvent;
  props?: Record<string, unknown>;
  at: number;
}

declare global {
  interface Window {
    __trackdOnboardingEvents?: BufferedEvent[];
  }
}

/** Fire a funnel event. Never throws: analytics must not break a flow. */
export function track(event: OnboardingEvent, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    const entry: BufferedEvent = { event, props, at: Date.now() };
    const buffer = (window.__trackdOnboardingEvents ??= []);
    buffer.push(entry);
    if (process.env.NODE_ENV === "development") {
      console.info("[onboarding]", event, props ?? {});
    }
  } catch {
    // Ignore.
  }
}
