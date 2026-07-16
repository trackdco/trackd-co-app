"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";

export type GateState = { error?: string };

/**
 * Whole years between `dob` and `now`, decrementing if this year's birthday
 * hasn't happened yet. Computed server-side — the client never decides age.
 */
function ageInYears(dob: Date, now: Date): number {
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Completes the one-time 18+/ToS gate.
 *
 * Validates (server-authoritatively) that the user is signed in, has agreed to
 * the documents, and is 18+, then UPDATEs their own profile row (RLS scopes the
 * write to (SELECT auth.uid()) = id). Records the date of birth, the 18+ flag,
 * the acceptance timestamp, and which ToS version was accepted (read live from
 * legal_documents so it stays correct after the launch-day bump to 1.0).
 *
 * Returns a field error for the form on rejection; redirects to /dashboard on
 * success.
 */
export async function completeGate(
  _prev: GateState,
  formData: FormData,
): Promise<GateState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Three separate affirmative consents (Spec 12). All required.
  const agreeTosPrivacy = formData.get("agree_tos_privacy") === "on";
  const agreeDisclaimer = formData.get("agree_disclaimer") === "on";
  const agreeHealth = formData.get("agree_health") === "on";
  const dobRaw = String(formData.get("date_of_birth") ?? "").trim();
  const sexRaw = String(formData.get("sex") ?? "").trim();

  if (!agreeTosPrivacy || !agreeDisclaimer || !agreeHealth) {
    return {
      error: "Please tick all three boxes to agree and continue.",
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dobRaw)) {
    return { error: "Please enter your date of birth." };
  }
  // Required — it decides which body the injection-site map draws. Validated
  // against the `sex_type` enum here; the client never decides it.
  if (sexRaw !== "male" && sexRaw !== "female") {
    return { error: "Please select male or female." };
  }

  // Parse as local Y/M/D and reject impossible dates (e.g. 31 Feb, which JS
  // would otherwise silently roll forward into March). The picker can't produce
  // these, but the server must not trust the client.
  const [yy, mm, dd] = dobRaw.split("-").map(Number);
  const dob = new Date(yy, mm - 1, dd);
  const now = new Date();
  const isRealDate =
    dob.getFullYear() === yy && dob.getMonth() === mm - 1 && dob.getDate() === dd;
  if (!isRealDate || dob > now || yy < 1900) {
    return { error: "That date of birth doesn't look right." };
  }
  if (ageInYears(dob, now) < 18) {
    return { error: "You must be 18 or older to use Trackd." };
  }

  // Record WHICH version of each document was accepted — read the live (current)
  // versions from legal_documents (public read) so it stays correct after a bump.
  const { data: docs } = await supabase
    .from("legal_documents")
    .select("doc_type, version")
    .eq("is_current", true)
    .in("doc_type", [
      "terms_of_service",
      "privacy_policy",
      "medical_disclaimer",
    ]);
  const versionOf = (t: string) =>
    docs?.find((d) => d.doc_type === t)?.version ?? null;
  const tosVersion = versionOf("terms_of_service");
  const privacyVersion = versionOf("privacy_policy");
  const disclaimerVersion = versionOf("medical_disclaimer");

  // We won't record acceptance of an unknown version, nor gate someone through
  // without a complete consent record — so all three current versions must resolve.
  if (!tosVersion || !privacyVersion || !disclaimerVersion) {
    return { error: "Couldn't load the current legal documents. Please try again." };
  }

  // 1) Write the granular, per-version consent audit FIRST (Spec 12,
  //    consent_records), and only gate the user through (step 2) once it lands —
  //    so an account can never have app access without a complete consent record.
  //    Idempotent: an upsert on (user_id, document, version) makes a retry after a
  //    transient failure a no-op, never a duplicate. health_data_consent is tied
  //    to the Privacy Policy, so it carries the Privacy version.
  const userAgent = (await headers()).get("user-agent");
  const { error: consentError } = await supabase
    .from("consent_records")
    .upsert(
      [
        { user_id: user.id, document: "tos", version: tosVersion, user_agent: userAgent },
        { user_id: user.id, document: "privacy", version: privacyVersion, user_agent: userAgent },
        { user_id: user.id, document: "disclaimer", version: disclaimerVersion, user_agent: userAgent },
        { user_id: user.id, document: "health_data_consent", version: privacyVersion, user_agent: userAgent },
      ],
      { onConflict: "user_id,document,version", ignoreDuplicates: true }
    );
  if (consentError) {
    console.error("consent_records insert failed", consentError);
    return { error: "Couldn't record your consent just now. Please try again." };
  }

  // 2) Now set the access gate on the profile — this is what grants entry.
  const { error } = await supabase
    .from("profiles")
    .update({
      date_of_birth: dobRaw,
      sex: sexRaw,
      is_18_plus: true,
      tos_accepted_at: now.toISOString(),
      tos_version: tosVersion,
    })
    .eq("id", user.id);
  if (error) {
    return { error: "Couldn't save that just now. Please try again." };
  }

  redirect("/dashboard");
}
