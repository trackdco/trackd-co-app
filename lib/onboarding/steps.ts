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
  | "cost"
  // The free-trial reveal, between the cost argument and the price list. It is
  // its own step rather than the top of the paywall because it has one job —
  // "$0 today" — and a screen with one job cannot be scrolled past.
  | "free"
  // Account creation, its own screen, immediately before the paywall (Spec
  // w2b-14). See `STEP_ORDER` for why it is not on the paywall itself.
  | "account"
  /**
   * THE PRICE LIST. Called `plans` in the URL, not `paywall` (Adrian,
   * 2026-08-13).
   *
   * Every step puts its own id in the address bar, so the id is COPY: it is on
   * screen for the whole time somebody is deciding whether to pay. "Paywall" is
   * the industry's word for the thing standing between a person and what they
   * want, and printing it above a price list tells the user exactly how the
   * business thinks of the moment. "Plans" is what the screen actually shows.
   *
   * The SCREEN is still `screens/paywall.tsx` and `PaywallScreen` — the rename
   * is the user-visible value only, deliberately, so this stays a copy change
   * rather than a refactor of every file that mentions the word.
   */
  | "plans"
  // Payment is its own screen, after the plan is chosen. See `STEP_ORDER`.
  // `start` rather than `checkout` for the same reason as `plans`: the screen
  // starts a free trial, and "checkout" names a till.
  | "start"
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
 * The one ordered list. Phase A runs with no account; Phase B runs signed in.
 * **`account` is the boundary** — it is the only step that changes phase.
 *
 * It used to be the price list, because auth and payment were both the trial
 * button. Spec w2b-14 split them: the account is made on its own screen and the
 * price list is payment only, so every step from `plans` onward has a session.
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
  // The cost comparison. D for now (Adrian's pick of six candidates); the
  // others live at /onboarding/cost until one is chosen for good.
  { id: "cost", phase: "anonymous" },
  // Cost makes the argument, `free` removes the risk, paywall asks for the
  // decision. Three beats, in that order (Adrian, 2026-08-05).
  { id: "free", phase: "anonymous" },
  /**
   * ACCOUNT CREATION, ON ITS OWN SCREEN, BEFORE THE PRICE (Spec w2b-14).
   *
   * Three reasons, in the spec's priority order:
   *
   * 1. **The email is captured before the price is seen.** A user who walks the
   *    whole flow and then balks at the paywall used to leave no trace at all.
   *    Now they leave an account.
   * 2. **Auth and payment stop colliding.** Google sign-in navigates the browser
   *    away and back, which is a full page load — it destroys any payment UI
   *    mounted on the same screen. Splitting the screens removes that entire bug
   *    class before spec w2b-15 mounts a Stripe Payment Element on the paywall.
   * 3. **The paywall gets exactly one button.** It used to carry a "Continue
   *    with Google" control that was not the call to action.
   *
   * It is the LAST anonymous step. Everything after it has a session.
   */
  { id: "account", phase: "anonymous" },
  { id: "plans", phase: "authed" },
  /**
   * PAYMENT IS ITS OWN SCREEN (Adrian, 2026-08-08).
   *
   * The paywall was doing two jobs at once: make the argument and pick a plan,
   * AND take a card. Measured at 320x568 that put the commit button ~1,400px
   * down a single screen — timeline, three plan rows, code field, card form,
   * disclosure, button.
   *
   * Split, each screen has one job. `plans` asks WHICH; `start` asks for
   * the card. It is also what makes the disclosure requirement structural
   * rather than something to keep re-measuring: on a short payment screen the
   * trial length, the amount, the charge date and the auto-renewal notice sit
   * beside the button by construction.
   *
   * Still inside TRACKD — the spec's rule is that the user never reaches a
   * stripe.com domain, not that payment shares a screen with the price list.
   */
  { id: "start", phase: "authed" },
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
 * than to a fixed step — so a deep link to `?step=plans` with an empty
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
  /**
   * Whether the SERVER has verified that this account has ALREADY PASSED the
   * 18+/ToS gate — `profiles.is_18_plus AND tos_accepted_at`, read by
   * `getSessionContext` and handed down from `app/onboarding/page.tsx`.
   *
   * ## This is proof of age, which is the only thing that may skip a proof of age
   *
   * An earlier version of this took `signedIn` instead, and a cold review showed
   * that made the gate satisfiable by MAKING AN ACCOUNT: sign up at `/login`,
   * never visit `/welcome`, and the paywall rendered. The predicate has to be
   * the age, not the session.
   *
   * ## Why the exemption exists at all
   *
   * The claim clears `localStorage` the instant the answers reach the account —
   * that is the point of it. So afterwards the device holds NO date of birth,
   * and this function, reading only the device, sends a paying customer back to
   * "What's your name?" at 20% on any reload. That is not a stricter gate; it is
   * a lockout, and it is the same shape as the two this file's comments already
   * record.
   *
   * ## Why it covers EVERY step and not just the authed ones
   *
   * Because the lockout does. A second cold review measured it: complete the
   * flow, sign in, then open `?step=free` — an ANONYMOUS step — and you land on
   * `name`. Exempting only the authed half left the whole anonymous half exposed
   * to exactly the failure the exemption was written for.
   *
   * Nothing is weakened by the wider scope. What this skips is a date of birth
   * in `localStorage`; what it requires instead is a date of birth stored on the
   * account, alongside a per-version consent record, both written server-side
   * and both re-read on every request. That is strictly the stronger evidence.
   *
   * It FAILS CLOSED: the parameter defaults to false, so a caller that forgets
   * it gates harder rather than softer.
   */
  gated = false,
): StepId {
  if (gated) return requested;
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
  "cost",
  "free",
  // The account screen is anonymous and sits between the intent screens and the
  // paywall, so it is guarded exactly like the rest of that stretch. Nobody
  // returns to it from an auth redirect — a signed-in user is sent forward to
  // the paywall (see the account screen's own redirect) — so the `welcome`
  // hazard described above does not apply here.
  "account",
  "plans",
];

export function clampIntent(
  requested: StepId,
  answers: { running: readonly unknown[]; struggle: readonly unknown[] },
  /**
   * The same server-verified proof of age as `clampStep`'s, for the same reason
   * and with the same scope. A gated account's answers are ON THE ACCOUNT — the
   * claim wrote them and then emptied the device — so judging it by what is left
   * in `localStorage` throws a paying customer back to the intent screens.
   * Fails closed.
   */
  gated = false,
): StepId {
  if (gated) return requested;
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
 * THE OLD NAMES, STILL HONOURED.
 *
 * `paywall` and `checkout` were the ids until 2026-08-13. They appear in
 * bookmarks, in anything anybody has shared, in the browser history of every
 * tester, and — the one that is not cosmetic — in a Stripe `return_url` that a
 * 3DS redirect written before this change may still be carrying. A renamed step
 * that 404s to `hook` would drop a user out of a payment they had just
 * authenticated.
 *
 * They resolve, they are not steps. `isStepId("paywall")` is false, so nothing
 * inside the flow can be handed an old id by mistake; only the two places that
 * read a raw URL go through `resolveStepId`, and both of them then hold a real
 * `StepId` and correct the address bar to it.
 *
 * ONE-WAY. Nothing writes an old id, and this map only ever shrinks.
 *
 * A `Map`, not an object literal, and that is not a style choice. This is a
 * lookup keyed on a string straight off the URL, and on a plain object
 * `LEGACY["constructor"]` returns a function and `LEGACY["__proto__"]` returns
 * `Object.prototype` — both truthy, both would be handed back as a `StepId`,
 * and `SCREENS[thatValue]` is `undefined`. `?step=constructor` would have
 * rendered a crash. A `Map` has no prototype chain to walk.
 */
const LEGACY_STEP_IDS = new Map<string, StepId>([
  ["paywall", "plans"],
  ["checkout", "start"],
  // The payoff screen ("One tap a day. / A year of answers.") was DELETED on
  // 2026-08-27: it restated the demo's own closing stage — "It all compounds."
  // — one screen later, and Adrian cut it. Its best line was not lost, it moved
  // onto that demo stage as its subtitle.
  //
  // It resolves forward rather than to null so that anyone holding a link, or
  // mid-flow with `?step=payoff` in their history, lands on the next screen
  // instead of being thrown back to the hook with their answers intact but
  // their position gone.
  ["payoff", "cost"],
]);

/**
 * Resolve an untrusted `?step=` to a real step, accepting the retired names.
 *
 * Returns null for anything that is neither, which every caller already treats
 * as "start at the beginning".
 */
export function resolveStepId(value: unknown): StepId | null {
  if (isStepId(value)) return value;
  if (typeof value !== "string") return null;
  return LEGACY_STEP_IDS.get(value) ?? null;
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
