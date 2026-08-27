/**
 * INGEST THE v2.0 LEGAL DOCUMENTS. Source of truth: `Context/legal-v2/*.md`.
 *
 * ⚠️ THE BODY IS STORED VERBATIM, INCLUDING ITS MARKDOWN. `legal-document.tsx`
 * renders `##`/`###` headings, `-`/`•` bullets and `**bold**` natively, and drops
 * the first line (the title) and the second (the version). The v1.3 bodies were
 * flattened to plain text by an older migration; nothing requires that, and
 * flattening v2.0 would lose every heading and every bold safety warning.
 *
 * ⚠️ is_current IS FALSE FOR THE THREE EXISTING DOCUMENTS. `consent_records`
 * stamps whichever version is current, so making 2.0 live before 27 August would
 * record people as accepting documents that are not yet in force. One SQL
 * statement flips them on launch morning.
 *
 * ⚠️ EXCEPT the Consumer Health Data Privacy Policy, which is NEW and has no
 * prior version. Inserted current, because `getCurrentLegalDocument` returns
 * nothing for a doc_type with no current row and the page would 404 — and that
 * page is the one Washington's My Health My Data Act requires to be findable.
 * It carries its own "EFFECTIVE 27 August 2026" line, which the brief allows.
 */
import { readFileSync } from "node:fs";
import { admin } from "../scratchpad/admin.mjs";

const VERSION = "2.0";
const EFFECTIVE = "2026-08-27";

const DOCS = [
  { file: "terms.md",                docType: "terms_of_service",     current: false },
  { file: "privacy.md",              docType: "privacy_policy",       current: false },
  { file: "medical-disclaimer.md",   docType: "medical_disclaimer",   current: false },
  { file: "consumer-health-data.md", docType: "consumer_health_data", current: true  },
];

for (const d of DOCS) {
  const body = readFileSync(`Context/legal-v2/${d.file}`, "utf8").replace(/\s+$/, "");
  const title = body.split("\n")[0].trim();

  // ⚠️ CONTROLS, before anything is written. A silently-truncated or
  // wrong-document body is the one failure that must never reach a user.
  if (body.length < 3000) throw new Error(`${d.file}: body only ${body.length} chars — refusing`);
  if (body.includes("Â")) throw new Error(`${d.file}: mojibake present — refusing`);
  if (!body.includes("EFFECTIVE 27 August 2026")) throw new Error(`${d.file}: no effective-date line — refusing`);

  const { error } = await admin.from("legal_documents").upsert(
    { doc_type: d.docType, version: VERSION, title, body,
      effective_date: EFFECTIVE, is_beta: false, is_current: d.current },
    { onConflict: "doc_type,version" },
  );
  if (error) throw new Error(`${d.docType}: ${error.message}`);
  console.log(`  ok ${d.docType.padEnd(22)} v${VERSION}  ${String(body.length).padStart(6)} chars  is_current=${d.current}  "${title}"`);
}

console.log("\n=== every row now in the table ===");
const { data } = await admin.from("legal_documents")
  .select("doc_type,version,is_current,effective_date").order("doc_type").order("version");
for (const r of data) {
  console.log(`  ${r.doc_type.padEnd(22)} v${r.version.padEnd(4)} current=${String(r.is_current).padEnd(5)} eff=${r.effective_date ?? "-"}`);
}
