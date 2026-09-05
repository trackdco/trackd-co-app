-- ============================================================
--  Legal documents v2.1 - effective 5 September 2026 (Adrian, 2026-09-05).
--
--  Makes the v2.1 Terms, Privacy Policy and Consumer Health Data notice LIVE,
--  and demotes their v2.0 rows to history.
--
-- ------------------------------------------------------------
--  ▶ HOW TO RUN THIS
-- ------------------------------------------------------------
--
--   1. FIRST, ingest the text. This migration does NOT carry it:
--
--          node scripts/legal-v2-1-ingest.mjs
--
--      That inserts three v2.1 rows with is_current = false, refusing outright
--      if any document still contains a superseded sentence, carries an em
--      dash, or is missing its new one. If it refuses, STOP - do not run this.
--
--   2. THEN paste this whole file into the Supabase SQL Editor and run it.
--      It is one transaction: it either flips all three or changes nothing.
--
--   3. THEN run the VERIFY block at the bottom and read the rows.
--
--  ⚠️ THE TEXT IS NOT IN THIS FILE, DELIBERATELY. `Context/legal-v2/*.md` is the
--  source of truth, exactly as `013_legal_documents_v2_0.sql:10-14` states:
--  duplicating a legal document into a migration is how two copies of it drift
--  apart. This file moves a flag; the ingest script carries the words.
--
-- ------------------------------------------------------------
--  WHAT CHANGED IN v2.1
-- ------------------------------------------------------------
--
--  Spec 16 shipped real in-app account deletion, which made three documents
--  describe a flow that no longer exists:
--
--    privacy §7   "Deleting your account does not remove it either" - the
--                 on-device copy is now cleared as part of the deletion.
--    privacy §8   the pre-filled support email, "One-tap self-service deletion
--                 is planned", and "typically within 30 days".
--    privacy §16  the same 30-day sentence.
--    terms §24    "deletion requests are processed by a person".
--    consumer-health-data  the same 30-day sentence again.
--
--  ⚠️ medical_disclaimer is NOT touched and stays at v2.0. It says nothing about
--  deletion. `app/(app)/legal-acceptance.ts:64-73` reads each doc_type's current
--  version independently, so documents sitting at different versions is a
--  supported state, not drift.
--
--  ⚠️ VERSIONED 2.1, OVERRIDING `001_legal_documents.sql:29-31`, which says each
--  change bumps a whole version. Adrian ruled on 2026-09-05 that whole numbers
--  are for releases the size of billing and a point release fits a change this
--  small; he will call the next major bump. Recorded as D115. v1.3 was already
--  a precedent.
--
--  ⚠️ NO RE-ACCEPTANCE IS FORCED, AND NONE IS NEEDED. Terms §25 makes continued
--  use after clear notice the acceptance mechanism. The change is strictly in
--  the user's favour and does not touch how health data is used, which is the
--  one thing Privacy §17 says continued use can never cover. `consent_records`
--  will begin stamping 2.1 for anyone who accepts after this runs, because
--  `legal-acceptance.ts` reads the live version rather than a literal.
-- ============================================================

begin;

-- ⚠️ REFUSE IF THE TEXT IS NOT THERE. Without this, the UPDATE below would
-- demote v2.0 and promote nothing, leaving `/privacy`, `/terms` and the consumer
-- health data page with NO current row - which `getCurrentLegalDocument` answers
-- with nothing, so all three would 404. That page is the one Washington's My
-- Health My Data Act requires to be findable.
do $$
declare
  found_rows int;
begin
  select count(*) into found_rows
    from legal_documents
   where version = '2.1'
     and doc_type in ('terms_of_service', 'privacy_policy', 'consumer_health_data');

  if found_rows <> 3 then
    raise exception
      'REFUSING: expected 3 rows at v2.1, found %. Run `node scripts/legal-v2-1-ingest.mjs` first.',
      found_rows;
  end if;
end $$;

-- Demote the outgoing versions. Scoped to the three doc_types on purpose, so
-- medical_disclaimer v2.0 stays current and keeps its page.
update legal_documents
   set is_current = false
 where is_current = true
   and doc_type in ('terms_of_service', 'privacy_policy', 'consumer_health_data');

-- Promote v2.1. The partial unique index `(doc_type) WHERE is_current` is what
-- guarantees the demote above actually happened: if it had not, this would fail
-- the constraint and the whole transaction would roll back rather than leaving
-- two current rows for one document.
update legal_documents
   set is_current = true
 where version = '2.1'
   and doc_type in ('terms_of_service', 'privacy_policy', 'consumer_health_data');

commit;

-- ------------------------------------------------------------
--  ▶ VERIFY afterwards. Expect FOUR current rows: three at 2.1 and the
--    medical disclaimer still at 2.0. Every says_* column must read as noted.
-- ------------------------------------------------------------
--
-- SELECT doc_type,
--        version,
--        is_current,
--        effective_date,
--        (body LIKE '%typically within 30 days%')            AS says_30_days,
--        (body LIKE '%processed by a person%')               AS says_by_person,
--        (body LIKE '%pre-filled email%')                    AS says_email,
--        (body LIKE '%does not remove it either%')           AS says_device_survives,
--        (body LIKE '%—%')                                   AS has_em_dash,
--        length(body)                                        AS chars
--   FROM legal_documents
--  WHERE is_current
--  ORDER BY doc_type;
--
--   EXPECT, for the four current rows:
--     terms_of_service      2.1  says_30_days=false  says_by_person=false
--     privacy_policy        2.1  says_30_days=false  says_email=false
--                                says_device_survives=false
--     consumer_health_data  2.1  says_30_days=false
--     medical_disclaimer    2.0  (unchanged, and mentions none of these)
--
--   AND has_em_dash = false on ALL FOUR. `012_em_dashes.sql` removed them and
--   a re-introduction here would silently undo an applied migration.
--
--   AND exactly one current row per doc_type:
--
-- SELECT doc_type, count(*) FROM legal_documents WHERE is_current
--  GROUP BY doc_type HAVING count(*) <> 1;   -- expect ZERO rows
