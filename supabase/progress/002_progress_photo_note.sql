-- ============================================================
--  PROGRESS PHOTOS — optional per-session note
--  Migration: progress_photo_note (applied to the live project via MCP).
--
--  "Notes about the physique" captured when adding a session's photos. Stored on
--  every photo in that session (one note per day/session) and shown read-only.
--  Covered by the existing own-row RLS + grants; no policy change needed.
-- ============================================================

ALTER TABLE progress_photos ADD COLUMN IF NOT EXISTS note text;
