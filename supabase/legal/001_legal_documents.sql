-- ============================================================
--  Legal documents — versioned Terms of Service, Privacy Policy,
--  and Medical Disclaimer text.
--  Companion to trackd_schema_v0_4_2.sql.
--  Applied as migration `legal_documents_table`.
--
--  WHY:
--   - The schema already records WHICH legal version a user accepted
--     (profiles.tos_version + tos_accepted_at) but never held the actual
--     TEXT. This table is the home for the text, versioned over time.
--   - Storage only for now. NOT wired into the signup flow yet — the
--     signup acceptance UI will be wired up later on Adrian's direction.
--
--  ACCESS MODEL (Adrian-approved, differs from the seed catalogues):
--   - Legal documents are PUBLIC. Read by anon + authenticated, because
--     signup shows them BEFORE a user has an account (pre-auth). The
--     compounds/biomarkers catalogues are authed-only; legal text is not.
--   - Writes are service-role only (no insert/update/delete policy =>
--     RLS denies all user writes), same as the seed catalogues.
--
--  VERSIONING / DATING RULE (see Context/architecture.md → "Legal
--  documents"). In short:
--   - Pre-launch: stored at current draft versions (ToS 0.2, Privacy 0.1,
--     Medical Disclaimer 0.2), is_beta = true, effective_date = NULL
--     ("set on launch").
--   - At first launch: bump ALL to 1.0, set effective_date to the launch
--     day and FREEZE it (no auto-advance), set is_beta = false, drop
--     "beta" from filenames (…-v1.0).
--   - Each later change to a document: bump that doc a whole version
--     (1.0 -> 2.0 -> 3.0 …), set effective_date to that change's date,
--     mark the prior row is_current = false, and delete the superseded
--     file (start fresh).
-- ============================================================

CREATE TYPE legal_doc_type AS ENUM (
  'terms_of_service',
  'privacy_policy',
  'medical_disclaimer'
);

CREATE TABLE IF NOT EXISTS legal_documents (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_type       legal_doc_type NOT NULL,
    version        text NOT NULL,             -- '0.2', '1.0', '2.0' …
    title          text NOT NULL,             -- "Trackd Co — Terms of Service"
    body           text NOT NULL,             -- full document text, verbatim
    effective_date date,                      -- NULL until launch ("set on launch")
    is_beta        boolean NOT NULL DEFAULT true,
    is_current     boolean NOT NULL DEFAULT true,  -- the live version of this doc_type
    created_at     timestamptz NOT NULL DEFAULT now(),
    -- One row per (doc_type, version): re-seeding the same version is a no-op upsert.
    CONSTRAINT legal_documents_doc_version_unique UNIQUE (doc_type, version)
);

-- Exactly one current version per document type at any time.
CREATE UNIQUE INDEX IF NOT EXISTS legal_documents_one_current_per_type
    ON legal_documents (doc_type) WHERE is_current;

ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;

-- Public read: legal docs are shown pre-auth at signup, so anon + authed read.
DROP POLICY IF EXISTS "legal_documents readable by all" ON legal_documents;
CREATE POLICY "legal_documents readable by all" ON legal_documents
    FOR SELECT TO anon, authenticated USING (true);
-- (No insert/update/delete policy => only the service role / seeding can write.)
