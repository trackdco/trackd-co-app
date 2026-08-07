-- ============================================================================
-- 024 · the review's fixes, for a database that was migrated before them
-- ============================================================================
--
-- ⚠️ APPLY THIS. It is not optional and it is not a tidy-up.
--
-- WHY IT EXISTS
--
-- The migrations were applied to prod on 2026-08-07, and the four cold review
-- agents ran AFTER that. The review changed `014`, `016` and `018` and added
-- `022` — so the files on disk are correct and the DATABASE is not. Re-running
-- those files does not help: `018` opens with `CREATE TABLE IF NOT EXISTS`, so
-- it silently skips the table that already exists and the fixes never land.
--
-- Everything here is idempotent and safe to run against a database that somehow
-- already has it.
--
-- 022 IS SEPARATE AND ALSO OUTSTANDING. Apply it too, in either order.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. THE ONE THAT MATTERS: ownership on `compound_pauses` is not structural
-- ---------------------------------------------------------------------------
--
-- As applied, `018` had a SINGLE-COLUMN foreign key to `protocol_compounds` and
-- a unique index not scoped to the owner — verbatim the shape
-- `009_ownership_hardening.sql` exists to close, and which 008 and 009 were
-- written to eradicate from this schema.
--
-- The hole: RLS is never applied to a foreign key. Any authenticated user can
-- insert a pause row whose `user_id` is their own (so the policy's WITH CHECK
-- passes) but whose `protocol_compound_id` belongs to SOMEONE ELSE (so the
-- single-column FK passes). They then occupy that compound's slot on the partial
-- unique index, and the victim can never pause it again — 23505, forever, with
-- no repair path, because the victim's own cleanup (`WHERE user_id = self`)
-- cannot see the squatting row.
--
-- `protocol_compounds_id_user_key UNIQUE (id, user_id)` has existed since 008,
-- so the composite key is free. A policy can be reasoned around; a foreign key
-- cannot.
--
-- No existing row can fail the new constraint: every pause in the table was
-- written by the app, which only ever pauses the user's own compounds.

ALTER TABLE public.compound_pauses
    DROP CONSTRAINT IF EXISTS compound_pauses_protocol_compound_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'compound_pauses_owner_fk'
    ) THEN
        ALTER TABLE public.compound_pauses
            ADD CONSTRAINT compound_pauses_owner_fk
            FOREIGN KEY (protocol_compound_id, user_id)
            REFERENCES public.protocol_compounds (id, user_id)
            ON DELETE CASCADE;
    END IF;
END $$;

-- The second half of the hardening: the unique index must be scoped to the
-- owner, or it stays squattable.
DROP INDEX IF EXISTS uq_compound_pauses_one_indefinite;
CREATE UNIQUE INDEX IF NOT EXISTS uq_compound_pauses_one_indefinite
    ON public.compound_pauses (user_id, protocol_compound_id)
    WHERE is_active AND ends_on IS NULL;


-- ---------------------------------------------------------------------------
-- 2. The index the notification runner actually queries by
-- ---------------------------------------------------------------------------
-- `lib/notifications/runner.ts` filters `user_id + is_active + started_on <=
-- today` on every tick for every user. Without this it is a sequential scan.
-- `blocks/001` carries the same index for the same reason.

CREATE INDEX IF NOT EXISTS idx_compound_pauses_user_started
    ON public.compound_pauses (user_id, started_on);


-- ---------------------------------------------------------------------------
-- 3. `v_inventory_math` lost its service_role grant when 016 dropped the view
-- ---------------------------------------------------------------------------
--
-- `grants/002` granted the view to `service_role` via `GRANT ALL ON ALL TABLES`,
-- and a DROP takes that with it. `016` as applied re-granted `authenticated`
-- only.
--
-- THE FAILURE IS SILENT, which is why it is worth a statement of its own: the
-- notification runner reads this view as `service_role` and DISCARDS the error
-- (`const { data: math } = await …`). A 42501 yields `data = null`, every item
-- gets a null runway, `lowStock()` returns `[]`, and low-stock pushes simply
-- stop — with nothing in any log.

GRANT SELECT ON public.v_inventory_math TO authenticated;
GRANT SELECT ON public.v_inventory_math TO service_role;


-- ---------------------------------------------------------------------------
-- 4. `unit_family_compatible` lost its search_path hardening
-- ---------------------------------------------------------------------------
--
-- `hardening/001` set `search_path = ''` on this function to close the advisor's
-- `function_search_path_mutable` finding (Spec 17). `CREATE OR REPLACE FUNCTION`
-- takes every property except ownership and permissions from the NEW command, so
-- `014` and `016` — neither of which restated it — silently un-hardened it.
--
-- Restated here with the FULL 016 body, so this is also the canonical definition
-- if you are checking what the live function should be.

CREATE OR REPLACE FUNCTION public.unit_family_compatible(
    item_base public.dose_unit,
    dose      public.dose_unit
)
RETURNS boolean AS $$
    SELECT (item_base = 'mg'      AND dose IN ('mg','mcg'))
        OR (item_base = 'iu'      AND dose = 'iu')
        OR (item_base = 'g'       AND dose IN ('g','mg'))
        OR (item_base = 'tab'     AND dose = 'tab')
        OR (item_base = 'capsule' AND dose = 'capsule');
$$ LANGUAGE sql IMMUTABLE
SET search_path = '';


-- ---------------------------------------------------------------------------
-- 5. Verify (read-only — run these and read the answers)
-- ---------------------------------------------------------------------------
--
--   -- Expect ONE row, named compound_pauses_owner_fk, with TWO columns:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.compound_pauses'::regclass AND contype = 'f';
--
--   -- Expect the unique index to lead with user_id:
--   SELECT indexdef FROM pg_indexes
--   WHERE tablename = 'compound_pauses';
--
--   -- Expect `search_path=` in proconfig:
--   SELECT proname, proconfig FROM pg_proc
--   WHERE proname = 'unit_family_compatible';
--
--   -- Expect both roles:
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'v_inventory_math';
