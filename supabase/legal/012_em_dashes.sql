-- ============================================================
--  Em dashes out of the LIVE legal documents. Migration: `legal_em_dashes`
--
--  APPLIED by Adrian, 2026-08-12. VERIFIED by executing: all 13 replacement
--  strings are present in the live rows, 0 originals remain, the 6 superseded
--  rows still hold their 67 em dashes, and all three current rows are still
--  v1.3 (no version bump, so consent_records still point at live documents).
--
--  RE-RUN 2026-08-16 via Supabase MCP `apply_migration` (name:
--  `legal_documents_em_dashes`), because `next-tasks.md` still carried this file
--  as NOT APPLIED and contradicted the line above. The re-run is safe by design
--  -- every statement is guarded by its own LIKE, so an already-applied file is
--  a no-op -- and it is NOT KNOWN whether it changed any row: the pre-check only
--  measured "does this doc contain an em dash" (true for all three, which is
--  also true when correctly applied, because of the title below), not a count.
--
--  What IS proven, measured after the run:
--    Each of the three current docs contains EXACTLY ONE em dash, and in every
--    case it is the title separator -- "Trackd Co --- Terms of Service",
--    "--- Privacy Policy", "--- Medical Disclaimer". No prose em dash remains.
--    That one is CORRECT and deliberate: `components/legal/legal-document.tsx`
--    line 131 renders `doc.title.replace(/^Trackd Co\s*[--]\s*/, "")`, so the
--    prefix and its separator are stripped before anything is shown. The
--    character class accepts an em dash or a hyphen, so the row can hold either.
--    It never reaches a user, and this file has always left it alone.
--
--  NOTE: the live PAGES lag by up to an hour. `getLegalDocument` wraps the read
--  in `unstable_cache` with a 3600s revalidate, so /terms, /privacy and
--  /medical-disclaimer serve the previous text until it expires. Nothing to do;
--  it self-heals. `revalidateTag('legal-documents')` would be instant if a
--  publish flow ever needs it.
-- ============================================================
--
--  WHY
--    House rule: NO EM DASHES in any user-facing string. The legal documents are
--    text rows in Postgres, not files, so the repo-wide sweep never touched
--    them — and they ARE user-facing: `/terms`, `/privacy` and
--    `/medical-disclaimer` render `body` verbatim.
--
--    Sixteen in the three CURRENT rows (v1.3). The superseded rows are left
--    exactly as they are: they are the historical record of what somebody
--    consented to, and editing them would falsify it.
--
--  ⚠️ NO VERSION BUMP, and that is deliberate — the same call
--     `011_support_email.sql` made and for the same reason. The substance is
--     unchanged; bumping the version would make every existing `consent_records`
--     row read as consent to a SUPERSEDED document, which would be a
--     compliance regression caused by punctuation.
--
--  ⚠️ TARGETED REPLACEMENTS, NOT A BLANKET `replace(body, '—', ',')`.
--     Several of these dashes are PAIRED and doing the work of parentheses:
--
--       "…all associated data — including your bloodwork files — within 30 days…"
--
--     A blanket swap turns that into two commas in one case and nonsense in
--     another ("…to you, see Sections 13…" is a comma splice; "…again, except
--     that…" is fine). Each one below was read in context and given the
--     punctuation that preserves its grammar. Nothing else about the sentences
--     changes: no word is added, removed or reordered.
--
--  Idempotent: `replace()` on a string that no longer contains the search text
--  is a no-op, so this is safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
--  MEDICAL DISCLAIMER (v1.3)
-- ------------------------------------------------------------
update public.legal_documents set body = replace(
  body,
  'administer any dose — you do all of that yourself',
  'administer any dose. You do all of that yourself'
) where is_current and body like '%administer any dose — you do all of that yourself%';

-- ------------------------------------------------------------
--  TERMS OF SERVICE (v1.3)
-- ------------------------------------------------------------
update public.legal_documents set body = replace(
  body,
  'administer any dose — you do that yourself',
  'administer any dose. You do that yourself'
) where is_current and body like '%administer any dose — you do that yourself%';

update public.legal_documents set body = replace(
  body,
  'supplied again — except that this limitation',
  'supplied again, except that this limitation'
) where is_current and body like '%supplied again — except that this limitation%';

-- A PAIRED dash. Both halves are replaced in one statement so the sentence can
-- never be left with one comma and one dash.
update public.legal_documents set body = replace(
  replace(
    body,
    'For material changes — and always for any material change',
    'For material changes, and always for any material change'
  ),
  'or to how we process your data — we will notify you',
  'or to how we process your data, we will notify you'
) where is_current and body like '%For material changes — and always%';

-- ------------------------------------------------------------
--  PRIVACY POLICY (v1.3)
-- ------------------------------------------------------------
update public.legal_documents set body = replace(
  body,
  'may apply to you — see Sections 13',
  'may apply to you. See Sections 13'
) where is_current and body like '%may apply to you — see Sections 13%';

update public.legal_documents set body = replace(
  body,
  'advertising cookies — we use only',
  'advertising cookies. We use only'
) where is_current and body like '%advertising cookies — we use only%';

-- PAIRED: "…all associated data — including … photos — within 30 days…"
update public.legal_documents set body = replace(
  replace(
    body,
    'all associated data — including your uploaded bloodwork files',
    'all associated data, including your uploaded bloodwork files'
  ),
  'and progress photos — within 30 days',
  'and progress photos, within 30 days'
) where is_current and body like '%all associated data — including%';

update public.legal_documents set body = replace(
  body,
  'least-privilege key handling — no secret',
  'least-privilege key handling: no secret'
) where is_current and body like '%least-privilege key handling — no secret%';

update public.legal_documents set body = replace(
  body,
  'provide the Service to you — to record',
  'provide the Service to you: to record'
) where is_current and body like '%provide the Service to you — to record%';

-- PAIRED: "If we make material changes — including … your data — we will take…"
update public.legal_documents set body = replace(
  replace(
    body,
    'If we make material changes — including any change',
    'If we make material changes, including any change'
  ),
  'sub-processor handling your data — we will take reasonable steps',
  'sub-processor handling your data, we will take reasonable steps'
) where is_current and body like '%If we make material changes — including%';

-- ------------------------------------------------------------
--  The TITLE and the body's first line.
--
--  `components/legal/legal-document.tsx` already strips the "Trackd Co — "
--  prefix from `title` before rendering it, and `renderBody` is passed the title
--  so it can drop the repeated heading line from the body. So neither of these
--  em dashes is ever painted on a screen.
--
--  They are left alone ON PURPOSE. The strip regex accepts an em dash OR a
--  hyphen (`[—-]`), so it keeps working either way, but rewriting the title
--  would change the stored document identity for no visible gain.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
--  VERIFY — paste UNCOMMENTED. A commented block runs green and checks nothing,
--  which is how `protocol/024` reported success without executing an assertion.
-- ------------------------------------------------------------
--
-- select version, (length(body) - length(replace(body, '—', ''))) as em_dashes_left
-- from public.legal_documents
-- where is_current;
-- -- EXPECT 1 ON EACH, NOT 0.
-- --
-- -- The one that remains is the heading line at the top of the body ("Trackd Co
-- -- — Privacy Policy"), which this migration deliberately leaves alone because
-- -- `renderBody` drops that line before rendering (it matches `title`). This
-- -- block previously said "expect 0", so anyone following it saw a failure on a
-- -- CORRECT apply, and the obvious fix is the blanket replace this file spends a
-- -- whole warning block forbidding.
--
-- select version, (length(title) - length(replace(title, '—', ''))) as title_dashes
-- from public.legal_documents where is_current;
-- -- expect 1 on each: the title prefix, which is stripped before rendering.
