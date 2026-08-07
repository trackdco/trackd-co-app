"use server";

import { headers } from "next/headers";

import { getCurrentUser } from "@/lib/auth";
import {
  hasAgeAndConsent,
  normaliseSession,
  type OnboardingSession,
} from "@/lib/onboarding/session";
import { todayKey } from "@/lib/protocol/cycle";
import { createClient } from "@/lib/supabase/server";

/**
 * THE ANSWER HANDOFF (Spec w2b-14, step 4) — the anonymous onboarding session,
 * claimed onto a real account.
 *
 * The spec calls this the highest-risk part of the change, and the risk is
 * ordering: the answers exist in exactly one place (`trackd.onboarding.v1` on
 * one device) until this succeeds. So **the database is written first, the write
 * is confirmed, and only then is the client allowed to clear its copy** — the
 * caller does the clearing, and only on a status this file returns.
 *
 * ## It runs on ARRIVAL, not on a button press
 *
 * All three auth paths leave the page and come back through a full document
 * load: Google via `/auth/callback`, email confirmation via `/auth/confirm`, and
 * email sign-in via the hard navigate in `app/login/actions.ts`. Nothing
 * client-side survives that, so the claim is fired by whatever mounts at the
 * step it lands on (`components/onboarding/answer-handoff.tsx`).
 *
 * ## Every write here is IDEMPOTENT, because retries are the normal case
 *
 * A failed claim leaves the answers on the device and shows a retry, and the
 * retry re-runs all of this. So:
 *   - `consent_records` upserts with `ignoreDuplicates`
 *   - the `profiles` gate update is conditioned on the gate not being set
 *   - `signup_intake` is a plain INSERT and a 23505 MEANS "already claimed"
 * A partial failure followed by a retry therefore completes the missing half
 * rather than duplicating the finished one.
 *
 * ## An existing user's data always wins
 *
 * `signup_intake` has `user_id` as its PRIMARY KEY and no UPDATE grant at all,
 * so a returning user signing in on the account screen cannot have their
 * answers replaced by a fresh anonymous set — the insert simply fails with
 * 23505 and the local copy is discarded. The `profiles` gate update is
 * conditioned on `tos_accepted_at IS NULL` for the same reason: a user who
 * passed the 18+/ToS gate months ago does not get re-stamped by whatever a
 * borrowed phone had in `localStorage`.
 */

export type ClaimStatus =
  /** The answers were written. Safe to clear the device copy. */
  | "written"
  /** This account already had answers. Discard the device copy, do not merge. */
  | "already-claimed"
  /**
   * This device had nothing to claim and the account has nothing yet either.
   * Not a failure and not a success — see `carriesAnswers` for why it must not
   * be allowed to write.
   */
  | "nothing-to-claim"
  /** Nobody is signed in. Do NOT clear anything; this is not a failure. */
  | "no-session"
  /** Something failed. The device copy MUST be kept and a retry offered. */
  | "error";

export type ClaimResult = {
  status: ClaimStatus;
  /**
   * What to call the user, resolved from whichever row won. Returned on every
   * success so the post-paywall Welcome screen can greet them AFTER the device
   * copy has been cleared — and after a reload, when there is no device copy to
   * read at all.
   */
  name: string | null;
};

/** Whether a PostgREST error is a unique-violation (the row already exists). */
function isDuplicate(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

/**
 * DOES THIS DEVICE ACTUALLY HAVE ANSWERS TO CLAIM?
 *
 * An empty row is not harmless here, it is DESTRUCTIVE, because the table is
 * append-only and first-write-wins. The scenario that forced this check:
 *
 *   1. Someone completes the flow on their phone and signs up with email.
 *   2. They open the confirmation link on their LAPTOP, which is where their
 *      email is. That laptop has no onboarding session at all.
 *   3. The laptop claims — and without this guard, inserts a row of nulls.
 *   4. Back on the phone, the real answers now hit a row that already exists,
 *      are reported as "already claimed", and are CLEARED.
 *
 * The whole set is destroyed by the one path most likely to be taken, and every
 * individual step behaves exactly as designed. So a claim with nothing in it
 * writes nothing and says so, leaving the row free for the device that has the
 * answers.
 *
 * The three fields tested are the ones that prove the flow was walked. A code
 * from a deep link is not enough on its own: `?code=` is captured on the FIRST
 * load, before a single question has been answered.
 */
function carriesAnswers(session: OnboardingSession): boolean {
  return (
    (session.name?.trim().length ?? 0) > 0 ||
    session.running.length > 0 ||
    session.struggle.length > 0
  );
}

export async function claimOnboardingSession(
  raw: OnboardingSession | null,
): Promise<ClaimResult> {
  const user = await getCurrentUser();
  if (!user) return { status: "no-session", name: null };

  const supabase = await createClient();

  // UNTRUSTED INPUT. It came out of `localStorage`, which the user can edit, and
  // then across the wire. Through the SAME normaliser the client reads with, so
  // a cap enforced only in the browser is not a cap that was enforced.
  const session = normaliseSession(raw);

  // Has this account already been claimed? Read first so an existing user's
  // name is available even when there is nothing to write.
  const { data: existing, error: readError } = await supabase
    .from("signup_intake")
    .select("name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) {
    console.error("[claim] signup_intake read failed:", readError.message);
    return { status: "error", name: null };
  }

  let claimed = Boolean(existing);
  let name = existing?.name ?? null;

  // Nothing here and nothing there. Write NOTHING — see `carriesAnswers`. The
  // gate is skipped with it, because an empty session cannot prove an age
  // either, so this user meets `/welcome` in the normal way.
  if (!claimed && !carriesAnswers(session)) {
    return { status: "nothing-to-claim", name: null };
  }

  if (!claimed) {
    const { error: insertError } = await supabase.from("signup_intake").insert({
      user_id: user.id,
      name: session.name,
      running: session.running,
      struggle: session.struggle,
      struggle_detail: session.struggleDetail,
      affiliate_code: session.affiliateCode,
    });
    if (insertError && !isDuplicate(insertError)) {
      console.error("[claim] signup_intake insert failed:", insertError.message);
      return { status: "error", name: null };
    }
    // A duplicate here means a second tab or a retry won the race. Either way
    // the answers are on the account, which is all this needed to be true.
    claimed = isDuplicate(insertError);
    name = claimed ? null : session.name;
  }

  const gateError = await passGateFromSession(supabase, user.id, session);
  if (gateError) {
    console.error("[claim] gate write failed:", gateError);
    return { status: "error", name };
  }

  // The duplicate-insert race above leaves `name` unresolved; read it back
  // rather than guess, since the whole point of the branch is that the other
  // writer's row won.
  if (claimed && name === null) {
    const { data } = await supabase
      .from("signup_intake")
      .select("name")
      .eq("user_id", user.id)
      .maybeSingle();
    name = data?.name ?? null;
  }

  return { status: claimed ? "already-claimed" : "written", name };
}

/**
 * The 18+/ToS gate, written from the onboarding answers instead of from the
 * `/welcome` interstitial.
 *
 * Onboarding already asks for the date of birth, the sex and a single consent
 * covering all three documents (`components/onboarding/screens/housekeeping.tsx`
 * — "I'm 18 or older and accept the Terms of Service, Medical Disclaimer and
 * Privacy Policy"). Writing it here is what stops a user who just answered all
 * of that being sent to `/welcome` to answer it again.
 *
 * **The age is re-decided HERE, on the server.** `hasAgeAndConsent` is the same
 * predicate the client's Continue button reads, but the client's answer is not
 * evidence — the value arrived from `localStorage`. If the server cannot prove
 * 18+ AND consent from what it was handed, it writes NO gate columns at all and
 * the user meets `/welcome` in the normal way. The answers are still claimed;
 * only the gate is withheld.
 *
 * Returns an error message, or null on success.
 */
async function passGateFromSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  session: OnboardingSession,
): Promise<string | null> {
  if (!hasAgeAndConsent(session, todayKey())) return null;
  if (session.sex === null) return null;

  // Which version of each document was accepted, read live so it stays correct
  // after a version bump. Mirrors `app/welcome/actions.ts`.
  const { data: docs, error: docsError } = await supabase
    .from("legal_documents")
    .select("doc_type, version")
    .eq("is_current", true)
    .in("doc_type", ["terms_of_service", "privacy_policy", "medical_disclaimer"]);
  if (docsError) return `legal_documents read: ${docsError.message}`;

  const versionOf = (t: string) =>
    docs?.find((d) => d.doc_type === t)?.version ?? null;
  const tosVersion = versionOf("terms_of_service");
  const privacyVersion = versionOf("privacy_policy");
  const disclaimerVersion = versionOf("medical_disclaimer");

  // We will not record acceptance of an unknown version, nor gate someone
  // through without a complete consent record.
  if (!tosVersion || !privacyVersion || !disclaimerVersion) {
    return "current legal document versions did not resolve";
  }

  // 1) The granular consent audit FIRST, and the gate only once it lands — so an
  //    account can never have app access without a complete consent record.
  //    `health_data_consent` is tied to the Privacy Policy, so it carries the
  //    Privacy version. Same four rows, same conflict target, as `/welcome`.
  const userAgent = (await headers()).get("user-agent");
  const { error: consentError } = await supabase.from("consent_records").upsert(
    [
      { user_id: userId, document: "tos", version: tosVersion, user_agent: userAgent },
      { user_id: userId, document: "privacy", version: privacyVersion, user_agent: userAgent },
      { user_id: userId, document: "disclaimer", version: disclaimerVersion, user_agent: userAgent },
      { user_id: userId, document: "health_data_consent", version: privacyVersion, user_agent: userAgent },
    ],
    { onConflict: "user_id,document,version", ignoreDuplicates: true },
  );
  if (consentError) return `consent_records: ${consentError.message}`;

  // 2) The gate itself, ONLY if it has never been passed. `.is(…, null)` is what
  //    makes an existing user's own date of birth, sex and acceptance timestamp
  //    untouchable by a fresh anonymous session — the update matches zero rows
  //    and PostgREST reports no error, which is the correct outcome here.
  const { error } = await supabase
    .from("profiles")
    .update({
      date_of_birth: session.dob,
      sex: session.sex,
      is_18_plus: true,
      tos_accepted_at: new Date().toISOString(),
      tos_version: tosVersion,
    })
    .eq("id", userId)
    .is("tos_accepted_at", null);
  if (error) return `profiles: ${error.message}`;

  return null;
}
