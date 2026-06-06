# Architecture Context

> Trackd Co — a PWA for tracking peptide, anabolic, supplement, and
> hormone-optimisation protocols in one unified system. An information
> and tracking SaaS for informed adults. **NOT** a medical device,
> telehealth provider, or pharmacy.

## Stack

| Layer     | Technology                          | Role                                                              |
| --------- | ----------------------------------- | ----------------------------------------------------------------- |
| Framework | Next.js 16 (App Router) + TypeScript | Routing, server/client components, server actions, PWA shell      |
| Runtime   | React 19                            | UI rendering                                                      |
| UI        | Tailwind CSS v4                     | Styling via CSS-variable tokens (see `ui-context.md`)             |
| Auth      | Supabase Auth                       | Signup, login, session; identity for RLS (`auth.uid()`)          |
| Database  | Supabase Postgres + RLS             | All app data; ownership and access enforced at the row level      |
| Storage   | Supabase Storage                    | Bloodwork file uploads (private, owner-scoped bucket)             |
| Hosting   | Vercel                             | Deploy + edge; serves the installable PWA at the root `trackdco.app` |

**Deferred (post-trip, not built during the sprint):** Stripe (payments),
Web Push/VAPID + Supabase Edge Functions (notification delivery), Resend +
ConvertKit (email), PostHog (analytics), Sentry (errors), Claude Sonnet
(v1.5 bloodwork analyser). Tables/columns that model these may already exist
in the schema — storage only, no behaviour, until post-trip.

## System Boundaries

- `app/` — Next.js App Router routes, layouts, server/client components, and
  server actions. Owns the UI and the today-dashboard / cycle / dose / journal
  / calendar / bloodwork flows. Calls Supabase; holds **no** business maths that
  belong in the database (see Invariants).
- `app/globals.css` — Global styles and the CSS-variable design tokens defined
  in `ui-context.md`. No hardcoded hex outside this file.
- `supabase/` — Canonical data model and access policy. `trackd_schema_v0_4_2.sql`
  (16 tables, 2 views) is the source of truth for tables, views, triggers, and
  RLS. `trackd_storage_policies.sql` defines the private `bloodwork` bucket and
  owner-scoped storage policies. Apply both in the **same** migration session.
  `supabase/seed/` holds the catalogue extension applied on top of v0.4.2 (the
  `catalogue_enums_and_reference_ranges` migration — enum additions + the
  `reference_ranges` table, bringing the live DB to **17 tables**) and the seed
  CSVs + generator (`build-seed-sql.mjs`) that load the read-only catalogues.
- `Context/` — The spec. Defines what to build (`project-overview.md`), how
  (`code-standards.md`, this file), the UI language (`ui-context.md`), the
  session rules (`ai-workflow-rules.md`), and current state (`progress-tracker.md`).
- **Supabase (managed)** — Owns identity, persistence, row-level access control,
  and all derived computation (inventory maths, biomarker position) via views.

## Storage Model

- **Postgres (Supabase)** — All structured data: profiles, the read-only
  `compounds`, `biomarkers`, `markers`, and `reference_ranges` seed catalogues,
  cycles, protocol compounds, inventory items, dose logs, lab panels and
  biomarker results, body metrics, markers and journal entries, and
  notification/push preferences. Ownership and relationships live here; access is
  enforced by RLS, not by application code. `reference_ranges` holds age/sex-banded
  ranges (NULL `sex` = any) where the flat male/female columns on `biomarkers`
  are insufficient — e.g. IGF-1, which falls with age. Stored for reference only;
  not wired into interpretation (see Invariants 3 & 4).
- **Postgres views (computed, never stored)** — `v_inventory_math` (remaining,
  concentration, mL/units per dose, doses-remaining, projected-empty) and
  `v_biomarker_position` (below / within / above). These are derived on read.
- **Supabase Storage (private)** — Bloodwork file uploads only, in the private
  `bloodwork` bucket. Path convention: `<auth.uid()>/<panel_id>/<file>`. Files
  are referenced from Postgres; the bytes never live in the database.

## Auth and Access Model

- Every user signs in via **Supabase Auth**. There is no anonymous app state;
  the today-dashboard requires a session.
- Signup is gated by an **18+ confirmation** before the account is usable.
- Every row is owned by a single user. **RLS is enabled on every table** and is
  the only thing standing between two users' data — there is no app-layer
  ownership check to fall back on.
- The house RLS pattern wraps the identity call as `(SELECT auth.uid())` so the
  planner caches it. Use this everywhere; do not call `auth.uid()` bare.
- Both views run with `security_invoker = true` so they respect the querying
  user's RLS (a plain view runs as its owner and would leak every user's rows).
  **RLS verification must query the views and the storage bucket, not just the
  base tables.**
- `compounds`, `biomarkers`, `markers`, and `reference_ranges` are read-only seed
  catalogues: readable by all authenticated users, writable only by the service
  role (no write policy ⇒ RLS denies all user writes).
- Feature entitlements read `profiles.tier` and nothing else. Beta defaults
  everyone to `'paid'`; post-trip, the Stripe webhook becomes the column's only
  writer and the default flips to `'free'`. Gating logic never changes.

## Invariants

1. **Never store a derived value.** Remaining inventory, concentration,
   mL/units per dose, doses-remaining, and projected-empty live only in
   `v_inventory_math`. The calendar and today-dashboard are computed from
   schedules + logs. Editing, undoing, or skipping a dose must reflow
   everything by recomputation — never by a stored figure or a trigger that
   mutates a balance.
2. **RLS on every table, always `(SELECT auth.uid())`.** No table ships without
   row-level policies. Views stay `security_invoker = true`. `SECURITY DEFINER`
   functions pin `search_path = ''`. Cross-user reads must be impossible.
3. **Categorical, never evaluative.** Biomarker results are expressed as
   below / within / above — never high / bad / red. Side-effect markers are
   negative-polarity ordinal markers, not alarms. The product informs; it does
   not judge or warn.
4. **Information, not decisions.** Trackd is decision-*support*, not
   decision-*making*. It is not a medical device, pharmacy, or telehealth
   provider. No feature may dose, diagnose, titrate, or advise. (AI chat is cut
   permanently for this reason.)
5. **The database is the source of truth for shape and access.** Tables, views,
   triggers, RLS, and the inventory discriminated union (`reconstituted` /
   `preconcentrated` / `oral_solid`, CHECK-enforced) and unit-family integrity
   (mg/mcg vs iu) are enforced in `trackd_schema_v0_4_2.sql`. The app must not
   re-implement or work around these rules in TypeScript.
6. **Seed catalogues are read-only to users.** `compounds`, `biomarkers`,
   `markers`, and `reference_ranges` are written only by the service role. The app
   reads them; it never lets a user write them. Catalogue contents are seeded from
   the CSVs in `supabase/seed/` via idempotent inserts. `compounds`, `biomarkers`,
   and `markers` use `ON CONFLICT (name) DO UPDATE`, while `reference_ranges`
   uses `ON CONFLICT ON CONSTRAINT reference_ranges_band_unique DO UPDATE`
   because it is keyed by `(biomarker_id, sex, age_min, age_max)`.
7. **Entitlement gates read `profiles.tier` only.** No other signal gates
   features. Changing pricing or tiers must not touch gating logic.
8. **Archive, never hard-delete user history.** Deleting a cycle cascades
   through protocol compounds → inventory → dose logs and destroys all dose
   and injection-site history inside it. The app archives a cycle via
   `is_active = false` and never exposes a hard delete. (The DB cascade is
   kept only so full account deletion still erases a user on request.)
   Longitudinal data is the moat — destructive actions must be deliberate.
9. **Keep this file true.** When a boundary, storage decision, or invariant
   changes in code, update this file in the same change (per `ai-workflow-rules.md`).
