-- ============================================================
--  Legal documents, the rename - effective 24 September 2026 (Adrian, 2026-09-22).
--
--  The product is called Trakabl. This makes the renamed Terms, Privacy Policy,
--  Medical Disclaimer and Consumer Health Data notice LIVE, and demotes their
--  predecessors to history.
--
--  ⚠️ ALL FOUR DOCUMENTS, unlike 015, which touched three. And they do NOT share
--  a version number: terms, privacy and consumer_health_data go 2.1 -> 2.2,
--  medical_disclaimer goes 2.0 -> 2.1. Each bumps one point from wherever it
--  actually was. `app/(app)/legal-acceptance.ts` reads each doc_type's current
--  version independently, so a staggered set is a supported state, not drift.
--
-- ------------------------------------------------------------
--  ▶ HOW TO RUN THIS
-- ------------------------------------------------------------
--
--   1. FIRST, ingest the text. This migration does NOT carry it:
--
--          node scripts/legal-v2-2-ingest.mjs
--
--      That inserts four rows with is_current = false. It refuses outright if
--      any document still mentions the old product name anywhere outside the
--      registered entity and the domain, carries an em dash, or is missing the
--      sentences this version exists to add. If it refuses, STOP - do not run
--      this.
--
--   2. THEN paste this whole file into the Supabase SQL Editor and run it.
--      It is one transaction: it either flips all four or changes nothing.
--
--   3. THEN run the VERIFY block at the bottom and read the rows.
--
--  ⚠️ THE TEXT IS NOT IN THIS FILE, DELIBERATELY. `Context/legal-v2/*.md` is the
--  source of truth. Duplicating a legal document into a migration is how two
--  copies of it drift apart. This file moves a flag; the ingest carries words.
--
-- ------------------------------------------------------------
--  WHAT CHANGED
-- ------------------------------------------------------------
--
--  The four live documents named the old product 65 times between them - in
--  section headings ("Who can use Trackd"), and in the sentences that carry the
--  most weight ("Trackd is not a medical device, pharmacy, laboratory..."). Every
--  one of those was on screen: `components/legal/legal-document.tsx` renders
--  `body` straight out of this table onto /terms, /privacy, /medical-disclaimer
--  and /consumer-health-data.
--
--  ⚠️ THE COMPANY IS NOT RENAMED, and every document still says so. Trakabl is a
--  registered business name; the contracting party remains Trackd Co Pty Ltd
--  (ACN 698 405 462). The preambles now state the relationship explicitly -
--  "trading as Trakabl" - rather than leaving a reader to reconcile the app's
--  name with the entity on their card statement. `trackdco.app` is likewise
--  unchanged, because it is still the live domain.
--
--  ⚠️ PRIVACY §1 AND THE CONSENT TICK MOVED TOGETHER, and had to. The Policy
--  quotes the health-consent box verbatim. That box was re-signed for the rename
--  (`lib/legal/consentCopy.ts`) because an app called Trakabl cannot show a
--  consent naming Trackd - and the pre-rename wording is preserved beside it, un-
--  edited, as the record of what the 81 existing consent rows were granted
--  against. Those rows are NOT re-granted by this migration and their meaning
--  does not change.
--
-- ------------------------------------------------------------
--  ⚠️ WHY NO ADVANCE NOTICE IS REQUIRED, IN THE DOCUMENTS' OWN WORDS
-- ------------------------------------------------------------
--
--  Terms §25 splits changes in two. MATERIAL changes - "any change to fees, to
--  the Medical Disclaimer, to our liability to you, or to how we process your
--  data" - require notice in advance, before the change takes effect. MINOR OR
--  OPERATIONAL changes are handled by updating the document and its version
--  number, which is exactly what this does.
--
--  A product name change is none of the material categories. It alters no fee,
--  no liability, no processing purpose, and no medical guidance.
--
--  The Medical Disclaimer needs its own sentence, because §25 names it as a
--  material category. That clause is about changes TO THE DISCLAIMER - its
--  warnings, its scope, what it tells somebody not to do. Renaming the product
--  inside it changes none of those: the substance is identical but for the name.
--  Treated as operational on that basis, with Adrian's explicit sign-off
--  (2026-09-22).
--
--  Notice still happens, and it is stronger than §25 requires. The rebrand
--  notice (`components/rebrand/RebrandNotice.tsx`) is shown once to every
--  account that existed under the old name, links both documents, and records
--  the acceptance. `consent_records` will begin stamping the new versions for
--  anyone who accepts after this runs, because `legal-acceptance.ts` reads the
--  live version rather than a literal.
-- ============================================================

begin;

-- ⚠️ REFUSE IF THE TEXT IS NOT THERE. Without this, the UPDATE below would
-- demote the current rows and promote nothing, leaving all four pages with NO
-- current row - which `getCurrentLegalDocument` answers with nothing, so every
-- one of them would 404. The consumer health data page is the one Washington's
-- My Health My Data Act requires to be findable.
do $$
declare
  found_rows int;
begin
  select count(*) into found_rows
    from legal_documents
   where (version = '2.2' and doc_type in ('terms_of_service', 'privacy_policy', 'consumer_health_data'))
      or (version = '2.1' and doc_type = 'medical_disclaimer');

  if found_rows <> 4 then
    raise exception
      'REFUSING: expected 4 incoming rows, found %. Run `node scripts/legal-v2-2-ingest.mjs` first.',
      found_rows;
  end if;
end $$;

-- ⚠️ REFUSE IF THE INCOMING TEXT STILL NAMES THE OLD PRODUCT. The ingest script
-- guards this too, but the guard has to exist on this side as well: the rows
-- could have been written by an older ingest, by hand, or by a re-run against a
-- stale checkout. Publishing a contract that names a product which no longer
-- exists is the one failure this whole migration is for.
--
-- The entity and the domain are stripped first - both correctly keep the old
-- spelling.
do $$
declare
  bad record;
begin
  for bad in
    select doc_type, version
      from legal_documents
     where ((version = '2.2' and doc_type in ('terms_of_service', 'privacy_policy', 'consumer_health_data'))
         or (version = '2.1' and doc_type = 'medical_disclaimer'))
       and replace(replace(body, 'Trackd Co Pty Ltd', ''), 'trackdco.app', '') ILIKE '%trackd%'
  loop
    raise exception
      'REFUSING: % v% still names the old product outside the entity and the domain.',
      bad.doc_type, bad.version;
  end loop;
end $$;

-- Demote the outgoing versions. All four doc_types this time.
update legal_documents
   set is_current = false
 where is_current = true
   and doc_type in ('terms_of_service', 'privacy_policy', 'consumer_health_data', 'medical_disclaimer');

-- Promote the renamed rows. The partial unique index `(doc_type) WHERE
-- is_current` is what guarantees the demote above actually happened: if it had
-- not, this would fail the constraint and the whole transaction would roll back
-- rather than leaving two current rows for one document.
update legal_documents
   set is_current = true
 where (version = '2.2' and doc_type in ('terms_of_service', 'privacy_policy', 'consumer_health_data'))
    or (version = '2.1' and doc_type = 'medical_disclaimer');

commit;

-- ------------------------------------------------------------
--  ▶ VERIFY afterwards. Expect FOUR current rows, and says_old_name FALSE on
--    every one of them.
-- ------------------------------------------------------------
--
-- SELECT doc_type,
--        version,
--        is_current,
--        effective_date,
--        (replace(replace(body, 'Trackd Co Pty Ltd', ''), 'trackdco.app', '')
--           ILIKE '%trackd%')                                AS says_old_name,
--        (body LIKE '%Trakabl%')                             AS says_new_name,
--        (body LIKE '%Trackd Co Pty Ltd%')                   AS names_entity,
--        (body LIKE '%—%')                                   AS has_em_dash,
--        length(body)                                        AS chars
--   FROM legal_documents
--  WHERE is_current
--  ORDER BY doc_type;
--
--   EXPECT, for the four current rows:
--     consumer_health_data  2.2  says_old_name=false  says_new_name=true  names_entity=true
--     medical_disclaimer    2.1  says_old_name=false  says_new_name=true  names_entity=true
--     privacy_policy        2.2  says_old_name=false  says_new_name=true  names_entity=true
--     terms_of_service      2.2  says_old_name=false  says_new_name=true  names_entity=true
--
--   AND has_em_dash = false on ALL FOUR. `012_em_dashes.sql` removed them and a
--   re-introduction here would silently undo an applied migration.
--
--   AND exactly one current row per doc_type:
--
-- SELECT doc_type, count(*) FROM legal_documents WHERE is_current
--  GROUP BY doc_type HAVING count(*) <> 1;   -- expect ZERO rows
--
--   AND the predecessors survive as history, because `consent_records` rows
--   point at them:
--
-- SELECT doc_type, version, is_current FROM legal_documents
--  WHERE (doc_type <> 'medical_disclaimer' AND version = '2.1')
--     OR (doc_type  = 'medical_disclaimer' AND version = '2.0')
--  ORDER BY doc_type;                        -- expect 4 rows, is_current=false
