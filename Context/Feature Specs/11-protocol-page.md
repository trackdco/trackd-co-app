# Protocol Cutover — Full Spec (Steps 1–5)

> **Work through these in order, one at a time.** Per `code-standards.md`, implement and verify every checklist item in a step before starting the next. Do not batch. Each step depends on the one above it.
>
> **Sequence:** (1) Postgres data + offline sync layer → (2) migrate existing device data → (3) flip Home onto the new layer → (4) Protocol screen + Plan view → (5) Stock view + runway.
>
> **Why this order:** the runway maths in Step 5 can only read data that lives in Postgres, so the data has to be cut over (Steps 1–3) before the Stock screen has anything to show. Steps 1–3 are pure backend and safe to build now. Step 4 consolidates Angus's "Cycles" + "My Protocol" (Spec 11) into one tab — a deliberate change from Spec 11; confirm with Angus before starting Step 4.

---

# Step 1 — Postgres data-access + offline sync (foundation)

## 1. Goal
Make the canonical Postgres model (`cycles` → `protocol_compounds`, and `dose_logs`) the source of truth for the compound stack and dose logging, fronted by an **offline-first local cache** that syncs to Postgres whenever a connection is available. This step builds and verifies the **data + sync layer only** — no screens change.

## 2. Out of Scope (do NOT)
- Do NOT change any screen or component — every file under `components/home/*` and every `app/(app)/**` page stays exactly as-is (including Home and the Protocol placeholder).
- Do NOT build the cycle builder UI or the Stock/inventory UI.
- Do NOT wire `inventory_items` or `v_inventory_math` — that is Step 5.
- Do NOT migrate existing user data here — that is Step 2.
- Do NOT remove or edit the live localStorage stores (`lib/home/stack.ts`, `lib/home/doseLog.ts`) or the jsonb mirror tables (`supabase/home/001_device_state_sync.sql`). They keep running until the Home flip (Step 3).
- Do NOT compute any inventory / runway / derived maths in TypeScript — per invariant, those live only in `v_inventory_math`.
- Do NOT add new screens, routes, or nav entries.

## 3. Design Decisions
Read first: `architecture.md` (invariants), `code-standards.md` (conventions + the one-step rule), `project-overview.md`. The paths proposed below follow the observed `lib/` convention — **confirm exact location/naming against `code-standards.md` before creating**.

- **Source of truth = Postgres.** All access via the Supabase auth client; RLS is the only access gate; never use the service role on the client (`architecture.md`).
- **Offline-first.** Keep a local cache as the instant read/write layer, reusing the existing `useSyncExternalStore` store pattern. Writes are optimistic to the cache; reads hydrate from cache, then reconcile from Postgres when online. The phone always works offline; the cloud is backup + source of truth.
- **Sync trigger.** Background sync runs when connectivity is regained and on app focus. v1 conflict policy: last-write-wins (single-user, single-device assumption). (If strict wifi-only backup is wanted later, gate sync on connection type — one setting, not needed now.)
- **Cycle container.** `protocol_compounds` require a `cycle_id`, so ensure-or-create one active `cycle` per user (default `name: "Current"`, `is_active: true`).
- **Types mirror the schema** in `supabase/trackd_schema_v0_4_2.sql`: `Cycle`, `ProtocolCompound`, `DoseLog`. The local↔Postgres mapping (e.g. live `cadence` → `schedule_type` / `interval_days`; day-numbering `0=Sun` → ISO `Mon=1`) is *defined* here for the types but *applied* in the Step 2 migration.
- **Archive, never hard-delete** (`architecture.md`).

## 4. Implementation
Proposed new files (confirm location against `code-standards.md`):
- `lib/db/cycles.ts` — `ensureActiveCycle()`, plus read/update of the active cycle.
- `lib/db/protocolCompounds.ts` — CRUD for compounds within the active cycle (leave `inventory_item_id` null).
- `lib/db/doseLogs.ts` — CRUD for `dose_logs` (taken/skipped, `injection_site`, `inventory_item_id` null for now).
- `lib/db/types.ts` — `Cycle`, `ProtocolCompound`, `DoseLog` mirroring the schema, plus the documented mapping from the live `StackCompound` (`lib/home/stack.ts`) and local dose-log shapes (`lib/home/doseLog.ts`) for Step 2.
- `lib/sync/syncEngine.ts` — push local-cache changes to Postgres, pull + reconcile; subscribe to connectivity + focus; reuse the existing store/event pattern.
- **Reuse the existing Supabase client** — locate and import the current one; do not create a second.

Verification (dev-only, remove before the flip): a throwaway dev route or script that round-trips create/read/update for all three entities against a test account and confirms RLS scoping + an offline→online sync.

Do not edit: anything under `components/`, anything under `app/(app)/`.

## 5. Check When Done
- [ ] Data layer creates/reads/updates `cycles`, `protocol_compounds`, `dose_logs` for the signed-in user, RLS-scoped.
- [ ] `ensureActiveCycle()` returns an existing active cycle or creates one (`"Current"`).
- [ ] Offline writes hit the cache instantly; sync pushes them to Postgres on reconnect; pull reconciles on focus.
- [ ] No screen, component, route, or nav entry changed. Home still runs entirely on the existing localStorage stores.
- [ ] No inventory / runway / derived maths computed in TS.
- [ ] Live localStorage stores and jsonb mirror tables untouched.
- [ ] No new components; no new TS or lint errors.

---

# Step 2 — Migration (localStorage + jsonb → Postgres)

## 1. Goal
A one-time, per-user migration that copies the live device-local stack and dose logs (and custom compounds) into the Postgres model from Step 1, so no beta user loses data when Home flips over. Must be **idempotent** (safe to re-run).

## 2. Out of Scope (do NOT)
- Do NOT change any screen/UI.
- Do NOT flip Home onto the new layer yet (Step 3).
- Do NOT delete the localStorage stores or the jsonb mirror tables — they stay as fallback until after the flip is verified.
- Do NOT build any Plan/Stock UI.
- Do NOT compute derived maths in TS.

## 3. Design Decisions
Read first: `architecture.md`, `code-standards.md`, `progress-tracker.md`.
- **Source data:** localStorage stores `lib/home/stack.ts` (`StackCompound`) and `lib/home/doseLog.ts`, plus custom compounds. Use the jsonb mirror tables in `supabase/home/001_device_state_sync.sql` as server-side fallback where the local cache is empty.
- **Target:** `cycles` (via `ensureActiveCycle()` — one active "Current" cycle per user), `protocol_compounds`, `dose_logs`.
- **Mapping** (from Step 1's `lib/db/types.ts`):
  - `daily` → `schedule_type = every_day`
  - `everyOtherDay` → `every_n_days`, `interval_days = 2`
  - `everyNDays` → `every_n_days`, `interval_days = n`
  - `daysOfWeek` (0 = Sun) → `specific_days`, `days_of_week` ISO (Mon = 1 … Sun = 7) — **convert the numbering**
  - map dose / unit / method / route / rotation fields / archived flag
  - dose logs `{date: {compoundId: DoseLog}}` → `dose_logs` rows (taken/skipped, `injection_site`), linked to the migrated `protocol_compound`
- **Idempotent:** per-user "migrated" marker; re-runs must not duplicate. Archive, never delete.
- **Trigger:** run once automatically after login when the marker is absent; also expose a manual re-run for support. Confirm placement against the auth/gate guard in `app/(app)/layout.tsx`.

## 4. Implementation
- New: `lib/migration/migrateDeviceState.ts` — read local + jsonb fallback, map, write via Step 1's `lib/db/*`, set the migrated marker.
- New: a small post-auth hook/util to run it once (confirm pattern against `app/(app)/layout.tsx`).
- Reuse the Step 1 data layer + RLS client; no raw client-side inserts outside it.
- Log counts of migrated cycles / compounds / dose logs for verification.

## 5. Check When Done
- [ ] Migration copies a user's stack → `protocol_compounds` (under the active cycle) and dose logs → `dose_logs`, RLS-scoped.
- [ ] Schedule / day-number / dose mappings correct — spot-check each cadence type.
- [ ] Re-running does not duplicate (idempotent marker works).
- [ ] localStorage stores and jsonb mirror tables left intact.
- [ ] No UI changed; no derived maths in TS.
- [ ] No new components; no new TS/lint errors.

---

# Step 3 — Home flip (read/write via Postgres)

## 1. Goal
Point Home's compound list, add-compound flow, and dose logging at the Step 1 Postgres layer instead of the localStorage stores, so all going-forward data lands in the database. **Home must look and behave identically to today.** After verification, the localStorage stores become a cache only (no longer the source of truth).

## 2. Out of Scope (do NOT)
- Do NOT change Home's visual design or layout — identical UX.
- Do NOT build the Protocol Plan/Stock screens (Steps 4–5).
- Do NOT wire inventory or runway.
- Do NOT hard-delete the localStorage stores or jsonb mirror tables — demote to cache; remove only in a later cleanup once stable.
- Do NOT compute derived maths in TS.

## 3. Design Decisions
Read first: `architecture.md`, `code-standards.md`, `ui-context.md`.
- **Affected components — data source only, not visuals:** `components/home/TodaysCycleCard.tsx` (compound list, log/skip, site rotation) and `components/home/AddCompoundSheet.tsx` (now writes `protocol_compounds` under the active cycle). Dose log/skip now writes `dose_logs`.
- Reads come from the offline cache hydrated by Step 1's sync; writes go through `lib/db/*` (optimistic to cache, then synced). Preserve the instant offline feel.
- Site rotation (`rotationSites` / `rotationIndex`) maps onto the migrated `protocol_compound` + `dose_logs.injection_site`. Leave `dose_logs.inventory_item_id` null (linked in Step 5).
- Keep the existing localStorage modules as the **cache implementation** — flip their role from "source of truth" to "cache over Postgres."

## 4. Implementation
- Edit `components/home/TodaysCycleCard.tsx` and `components/home/AddCompoundSheet.tsx` to source/write via `lib/db/*` + cache (no visual edits).
- Edit the dose log/skip handlers to write `dose_logs`.
- Update the relevant `useSyncExternalStore` stores to back onto the cache fed by `lib/sync/syncEngine.ts`.
- Leave the Protocol placeholder (`app/(app)/protocol/page.tsx`) untouched.

## 5. Check When Done
- [ ] Home shows the same compounds (now sourced from Postgres via cache); visuals unchanged.
- [ ] Adding a compound writes a `protocol_compound`; logging/skipping writes a `dose_log`; site rotation persists.
- [ ] Works offline (cache) and syncs on reconnect.
- [ ] localStorage demoted to cache, no longer canonical; mirror tables still intact.
- [ ] No visual/layout change; no derived maths in TS.
- [ ] No new components; no new TS/lint errors.

---

# Step 4 — Protocol screen shell + Plan view (cycle builder)

## 1. Goal
Replace the Protocol placeholder with the real Protocol screen — a single screen with a **Plan / Stock** toggle — and build the **Plan** view: the cycle builder where the user creates/edits a cycle and its compounds (dose, schedule, start date, length).

## 2. Out of Scope (do NOT)
- Do NOT build the Stock view yet (Step 5) — render an empty Stock placeholder behind the toggle.
- Do NOT add a second bottom-nav tab — **one Protocol tab only**.
- Do NOT compute inventory/runway maths in TS.
- Do NOT use the word "protocol" for the dose-plan in UI labels — use "Plan" / "Cycle" (avoids the naming clash).
- Do NOT duplicate the data model — write to `cycles` + `protocol_compounds` via `lib/db/*`.

## 3. Design Decisions
Read first: `ui-context.md` (Obsidian tokens — confirm exact names), `code-standards.md`, `architecture.md`, and Angus's `Context/Feature Specs/11-protocol-section.md` for intent. Note: this consolidates Angus's "Cycles" + "My Protocol" into one tab — a deliberate change from Spec 11 (confirm with Angus).
- Screen mirrors the Home composition: `components/layout/PageScrollTitle.tsx` + staggered `animate-home-up` cards (see `components/home/HomeScreen.tsx`).
- **Plan / Stock toggle:** an in-page segmented control near the top (shadcn `tabs`), NOT a bottom-nav tab.
- **Plan view** shows the active cycle: header (name, "Week X of N" derived from `started_on` + length/`end_date`, you-are-here marker), then the compound list reusing the `TodaysCycleCard` row treatment in a non-logging "plan" mode.
- **Builder add/edit:** extend `components/home/AddCompoundSheet.tsx` (catalogue → method → dose → schedule → rotation) rather than reinventing; add cycle-level fields (start date, length/end). Sheets use the established `useSheetDrag` pattern.
- Styling via `lib/ui-presets.ts` (`CARD_TITLE`, `CARD_ICON_BADGE`); tokens from `globals.css` / `@theme`; no hardcoded hex; Playfair titles; amber only for active/interactive.
- Home keeps its own add entry for now (both write the same `protocol_compounds`); revisit consolidation later.

## 4. Implementation
- Edit `app/(app)/protocol/page.tsx` → real screen with the Plan/Stock toggle; the Stock side renders a placeholder for Step 5.
- New components (confirm names against `code-standards.md`): `components/protocol/ProtocolScreen.tsx`, `components/protocol/PlanView.tsx`, `components/protocol/CycleHeader.tsx` — reusing existing card/sheet primitives.
- Builder reads/writes `cycles` + `protocol_compounds` via `lib/db/*`.

## 5. Check When Done
- [ ] Protocol placeholder replaced; still one bottom tab; Plan/Stock toggle works (Stock = placeholder).
- [ ] Plan view shows the active cycle header (Week X of N) + compound list.
- [ ] Builder creates/edits a cycle + compounds, written to Postgres, and they appear on Home.
- [ ] Obsidian tokens/presets used; no hardcoded hex; amber restraint respected.
- [ ] No second nav tab; no "protocol" label used for the dose-plan.
- [ ] No derived maths in TS; no new TS/lint errors.

---

# Step 5 — Stock view + runway

## 1. Goal
Build the **Stock** view behind the Protocol toggle: the user's inventory of compounds on hand, an add-stock flow, refill and archive, and the runway ("~X weeks left") read from `v_inventory_math`.

## 2. Out of Scope (do NOT)
- Do NOT recompute concentration / remaining / runway in TS — read them only from `v_inventory_math` (invariant).
- Do NOT use red / green / amber to imply good-or-bad on stock levels — runway and low-stock indicators must be **neutral** (health-data colour rule).
- Do NOT hard-delete inventory — archive; **refill creates a new row, never mutates** (invariant 8 / Spec 11 §6).
- Do NOT add a bottom-nav tab.

## 3. Design Decisions
Read first: `ui-context.md`, `architecture.md` (invariants), Angus's `Context/Feature Specs/11-protocol-section.md` (this is its inventory surface), `code-standards.md`.
- `inventory_items` is a 3-way union — handle all three: **reconstituted** (powder + `bac_water_ml`), **preconcentrated** (`concentration_mg_per_ml`), **oral_solid** (`strength_per_unit_mg`). The add-stock flow branches by type.
- Reconstituted items reuse `components/home/ReconCalculatorSheet.tsx` for the maths inputs.
- Cards over `inventory_items`; displayed runway / remaining / doses-left come from `v_inventory_math` (`est_empty_date`, `doses_remaining`, `remaining_display`, etc.) — **read-only**.
- Runway requires online (Postgres view); offline shows the last-synced value. Indicator stays neutral/categorical — no alarm bar.
- **Refill** = insert a new `inventory_item` row. **Archive** sets archived state (surfaces in `app/(app)/archive`).
- **Dose draw link:** when a dose is logged against an inventory item, set `dose_logs.inventory_item_id` so runway decrements — add inventory selection to the Home log flow (small edit to Step 3's logging). Confirm against `TodaysCycleCard`.
- Optional (confirm with Angus): a small neutral "X wks left" tag on the Home `TodaysCycleCard` — separate follow-up if wanted.
- Styling: `lib/ui-presets.ts`, `globals.css` tokens, Playfair titles, amber restraint.

## 4. Implementation
- Edit `components/protocol/ProtocolScreen.tsx` (Step 4) to render the real Stock view in place of the placeholder.
- New components (confirm names): `components/protocol/StockView.tsx`, `components/protocol/StockItemCard.tsx`, `components/protocol/AddStockSheet.tsx` (branches by inventory type; reuses `ReconCalculatorSheet`).
- Read `v_inventory_math` via `lib/db/*` (read-only); write `inventory_items` (add / refill / archive) via `lib/db/*`.
- Small edit to the Home log flow to set `dose_logs.inventory_item_id`.

## 5. Check When Done
- [ ] Stock view lists `inventory_items` with remaining + runway from `v_inventory_math` (not recomputed).
- [ ] Add-stock handles all three item types; reconstituted uses the recon calculator.
- [ ] Refill creates a new row; archive (no hard delete); archived items appear in Archive.
- [ ] Runway / low-stock indicator is neutral — no red/green/amber good-bad colouring.
- [ ] A logged dose can reference an inventory item so runway decrements.
- [ ] No derived maths in TS; no nav tab added; no new TS/lint errors.