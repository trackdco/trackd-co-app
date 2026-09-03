/**
 * The ONE place the app decides what to call someone.
 *
 * There used to be two derivations of this, hand-rolled in two page files
 * (`app/(app)/dashboard/page.tsx` and `app/(app)/profile/page.tsx`), each with
 * its own fallback chain. That is how the greeting and the Profile heading end
 * up disagreeing after somebody edits one of them, so both now ask here.
 *
 * ## Two names, on purpose
 *
 * They answer different questions and they are deliberately allowed to differ:
 *
 *  - `accountNameFor` — WHOSE ACCOUNT THIS IS. Google's first + last, shown as
 *    the Profile heading directly above the email, which is the same kind of
 *    fact.
 *  - `greetingNameFor` — WHAT THE APP CALLS YOU. The user's own answer to
 *    onboarding's "What's your name?", editable on Profile. Always ONE token,
 *    so Home can never say "Good morning Adrian Schimizzi".
 *
 * Neither ever decides anything. Auth metadata is display-only and is not
 * evidence of anything — see the note on `passedGate` in `lib/auth.ts`.
 */

import { normaliseName } from "@/lib/onboarding/session";

/** The user's own stored name plus whatever the identity provider knows. */
export type NameSources = {
  /** `profiles.display_name` — the live, user-editable value. */
  displayName?: string | null;
  /** `user_metadata.full_name ?? user_metadata.name` from the OAuth provider. */
  authFullName?: string | null;
  email?: string | null;
};

/**
 * First token, normalised and capped — the value that is STORED, never a slice
 * applied at render.
 *
 * Rendering the slice would leave the Profile field reading "Adrian Schimizzi"
 * beside a greeting reading "Adrian", and a field that disagrees with the thing
 * it controls is worse than the full name we were trying to avoid.
 *
 * ORDER MATTERS, AND THE OBVIOUS ORDER IS WRONG. Normalising first and then
 * splitting looks equivalent and is not: `normaliseName` strips control
 * characters, a TAB is one, so "Adrian\tSchimizzi" lost its separator and came
 * back as the single token "AdrianSchimizzi". Split the raw string, then
 * normalise the token that survives — that way the cap and the control-character
 * strip are still the same ones `signup_intake` and `profiles_display_name_len`
 * enforce, and a pasted name with a tab or a double space in it still splits.
 * (Caught by a test, not by reading it.)
 */
export function firstNameOf(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const first = raw.trim().split(/\s+/)[0] ?? "";
  return normaliseName(first);
}

/** The local-part of an email, as the last resort before "no name at all". */
function localPartOf(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  const local = email.split("@")[0] ?? "";
  return local.trim() === "" ? null : local.trim();
}

/**
 * "Good morning, ___" on Home, and the onboarding welcome line.
 *
 * The user's own answer wins over the identity provider's, which is the whole
 * point of the change: when the two disagree, the one they typed in answer to
 * our question is the answer to our question. The email local-part stays as the
 * final fallback for accounts that predate onboarding and carry no Google name,
 * but it is now THIRD rather than second.
 */
export function greetingNameFor(sources: NameSources): string | null {
  return (
    firstNameOf(sources.displayName) ??
    firstNameOf(sources.authFullName) ??
    firstNameOf(localPartOf(sources.email))
  );
}

/**
 * The Profile heading. Google's full name, because it sits above the email and
 * is answering "whose account is this".
 *
 * `displayName` is second rather than absent (Adrian, 2026-09-03): an account
 * with no Google name used to fall straight through to the raw email, so the
 * heading read "adrianschimizzi1" for a user who had told us their name on the
 * first screen of onboarding. Showing "Adrian" there is strictly better.
 *
 * DELIBERATELY NO EMAIL FALLBACK, unlike `greetingNameFor`. Null here means "we
 * have no name for this account", and Profile needs to know that rather than be
 * handed a local-part it cannot tell apart from a real name: it is the flag that
 * decides whether the email is printed as a second line under the heading or IS
 * the heading. A helper that never returns null would have quietly turned that
 * branch off.
 */
export function accountNameFor(
  sources: Pick<NameSources, "authFullName" | "displayName">,
): string | null {
  const full = typeof sources.authFullName === "string" ? sources.authFullName.trim() : "";
  if (full !== "") return full;
  return normaliseName(sources.displayName);
}
