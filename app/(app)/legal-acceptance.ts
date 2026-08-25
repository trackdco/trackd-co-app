"use server";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";

/**
 * RECORD THAT SOMEBODY ACCEPTED THE UPDATED DOCUMENTS BY CONTINUING TO USE THE APP.
 *
 * ## Why this exists: the documents say it happens, and it did not
 *
 * Terms v2.0 §25: *"By continuing to use Trackd after we have given you clear
 * notice of updated terms, you agree to the updated Terms of Service and Privacy
 * Policy"* and *"We record which version of each document you accepted, and when
 * you accepted it."* Privacy v2.0 §13: *"We record your acceptance of our
 * documents separately on our servers."*
 *
 * The switch-on notice IS that clear notice — its own signed sentence says the
 * same thing. But acceptance rows were only ever written at SIGNUP. For the ~86
 * accounts that predate billing, `consent_records` holds 1.3 and nothing would
 * ever have written 2.0, so both sentences above were false for the exact cohort
 * the notice is shown to.
 *
 * ## ⚠️ EXACTLY TWO DOCUMENTS, AND THE OMISSIONS ARE THE CAREFUL PART
 *
 * The notice's signed line names the Terms of Service and the Privacy Policy.
 * Those two, and nothing else:
 *
 *   · **NOT `health_data_consent`.** Privacy v2.0 §17 forbids it in terms:
 *     *"Continued use is never treated as consent to a new or expanded use of
 *     your health data."* Writing that row here would be the single worst thing
 *     this function could do — it would manufacture an Article 9 consent from a
 *     dismissed pop-up.
 *   · **NOT `disclaimer`.** The notice links it so it can be read, but the
 *     acceptance sentence does not name it, and recording an acceptance the user
 *     was never told they were giving is the defect this whole batch exists to
 *     close.
 *
 * ## ⚠️ NON-BLOCKING, AND "COULD NOT RECORD" IS NOT "DID NOT HAPPEN"
 *
 * Every failure path returns quietly. A database problem must never stop someone
 * dismissing a notice, and it must never leave a row claiming an acceptance we
 * could not actually write. An unrecorded acceptance and a failed write are the
 * same outcome here — no row — which is the honest one: absent, not asserted.
 * The caller does not await it.
 *
 * Idempotent by the same unique key signup uses, so dismissing twice, or a retry
 * after a transient failure, is a no-op rather than a duplicate.
 */
export async function recordDocumentAcceptance(): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    /**
     * ⚠️ THE LIVE VERSIONS, READ AT THE MOMENT OF ACCEPTANCE. Never a literal.
     * On 26 August this records 1.3 and on 27 August it records 2.0, because
     * that is which document was actually in force when they continued to use
     * the app. A hardcoded "2.0" would backdate an acceptance.
     */
    const { data: docs, error: docsError } = await supabase
      .from("legal_documents")
      .select("doc_type, version")
      .eq("is_current", true)
      .in("doc_type", ["terms_of_service", "privacy_policy"]);
    if (docsError) return;

    const versionOf = (t: string) => docs?.find((d) => d.doc_type === t)?.version ?? null;
    const tosVersion = versionOf("terms_of_service");
    const privacyVersion = versionOf("privacy_policy");
    // Rule 0: a version we could not read is not a version we may record.
    if (!tosVersion || !privacyVersion) return;

    const userAgent = (await headers()).get("user-agent");
    await supabase.from("consent_records").upsert(
      [
        { user_id: user.id, document: "tos", version: tosVersion, user_agent: userAgent },
        { user_id: user.id, document: "privacy", version: privacyVersion, user_agent: userAgent },
      ],
      { onConflict: "user_id,document,version", ignoreDuplicates: true },
    );
  } catch {
    // Deliberately silent. See the non-blocking note above: the person is
    // dismissing a notice, and nothing they can see may depend on this.
  }
}
