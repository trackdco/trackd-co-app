# Feature Spec — 17-supabase-advisor-hardening
*Agent-ready. Behaviour and data only. Paste into a fresh Claude Code chat. One spec = one chat.*
*Source: Supabase Advisor, 3 July 2026 — 0 errors, 12 warnings. This spec clears the schema-level warnings. Two warnings are handled OUTSIDE this spec (see Out of scope).*

---

## §0 — Preflight (do this BEFORE writing anything)

- [ ] Read the six canonical files + `Context/next-tasks.md`.
- [ ] Using the **Supabase MCP**, for EACH function below, dump: the full signature (arg types), whether it is SECURITY DEFINER or INVOKER, its current `search_path` setting, its current EXECUTE grants, and **its full body** (you need the body to judge the search_path trap):
  - `public.set_updated_at`
  - `public.unit_family_compatible`
  - `public.check_inventory_unit_family`
  - `public.check_protocol_unit_family`
  - `public.check_dose_log_unit_family`
  - `public.handle_new_user`
  - `public.handle_new_profile_prefs`
- [ ] Confirm whether `pg_net` is referenced anywhere (functions, triggers, scheduled jobs, repo code). Report yes/no.
- [ ] Confirm the stack facts from the template (proxy.ts, sb_ keys, security_invoker, explicit grants, COALESCE, `(SELECT auth.uid())`).
- [ ] State your plan back to me and wait for "go". **Do not run any ALTER until I approve** — some of these can break integrity triggers if done naively (see below).

## Problem
The advisor shows 0 errors but 12 warnings. Most are cheap security hardening that the "schema hardened" claim in the context doc doesn't actually cover yet: five functions have a mutable `search_path`, and the two SECURITY DEFINER signup-trigger functions have EXECUTE granted to public/authenticated. For a product whose whole positioning is trust with sensitive data, these should be closed. None is an error, so this is hardening, not a fire.

## Goal
Clear the schema-level advisor warnings via ONE tracked migration, without breaking any integrity trigger or the signup flow.

## Behaviour (from the data's point of view)
1. All five flagged functions have a pinned (non-mutable) `search_path`, and every trigger/CHECK they back still fires correctly afterwards.
2. The two signup-trigger functions can no longer be executed directly by `public`, `authenticated`, or `anon` — but the signup trigger still creates the profile + prefs rows on new-user insert.
3. No behaviour visible to end users changes.

## Data model changes (one tracked migration in `supabase/`)

**A — Pin search_path on the 5 functions. MIND THE TRAP.**
Setting `search_path = ''` on a function whose body references tables *unqualified* (e.g. `inventory_items` instead of `public.inventory_items`) will BREAK that function — and these back inventory/dose integrity. So, per function, based on the §0 body dump, do ONE of:
- If the body already schema-qualifies every object → `ALTER FUNCTION … SET search_path = '';` (gold standard).
- If the body references `public` objects unqualified → either schema-qualify the body and use `= ''`, OR pin to an explicit `SET search_path = pg_catalog, public` (satisfies the linter, keeps it working). State which you chose per function and why.
Use exact signatures from §0.

**B — Revoke direct EXECUTE on the two SECURITY DEFINER trigger functions.**
```
REVOKE EXECUTE ON FUNCTION public.handle_new_user()         FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_profile_prefs() FROM public, anon, authenticated;
```
The trigger invokes them as the definer, so this does not touch the signup path. Verify signup still works after.

**C — pg_net (only if §0 says it's UNUSED and you choose to act).**
Do NOT move or drop it in this migration unless §0 confirms nothing references it AND I approve. If unused, the options are: leave it (defer to pre-launch), or `DROP EXTENSION pg_net;` then re-add in an `extensions` schema later when Edge Functions land. Default: **defer, leave a note in `next-tasks.md`.** Don't gold-plate.

## Open architectural decisions (surface, do NOT guess)
- Per-function search_path approach (`= ''` + qualified body vs explicit pinned list) — decide from the body, report each.
- Whether to touch `pg_net` at all this cycle (default: no).

## Out of scope (handled elsewhere — do NOT do here)
- **Leaked Password Protection** — Auth dashboard toggle (Authentication → Policies), not a migration. Angus flips it manually.
- **waitlist "RLS Policy Always True"** — belongs with `08-housekeeping` (the waitlist tracked-migration work). The fix there: confirm the permissive policy is INSERT-only (`WITH CHECK (true)`, public signup by design) and that **no anon SELECT policy exists** on `waitlist` (reads are founder-only via the view). Do not remove the INSERT `true` — that would break signup.
- Any change to the two SECURITY DEFINER functions' bodies beyond search_path.

## Acceptance criteria
- [ ] Advisor re-run shows the 5 search_path warnings and the 4 SECURITY DEFINER execute warnings cleared (screenshot / MCP re-check).
- [ ] Inventory insert, protocol dose-unit edit, and dose log all still succeed (the unit-family triggers still fire) — verify with a live test insert per path.
- [ ] A new signup still creates profile + prefs rows (trigger intact).
- [ ] A direct call to `handle_new_user()` as an authenticated user is denied.
- [ ] Migration is a tracked file in `supabase/`, not a dashboard patch.
- [ ] `progress-tracker.md` updated.

## Dependencies
None hard. Independent of 02/03. Coordinate the waitlist item with 08. Lowest urgency of the current batch — do it after cycle-stamping (02) and the tier lock (03).
