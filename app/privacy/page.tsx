import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Privacy Policy — Trackd Co",
};

export default function PrivacyPage() {
  return <LegalDocument docType="privacy_policy" />;
}
