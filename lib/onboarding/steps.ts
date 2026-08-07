/**
 * The onboarding step machine (Spec 3-01 · §7 Flow Map).
 *
 * The ORDER IS THE SPEC and must not be reordered: value before friction, then
 * eligibility, then payment. Phase A is anonymous; Phase B only exists once the
 * paywall has handed back an account.
 *
 * Pure data + pure functions so the sequence can be tested without React. The
 * flow component reads `STEP_ORDER`; nothing hard-codes a "next" screen.
 *
 * Spec D-3 (default: fold) is applied — the standalone profile-photo screen is
 * folded into Welcome, so screen 12 has no step of its own.
 */

import type { Platform } from "./platform";

export type StepId =
  | "hook"
  // HOUSEKEEPING IS FOUR SCREENS, not one (Adrian, 2026-08-05). One page
  // carrying a photo, a name, a date of birth, a sex control and a three-link
  // consent tick read as a form to be got through, and he was right that it
  // looked cluttered. One question per screen is also what makes the age gate
  // legible rather than something buried among product fields.
  | "name"
  | "birthday"
  | "gender"
  | "greeting"
  | "running"
  | "struggle"
  | "celebrate"
  | "demo"
  | "payoff"
  | "cost"
  // The free-trial reveal, between the cost argument and the price list. It is
  // its own step rather than the top of the paywall because it has one job —
  // "$0 today" — and a screen with one job cannot be scrolled past.
  | "free"
  | "paywall"
  | "welcome"
  | "install"
  | "notifications"
  | "attribution"
  | "letter";

/** Which side of the paywall a step sits on. */
export type StepPhase = "anonymous" | "authed";

export interface StepMeta {
  id: StepId;
  phase: StepPhase;
}

/**
 * The one ordered list. Phase A (0-10) runs with no account; Phase B (11-17)
 * runs in-trial. `paywall` is the boundary: it is the only step that changes
 * phase, because auth and payment are the trial button and nothing earlier.
 */
export const STEP_ORDER: readonly StepMeta[] = [
  { id: "hook", phase: "anonymous" },
  // The four housekeeping screens, in this order and no other. `birthday`
  // carries the date AND the consent tick together (Adrian's call): "I confirm
  // I'm over 18 and agree to..." belongs beside the date that proves it, not on
  // a page of its own where it reads as fine print.
  { id: "name", phase: "anonymous" },
  { id: "birthday", phase: "anonymous" },
  { id: "gender", phase: "anonymous" },
  // "Welcome, <name>" — the payoff for the three questions, and it HANDS INTO
  // the goals screens rather than standing alone, so the flow reads as one
  // conversation instead of a greeting followed by a fresh start.
  { id: "greeting", phase: "anonymous" },
  { id: "running", phase: "anonymous" },
  { id: "struggle", phase: "anonymous" },
  { id: "celebrate", phase: "anonymous" },
  // ONE step, four stages. The demo used to be four routes and Adrian's note
  // was that walking between pages broke the illusion: logging a dose should
  // move the thing beside it, not navigate somewhere. The stages live inside
  // the screen (`components/onboarding/screens/demo.tsx`) so the cards can
  // recede and accumulate on one surface.
  { id: "demo", phase: "anonymous" },
  { id: "payoff", phase: "anonymous" },
  // The cost comparison. D for now (Adrian's pick of six candidates); the
  // others live at /onboarding/cost until one is chosen for good.
  { id: "cost", phase: "anonymous" },
  // Cost makes the argument, `free` removes the risk, paywall asks for the
  // decision. Three beats, in that order (Adrian, 2026-08-05).
  { id: "free", phase: "anonymous" },
  { id: "paywall", phase: "anonymous" },
  { id: "welcome", phase: "authed" },
  { id: "notifications", phase: "authed" },
  { id: "attribution", phase: "authed" },
  { id: "letter", phase: "authed" },
  /**
   * INSTALL IS LAST, and it used to be first of the post-paywall four (Adrian,
   * 2026-08-07).
   *
   * An installed iOS home-screen app gets its OWN STORAGE CONTAINER, separate
   * from Safari's: different cookies, different `localStorage`. So a user who
   * added the icon mid-flow and then opened it arrived with no onboarding
   * session and no auth cookie, at `start_url` (`/dashboard`), where the
   * `(app)` guard bounced them to `/login`. They had just paid, and the icon we
   * told them to add signed them out and abandoned the remaining screens.
   * Nothing after install could be relied on to happen at all.
   *
   * Last is the only position where that costs nothing, because there is
   * nothing left to abandon. Its CTA calls `finish()` rather than `goNext()`.
   *
   * **This inverts the old install-before-notifications rule, deliberately, and
   * `notifications` absorbs the cost.** iOS cannot grant web push to an
   * uninstalled site, so that screen no longer calls
   * `Notification.requestPermission()` on iOS — it states the intent and defers
   * the real request to the installed app, which is the only place it can
   * succeed. Firing it here would burn the one prompt the OS gives you on a
   * call that cannot work. Android is unaffected and still asks in place.
   */
  { id: "install", phase: "authed" },
] as const;

export const FIRST_STEP: StepId = STEP_ORDER[0].id;

const INDEX_BY_ID = new Map<StepId, number>(STEP_ORDER.map((s, i) => [s.id, i]));

/** Position of a step in the flow, or -1 for an id that is not a step. */
export function stepIndex(id: StepId): number {
  return INDEX_BY_ID.get(id) ?? -1;
}

/**
 * THE GATE, ENFORCED.
 *
 * `?step=` is read straight off the URL, and for a while nothing checked it:
 * `isStepId` is a membership test, not a permission check, so
 * `/onboarding?step=demo` rendered the whole demo — body map, dosing UI,
 * injection sites — with an empty session, and `?step=paywall` rendered the
 * trial CTA. Since every screen puts its own id in the address bar, every URL a
 * user bookmarks or shares was a bypass.
 *
 * Spec §3.2 is not ambiguous: "Age gate precedes all substance-adjacent content
 * and all payment." §17 has a checkbox reading "No payment path bypasses the
 * age gate". Both were false as built.
 *
 * ## Splitting housekeeping did NOT weaken this
 *
 * It used to be one screen and one boolean: past `housekeeping`, or not. Now it
 * is four screens, and the clamp walks to the EARLIEST unanswered one rather
 * than to a fixed step — so a deep link to `?step=paywall` with an empty
 * session lands on `name`, not on a later page with holes behind it.
 *
 * The legally load-bearing predicate is unchanged and is still expressed once,
 * in `session.ts`. `firstIncompleteHousekeeping` is the ONLY thing that decides
 * where someone is allowed to be, and it is all-or-nothing per field, so there
 * is no arrangement of URL, history and storage that reaches substance-adjacent
 * content or a payment path with an unproven age.
 */
export function clampStep(
  requested: StepId,
  /**
   * The earliest housekeeping step still unanswered, or null when all four are
   * done. Computed by `firstIncompleteHousekeeping` in `session.ts` — passed in
   * rather than recomputed here so the age rule has exactly one home.
   */
  incomplete: StepId | null,
): StepId {
  if (!incomplete) return requested;
  return stepIndex(requested) > stepIndex(incomplete) ? incomplete : requested;
}

/**
 * THE INTENT CLAMP — separate from the age gate, and deliberately narrower.
 *
 * Adrian requires at least one answer on each intent screen (2026-08-01), and
 * the disabled Continue button only covers the forward path. Browser FORWARD
 * re-enters a step the user has since emptied, and a bookmark or a shared link
 * skips them outright — either way `celebrate` renders a reply to a question
 * nobody answered, which is the whole thing the requirement exists to stop.
 *
 * ## Why this is not folded into `clampStep`
 *
 * The age gate is legally load-bearing and clamps EVERYTHING past housekeeping.
 * This must not: `welcome` is where OAuth returns, and a user coming back from
 * Google with an empty session would be thrown back to the intent screens with
 * their trial already started. So this clamps only the anonymous stretch
 * BETWEEN the intent screens and the paywall, and never touches a post-paywall
 * step.
 *
 * Returns the earliest unanswered intent screen, or the requested step.
 */
const INTENT_GUARDED: readonly StepId[] = [
  "celebrate",
  "demo",
  "payoff",
  "cost",
  "free",
  "paywall",
];

export function clampIntent(
  requested: StepId,
  answers: { running: readonly unknown[]; struggle: readonly unknown[] },
): StepId {
  if (!INTENT_GUARDED.includes(requested)) return requested;
  if (answers.running.length === 0) return "running";
  if (answers.struggle.length === 0) return "struggle";
  return requested;
}

export function stepMeta(id: StepId): StepMeta | null {
  const i = stepIndex(id);
  return i === -1 ? null : STEP_ORDER[i];
}

/** The step after `id`, or null at the end of the flow (which hands off). */
/**
 * Does a step exist for this platform at all?
 *
 * **`notifications` does not, on iOS** (Adrian, 2026-08-07). iOS cannot grant
 * web push to a site that is not on the Home Screen, and install is now the
 * LAST step, so on iOS that screen could only ever record an intention and
 * defer. His call was to drop it rather than show a screen that cannot do its
 * job: the installed app asks, which is the only place the ask can succeed.
 * Android reaches it unchanged and still gets the real prompt in place.
 *
 * The step stays in `STEP_ORDER`. That list is the canonical sequence and the
 * thing `clampStep` and `stepProgress` read; making it platform-dependent would
 * mean a user's progress bar and a deep link disagreed about what the flow is.
 * Only FORWARD WALKING skips, which is the one place the difference is real.
 * A deep link to `?step=notifications` on iOS still renders, and the screen
 * keeps its deferred copy for exactly that case.
 */
export function stepAppliesTo(id: StepId, platform: Platform): boolean {
  if (id === "notifications") return platform !== "ios";
  return true;
}

/** `nextStep`, skipping anything this platform does not have. */
export function nextStepFor(id: StepId, platform: Platform): StepId | null {
  let candidate = nextStep(id);
  while (candidate !== null && !stepAppliesTo(candidate, platform)) {
    candidate = nextStep(candidate);
  }
  return candidate;
}

export function nextStep(id: StepId): StepId | null {
  const i = stepIndex(id);
  if (i === -1 || i >= STEP_ORDER.length - 1) return null;
  return STEP_ORDER[i + 1].id;
}

/** The step before `id`, or null at the start. */
export function prevStep(id: StepId): StepId | null {
  const i = stepIndex(id);
  if (i <= 0) return null;
  return STEP_ORDER[i - 1].id;
}

/** Narrowing guard for an untrusted `?step=` value off the URL. */
export function isStepId(value: unknown): value is StepId {
  return typeof value === "string" && INDEX_BY_ID.has(value as StepId);
}

/**
 * Progress through the flow as 0…1.
 *
 * The hook is 0 and shows no indicator at all: nothing has been done yet, and a
 * bar reading 0% is a worse first impression than no bar. From the first real
 * step it opens at **20%** and runs to 100% at the end (Adrian, 2026-08-01).
 *
 * The 20% floor is not decoration. A fourteen-step flow shows 7% after the
 * first screen, which reads as "you have barely started" at the exact moment
 * someone is deciding whether to continue. Starting the scale at 20 credits
 * them for having turned up, and the last step is still honestly 100%.
 */
export const PROGRESS_FLOOR = 0.2;

export function stepProgress(id: StepId): number {
  const i = stepIndex(id);
  if (i <= 0) return 0;
  const remaining = STEP_ORDER.length - 2;
  if (remaining <= 0) return 1;
  return PROGRESS_FLOOR + (1 - PROGRESS_FLOOR) * ((i - 1) / remaining);
}
