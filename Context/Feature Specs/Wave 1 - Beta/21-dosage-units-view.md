# Feature Spec — Per-Dose Draw

> **Number:** 21. Slug: `per-dose-draw`.
> **Status:** BUILT (2026-07-17) — founder go-ahead given after the preflight report. Not yet merged/deployed; device pass outstanding.
> **Depends on:** `v_inventory_math`, live inventory (storage) data, today's-log read on the home dashboard.
> **Format note:** reconcile headings/front-matter against `01-design-system` before commit.

---

## Preflight — ANSWERED (2026-07-17, live schema via Supabase MCP)

**Outcome: no schema change. No new/altered view. No migration.** The spec did not
grow. Findings, in order:

1. **Per-dose volume already exists** — `v_inventory_math.ml_per_dose`
   (`round(planned_dose_base / concentration_per_ml, 3)`), plus `units_per_dose`
   (already `mL × 100` — Design Decision 4 was pre-baked) and `units_per_dose_oral`.
2. **The VIEW does not resolve a current item per compound** — its grain is one row
   per inventory *item*, with **no `is_active` filter at all** (it emits archived
   vials too). But the resolution **exists cleanly in the app layer**: `vialOnDate`
   (`lib/home/protocolSync.ts`), deterministic (`acquired_on desc, created_at desc,
   limit 1`), already the single shared rule for the dose-log write path and the log
   sheet's read. So this is **not** Step 1 and the spec does not grow.
   - Caveat (noted, not fixed — out of scope): "one active vial per compound" is
     **app convention, not a DB guarantee** — no unique index; only `addStockItem`'s
     own best-effort archive-priors step. Live data currently holds it (0 compounds
     with >1 active vial).
3. **Discriminator confirmed** (CHECK `inv_type_fields`). Concentration per type:
   `reconstituted` → `total_amount / bac_water_ml`; `preconcentrated` →
   `concentration_mg_per_ml`; `oral_solid` → concentration **NULL** ⇒ `ml_per_dose`
   NULL. "No mL for orals" is already the DB's behaviour, not a UI suppression.
4. **`iu` path confirmed** — concentration derives with **no unit-specific branch**,
   so an iu vial yields **iu/mL** and divides out to mL identically. Note the CHECK
   allows `base_unit ∈ {mg, iu}` only for `reconstituted` (correct: HGH/hCG ship as
   powder). ⚠️ **Zero `iu` rows exist in live data** (all 24 items are `mg`), so this
   path is covered by test vectors, not production data.
5. **The today's-log is NOT a Postgres select** — the spec's premise was wrong. It is
   computed **client-side** in `HomeScreen` from the device-local stack + dose logs,
   and the dashboard's server component never touches inventory. So Step 3 had **no
   select to add columns to**; the draw needed its own server read. This is why the
   feature is not UI-only.
6. **`security_invoker` + grants** — `v_inventory_math` is already
   `security_invoker=true` with `SELECT` to `authenticated`. No view was added or
   altered, so this stayed a no-op.

### Original preflight items

Nothing below is written until these are confirmed against the live project, not the docs.

1. **Does `v_inventory_math` already expose per-dose volume?** Architecture says mL/units-per-dose is a derived field in the view. Confirm the exact column name and that it is expressed as volume (mL) for reconstituted and preconcentrated items.
2. **Does the view resolve a *current inventory item per compound*?** The draw needs the concentration of the specific vial being drawn down. Whatever the depletion maths (remaining / doses-remaining / projected-empty) already treats as the active item for a compound is the same item this feature reads. Confirm that resolution exists and is deterministic. **If it does not exist cleanly, building it is Step 1 and the spec grows.**
3. **Inventory type discriminator + concentration exposure.** Confirm the three-way union field (`reconstituted` / `preconcentrated` / `oral_solid`) and how concentration is surfaced per type through the view.
4. **Base unit path.** Confirm items resolving to `iu` (e.g. HGH, hCG) carry concentration as `iu/mL` and flow through the same volume maths. This feature must not assume `mg`.
5. **Today's-log read.** Confirm the source query for the home dashboard's today list (computed from schedules + logs, never stored) and whether it already joins inventory or needs the view added to its select.
6. **Grants + RLS.** If any view is added or altered, confirm `security_invoker = true` and that `public` grants ship with it.

---

## Goal

On the home dashboard's *today's log*, each dose row tells the user how much to draw from their vial for that dose, so they never re-open the reconstitution calculator to work it out.

Row becomes: **compound name · dose amount · time · draw**, with the draw sitting immediately next to the time.

The draw is computed at read time from the backing vial's concentration and the logged/scheduled dose. Nothing new is stored. No new user input is required at add-compound or add-vial time.

---

## Out of scope (do not let these creep in)

- **Standalone reconstitution calculator.** Unchanged. It stays the *hypothetical* planning tool (throwaway inputs, before you own a vial). This feature is the *real-vial* readout. Two different jobs.
- **Other surfaces.** v1 is the home today's-log only. Log-a-dose screen and protocol/compound detail are deferred, not built here.
- **New storage/inventory input fields.** None added — unless Preflight #2 proves current-item resolution genuinely requires it, in which case it is flagged and scoped explicitly, not slipped in.
- **Oral-solid volume.** Oral solids have no draw volume; they show a tab/cap count (or nothing) — no mL, no units.
- **Any recommendation.** No suggested dose, no suggested next site. This reports arithmetic on the user's own dose and vial. Decision-support, never decision-making.
- **Mandatory vial picker.** Multi-vial resolution is automatic; a switch is optional (see Design Decisions), never a gate.

---

## Design decisions (locked)

1. **Requires a vial. No vial → no draw.** Draw = dose ÷ concentration, and concentration is a property of the physical vial. With no vial in storage there is no concentration and therefore no number to show. This is arithmetic, not a choice. Handling: draw slot renders **empty**, with a faint tappable **"add stock"** affordance routing to the storage add-flow. Logging a dose is **never** blocked by the absence of a draw.

2. **Insulin-syringe units are primary; mL is secondary.** Display format: `50u (0.5 mL)`. The user thinks in pin graduations; mL is the precise reference figure.

3. **Label is "u" / "units" (syringe graduations), never "IU".** IU (international units) is a *dose-potency* measure (e.g. HGH at 2 IU). Syringe "units" are a *volume graduation* (100 per mL on a U-100 pin). These are different things and must never be conflated in copy — conflating them builds a dosing error into the tool. The draw label refers only to syringe graduations.

4. **U-100 assumption.** Syringe units = mL × 100. Standard U-100 insulin syringe. (U-40/U-50 pins exist but are non-standard for this use; out of scope for v1.)

5. **Rounding is display-only.** **CONFIRMED (2026-07-17): syringe units to the nearest whole unit, mL to 2 decimal places as the precise figure.** A U-100 pin has no half-graduations, so a decimal unit would imply a precision you cannot draw. Display rounding never feeds back into any stored dose. **One guard:** a real but sub-graduation draw keeps its first significant digit rather than rounding to a flat `0u` — "0u" would read as *draw nothing* for a dose that genuinely has volume.

6. **Type-aware rendering** (driven by the existing discriminated union, no new logic):
   - `reconstituted` → volume draw (`u` + mL)
   - `preconcentrated` → volume draw (`u` + mL)
   - `oral_solid` → count only (e.g. `2 tabs`), no volume
   - no backing vial → empty + "add stock"

7. **No stored derived values.** The draw is read from `v_inventory_math` (or a companion view) at read time. Inventory edits, undos, and skips reflow the draw automatically. Consistent with the never-store-derived invariant.

   **Refined at build (2026-07-17, Adrian's call).** The view's `ml_per_dose` is bound
   to the **planned** dose (`protocol_compounds.dose_amount`) — the view has no per-log
   grain. But a logged dose carries its own **editable `amount`**, so rendering the
   view's figure beside an edited amount would put **two disagreeing numbers on one
   row** — precisely the dosing error D3 exists to prevent. So: the genuinely derived
   quantity, **`concentration_per_ml`, still comes ONLY from the view and is never
   recomputed**; the division by the row's own dose happens in `lib/home/draw.ts`.
   Where the row's dose equals the planned dose the result is **identical** to
   `ml_per_dose` (same formula, same rounded concentration as its basis) — **verified
   against all 16 live vial rows**, so there is no drift. Documented as a narrow,
   deliberate carve-out in `architecture.md` → Invariant 1 rather than left as silent
   drift.

8. **Concentration resolution is automatic, not a binding step.** The feature reads whatever inventory item the depletion maths already treats as current for that compound. The user does not bind a dose to a vial. When multiple open vials exist at different concentrations, the display uses the resolved-current item and *may* offer a small tappable label to switch — a switchable display, not a mandatory picker.

---

## Implementation steps (backend before frontend)

1. **Preflight** — run all six checks above against the live schema via MCP. Do not proceed until #1 and #2 are answered.
2. **View** — if per-dose volume + current-item resolution are already exposed, no schema change; read them. If current-item resolution is missing, add/extend a `security_invoker = true` view exposing resolved per-dose draw volume + inventory type per active dose, with grants shipped. No derived storage, no depletion triggers.
3. **Today's-log read** — ~~ensure the home today list select carries per-dose draw volume (mL) and inventory type from the view.~~ **Corrected at build:** there is no such select — Preflight #5 found the today's-log is computed **client-side** from the device stack + dose logs, and the dashboard's server component never touches inventory. So this step became a **dedicated server read** (`resolveDrawSources`) that resolves the selected day's vial via `vialOnDate` and returns its view-derived concentration + inventory type + oral strength per active dose.
4. **UI — dose row** — add the draw slot next to the time. Format per Design Decision 2/3/6. Type-gate the render.
5. **Fallback states** — no vial → empty slot + faint "add stock" tap. Multiple vials → resolved-current with optional switch label.
6. **Copy audit** — verify TGA framing (markets the tracking readout, not dosing guidance), the coaching line (reports, never recommends), and the "u" vs "IU" label correctness.

---

## Acceptance criteria

Ticked = verified. **Every tick below is code/DB-level** (typecheck, lint, prod build,
test vectors, and parity against live rows). **Nothing has been rendered in a browser
yet** — the today's-log sits behind auth with no `/preview` harness, so the on-device
pass is Adrian's, as with Spec 20.

- [x] On the home today's log, a dose row with a backing vial shows the draw next to the time. *(Inline at the end of the `dose · time` line; the full query chain resolves a vial + concentration for every real compound in live data.)*
- [x] Draw displays syringe units (labelled `u`, not `IU`) as primary, mL as secondary. *(`50u (0.5 mL)`; units in `text-text-primary`, mL muted. Copy audit: no `IU` in any user-visible string.)*
- [x] `reconstituted` and `preconcentrated` both produce a volume draw; `oral_solid` shows a count with no volume. *(Live `Ligandrol 10mg` from `20mg` tabs → `0.5 tabs`. Reads "caps" for capsules.)*
- [x] With no backing vial, the draw slot is empty, an "add stock" tap is present, and logging the dose still works. *(Routes to `/protocol?tab=stock` — the Stock tab, not Plan. Gated on `drawsResolved` so it can't claim "no vial" before the read lands. The tick is untouched.)*
- [x] `iu`-base compounds (HGH, hCG) produce a correct draw through the same maths. **⚠️ By test vector, not live data** — zero `iu` rows exist in production (`HGH 2iu @ 20iu/mL → 10u (0.1 mL)`; `hCG 250iu @ 1666.67iu/mL → 15u (0.15 mL)`). Worth a real vial on the device pass.
- [x] U-100 conversion applied (units = mL × 100); rounding is display-only; mL is the precise figure. *(Whole units + mL 2dp, confirmed. Nothing written back.)*
- [x] The value is computed at read time; nothing derived is stored; an inventory edit/undo reflows the draw with no extra action. *(No new columns/tables. Re-reads on day change, due-set change, and window focus — so adding a vial on the Protocol tab and returning fills the slot without a reload.)*
- [x] Multiple open vials resolve to the inventory maths' current item; any switch is optional, never a required step. *(Resolution is `vialOnDate`, the same rule the dose-log write path uses — so a row prices against exactly the vial its dose would draw down. **The optional switch was deliberately NOT built** — see Out of scope below.)*
- [x] Any new/altered view is `security_invoker = true` with grants shipped; RLS remains the only row gate. *(**No view was added or altered.** The read uses the session client; RLS is the gate.)*
- [x] No dose recommendation, no next-site suggestion anywhere in the feature. *(Reports arithmetic on the user's own dose and vial. Copy audit clean.)*

### Deliberately not built

- **The D8 vial-switch label.** D8 says the display "*may*" offer it and it is "never a
  gate". `addStockItem` archives prior vials on every add, so **multiple open vials at
  different concentrations is not reachable today** (0 in live data). Building a
  switcher for an unreachable state is scope creep. Adrian's call, 2026-07-17.

### Open / carried forward

- **Device pass** — render the row on a real phone (Adrian). Ideally with a real `iu`
  vial, the one path with no production coverage.
- **Not a bug, but worth knowing:** "one active vial per compound" has no DB constraint
  behind it (see Preflight #2). Should that convention ever break, a row would price
  against `vialOnDate`'s pick — deterministic, but not necessarily the vial the Stock
  card shows. Out of scope here.