# Injection Site Rework — Full Spec (Steps 1–4)

> **Work through these in order, one at a time.** Per `code-standards.md`, implement and verify every checklist item in a step before starting the next. Do not batch. Each step depends on the one above it.
>
> **Sequence:** (1) site catalogue + user working set (data only) → (2) site setup menu → (3) log flow cutover + removal of per-compound sites → (4) rotation view.
>
> **Why this order:** the setup menu (Step 2) can only render sites that exist in a catalogue with coordinates, and the log flow (Step 3) can only offer a working set that Step 2 lets the user build. The removal of the old per-compound sites happens in Step 3 — *after* the replacement is live, never before. The rotation view (Step 4) is pure read-side derivation and can only be built once real sites are landing on `dose_logs`.
>
> **Standing constraint for every step:** this feature **reports, it does not recommend**. It shows which sites are fresh and which are rested. It must never suggest where to inject next, never rank sites, never warn. Decision-support, not decision-making.

---

# Step 1 — Site catalogue + user working set (data foundation)

## 1. Goal
Introduce a canonical, coordinate-bearing **site catalogue** (read-only, seeded) and a per-user **working set** table (the sites a given user actually uses, per route), plus the data-access layer for both. No screens change.

## 2. Out of Scope (do NOT)
- Do NOT change any screen, component, route, or nav entry.
- Do NOT remove the existing per-compound injection-site configuration — that is Step 3, after the replacement is live.
- Do NOT touch `dose_logs.injection_site`. It is the entire tracking layer and survives this rework untouched.
- Do NOT add custom / user-defined sites. Catalogue only in v1.
- Do NOT store any recency, freshness, or "days since" value. That is derived at read time in Step 4.
- Do NOT run a destructive migration without confirming with Angus first.

## 3. Design Decisions
Read first: `architecture.md` (invariants), `code-standards.md` (conventions + the one-step rule), `project-overview.md`.

- **Preflight — bind to the live schema.** Before writing code, read the live definitions via the Supabase MCP for: `compounds`, `protocol_compounds`, `dose_logs`, and the current representation of `injection_site` (enum or table — confirm which). Do not work from memory or from this document's description of the schema. Report what you find before creating anything.
- **The site list already exists — extend it, do not replace it.** The app already ships a full list of injection sites. This step does **not** invent a new catalogue. It takes the existing list and adds the metadata the body map needs. Every existing site stays. Nothing is renamed, merged, or dropped.
- **Metadata to add per existing site:** route (`im` / `subq` — a site may be valid for both), side (`left` / `right` / `n_a`), aspect (`anterior` / `posterior` — which silhouette it renders on), and x/y map coordinates.
- **Report before assuming.** Read the live list first. Report back: total count, and any site that (a) can't be cleanly assigned a route, (b) can't be placed on a front or back silhouette, or (c) is a duplicate/near-duplicate of another. Do not guess coordinates for an ambiguous site — surface it to Angus.
- **If the existing list is stored as free text or an enum without a table**, it must be promoted to a proper catalogue table to carry coordinates. Confirm which it is in preflight; propose the migration; get sign-off before applying.
- **Catalogue stays read-only under RLS** (service-role writes only), reproducible via the existing CSV → `build-seed-sql.mjs` → idempotent `ON CONFLICT` pipeline — same pattern as compounds / biomarkers / markers.
- **Working set** is a user-owned join table (user → catalogue site), scoped by route. RLS enabled, policies wrap `(SELECT auth.uid())`, **explicit `GRANT`s** — this project's Supabase does not auto-grant to `authenticated`. Any view declares `security_invoker = true`. Any array-length CHECK uses `COALESCE(array_length(...), 0)`.
- **Compound route.** Each injectable compound needs a route so the log map knows which view to open. Confirm against the live schema whether one already exists in any form before adding. Defaults, user-overridable: `preconcentrated` (oil) → IM; reconstituted peptide → sub-Q; `oral_solid` → no route, no map.
- **Archive, never hard-delete** (`architecture.md`). Removing a site from a working set never alters historical `dose_logs`.

## 4. Implementation
Proposed new files (confirm location/naming against `code-standards.md`):
- Migration + seed for the catalogue table.
- Migration for the user working-set table (RLS + grants).
- `lib/db/injectionSites.ts` — read catalogue, read/write the user's working set.
- Reuse the existing Supabase auth client; do not create a second.

Do not edit: anything under `components/`, anything under `app/(app)/`.

## 5. Check When Done
- [ ] The existing site list is intact — no site renamed, merged, or dropped.
- [ ] Every existing site now carries route, side, aspect, and map coordinates.
- [ ] Any site that couldn't be cleanly assigned a route, placed on a silhouette, or de-duplicated has been reported to Angus, not guessed.
- [ ] Catalogue is read-only under RLS and reproducible from the seed pipeline.
- [ ] Working-set table exists with RLS, `(SELECT auth.uid())` policies, and explicit grants.
- [ ] Account B cannot read account A's working set — through the table *or* any view. Demonstrate the failure, don't assume it.
- [ ] Compound route resolves for every injectable compound; oral compounds have none.
- [ ] `dose_logs.injection_site` untouched. Per-compound site config still present and working.
- [ ] No screen, component, route, or nav entry changed. No new TS/lint errors.

---

# Step 2 — Site setup menu

## 1. Goal
A dedicated screen where the user selects their working set of sites on a body map, per route. This is the only place sites are ever configured.

## 2. Out of Scope (do NOT)
- Do NOT change the log flow yet — that is Step 3.
- Do NOT remove per-compound site config yet — that is Step 3.
- Do NOT build the rotation view (Step 4).
- Do NOT surface this from any compound screen. It lives in settings, standalone.
- Do NOT allow custom site names.
- Do NOT add a bottom-nav tab.

## 3. Design Decisions
Read first: `ui-context.md`, `code-standards.md`, `architecture.md`.

- **Route toggle** at the top: Intramuscular / Subcutaneous. Segmented control, existing pattern.
- **Front and back are both visible simultaneously.** Glutes are posterior, delts anterior — a single silhouette cannot hold a user's IM set. A front/back toggle is not acceptable; it adds a second thing to learn.
- The map shows **every catalogue site for the selected route**. Tapping toggles membership of the working set. Selected and unselected states are visually distinct.
- Working set is per-user, per-route, changeable at any time.
- Body map is a **shared component** — Steps 3 and 4 render the same one in different modes (`select` / `pick` / `recency`). Build it once, here.
- Styling via existing tokens and presets; no hardcoded hex. Amber restraint per `ui-context.md`.

## 4. Implementation
- Route + screen for site setup, reachable from settings.
- New components (confirm names against `code-standards.md`): the shared body-map component, plus the setup screen wrapping it.
- Reads/writes the working set via `lib/db/injectionSites.ts` (Step 1).

## 5. Check When Done
- [ ] User can open the setup menu, toggle IM / sub-Q, and select/deselect sites on a body map showing front and back together.
- [ ] Working set persists and reloads correctly, per route.
- [ ] Deselecting a site does not alter any historical dose log.
- [ ] Body map is a reusable component with a mode prop, not a one-off.
- [ ] Existing tokens/presets used; no hardcoded hex; no new nav tab.
- [ ] Log flow and per-compound site config still behave exactly as before.
- [ ] No new TS/lint errors.

---

# Step 3 — Log flow cutover + removal of per-compound sites

## 1. Goal
Replace site selection in the dose-log flow with a one-tap body map drawn from the user's working set, and **only then** remove injection-site configuration from compounds.

## 2. Out of Scope (do NOT)
- Do NOT remove `dose_logs.injection_site`. It is the tracking layer.
- Do NOT delete any historical site data. Every existing dose log keeps the site it was logged with, even if that site is no longer in the user's working set.
- Do NOT delete anything from the site catalogue.
- Do NOT block a dose log behind setup. Logging always succeeds.
- Do NOT add the draw amount to the log sheet — separate spec, and when it lands it is **computed** from `v_inventory_math`, never stored.
- Do NOT build the rotation view (Step 4).

## 3. Design Decisions
Read first: `architecture.md`, `code-standards.md`, `ui-context.md`.

- **Log sheet gains an "Injection site" section:** the shared body map in `pick` mode, showing **only the user's working set for that compound's route**. One tap selects. Saved to `dose_logs.injection_site`.
- The map **opens on the compound's route automatically** (IM compound → IM sites). The user may switch route if they choose.
- Each site on the log map carries its **factual day-count label** ("2d ago") so the choice is informed at the moment it's made.
- **Oral compounds show no body map at all.** Tablets have no injection site.
- **Empty working set:** show the full catalogue for that route plus a one-line nudge to set up a working set. The dose still logs. Never a blocking gate.
- **Removal is surgical.** Remove per-compound injection-site configuration and the site mechanic it fed in the log flow. Nothing else. Report anything ambiguous rather than guessing.
- **Migration:** for each existing user, take the union of every site configured across all their compounds, sort into IM / sub-Q, and seed it as their initial working set. No tester re-does setup. Idempotent. If a configured site has no clean catalogue match, report it — do not guess.

## 4. Implementation
- Edit the add-compound flow to drop injection-site configuration.
- Edit the dose log/skip flow to render the body map in `pick` mode and write the selected site.
- One-time idempotent migration from per-compound sites → user working set.
- All reads/writes via `lib/db/*`.

## 5. Check When Done
- [ ] No compound, anywhere in the app, asks for or stores an injection site.
- [ ] Logging an injectable dose shows a body map containing only that user's working set for that compound's route, opened on the correct route.
- [ ] Logging an oral dose shows no body map.
- [ ] A user with an empty working set can still log a dose; the full catalogue for that route is offered with a setup nudge.
- [ ] Selected site persists on the `dose_logs` row and reads back in history.
- [ ] Existing per-compound sites migrated into working sets; re-running the migration does not duplicate.
- [ ] No historical dose log has lost its site. Nothing removed from the catalogue.
- [ ] Draw amount not added. No derived value stored.
- [ ] No new TS/lint errors.

---

# Step 4 — Rotation view

## 1. Goal
A view of the user's working set on the body map, shaded by how recently each site was used, so the user can see what's fresh and rotate off it themselves.

## 2. Out of Scope (do NOT)
- Do NOT recommend, suggest, rank, or auto-select a next site. Ever.
- Do NOT use warning language, warning iconography, or a risk score.
- Do NOT store recency, freshness, or "days since" anywhere. Derived at read time from `dose_logs`.
- Do NOT add per-site notes, soreness, or scar-tissue tracking.
- Do NOT add a bottom-nav tab.

## 3. Design Decisions
Read first: `ui-context.md`, `architecture.md` (invariants), `code-standards.md`.

- Shared body map in `recency` mode, plus the IM / sub-Q route toggle — same pattern as Steps 2 and 3.
- **Shading:** amber. Full saturation on the day of injection, one shade lighter per day, reaching a neutral unfilled state at the end of the decay window.
  - **IM decay window: 7 days. Sub-Q decay window: 5 days.** Two named constants in one place — they will be tuned on feel.
- **Every site carries a factual day-count label** ("2d ago", "11d ago"). The colour is heat; the text is fact. This is what keeps amber from reading as a warning. A rested site reads as unfilled + its day count — never "safe", never "ready".
- Recency is computed at read time from `dose_logs`. Nothing derived is stored (`architecture.md` invariant).
- Amber usage here is a deliberate exception to the amber-for-interactive convention — confirm the exact tokens against `ui-context.md` before implementing, and flag if the ramp doesn't exist yet.

## 4. Implementation
- New rotation view rendering the shared body map in `recency` mode.
- Recency query derived from `dose_logs` via `lib/db/*` (read-only).
- Decay windows as named constants.

## 5. Check When Done
- [ ] Rotation view shades each site in the working set in amber by days-since-last-use, one shade lighter per day, across 7d (IM) / 5d (sub-Q).
- [ ] Every site shows a factual day-count label.
- [ ] Route toggle works; front and back both visible.
- [ ] No warning language, warning icon, risk score, ranking, or suggested-next-site anywhere in the feature.
- [ ] No recency value stored — all derived at read time from `dose_logs`.
- [ ] Tokens from `ui-context.md`; no hardcoded hex.
- [ ] No new nav tab; no derived maths stored; no new TS/lint errors.

The body map is a proper anatomical silhouette, not a stick figure or a set of boxes. Front and back views are rendered as clean, correctly-proportioned human outlines with visible muscle-group definition — delts, chest, abs, obliques, lats, glutes, quads, hamstrings, calves — so a site is identifiable by where it sits on the body, not by its label alone. Vector (SVG), single flat fill on the existing token palette, no shading, gradients, or rendered/3D artwork. Site markers sit on the anatomy, not floating over it. The reference standard is a clean anatomy-chart illustration, not a medical render and not a wireframe.
