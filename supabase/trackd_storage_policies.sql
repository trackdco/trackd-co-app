-- ============================================================
--  TRACKD CO — STORAGE POLICIES  (companion to schema v0.4.2)
-- ============================================================
--
--  RUN ON SUPABASE ONLY. This file depends on the storage schema
--  (storage.buckets, storage.objects, storage.foldername) which only
--  exists on Supabase — it CANNOT be validated against vanilla Postgres
--  and is deliberately kept out of the main schema file. Apply it in
--  the same migration session as trackd_schema_v0_4_2.sql.
--
--  WHY THIS FILE EXISTS: table RLS on lab_panels protects the ROW (the
--  path string). It does nothing for the PDF BYTES in storage.objects.
--  source_file_path is structured as user_id/panel_id/report.pdf —
--  guessable — so without owner-scoped bucket policies, any
--  authenticated user could fetch another user's blood report. Same
--  class of bug as the v0.3 view leak, one layer over.
--
--  PATH CONVENTION (enforced below via WITH CHECK):
--    <auth.uid()>/<panel_id>/<filename>
--  The FIRST folder segment must be the uploader's own auth.uid(), so
--  ownership is provable from the path alone.
-- ============================================================


-- ----------------------------------------------------------------
-- 1. The bucket — PRIVATE. Never flip public = true for this bucket.
-- ----------------------------------------------------------------
-- 10 MB cap; lab reports are PDFs or phone photos of printed reports.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'bloodwork',
    'bloodwork',
    false,
    10485760,   -- 10 MB
    ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/heic']
)
ON CONFLICT (id) DO NOTHING;


-- ----------------------------------------------------------------
-- 2. Owner-scoped policies on storage.objects
-- ----------------------------------------------------------------
-- Supabase ships storage.objects with RLS enabled and no policies =
-- no access. These grant each user exactly their own folder. House
-- patterns carry over: (SELECT auth.uid()) wrapping for planner caching.
CREATE POLICY "own bloodwork files - select"
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'bloodwork'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );

CREATE POLICY "own bloodwork files - insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'bloodwork'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );

CREATE POLICY "own bloodwork files - update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
        bucket_id = 'bloodwork'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    )
    WITH CHECK (
        bucket_id = 'bloodwork'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );

CREATE POLICY "own bloodwork files - delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'bloodwork'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );


-- ============================================================
--  VERIFICATION — belongs in the 26-28 June two-account bug bash
--  (Success Criterion #4: zero cross-user data exposure)
-- ============================================================
--  As user B, with user A's uid known:
--    1. supabase.storage.from('bloodwork').download('<A_uid>/<panel>/report.pdf')
--       -> must FAIL (object not found / unauthorised). A 200 here is a
--       ship-blocker.
--    2. supabase.storage.from('bloodwork').list('<A_uid>')
--       -> must return EMPTY, not A's files.
--    3. Upload to a path whose first folder is NOT your own uid
--       -> must FAIL (WITH CHECK enforces the path convention).
--    4. Repeat 1 via the raw REST URL
--       (/storage/v1/object/bloodwork/<A_uid>/...) with B's JWT
--       -> must FAIL. (Tests the API layer, not just the JS client.)
--
--  SIGNED URLS: createSignedUrl bypasses these policies by design —
--  anyone holding the URL can fetch the object until it expires. If the
--  app uses signed URLs for display, keep expiry short (60s is plenty
--  for an <img>/<embed> load) and never persist them.
--
--  DASHBOARD FOOT-GUN: these policies are nullified if the bucket is
--  ever switched to public in the Supabase dashboard. Bucket privacy +
--  these four policies are a unit; re-verify both after any dashboard
--  changes to Storage.
-- ============================================================
--  END storage policies
-- ============================================================
