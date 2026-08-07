"use server";

import { headers } from "next/headers";

import {
  hasAgeAndConsent,
  normaliseSession,
  type OnboardingSession,
} from "@/lib/onboarding/session";
import { todayKey } from "@/lib/protocol/cycle";
import { gateWriter } from "@/lib/auth/gate-writer";
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
   * Whether the account passes the 18+/ToS gate NOW, read back after the writes.
   *
   * The account screen needs this to decide where the user goes next: forward to
   * the paywall if the claim gated them, or on to `/welcome` if there was
   * nothing to claim and the gate is still open. `app/onboarding/page.tsx`
   * refuses every `authed` step without it, so a client that guessed would send
   * the user into a redirect it cannot win.
   */
  gated: boolean;
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
 * DID THIS DEVICE ACTUALLY WALK THE FLOW?
 *
 * A thin row is not harmless here, it is DESTRUCTIVE, because the table is
 * append-only and first-write-wins. The scenario:
 *
 *   1. Someone completes the flow on their phone and signs up with email.
 *   2. They open the confirmation link on their LAPTOP, which is where their
 *      email is. That laptop's onboarding session is empty, or holds only what
 *      they typed the day they started the flow there and gave up.
 *   3. The laptop claims, and inserts that.
 *   4. Back on the phone, the real answers now hit a row that already exists,
 *      are reported as "already claimed", and are CLEARED.
 *
 * The whole set is destroyed by the path most likely to be taken, and every
 * individual step behaves exactly as designed.
 *
 * ## Why this is an AND, and why it is these two fields
 *
 * The first version of this guard was an OR across name/running/struggle, and a
 * cold review broke it in one move: a laptop where somebody typed a name and
 * stopped passes an OR, squats the row with `{name, [], []}`, and destroys the
 * phone's real set exactly as before — the same defect one step up.
 *
 * The honest test is not "is anything set" but "did this device get far enough
 * to have the answers at all", and the flow already answers that: `clampIntent`
 * will not let a device reach the account screen without BOTH intent screens
 * answered. So requiring both is precisely the condition every legitimate
 * claimer already satisfies, and the earliest point a half-finished device
 * fails.
 *
 * The name is deliberately NOT part of the test. It is required to leave
 * housekeeping, so a device with both tag sets has one; making it a third
 * condition would only add a way for a real answer set to be refused.
 *
 * A creator code is not enough on its own either: `?code=` is captured on the
 * FIRST load, before a single question has been answered.
 *
 * `signup_intake_has_answers` in `supabase/onboarding/003` states the same rule
 * as a CHECK constraint, because a guard in an application is a convention and
 * the destructive failure must not depend on one.
 *
 * `003` is APPLIED (2026-08-08) and verified: a thin row now fails with `23514`.
 * So this function and the constraint agree, and the destructive case no longer
 * depends on the one in TypeScript.
 */
function carriesAnswers(session: OnboardingSession): boolean {
  return session.running.length > 0 && session.struggle.length > 0;
}

/**
 * ARE THESE THE ANSWERS THAT ARE ALREADY ON THE ACCOUNT?
 *
 * Decides whether the device now calling may stamp the 18+/ToS gate — see
 * `passGateFromSession`. Compares only the fields `signup_intake` actually
 * stores; the date of birth and sex are not among them, which is exactly why
 * this comparison has to stand in for them.
 *
 * Order-insensitive: the tag arrays come out of `normaliseSession`'s `Set`, and
 * two devices that ticked the same chips in a different order gave the same
 * answer.
 */
function answersMatch(
  stored: { name: string | null; running: string[]; struggle: string[] },
  session: OnboardingSession,
): boolean {
  const same = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");
  return (
    (stored.name ?? null) === session.name &&
    same(stored.running ?? [], session.running) &&
    same(stored.struggle ?? [], session.struggle)
  );
}

export async function claimOnboardingSession(
  raw: OnboardingSession | null,
): Promise<ClaimResult> {
  const supabase = await createClient();

  /**
   * "SIGNED OUT" AND "THE AUTH SERVER DID NOT ANSWER" ARE DIFFERENT THINGS.
   *
   * `getCurrentUser()` discards `getUser()`'s error and returns null for both,
   * which is right for a route guard — it fails closed — and wrong here. A cold
   * review proved the difference costs the answers: a transient 5xx or timeout
   * reported `no-session`, and `no-session` is deliberately not a failure, so
   * nothing retried and NOTHING APPEARED ON SCREEN. The user saw an ordinary
   * paywall while the only copy of their answers sat on the device, unclaimed.
   *
   * So this asks directly and branches on the error. `getCurrentUser` is left
   * alone: every other caller is a guard, and a guard that treats an unreachable
   * auth server as "signed in" is a much worse bug than this one.
   */
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) {
    console.error("[claim] auth read failed:", authError.message);
    return { status: "error", name: null, gated: false };
  }
  const user = auth.user;
  if (!user) return { status: "no-session", name: null, gated: false };

  // UNTRUSTED INPUT. It came out of `localStorage`, which the user can edit, and
  // then across the wire. Through the SAME normaliser the client reads with, so
  // a cap enforced only in the browser is not a cap that was enforced.
  const session = normaliseSession(raw);

  // Has this account already been claimed? Read first so an existing user's
  // name is available even when there is nothing to write.
  const { data: existing, error: readError } = await supabase
    .from("signup_intake")
    .select("name, running, struggle")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) {
    console.error("[claim] signup_intake read failed:", readError.message);
    return { status: "error", name: null, gated: false };
  }

  let claimed = Boolean(existing);
  let name = existing?.name ?? null;

  // Nothing here and nothing there. Write NOTHING — see `carriesAnswers`. The
  // gate is skipped with it, because an empty session cannot prove an age
  // either, so this user meets `/welcome` in the normal way.
  if (!claimed && !carriesAnswers(session)) {
    return {
      status: "nothing-to-claim",
      name: null,
      gated: await readGate(supabase, user.id),
    };
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
      return { status: "error", name: null, gated: false };
    }
    // A duplicate here means a second tab or a retry won the race. Either way
    // the answers are on the account, which is all this needed to be true.
    claimed = isDuplicate(insertError);
    name = claimed ? null : session.name;
  }

  /**
   * THE GATE IS ONLY WRITTEN BY THE DEVICE WHOSE ANSWERS WON.
   *
   * `passGateFromSession` stamps `date_of_birth` and `sex` from the session it
   * is handed, and a cold review showed that running it on the `already-claimed`
   * path lets the WRONG device do the stamping: a stale phone whose answers were
   * discarded a line above still set the profile's date of birth and sex, and
   * `sex` decides which body the injection-site map draws.
   *
   * `.is("tos_accepted_at", null)` does not cover this. It protects an account
   * that has ALREADY passed the gate — which is not the account being created on
   * the account screen, and not one that bailed at `/welcome`.
   *
   * So: stamp when this call inserted the row, or when the row that is there
   * holds THESE answers. The second half is what keeps the retry idempotent —
   * the same device coming back after a gate failure finds its own answers
   * stored and finishes the job.
   */
  const mayStampGate =
    !claimed ||
    (existing !== null && existing !== undefined && answersMatch(existing, session));

  const gateError = mayStampGate
    ? await passGateFromSession(supabase, user.id, session)
    : null;
  if (gateError) {
    console.error("[claim] gate write failed:", gateError);
    return { status: "error", name, gated: false };
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

  return {
    status: claimed ? "already-claimed" : "written",
    name,
    gated: await readGate(supabase, user.id),
  };
}

/**
 * Does this account pass the 18+/ToS gate RIGHT NOW?
 *
 * Read back after the writes rather than inferred from them, because the writes
 * are conditional: `passGateFromSession` declines silently when the server
 * cannot prove the age, and the `profiles` update is scoped to
 * `tos_accepted_at IS NULL`. Both are correct and both mean "I wrote nothing"
 * and "it was already true" look identical from the call site.
 *
 * The same two columns `getSessionContext` reads, so the client cannot believe
 * something the route guard will then contradict.
 */
async function readGate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("is_18_plus, tos_accepted_at")
    .eq("id", userId)
    .maybeSingle();
  return Boolean(data?.is_18_plus && data?.tos_accepted_at);
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
  /**
   * WRITTEN WITH THE SERVICE ROLE, not the user's client (Spec w2b-15
   * cold-review repair, `supabase/grants/004`). The gate columns are no longer
   * in the `authenticated` grants, because a user who can set
   * `is_18_plus` on themselves has not passed an age gate — they have edited
   * one. `hasAgeAndConsent` above is still the real check and is unchanged.
   */
  const { error } = await gateWriter()
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
