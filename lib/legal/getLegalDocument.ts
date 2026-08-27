import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

/**
 * Cached public read of the current legal documents (ToS / Privacy / Medical
 * Disclaimer). These pages are IDENTICAL across every user and change only on a
 * rare version bump, yet were being re-queried from Supabase on every request via
 * the cookie-bound server client (which also forced fully dynamic rendering).
 *
 * Here the read goes through a COOKIELESS anon client (legal_documents is
 * public-read — anon SELECT — so no session is needed) wrapped in
 * `unstable_cache`. Because there's no cookie/header dependency, the legal pages
 * can render statically and revalidate on a schedule (ISR). There is no locale or
 * per-user variation, so `docType` is the only cache-key dimension (it's an
 * argument, so `unstable_cache` keys on it automatically).
 *
 * Revalidation: schedule-based (1h) — ample for documents that change only on a
 * deliberate version bump. The `legal-documents` tag is exposed so a future admin
 * publish flow can `revalidateTag("legal-documents")` for instant invalidation;
 * today legal docs are written out-of-band by service-role migrations.
 */

export type LegalDocType =
  | "terms_of_service"
  | "privacy_policy"
  | "medical_disclaimer"
  /**
   * ⚠️ ADDED 2026-08-25 FOR v2.0. Washington's My Health My Data Act requires a
   * consumer health data privacy policy published under that name and reachable
   * without logging in. It mirrors the `legal_doc_type` enum in Postgres, which
   * gained the same value in `legal_doc_type_add_consumer_health_data`.
   *
   * ⚠️ IT IS NOT A CONSENT TYPE. `consent_records.document` has no matching
   * value and must not gain one: this document is Section 16 of the Privacy
   * Policy republished, and the consent it describes is recorded against the
   * PRIVACY POLICY's version.
   */
  | "consumer_health_data";

export interface LegalDoc {
  title: string;
  version: string;
  body: string;
  is_beta: boolean;
  effective_date: string | null;
}

export const LEGAL_DOCUMENTS_TAG = "legal-documents";

/** How long the rendered legal pages stay cached before a background refresh. */
export const LEGAL_REVALIDATE_SECONDS = 3600;

async function fetchCurrentLegalDocument(
  docType: LegalDocType,
): Promise<LegalDoc | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  // Cookieless anon client — a pure public read, never a per-user session.
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("legal_documents")
    .select("title, version, body, is_beta, effective_date")
    .eq("doc_type", docType)
    .eq("is_current", true)
    .maybeSingle();
  // Throw on a real query error so `unstable_cache` doesn't cache the failure
  // (which would 404 the page for the whole revalidate window). A genuine
  // "no current row" returns null (uncached miss is fine — it's a true 404).
  if (error) {
    throw new Error(`legal_documents read failed (${docType}): ${error.message}`);
  }
  return (data as LegalDoc | null) ?? null;
}

/**
 * The current legal document for a type, cached across requests and users. Returns
 * null when missing / misconfigured (the page renders `notFound()`).
 */
export const getCurrentLegalDocument = unstable_cache(
  fetchCurrentLegalDocument,
  ["legal-document"],
  { tags: [LEGAL_DOCUMENTS_TAG], revalidate: LEGAL_REVALIDATE_SECONDS },
);

/**
 * ⚠️ ONE SPECIFIC VERSION, BY NUMBER — the document somebody ACCEPTED, which is
 * not always the document that is CURRENT.
 *
 * Added 2026-08-26. The four v2.0 documents went live on 25 August, two days
 * before their own effective date, which flipped v1.3 to `is_current = false`.
 * `getCurrentLegalDocument` filters on `is_current`, so from that moment
 * `/terms` served v2.0 and **v1.3 was reachable at no URL at all** — while
 * `consent_records` still points 81 accounts at v1.3 as the thing they agreed
 * to. A person could not read the terms they had accepted.
 *
 * That is the general shape rather than a two-day accident: `consent_records`
 * stores a VERSION, so every superseded version it names has to stay readable
 * for as long as the record does. This is the read that keeps that true, and it
 * is deliberately separate from the one above — folding a version filter into
 * `getCurrentLegalDocument` would give one function two questions to answer, and
 * the wrong answer to "what is in force today?" is the one that matters most.
 *
 * ⚠️ IT DOES NOT CHANGE WHAT IS CURRENT and must never be used to decide that.
 * `is_current` is not read here at all: the caller has named a version, and this
 * returns that version whether it is in force, superseded, or not yet effective.
 *
 * The row-level policy on `legal_documents` is `USING (true)` for `anon` and
 * `authenticated`, SELECT only (measured 2026-08-26), so this widens no
 * database exposure — every row was already anon-readable. It only gives the
 * rows a URL.
 */
async function fetchLegalDocumentVersion(
  docType: LegalDocType,
  version: string,
): Promise<LegalDoc | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("legal_documents")
    .select("title, version, body, is_beta, effective_date")
    .eq("doc_type", docType)
    .eq("version", version)
    .maybeSingle();
  // Same split as the current-document read: a real query error THROWS so the
  // failure is never cached into a 404 for the whole revalidate window, and a
  // genuine miss returns null, which is a true 404.
  if (error) {
    throw new Error(
      `legal_documents read failed (${docType} v${version}): ${error.message}`,
    );
  }
  return (data as LegalDoc | null) ?? null;
}

/**
 * A named version of a legal document, cached per (docType, version). Returns
 * null when there is no such version, which the page renders as `notFound()`.
 */
export const getLegalDocumentVersion = unstable_cache(
  fetchLegalDocumentVersion,
  ["legal-document-version"],
  { tags: [LEGAL_DOCUMENTS_TAG], revalidate: LEGAL_REVALIDATE_SECONDS },
);
