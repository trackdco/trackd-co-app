-- ============================================================
--  Legal documents: who operates Trakabl (Adrian, 2026-09-24).
--
--  APPLIED to production 2026-09-24 (22:46 AEST) at Adrian's word, and
--  verified: terms 2.3, privacy 2.3, consumer_health_data 2.3,
--  medical_disclaimer 2.2, all effective 24 September 2026, predecessors kept
--  as history.
--
--  Publishes the NEXT version of all four documents. Each new body is built
--  from the body in force at the moment this runs, by `replace()`, so nothing
--  else in it can change. The current rows are demoted to history, untouched.
--
-- ------------------------------------------------------------
--  WHAT CHANGED, AND NOTHING ELSE
-- ------------------------------------------------------------
--
--   1. Each document now states who operates the product in this exact
--      sentence (the same one `OPERATED_BY` in `lib/brand.ts` holds):
--
--        Trakabl is operated by Trackd Co Pty Ltd (ABN 35 698 405 462).
--
--      Terms, Privacy and Consumer Health Data: it opens the preamble.
--      Medical Disclaimer: it replaces "(Trackd Co Pty Ltd, ACN 698 405 462)"
--      at the end of the "forms part of the Trakabl Terms of Service" line.
--
--   2. The preambles lose ", trading as Trakabl". The contracting party is
--      untouched: still Trackd Co Pty Ltd with its ACN and ABN, and the defined
--      terms ("Trakabl", "we", "us", "our") still point at it. Replacing the
--      whole preamble with the sentence would have deleted the definition of
--      who the agreement is with.
--
--   3. Bookkeeping: the header's "VERSION x · EFFECTIVE d" line names the new
--      version and the day this runs, and "Supersedes vX." names the version it
--      replaces. The page prints its version and date from the row, not from
--      that header line, but "Supersedes" is on screen.
--
--  Left alone on purpose: "Trackd Co Pty Ltd is the merchant of record" (Terms)
--  already uses the full name; "Two people operate Trakabl, the two founders"
--  (Privacy) is about who has admin access, not which company runs the service.
--
-- ------------------------------------------------------------
--  WHAT EXISTING USERS SEE (checked 2026-09-24, before this was written)
-- ------------------------------------------------------------
--
--  Nobody has to re-accept and nobody loses access:
--    · The only app gate is `profiles.is_18_plus AND tos_accepted_at`
--      (`lib/auth.ts`). No code, RLS policy, trigger or function compares a
--      user's accepted version with the current one.
--    · `consent_records` is only ever WRITTEN at the live version (signup, and
--      the rebrand notice's OK via `legal-acceptance.ts`). Nothing reads it to
--      decide what a user may do.
--
--  What does change:
--    · Every existing consent row now points at a superseded version. That is
--      the record working as designed: it says what each person agreed to.
--    · The admin dashboard's "on the current version" consent figure drops to
--      near zero, because `health_data_consent` carries the PRIVACY version.
--    · Anyone who taps OK on the rebrand notice after this runs is recorded as
--      accepting the new Terms and Privacy versions, the ones then in force.
--
--  Terms §25 treats this as a minor change (version bump, no advance notice):
--  it alters no fee, no liability, no processing and no medical guidance.
--
-- ------------------------------------------------------------
--  VERSION NUMBERS ARE COMPUTED, NOT WRITTEN DOWN
-- ------------------------------------------------------------
--
--  Each doc_type goes up one minor from whatever is current when this runs.
--  Applied today that is terms 2.3, privacy 2.3, consumer_health_data 2.3,
--  medical_disclaimer 2.2.
--
--  ⚠️ `feat/posthog-locked` plans a Privacy + Consumer Health Data "v2.3" that
--  names PostHog. Whichever lands second takes 2.4. Computing the number lets
--  either order work; the notes on that branch will need their number moved.
--
-- ------------------------------------------------------------
--  ▶ HOW TO RUN THIS
-- ------------------------------------------------------------
--
--   1. Paste the whole file into the SQL Editor and run it. One transaction:
--      if any guard below fails, nothing changes.
--   2. Run the VERIFY queries at the bottom and read the rows.
--   3. Purge the Vercel Data Cache tag `legal-documents` (Settings → Purge
--      cache → Cache Tag, layer "Runtime and Data Cache"). The pages read
--      through unstable_cache and a redeploy does NOT refresh them.
--
--  Not idempotent by design: a second run would publish yet another version.
--  The guards stop it, because the old phrases are gone after the first run.
-- ============================================================

begin;

-- The four documents in force right now, and what each becomes.
create temp table legal_next on commit drop as
select d.doc_type,
       d.version                                                   as replaces,
       split_part(d.version, '.', 1) || '.'
         || (split_part(d.version, '.', 2)::int + 1)::text         as version,
       d.title,
       d.is_beta,
       (now() at time zone 'Australia/Sydney')::date               as effective_date,
       d.body
  from legal_documents d
 where d.is_current
   and d.doc_type::text in ('terms_of_service', 'privacy_policy', 'consumer_health_data', 'medical_disclaimer');

-- The edits, as exact find → put pairs. Each find must occur EXACTLY ONCE.
create temp table legal_edits (doc_type text, find text, put text) on commit drop;

insert into legal_edits (doc_type, find, put) values
  ('terms_of_service',
   'These Terms of Service ("Terms") are a legal agreement',
   'Trakabl is operated by Trackd Co Pty Ltd (ABN 35 698 405 462). These Terms of Service ("Terms") are a legal agreement'),
  ('terms_of_service',
   'Australia, trading as Trakabl ("Trakabl", "we", "us" or "our")',
   'Australia ("Trakabl", "we", "us" or "our")'),
  ('privacy_policy',
   'This Privacy Policy explains how',
   'Trakabl is operated by Trackd Co Pty Ltd (ABN 35 698 405 462). This Privacy Policy explains how'),
  ('privacy_policy',
   'Australia, trading as Trakabl ("Trakabl", "we", "us", "our")',
   'Australia ("Trakabl", "we", "us", "our")'),
  ('consumer_health_data',
   'This is the consumer health data notice for',
   'Trakabl is operated by Trackd Co Pty Ltd (ABN 35 698 405 462). This is the consumer health data notice for'),
  ('consumer_health_data',
   '(ACN 698 405 462, ABN 35 698 405 462), trading as Trakabl, covering',
   '(ACN 698 405 462, ABN 35 698 405 462), covering'),
  ('medical_disclaimer',
   'This document forms part of the Trakabl Terms of Service (Trackd Co Pty Ltd, ACN 698 405 462).',
   'This document forms part of the Trakabl Terms of Service. Trakabl is operated by Trackd Co Pty Ltd (ABN 35 698 405 462).');

do $$
declare
  e record;
  hits int;
  bad record;
begin
  -- ⚠️ REFUSE unless all four documents are there. A missing one would be
  -- demoted with nothing promoted, and its page would 404.
  if (select count(*) from legal_next) <> 4 then
    raise exception 'REFUSING: expected 4 current documents, found %.', (select count(*) from legal_next);
  end if;

  -- Apply each edit, refusing if its phrase is not there exactly once.
  for e in select * from legal_edits loop
    select (length(body) - length(replace(body, e.find, ''))) / length(e.find)
      into hits
      from legal_next
     where doc_type::text = e.doc_type;
    if hits is distinct from 1 then
      raise exception 'REFUSING: % should contain "%" once, found %.', e.doc_type, e.find, coalesce(hits, 0);
    end if;
    update legal_next set body = replace(body, e.find, e.put) where doc_type::text = e.doc_type;
  end loop;

  -- Header bookkeeping. Line-anchored ('n'), first match only.
  update legal_next
     set body = regexp_replace(
           body,
           '^VERSION [0-9]+\.[0-9]+ · EFFECTIVE .*$',
           'VERSION ' || version || ' · EFFECTIVE ' || to_char(effective_date, 'FMDD FMMonth YYYY'),
           'n');
  update legal_next
     set body = regexp_replace(body, '^Supersedes v[0-9]+\.[0-9]+\.$', 'Supersedes v' || replaces || '.', 'n');

  -- ⚠️ REFUSE if the result is not exactly what this file promises.
  for bad in
    select doc_type, version
      from legal_next
     where (length(body) - length(replace(body, 'Trakabl is operated by Trackd Co Pty Ltd (ABN 35 698 405 462).', '')))
             / length('Trakabl is operated by Trackd Co Pty Ltd (ABN 35 698 405 462).') <> 1
        or body like '%trading as%'
        or body like '%' || chr(8212) || '%'   -- em dash
        or body not like '%VERSION ' || version || ' · EFFECTIVE %'
        or exists (select 1 from legal_documents x where x.doc_type = legal_next.doc_type and x.version = legal_next.version)
  loop
    raise exception 'REFUSING: % v% did not come out as intended (sentence count, "trading as", em dash, header, or version already exists).',
      bad.doc_type, bad.version;
  end loop;
end $$;

-- Publish: insert as not-current, demote the old, promote the new. The partial
-- unique index `(doc_type) WHERE is_current` fails the whole transaction if a
-- demote did not happen, rather than leaving two current rows.
insert into legal_documents (doc_type, version, title, body, effective_date, is_beta, is_current)
select doc_type, version, title, body, effective_date, is_beta, false
  from legal_next;

update legal_documents d
   set is_current = false
  from legal_next n
 where d.doc_type = n.doc_type
   and d.version = n.replaces
   and d.is_current;

update legal_documents d
   set is_current = true
  from legal_next n
 where d.doc_type = n.doc_type
   and d.version = n.version;

do $$
begin
  if (select count(*)
        from legal_documents d
        join legal_next n on n.doc_type = d.doc_type and n.version = d.version
       where d.is_current) <> 4 then
    raise exception 'REFUSING: the four new versions did not all become current.';
  end if;
end $$;

commit;

-- ------------------------------------------------------------
--  ▶ VERIFY afterwards
-- ------------------------------------------------------------
--
-- SELECT doc_type, version, is_current, effective_date,
--        (body LIKE '%Trakabl is operated by Trackd Co Pty Ltd (ABN 35 698 405 462).%') AS says_operator,
--        (body LIKE '%trading as%')                                                  AS says_trading_as,
--        (body LIKE '%Trackd Co Pty Ltd%')                                           AS names_entity
--   FROM legal_documents
--  WHERE is_current
--  ORDER BY doc_type;
--
--   EXPECT four rows (if nothing else was published first):
--     consumer_health_data  2.3  says_operator=true  says_trading_as=false  names_entity=true
--     medical_disclaimer    2.2  says_operator=true  says_trading_as=false  names_entity=true
--     privacy_policy        2.3  says_operator=true  says_trading_as=false  names_entity=true
--     terms_of_service      2.3  says_operator=true  says_trading_as=false  names_entity=true
--
--   AND the predecessors survive as history, because consent_records point at them:
--
-- SELECT doc_type, version, is_current FROM legal_documents
--  WHERE (doc_type <> 'medical_disclaimer' AND version = '2.2')
--     OR (doc_type  = 'medical_disclaimer' AND version = '2.1')
--  ORDER BY doc_type;                        -- expect 4 rows, is_current=false
--
--   THEN purge the `legal-documents` cache tag. `/terms/2.3` renders the new
--   version straight away (it is keyed by version); `/terms` shows it only
--   after the purge.
