/**
 * INGEST THE v2.1 LEGAL DOCUMENTS. Source of truth: `Context/legal-v2/*.md`.
 *
 * ▶ HOW TO RUN THIS
 *
 *     node scripts/legal-v2-1-ingest.mjs
 *
 * Then apply `supabase/legal/015_legal_documents_v2_1.sql` to make them live.
 * This script alone changes nothing anybody reads.
 *
 * ## What changed, and why there is a v2.1 at all
 *
 * Spec 16 replaced deletion-by-support-email with a real in-app deletion. Three
 * documents described the flow it replaced, and were about to become false the
 * moment it shipped:
 *
 *   privacy §8   "opens a pre-filled email to support@trackdco.app"
 *   privacy §8   "typically within 30 days", files removed by hand later
 *   privacy §7   "Deleting your account does not remove it either" (the device)
 *   privacy §16  the same 30-day sentence, duplicated
 *   terms §24    "deletion requests are processed by a person"
 *   consumer-health-data  the same 30-day sentence again
 *
 * The medical disclaimer says nothing about deletion and stays at v2.0.
 * `legal-acceptance.ts:64-73` reads each doc_type's current version
 * independently, so the four documents sitting at different versions is a
 * supported state rather than a mess to tidy.
 *
 * ## ⚠️ VERSIONED 2.1, WHICH OVERRIDES THE RULE IN `001_legal_documents.sql:29`
 *
 * That rule says each change bumps a whole version. Adrian ruled otherwise on
 * 2026-09-05: whole numbers are for releases the size of billing, and a point
 * release is right for a change this small. He will call the next major bump.
 * Recorded as D115. There was already precedent, since v1.3 exists.
 *
 * ## ⚠️ INSERTED NOT-CURRENT, DELIBERATELY
 *
 * `legal_documents` carries a partial unique index, `(doc_type) WHERE
 * is_current`, so two current rows for one doc_type is impossible. Demoting v2.0
 * from here and promoting v2.1 would be two round trips with a window in between
 * where the doc_type has NO current row - and `getCurrentLegalDocument` returns
 * nothing then, so `/privacy` would 404 for exactly as long as that took. The
 * v2.0 rollout hit the same wall and answered it the same way: insert dormant,
 * flip in one SQL transaction. That flip is `015_legal_documents_v2_1.sql`.
 *
 * ## Idempotent
 *
 * Upsert on `(doc_type, version)`, so a re-run rewrites the same three rows.
 */
import { readFileSync } from "node:fs";
import { admin } from "../scratchpad/admin.mjs";

const VERSION = "2.1";
const EFFECTIVE = "2026-09-05";
const EFFECTIVE_LINE = "EFFECTIVE 5 September 2026";

/**
 * ⚠️ THE CONTROLS ARE THE POINT OF THIS SCRIPT.
 *
 * A legal document that publishes with the old sentence still in it is the exact
 * failure this whole change exists to prevent, and nothing downstream would
 * catch it: the text renders, the page loads, and only a reader notices. So each
 * document names what must now be true of it and what must no longer appear.
 */
const DOCS = [
  {
    file: "privacy.md",
    docType: "privacy_policy",
    mustContain: [
      "the deletion runs immediately",
      "Nothing is queued for a person to process later",
      "Deleting your account clears it on the device you delete from",
      "Another browser or device",
    ],
    mustNotContain: [
      "pre-filled email",
      "One-tap self-service deletion is planned",
      "typically within 30 days",
      "Deleting your account does not remove it either",
    ],
  },
  {
    file: "terms.md",
    docType: "terms_of_service",
    mustContain: [
      "Both cancelling and deleting are instant and self-service",
      '"Delete my account" control in the Service',
    ],
    mustNotContain: [
      "deletion requests are processed by a person",
      "typically within 30 days",
    ],
  },
  {
    file: "consumer-health-data.md",
    docType: "consumer_health_data",
    mustContain: ["removes your account data and your uploaded files immediately"],
    mustNotContain: ["typically within 30 days"],
  },
];

let failed = false;

for (const d of DOCS) {
  const body = readFileSync(`Context/legal-v2/${d.file}`, "utf8").replace(/\s+$/, "");
  const title = body.split("\n")[0].trim();
  const refuse = (why) => { console.error(`  REFUSED ${d.file}: ${why}`); failed = true; };

  // ── the controls v2.0 already had ──────────────────────────────────────────
  if (body.length < 3000) refuse(`body only ${body.length} chars`);
  if (body.includes("Â")) refuse("mojibake present");
  if (!body.includes(EFFECTIVE_LINE)) refuse(`no "${EFFECTIVE_LINE}" line`);
  if (!body.includes(`VERSION ${VERSION}`)) refuse(`header does not say VERSION ${VERSION}`);

  // ── ⚠️ NO EM DASHES. `012_em_dashes.sql` stripped them from every document
  //    and its VERIFY block asserts none remain. Re-introducing one here would
  //    silently undo a migration that has already been applied and checked.
  const emDashes = (body.match(/—/g) ?? []).length;
  if (emDashes > 0) refuse(`${emDashes} em dash(es) present`);

  // ── the sentences this version exists to change ───────────────────────────
  for (const phrase of d.mustContain) {
    if (!body.includes(phrase)) refuse(`missing required text: "${phrase}"`);
  }
  for (const phrase of d.mustNotContain) {
    if (body.includes(phrase)) refuse(`still contains superseded text: "${phrase}"`);
  }

  if (failed) continue;

  const { error } = await admin.from("legal_documents").upsert(
    {
      doc_type: d.docType,
      version: VERSION,
      title,
      body,
      effective_date: EFFECTIVE,
      is_beta: false,
      // ⚠️ DORMANT. See the module comment. `015` flips them.
      is_current: false,
    },
    { onConflict: "doc_type,version" },
  );
  if (error) { refuse(error.message); continue; }

  console.log(
    `  ok ${d.docType.padEnd(22)} v${VERSION}  ${String(body.length).padStart(6)} chars  is_current=false  "${title}"`,
  );
}

if (failed) {
  console.error("\n⚠️ ONE OR MORE DOCUMENTS WERE REFUSED. Nothing further was written.");
  console.error("   Fix Context/legal-v2/*.md and re-run. Do NOT apply 015 until this is clean.\n");
  process.exit(1);
}

console.log("\n=== every row now in the table ===");
const { data } = await admin
  .from("legal_documents")
  .select("doc_type,version,is_current,effective_date")
  .order("doc_type")
  .order("version");
for (const r of data ?? []) {
  console.log(
    `  ${r.doc_type.padEnd(22)} v${String(r.version).padEnd(5)} is_current=${String(r.is_current).padEnd(5)} ${r.effective_date ?? ""}`,
  );
}
console.log("\nNext: apply supabase/legal/015_legal_documents_v2_1.sql to make v2.1 live.\n");
