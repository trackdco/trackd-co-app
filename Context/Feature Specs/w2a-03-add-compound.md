# Add Compound Flow

## Goal
Rework the flow that runs from opening the compound picker through to saving a compound. Four related problems live in this flow.

The picker is headed "Add to stack" while the form it opens is headed "Add to log", which is already inconsistent and becomes actively confusing once Stacks ships as a real feature. The picker itself is a single flat list under "Popular in comp prep" doing all the browsing work. The stock section offers "Got a vial? Log how much you have left" for oral supplements like Berberine and Creatine, which have no vial. And the unit selector defaults to mg for every compound, including peptides that are almost always dosed in micrograms.

This spec fixes all four. It does not restyle the form's card structure, that comes with the part-two layout work.

Depends on `01-dose-integrity.md` and `02-compound-lifecycle.md` being merged.

## Out of Scope
- Do NOT restructure the add form into the single-card layout described in the original review doc. That is part-two layout work and will get its own spec.
- Do NOT build Stacks. This spec only frees the word "stack" and leaves a place for stacks to appear later.
- Do NOT build cycles or add a cycle option to the schedule section. That is a later spec.
- Do NOT change the time pre-fill behaviour, that is handled in `01-dose-integrity.md`.
- Do NOT change the global mg/mcg default or add a global unit preference. The decision is per-compound defaults only.
- Do NOT change the compound categories or their colour coding. The current colour coding stays exactly as it is.
- Do NOT create new shared/reusable components without flagging and asking us first.
- Do NOT introduce colours, fonts, or styles outside what `ui-context.md` defines.

## Design Decisions
Refer to `ui-context.md` for all styling, spacing, and type. Do not hardcode any of these values.

**Naming.**
- The picker's title changes from "Add to stack" to "Add compound".
- The word "stack" is reserved from here on for the Stacks feature. Audit the codebase for other uses of "stack" in user-facing strings, component names, and route names, and list them so we can decide what to rename.
- The form's title stays "Add to log".

**Picker structure, top to bottom.**
1. Search field, unchanged in behaviour, searching across every compound regardless of category.
2. **Recently used.** A short horizontal row of the compounds the user has added most recently. Cap it at a small number, propose the exact count to us. Omit the section entirely for a new user with no history rather than showing an empty state.
3. **Browse by category.** The full library grouped under its existing categories: Anabolics, Peptides, Ancillaries, Supplements. Each group keeps its existing icon and colour coding.
4. **Make your own**, as it exists today, at the bottom.

- "Popular in comp prep" as a flat catch-all list is removed. If we want a curated list later it becomes one section among the categories, not the whole picker.
- Compounds the user is already running keep their existing checked state.

**Room for stacks.**
- Build the picker so a segmented control can sit above the content later, splitting Compounds from Stacks.
- Do NOT build that control now. Just do not make a structural choice that would require rebuilding the picker to add it. Flag it if the intended structure would.

**Storage section gating.**
- The stock section only appears for compounds whose route means a vial is plausible. Injectables get it. Oral compounds do not.
- Gate on the compound's route and form, not on its category, so a future oral compound in any category behaves correctly.
- If the data model does not currently carry enough information to decide this reliably, say so before implementing a category-based shortcut.
- We only support vial storage. Do not build tablet or capsule storage. If tablet storage already exists in the codebase, leave it in place and tell us where it is.

**Per-compound unit defaults.**
- Each compound in the library carries its own default dose unit.
- Peptides default to mcg. Anabolics default to mg. Set the remaining categories to whatever is conventional for each compound rather than applying a blanket rule, and share the list of assignments for review before applying it.
- The unit is a default, not a lock. The existing pill toggle stays and the user can always override it.
- The user's override is remembered for that compound so they do not re-set it every time.
- This is a library data change plus a form default. It does not change stored dose values and does not require a migration. If you find it would require one, stop and flag it.

## Implementation
Follow the project structure and conventions in `architecture.md` and `code-standards.md`.

**Work through this ONE STEP AT A TIME.** Implement a step, confirm it builds with no TypeScript or lint errors, then move to the next.

1. Audit every user-facing and internal use of the word "stack" and share the list before renaming anything.
2. Rename the picker title to "Add compound" and apply any renames we approve from step 1.
3. Restructure the picker: search, Recently used, browse by category, Make your own. Remove the flat "Popular in comp prep" list.
4. Confirm the structure can later accept a Compounds / Stacks segmented control without a rebuild. Flag it if it cannot.
5. Gate the stock section on route and form so it appears for injectables only. Share your gating logic before implementing if the data model is ambiguous.
6. Propose the per-compound default unit assignments for review.
7. Apply the approved unit defaults and make the pill toggle remember the user's override per compound.

**Deployment / preview:**
- Deploy to a Vercel preview subdomain so we can view and test it from the subdomain URL. Confirm the preview deployment is live and share the link.

## Check When Done
- [ ] Audit of the word "stack" shared before any rename
- [ ] Picker title reads "Add compound"
- [ ] Form title still reads "Add to log"
- [ ] Search returns results across every category
- [ ] Recently used row present, capped, and omitted entirely for a user with no history
- [ ] Library browsable by Anabolics, Peptides, Ancillaries, Supplements
- [ ] Existing category icons and colour coding unchanged
- [ ] "Popular in comp prep" flat list removed
- [ ] Make your own still present at the bottom
- [ ] Already-running compounds still show the checked state
- [ ] Structure confirmed able to accept a Compounds / Stacks segmented control later
- [ ] Stock section appears for injectable compounds
- [ ] Stock section does not appear for Creatine, Berberine, or any oral compound
- [ ] Gating is based on route and form, not category
- [ ] No tablet or capsule storage built
- [ ] Peptides default to mcg
- [ ] Anabolics default to mg
- [ ] Full unit assignment list reviewed and approved before applying
- [ ] Pill toggle still present and can override any default
- [ ] Unit override remembered per compound
- [ ] No stored dose values changed and no migration run
- [ ] No new shared components created without flagging
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Deployed to a Vercel preview subdomain and viewable
- [ ] Built step by step, each step verified before the next (per `code-standards.md`)