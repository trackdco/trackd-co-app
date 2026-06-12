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
  `reference_ranges` table) and the seed CSVs + generator (`build-seed-sql.mjs`)
  that load the read-only catalogues. `supabase/legal/` holds the
  `legal_documents` table + seed (the `legal_documents_table` +
  `seed_legal_documents` migrations). `supabase/weight/` holds
  `001_weight_logs.sql` (the `weight_logs_table` migration — the dedicated
  bodyweight-tracking table), bringing the live DB to **19 tables**.
  `supabase/avatar/` holds `001_avatar_storage.sql` (the `avatar_storage`
  migration) — the private `avatars` storage bucket + owner-scoped policies and
  the `profiles.avatar_path` column. `supabase/profile/` holds
  `001_starting_weight_precision.sql` (the `starting_weight_precision` migration)
  — widens `profiles.weight_kg` to `numeric(5,2)` for the 2-decimal starting
  weight. `supabase/home/` holds `001_device_state_sync.sql` (the
  `device_state_sync` migration) — the three cloud-backup tables for the interim
  device-local home stores (`user_stack_compounds`, `user_dose_logs`,
  `user_custom_compounds`), bringing the live DB to **22 tables**.
  `supabase/grants/` holds
  `001_api_role_grants.sql` (the `api_role_grants` migration) — the table-level
  privileges the PostgREST roles need on top of RLS (see Auth and Access Model);
  new user-owned tables ship their grant inline (`weight_logs` grants full DML to
  `authenticated`).
- `Context/` — The spec. Defines what to build (`project-overview.md`), how
  (`code-standards.md`, this file), the UI language (`ui-context.md`), the
  session rules (`ai-workflow-rules.md`), and current state (`progress-tracker.md`).
- **Supabase (managed)** — Owns identity, persistence, row-level access control,
  and all derived computation (inventory maths, biomarker position) via views.

## Storage Model

- **Postgres (Supabase)** — All structured data: profiles, the read-only
  `compounds`, `biomarkers`, `markers`, and `reference_ranges` seed catalogues,
  cycles, protocol compounds, inventory items, dose logs, lab panels and
  biomarker results, body metrics, markers and journal entries,
  notification/push preferences, and the `legal_documents` text (ToS / privacy /
  medical disclaimer; see **Legal Documents** below). Ownership and relationships
  live here; access is enforced by RLS, not by application code. `reference_ranges`
  holds age/sex-banded
  ranges (NULL `sex` = any) where the flat male/female columns on `biomarkers`
  are insufficient — e.g. IGF-1, which falls with age. Stored for reference only;
  not wired into interpretation (see Invariants 3 & 4).
- **Postgres views (computed, never stored)** — `v_inventory_math` (remaining,
  concentration, mL/units per dose, doses-remaining, projected-empty) and
  `v_biomarker_position` (below / within / above). These are derived on read.
- **Supabase Storage (private)** — Two private, owner-scoped buckets. **`bloodwork`**
  for lab-report uploads (path `<auth.uid()>/<panel_id>/<file>`) and **`avatars`**
  for profile pictures (path `<auth.uid()>/<file>`; the chosen path is stored on
  `profiles.avatar_path`, displayed via a short-lived signed URL). Both stay
  PRIVATE; files are referenced from Postgres, the bytes never live in the database.
- **Bodyweight (`weight_logs`)** — the single source of truth for bodyweight (one
  row per `(profile_id, logged_for)`, last write wins; `weight numeric(5,2)`, kg).
  The Weight view writes it; the home glance card and the Profile "Weight" row read
  the latest entry. `profiles.weight_kg` is now only a legacy onboarding-snapshot
  fallback (no longer user-editable — the Settings weight field was removed); and
  `body_metrics` is superseded for weight tracking. Read directly (not a derived
  view) and scoped by RLS.
- **Bundled compounds catalogue (app, read-only)** — The `compounds` catalogue is
  also shipped to the app as a generated static module (`lib/compounds-catalogue.ts`,
  built from `supabase/seed/compounds.csv` via `build-compounds-data.mjs` — the CSV
  stays the single source of truth, same file that seeds the DB). The Add-to-Stack
  search reads this module so it works offline (PWA) without an auth/network
  round-trip. This applies **only** to the read-only `compounds` reference data; all
  user data and derived values still come from Postgres/views. Swap to a live
  Supabase read if the catalogue ever needs to update without a redeploy.
- **Browser `localStorage` (device cache) + Supabase mirror (durable source)** —
  The three home stores — the protocol **stack** (`trackd.stack.v2.<auth.uid()>`,
  `lib/home/stack.ts`), the **dose log** (`trackd.doselog.v1.<auth.uid()>`,
  `lib/home/doseLog.ts`), and the user-created "Make your own" **custom compounds**
  (`trackd.customCompounds.<auth.uid()>`, `components/navigation/add-to-stack-menu.tsx`)
  — keep `localStorage` as the synchronous, offline-capable read path the UI uses,
  but are now **mirrored to Supabase** so they survive a PWA delete/reinstall (which
  wipes the installed app's `localStorage`). The cloud tables live in
  `supabase/home/001_device_state_sync.sql` (`user_stack_compounds`,
  `user_dose_logs`, `user_custom_compounds`): one row per entity, each holding the
  verbatim client object in a `jsonb` `data` payload. This is **interim** — NOT the
  normalised `protocol_compounds`/inventory model (still the future end-state); the
  stores' own read-normalisers harden the shape on the way back into `localStorage`.
  Writes go through best-effort **server actions** in `lib/home/syncActions.ts`
  (identity from the verified session, RLS the backstop — mirrors
  `weight/actions.ts`); on load, `components/home/useCloudHydration.ts` (stack +
  logs) and the Add-to-Stack menu (customs) **union** cloud with local (cloud wins
  on conflict; any local-only entries migrate up) and write the merged set back into
  `localStorage`. A network blip never blocks the UI — the synchronous local write
  already succeeded; the cloud is a durable backup, not the read path. The
  plus-button **Shortcuts
  menu** (A10) is now a fixed layout — a primary "Log a dose" over a consistent
  six-tile grid — so it persists nothing (the earlier reorderable card order +
  `lib/shortcutOrder.ts` were removed when the menu was reworked).

## Legal Documents

The Terms of Service, Privacy Policy, and Medical Disclaimer **text** lives in the
`legal_documents` table (the 18th table; added post-v0.4.2 via the
`legal_documents_table` + `seed_legal_documents` migrations, SQL in
`supabase/legal/`). One row per `(doc_type, version)`; `is_current` flags the live
version of each type, with a partial unique index enforcing exactly one current
per type. Write model matches the seed catalogues — **service-role writes only** —
but, unlike them, **read is public (`anon` + `authenticated`)** because signup
shows the documents before a user has an account.

**Wired into signup (2026-06-08).** The 18+/ToS gate at `/welcome` now reads the
current ToS version live from this table and records acceptance on the profile
(`tos_accepted_at` + `tos_version`); a single acceptance covers all three
documents (Terms + Privacy + Medical Disclaimer). The documents are rendered
verbatim from this table at `/terms`, `/privacy`, and `/medical-disclaimer` (one
shared `components/legal/legal-document.tsx` renderer, public read). The
launch-day bump-to-1.0 procedure below still applies — the gate picks up the new
version automatically because it reads `is_current`.

### Versioning & dating rule — follow this every time we touch a legal document

- **Pre-launch (current state):** documents sit at their draft versions — ToS
  `0.2`, Medical Disclaimer `0.2`, **Privacy Policy `0.1`** — with `is_beta = true`,
  `effective_date = NULL`, and the in-body header reading
  "DD Month 2026 — set on launch".
- **At first launch:** bump **all three to `1.0`**, set `effective_date` *and* the
  in-body header date to the **launch day**, set `is_beta = false`, and rename the
  current source files to `…-v1.0` (drop "beta" — it isn't beta once released).
  The launch date is then **frozen**; it does **not** auto-advance afterwards.
- **Each later change to a document:** bump that document by a **whole version**
  (`1.0 → 2.0 → 3.0 …` — never `1.1`/`2.3`), set its `effective_date`/header date
  to that change's date, and mark the previous row `is_current = false` (DB keeps
  full version history). Keep only the current version's **source file** in
  `supabase/legal/` exports — delete superseded legal source files so we "start
  fresh" each release. (Tracked SQL migrations are immutable history and are never
  rewritten or deleted.)
- Text is stored **verbatim** with only encoding mojibake repaired. The Privacy
  Policy's inline "⚠ NOTE" drafting blocks are intentionally retained at Adrian's
  instruction until he finalises them.

## Auth and Access Model

- Every user signs in via **Supabase Auth**. There is no anonymous app state;
  the today-dashboard requires a session.
- Signup is gated by an **18+ confirmation** before the account is usable.
- Every row is owned by a single user. **RLS is enabled on every table** and is
  the only thing standing between two users' data — there is no app-layer
  ownership check to fall back on.
- The house RLS pattern wraps the identity call as `(SELECT auth.uid())` so the
  planner caches it. Use this everywhere; do not call `auth.uid()` bare.
- **RLS gates rows; PostgREST grants open the table.** RLS only runs once the API
  role can reach the table at all, which needs a table-level `GRANT` to
  `anon`/`authenticated`. This project's Supabase defaults do **not** auto-grant
  DML to those roles, so the grants are explicit in
  `supabase/grants/001_api_role_grants.sql` (migration `api_role_grants`):
  `legal_documents` SELECT to anon + authenticated; the read-only catalogues
  SELECT to authenticated; user-owned tables full DML to authenticated; `profiles`
  SELECT/INSERT/UPDATE (no self-delete); both views SELECT to authenticated. The
  grants do not weaken anything — RLS is still the only row-level gate, and
  read-only catalogues stay read-only via their absent write policy. **Any new
  `public` table must ship its own grants** (or set `ALTER DEFAULT PRIVILEGES`),
  or the Data API will 42501 on it.
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
