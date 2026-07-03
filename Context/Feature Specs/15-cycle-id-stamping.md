# Feature Spec — 02-cycle-id-stamping
*Agent-ready. Behaviour and data only. Paste into a fresh Claude Code chat. One spec = one chat.*

---

## §0 — Preflight (do this BEFORE writing anything)

- [ ] Read the six canonical files + `Context/next-tasks.md`.
- [ ] Using the **Supabase MCP**, dump the live definition of every entry table: `journal_entries`, `lab_panels`, `biomarker_results`, `marker_readings`, `weight_logs`, `body_metrics`, and `cycles`. For each, report: does a `cycle_id` column exist? Is it nullable? Is it currently populated (count NULL vs non-NULL rows)?
- [ ] Confirm the stack facts from the template (proxy.ts, sb_ keys, security_invoker, explicit grants, COALESCE array checks, `(SELECT auth.uid())`).
- [ ] Locate every insert path: `app/(app)/progress/actions.ts` (saveJournalEntry, addBloodworkPhoto, marker writes), `app/(app)/weight/actions.ts`, and any others that create these rows.
- [ ] State your plan back to me and wait for "go".

## Problem
The product's entire moat is longitudinal, per-cycle data (design principle #6). Today only `dose_logs` and `inventory_items` are cycle-tied (via a NOT-NULL chain through `protocol_compounds.cycle_id`). Journal entries, bloodwork panels, side-effect/subjective markers, and weight are written with **no cycle association** — the columns are either nullable-and-never-set or absent entirely, and the live DB confirms every journal entry and every lab panel currently has `cycle_id = NULL`. This is a silent, compounding, **unbackfillable** loss: every entry created during beta becomes permanently impossible to attribute to a cycle for cross-cycle comparison. It must stop before more beta data accumulates.

## Goal
Every user entry created while a cycle is the active context is stamped with that `cycle_id` at insert time, so any cycle can later return its complete history across all entry types.

## Behaviour (from the data's point of view)
1. The app has a single, unambiguous notion of **"the current cycle context"** — the cycle whose data the user is currently viewing/adding to (see Open Decisions; this must be resolved in §0, not guessed).
2. On insert of a journal entry, bloodwork panel, marker reading, or weight log: if a current cycle context exists, stamp its `cycle_id` onto the row. If the user is genuinely outside any cycle (no active/selected cycle), the row is written with `cycle_id = NULL` (a legitimate "logged off-cycle" state, not a bug).
3. `biomarker_results` are NOT stamped directly — they attach via `panel_id → lab_panels.cycle_id`. Once the panel is stamped, results inherit the cycle transitively. Confirm this chain holds; add nothing to `biomarker_results`.
4. Querying a cycle returns all rows across all entry types whose `cycle_id` matches (plus its dose/inventory rows, which already work).
5. Editing a cycle's dates does NOT re-derive associations — the stamp is explicit and stable. (This is precisely why we stamp rather than derive by date range: beta allows overlapping/unlimited cycles, so a date-range guess would be ambiguous.)

## Data model changes
- Confirm/keep nullable `cycle_id` (FK → `cycles(id)`, `ON DELETE SET NULL`) on `journal_entries` and `lab_panels` (columns exist per audit; verify FK + index).
- **Add** nullable `cycle_id` (FK → `cycles(id)`, `ON DELETE SET NULL`) + index to: `marker_readings`, `weight_logs`, `body_metrics` — unless §0 finds `marker_readings` is best stamped transitively via its `entry_id → journal_entries` (if every marker reading is always tied to a journal entry, stamp the journal and inherit; if markers can be logged standalone, they need their own column). Resolve in §0 and state which.
- Add an index on each new `cycle_id` for cycle-scoped queries.
- No new grants needed (existing owner RLS on these tables already covers the added column); confirm this.
- Nullable, not NOT NULL: off-cycle logging is valid, and a hard NOT NULL would break inserts when no cycle is active.

## Open architectural decisions (surface, do NOT guess)
1. **What is "the current cycle context"?** The single-active-cycle unique index is commented out for beta, so multiple cycles can be active at once. The app therefore needs an explicit "current cycle" selector/context (e.g. a selected-cycle stored in app state / URL / a `current_cycle_id` on the session). Identify what already exists; if nothing does, propose the minimal mechanism and stop for my decision. **Do not assume "the one active cycle."**
2. **`marker_readings` / `body_metrics` linkage** — own column vs transitive via journal (see Data model). State the finding.
3. **Backfill of existing NULL rows** — do NOT auto-run. Propose a *separate, clearly-labelled optional* migration that assigns a cycle only where exactly one cycle's date range contains the entry's timestamp, and leaves NULL where zero or multiple match. I decide whether to run it. (Beta has few testers, so this is low-value; correctness of *new* writes is the priority.)

## Out of scope (do NOT build)
- Multi-cycle comparison UI (paid feature, later).
- Any cycle-selector visual design — behaviour only; visuals defer to `ui-context.md`.
- Retroactive analytics / trend computation.

## Acceptance criteria
- [ ] A new journal entry, bloodwork panel, marker reading, and weight log created while a cycle is the current context each carry that cycle's `cycle_id` (verify live via MCP after a test insert).
- [ ] The same entries created with no active cycle write `cycle_id = NULL` without error.
- [ ] `biomarker_results` resolve to a cycle through their stamped panel.
- [ ] A single query returns a cycle's full cross-type history.
- [ ] No derived value was stored and no depletion trigger was added.
- [ ] `progress-tracker.md` updated.

## Dependencies
None. Do this first — it's actively costing data every day.
