import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/legal-document";

/**
 * THE CONSUMER HEALTH DATA PRIVACY POLICY (v2.0, effective 27 August 2026).
 *
 * ## ⚠️ THIS PAGE EXISTS BECAUSE A LAW REQUIRES IT, NOT BECAUSE IT IS TIDY
 *
 * Washington's My Health My Data Act requires a consumer health data privacy
 * policy published under that name and reachable WITHOUT LOGGING IN. Nevada's
 * SB 370 and the Connecticut Data Privacy Act are in the same family. The link
 * to it must be findable from the homepage — burying it behind auth is the
 * specific failure the statute names.
 *
 * ## It is Section 16 of the Privacy Policy, republished word for word
 *
 * Not a summary and not a variant. The Privacy Policy says so itself: "We also
 * publish it separately, word for word, as our Consumer Health Data Privacy
 * Policy, so that it is easy to find." Both come from `Context/legal-v2/`, and
 * if they ever diverge the Privacy Policy becomes false about its own contents.
 *
 * ⚠️ IT TAKES NO CONSENT STEP OF ITS OWN. There is no `consent_records` value
 * for it and there must not be: the consent it describes is the health-data tick,
 * recorded against the PRIVACY POLICY's version. A second acceptance for a
 * republication would record one agreement twice and make the audit trail lie
 * about how many things the user agreed to.
 */
export const metadata: Metadata = {
  title: "Consumer Health Data Privacy Policy · Trackd Co",
};

// Public, user-identical page — statically render + revalidate on a schedule
// (ISR). Must be a literal (Next static-analyses segment config); mirrors
// LEGAL_REVALIDATE_SECONDS in lib/legal/getLegalDocument.ts (1h).
export const revalidate = 3600;

export default function ConsumerHealthDataPage() {
  return <LegalDocument docType="consumer_health_data" />;
}
