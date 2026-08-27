import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/legal-document";

/**
 * A SUPERSEDED VERSION OF THIS DOCUMENT, AT A STABLE URL — /terms/1.3.
 *
 * `consent_records` stores the VERSION each person accepted, so every version
 * it names has to stay readable after it stops being current. Without this the
 * only readable copy is whatever is in force today, which is a different
 * document from the one they agreed to. The reasoning in full, and the measured
 * row-level policy that makes an anon read of a non-current row legitimate, are
 * on `getLegalDocumentVersion`.
 *
 * ⚠️ THIS DOES NOT DECIDE WHAT IS CURRENT. /terms keeps that job and is
 * untouched; this route reads `version` and never `is_current`.
 *
 * An unknown version renders `notFound()` — a 404 is the honest answer for a
 * version that does not exist, and it is the same answer for a typo.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ version: string }>;
}): Promise<Metadata> {
  const { version } = await params;
  return {
    title: `Terms of Service v${version} · Trackd Co`,
    /**
     * ⚠️ NOINDEX, and it is the point of the page rather than an afterthought.
     * A superseded document that competes with the live one in search results
     * would send a stranger to terms that are not in force. This page exists to
     * be reachable by someone who was SENT here, not to be found by someone who
     * was looking for the current terms.
     */
    robots: { index: false, follow: false },
  };
}

// Public and user-identical, exactly like the current-version page beside it.
// Must be a literal (Next static-analyses segment config); mirrors
// LEGAL_REVALIDATE_SECONDS in lib/legal/getLegalDocument.ts (1h).
export const revalidate = 3600;

export default async function TermsVersionPage({
  params,
}: {
  params: Promise<{ version: string }>;
}) {
  const { version } = await params;
  return <LegalDocument docType="terms_of_service" version={version} />;
}
