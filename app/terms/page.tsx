import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Terms of Service — Trackd Co",
};

export default function TermsPage() {
  return <LegalDocument docType="terms_of_service" />;
}
