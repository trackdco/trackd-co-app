-- ============================================================
--  014_legal_documents_supersedes_v1_3.sql
--  The lineage line names a version that never existed. D110.
--
--  ⚠️ HAND-APPLIED BY ADRIAN. No agent runs this. Written 2026-08-26.
--  ⚠️ THIS IS LIVE LEGAL-DOCUMENT DATA, CURRENTLY IN FORCE. Three rows,
--     one occurrence each, ONE CHARACTER each: "4" -> "3".
-- ============================================================
--
--  ## What is wrong
--
--  Three of the four live v2.0 documents open with:
--
--      Terms of Service
--      VERSION 2.0 · EFFECTIVE 27 August 2026
--      Supersedes v1.4.
--
--  There has never been a v1.4. The ladder in this table is
--  0.1 / 0.2 -> 1.0 -> 1.3 -> 2.0, measured 2026-08-26. A v1.4 was DRAFTED
--  (`Context/ADRIAN-CHECKLIST.md` recorded "a v1.4 written and not yet in the
--  code") and never reached a row, and the v2.0 documents inherited its number
--  into their own lineage.
--
--  A legal document that names its own predecessor wrongly is wrong about the
--  one thing a version header exists to state. Adrian's ruling: "Supersedes v1.3."
--
--  `consumer_health_data` is NOT touched. It is a new doc_type with no
--  predecessor and carries no lineage line at all (verified: it matches neither
--  'Supersedes v1.4' nor 'Supersedes v1.3').
--
--  ## Measured before writing this file, from the rows
--
--    doc_type            version  is_current  occurrences  byte offset
--    medical_disclaimer  2.0      true        1            59
--    privacy_policy      2.0      true        1            55
--    terms_of_service    2.0      true        1            57
--
--  EM-DASH SWEEP: the replacement text "Supersedes v1.3." contains no em dash,
--  and no U+2014 appears anywhere in any of the three bodies (measured:
--  `body LIKE '%—%'` is false for all three). The separator in the VERSION line
--  is U+00B7 MIDDLE DOT (\302\267), not an em dash, and is not touched.
--
--  ## Why `replace()` and not a rewritten body
--
--  Re-ingesting the whole document to change one character would put 25,644 /
--  31,185 / 7,283 characters of live legal text through a write in order to move
--  one of them. `replace()` on a string that occurs exactly once changes exactly
--  that string, and the guard below proves the count before anything moves.
--
--  ⚠️ THE SOURCE OF TRUTH IS ALSO FIXED. `Context/legal-v2/{terms,privacy,
--  medical-disclaimer}.md` carried the same line and were corrected in the same
--  commit. `scripts/legal-v2-ingest.mjs` upserts on (doc_type, version), so
--  leaving them would mean the next ingest silently reinstates "v1.4" over this.
--
-- ------------------------------------------------------------
--  ▶ HOW TO RUN THIS
-- ------------------------------------------------------------
--
--   Supabase SQL Editor. One transaction. Safe to run twice: the second run
--   finds zero rows to move and raises the "already corrected" notice rather
--   than an exception.
--
--   It REFUSES if it does not find exactly three rows carrying exactly one
--   occurrence each. Anything else means the documents are not the shape this
--   file measured, and the right response is to stop and look.
--
-- ============================================================

begin;

do $$
declare
  targets  int;
  extras   int;
  already  int;
  moved    int;
begin
  select count(*) into already
  from public.legal_documents
  where version = '2.0' and body like '%Supersedes v1.3.%';

  select count(*) into targets
  from public.legal_documents
  where version = '2.0' and body like '%Supersedes v1.4.%';

  if targets = 0 and already = 3 then
    raise notice 'supersedes_v1_3: already corrected, all three rows read "Supersedes v1.3." Nothing to do.';
    return;
  end if;

  if targets <> 3 then
    raise exception
      'supersedes_v1_3: expected exactly 3 rows carrying "Supersedes v1.4." and found %. Refusing. Nothing has been changed. Inspect: SELECT doc_type, version, is_current FROM legal_documents WHERE body LIKE ''%%Supersedes v1.%%'';',
      targets;
  end if;

  -- ⚠️ ONE OCCURRENCE PER ROW. `replace()` replaces EVERY occurrence, so a row
  -- carrying two would be changed in a place this file never measured.
  select count(*) into extras
  from public.legal_documents
  where version = '2.0'
    and body like '%Supersedes v1.4.%'
    and (length(body) - length(replace(body, 'Supersedes v1.4.', '')))
        / length('Supersedes v1.4.') <> 1;

  if extras > 0 then
    raise exception
      'supersedes_v1_3: % row(s) carry "Supersedes v1.4." more than once. Refusing: replace() would rewrite a second site this file never measured. Nothing has been changed.',
      extras;
  end if;

  update public.legal_documents
     set body = replace(body, 'Supersedes v1.4.', 'Supersedes v1.3.')
   where version = '2.0'
     and body like '%Supersedes v1.4.%';
  get diagnostics moved = row_count;

  raise notice 'supersedes_v1_3: corrected % row(s). One character each.', moved;
end $$;

commit;

-- ------------------------------------------------------------
--  ▶ VERIFY afterwards. Expect THREE rows, all reading v1.3, and ZERO v1.4.
-- ------------------------------------------------------------
--
-- SELECT doc_type,
--        version,
--        is_current,
--        (body LIKE '%Supersedes v1.3.%') AS says_v1_3,
--        (body LIKE '%Supersedes v1.4.%') AS says_v1_4,
--        (body LIKE '%—%')                AS has_em_dash,
--        substr(body, 1, 80)              AS opening
--   FROM legal_documents
--  WHERE version = '2.0'
--  ORDER BY doc_type;
--
--   EXPECT: says_v1_3 = true for terms_of_service, privacy_policy and
--           medical_disclaimer; says_v1_4 = false for ALL FOUR;
--           has_em_dash = false for ALL FOUR;
--           consumer_health_data false on both lineage columns (it has none).
