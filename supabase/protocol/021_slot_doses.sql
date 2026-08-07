-- ============================================================================
-- 021 · per-slot dose amounts — 100 mg in the morning, 50 mg at night
-- ============================================================================
--
-- ⚠️ THIS IS SCOPE THE SPEC EXPLICITLY DEFERRED, ADDED ON ADRIAN'S CALL
-- (2026-08-07). `w2b-13-Compound-controls-spec` → Out of Scope says:
--
--     "DO NOT support different amounts per slot on a multi-dose day in this
--      version. A compound dosed 2x daily delivers `dose_amount` twice.
--      Per-slot amounts (100 mg AM, 50 mg PM) are a later change and need a
--      per-slot column on the schedule, not just a slot index on the log."
--
-- He asked for it anyway, having been told it was deferred. The spec's
-- reasoning was about SEQUENCING, not correctness — and its own sentence names
-- exactly what is needed, which is what this file adds. Do not "restore" the
-- restriction on the strength of that paragraph; it has been overridden
-- deliberately.
--
-- WHY THE NUMBER 021 AND NOT 018
--
-- 018-020 are named by the spec (`compound_pauses`, `pause_runway`,
-- `one_off_logs`). Inserting this in the middle would renumber three files the
-- spec refers to by number. Appending keeps every spec-named migration exactly
-- where the spec says it is. Nothing here depends on 018-020 or vice versa.
--
-- WHY AN ARRAY, PARALLEL TO `dose_times`
--
-- A slot is already an INDEX into `dose_times` (`supabase/protocol/017`), so the
-- amount for slot n is the natural parallel: `slot_doses[n+1]` in Postgres's
-- 1-based array indexing. A separate table keyed by slot would be a second
-- source of truth for something `dose_times` already orders, and the two could
-- then disagree about how many doses a day there are.
--
-- NULL MEANS "THE PLANNED DOSE", AND THAT IS WHY THIS NEEDS NO BACKFILL
--
-- A NULL element — or a NULL array, which is every existing row — means the slot
-- takes `dose_amount`, the compound's own planned dose. So every compound
-- already in the table keeps delivering exactly what it delivers today, and a
-- user who never sets a per-slot amount never gets one.
--
-- It also means the array may be SHORTER than `dose_times`, or absent, without
-- being wrong: a missing element is "the planned dose" for the same reason a
-- NULL one is. Read it defensively; do not assume the lengths match.
--
-- WHAT THIS IS NOT
--
-- It is not a per-slot UNIT. All of a compound's doses are in one unit, because
-- `dose_unit` is a property of the compound and the inventory family checks are
-- built on that. 100 mg AM and 50 mg PM; never 100 mg AM and 5000 iu PM.
--
-- SAFETY: additive and reversible. Two nullable array columns. No backfill, no
-- data touched, no existing column changes type or meaning.
-- ============================================================================

-- The compound's CURRENT per-slot amounts.
ALTER TABLE public.protocol_compounds
    ADD COLUMN IF NOT EXISTS slot_doses numeric(10,3)[];

COMMENT ON COLUMN public.protocol_compounds.slot_doses IS
    'Per-slot planned dose, parallel to dose_times: slot_doses[n] is the amount '
    'for dose_times[n], in the compound''s own dose_unit. NULL element, short '
    'array, or NULL column all mean "use dose_amount" — which is why this needed '
    'no backfill. Never a per-slot UNIT: one compound, one dose_unit.';

-- …and the same on the VERSION trail, or a mid-run change to the evening dose
-- would retroactively restate every evening dose already taken. Same reason the
-- cycle and the dose times ride the version (`supabase/protocol/005`).
ALTER TABLE public.protocol_compound_schedules
    ADD COLUMN IF NOT EXISTS slot_doses numeric(10,3)[];

COMMENT ON COLUMN public.protocol_compound_schedules.slot_doses IS
    'The per-slot amounts in force under THIS version. Rides the version so that '
    'raising the evening dose today does not restate the evening doses already '
    'taken last month — the same rule dose_times and the cycle columns follow.';
