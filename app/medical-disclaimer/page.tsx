import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Medical Disclaimer — Trackd Co",
};

// Public, user-identical page — statically render + revalidate on a schedule (ISR).
// Must be a literal (Next static-analyses segment config); mirrors
// LEGAL_REVALIDATE_SECONDS in lib/legal/getLegalDocument.ts (1h).
export const revalidate = 3600;

export default function MedicalDisclaimerPage() {
  return <LegalDocument docType="medical_disclaimer" />;
}
