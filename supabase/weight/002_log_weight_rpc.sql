-- ============================================================
--  TRACKD CO — atomic weight log (cycle-stamp preserving)
--  Migration: log_weight_rpc   (Spec 15 follow-up — CodeRabbit PR #50)
-- ============================================================
--
--  The first cut of cycle-stamping (Spec 15) stamped weight_logs.cycle_id via a
--  read-then-upsert in the server action: read the existing row's cycle_id, then
--  upsert weight + that preserved cycle_id. That preserves the stamp in the common
--  case but is NOT atomic — two concurrent logs for the same NEW (profile_id,
--  logged_for) day can both read "no existing row" and the loser's ON CONFLICT
--  branch can still write its own cycle_id. (Benign in practice — there's one active
--  cycle per user, so both derive the same value — but not guaranteed.)
--
--  This moves the whole decision into ONE statement: INSERT the day's row (stamping
--  the user's single active cycle), and ON CONFLICT update ONLY the weight —
--  cycle_id is deliberately left out of the DO UPDATE SET, so an existing row keeps
--  the cycle (or NULL) it was FIRST written under. Atomic, race-free, and the stamp
--  logic now lives in the DB (source of truth) rather than app read-modify-write.
--
--  SECURITY INVOKER + pinned search_path = '' (house rule / Spec 17): it runs as the
--  CALLING user, so weight_logs + cycles RLS still gate every row (identity is
--  auth.uid(), never trusted from the client). The 30–300 kg CHECK on weight_logs is
--  the write-side backstop (the app validates first for a friendly message).
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_weight(p_weight numeric, p_logged_for date)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  INSERT INTO public.weight_logs (profile_id, logged_for, weight, cycle_id)
  VALUES (
    (SELECT auth.uid()),
    p_logged_for,
    p_weight,
    -- the user's single active cycle at first-write time (NULL = off-cycle)
    (SELECT c.id FROM public.cycles c
       WHERE c.user_id = (SELECT auth.uid()) AND c.is_active
       ORDER BY c.created_at
       LIMIT 1)
  )
  ON CONFLICT (profile_id, logged_for)
  -- re-log a day: correct the weight, but NEVER re-derive cycle_id (stable stamp).
  DO UPDATE SET weight = EXCLUDED.weight;
$$;

-- Least privilege: only signed-in users call it (SECURITY INVOKER → their RLS applies).
REVOKE EXECUTE ON FUNCTION public.log_weight(numeric, date) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.log_weight(numeric, date) TO authenticated;
