-- ============================================================
--  Em dashes out of the LIVE legal documents. Migration: `legal_em_dashes`
--
--  NOT YET APPLIED.  ← verify against the live rows, never against this line.
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
-- select version, position('—' in body) as first_em_dash,
--        (length(body) - length(replace(body, '—', ''))) as em_dashes_left
-- from public.legal_documents
-- where is_current;
-- -- expect em_dashes_left = 0 on all three rows.
--
-- select version, (length(title) - length(replace(title, '—', ''))) as title_dashes
-- from public.legal_documents where is_current;
-- -- expect 1 on each: the title prefix, which is stripped before rendering.
