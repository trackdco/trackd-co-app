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
**Push Notifications** below. **Deferred to Phase 2:** the reminder SCHEDULING
engine (`pg_cron`/`pg_net` expanding due reminders) and the per-type
`notification_preferences` (quiet hours, per-protocol) — `send-push` is built so
the scheduler can call it unchanged.

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
  **Push Notifications** below.
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
  hand-written, push-only. It registers `push` + `notificationclick` and
  **deliberately has NO `fetch` handler**, so it can never intercept navigations
  or cache a stale shell — the app's offline-first is localStorage + the Supabase
  mirror, not SW caching. Registered from the `(app)` shell by
  `components/pwa/service-worker-registrar.tsx`; excluded from the proxy
  session-refresh matcher (`proxy.ts`). It is a static `/public` file (no build
  step), served at root scope `/` so `pushManager.subscribe` works.
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
  affordance) and a one-time, skippable **dashboard** prime
  (`components/push/EnableNotificationsStep.tsx`). iOS-not-installed renders
  `AddToHomeScreenPrompt` instead of a dead button (iOS only delivers push to an
  installed standalone PWA). Permission is never requested without a user gesture.
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
- **Cross-origin posture (Spec 13).** The app exposes no JSON API for other
  origins — all data flows through Server Components + Server Actions (the one
  route handler, `/auth/callback`, only does same-origin redirects), so there is
  **no CORS config** anywhere (no wildcard origin, no `Origin` reflection, no
  credentialed cross-origin). The credentialed **Server Action** surface is
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
