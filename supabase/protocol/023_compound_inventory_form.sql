-- ============================================================================
-- 013 · protocol_compounds.inventory_form — the form is a FACT, not a guess
-- ============================================================================
--
-- ⚠️ THIS FILE REPLACES `013_compound_form_override.sql`, WHICH WAS NEVER
-- APPLIED. Read this paragraph before assuming the old one is missing by
-- mistake. That file added `form_override text CHECK (vial|bottle|tub)` — a
-- user override of the container PICTURE. This column overrides the thing the
-- picture is derived FROM, which is strictly more useful: `containerFormFor()`
-- maps an inventory form to a container, so storing the form fixes the picture
-- *and* the stock form *and* the depletion maths, where `form_override` fixed
-- only the picture. Two independent overrides of the same drawing would have
-- been able to disagree. The old file was on disk, unapplied, and is superseded
-- rather than deleted by accident. (`next-tasks.md` → "THE SUPPLEMENT FORM
-- OVERRIDE" described the old plan; it is updated in the same change.)
--
-- WHY
--
-- `StackCompound` carries no inventory form. Every surface that needs one
-- rebuilds it from the compound's NAME plus its ROUTE on every render, via
-- `inventoryTypeForCompound()` (`lib/containers/form.ts`). That has two
-- failures, both already logged as a KNOWN GAP in that file's own doc comment:
--
--   1. An off-catalogue compound resolves by route alone, so a custom `nasal`
--      blend comes back `preconcentrated` and draws a vial.
--   2. The "Make your own" form ASKS for an inventory type and then throws the
--      answer away — nothing ever reads it back.
--
-- And a third, which is why this column is a prerequisite for bulk powder
-- (`014`): a scooped powder cannot be derived from a route at all. Creatine is
-- `po`, and `po` resolves to `oral_solid` for everything oral, capsule and tub
-- alike. No amount of cleverness about names recovers a fact the route does not
-- carry.
--
-- NULLABLE, AND THE FALLBACK STAYS
--
-- NULL means "nothing recorded — derive it as before". Every existing row is
-- NULL, so this migration changes no behaviour on its own; the derivation in
-- `containerFormFor` is kept underneath and is still what answers for compounds
-- added before today. Do not remove it.
--
-- WHY THE ENUM AND NOT text
--
-- `inventory_type` is the same enum `inventory_items.inventory_type` uses, so
-- the compound and its stock can never name different forms (Invariant 5 —
-- constrain at the database, not in TypeScript alone). A column typed as an
-- enum picks up values added later for free, which is what lets `014` add
-- `bulk_powder` without touching this table again.
--
-- NO GRANT MIGRATION IS NEEDED, and this is the part worth reading twice.
--
-- `supabase/grants/001_api_role_grants.sql` line 51 grants
-- `SELECT, INSERT, UPDATE, DELETE` on `public.protocol_compounds` at TABLE
-- level, and nothing has revoked it since (verified 2026-08-07). A table-level
-- grant in Postgres covers every column, including ones added later — so this
-- column is writable the moment it exists.
--
-- The "add it to BOTH grant lists or the Data API 42501s" rule is real, but it
-- is specific to `public.profiles`, which is the ONLY table here with
-- column-level grants: `grants/003_profiles_tier_lock.sql` REVOKEs table-level
-- UPDATE/INSERT and re-grants a named column list, so that the Stripe webhook
-- stays the only writer of `tier` (Spec 16). Applying that rule to
-- `protocol_compounds` would be cargo-culting it onto a table shaped
-- differently.
--
-- SAFETY: additive and reversible. One nullable column on an existing table. No
-- backfill, no data touched, no existing column changes type or meaning.
-- ============================================================================

ALTER TABLE public.protocol_compounds
    ADD COLUMN IF NOT EXISTS inventory_form public.inventory_type;

COMMENT ON COLUMN public.protocol_compounds.inventory_form IS
    'The form this compound is actually held in, as the user stated it. NULL '
    '(every pre-2026-08-07 row) means defer to inventoryTypeForCompound() in '
    'lib/containers/form.ts, which derives it from name + route. Stored because '
    'a scooped powder is not derivable from a route: creatine is po, and po '
    'derives oral_solid for capsules and tubs alike.';
