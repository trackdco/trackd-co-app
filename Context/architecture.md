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
Resend + ConvertKit (email), PostHog (analytics), Sentry (errors), Claude Sonnet
(v1.5 bloodwork analyser). Tables/columns that model these may already exist
in the schema — storage only, no behaviour, until post-trip.

**Web Push — Phase 1 (transport) is BUILT (Spec 14, 2026-06-23).** Web Push/VAPID
+ a Supabase Edge Function (`send-push`) now deliver a real notification to a
subscribed device end-to-end (Android/Chrome + an installed iOS PWA). The base
schema's "deferred Web Push storage" (`push_subscriptions`,
`notification_preferences`) is now wired: the client subscribes via the service
worker, decomposes the `PushSubscription` into `push_subscriptions`, and the Edge
Function fans out with `web-push` + VAPID, pruning dead endpoints (404/410). See
**Push Notifications** below.

**Web Push — Phase 2 (reminder scheduler) is BUILT, founders-first (2026-06-23).**
Three reminder jobs — **dose reminders** (a daily digest of what's due), a
**missed-dose nudge**, and a **low-stock alert** (from `v_inventory_math`) — fire
through the Phase-1 pipe, gated by each user's reminder time + **quiet hours**, sent
at most once per local day (dedupe stamps on `notification_preferences`). The
compute+send engine (`lib/notifications/`) is shared by a **test harness** (the
Settings "Send a test notification" button, force-sends the current user's real
reminders) and a secured cron route (`/api/notifications/run`, founders-only). See
**Push Notifications** below. **The scheduler is now LIVE + verified end-to-end
(2026-06-23):** a Supabase `pg_cron` job (`reminder-runner`) POSTs the route via
`pg_net`, with `SUPABASE_SECRET_KEY` + `CRON_SECRET` in Vercel and a
`service_role` table grant (`supabase/grants/002` — the project had never granted
`service_role` since nothing server-side used it; the scheduler was the first, so
its reads `42501`'d until granted). Confirmed: cron run `succeeded`, route `200`, a
real reminder delivered. The cron runs every 15 min (`*/15 * * * *`, relaxed from
every-minute after testing; confirmed live 2026-06-26). **Still out of scope:**
per-compound dose times (we store which DAYS a dose is due, not a per-dose time)
and the journal/weekly-recap reminders. (Each user's timezone is now captured on
notification opt-in → `profiles.timezone`; Sydney is only the fallback when none is
stored.)

## System Boundaries

- `app/` — Next.js App Router routes, layouts, server/client components, and
  server actions. Owns the UI and the today-dashboard / cycle / dose / journal
  / calendar / bloodwork / calculator flows. Calls Supabase; holds **no** business
  maths that belong in the database (see Invariants). **The five bottom-nav tabs are
  `/dashboard`, `/protocol`, `/calculator`, `/progress`, `/profile`** — `/calculator`
  (Spec 20) mounts the reconstitution calculator (`components/calculator/`)
  on its own screen, and is its **only** entry point: the Home glance card
  (`ReconCalcCard`) and its bottom-sheet frame (`ReconCalculatorSheet`) were both
  **deleted** once the nav tab landed (Adrian's call — the tab replaces them, so they
  only duplicated it). The calculator reads nothing — the maths are pure arithmetic on
  what the user types (and DELIBERATELY no longer mirror `v_inventory_math`'s rounding: the view rounds concentration to 3dp, the calculator does not, because dividing by a rounded concentration was giving a 20% error on weak solutions. Adrian, 2026-07-30. Nothing here is stored or feeds the view, so the two cannot disagree about data). The dev-only
  `/preview/recon` harness mounts the same component unauthed. Spec 07 (wave 2 pt
  two) rebuilt its presentation around a **proportional syringe graphic** and moved
  it out of `components/home/`: the arithmetic now lives in `lib/calculator/recon.ts`
  and the barrel's scale/fill in `lib/calculator/syringe.ts`, both pure and tested,
  with `recon.test.ts` **pinning the outputs to the pre-rebuild figures** so a later
  refactor cannot silently move a number. Still stateless in the sense the spec means (no
  presets, no saved calculations, no history, no compound data), with TWO device-
  local preferences: the first-run notice's dismissal, and the chosen syringe
  size (`trackd.calculator.syringeSize`), which is picked once and sticks until
  changed rather than being re-asked every visit (Adrian, 2026-07-30). Reset
  clears the inputs, not the syringe. **Phone-only by intent:** at ≥1024px the
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
  `002_inventory_partial_fill.sql` adds `inventory_items.prior_used_base` (part-used
  vials). `003_protocol_compound_uniqueness.sql` adds `UNIQUE (cycle_id, compound_id)`
  + the `one_active_cycle_per_user` partial unique index (the duplicate-compound
  fix — see the Protocol Cutover notes below). All additive/constraint-only, still
  **23 tables**. `004_custom_protocol_compounds.sql` makes
  `protocol_compounds.compound_id` nullable and adds `custom_name` +
  `custom_category` (a row is now a catalogue compound XOR a custom one, identity
  CHECK-enforced + a `(cycle_id, custom_name)` partial unique index) so **custom
  "Make your own" compounds can carry vials + stock runway** through the unchanged
  `inventory_items`/`v_inventory_math` chain — the read-only `compounds` catalogue
  is untouched, so Invariant 6 stands. Additive, still **23 tables**.
  `supabase/consent/` holds `001_consent_records.sql` (the `consent_records`
  migration, Spec 12) — the append-only, per-user, per-version legal-consent
  audit log written at signup (insert+select-own RLS, no update/delete; FK to
  `profiles` so it cascades on account deletion), bringing the live DB to
  **24 tables**. `supabase/notifications/` holds `001_push_subscriptions.sql` (the
  `push_subscriptions` migration, Spec 14) — note the `push_subscriptions` table
  itself already shipped in the base schema (deferred Web Push storage), so this
  migration only adds the `profiles.notifications_enabled` intent flag (no new
  table — still **24 tables**). `supabase/functions/send-push/` holds the Web Push
  sender Edge Function (Deno; excluded from the app's `tsconfig`/ESLint). See
  **Push Notifications** below. `supabase/sites/` holds the **Injection Site
  Rework** (Spec 19) data foundation — the read-only, coordinate-bearing
  `injection_sites` catalogue (`001` + seed `002` from `injection_sites.csv` via
  `build-sites-seed.mjs`, plus retunes `007`–`009`), adding **one table**. The
  abandoned per-user working set (`003`/`004`, table `user_injection_sites`) is
  dropped again by `010_drop_working_set.sql`. See **Injection Sites (Spec 19)** below.
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
- **Supabase Storage (private)** — Four private, owner-scoped buckets. **`bloodwork`**
  for lab-report uploads/photos (path `<auth.uid()>/<panel_id>/<file>`; the Progress
  "bloodwork" section is a dated **photo store** over `lab_panels`, reusing this
  bucket — values aren't parsed, the screenshot is the record), **`avatars`** for
  profile pictures (path `<auth.uid()>/<file>`; the chosen path is stored on
  `profiles.avatar_path`), and **`progress-photos`** for posed progress photos
  (path `<auth.uid()>/<id>/<file>`, referenced by `progress_photos.storage_path`), and
  **`journal`** for photos attached to journal entries (Spec 22 · 3; path
  `<auth.uid()>/<id>/<file>`, referenced by `journal_attachments.storage_path` —
  `supabase/journal/001`). All stay PRIVATE, displayed via short-lived signed URLs;
  files are referenced from Postgres, the bytes never live in the database.
  (Custom user markers, Spec 22 · 1, are structured data only — they ride the existing
  `user_markers.custom_name` / `custom_tier_labels` / `custom_polarity` columns, no bucket.)
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

- **Cycle-ID stamping — the moat, per-cycle attribution (Spec 15).** Every
  per-cycle user entry is stamped with the user's current cycle at INSERT time so
  any cycle can later return its full cross-type history (principle #6). **"Current
  cycle context" = the user's single `is_active = true` cycle** — unambiguous
  because the Protocol Cutover's `one_active_cycle_per_user` unique index
  (`(user_id) WHERE is_active`) is live; `lib/db/cycles.ts` `getActiveCycle()`
  reads it. Off-cycle writes (no active cycle) stamp `cycle_id = NULL`, a
  legitimate "logged off-cycle" state — so the column is **nullable**, never NOT
  NULL. Stamped **directly**: `journal_entries` + `lab_panels` (columns pre-existed
  in the base schema) and `weight_logs` + `body_metrics` (added by
  `supabase/cycles/001_cycle_id_stamping.sql`), each `cycle_id uuid → cycles(id) ON
  DELETE SET NULL`, partial-indexed (`WHERE cycle_id IS NOT NULL`) — deleting a
  cycle **detaches** the stamp, never destroys journal/bloodwork/weight history
  (Invariant 8). `marker_readings` and `biomarker_results` carry **no column** —
  they inherit the cycle **transitively** via their NOT-NULL parents (`entry_id →
  journal_entries.cycle_id`, `panel_id → lab_panels.cycle_id`). The stamp is
  **explicit and STABLE**: set once when the row is first created, never re-derived
  on edit — journal edits don't restamp, and the weight write goes through an atomic
  `log_weight` RPC (`supabase/weight/002`, SECURITY INVOKER, `search_path=''`) that
  stamps the active cycle only on the day's first insert and, on re-log, updates the
  weight while leaving `cycle_id` untouched (one `INSERT … ON CONFLICT DO UPDATE`, so
  no read-modify-write race). This is exactly why we STAMP rather than guess by date range (beta
  allowed overlapping/unlimited cycles, so a date-range guess is ambiguous).
  `dose_logs` + `inventory_items` were already cycle-tied via
  `protocol_compounds.cycle_id`. The stamp is NOT a derived value (Invariant 1) —
  it's an explicit write, no trigger/view computes it. Insert paths:
  `app/(app)/progress/actions.ts` (journal + bloodwork), `app/(app)/weight/actions.ts`
  (weight). A separate, **optional, human-run** backfill for pre-stamping NULL rows
  lives in `supabase/cycles/002_cycle_id_backfill.optional.sql` (not a tracked
  migration; assigns a cycle only where exactly one cycle's date range contains the
  row, else leaves NULL).
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
  The four home stores — the protocol **stack** (`trackd.stack.v2.<auth.uid()>`,
  `lib/home/stack.ts`), the **dose log** (`trackd.doselog.v1.<auth.uid()>`,
  `lib/home/doseLog.ts`), and the user-created "Make your own" **custom compounds**
  (`trackd.customCompounds.<auth.uid()>`, `components/navigation/add-to-stack-menu.tsx`),
  and **stacks** (`trackd.stacks.v2.<auth.uid()>`, `lib/home/stacks.ts` — see
  **Stacks** below; `v1` is the pre-dating shape, read once and migrated forward) — keep `localStorage` as the synchronous, offline-capable read path the UI uses,
  but are now **mirrored to Supabase** so they survive a PWA delete/reinstall (which
  wipes the installed app's `localStorage`). The cloud tables live in
  `supabase/home/001_device_state_sync.sql` (`user_stack_compounds`,
  `user_dose_logs`, `user_custom_compounds`): one row per entity, each holding the
  verbatim client object in a `jsonb` `data` payload. The stores' own
  read-normalisers harden the shape on the way back into `localStorage`.
  Separately, a handful of `localStorage` keys are **device PREFERENCES, never
  mirrored and never records**: `trackd.home.weekStripOpen`, `trackd.unitPrefs.*`,
  `trackd:install-prompt-dismissed`, `trackd.calculator.disclaimerSeen`,
  `trackd.calculator.syringeSize` and
  `trackd.blocks.endPromptDismissed.v1.<uid>` (the block ids whose end-date
  prompt was answered "leave running" — see **Blocks** below).
  Every one of them must be **best-effort**: the
  UI holds its own state and storage only remembers it, so a full quota or blocked
  storage costs the user the memory of a choice and never the ability to make one.
  (Spec 07 shipped the inverse briefly — the calculator read the syringe size back
  out of storage to learn what had just been tapped, which made a refused write
  look like dead controls.)
  Writes go through best-effort **server actions** in `lib/home/syncActions.ts`
  (identity from the verified session, RLS the backstop — mirrors
  `weight/actions.ts`). A network blip never blocks the UI — the synchronous local
  write already succeeded; the cloud is a durable backup, not the read path. The
  awaited hydration **pulls** (`pullStackAndLogs`/`pullCustoms`/
  `pullProtocolStackAndLogs`) are wrapped in a **timeout + circuit breaker**
  (`lib/resilience/circuitBreaker.ts`, `guard()`, Spec 13) so a slow/down Supabase
  fast-fails to the local cache (the read path) instead of blocking the serverless
  function — the only external dependency that could cascade. Serverless caveat:
  breaker state is per-warm-instance, so the timeout is the always-on guard.
  **The `user_stack_compounds` mirror is now a CUSTOMS-ONLY backup (2026-06-20).**
  Since the Protocol Cutover, Postgres `protocol_compounds` is the canonical store for
  catalogue compounds, so `lib/home/stack.ts` + `hydrateProtocol.ts` only write CUSTOM
  compounds (name not in `lib/compounds-catalogue.ts`, via `lib/compound-lookup.ts`) to
  the mirror, and the hydrator REFUSES to resurrect a catalogue compound the mirror
  still holds but Postgres doesn't (a deleted/stale leftover). This closed the
  reinstall bug where deleting compounds then reinstalling the PWA brought them back —
  the mirror outlives the localStorage wipe, so it was re-seeding deleted catalogue
  compounds. Customs still survive reinstall (the mirror is their only durable store).

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
    **The "already migrated" marker is now DURABLE on the profile**
    (`profiles.protocol_migrated_at`, migration `profile_protocol_migrated_at`, read/written
    via `lib/db/migrationFlag.ts`) — the old localStorage-only marker was wiped by a PWA
    reinstall, so the migration re-ran and re-seeded the stack from the stale jsonb mirror,
    resurrecting deleted compounds. The cloud flag is now authoritative (the local marker
    is just a fast-path cache); once set, the migration never runs again, even on reinstall.
  - **Stock = active Home compounds only** — `lib/db/inventory.ts` `listStock` inner-joins
    `protocol_compounds` and filters `is_active = true`, so the Protocol Stock view is a
    strict subset of the user's ACTIVE compounds: archiving/removing a compound on Home
    drops its vial from Stock too (it can never show a compound Home doesn't).
  - **Rotation** lives on `protocol_compounds.rotation_sites text[]` +
    `rotation_index` (`supabase/protocol/001_protocol_compound_rotation.sql`).
  - **One compound per (cycle, compound) + one active cycle per user**
    (`supabase/protocol/003_protocol_compound_uniqueness.sql`, applied LIVE). The
    base schema had only a PK on `protocol_compounds.id`, and the
    `one_active_cycle_per_user` index was authored but commented out — so a
    re-add on a drifted cache could mint a second row for the same compound, and
    the concurrent `ensureActiveCycle()` race (the inline "Got a vial?" path fires
    `pushProtocolCompound` twice) could spawn two "Current" cycles. The migration
    de-dupes any leftovers then adds `UNIQUE (cycle_id, compound_id)` +
    `one_active_cycle_per_user (user_id) WHERE is_active`. To match it,
    `ensureActiveCycle` is race-safe (re-reads the winner on a `23505`), and
    `pushProtocolCompound` REUSES the existing row's id for a `(cycle, compound)`
    that already exists (so a re-add updates the canonical row instead of inserting
    a twin); the Postgres pull (`pullProtocolStackAndLogs`) + the hydrate merge also
    de-dupe by compound on read, so the Home stack can never render the same
    compound twice. This is the durable fix for the "duplicate compounds came back"
    class of bug.
  - **Protocol screen (Step 4)** — `app/(app)/protocol/page.tsx` is now the real
    screen (`components/protocol/`): ONE SCROLLING PAGE (Spec 04, wave 2 pt 2 — the Plan / Stock toggle is GONE)
    (Adrian-approved consolidation of Angus's "Cycles" + "My Protocol", a change from
    Spec 11 — NOT a second nav tab). **Plan** = the cycle builder (active-cycle header
    with "Week X of N" from `lib/protocol/cycle.ts`, the compound list reusing the Home
    row treatment, add via the existing Add-to-Stack flow, edit via `AddCompoundSheet`,
    and a cycle-edit sheet → `updateCycle`). **Stock** (Step 5,
    `components/protocol/{CompoundsRow,CompoundStorageCard,ScheduleGrid,StockActionsSheet,AddStockSheet}.tsx` + `lib/db/inventory.ts`)
    lists `inventory_items` with **"stock left"** — remaining / doses-remaining /
    projected-empty read ONLY from `v_inventory_math` (never recomputed); add-stock branches
    the 3-way type union (reconstituted / preconcentrated / oral_solid; refill = a NEW row,
    archive = `is_active=false`, never hard-delete). Each card shows a **neutral fullness bar**
    (`remaining_base/total_base`, white on a track — no good/bad colour). **Part-used vials**
    (`supabase/protocol/002_inventory_partial_fill.sql`): a vial need not start full — the
    AddStockSheet's "How much is in it?" control (Full/¾/½/¼ presets or an exact amount-left in
    the vial's own measure) maps the estimate to a stored raw input
    `inventory_items.prior_used_base` (base-unit amount already gone; NULL = full), which
    `v_inventory_math` folds into remaining (`remaining = total − prior_used − consumed`).
    `total_base` stays the TRUE full capacity, so the fullness bar and runway stay honest.
    Stock can also be logged **inline when adding a compound** (`AddCompoundSheet` has an
    optional "Got a vial?" step — this inline path still starts full). Runway is shown **neutrally**, with ONE exception (Adrian, 2026-07-30, Spec 04):
    the Protocol compound card's **fullness BAR turns amber at 7 days or fewer**
    from empty. Stock runway is inventory, not a health value, so the
    categorical-never-evaluative invariant does not apply, and at a week out it
    genuinely needs action. The signal sits on the GAUGE rather than on the
    runs-dry text, which stays white in every state: that keeps one amber beat per
    card and puts the colour on the thing that measures. The cycle carries an optional free-text **description**
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
    **The vial is resolved for the dose's own DAY** by `vialOnDate` (`protocolSync.ts`) — the
    single rule, used by BOTH the write path (`pushProtocolDoseLog`) and the log sheet's read
    (the `resolveVialForDate` server action), so they can't drift. It takes the newest vial whose
    `acquired_on <= dateKey`, active **or since-archived**, with the unit family filtered **in
    the query** (so an incompatible newest vial falls through to an older compatible one rather
    than losing the link). One vial is in use per compound at a time (`addStockItem` archives the
    priors on every add/refill), so "newest acquired by then" *is* the vial that was in use then.
    No vial that far back ⇒ **no link**, rather than a wrong one. This is what keeps back-dating
    honest — a dose logged for last Tuesday can't draw down a vial opened on Friday — and it
    leaves live logging unchanged (the current vial was always acquired on or before today).
    Compared by DAY, not instant: a dose's time-of-day is a user-editable guess, so an instant
    compare would drop the link on a dose logged for 08:00 today from a vial added at 14:00
    today. The explicit-pick validation checks **ownership + unit family, NOT `is_active`**: a
    back-dated dose legitimately draws from a vial that is archived by now, so filtering on
    `is_active` there would silently drop exactly the link `vialOnDate` just resolved (RLS + the
    `dose_logs` unit-family trigger stay the backstop). See **Back-dating** below.
  - **`DoseLog.inventoryItemId` has THREE meaningful states**, and the device store preserves all
    three: a **string** = an explicit pick; **`null`** = an explicit "Not tracked" (log it, don't
    touch stock); **absent/`undefined`** = *undecided* → the server resolves the vial for the
    dose's date. `JSON.stringify` drops an undefined value, so the **key's absence** is what
    carries "undecided" across a reload — `loadDoseLogs` must therefore preserve the key's
    absence rather than normalise it to `null`. Flattening it conflated "undecided" with
    "explicitly don't count this", so re-opening such a dose read as *Not tracked* and **unlinked
    its vial on update**. (The Postgres pull can only ever return string-or-null — Postgres has no
    third state — which is correct: a pulled row either has a link or genuinely has none.)
  - **Scope:** catalogue compounds are canonical in Postgres. **Custom "Make your own"
    compounds** keep their STACK membership device-local (jsonb mirror, merged on Home),
    but now ALSO get a `protocol_compounds` row on demand (compound_id NULL +
    `custom_name`/`custom_category`, `supabase/protocol/004`) so they can carry **vials +
    stock runway** — pulled into beta scope (2026-06-24). `pushProtocolCompound` creates the
    custom row (id = `resolvePcId(client id)`, which equals the local id since `newId()` is
    always a uuid, so Postgres + local stay joined and dose logs decrement the right vial);
    `listStock` coalesces `custom_name`; both the inline "Got a vial?" step and the Stock
    tab's `AddStockSheet` already drive customs. The Postgres stack PULL still SKIPS custom
    rows (compound_id NULL), so customs render once (device-local), never doubled. The Step 5
    Stock view reads `v_inventory_math` (runway), and logging a dose against a vial
    decrements it. (The `lib/sync/{cache,syncEngine}.ts` outbox
    scaffold + the `/preview/db-sync` and `/preview/protocol-test` harnesses were
    **removed (2026-06-18)** once the cutover settled — the live path is
    `lib/home/protocolSync.ts` + `migrateDeviceState.ts`.)
  - **Offline-first** is preserved: reads come from the cache; writes are optimistic to
    the cache and dual-written to Postgres, with a reconnect/focus re-sync that re-pushes
    anything written offline (idempotent). A failed/empty pull never wipes the cache.
    **Offline _state changes_ (delete / re-add) win over a stale Postgres pull**
    (`hydrateProtocol.ts` reconciles the local `archived` flag and converges Postgres) —
    so an archive done offline is no longer resurrected on reconnect. A robust offline
    outbox (covering offline dose un-logging + multi-device conflicts) is post-beta work.

- The **quick-actions menu** (A10) lives on a **floating action button** pinned
  bottom-right above the nav (`components/shortcuts/QuickActionsFab.tsx`, Spec 20),
  rendered once by the `(app)` shell so it tracks the bottom nav exactly. One flat
  three-column grid of six equal tiles (`QUICK_ACTIONS` in `shortcutItems.ts`) — it
  **no longer carries the "Beta notes & feedback" row** (Adrian, 2026-07-31 — the
  beta is ending, so a beta-only affordance stops being a permanent fixture of the
  primary action menu). `FeedbackRow` and the FAB's `FeedbackSheet` mount are
  deleted; feedback itself is untouched and still reachable from Profile via
  `ProfileFeedbackRow` → the same `FeedbackSheet` → the same `beta_feedback`
  table. It
  persists nothing (the earlier reorderable card order + `lib/shortcutOrder.ts`, and
  later the primary-row / six-tile / feedback-row split of `ShortcutsMenu`, were all
  removed as the menu was reworked). It carries **no calculator action**: the
  reconstitution calculator holds the centre bottom-nav slot and `/calculator` is its
  entry point (Spec 20 → D4/D6), so a tile would only duplicate it.

## Blocks (new scope, not one of the eighteen specs — 2026-07-30)

**A block is a NAMED STRETCH OF TRAINING with a start and an end.** A prep, an
off-season, a cut. It is not a new kind of data: every screen of it is a query
over dated things Trackd already stores, which is what makes it cheap to build
and impossible for a competitor to copy without having held the data for sixteen
weeks.

The naming was Adrian's call and it changed the feature rather than renaming it.
A GOAL is a target you hit or miss; a BLOCK is a period you ran. That makes the
**retrospective the centre** and the progress figure a secondary reading.

- **Storage** — `supabase/blocks/001_blocks.sql`: `blocks` (name, `started_on`,
  nullable `ends_on`, status, `closed_on`, `reflection`) and `block_targets` (a
  LIST, because any tracked variable should be targetable and one nullable
  column per variable does not scale), bringing the live DB to **27 tables**.
  **APPLIED by Adrian, 2026-07-30.** Postgres is the source of truth with **no
  device mirror**: a block is a RECORD, there is no offline capture path for one,
  and losing a sixteen-week prep to a PWA reinstall would be the worst possible
  bug in a feature whose whole point is looking back. Ownership is structural
  (composite FK per 008/009) and **one live block per user** is a partial unique
  index rather than a trigger, so it cannot be raced.
- **Targets cover weight and consistency, and NEVER bloodwork** (Adrian: "I'm not
  doing targets for blood work. No way."). A target turns a reading into a pass
  or a fail, and a biomarker is exactly the reading the
  categorical-never-evaluative invariant protects. Both permitted variables are
  facts about the user's own behaviour instead. The CHECK constraint enforces it
  at the database, not just in TypeScript.
- **Time is the primary measure; a target is a SECOND, separate figure.**
  MacroFactor can show a percentage because its goals are numeric; "prepping for
  a comp" has no number to divide. Time always exists, so it leads, and the two
  are never blended into one number because a combined "68% complete" would be
  inventing a fact. `lib/blocks/block.ts` is pure and tested.
- **One window rule** — `blockWindow(block, todayKey)` (`lib/blocks/block.ts`) is
  the single definition of which days belong to a block, so no two sections of
  the retrospective can disagree. A finished block ends on the day it was
  **CLOSED**, not the day it was planned to end (a prep cut short covers the days
  it actually ran); a live block ends **today**, because `endsOn` is an intention
  and a block in week two must not read as though it had already spanned fifteen.
  The earlier `isWithinBlock` was removed rather than left beside it: it had no
  production caller and would have been a second, subtly different rule.
- **The retrospective is a set of queries** (`lib/blocks/retrospective.ts`, pure +
  tested): duration, weight (start / end / delta / graph clipped to the window),
  first and last photo SESSION side by side, what was run with dose counts,
  bloods, consistency, journal count + the markers noted most often, and the
  user's own note. Nothing is stored and nothing is cached — per the
  no-stored-derived-values invariant, which is also what keeps the figures true
  when a user back-dates a dose months later.
  - **"What you ran" reuses `compoundsRunningOn`**, so a compound taken every
    third day counts for the whole block rather than a third of it. A compound
    with logged doses that never resolves as running is included anyway: a legacy
    record should not erase a dose the user can see they took.
  - **Consistency is the existing series, CLIPPED, never recomputed**, so Progress
    and the retrospective cannot report different numbers for the same days.
  - The dosing model is still device-local, so `what you ran` and consistency
    resolve **client-side** from `lib/home/stack.ts` + `doseLog.ts`, exactly as
    Progress's own consistency and running list do. Everything else is
    server-fetched from Postgres.
- **On the end date, ASK — never auto-close.** An auto-close would silently
  decide the block finished on schedule and, more importantly, you would never
  get the reflection, which is the one thing in the retrospective the data cannot
  produce. A **dot on the Progress banner** opens **Extend / Close / Leave
  running**; Extend lets the user pick the new date. "Leave running" is
  remembered per block on the device
  (`trackd.blocks.endPromptDismissed.v1.<uid>`) so a supported answer is not
  turned into a nag, and is **cleared on extend** because a new end date is a new
  question. The component owns the dot's visibility and storage only remembers
  it — reading storage back to learn what was just tapped is the regression spec
  07 shipped briefly.
- **`/blocks` is a real route**, following `/weight`: a retrospective is long
  enough to want a page it can scroll rather than a sheet's height to fight.
  Which block is open lives in the URL (`?block=<id>`) so the phone's back button
  walks back to the list. Dev-only harness at `/preview/blocks`
  (`?state=ended|empty|past`, `&block=<id>`).
- **Nothing here judges.** No "on track", no "behind", no projection, no colour
  that means good or bad, and no verdict on whether a target was met. A delta of
  minus four kilograms with no comment attached is the shape everything takes.

## Profile, and the end of Settings (Spec 09, wave 2 part two — 2026-07-30)

**There is no Settings route.** `app/(app)/settings/` — its page, its
`updateSettings` action and `components/settings/settings-form.tsx` — is deleted,
and everything it held moved onto Profile. Sending someone to a second screen to
change their height was the thing spec 09 set out to stop.

- **Physical details are edited IN PLACE** (`components/profile/PhysicalCard.tsx`).
  The card has two states and ONE layout: read is dimmed and inert, Edit fades
  the same rows into inputs where they already sit. No layout swap and no
  navigation, which is the spec's wording and the whole point. The Edit control
  sits on the section header, not inside the card. Saving returns it to the
  dimmed read state.
  - **Sex, Height, Goal and Units are editable. Age and Weight are not**, in
    either state. Age is derived from the date of birth the 18+ gate captured;
    Weight is the latest `weight_logs` reading, which the Weight view owns
    (`profiles.weight_kg` is a legacy onboarding snapshot). A second place to
    type a bodyweight would be a second source of truth for the one number the
    app is most careful about. Both still render as rows: a gap where a fact
    should be is worse than a fact you cannot edit here.
  - **The sex CONFIRM from Spec 19 stays.** Spec 09 says "no warning, no
    confirmation" about the MARKER filtering — do not add a second prompt for
    that — and spec 04 recorded this one as untouched. It exists because sex
    changes what the app DRAWS (the injection-site body map switches figure).
    Flagged for Adrian rather than silently removed.
  - `updatePhysical` (`app/(app)/profile/actions.ts`) is the old
    `updateSettings` with its validation unchanged, minus the redirect to the
    dashboard: the card is edited in place, so the user stays put. It
    revalidates `/profile`, `/progress` (sex drives the marker dialer, Spec 04)
    and `/dashboard` (the body map).
- **Notifications moved to its own top-level route, `/notifications`.** A child
  route of a removed parent would have kept the word alive in the URL bar. The
  `revalidatePath("/settings")` calls in `lib/push/pushActions.ts` and
  `lib/notifications/prefsActions.ts` were repointed with it.
  `components/settings/` still holds `NotificationsToggle` and
  `ReminderSettings`; the FOLDER name is stale but renaming it moves working
  files for a word nobody sees.
- **The App card is one row treatment throughout**: Billing, Notifications,
  Terms, Privacy, Medical Disclaimer, Send feedback, then Install (which
  self-hides). Notifications is no longer a visually heavier card than the legal
  links beside it. **Billing states the plan and goes nowhere** — it is not
  greyed out, because it reads as information, which is what it is. When
  RevenueCat lands it gains a destination and nothing else changes.
- **The danger zone is bounded and OUTLINED, not filled** — a red section label
  and a `border-accent-destructive/40` card holding Sign out, Clear all
  compounds and Delete my account, each keeping its existing portaled
  confirmation. Outlined so it reads as a place you enter deliberately rather
  than an alarm. The three components gained a `variant="row"` sharing the
  `DANGER_ROW` preset (`ui-context.md`) rather than three copies of a
  destructive treatment, which is how one of them quietly stops matching.
- **The avatar is 112px and is the whole control.** The "Change photo" and
  "Remove" text links are gone. With no photo a tap opens the file picker
  directly; with one it opens a two-choice sheet, because "removing a photo
  moves inside that flow" and there is nowhere else left for Remove to live.
  Judgement call, flagged. Framing still routes through `PhotoAdjustSheet` at
  `AVATAR_ASPECT` (1:1).
- `ProfileScreen` is presentational and the page is the data wrapper, so the
  dev-only `/preview/profile` (`?state=bare` for a fresh signup) renders the
  whole screen unauthed. Writes fail there by design — every one of them
  resolves identity from a verified session.

## Stacks (Spec 05, wave 2 part two — 2026-07-29)

**A stack is a DISPLAY GROUPING, never a container.** Every member keeps its own
schedule, dose, `dose_logs` and history; removing a compound from a stack changes
nothing about that compound. That is structural rather than a convention: a
`Stack` is `{ id, name, colour, memberIds }` and has nowhere to put a dose, a
schedule, a time or a log, and **`protocol_compounds` gains no column**. A
`stack_id` there would enforce one-stack-per-compound just as well and query
faster, but it would put a stack-owned field on the member — the one thing the
spec forbids.

A stack means compounds **injected at the same time**, not compounds combined
into one substance. Blends (several peptides genuinely sharing a vial) already
exist as single catalogue compounds and are untouched.

- **Storage** — `supabase/protocol/007_stacks.sql`: `stacks` (name + one of the
  twelve palette NAMES) and `stack_members` (the pairing + an order), bringing the
  live DB to **25 tables**. Mirrored into `trackd.stacks.v2.<auth.uid()>` as the
  synchronous offline read path, the same shape as the rest of the protocol data.
  `lib/home/stackSync.ts` pushes/pulls; `hydrateProtocol.ts` `hydrateStacks` folds
  the pull in.
- **A grouping is DATED** (`supabase/protocol/013_stack_dating.sql`). 007 gave a
  stack no time dimension at all, and the dashboard applies the grouping to
  whichever day is on screen — so a stack created this morning was drawn over
  every day already lived (a "Vitamins" stack appeared on days when only creatine
  existed), and adding a member re-grouped every day before it joined. 013 adds
  `stacks.effective_from` (backfilled from `created_at::date`) and
  `stack_members.effective_from` / `effective_to` (EXCLUSIVE; NULL = still a
  member), so a stack describes the days it actually covered. This is Spec 01's
  rule — *a change applies from the chosen day forward and never rewrites the
  past* — applied to the one part of the protocol that was missing it, and it is
  the same shape as `protocol_compound_schedules`. Client-side: `Stack.effectiveFrom`
  + `Stack.members[]` spans, read through `memberIdsOn(stack, day)` for a dated view
  and `currentMemberIds(stack)` for the present tense.
- **One compound, one stack** is enforced three ways: `setStackMembers` strips an
  incoming id from every other stack in the same pass, `dedupeMembership` runs on
  both read and write, and a UNIQUE index backs it in Postgres. Since 013 that
  index is **partial** (`WHERE effective_to IS NULL`) — the rule is about the
  PRESENT, and a closed span must not hold the slot or a compound could never be
  moved between stacks. `membersOn` de-duplicates on read as the last line of
  defence, because overlapping spans are not structurally impossible (a device
  clock that moves backwards, or two client ids that later resolve to one row).
- **Hydration is DEVICE-AUTHORITATIVE** (`hydrateStacks` → `mergeStack`). The
  server contributes exactly two things: the real start date when the device's is
  only a v1-migration guess (`Stack.provisionalStart` /
  `StackMembership.provisionalFrom`, cleared by `adoptStart` once corrected), and
  any membership the device has never heard of. It used to be the reverse — a
  fully-resolving pull replaced the local stack outright — which silently
  reverted every stack edit made offline (nothing re-pushes stacks on reconnect),
  deleted any member the push could not send, and overwrote real join dates with
  013's backfill. Resolvability is no longer a gate: a pulled stack is kept even
  when its members don't resolve, because this list is what the next push mirrors
  back up and dropping it would delete the stack from Postgres.
- **The client tolerates a database without 013** (`isUndefinedColumn`, the same
  helper `protocolSync.ts` uses for the 006 cycle columns). Migrations here are
  applied by hand, so the un-migrated state is one the deployed code sits in:
  reads retry without the dating columns and mark the result provisional; writes
  retry with the columns stripped and send OPEN spans only, since the pre-013 key
  is `(stack_id, protocol_compound_id)` and closed spans would collide. All of it
  becomes dead once 013 has run everywhere.
- **A stack that empties is retired, not erased.** Deleting its last member closes
  the span and leaves the stack in the store, so the days it grouped still read
  correctly; `activeStacks()` keeps it off every present-tense screen so there is
  no empty card. Deleting the STACK itself is still a hard delete — an explicit
  "this grouping should not exist", as against the forward-dated change a member
  leaving is.
- **Ownership is structural** (`supabase/protocol/008_stack_members_ownership.sql`).
  007 shipped a hole: `stack_members` RLS checked only `user_id`, and the
  one-stack index was GLOBAL across users — so a user could claim another user's
  `protocol_compound_id`, taking their slot and breaking that user's membership
  sync permanently with no repair path. 008 replaces the single-column FKs with
  **composite** ones carrying the owner (`(stack_id, user_id) → stacks(id,
  user_id)` and the same for `protocol_compounds`) and scopes the unique index to
  `(user_id, protocol_compound_id)`. A policy can be reasoned around; a foreign
  key cannot.
- **The dashboard renders a PARTITION**, not two filters — `partitionByStack`
  claims member ids into a `Set` and returns the remainder, so a member can
  neither appear in both its stack row and its category section nor vanish from
  both. A stack shows only the members due THAT day, so mixed cadences work
  without special-casing: four members on Monday, three on Tuesday.
- **Logging is dashboard-only** (never Protocol). One tap logs every UNLOGGED
  member, each writing its own `dose_logs` row to the SELECTED day with the
  wall-clock time. There is deliberately **no bulk untick** — each log carries its
  own edited amount, time and site, and one mis-tap would destroy all of it.
  `siteId` is null on a bulk tick: a stack tick has no body map, and inventing a
  site would corrupt the injection-site recency view.
- **Membership syncs as `protocol_compounds.id`**, which can diverge from the
  client `StackCompound.id`, so `resolveProtocolCompoundIds` resolves by derived
  id then by NAME (one read, matched in memory). Hydration judges membership
  against the **merged local stack**, not the Postgres pull — the pull skips rows
  with a NULL `compound_id`, which is every CUSTOM compound, so judging against it
  silently dropped customs from stacks.

## Dose & Schedule Integrity (Spec 01, wave 2 — 2026-07-23)

**A schedule is a rule; a logged dose is an event. Editing intent never mutates
history.** The model already split them; what was missing was that the *rendering*
and the *deletion path* didn't honour the split.

- **Deletion is resolved and verified, not derived.** THE GHOST-COMPOUND ROOT
  CAUSE: `protocol_compounds.id` can legitimately diverge from the local
  `StackCompound.id` (`pushProtocolCompound` REUSES an existing row's id for a
  `(cycle, compound)` that already exists). Archive and delete derived the Postgres
  id from the client id, so once diverged they targeted a row that doesn't exist —
  and a PostgREST `UPDATE`/`DELETE` matching **zero rows returns no error**, so both
  reported success. Postgres kept the compound `is_active = true`, the next
  hydration pulled it back, and because the merge joined on **id only** it couldn't
  match the local "archived" record either — so the local intent was dropped by the
  name de-dupe and the compound returned, **active, with its dose logs**. Fixed in
  four places: `findProtocolCompoundId` (`protocolSync.ts`) RESOLVES the row by id
  then by **name**; delete re-reads the row to confirm it's gone and reports a
  zero-row delete as a FAILURE (so `trackSync` surfaces it); the hydration merge
  matches local↔Postgres by **name as well as id**, keeping the user's intent and
  recording the id change; and device dose logs are **re-keyed** through that id
  change so history follows the compound instead of orphaning.
- **Hydration waits for destructive writes.** The pull overwrites the local cache
  and fires on mount/focus/visibility/reconnect, so a pull overlapping an in-flight
  delete read the compound as still present, wrote it back, and the merge's flush
  re-pushed it — a self-resurrecting compound, most likely exactly when you close
  the app after deleting. `trackCriticalSync` / `awaitCriticalSyncs`
  (`lib/home/syncStatus.ts`) order the pull after any pending delete/archive. Adds
  are deliberately NOT tracked — an overlapping add is already handled by the
  offline-add path.
- **A logged dose carries its own unit and time.** `DoseLog.unit` is stamped at log
  time (`dose_logs.dose_unit` was already per-log in the schema, so no migration),
  and the row renders `log.unit`/`log.time24` rather than the compound's current
  ones. Previously an mg→mcg switch kept the figure and restated every past dose as
  mcg — a thousandfold change in meaning applied retroactively.
- **Next Dose reads the real stack.** `computeNextDose` (`lib/home/nextDose.ts`,
  extracted from `HomeScreen` so it is testable) resolves the soonest **unlogged**
  dose for the **selected** day, skipping archived compounds, re-derived every
  render. It was being handed `seedStack` — the empty first-run fixture — so it
  returned null for every user forever and the card showed a dash while doses were
  due. The countdown no longer rolls a passed time to tomorrow (that hid overdue
  doses); it reads `0h 0m`.
- **A schedule is VERSIONED, not overwritten.** An edit used to mutate the single
  schedule row in place, so past *due-sets* (week-strip dots, calendar cells)
  re-derived from the new rule — a Tuesday you correctly rested became "missed"
  because of a decision made in August. A compound now carries
  `scheduleHistory: ScheduleVersion[]`, each version effective from a day, and
  `resolveScheduleOn(compound, dateKey)` answers what the rule ACTUALLY was then.
  `isDueOnFor(compound, date)` is the past-date form of `isDueOn` and every
  retrospective caller uses it (week strip, calendar cells, consistency, Next Dose).
  Forward-looking callers (`upcomingDoseDates`) keep reading the current rule —
  that is what "upcoming" means.
  - **The first edit seeds a baseline** from the OUTGOING values, effective from the
    compound's start date. Without it the days before the change have no recorded
    rule and fall through to the new one, which is the exact rewrite being fixed.
  - **No backfill, ever.** Raising a dose schedules no catch-up for earlier days.
  - **Empty history ⇒ current values.** A compound never edited behaves exactly as
    before versioning existed, so the feature costs nothing until it's used.
  - **Storage:** `supabase/protocol/005_protocol_compound_schedules.sql` — one row
    per (compound, effective_from), mirroring the `protocol_compounds` dose/schedule
    columns 1:1 so no translation layer can drift. Strictly additive, no backfill,
    cascades from `protocol_compounds`, own RLS + grants. **APPLIED 2026-07-29.**
    The sync calls still treat `42P01` as `skipped`, which is now only a safety net
    for an environment where the table is missing rather than the normal path.
    Hydration UNIONS the pulled versions over the device's, Postgres winning any day
    it knows about — a pull that returns nothing must never wipe the local trail.
- **Tests:** `lib/home/doseIntegrity.test.ts` (Vitest, `npm test`) pins each
  reproduction. `vitest.config.ts` scopes the suite to `lib/**` — pure by house
  rule, so it needs no DOM, renderer or Supabase.

## Compound Lifecycle (Spec 02, wave 2 — 2026-07-29)

**A compound has TWO states: active or deleted.** The third state (archived, with
its own page and a Reactivate arrow) and the fourth (permanently erased) are gone.
There is one verb, **Delete** — it ends the schedule and keeps every logged dose —
and bringing a compound back is the same action as adding any other: find it in the
picker and press the plus.

- **Storage is unchanged.** "Deleted" *is* the existing `StackCompound.archived` /
  `protocol_compounds.is_active = false` flag, so nothing migrated and no logged
  dose moved. Only the UI around it collapsed.
- **Re-adding reuses the record.** The picker passes the deleted record's id to
  `AddCompoundSheet` as **`reuseId`**; the form is a first-time add in every visible
  respect (nothing pre-filled, dose/schedule/start set fresh) but saves onto that id.
  A second record would collide with `UNIQUE (cycle_id, compound_id)` and with the
  hydration name de-dupe, so one identity is also the only implementable option —
  and it is what keeps the compound's logged history attached instead of orphaned.
- **The gap is RECORDED, not inferred (2026-07-29).** Deleting writes a
  `stopped: true` schedule version effective from the day of the delete
  (`recordScheduleStop`), and the re-add writes a normal version from its new start
  date. `isDueOnFor` returns false for any day resolving to a stopped version, so
  the deleted stretch is neither due nor missed. Two bugs made this necessary and
  they only show up together:
  - `resolveScheduleOn` handed every historical version the compound's **current**
    `startDate`, and `isDueOn` hard-gates on it — so a re-add moving the start
    forward dropped the whole original run out of "due", quietly removing a
    completed run from consistency. It now anchors on the **earliest version's**
    `effectiveFrom`, which `recordScheduleVersion` seeds from the original start.
    That fixes the gate *and* preserves cadence phase (every-N-day maths anchors on
    the same date), so neither shifts under a re-add.
  - Fixing that alone would then make the deleted gap resolve against the
    pre-delete rule, i.e. a break the user chose to take would read back as a run
    of missed doses. Hence the stop marker.
  - **Costs nothing when unused:** a compound never deleted has no history and
    resolves exactly as before. Storage is `protocol_compound_schedules.stopped`,
    added to migration 005 before it was ever run, rather than stacked as a second
    one (applied 2026-07-29).
- **Nothing in the app hard-deletes a compound.** `removeFromStack`,
  `removeCompoundLogs`, `deleteProtocolCompoundForStack`, `deleteProtocolCompound`
  and `deleteStackCompound`/`deleteCompoundLogs` are **deleted, not just unwired** —
  Invariant 8 is now structural rather than a convention. The DB cascade remains for
  account deletion only. (`StartFreshSection`'s "Clear all compounds & stock" was
  a separate whole-account reset via `wipeMyProtocol`. BOTH ARE GONE: spec 09
  removed the control from the danger zone, which left `lib/db/resetProtocol.ts`
  a caller-less `"use server"` module that could still delete five tables. The
  pre-merge review deleted it, 2026-07-31 — an unreachable server action that
  destroys data is a liability, not a spare part.)
- **Removed:** the `/archive` route + page, `ArchiveManager`, the Profile → Archive
  row, the Reactivate control in the picker and in `CompoundDetailSheet`, the
  `reactivate` mode in `AddCompoundSheet`, and the dev-only `/preview/archive-weight`
  + `/preview/profile` harnesses (both existed to demo the retired flow).
- **The delete confirmation is red, not amber** — a `--accent-destructive` outline
  card with a solid `--accent-destructive` confirm, matching the Sign out treatment.
  Amber is the app's accent and reads as emphasis, not danger. This is destructive
  **confirmation only**; red is not a general accent and `ui-context.md` already
  scopes `--accent-destructive` to deliberate destructive actions.

## Add Compound Flow (Spec 03, wave 2 — 2026-07-29)

The picker is **"Add compound"**; the form it opens is still **"Add to log"**. The
word **"stack" is reserved for the future Stacks feature** and is gone from every
user-facing string (Adrian's call: rename the visible copy only — the internals
`lib/home/stack.ts` / `StackCompound` / `user_stack_compounds` / the
`trackd.stack.v2` key keep their names, since renaming a live table for a word
nobody sees buys nothing).

- **Picker structure** (`components/navigation/add-to-stack-menu.tsx`, filename
  unchanged): search → **Recently used** → **Your compounds** (customs) → **Browse
  by category** → **Make your own**. The flat "Popular in comp prep" list is gone.
  - **Recently used** — `lib/home/recentCompounds.ts`, device-local, lowercased
    names newest-first, capped at `RECENT_LIMIT` (**5**). Recorded on a successful
    add; seeded once from the device stack so a long-standing user isn't shown an
    empty row. **Omitted entirely** when there is no history — never an empty state.
  - **Browse by category** — one collapsible group per **existing** category, in
    `CATEGORY_META` order (all eight: Anabolics, Orals, SARMs, Peptides,
    Ancillaries, Thyroid, Supplements, Stimulants). Nothing is reclassified and the
    per-category icon/colour is untouched. Collapsed by default because 205
    compounds do not browse flat on a phone.
  - **Room for stacks:** the sections are a flat composition below the search field,
    so a Compounds / Stacks segmented control drops in above them later without
    rebuilding anything.
- **Stock is vials only on this form.** `canStock` now gates on the selected
  route's **inventory form** (`reconstituted` / `preconcentrated`), never on
  category — so Creatine, Berberine and any future oral compound in any category
  are never asked "how much is left in the vial?". The `oral_solid` branch was
  removed from **this form only**; **tabs/caps stock still exists in full** in
  Protocol → Stock (`AddStockSheet`, `INVENTORY_TYPE_OPTIONS`, `inventory_items`,
  `v_inventory_math.units_per_dose_oral`).
- **Per-compound unit defaults already existed** — `compounds.csv` carries
  `default_unit` per compound and the form reads it (BPC-157 opens in mcg,
  anabolics in mg). Adrian's call (2026-07-29): **leave the catalogue data alone
  for now** rather than forcing all peptides to mcg, which would render Tirzepatide
  as `2400 mcg`. What is new is the **override memory**: `lib/home/unitPrefs.ts`
  remembers the unit the user picks per compound (device-local, keyed by lowercased
  name) and pre-selects it next time. An EDIT always shows the unit the record is
  stored in — a preference never restates existing data — and a remembered unit
  outside the compound's unit family is ignored.

**Dose time — Spec 01's "no pre-fill" was REVERTED (Adrian, 2026-07-29).** The log
form again live-tracks the clock on today and falls back to the compound's
scheduled time when back-dating; the add form again live-tracks the clock; and a
time is **no longer required** at either entry point. Clearing the field still
stores an unset time, which `formatTimeLabel` renders as "Not set", so the
first-class-unset-time work from Spec 01 stays — only the pre-fill and the
required-field guard came back.

## Sex-Specific Markers (Spec 04, wave 2 — 2026-07-29)

Five of the 36 catalogue markers only apply to one sex, so the picker now offers
**shared + the profile's own sex**. The rule that shapes the implementation:
**filtering governs what can be logged GOING FORWARD and must never hide, alter or
delete anything already logged.**

- **`lib/progress/markerApplicability.ts`** — the split, keyed by catalogue NAME
  (the one identifier the CSV, the DB row and the app agree on; `markers.id` is a
  per-environment uuid). Only the exceptions are listed — male: Erection Quality,
  Gyno Symptoms; female: Clitoral Enlargement, Voice Deepening, Menstrual Changes —
  so everything else, including every custom marker, is shared by default and the
  catalogue can grow without touching this file. Hair Shedding, Facial / Body Hair
  and Hot Flushes stay **deliberately shared**: both sexes track them for opposite
  reasons.
- **Sex comes from `profiles.sex`**, read on the Progress page's existing profile
  query — the same column the body map uses, not a second source. It is read
  **raw**, NOT through `bodySexFor`, whose male fallback is correct for drawing a
  body and wrong for deciding what to offer: **a profile with no sex set sees shared
  markers only** and is never guessed at.
- **`addable: false`, not omission — this is the load-bearing detail.** The dialer
  resolves an entry's *existing* readings by id **from the same options list it
  offers from** (`byId` in `MarkerDialer`), so dropping a non-applicable marker
  would blank a logged reading for anyone who changed their profile sex. Instead the
  option is kept and marked un-addable: every add path (Common / More / search)
  already filters on `addable`, so the marker is genuinely **absent** — never greyed
  out, never listed as unavailable — while an entry that already uses it still
  renders. This is the same mechanic a soft-removed custom marker uses (Spec 22 · 1).
- **History is filtered nowhere.** `markersByEntry` (Progress) and the Calendar's
  own catalogue read resolve `marker_readings` → `user_markers` independently of the
  offer list, so a sex change cannot touch a logged entry on any surface — feed,
  day, calendar day sheet, or chart.
- **"Cycle Changes" → "Menstrual Changes"** (Adrian's call), because "cycle" already
  means a compound run. **No data migration**: readings reach their marker by id, so
  every logged entry follows the row and simply renders under the new label. The
  rename is DB-side — `supabase/markers/001_rename_cycle_changes.sql` (idempotent,
  service-role, guarded against the `name` UNIQUE) plus the updated
  `supabase/seed/markers.csv` so a re-seed agrees. **APPLIED 2026-07-29.** The
  applicability map still lists both names, which costs nothing and keeps any
  environment seeded before the rename correct.
- **No prompt was added** to the sex change, per the spec. Note the Settings sex
  field already has a confirm step (from Spec 19, about the body map) — it is
  untouched and now describes only part of what changes.
- **Tests:** `lib/progress/markerApplicability.test.ts` (9 tests) pins the full
  36-marker split, the three shared judgement calls, the no-sex-set case and the
  pre/post-rename equivalence.

## Photo Adjust (Spec 05, wave 2 — 2026-07-29)

Every photo in the app is framed before it is saved: zoom and reposition inside a
**fixed** frame, so successive progress shots line up instead of relying on
perfect in-camera framing. Zoom + pan only — no rotation, no filters, no free crop.

- **One implementation, five surfaces.** `components/media/PhotoAdjustSheet.tsx`
  takes an image and a target ratio; each surface passes its own. The ratios are
  declared together in `lib/media/framing.ts` so a surface and the card it later
  renders in cannot drift apart:

  | Surface | File | Ratio |
  | --- | --- | --- |
  | Progress photos (every pose) | `AddProgressPhotoSheet` | `PROGRESS_PHOTO_ASPECT` 3:4 |
  | Weight sheet photos | `AddWeightSheet` | 3:4 — same `progress_photos` store |
  | Profile picture | `AvatarUploader` | `AVATAR_ASPECT` 1:1 (renders as a circle) |
  | Bloodwork | `AttachBloodworkSheet` | `DOCUMENT_ASPECT` 3:4 |
  | Journal photos | `JournalEntrySheet` | `DOCUMENT_ASPECT` 3:4 |

  The **weight sheet** and **journal** surfaces were not in the spec's list; both
  accept photos and the weight sheet writes to the *same* `progress_photos` store,
  so a shot added from Home would otherwise not line up with one added from
  Progress. Adrian's call (2026-07-29) was to apply it to all five including the
  two document surfaces, over a raised concern that a fixed frame can crop
  information off a lab report.
- **The maths is pure and tested** (`lib/media/framing.ts`, 22 tests). Zoom is a
  multiplier over "just covers the frame" and is clamped to `[1, MAX_SCALE]`, and
  offsets are clamped to the point where an edge would enter the frame — so
  **letterboxing is unreachable rather than merely discouraged**. `cropRect`
  converts a framing into the source rectangle to draw, and the tests pin that it
  always stays inside the image and matches the frame's aspect.
- **Clamping is DERIVED on render, not stored.** A framing restored from an
  earlier session was legal against *that* frame size, and the frame depends on the
  viewport — so clamping in an effect would leave one paint where the image
  doesn't cover. `scaleAbout` keeps the pinch midpoint still, so the subject stays
  under the fingers instead of sliding out.
- **Storage is ADJUSTED-ONLY** (Adrian's call). The original is held in memory for
  the session so re-opening a filled slot re-frames the *full* photo rather than a
  crop of a crop, and the framing rides alongside so it resumes where it left off —
  but only the adjusted image is ever uploaded. Re-adjustment therefore applies
  within a session, not to a photo saved in an earlier one.
- **It degrades rather than blocks.** If the browser can't decode the file (HEIC
  outside Safari is the real case), the sheet says so and Confirm passes the
  ORIGINAL through untouched. The same fallback covers any canvas failure — the
  photo matters more than the framing.
- **Guides:** a faint rule-of-thirds grid (hairlines at 25% on `--accent-primary`),
  Adrian's pick over a centre line or horizon. Purely visual; never captured.

## Admin Dashboard (Spec 06, wave 2 — 2026-07-29)

`/admin` was a waitlist view; it is now an operational view of the running app.
Order: **Users → Signups over time (by-channel beneath) → Usage → Feedback queue →
Email list**. Title is "Admin".

- **Access was ALREADY enforced server-side** — the audit's finding, not a fix.
  `app/admin/page.tsx` is a Server Component that calls the verified `getUser()`
  and returns a blocked view **before any query runs**, so a non-founder's request
  never fetches and nothing reaches the client bundle. Underneath it, RLS gates the
  data independently: `waitlist` SELECT is founder-only
  (`supabase/waitlist/002_founder_read.sql`), `v_waitlist_by_source` is
  `security_invoker` so it inherits that, and `beta_feedback` SELECT is
  "own OR founder". Remove the page check entirely and a non-founder still reads
  **zero rows**.
- **Cross-user aggregates run as the SERVICE ROLE** (`lib/db/adminMetrics.ts`,
  `"use server"`). Every user table is RLS'd to own-rows, so a founder's own client
  can see exactly one user's data — correct, and precisely why these counts can't
  be read normally. The alternative, granting founders SELECT on `dose_logs` /
  `weight_logs` / …, would hand two accounts permanent read access to every user's
  health data to render five numbers. **The rule that keeps the service role safe:
  nothing in that file may RETURN a row.** It returns counts and dates only; where
  a distinct-user count needs ids, they're counted into a `Set` and discarded
  inside the function. No message, dose, weight, marker, photo or journal text is
  ever selected. `getAdminMetrics` **re-checks the caller is a founder against the
  session**, because a `"use server"` export is independently reachable and must
  not trust the page's gate.
- **"Active" = wrote something** that period — a dose, weight, journal entry, photo
  or compound (Adrian's call, 2026-07-29). The app has no session tracking, so
  "opened the app" isn't answerable without a write on every page load. The
  definition is **stated on the page** so the number is read the same way every
  time, and it deliberately understates a user who only looked.
- **Small-number discipline** (we have very few users): no percentage changes, no
  trend arrows, no divide-by-zero. Every section has a zero state, and the signups
  bar chart guards its own scale (`peak > 0`) with a 2% floor so a zero day still
  draws a hairline rather than vanishing.
- **⚠️ Scale flag:** `activeUsers` and `usersWithActiveCompound` read one `user_id`
  per qualifying row and de-duplicate in TS, because PostgREST cannot express
  `count(distinct …)`. Fine at beta size; past roughly ten thousand writes a week
  these should become a SQL view or RPC. Deliberately not pre-optimised — the view
  is trivial to add and no caller changes.
- **The founder list is duplicated in three places** — `lib/admin.ts` plus both SQL
  policies, which hardcode the emails. Adding a founder means editing three files
  across two systems; forgetting the SQL half fails closed, forgetting the TS half
  fails open-ish. Known maintenance hazard, not a hole.
- The feedback queue (open by default, resolved behind a toggle, state changeable)
  already existed and is unchanged — `components/admin/FeedbackList.tsx` with the
  founder-only, column-scoped `resolved_at` UPDATE grant.

## Portrait Lock (Spec 07, wave 2 — 2026-07-29)

The app is portrait-only, locked wherever a lock genuinely exists and **silently
not locked where none does**.

- **`app/manifest.ts` declares `orientation: "portrait"`** — this is the real
  lock, and it already existed. It governs an **installed** PWA on Android and on
  iOS 16.4+.
- **`ServiceWorkerRegistrar` also calls `screen.orientation.lock("portrait")`** —
  the Screen Orientation API, the only lock a browser itself offers. It is a
  guarded best-effort: it rejects unless the page is installed/standalone or
  fullscreen, and **iOS Safari does not implement it at all**.
- **On an uninstalled iPhone the app WILL still rotate**, and that is accepted
  (Adrian's call, 2026-07-29). There is deliberately **no "rotate your phone"
  overlay**: a hard overlay would also trap anyone whose device is locked to
  landscape for accessibility reasons, which Spec 07 explicitly warns against.
  Installing to the home screen is what makes it stick.

## Back-dating (2026-07-17)

Life doesn't happen at the phone: you take a shot on Tuesday night and open the app
on Wednesday. **The day the dashboard is parked on is the day you write to** — not
"today". The selected day is the writable day.

- **The selected day IS the target.** `HomeScreen`'s `selectedKey` (the week strip's
  day, local `useState`, unbounded in both directions) is what `logDose` /`unlogDose`
  already wrote to; the log sheet now receives it as `dateKey` + `todayKey` so
  everything date-dependent agrees with where the dose actually lands. **The
  quick-actions FAB now writes to the selected day too (Spec 01 · wave 2).** It is
  rendered by the `(app)` shell, so it can't receive the strip's day as a prop and
  used to hardcode today — park the strip on Tuesday, log from the FAB, and the dose
  silently landed on today. `HomeScreen` now PUBLISHES its selected day to a tiny
  in-memory store (`lib/home/selectedDay.ts`, the same `useSyncExternalStore` shape as
  the other stores) and `QuickTrackSheet` reads it via `getSelectedDayOrToday`. The
  screen clears it on unmount, so on every other tab the FAB resolves to today —
  which is the correct DEFAULT, not a fallback that overrides a supplied day. **The
  Calendar now logs too (Spec 01 · wave 2):** `DayDetailSheet` lists the compounds
  due-but-unlogged on the open day and hands the compound to the dashboard's own
  `LogDoseSheet` with `dateKey = selectedKey`, so nothing can fall back to "now".
  `CalendarScreen` publishes its selected day to the same store, so the FAB writes
  there as well.
- **No limit, by design.** Nothing clamps how far back a dose or a start date may go.
  `dose_logs.taken_at` has a `now()` *default*, never a temporal CHECK, and RLS carries
  no date predicate — the DB has always accepted this (Invariant 5: don't
  re-implement in TS what the DB enforces, and don't invent a rule it doesn't have).
  The `AddCompoundSheet` year dropdown offers current − 5 … current + 2, a **picker
  bound, not a rule**.
- **Time-of-day pre-fills again (Adrian, 2026-07-29 — Spec 01's removal reverted).**
  The log form live-tracks the clock on today and falls back to the compound's
  `schedule.timeOfDay` when back-dating; the add form live-tracks the clock; and a
  time is **not required** to save at either entry point. Spec 01 had made the field
  start empty and be mandatory, on the reasoning that a guessed time is
  indistinguishable from a fact the user entered — overruled in favour of the faster
  log, with the field editable in place. **An unset time remains a first-class
  state** (clear the field and it saves unset): `Schedule.timeOfDay`
  and `DoseLog.time24` may be `""`, rendered as **"Not set"** by `formatTimeLabel`
  (the single place the app words it) and tested by `hasTime`. In Postgres it is
  stored as `dose_times = ARRAY[NULL]` — the array is non-null (satisfying `NOT NULL`)
  and still length 1 (satisfying the `dose_times_match` CHECK), so **no migration was
  needed** and no invented time is ever written. `dose_logs.taken_at` for an unset
  time falls back to **local noon** (`combineLocalDateTime`), deliberately mid-day so
  the day can't slide across midnight under any timezone offset.
- **A past start date is allowed and confirmed, not blocked.** `AddCompoundSheet`
  previously rejected `startDate < today` (and forced a same-day time later than now).
  Both are gone: you usually add a compound to the app *after* you've started running
  it, and `isDueOn` gates on the start date — a compound that didn't exist on Tuesday
  can have no Tuesday dose. An existing compound's start can also be **moved
  backwards** (edit was always exempt from the check; the year list now reaches back
  far enough to actually do it).
- **Notices, not warnings.** A back-dated log sheet and a past-start add sheet each
  carry a quiet **muted** note naming the date (`border-border-default`
  `bg-bg-surface-raised`, `text-text-muted`, date in mono) — deliberately **not amber**:
  amber is active/interactive state (`ui-context.md`), and back-dating is a supported
  thing to do, not an alarm. It exists so nobody back-fills a week having forgotten
  they scrolled the strip back. The log-sheet note reads **"Logging to {date}" and
  nothing more** — past and future are worded identically (Adrian's call, 2026-07-17).
  Naming the day is the whole job; qualifying it ("not today", "— a future day")
  editorialises about a choice the user just made, and a **future** dose is a dose
  tracked on its date like any other. Future logging is **not blocked** (it never was —
  the strip has always scrolled forward and the tick has always worked).
- **Vials resolve by the dose's date**, so a back-dated dose never retro-links to a
  vial bought since — see the dose→inventory link under the Protocol Cutover above.
  The log sheet resolves it up front (`resolveVialForDate`) so a back-dated log can
  **name the vial it's about to draw down and offer the opt-out**; the "From vial"
  block shows exactly when a vial *will* be linked. `listStock` can't answer this — it
  only knows what's active NOW, and the vial in use on a past day is often archived by
  now — which is why this is its own read rather than a filter over the Stock list.

## Per-Dose Draw (Spec 21 — how much to draw, on the today's-log row)

Each dose row on Home's today's-log shows **how much to draw from the backing vial for
that dose** — `50u (0.5 mL)` — sitting immediately after the time, so nobody re-opens
the reconstitution calculator to work out a number the app already knows. **Nothing is
stored and no new user input exists**: the draw is arithmetic on the user's own dose and
their own vial, computed at read time. It **reports, it does not recommend** (Invariant
4) — no suggested dose, no suggested site.

**No schema surface.** The preflight (live, via MCP) found `v_inventory_math` already
exposing `ml_per_dose` / `units_per_dose` / `units_per_dose_oral`, already
`security_invoker=true` with grants. **No view was added or altered; no migration.**

- **`lib/home/draw.ts` (pure)** — `formatDraw(amount, source)` → `{units, ml}`, a
  `{label}` count for orals, or **null**. **U-100** (units = mL × 100, Design Decision
  4); display rounding is **whole units + mL 2dp** and never feeds back into a stored
  dose. `u` is a syringe **graduation**, never `IU` (a dose-*potency* measure) — D3;
  conflating them would build a dosing error into the row.
- **`resolveDrawSources` (`lib/home/protocolSync.ts`, `"use server"`)** — its own read,
  because **the today's-log is computed client-side** from the device stack + dose logs
  and carries no inventory data (there was no select to add columns to). Resolution
  reuses **`vialOnDate` verbatim**, so a row prices against exactly the vial a dose
  logged that day would draw down — and resolves for the **selected day**, not today, so
  a back-dated row prices against the vial in use *then*.
- **Fallbacks.** No vial ⇒ no concentration ⇒ no number: the slot renders **empty with a
  faint "add stock"** tap → `/protocol?tab=stock` (the Stock tab — `ProtocolScreen` now
  takes an `initialTab`, seeded from `?tab=`). **Logging is never blocked by the absence
  of a draw.** "add stock" is gated on the read having *landed* — it asserts "you have no
  vial", so it must never appear while in flight or on a row we merely couldn't price.
  Stale-day reads are discarded by key, because a wrong draw is worse than no draw.
- **Not built:** the D8 vial-switch (D8 says "may"; `addStockItem` archives priors, so
  multiple open vials at different concentrations isn't reachable). v1 is the Home
  today's-log only — the log-a-dose screen and compound detail are deferred.

## Legal Documents

The Terms of Service, Privacy Policy, and Medical Disclaimer **text** lives in the
`legal_documents` table (the 18th table; added post-v0.4.2 via the
`legal_documents_table` + `seed_legal_documents` migrations, SQL in
`supabase/legal/`). One row per `(doc_type, version)`; `is_current` flags the live
version of each type, with a partial unique index enforcing exactly one current
per type. Write model matches the seed catalogues — **service-role writes only** —
but, unlike them, **read is public (`anon` + `authenticated`)** because signup
shows the documents before a user has an account.

The **public render pages** (`/terms`, `/privacy`, `/medical-disclaimer`) cache
their DB read (Spec 13): the docs are identical across all users and change only on
a rare version bump, so they read through a **cookieless anon client** wrapped in
`unstable_cache` (`lib/legal/getLegalDocument.ts`, tag `legal-documents`, 1h
revalidate) instead of a per-request Supabase hit — `docType` is the only cache-key
dimension (no locale/personalisation). **Note:** the page *shells* still render
dynamically (`ƒ`), because the root `app/layout.tsx` reads the session cookie
(`getCurrentUser()` for the desktop-gate variant), which opts the whole route tree
into dynamic rendering — so `export const revalidate = 3600` on these pages is
aspirational (it would make them ISR-static only if the root layout stopped reading
cookies). The substantive win is still real: the legal **content read** is served
from cache, so Supabase rendering load drops to ~once/hour regardless of traffic.
The signup gate + `consent_records` still read the current version **live**
(uncached), so a version bump shows in consent immediately.

**Wired into signup (2026-06-08; consent model expanded 2026-06-20, Spec 12).**
The 18+/ToS gate at `/welcome` records the access gate on the profile
(`tos_accepted_at` + `tos_version`, read live from `is_current`) AND now captures
**three separate, un-ticked consents** — (1) Terms + Privacy, (2) Medical
Disclaimer, (3) explicit health-data processing — all required before
"Enter Trackd" enables (on top of the DOB/age check). On submit it appends one
row per consent to **`consent_records`** (`tos`, `privacy`, `disclaimer`,
`health_data_consent`), each with the document version read live from
`legal_documents` + the timestamp + user-agent — the auditable, append-only,
per-version store the ToS/Privacy now promise (`supabase/consent/001_consent_records.sql`).
The documents are rendered verbatim at `/terms`, `/privacy`, `/medical-disclaimer`
(shared `components/legal/legal-document.tsx`, public read). **Versioning note:**
legal docs may use **point versions** (e.g. `1.3`) for moderate refinements
(Adrian's call, 2026-06-20) — this relaxes the earlier whole-versions-only rule;
either way the gate + `consent_records` read the version live, so they stay
correct across bumps.

### Versioning & dating rule — follow this every time we touch a legal document

- **Current state (v1.3, LAUNCHED — 2026-06-20):** all three documents are at
  **version `1.3`** with `is_beta = false`, **`effective_date = 2026-06-20`**, and
  the in-body header reading "20 June 2026" (the `legal_documents_v1_3` +
  `legal_documents_v1_3_effective_date` migrations, recorded in
  `supabase/legal/009_legal_documents_v1_3.sql`; applied live). The 1.0 / 0.x rows
  are retained as history (`is_current = false`). The v1.3 set added the Australian
  entity details (ACN/ABN), the three-consent model, GDPR/US-state/consumer-health
  sections, and aligned the text to the built features (request-based account
  deletion, calculator "shows its working", 7-day backups, no analytics,
  Supabase+Vercel only). The launch date is now **frozen**.
- **Versioning rule (relaxed 2026-06-20):** legal docs may use **point versions**
  (e.g. `1.3`) for moderate refinements; reserve a bigger jump for a major rewrite.
  Either way: set the new row `is_current = true`, mark the previous row
  `is_current = false` (DB keeps full version history), and set the
  `effective_date`/in-body date to the change date. The signup gate +
  `consent_records` always read the version **live**, so they stay correct across
  bumps. Keep only the current version's **source file** in
  `supabase/legal/` exports — delete superseded legal source files so we "start
  fresh" each release. (Tracked SQL migrations are immutable history and are never
  rewritten or deleted.)
- Text is stored **verbatim** with only encoding mojibake repaired. The body now
  uses a small Markdown subset the renderer understands (`##`/`###` headings,
  `-` bullets, `**bold**` emphasis — see `components/legal/legal-document.tsx`);
  the draft-era "⚠ NOTE" blocks were removed at 1.0.

## Push Notifications (Spec 14, Phase 1 — transport)

Cross-platform **Web Push** for the PWA — Android/Chrome and an **installed** iOS
PWA — using the Web Push Protocol signed with **VAPID** (the one universal path;
no APNs/FCM, no Apple cert). Phase 1 proves delivery end-to-end; reminder
scheduling is Phase 2.

- **Service worker (`public/sw.js`)** — the app's FIRST and only service worker,
  hand-written. Primarily push-only (`push` + `notificationclick`). It ALSO
  precaches exactly two static assets — the Kyle-the-vial splash clip + its poster
  (`SPLASH_CACHE`/`SPLASH_ASSETS`) — and its `fetch` handler **responds ONLY for
  those two same-origin paths**: the **video is network-first** (when online it
  returns the server's own response untouched, so the SW can never alter playback;
  only offline does it fall back to the precached copy, with Range-request slicing
  so iOS `<video>` gets `206 Partial Content`), the **poster is cache-first**. For
  **every other request it returns without calling `respondWith`**, so it still
  never intercepts a navigation or caches the app shell. The offline-first model for
  app DATA stays localStorage + the Supabase mirror (not SW caching); the only thing
  the SW caches is the splash, so Kyle plays offline. Registered from the `(app)`
  shell by
  `components/pwa/service-worker-registrar.tsx`; excluded from the proxy
  session-refresh matcher (`proxy.ts`). It is a static `/public` file (no build
  step), served at root scope `/` so `pushManager.subscribe` works. (Bump
  `SPLASH_CACHE` to roll the splash assets; old caches are pruned on `activate`.)
- **Subscription store** — `push_subscriptions` (base schema, "ADD 3"): one row
  per device endpoint, the `PushSubscription` decomposed into
  `endpoint`/`p256dh`/`auth` columns (the sender needs them individually), FK to
  `profiles(id) ON DELETE CASCADE`, UNIQUE `(user_id, endpoint)`, RLS
  `own push_subscriptions - all` ((SELECT auth.uid()) = user_id), granted in
  `api_role_grants`. Written by the client; READ by `send-push` with the service
  role (bypasses RLS). Dead endpoints (HTTP 404/410) are pruned on send.
- **Intent flag** — `profiles.notifications_enabled` (migration
  `supabase/notifications/001_push_subscriptions.sql`, the ONLY new schema in this
  spec) is the master ON/OFF. UI state is the live `Notification.permission` +
  subscription presence; the flag records INTENT so toggling off suppresses sends
  even while OS permission is still "granted". Enforced at the send primitive.
  Distinct from the per-type `notification_preferences` table (dose reminders,
  quiet hours, etc.), which is **Phase-2 scheduling, out of scope here**.
- **Client layer** — `lib/push/pushService.ts` (capability detection,
  subscribe/unsubscribe, server sync), the `usePushNotifications` hook
  (`components/push/`), and best-effort server actions `lib/push/pushActions.ts`
  (identity from the verified session, never the client; RLS the backstop).
  ONE hook backs both entry points (Spec 14 D5): the **Settings** toggle
  (`components/settings/NotificationsToggle.tsx`, with a "Send test notification"
  affordance) and a **persistent dashboard banner**
  (`components/push/EnableNotificationsStep.tsx`) — a slim, non-dismissable prompt
  rendered by `HomeScreen` (via its `notificationsBanner` prop) directly **above
  Today's Log**. Notifications are core to the app (dose reminders), so this prompt
  is deliberately NOT skippable: there's no "Not now" and no remembered-dismissed
  flag — it stays until the user actually turns notifications on, then self-hides.
  The notifications prime stays purely about notifications (renders only when push
  CAN be enabled — `status === "off"`; every other state, incl. already-on / denied
  / iOS-not-installed, renders nothing so it never leaves a gap); **iOS install
  education is its own thing** — an `AddToHomeScreenPrompt` popup
  (`components/pwa/InstallHomeScreenPopup.tsx`, shown to an iPhone-in-Safari user)
  plus a permanent Profile → "Add to Home Screen" row (`InstallAppRow`). The popup
  shows on **every physical sign-in / sign-up** (Adrian's call): the auth callback
  (`app/auth/callback/route.ts`) sets a short-lived `trackd-install-hint` cookie on a
  successful code exchange and the dashboard reads it — a returning user reopening the
  app with a live session never hits the callback, so isn't nagged. The cookie is
  consumed only on **dismiss**, via `POST /api/install-hint` (a route handler, NOT a
  Server Action — a Server Action re-renders the route, and clearing on *show* let any
  post-load RSC refresh re-read `freshSignIn=false` and auto-drop the popup mid-view).
  So it stays until the user closes it, then returns on the next sign-in. There is
  deliberately **no "already installed" suppression** (that gate hid the popup on
  accounts that had once run the installed PWA, e.g. a founder's). The
  `profiles.pwa_installed_at` / `install_prompt_dismissed_at` columns (migration
  `supabase/profile/006_pwa_install_state.sql`) are now unused — kept only to avoid a
  drop migration. **Two platform paths** (never on desktop or a standalone launch):
  **iPhone (Safari)** gets the manual Share-sheet steps (`AddToHomeScreenPrompt`) since
  iOS has no install API; **Android (Chrome/Samsung Internet)** gets a single "Add to
  Home Screen" button that fires the OS's native install dialog via the
  `beforeinstallprompt` event (`components/pwa/usePwaInstall.ts` — module-level capture
  + `useSyncExternalStore`), shown only when the browser has actually offered an install
  (`canInstall`). Permission is never requested without a gesture.
  The VAPID public key is `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (inlined at build); the
  private key lives ONLY server-side (Vercel env + the Edge Function secrets),
  never in the bundle.
- **Send — two paths, one VAPID keypair.**
  - **Phase-1 test send (in-app, ships with Vercel):** `sendTestNotification` in
    `lib/push/pushActions.ts` sends via **`web-push` in a Node server action**,
    reading the user's OWN subscriptions under RLS (userId from the session) and
    pruning 404/410. So once the app is pushed with the **server** VAPID env vars
    set in Vercel, the "Send test notification" button works with **no separate
    function deploy**. A user can only ever test-send to themselves.
  - **Phase-2 scheduler primitive (Edge Function):**
    `supabase/functions/send-push/index.ts`, input `{ userId, payload }`, loads
    subscriptions with the **service role**, checks `notifications_enabled`, sends
    via `web-push` + VAPID, prunes 404/410 — so the future `pg_cron`/`pg_net`
    scheduler can reach arbitrary users. Built now (source in the repo) but **not
    required for Phase-1 testing**; deploy it with Phase 2. A non-service-role
    caller is restricted to their own id (defence in depth).
- **Phase-2 reminder engine (`lib/notifications/`).** `reminders.ts` is PURE:
  `isDueToday` reads the `protocol_compounds` schedule columns
  (`schedule_type`/`interval_days`/`days_of_week`/`first_dose_on`, mirroring the
  client `isDueOn`), plus the dose/missed/low-stock message builders. `runner.ts`
  (`runForUser`) collects a user's data in their `profiles.timezone`, computes
  due-and-unlogged + low-stock, and sends via `web-push`, pruning dead endpoints.
  Two callers: the **test harness** (`actions.ts` `sendMyRemindersNow`, force=true,
  RLS-scoped to self — wired to the Settings test button) and the **scheduler**
  (`/api/notifications/run`, service role, founders-only, respecting reminder time
  + quiet hours + once-per-day dedupe). Preferences live on the extended
  `notification_preferences` (per-type toggles + `reminder_time` + quiet window +
  dedupe stamps, `supabase/notifications/002`), edited via
  `components/settings/ReminderSettings.tsx`. The scheduler reuses the same VAPID
  secrets as the in-app sender. It is **live**: the `reminder-runner` pg_cron job
  (`supabase/notifications/003`) POSTs the route via `pg_net`, authed with
  `CRON_SECRET`; the route uses `SUPABASE_SECRET_KEY` (service role, granted in
  `supabase/grants/002`) to read across founders. Verified end-to-end
  (cron `succeeded`, `200`, reminder delivered).

## Injection Sites (Spec 19 — Injection Site Rework)

A shared, coordinate-bearing site catalogue rendered on **anatomical body maps**
(IM + Sub-Q), shaded by how recently each site was used. **The feature reports, it
does not recommend** — it shows which sites are fresh and which are rested; it never
suggests where to inject next, ranks sites, or warns (decision-support, not
decision-making; Invariant 4).

**As-built (the working-set / setup-screen design was dropped mid-build):** there is
**no per-user "working set" and no `/settings/sites` screen**. Every catalogue site
is pickable when you log a dose — on the **compound's own route only** (an IM compound
logs IM sites, Sub-Q logs Sub-Q; the route is fixed by the compound's method, no
cross-route logging). The feature lives on **Home**: a display-only glance card, a
full-screen sheet, and the site picker inside the log-dose sheet.

- **Data foundation (`supabase/sites/`).** The site list is a read-only
  `injection_sites` **catalogue table** carrying `route` (im/subq, reusing
  `admin_route`), `side` (left/right/n_a), `aspect` (anterior/posterior), and `x`/`y`
  coordinates. **36 sites (22 IM + 14 Sub-Q)**; the glute stays two rows
  (`im-glute-*` + `sq-glute-*`, one per route). Seeded from `injection_sites.csv` via
  `build-sites-seed.mjs` → idempotent `002_seed_injection_sites.sql` (same CSV →
  `ON CONFLICT` pipeline as compounds/biomarkers/markers). Migrations `007`–`009`
  retuned the IM centroids, respaced crowded markers, and mirrored the front view +
  set the Sub-Q coords (all applied live via MCP). **`x`/`y` are now display metadata
  only** — rendering is driven by per-region SVG **path data**
  (`components/sites/bodyArtwork{IM,SubQ}.ts`) keyed by site id, not by the
  coordinates. Data access is `lib/db/injectionSites.ts`
  (`listInjectionSiteCatalogue`, RLS-scoped session identity). Compound route resolves
  via `compounds.default_route` + `protocol_compounds.route`; oral (`po`) compounds get
  no map.
- **The shared body map (`components/sites/`).** `BodyMap.tsx` is built once and
  rendered in two modes — `pick` (log flow: tap where you injected) and `recency`
  (read-only rotation view, amber shaded by `heat`). Both routes render as tappable
  **regions**: `BodySilhouette.tsx` draws the base body from Angus's anatomical SVGs
  and region overlays fill amber. Front/Back is one crossfading view. **Mirror-front
  convention:** an image-left region maps to the user's own left on both views, so
  screen-left = your left (the region's site id already encodes the side).
- **Male + female bodies (sex-aware).** There are **four** generated artwork modules —
  `bodyArtwork{IM,SubQ}.ts` (male) and `bodyArtworkFemale{IM,SubQ}.ts` — all drawn in
  the same 1491×2109 canvas and sharing **one identical transform** onto the 0–100
  grid, so switching route *or* sex never resizes or shifts the body. Which body to
  draw comes from `profiles.sex` via `bodySexFor()` (`lib/db/types.ts`), threaded down
  as a `bodySex` prop from two server entry points: the **dashboard page** (glance card
  + sites sheet) and the **(app) layout** (→ `QuickActionsFab` → `QuickTrackSheet` →
  the log flow; since Spec 20 the FAB owns this chain, not `BottomNav`). `components/sites/bodyArtwork.ts` is the only
  thing that knows which module is which — `routeTransform` / `routeBasePaths` /
  `routeRegions` all take `(route, [aspect,] sex)`.
  - **Female has no pec sites.** Angus's female IM art omits the pecs, so `im-pec-l` /
    `im-pec-r` are filtered out of the catalogue for female users by `sitesForSex`
    (`lib/home/siteCatalog.ts`) — server-side on the dashboard, and again inside
    `LogDoseSheet` (which loads its own catalogue). The female Sub-Q set is a 1:1 match
    with the male's. **History is never rewritten:** a pec logged earlier still renders
    its label via `siteLabel`; it's just not offered going forward.
  - **Sex is required, not nullable-in-practice.** The welcome gate asks for it
    alongside DOB and validates it server-side; Settings offers only Male / Female
    (no "prefer not to say") behind a confirm step, since it changes what the map
    draws. Profiles predating the gate question have `sex = null` → `bodySexFor`
    falls back to the **male** body, and Settings shows them a "Select…" placeholder
    so a save can't silently write a sex they never chose.
- **Surfaces (all on Home).** `InjectionSitesGlanceCard` — a square widget: IM/Sub-Q
  toggle, mini front+back bodies shaded by recency, and a "Last logged" list grouped
  by **muscle** (each row shows the compound(s) put there, so two compounds in one
  area read together). `InjectionSitesSheet` — the full-screen map: route toggle, big
  body map with a pointer-scrub tooltip, a recency legend, and the same muscle-grouped
  "Last logged". The **log-dose sheet** renders `BodyMap` in `pick` mode for the
  compound's route; one tap writes the granular `siteId` onto the dose log (plus the
  UNCHANGED device-siteId→`dose_logs.injection_site` enum map). Picking a site is
  optional; the dose always logs.
- **Recency (`lib/home/siteRecency.ts`).** Pure helpers: `siteHeat` (amber 0–1, full
  on the day of injection fading to empty at the decay window — **IM 7d / Sub-Q 5d**,
  opacity on `--accent-amber`) and `siteDaysSince` (days-since per site,
  today-inclusive). **Derived at read time; nothing recency/freshness is stored**
  (Invariant 1). To stay granular-accurate it reads the **device dose log's `siteId`**
  (the coarse `injection_site` enum collapses many sites to `other`). It **reports,
  never recommends**: no suggested-next-site, ranking, risk score, or warning icon
  (the amber exception is documented in `ui-context.md`).
- **The hit halo (2026-08-01).** Adrian found two regions that could not be
  tapped at their visual centre. Swept in Chrome across the IM artwork for both bodies and both views (42 regions): the two **triceps on the posterior view**, on BOTH
  bodies, are the only ones. A tricep is drawn as a narrow curved sliver, so the
  centre of its bounding box falls in the concave side — outside its own fill,
  where `elementFromPoint` returns the base silhouette and the tap does nothing
  at exactly the spot a user aims at. Fixed with a transparent
  `vector-effect: non-scaling-stroke` (`.site-hit`, `globals.css`) rather than by
  redrawing the artwork, which is Angus's. **Scoped, via `regionNeedsHalo`
  (`bodyArtwork.ts`), to the two ids that need it** — a blanket halo was tried
  first and was worse: it expands symmetrically, so at 4px a side the big
  quad-front region swallowed the centres of the narrow quad-out and
  ventroglute strips beside it, fixing two regions and breaking four. Both
  renderers (`BodyMap` for the app, the onboarding demo's `demo-body.tsx`) share
  the one CSS rule and the one list. Re-run the sweep if the artwork changes.
- **Retired.** The per-user working set was dropped: `user_injection_sites` +
  migrations `003`/`004` are inert history, and the table is dropped in
  `supabase/sites/010_drop_working_set.sql` (applied live). The old `/settings/sites`
  setup screen, `SitesScreen`, `RotationPicker`, and the per-compound rotation picker
  are gone. `StackCompound.rotationSites`/`rotation_index` + the `nextSiteId`/
  `advanceRotation`/`resolvedDaySite` helpers remain **vestigial** (fields always
  `[]`, helpers uncalled). `dose_logs.injection_site` + all logged history are
  untouched (Invariant 8). Spec 19 ships as one PR (not yet deployed).

## Account before the paywall (Spec w2b-14, 2026-08-07)

**Account creation is its own onboarding step, sitting between `free` and
`paywall`.** It used to be a control ON the paywall; that arrangement is gone.
`account` is now the LAST anonymous step and the phase boundary, so the paywall
and every step after it may assume a signed-in user.

Three reasons, in the spec's priority order: the email is captured **before the
price is seen** (a user who balked used to leave no trace at all); auth and
payment stop sharing a screen (auth is a full page load and destroys any payment
UI mounted beside it — the bug class spec w2b-15's Payment Element would have
walked straight into); and the paywall gets **exactly one** call to action.

- **The screen is framed as KEEPING work, never as a toll.** "Let's make sure
  this sticks" — no "sign up", no "create an account to continue", and **no
  mention of price, trial or payment**, which is revealed on the paywall and
  nowhere earlier. There is no skip and no guest path.
- **The controls are MOVED, not redesigned** — the same `GoogleSignInButton` and
  `EmailPasswordForm` `/login` mounts, in the same order, with the same divider.
  Both gained one prop each (`next`, `defaultMode`), both defaulting to the login
  screen's existing behaviour, so that screen is untouched.
- **All three auth paths return through a FULL DOCUMENT LOAD** — Google via
  `/auth/callback`, email confirmation via `/auth/confirm`, and email sign-in via
  a deliberate hard navigate. That last one was a server `redirect()` and it
  shipped visibly broken for one measured run: the flow is ONE client tree that
  reads `?step=` at mount and on `popstate` only, so a SOFT navigation to
  `?step=paywall` reused the mounted tree and left the account screen — sign-in
  form and all — on screen with the address bar claiming otherwise. `signIn`
  now hands the destination back for `window.location.assign` whenever a `next`
  was supplied. One arrival shape for all three is also what gives the handoff
  exactly one place to hook.

### The answer handoff

The whole pre-account half runs with no account, so the answers live in one
`localStorage` key (`trackd.onboarding.v1`). `claimOnboardingSession`
(`app/onboarding/actions.ts`) claims them onto the account, fired on ARRIVAL by
`components/onboarding/answer-handoff.tsx` — never on a button press, because
nothing client-side survives the redirect.

- **Write, confirm, THEN clear.** The device copy is dropped only for a status
  the server returned, and never for `no-session` or `error`. Until then the
  answers exist in exactly one place, so an optimistic clear would be silent,
  unrecoverable loss on the most invested user in the flow. A failure leaves them
  intact and shows a retry.
- **Every write is idempotent, because retries are the normal case.**
  `consent_records` upserts with `ignoreDuplicates`; the `profiles` gate update
  is conditioned on `tos_accepted_at IS NULL`; `signup_intake` is a plain INSERT
  whose 23505 *means* "already claimed". A partial failure plus a retry finishes
  the missing half rather than duplicating the finished one.
- **An existing user's data always wins**, and the database enforces it rather
  than a branch in TypeScript: `signup_intake.user_id` is the PRIMARY KEY with
  **no UPDATE grant at all**, so a returning user's answers cannot be replaced by
  whatever a borrowed phone had in storage. The `profiles` gate update is
  conditioned for the same reason.
- **It writes the 18+/ToS gate**, so a user who just answered dob, sex and the
  consent tick is not sent to `/welcome` to answer them again. **The age is
  re-decided on the server** (`hasAgeAndConsent`) — the value arrived from
  `localStorage` and the client's answer is not evidence. If the server cannot
  prove it, the answers are still claimed and the gate is simply withheld.
- **Once claimed, the device copy stops being a record.** A `claimed` latch in
  the flow makes `patch` stop persisting — otherwise the paywall's next plan tap
  would write the whole answer set straight back into the key the claim had just
  cleared. The in-memory session survives, because the paywall still needs
  `plan`.
- **`supabase/onboarding/002_signup_intake.sql`** — one row per user holding the
  answers with nowhere else to go (`name`, `running[]`, `struggle[]`,
  `struggle_detail`, `affiliate_code`). Append-only, own RLS, own GRANT, every
  cap and tag list mirroring `lib/onboarding/session.ts`. A table rather than
  five `profiles` columns, for the same reason `signup_attribution` is one.
  `profiles` has no name column at all, which is why the name lives here and is
  returned by the claim so Welcome can still greet correctly after the clear —
  and after a reload, where there was never a device copy to read. **Takes the
  live DB to 28 tables.**
- **`supabase/onboarding/003_signup_intake_has_answers.sql`** — a claimed row
  must carry BOTH intent answer sets. 002 constrained every value and nothing
  about the row being worth writing, so `INSERT {user_id}` alone was accepted —
  and a thin row squats the primary key, which on an append-only,
  first-write-wins table destroys the real set on the device that has it. The
  rule is `clampIntent`'s: every legitimate claimer satisfies it by
  construction, and a half-finished device is refused at the earliest honest
  point. `carriesAnswers` in the claim implements the same rule; the constraint
  exists because the destructive failure must not depend on a guard in an
  application.

**A value the client accepts must be a value Postgres accepts**, and that
contract was broken in two ways a name can carry text nobody typed. `.slice(n)`
counts UTF-16 code units, so it could halve an emoji and leave a **lone
surrogate** (`PGRST102`); a **NUL byte** survives `trim()` and Postgres refuses
it (`22P05`). Neither is reportable — the claim returns `error`, the retry
banner appears, and every retry fails identically, so the answers never land and
the notice never clears. `capCharacters` (`lib/onboarding/session.ts`) strips
C0/C1 controls — deliberately not the whole `\p{C}` class, which would take the
zero-width joiner and break every multi-part emoji — and cuts with `Array.from`,
by CODE POINT, which is what Postgres's `char_length()` counts. `normaliseName`
and `normaliseDetail` both go through it, so the caps here and in the CHECKs now
agree about what "24" and "80" mean rather than agreeing by luck on ASCII.

### Route protection

`app/onboarding/page.tsx` is a **server component** and holds both rules, because
a client-side redirect is not protection. The only requests that reach it are the
ones that matter — a typed URL, a bookmark, a reload, and the 302 that ends every
auth round-trip — since the flow itself advances with `pushState`.

1. An `authed` step with **no session** 307s to the start of the flow, not to the
   account screen: arriving at a bare account screen with no answers to save
   makes no sense.
2. A **signed-in** user on the account screen 307s to the paywall.

`signedIn` is then handed to the flow, and `clampStep` / `clampIntent` take it as
a third argument that **exempts `authed` steps only**. That exemption is not a
weakening: the claim clears the device, so from the paywall onward there is no
date of birth on it and the age clamp would lock a paying customer out of the
screen they just paid on. What it exempts is a device answer, replaced by a
stronger one — a server-verified session over an account whose age and consent
are recorded in `profiles` and `consent_records`. It **fails closed** (the
parameter defaults to false) and every anonymous step, the whole demo included,
is clamped exactly as before. `pastAccount` in the flow is the client backstop
for the two moves no server sees — Back from the paywall, and walking forward
from `free` in a tab that signed in elsewhere.

> **Carried into spec w2b-15:** the paywall is reachable by a signed-in user
> whose `profiles.is_18_plus` is false (they would have had to pass the client
> age gate to get an account through this flow, but the server does not re-check
> it to RENDER a price list). The **payment endpoint must verify it server-side**
> before creating a subscription — §3.2's "no payment path bypasses the age gate"
> lands there, not on the render.

## Signup attribution (2026-08-01, APPLIED)

"Where did you hear about us" is captured on the last onboarding screen. Adrian
asked for the catch-all option to open a **typed field** and for the answer to
reach the database, so we can see which channels are working.

- **`supabase/onboarding/001_signup_attribution.sql`** — one row per user
  (`source` CHECK-constrained to the five tags, nullable `detail` free text
  capped at 80 to match `ATTRIBUTION_DETAIL_MAX`, `affiliate_code`), own RLS
  (own select/insert/update, no delete), own GRANT. **A table rather than two
  `profiles` columns**, because every new `profiles` column has to be added to
  both column-level grant lists (the Spec 16 tier lock) or the Data API 42501s
  on writes to it.
- **A CHECK ties `detail` to `source = 'elsewhere'`**, so a client bug cannot
  file free text under "Instagram" and quietly corrupt the aggregate.
- **APPLIED, and confirmed live 2026-08-07** by querying the table with the
  service role. This heading and this bullet contradicted each other for six
  days — the heading said NOT APPLIED while the bullet and the migration's own
  header said the opposite. Hand-applied migrations never appear in
  `list_migrations`, so the file comment is the only status record there is,
  which is exactly why it goes stale. **Verify against the schema, never against
  a comment.**
- **Nothing writes it yet.** The attribution screen is post-paywall and spec
  w2b-14 stopped short of it. The creator code IS now captured, into
  `signup_intake.affiliate_code`, because it is taken from `?code=` before the
  account exists and would otherwise be lost by anyone who abandons after the
  paywall.
  > ⚠️ **The code now lives in two tables and only one copy is immutable.**
  > `signup_intake.affiliate_code` is append-only; `signup_attribution.affiliate_code`
  > carries a full UPDATE grant and policy, and a cold review confirmed live that
  > `authenticated` can PATCH its own row from one creator's code to another's,
  > repeatably. Latent today because nothing writes that table — but if
  > commission is ever computed from it, a user can self-attribute at will.
  > **`signup_intake` is the authority**: earliest capture, immutable, and the
  > one the claim writes. Adrian's call whether to drop the UPDATE grant on
  > `signup_attribution.affiliate_code` when that screen is wired.
- **Reading it back is an open decision**, spelled out at the foot of the
  migration: service-role aggregates (no new policy, but `adminMetrics.ts`'s
  "never return a row" rule would have to be narrowed on purpose) versus a
  founder-only SELECT policy (reads normally, but a third place the founder
  emails are hardcoded).

## Auth and Access Model

- Every user signs in via **Supabase Auth**, by either **Google OAuth** or
  **email + password** — both land the same authenticated user (Supabase owns
  the `auth.users` row and hashes the password; the `handle_new_user` trigger
  creates the `profiles` row for every new user regardless of method, so RLS,
  the gate, and every downstream feature are auth-method-agnostic). There is no
  anonymous app state; the today-dashboard requires a session.
  - **Google OAuth** uses the client-side PKCE flow
    (`components/auth/google-sign-in-button.tsx` → `signInWithOAuth`) completed by
    the code-exchange route `app/auth/callback/route.ts`.
  - **Email + password** uses server actions (`app/login/actions.ts` —
    `signInWithPassword` / `signUp`, RLS the backstop). **Email confirmation is
    ON**, so `signUp` creates no session until the user clicks the emailed link;
    that link (and the password-reset link) is handled by `app/auth/confirm/route.ts`,
    which accepts **both** the recommended token-hash form (`verifyOtp`, works
    cross-device) and the default `code` form (`exchangeCodeForSession`) so it works
    whichever email template is live. **Password reset** is `/forgot-password`
    (`resetPasswordForEmail`) → the recovery link → `/auth/confirm` → `/reset-password`
    (`updateUser({ password })`). Confirmation + reset require working email delivery —
    **custom SMTP (Resend)** must be configured on the Supabase project (its built-in
    sender is throttled/non-prod); switch the *Confirm signup* / *Reset password*
    email templates to the token-hash form for cross-device links. All sign-in error
    copy is generic so it never reveals whether an email exists.
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
- `compounds`, `biomarkers`, `markers`, `reference_ranges`, and `injection_sites`
  (Spec 19) are read-only seed catalogues: readable by all authenticated users,
  writable only by the service role (no write policy ⇒ RLS denies all user writes).
  (The abandoned per-user `user_injection_sites` working-set table was dropped —
  `supabase/sites/010`; nothing user-owned remains in the Spec 19 data model.)
- Feature entitlements read `profiles.tier` and nothing else. Beta defaults
  everyone to `'paid'`; post-trip, the Stripe webhook becomes the column's only
  writer and the default flips to `'free'`. Gating logic never changes.
- **`profiles.tier` is LOCKED to the service role (Spec 16).** Previously any
  authenticated user could `PATCH /profiles` and set their own `tier = 'paid'` (a
  table-level UPDATE grant covered every column). Now `authenticated` holds
  **column-level** UPDATE + INSERT grants enumerating every column **except `tier`**
  (`supabase/grants/003_profiles_tier_lock.sql`), so a self-upgrade is rejected at
  the DB with `42501` — via PATCH or an upsert's `ON CONFLICT DO UPDATE`. The Stripe
  webhook still writes `tier` freely: `service_role` keeps `GRANT ALL` + BYPASSRLS
  (grants/002), and `handle_new_user` (SECURITY DEFINER) still sets the default on
  new profiles. `tier` is the only service-only column on `profiles` (billing state
  lives in the separate `subscriptions` table). **Any new `profiles` column must be
  added to the grant lists** (see `code-standards.md`). This closed the hole before
  the tier default is ever flipped to `'free'` and gating (Spec 04) ships.
- **Cross-origin posture (Spec 13).** The app exposes no JSON API for other
  origins — all data flows through Server Components + Server Actions (the auth
  route handlers `/auth/callback` (OAuth code exchange) and `/auth/confirm`
  (email-OTP verify) only do same-origin redirects, and `?next=` is validated to
  internal single-slash paths to block open redirects), so there is **no CORS
  config** anywhere (no wildcard origin, no `Origin` reflection, no credentialed
  cross-origin). The credentialed **Server Action** surface is
  SAME-ORIGIN-only by Next's built-in CSRF check (`serverActions.allowedOrigins`
  is intentionally left unset = same-origin; adding one would only loosen it).
  `next.config.ts` `headers()` adds baseline protective headers on every route:
  `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`.

## Invariants

1. **Never store a derived value.** Remaining inventory, concentration,
   mL/units per dose, doses-remaining, and projected-empty live only in
   `v_inventory_math`. The calendar and today-dashboard are computed from
   schedules + logs. Editing, undoing, or skipping a dose must reflow
   everything by recomputation — never by a stored figure or a trigger that
   mutates a balance. (A vial's `prior_used_base` is the part-used *starting*
   offset — a raw INPUT, not a stored balance; the view still derives remaining
   from it as `total − prior_used − consumed`.)

   **The one sanctioned carve-out — the per-dose draw (Spec 21).** The view's
   `ml_per_dose` / `units_per_dose` are bound to the **planned** dose
   (`protocol_compounds.dose_amount`); the view has **no per-log grain**. A logged dose
   carries its own **editable `amount`**, so a row showing an edited amount beside the
   view's planned-dose figure would display **two disagreeing numbers** — a dosing-error
   footgun, not a rounding nit. So `lib/home/draw.ts` divides the **row's own dose** by
   the vial's concentration. **The derived quantity itself — `concentration_per_ml` —
   still comes ONLY from the view and is never recomputed**; only the final division
   moves, and only because the view cannot answer it. Where the row's dose equals the
   planned dose the result is **identical** to `ml_per_dose` (same formula, dividing by
   the same 3dp-rounded concentration the view uses as its own basis) — verified against
   every live vial row, so the two can't drift. This is a narrow exception for a
   quantity the DB has no grain for; it is **not** licence to recompute inventory maths
   in TS. Everything else still reads the view (Invariant 5, `code-standards.md`).
2. **RLS on every table, always `(SELECT auth.uid())`.** No table ships without
   row-level policies. Views stay `security_invoker = true`. **Every** function
   pins `search_path = ''` — not just `SECURITY DEFINER` ones but all trigger /
   integrity functions (`set_updated_at`, `unit_family_compatible`, the three
   `check_*_unit_family` triggers), cleared by `supabase/hardening/001_advisor_search_path_and_execute.sql`
   (Spec 17); the two `SECURITY DEFINER` signup functions (`handle_new_user`,
   `handle_new_profile_prefs`) also have direct EXECUTE revoked from
   public/anon/authenticated (they run via their triggers as the definer, so signup
   is unaffected). Cross-user reads must be impossible.
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
