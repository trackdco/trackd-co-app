-- ============================================================
--  PROGRESS PHOTOS — table + private bucket + owner-scoped policies
--  Migration: progress_photos (applied to the live project via MCP).
--
--  Founder-directed feature (Spec 09 addendum). Mirrors the bloodwork
--  photo model: the bytes live in a private Storage bucket, the row
--  records the pose + date + path. RLS house pattern: (SELECT auth.uid()).
--  RUN ON SUPABASE ONLY (depends on the storage schema).
-- ============================================================

CREATE TABLE IF NOT EXISTS progress_photos (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    pose          text NOT NULL,
    taken_on      date NOT NULL DEFAULT current_date,
    -- path in the private `progress-photos` bucket: "<auth.uid()>/<id>/<file>"
    storage_path  text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE progress_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own progress_photos - all" ON progress_photos FOR ALL
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE INDEX IF NOT EXISTS idx_progress_photos_user
    ON progress_photos(user_id, taken_on DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON progress_photos TO authenticated;

-- Private bucket (10 MB; phone photos). Never flip public.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'progress-photos',
    'progress-photos',
    false,
    10485760,
    ARRAY['image/jpeg','image/png','image/webp','image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Owner-scoped storage policies — first path segment must be the owner's uid.
CREATE POLICY "own progress photos - select"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'progress-photos'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "own progress photos - insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'progress-photos'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "own progress photos - update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'progress-photos'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
    WITH CHECK (bucket_id = 'progress-photos'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "own progress photos - delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'progress-photos'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
