# Feature Spec — 16-tier-column-lock
*Agent-ready. Behaviour and data only. Paste into a fresh Claude Code chat. One spec = one chat.*

---

## §0 — Preflight (do this BEFORE writing anything)

- [ ] Read the six canonical files + `Context/next-tasks.md`.
- [ ] Using the **Supabase MCP**: dump the full column list of `profiles`; the current `UPDATE` grants held by `authenticated` on `profiles`; and all RLS policies on `profiles` (confirm the owner `UPDATE` policy with `WITH CHECK (auth.uid() = id)`).
- [ ] Confirm the enum `user_tier` allowed values `{free, paid}` and the current DEFAULT.
- [ ] Read the Stripe sync path `lib/stripe/sync.ts` and `app/api/stripe/webhook/route.ts` (on the `stripe` branch) to confirm the webhook writes `tier` via the **service-role** client (`sb_secret_…`), and note the status→tier map.
- [ ] Confirm the app's legitimate need to update *other* `profiles` columns (prefs, 18+/ToS fields, display name, etc.) so the lock doesn't break them.
- [ ] State your plan back to me and wait for "go".

## Problem
`profiles` has an owner `UPDATE` RLS policy covering the whole row, and `authenticated` holds a table-level `UPDATE` grant with no column restriction and no guarding trigger. So any logged-in user can `PATCH /profiles?id=eq.<self>` and set their own `tier = 'paid'` through the Data API. It's harmless today because the default is already `paid` and nothing gates — but the instant the default flips to `free` and features gate on `tier`, **every user can grant themselves Pro for free.** The webhook is *intended* to be the column's only writer; that's currently a convention, not an enforced fact. This must be closed before spec 04 (gating) ships and before the default is ever flipped.

## Goal
`profiles.tier` can only be written by the service role (the Stripe webhook). A normal authenticated user cannot change their own tier by any path, while retaining the ability to update their other profile fields.

## Behaviour (from the data's point of view)
1. An `authenticated` user updating their own `profiles` row succeeds for all non-`tier` columns.
2. Any attempt by an `authenticated` user to change `tier` (via Data API PATCH or otherwise) is rejected at the database level.
3. The service-role client (webhook) can still write `tier` freely.
4. The status→tier mapping is unchanged; only *who may write the column* is constrained.

## Data model changes
Pick ONE approach in §0 and justify (prefer A unless a finding rules it out):

**A — Column-level privilege (declarative, preferred).**
`REVOKE UPDATE ON public.profiles FROM authenticated;` then `GRANT UPDATE (col1, col2, …) ON public.profiles TO authenticated;` enumerating **every column except `tier`** (and any other service-only columns). Enumerate from the §0 column dump so nothing legitimate is lost. New columns added later must be added to this grant — note that in `code-standards`.

**B — BEFORE UPDATE trigger (fallback).**
A trigger that `RAISE EXCEPTION` when `NEW.tier IS DISTINCT FROM OLD.tier` and the caller is not the service role (check the JWT role claim, e.g. `current_setting('request.jwt.claims', true)::json ->> 'role' <> 'service_role'`). `SET search_path = ''`, `SECURITY DEFINER` per house rules.

Ship as a tracked migration in `supabase/`.

## Open architectural decisions (surface, do NOT guess)
- Confirm the service-role client genuinely bypasses the column grant (it does — grants don't constrain the table owner/service role — but verify against live before relying on it).
- Are there other service-only columns on `profiles` that should also be excluded from the authenticated UPDATE grant? List them; don't assume only `tier`.

## Out of scope (do NOT build)
- The gating logic itself (spec 04).
- Flipping the default to `free` (separate launch-day migration).
- Stripe webhook implementation (July).

## Acceptance criteria
- [ ] As an authenticated test user, a PATCH setting `tier = 'paid'` on own row is **rejected** (verify live via MCP with a real user token).
- [ ] As the same user, a PATCH updating a normal profile field **succeeds**.
- [ ] A service-role write of `tier` **succeeds**.
- [ ] Approach chosen (A/B) and rationale recorded in `architecture.md` or `code-standards.md`, including the "new columns must join the grant" note if A.
- [ ] `progress-tracker.md` updated.

## Dependencies
None to start, but **must land before spec 04 (gating) and before the tier default is ever flipped to `free`.**
