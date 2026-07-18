-- ============================================================
--  TRACKD CO — JOURNAL PHOTO ATTACHMENTS  (Spec 22 · 3)
--  Migration: journal_attachments
-- ============================================================
--
--  Optional photo(s) on a journal entry. A new PRIVATE bucket + a side table, both
--  mirroring `progress_photos` (supabase/progress/001) and the bloodwork policy
--  shape (supabase/trackd_storage_policies.sql). Photos are as radioactive as
--  bloodwork — NEVER public; shown only via short-lived signed URLs.
--
--  Path convention: "<auth.uid()>/<id>/<file>" — the FIRST folder segment MUST be
--  the uploader's own auth.uid(), which the storage policies enforce (and the
--  server action re-verifies before inserting a row).
--
--  Idempotent (IF NOT EXISTS + DROP POLICY IF EXISTS). Apply via the Supabase SQL
--  Editor (Dashboard -> SQL Editor -> Run) or the standard migration flow.
-- ============================================================

-- One row per attached photo (0..n per entry). Rows cascade when the entry
-- (journal_entry_id) or the account (user_id) is deleted; the storage BYTES are
-- cleaned up by the app's delete paths (a DB cascade can't reach Storage).
CREATE TABLE IF NOT EXISTS journal_attachments (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    journal_entry_id  uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    -- path in the private `journal` bucket: "<auth.uid()>/<id>/<file>"
    storage_path      text NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE journal_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own journal_attachments - all" ON journal_attachments;
CREATE POLICY "own journal_attachments - all" ON journal_attachments FOR ALL
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK (
        (SELECT auth.uid()) = user_id
        -- Defence in depth: an attachment may only hang off the caller's OWN journal
        -- entry. The FK alone binds journal_entry_id to *some* entry; this binds it to
        -- the caller's, so a known foreign entry UUID can't be written against.
        AND EXISTS (
            SELECT 1 FROM public.journal_entries je
            WHERE je.id = journal_entry_id
              AND je.user_id = (SELECT auth.uid())
        )
    );
CREATE INDEX IF NOT EXISTS idx_journal_attachments_entry
    ON journal_attachments(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_attachments_user
    ON journal_attachments(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON journal_attachments TO authenticated;

-- Private bucket (10 MB; phone photos). NEVER flip public.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'journal',
    'journal',
    false,
    10485760,
    ARRAY['image/jpeg','image/png','image/webp','image/heic']
)
-- Re-assert private + the size/mime limits on replay, so a pre-existing `journal`
-- bucket can never be left public or with looser limits than intended.
ON CONFLICT (id) DO UPDATE
    SET public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Owner-scoped storage policies — first path segment must be the owner's uid.
DROP POLICY IF EXISTS "own journal files - select" ON storage.objects;
CREATE POLICY "own journal files - select"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'journal'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "own journal files - insert" ON storage.objects;
CREATE POLICY "own journal files - insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'journal'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "own journal files - update" ON storage.objects;
CREATE POLICY "own journal files - update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'journal'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
    WITH CHECK (bucket_id = 'journal'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "own journal files - delete" ON storage.objects;
CREATE POLICY "own journal files - delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'journal'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
