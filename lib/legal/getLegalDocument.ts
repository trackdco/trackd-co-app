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
  | "medical_disclaimer";

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
  const { data } = await supabase
    .from("legal_documents")
    .select("title, version, body, is_beta, effective_date")
    .eq("doc_type", docType)
    .eq("is_current", true)
    .maybeSingle();
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
