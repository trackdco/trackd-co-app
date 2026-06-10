-- ============================================================
--  TRACKD CO — AVATAR STORAGE  (post-v0.4.2, tracked migration)
-- ============================================================
--
--  Profile pictures (Context/Feature Specs/08-Home-page-fixes-v1.md
--  → B3). Mirrors the private, owner-scoped `bloodwork` bucket:
--  RLS on storage.objects, the first path segment must be the
--  uploader's own auth.uid(), and the bucket stays PRIVATE (display
--  via short-lived signed URLs). The chosen object PATH is stored on
--  profiles.avatar_path; the bytes never live in the database.
--
--  RUN ON SUPABASE ONLY — depends on the storage schema
--  (storage.buckets / storage.objects / storage.foldername), which
--  does not exist on vanilla Postgres.
--
--  PATH CONVENTION (enforced via WITH CHECK):
--    <auth.uid()>/<filename>            e.g.  <uid>/avatar.webp
-- ============================================================


-- ----------------------------------------------------------------
-- 1. profiles.avatar_path — the stored object path (NULL = no avatar)
-- ----------------------------------------------------------------
-- The existing api_role_grants migration granted UPDATE on profiles at
-- table level, which covers this new column — no extra grant needed.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_path text;


-- ----------------------------------------------------------------
-- 2. The bucket — PRIVATE. 5 MB cap; web-friendly image types only.
-- ----------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'avatars',
    'avatars',
    false,
    5242880,   -- 5 MB
    ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;


-- ----------------------------------------------------------------
-- 3. Owner-scoped policies on storage.objects (same shape as bloodwork)
-- ----------------------------------------------------------------
CREATE POLICY "own avatar files - select"
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );

CREATE POLICY "own avatar files - insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );

CREATE POLICY "own avatar files - update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    )
    WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );

CREATE POLICY "own avatar files - delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );
