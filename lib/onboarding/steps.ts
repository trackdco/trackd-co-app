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

export type StepId =
  | "hook"
  | "housekeeping"
  | "running"
  | "struggle"
  | "celebrate"
  | "demo"
  | "payoff"
  | "cost"
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
  { id: "housekeeping", phase: "anonymous" },
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
  { id: "paywall", phase: "anonymous" },
  { id: "welcome", phase: "authed" },
  { id: "install", phase: "authed" },
  { id: "notifications", phase: "authed" },
  { id: "attribution", phase: "authed" },
  { id: "letter", phase: "authed" },
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
 * So: anything past housekeeping is clamped BACK to housekeeping until the gate
 * is satisfied. The predicate is `canLeaveHousekeeping` and there is deliberately
 * no second copy of that logic here.
 */
export function clampStep(
  requested: StepId,
  gatePassed: boolean,
): StepId {
  if (gatePassed) return requested;
  const gate = stepIndex("housekeeping");
  return stepIndex(requested) > gate ? "housekeeping" : requested;
}

export function stepMeta(id: StepId): StepMeta | null {
  const i = stepIndex(id);
  return i === -1 ? null : STEP_ORDER[i];
}

/** The step after `id`, or null at the end of the flow (which hands off). */
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
