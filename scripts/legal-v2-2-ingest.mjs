/**
 * INGEST THE RENAME VERSIONS OF THE LEGAL DOCUMENTS.
 * Source of truth: `Context/legal-v2/*.md`.
 *
 * ▶ HOW TO RUN THIS
 *
 *     node scripts/legal-v2-2-ingest.mjs
 *
 * Then apply `supabase/legal/016_legal_documents_rename.sql` to make them live.
 * This script alone changes nothing anybody reads.
 *
 * ## What changed, and why there is a version bump at all
 *
 * The product is called Trakabl. The four live documents named the old product
 * 65 times between them — in section headings ("Who can use Trackd") and in the
 * load-bearing sentences ("Trackd is NOT a medical device"). None of that is
 * cosmetic: `/terms`, `/privacy`, `/medical-disclaimer` and
 * `/consumer-health-data` render `body` straight out of this table, so every
 * one of those 65 was on screen.
 *
 * ⚠️ THIS WAS ALMOST MISSED ENTIRELY, and the reason is worth keeping.
 * A grep of the repo does not find it — the documents live in Postgres. And the
 * rename's own allowlist said "historical references in Context/ docs are
 * correct as history", which is true of every file in that directory EXCEPT
 * these four: `Context/legal-v2/*.md` is not history, it is the source text of
 * the live contract. A reviewer applying that rule literally skips the largest
 * user-visible defect in the whole rename.
 *
 * ## ⚠️ WHY THIS IS A POINT RELEASE AND NOT A RE-CONSENT CAMPAIGN
 *
 * Terms §25 splits changes in two. MATERIAL changes — "any change to fees, to
 * the Medical Disclaimer, to our liability to you, or to how we process your
 * data" — require advance notice before they take effect. MINOR OR OPERATIONAL
 * changes are handled by updating the document and its version number.
 *
 * A product name change is none of the material categories. It alters no fee,
 * no liability, no processing purpose and no medical guidance. So it is
 * operational, and §25's own prescription is exactly what this does: update the
 * document, bump the version (Adrian, 2026-09-22).
 *
 * The Medical Disclaimer needs its own sentence, because §25 names it as a
 * material category. That clause is about changes TO THE DISCLAIMER — its
 * warnings, its scope, what it tells somebody not to do. Renaming the product
 * inside it changes none of those; the substance is byte-identical but for the
 * name. Treated as operational on that basis, with Adrian's explicit sign-off.
 *
 * Notice still happens, and it is stronger than §25 requires: the rebrand
 * notice (`components/rebrand/RebrandNotice.tsx`) tells every pre-rename
 * account the name changed, links both documents, and records the acceptance.
 *
 * ## ⚠️ FOUR DOCUMENTS, AND THEY DO NOT SHARE A VERSION NUMBER
 *
 * v2.1 ingested three and left the Medical Disclaimer at 2.0, because it said
 * nothing about deletion. This one touches all four, so each bumps one point
 * from wherever it actually was: three go 2.1 → 2.2, the disclaimer goes
 * 2.0 → 2.1. `legal-acceptance.ts` reads each doc_type's current version
 * independently, so a staggered set is a supported state rather than a mess.
 * VERSION is therefore per-document here, not the single constant v2.1 used.
 *
 * ## ⚠️ INSERTED NOT-CURRENT, DELIBERATELY
 *
 * `legal_documents` carries a partial unique index, `(doc_type) WHERE
 * is_current`, so two current rows for one doc_type is impossible. Demoting the
 * old row and promoting the new one from here would be two round trips with a
 * window in between where the doc_type has NO current row — and
 * `getCurrentLegalDocument` returns nothing then, so `/privacy` would 404 for
 * exactly as long as that took. Insert dormant, flip in one SQL transaction.
 *
 * ## Idempotent
 *
 * Upsert on `(doc_type, version)`, so a re-run rewrites the same four rows.
 */
import { readFileSync } from "node:fs";
import { admin } from "../scratchpad/admin.mjs";

const EFFECTIVE = "2026-09-22";
const EFFECTIVE_LINE = "EFFECTIVE 22 September 2026";

/**
 * ⚠️ THE ONLY PLACE THE OLD NAME MAY STILL APPEAR IN A LEGAL DOCUMENT.
 *
 * The company was NOT renamed. Trakabl is a registered business name; the
 * contracting party is still Trackd Co Pty Ltd, and every document has to keep
 * saying so or it names a company that does not exist. The domain is likewise
 * still live and still correct.
 *
 * Both are stripped before the brand guard counts what is left, so the guard
 * can be absolute about everything else.
 */
const ALLOWED_OLD_NAME = [/Trackd Co Pty Ltd/g, /trackdco\.app/g];

const DOCS = [
  {
    file: "terms.md",
    docType: "terms_of_service",
    version: "2.2",
    mustContain: [
      'trading as Trakabl ("Trakabl", "we", "us" or "our")',
      "use of the Trakabl application",
      // Carried forward from v2.1 — these must not regress.
      "Both cancelling and deleting are instant and self-service",
    ],
    mustNotContain: ["deletion requests are processed by a person"],
  },
  {
    file: "privacy.md",
    docType: "privacy_policy",
    version: "2.2",
    mustContain: [
      'trading as Trakabl ("Trakabl", "we", "us", "our")',
      // ⚠️ The Policy quotes the consent tick verbatim, and the tick was
      // re-signed for the rename (`lib/legal/consentCopy.ts`). If these two
      // disagree, the page defining the consent contradicts the box giving it.
      "I explicitly consent to Trakabl processing my health-related data",
      "the deletion runs immediately",
    ],
    mustNotContain: ["typically within 30 days"],
  },
  {
    file: "medical-disclaimer.md",
    docType: "medical_disclaimer",
    version: "2.1",
    mustContain: [
      "This document forms part of the Trakabl Terms of Service",
      "Trakabl is not a medical device, pharmacy, laboratory",
    ],
    mustNotContain: [],
  },
  {
    file: "consumer-health-data.md",
    docType: "consumer_health_data",
    version: "2.2",
    mustContain: [
      "trading as Trakabl, covering the Trakabl application",
      "removes your account data and your uploaded files immediately",
    ],
    mustNotContain: ["typically within 30 days"],
  },
];

let failed = false;

for (const d of DOCS) {
  const body = readFileSync(`Context/legal-v2/${d.file}`, "utf8").replace(/\s+$/, "");
  const title = body.split("\n")[0].trim();
  const refuse = (why) => {
    console.error(`  REFUSED ${d.file}: ${why}`);
    failed = true;
  };

  // ── the controls every version has had ────────────────────────────────────
  if (body.length < 3000) refuse(`body only ${body.length} chars`);
  if (body.includes("Â")) refuse("mojibake present");
  if (!body.includes(EFFECTIVE_LINE)) refuse(`no "${EFFECTIVE_LINE}" line`);
  if (!body.includes(`VERSION ${d.version}`)) {
    refuse(`header does not say VERSION ${d.version}`);
  }

  // ── ⚠️ NO EM DASHES. `012_em_dashes.sql` stripped them from every document
  //    and its VERIFY block asserts none remain. Re-introducing one here would
  //    silently undo a migration that has already been applied and checked.
  const emDashes = (body.match(/—/g) ?? []).length;
  if (emDashes > 0) refuse(`${emDashes} em dash(es) present`);

  /**
   * ── ⚠️ THE BRAND GUARD, WHICH IS THE WHOLE REASON THIS VERSION EXISTS ─────
   *
   * Strip the two legitimate survivors, then refuse on ANY remaining mention of
   * the old name. Without this the failure is silent in the worst possible way:
   * the text renders, the page loads, every test passes, and only a reader
   * notices that the contract names a product that no longer exists.
   *
   * It is deliberately absolute rather than a phrase list. The 65 mentions were
   * spread through headings and body prose with no common shape, so anything
   * enumerating them would miss the next one.
   */
  let residue = body;
  for (const allowed of ALLOWED_OLD_NAME) residue = residue.replace(allowed, "");
  const stale = (residue.match(/Trackd/gi) ?? []).length;
  if (stale > 0) {
    const sample = residue.match(/.{0,60}Trackd.{0,60}/i)?.[0]?.trim() ?? "";
    refuse(
      `${stale} mention(s) of the old product name remain (outside the entity ` +
        `and the domain, which are allowed). First: "…${sample}…"`,
    );
  }

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
      version: d.version,
      title,
      body,
      effective_date: EFFECTIVE,
      is_beta: false,
      // ⚠️ DORMANT. See the module comment. `016` flips them.
      is_current: false,
    },
    { onConflict: "doc_type,version" },
  );
  if (error) {
    refuse(error.message);
    continue;
  }

  console.log(
    `  ok ${d.docType.padEnd(22)} v${d.version}  ${String(body.length).padStart(6)} chars  is_current=false  "${title}"`,
  );
}

if (failed) {
  console.error("\n⚠️ ONE OR MORE DOCUMENTS WERE REFUSED. Nothing further was written.");
  console.error("   Fix Context/legal-v2/*.md and re-run. Do NOT apply 016 until this is clean.\n");
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
console.log("\nNext: apply supabase/legal/016_legal_documents_rename.sql to make these live.\n");
