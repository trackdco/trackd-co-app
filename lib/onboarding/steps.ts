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
 * Progress through the flow as 0…1, used by the hairline rail at the top of
 * every screen. The hook is 0 (nothing done yet) and the last step is 1.
 */
export function stepProgress(id: StepId): number {
  const i = stepIndex(id);
  if (i <= 0) return 0;
  return i / (STEP_ORDER.length - 1);
}
