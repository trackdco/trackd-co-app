# Spec — Per-Compound Dosing, Schedule & Injection-Site Rotation

> Agent: read `AI-workflow-rules.md`, `architecture.md`, `code-standards.md`, `ui-context.md`, and `project-overview.md` BEFORE touching code. Then propose the exact file plan (real paths from `architecture.md`) and the data-model diff, and wait for confirmation. Implement **one step at a time** and verify each step (no TS/lint errors, builds clean) before moving to the next. Do not batch steps.

---

## 1. Goal
Make injection-site rotation a property of each compound. The user **sets** the rotation once, in the add-compound sheet. It then surfaces in only two places: a one-line "next site" text preview on the home card, and the **log sheet** (opened from the `+`), where it shows the rotation and the site the next dose should go into. Logging confirms or overrides that site and advances to the next one.

---

## 2. Out of Scope — do NOT
- Do **NOT** build any global / app-wide rotation. Rotation lives on the compound. (A SubQ-only user must never see IM sites, and vice-versa — this falls out naturally because each compound only knows its own method.)
- Do **NOT** give rotation its own screen, tab, or standalone "cycle" display component. It is **set** in the add-compound sheet and only reappears **inside the log sheet**, plus the one-line next-site text on the home card. (This removes the standalone rotation/cycle treatment from the earlier draft.)
- Do **NOT** show the rotation, site selection, or "next site" anywhere for `method = oral` compounds. Oral = dose + schedule only.
- Do **NOT** build the dose calculator here. Use a plain numeric dose field; the calculator is a separate feature.
- Do **NOT** advance the rotation by date or by day. It advances **only when a dose is logged**.
- Do **NOT** force every IM (or every SubQ) compound to share sites. Each compound's rotation is independent.
- Do **NOT** add new shared/global components without flagging it first (per `code-standards.md`).
- Do **NOT** add backend or remote storage. Persist to **local storage**, matching the existing pattern (same as the Shortcuts reorder state).
- Do **NOT** redesign the bottom nav, the center plus button, or the add-compound entry point.

---

## 3. Design Decisions

### 3.1 Compound model
```ts
type InjectionMethod = 'oral' | 'subq' | 'im';
type DoseUnit = 'mg' | 'mcg' | 'iu' | 'ml';

type Schedule = {
  cadence:
    | { type: 'daily' }
    | { type: 'everyOtherDay' }            // EOD
    | { type: 'everyNDays'; n: number }    // e.g. n=3
    | { type: 'daysOfWeek'; days: number[] }; // 0=Sun..6=Sat, e.g. [1,4] = 2x/week Mon+Thu
  timeOfDay: string; // 'HH:mm', the default log time
};

type Compound = {
  id: string;
  name: string;
  method: InjectionMethod;
  dose: number;
  unit: DoseUnit;
  schedule: Schedule;
  rotationSites: string[];   // ordered; the ticked sites in cycle order. Empty for oral.
  rotationIndex: number;     // internal pointer = the NEXT site. 0 for oral.
};
```

### 3.2 Method drives the add flow
- `oral` → no site catalog, no rotation section anywhere.
- `subq` → SubQ site catalog checkboxes.
- `im` → IM site catalog checkboxes.

### 3.3 Seeded data — static catalog file, referenced in `architecture.md`
**(a) Injection-site catalog** (the checkbox source; each side is its own entry so the rotation steps through individual sites):
- **IM:** Right Delt, Left Delt, Right Glute, Left Glute, Right Ventroglute, Left Ventroglute, Right Quad (VL), Left Quad (VL)
- **SubQ:** Belly – Upper Right, Belly – Upper Left, Belly – Lower Right, Belly – Lower Left, Right Flank, Left Flank, Right Thigh, Left Thigh, Right Tricep, Left Tricep

**(b) Starter compound list** — name → default method → default unit; all pre-filled but editable, and the user can add a fully custom compound.

| Compound | Default method | Default unit |
|---|---|---|
| Testosterone (any ester) | im | mg |
| Trenbolone | im | mg |
| Nandrolone (Deca) | im | mg |
| Boldenone (EQ) | im | mg |
| Masteron | im | mg |
| Primobolan | im | mg |
| HCG | subq | iu |
| BPC-157 | subq | mcg |
| TB-500 | subq | mcg |
| Ipamorelin | subq | mcg |
| CJC-1295 | subq | mcg |
| Semaglutide | subq | mg |
| Tirzepatide | subq | mg |
| Oxandrolone (Anavar) | oral | mg |
| MK-677 | oral | mg |

> Representative, not exhaustive — make it trivial to extend, and allow custom compounds.

### 3.4 Add-compound flow (ordered sections in the sheet)
1. **Compound** — pick from the starter list (with search) or type a custom name. A known one pre-fills method + unit (both editable).
2. **Method** — `Oral / SubQ / IM`. Drives everything below.
3. **Dose** — numeric amount + unit. (Plain field; calculator out of scope.)
4. **Schedule** — cadence picker (`Daily / Every other day / Every N days / Specific days`) + time-of-day.
5. **Rotation** — *hidden when method = oral.* Checkbox list of the catalog sites for that method. The user ticks the sites they pin into for this compound. **Ticked order = cycle order.** Set `rotationIndex = 0` on save. This is the **only** place rotation is set.

### 3.5 Where rotation lives (the relocation)
Rotation has **no standalone surface**. After it's set in the add sheet, it appears in exactly two places:
- **Home card** — a one-line text preview of where the next dose goes (see 3.6).
- **Log sheet** — the interactive site selector (see 3.7).

The `rotationIndex` pointer is an internal engine that powers both; it is never shown as its own "cycle" UI.

### 3.6 Home card (preview, before pressing `+`)
For each compound due that day:
- Injectable: shows dose + scheduled time + a text line for the next site, e.g. **"Next: Right Delt"** (`rotationSites[rotationIndex]`).
- Oral: dose + time only. No site.

The next-site text must always be present for injectables, before the user opens the log sheet.

### 3.7 Log sheet (the `+` button — rotation's interactive home)
Opening the log sheet shows, **pre-filled**:
- Dose (editable, defaults to the compound's dose).
- Time (defaults to scheduled time, or now — editable).
- **Site (injectables only):** the compound's selected `rotationSites`, with the **next site indicated and preselected**. The user confirms it or picks a different one from that compound's sites.

On confirm: write the log entry, then **advance the pointer to the slot after the site actually logged** → find the logged site's index in `rotationSites`, set `rotationIndex = (thatIndex + 1) % length`. The home card's next-site text updates immediately.

### 3.8 Motion / animation (apply throughout)
Everything here should feel professional, clean, and consistent with the rest of the app — reuse the existing transition tokens (match the nav selection fade timing/easing per `ui-context.md`); do not invent one-off durations.
- Log sheet **animates in** (slide-up + fade), not an instant pop.
- Site selection: the selected/next-site indicator transitions smoothly (no hard snap) — animate the highlight/opacity.
- Home next-site text **fades** when it updates after a log, rather than jumping.
- Add-flow sections that appear/hide on method change (e.g. the rotation section showing for SubQ/IM, hiding for Oral) animate their reveal/collapse.

### 3.9 Styling — per `ui-context.md` (Obsidian)
Cool near-blacks, Playfair Display headings, Instrument Sans UI text, **JetBrains Mono for dose + site values**. Amber `#E2A33D` with restraint: ticked checkboxes, selected method, the next-site indicator. Unselected stays gray. Hairline borders throughout.

---

## 4. Implementation
Map to the real tree per `architecture.md` and confirm before coding. Logical units:

- **Data + storage layer** — extend the compound type/store to 3.1; local-storage persist; migrate existing compounds to the new shape (infer `method` or default `oral`, empty `rotationSites`, `rotationIndex: 0`, default daily schedule).
- **Seed catalog file** — static export of the site catalog (3.3a) and starter compounds (3.3b).
- **AddCompoundSheet** (extend) — Method selector, Dose+unit, Schedule picker, and the conditional Rotation checkbox section (animated reveal per 3.8).
- **RotationPicker** (new) — the checkbox builder used **only inside AddCompoundSheet**; emits an ordered `string[]`. Not used for display anywhere else.
- **CompoundCard** (home) — due calc from `schedule`; dose, time, and the next-site text line; `+` to open the log sheet.
- **LogDoseSheet** (new/extend) — pre-filled dose/time/site; the site selector with next-site preselected; pointer advance on confirm; entrance + selection animations per 3.8.

### Build order (one step at a time, verify each)
1. Data model + storage + migration. Verify existing compounds still load.
2. Seed catalog file. Verify it imports and lists correctly.
3. AddCompoundSheet: method + dose/unit + schedule + conditional RotationPicker (with animated section reveal). Verify a SubQ, an IM, and an oral compound each save the right shape (oral has no sites).
4. Home CompoundCard: due calc + next-site text line + fade on update. Verify cards show the correct next site; oral cards show none.
5. LogDoseSheet: animated entrance, prefilled site with next-site preselected, override dropdown/selector, pointer advance. Verify Test (delt rotation) and Tren (glute rotation) advance their own cycles independently, including on override.
6. Edge cases (below) + motion polish pass. Verify.

### Edge cases
- Injectable saved with **zero** ticked sites → block save with a hint, OR treat as "no rotation" (no site shown). Pick one and note it.
- Single-site rotation → pointer stays on that site each time.
- Editing `rotationSites` later → clamp `rotationIndex` into range.
- Removing a site mid-cycle → pointer must not crash.
- Two injectables due the same day → fully independent cards and cycles.

---

## 5. Check When Done
- [ ] Rotation is per-compound; there is no global rotation and no standalone rotation screen/tab/component.
- [ ] Rotation is **set only** in the add-compound sheet; it appears again **only** in the log sheet, plus the one-line next-site text on the home card.
- [ ] Oral compounds show no method-site UI, no rotation, and no site anywhere.
- [ ] SubQ-only and IM-only compounds only ever show their own method's sites.
- [ ] Add flow captures, in order: compound, method, dose+unit, schedule, and (injectables only) the ordered ticked-site rotation.
- [ ] Home card shows dose + time and, for injectables, the correct next-site text before the `+` is pressed.
- [ ] Log sheet pre-fills dose/time and preselects the next site; the selector is limited to that compound's sites.
- [ ] Logging advances the pointer to the slot after the site actually logged; home next-site text updates immediately; override behaves correctly.
- [ ] Test and Tren (or any two injectables) advance their rotations independently.
- [ ] Log sheet animates in; site selection and the home next-site text transition with smooth fades; method-driven sections animate their reveal/collapse — all consistent with the app's existing motion (`ui-context.md`).
- [ ] State persists in local storage across reloads; existing compounds migrated without loss.
- [ ] Styling matches `ui-context.md` (mono data, amber-with-restraint, hairline borders).
- [ ] No new shared components added without flagging; no TS or lint errors; build is clean.

if any of this has been completed, or you run into any conflicts or errors just do what you think is best in the given context.