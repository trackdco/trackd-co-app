-- ============================================================
--  TRACKD CO — CUSTOM MARKERS  (Spec 22 · 1)
--  Migration: custom_marker_polarity
-- ============================================================
--
--  IMPORTANT — most of this already exists. The live preflight found that the
--  base schema (trackd_schema_v0_4_2.sql, SECTION 6) already models a fully-custom,
--  user-owned marker on `user_markers`, so NO new tables are introduced:
--    - marker_id NULL  +  custom_name  +  custom_tier_labels text[]  (the ordered
--      low->high scale), guarded by
--        CONSTRAINT marker_ref_or_custom CHECK (marker_id IS NOT NULL OR custom_name IS NOT NULL)
--    - is_active boolean — the forward-only SOFT-REMOVE. An inactive custom marker
--      is no longer OFFERED for new readings, but its marker_readings history is
--      untouched (nothing cascades off an is_active flip). So "removing a custom
--      marker preserves its historical readings" needs NO new column — is_active
--      already IS the removed_at-equivalent for this table (the compound soft-delete
--      spec's pattern, already present here).
--    - user_markers is owner-scoped RLS ("own user_markers - all",
--      (SELECT auth.uid()) = user_id) and already holds a full-DML grant to
--      `authenticated` (supabase/grants/001_api_role_grants.sql), both of which
--      cover a new column — so NO policy/grant change is needed.
--
--  The ONLY missing piece is a POLARITY for a custom marker. A catalogue marker
--  carries markers.polarity; a fully-custom one (marker_id NULL) had nowhere to
--  store it. Polarity is CHART-AXIS ORIENTATION ONLY (which way is "up"), NEVER a
--  good/bad verdict — identical semantics to markers.polarity, and it MUST stay
--  categorical-not-evaluative for custom markers exactly as for system ones
--  (architecture.md Invariant 3: polarity drives colour category only, never a
--  risk verdict).
--
--  Additive + safe: one nullable enum column, no backfill. Idempotent — safe to
--  replay. Apply via the Supabase SQL Editor (Dashboard -> SQL Editor -> Run) or
--  the standard migration flow.
-- ============================================================

ALTER TABLE public.user_markers
    ADD COLUMN IF NOT EXISTS custom_polarity public.marker_polarity;

COMMENT ON COLUMN public.user_markers.custom_polarity IS
    'Polarity for a fully-custom marker (marker_id IS NULL): positive | negative | neutral. NULL for catalogue-referenced rows, which inherit markers.polarity. Axis orientation only — never evaluative (architecture.md Invariant 3).';

-- Custom marker/scale NAMES are unique PER USER, not globally (spec) — and only
-- among ACTIVE customs, so a user can soft-remove a marker and reuse its name.
-- Case-insensitive via lower(); names are stored already-trimmed by the app.
CREATE UNIQUE INDEX IF NOT EXISTS user_markers_custom_name_unique
    ON public.user_markers (user_id, lower(custom_name))
    WHERE marker_id IS NULL AND is_active;
