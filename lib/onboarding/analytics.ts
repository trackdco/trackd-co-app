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
  /**
   * NO EMITTER, deliberately kept (Spec w2b-14).
   *
   * The paywall used to fire this under `method: "preview"` beside a stubbed
   * trial, reporting a sign-in that had already happened on a different screen.
   * It went with the rest of the dead auth code. Firing it honestly means
   * instrumenting `GoogleSignInButton` and `EmailPasswordForm`, which are shared
   * with `/login` and which the spec forbids redesigning without asking — so the
   * NAME stays and the lie does not. `auth_completed` is fired by the handoff,
   * from the only server-confirmed moment an account is known to exist.
   */
  | "auth_started"
  | "auth_completed"
  | "trial_started"
  | "install_confirmed"
  // The OS install dialog was offered and did not end in an install. Worth its
  // own event: it is the difference between "Android users do not install" and
  // "Android users never got asked", and only one of those is a copy problem.
  | "install_prompt_failed"
  | "notifications_granted"
  // iOS said yes, but the OS was never asked: install is now the last step, and
  // requesting push from an uninstalled iOS site spends the one prompt on a
  // call that cannot succeed. Distinct from `notifications_granted` on purpose
  // — this is INTENT recorded, not permission held, and conflating the two
  // would make iOS opt-in look far healthier than the delivered-push numbers.
  | "notifications_deferred"
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
