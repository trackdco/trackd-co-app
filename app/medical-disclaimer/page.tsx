import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Medical Disclaimer — Trackd Co",
};

export default function MedicalDisclaimerPage() {
  return <LegalDocument docType="medical_disclaimer" />;
}
