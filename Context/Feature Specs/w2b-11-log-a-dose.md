# Log A Dose

## Goal
Bring the log-a-dose sheet into line with the restructured add-compound form. Same compound header, same row-based cards, same reduction in text. Logging is the thing people do most often in this app, so it should be the fastest and quietest screen in it.

This is the last part-two spec. Build it after `17-add-compound-form.md` so the two match.

Depends on `01-dose-integrity.md`, `08-containers.md` and `17-add-compound-form.md`.

## Out of Scope
- Do NOT change what logging does to the data, or which date it writes to. That is `01-dose-integrity.md` and it must not regress.
- Do NOT change the injection site body map. It stays exactly as it is and opens from this sheet unchanged.
- Do NOT change the draw amount calculation.
- Do NOT add a calculator, a stock adjustment, or anything else that is not currently on this sheet.
- Do NOT create new shared/reusable components without flagging and asking us first.
- Do NOT introduce colours, fonts, or styles outside what `ui-context.md` defines.

## Design Decisions

**Sheet header.** Cancel on the left, the sheet title centred, the confirm action on the right. Keep the confirm verb short and consistent with the add sheet's "Add".

**Compound header.** Identical treatment to `17-add-compound-form.md`: the container on the left, the compound name to its right, the category, route and unit line beneath. Reuse that component rather than rebuilding it.

**Card one: the dose.** Rows, same treatment as the add form:
- Dose, pre-filled from the compound's schedule and editable for this one log
- Draw amount, shown in insulin units with the millilitre equivalent, for injectables only. Read-only, and carrying the amber accent since it is the figure the user acts on.
- Date, defaulting to the **selected** day, never to today when a date context exists
- Time, reading "Set time" until the user picks one

**Card two: the site.** A single row showing the currently chosen site, or a prompt when none is set. Tapping it opens the **existing injection sites body map sheet, entirely unchanged**. Injectables only, absent for orals and powders.

**Card three: the note.** A single tappable field reading "Add a note", opening the existing note input. Optional and always last.

**Text reduction.** Same principle as the add form. Any helper text a row label already implies is removed. The "Saved to this device for you only" footer stays.

**Editing a dose already logged.** The same sheet is used, pre-filled with what was logged, with the confirm verb changed appropriately. It must never create a second entry.

**Stack members.** When a compound logged from inside a stack row opens this sheet, it behaves identically. The stack is a display grouping and changes nothing about logging an individual member.

## Implementation
Follow the project structure and conventions in `architecture.md` and `code-standards.md`.

**Work through this ONE STEP AT A TIME.** Implement a step, confirm it builds with no TypeScript or lint errors, then move to the next.

1. List every field on the current sheet with what it does, so behaviour can be proven unchanged afterwards.
2. Reuse the compound header component from `17-add-compound-form.md`.
3. Rebuild the dose card as rows, matching the add form's treatment exactly.
4. Confirm the date defaults to the selected day, and test from a past day on the week strip and from the calendar.
5. Confirm the time field does not pre-fill.
6. Build the site row, opening the existing body map sheet untouched, injectables only.
7. Build the note row.
8. Remove helper text that duplicates its row label. List what you removed.
9. Verify editing an already-logged dose updates rather than duplicating.
10. Verify logging a compound from inside a stack row behaves identically.
11. Re-check every field against the list from step 1.

**Deployment / preview:**
- Deploy to a Vercel preview subdomain so we can view it from the subdomain URL. Confirm the preview deployment is live and share the link.

## Check When Done
- [ ] Field inventory captured before any change
- [ ] Every field behaves identically afterwards
- [ ] Sheet header has Cancel, title and a short confirm verb
- [ ] Compound header component reused from `17-add-compound-form.md`, not rebuilt
- [ ] Dose card rows match the add form's treatment exactly
- [ ] Dose pre-fills from the schedule and is editable for this log only
- [ ] Draw amount shown in insulin units with the millilitre equivalent
- [ ] Draw amount read-only and carrying the amber accent
- [ ] Draw amount absent for non-injectables
- [ ] Date defaults to the selected day, verified from the week strip and the calendar
- [ ] Time reads "Set time" and does not pre-fill
- [ ] Site row opens the existing body map sheet completely unchanged
- [ ] Site row absent for orals and powders
- [ ] Note row present, optional and last
- [ ] Duplicated helper text removed and the removals listed
- [ ] "Saved to this device for you only" footer retained
- [ ] Editing a logged dose updates it and never creates a second entry
- [ ] Logging a stack member behaves identically to logging any compound
- [ ] Draw amount calculation unchanged
- [ ] Nothing added that is not currently on this sheet
- [ ] No new shared components created without flagging
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Deployed to a Vercel preview subdomain and viewable
- [ ] Built step by step, each step verified before the next (per `code-standards.md`)