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
  belong in the database (see Invariants). **Phone-only by intent:** at ≥1024px the
  root layout hides the whole app shell (`lg:hidden`) and renders
  `DesktopInterstitial` in its place — a pure CSS-width gate (no UA sniffing, no
  hydration flash), wired through the small client `DesktopGate` so the dev-only
  `/preview/*` harness stays viewable at desktop. Even a signed-in user is gated
  (a "welcome back / open it on your phone" QR card); the variant is chosen from the
  verified session via the request-cached `getCurrentUser` (see Auth and Access Model).
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
  `supabase/progress/` holds `001_progress_photos.sql` (the `progress_photos`
  migration) — the **Progress screen's** posed photo log (one row per photo:
  `pose` text, `taken_on` date, `storage_path`, optional per-session `note` added
  by `002_progress_photo_note.sql`) plus the private `progress-photos` bucket +
  owner-scoped policies, bringing the live DB to **23 tables**. Adding photos is a
  multi-pose **session** (fill Front/Side/Back + more on one page, submit together
  via a batch insert sharing the note).
  `supabase/grants/` holds
  `001_api_role_grants.sql` (the `api_role_grants` migration) — the table-level
  privileges the PostgREST roles need on top of RLS (see Auth and Access Model);
  new user-owned tables ship their grant inline (`weight_logs` grants full DML to
  `authenticated`). `supabase/protocol/` holds
  `001_protocol_compound_rotation.sql` (the `protocol_compound_rotation` migration)
  — the **Protocol Cutover** schema delta adding `protocol_compounds.rotation_sites
  text[]` + `rotation_index` (the injection-site rotation plan, which the base
  schema had nowhere for); additive columns, no new table (still **23 tables**).
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
- **Supabase Storage (private)** — Three private, owner-scoped buckets. **`bloodwork`**
  for lab-report uploads/photos (path `<auth.uid()>/<panel_id>/<file>`; the Progress
  "bloodwork" section is a dated **photo store** over `lab_panels`, reusing this
  bucket — values aren't parsed, the screenshot is the record), **`avatars`** for
  profile pictures (path `<auth.uid()>/<file>`; the chosen path is stored on
  `profiles.avatar_path`), and **`progress-photos`** for posed progress photos
  (path `<auth.uid()>/<id>/<file>`, referenced by `progress_photos.storage_path`).
  All stay PRIVATE, displayed via short-lived signed URLs; files are referenced
  from Postgres, the bytes never live in the database.
- **Progress screen (multi-source, all per-user, RLS-scoped).** Weight reads
  `weight_logs`; bloodwork is the photo store above (`lab_panels` + `bloodwork`
  bucket); the journal reads `journal_entries` + `marker_readings` → `user_markers`
  → `markers` (display the WORD from `tier_labels`, store the ordinal `tier_value`;
  one entry per day, both "+" paths merge); progress photos use `progress_photos` +
  the `progress-photos` bucket (a photo also shows the weight logged that date — the
  weight-quick-log can capture photos inline). **Consistency** is computed
  client-side from the device-local dose data (the cycles/`dose_logs` model isn't
  wired yet, so the per-cycle breakdown is deferred). Health data stays categorical/
  neutral throughout (no good/bad colour); amber on Progress is selection/active
  state only.
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
  verbatim client object in a `jsonb` `data` payload. The stores' own
  read-normalisers harden the shape on the way back into `localStorage`.
  Writes go through best-effort **server actions** in `lib/home/syncActions.ts`
  (identity from the verified session, RLS the backstop — mirrors
  `weight/actions.ts`). A network blip never blocks the UI — the synchronous local
  write already succeeded; the cloud is a durable backup, not the read path.

- **Protocol Cutover — the canonical model is now Postgres (all 5 steps built).** As
  of the cutover the **source of truth for the protocol stack + dose
  logging is the normalised Postgres model** — `cycles → protocol_compounds →
  dose_logs` (`supabase/trackd_schema_v0_4_2.sql`), one active `"Current"` cycle per
  user via `ensureActiveCycle()`. The `localStorage` stores above are **demoted to an
  offline cache** over Postgres: the UI still reads/writes them synchronously (instant +
  offline), but every mutation now ALSO dual-writes Postgres, and on load they hydrate
  from Postgres. Layers:
  - **Data access** (`lib/db/cycles.ts`, `protocolCompounds.ts`, `doseLogs.ts`) —
    `"use server"`, RLS-scoped, identity from the session, never the
    service role; upsert on a client-generated id (idempotent). `lib/db/types.ts` holds
    the row/insert types + the local↔Postgres mapping (cadence→`schedule_type`,
    `0=Sun`→ISO `Mon=1`, site-id↔`injection_site`, and the `StackCompound`↔row mappers).
  - **Home adapter** (`lib/home/protocolSync.ts`, `"use server"`) — the single place
    that resolves catalogue name⇄`compounds.id` and derives the stable
    `protocol_compounds.id` (the client uuid when valid, else a deterministic hash). The
    `lib/home/stack.ts` / `doseLog.ts` mutators dual-write through it; the Home flip is
    invisible to the components.
  - **Migration** (`lib/migration/migrateDeviceState.ts`) — one-time, idempotent,
    marker-guarded backfill of the device stores into Postgres, run post-login from
    `useCloudHydration` (which now hydrates from Postgres, merging device-local customs).
  - **Rotation** lives on `protocol_compounds.rotation_sites text[]` +
    `rotation_index` (`supabase/protocol/001_protocol_compound_rotation.sql`).
  - **Protocol screen (Step 4)** — `app/(app)/protocol/page.tsx` is now the real
    screen (`components/protocol/`): ONE tab with an in-page **Plan / Stock** toggle
    (Adrian-approved consolidation of Angus's "Cycles" + "My Protocol", a change from
    Spec 11 — NOT a second nav tab). **Plan** = the cycle builder (active-cycle header
    with "Week X of N" from `lib/protocol/cycle.ts`, the compound list reusing the Home
    row treatment, add via the existing Add-to-Stack flow, edit via `AddCompoundSheet`,
    and a cycle-edit sheet → `updateCycle`). **Stock** (Step 5,
    `components/protocol/{StockView,StockItemCard,AddStockSheet}.tsx` + `lib/db/inventory.ts`)
    lists `inventory_items` with **"stock left"** — remaining / doses-remaining /
    projected-empty read ONLY from `v_inventory_math` (never recomputed); add-stock branches
    the 3-way type union (reconstituted / preconcentrated / oral_solid; refill = a NEW row,
    archive = `is_active=false`, never hard-delete). Each card shows a **neutral fullness bar**
    (`remaining_base/total_base`, white on a track — no good/bad colour). Stock can also be
    logged **inline when adding a compound** (`AddCompoundSheet` has an optional "Got a vial?"
    step). Runway is shown **neutrally**. The cycle carries an optional free-text **description**
    (`cycles.notes`) shown under the Plan header. The dose-plan is never labelled "protocol" in
    UI (it's "Plan"/"Cycle").
    A dev-only `/preview/protocol` (mock data, 404 in prod) renders the screen without auth.
    (Per-cycle **goals** were prototyped then removed — goals belong in Progress, where you
    track against them; revisit in a later version.)
  - **Dose→inventory link (wired):** the Home log sheet (`LogDoseSheet`) shows a **"From
    vial"** picker of THIS compound's compatible inventory items; the chosen one rides on the
    device `DoseLog.inventoryItemId` and `pushProtocolDoseLog` sets `dose_logs.inventory_item_id`
    (validating unit-family vs the vial, dropping an incompatible link rather than failing the
    log). So logging a dose **decrements that vial's "stock left"** via `v_inventory_math`
    (`consumed`); unlogging restores it.
  - **Scope:** only **catalogue** compounds are in Postgres; **custom "Make your own"**
    compounds remain device-local (jsonb mirror) and Home merges them — true custom
    support is v1.5. The Step 5 Stock view reads `v_inventory_math` (runway), and logging a
    dose against a vial decrements it. (The `lib/sync/{cache,syncEngine}.ts` outbox
    scaffold + the `/preview/db-sync` and `/preview/protocol-test` harnesses were
    **removed (2026-06-18)** once the cutover settled — the live path is
    `lib/home/protocolSync.ts` + `migrateDeviceState.ts`.)
  - **Offline-first** is preserved: reads come from the cache; writes are optimistic to
    the cache and dual-written to Postgres, with a reconnect/focus re-sync that re-pushes
    anything written offline (idempotent). A failed/empty pull never wipes the cache.
    **Offline _state changes_ (archive/reactivate) win over a stale Postgres pull**
    (`hydrateProtocol.ts` reconciles the local `archived` flag and converges Postgres) —
    so an archive done offline is no longer resurrected on reconnect. A robust offline
    outbox (covering offline dose un-logging + multi-device conflicts) is post-beta work.

- The plus-button **Shortcuts menu** (A10) is now a fixed layout — a primary "Log a
  dose" over a consistent six-tile grid — so it persists nothing (the earlier
  reorderable card order + `lib/shortcutOrder.ts` were removed when the menu was reworked).

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

- **Current state (1.0, finalised text, date pending — 2026-06-18):** all three
  documents are now at **version `1.0`** with `is_beta = false` and the
  draft-era "⚠ NOTE" blocks removed (the `legal_documents_v1_0` migration,
  `supabase/legal/003_legal_documents_v1_0.sql`, applied live; the 0.x rows are
  retained as history with `is_current = false`). `effective_date` is still
  `NULL` and the in-body header still reads "DD Month 2026 — set on launch" —
  **Adrian deliberately deferred the date.** So the only remaining launch-day
  step for legals is **setting the date** (next bullet).
- **At first launch (date step only — versions are already 1.0):** set
  `effective_date` *and* the in-body header date to the **launch day** on all
  three current rows, in a new whole-version-free update (the text doesn't
  change, so this is a date-only edit — do **not** invent a new version number
  for it). The launch date is then **frozen**; it does **not** auto-advance.
  (Known content gaps to close at or before this step: the Privacy Policy's
  "[retention window to be confirmed]" placeholder, and confirming PostHog /
  Sentry / Stripe are actually wired before the policy describes them as in use.)
- **Each later change to a document:** bump that document by a **whole version**
  (`1.0 → 2.0 → 3.0 …` — never `1.1`/`2.3`), set its `effective_date`/header date
  to that change's date, and mark the previous row `is_current = false` (DB keeps
  full version history). Keep only the current version's **source file** in
  `supabase/legal/` exports — delete superseded legal source files so we "start
  fresh" each release. (Tracked SQL migrations are immutable history and are never
  rewritten or deleted.)
- Text is stored **verbatim** with only encoding mojibake repaired. The body now
  uses a small Markdown subset the renderer understands (`##`/`###` headings,
  `-` bullets, `**bold**` emphasis — see `components/legal/legal-document.tsx`);
  the draft-era "⚠ NOTE" blocks were removed at 1.0.

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
