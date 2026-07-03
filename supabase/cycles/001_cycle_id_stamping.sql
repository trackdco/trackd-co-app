-- ============================================================
--  TRACKD CO — CYCLE-ID STAMPING  (post-v0.4.2, tracked migration)
--  Migration: cycle_id_stamping   (Spec 15 / Feature Specs/15)
-- ============================================================
--
--  The moat is longitudinal, per-cycle data (design principle #6). Today only
--  dose_logs + inventory_items are cycle-tied (via the NOT-NULL chain through
--  protocol_compounds.cycle_id). Journal entries, bloodwork panels, side-effect
--  markers and weight were written with NO cycle association — silently, and
--  unbackfillably. This migration gives the remaining entry tables somewhere to
--  hold the cycle, so the app can stamp it at insert time (the code half of the
--  spec does the stamping).
--
--  "Current cycle context" — RESOLVED, not guessed. The spec's premise ("the
--  single-active-cycle index is commented out, so multiple cycles can be active")
--  is STALE: the Protocol Cutover (Spec 11, supabase/protocol/003) applied the
--  `one_active_cycle_per_user` UNIQUE (user_id) WHERE is_active index, live. So a
--  user has EXACTLY ONE active cycle (verified: all live users had 1 each), and it
--  is already exposed as getActiveCycle()/ensureActiveCycle() in lib/db/cycles.ts.
--  The app stamps that cycle's id; if the user has no active cycle it writes NULL —
--  a legitimate "logged off-cycle" state, hence nullable, never NOT NULL.
--
--  What each table needs:
--    - journal_entries.cycle_id  — column + FK (SET NULL) ALREADY EXIST (base
--        schema). Only the cycle-scoped-query INDEX was missing. Added here.
--    - lab_panels.cycle_id       — same: column + FK exist, index added here.
--    - weight_logs               — NEW nullable cycle_id + FK (SET NULL) + index.
--    - body_metrics              — NEW nullable cycle_id + FK (SET NULL) + index.
--        (Dormant today — superseded for weight by weight_logs, zero app write
--         paths — but stamped per spec so the shape is consistent if it revives.)
--    - marker_readings           — NO column. entry_id is NOT NULL, so every
--        reading inherits its cycle transitively via
--        entry_id -> journal_entries.cycle_id. Nothing added.
--    - biomarker_results         — NO column. panel_id is NOT NULL, so results
--        inherit via panel_id -> lab_panels.cycle_id. Nothing added.
--
--  ON DELETE SET NULL (not CASCADE): deleting a cycle must not destroy a user's
--  journal / bloodwork / weight history — it only detaches the stamp. (Cascade
--  deletion of a cycle's protocol/dose/inventory history is handled elsewhere and
--  is deliberately archive-not-delete per Invariant 8.)
--
--  Additive + safe: all columns nullable, no backfill (existing NULL rows stay
--  NULL — an optional, user-run backfill lives in 002_*.optional.sql). Table-level
--  grants already cover new columns (weight_logs + body_metrics grant full DML to
--  `authenticated`); owner RLS is row-level and column-agnostic, so it already
--  covers cycle_id. No grant or policy change needed. Indexes are partial
--  (WHERE cycle_id IS NOT NULL) — cycle-scoped queries filter on a concrete id, so
--  the many off-cycle NULL rows never bloat the index.
-- ============================================================

-- --- journal_entries: column + FK already present; add the cycle-scoped index ---
CREATE INDEX IF NOT EXISTS idx_journal_entries_cycle
    ON journal_entries (cycle_id) WHERE cycle_id IS NOT NULL;

-- --- lab_panels: column + FK already present; add the cycle-scoped index ---
CREATE INDEX IF NOT EXISTS idx_lab_panels_cycle
    ON lab_panels (cycle_id) WHERE cycle_id IS NOT NULL;

-- --- weight_logs: add nullable cycle_id + FK (SET NULL) + index ---
ALTER TABLE weight_logs
    ADD COLUMN IF NOT EXISTS cycle_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'weight_logs_cycle_id_fkey'
      AND conrelid = 'weight_logs'::regclass
  ) THEN
    ALTER TABLE weight_logs
      ADD CONSTRAINT weight_logs_cycle_id_fkey
      FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_weight_logs_cycle
    ON weight_logs (cycle_id) WHERE cycle_id IS NOT NULL;

-- --- body_metrics: add nullable cycle_id + FK (SET NULL) + index ---
ALTER TABLE body_metrics
    ADD COLUMN IF NOT EXISTS cycle_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'body_metrics_cycle_id_fkey'
      AND conrelid = 'body_metrics'::regclass
  ) THEN
    ALTER TABLE body_metrics
      ADD CONSTRAINT body_metrics_cycle_id_fkey
      FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_body_metrics_cycle
    ON body_metrics (cycle_id) WHERE cycle_id IS NOT NULL;
