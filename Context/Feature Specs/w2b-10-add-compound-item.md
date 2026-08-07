# Add Compound Form

## Goal
Restructure the add-to-log form itself. `03-add-compound.md` fixed the picker, the storage gating and the unit defaults, and explicitly deferred the form's layout to part two. This is that work.

The form currently reads as a stack of labelled sections with a lot of surrounding text. It becomes a compact header showing what you are adding, then two or three cards of rows. Everything functions the same. It is simply less to read.

Depends on `01-dose-integrity.md`, `03-add-compound.md`, `08-containers.md` and `13-cycles.md`.

## Out of Scope
- Do NOT change what any field does, what it validates, or what it saves.
- Do NOT change the picker. That was `03-add-compound.md`.
- Do NOT change the time pre-fill behaviour. That was `01-dose-integrity.md` and the field must stay empty until set.
- Do NOT change the unit defaults or the pill toggle. Those were `03-add-compound.md`.
- Do NOT change the storage gating. Also `03-add-compound.md`.
- Do NOT build the cycle mechanics here. This spec only surfaces the cycle option built in `13-cycles.md`.
- Do NOT create new shared/reusable components without flagging and asking us first.
- Do NOT introduce colours, fonts, or styles outside what `ui-context.md` defines.

## Design Decisions

**Sheet header.** Unchanged: Cancel on the left, "Add to log" centred, Add on the right.

**Compound header.** Beneath the sheet header, on one row:
- The container from `08-containers.md` on the left, at a size that reads clearly without dominating.
- The compound name to its right, with the existing category, route and unit line beneath it.
- This replaces the current bordered name card.

**Card one: the dose.** One card, rows rather than labelled sections:
- Route, with the existing IM and SubQ pills on the right
- Dose, with the value and unit
- Schedule
- Starts
- Time, reading "Set time" until the user picks one

Each row is a label on the left and its value or control on the right, with the same height and divider throughout. The current standalone helper text under fields goes away where the row label already carries the meaning.

**Card two: the cycle.** Collapsed by default to a single row, "Cycle this", with a toggle on the right.
- **Off:** that one row is all that shows.
- **On:** the card expands to reveal Pattern and Ends, with a smooth expansion.
- Writes through the same path as `13-cycles.md`. Do not build a second cycle implementation here.
- Someone who does not cycle sees one extra row and nothing more. That is the point of collapsing it.

**Card three: stock.** A single row, "Stock on hand", marked optional, expanding into the existing stock entry. Per `03-add-compound.md` this card appears for injectables only and is absent entirely otherwise.

**Text reduction.** The schedule preview line, currently reading along the lines of "Starts Thu 23 Jul, then Fri 24 Jul, Sat 25 Jul, Sun 26 Jul", is the largest block of text on the sheet. Keep the information but shorten it. Propose the wording. The "Saved to this device for you only" footer stays.

**Validation.** Unchanged in behaviour. Errors surface on the row rather than as a block of text at the bottom of the sheet.

## Implementation
Follow the project structure and conventions in `architecture.md` and `code-standards.md`.

**Work through this ONE STEP AT A TIME.** Implement a step, confirm it builds with no TypeScript or lint errors, then move to the next.

1. List every field on the current form with what it does and validates, so we can prove behaviour is unchanged afterwards.
2. Build the compound header with the container, name and detail line.
3. Rebuild the dose card as rows with a consistent height and divider.
4. Remove helper text that duplicates its row label. List what you removed.
5. Propose shortened wording for the schedule preview line.
6. Build the cycle card, collapsed to one row with a toggle, expanding to Pattern and Ends.
7. Wire the cycle option through the `13-cycles.md` path.
8. Build the stock row, present for injectables only.
9. Move validation errors onto their rows.
10. Re-check every field against the list from step 1 and confirm identical behaviour.

**Deployment / preview:**
- Deploy to a Vercel preview subdomain so we can view it from the subdomain URL. Confirm the preview deployment is live and share the link.

## Check When Done
- [ ] Field inventory captured before any change
- [ ] Every field behaves and validates identically afterwards
- [ ] Sheet header unchanged: Cancel, Add to log, Add
- [ ] Compound header shows container, name and category / route / unit line
- [ ] Old bordered name card removed
- [ ] Dose card contains Route, Dose, Schedule, Starts and Time as rows
- [ ] Row height, padding and dividers consistent throughout
- [ ] Time reads "Set time" and does not pre-fill
- [ ] Duplicated helper text removed and the removals listed
- [ ] Shortened schedule preview wording proposed and approved
- [ ] Cycle card collapsed to one row with a toggle by default
- [ ] Toggling on expands smoothly to Pattern and Ends
- [ ] Cycle writes through the `13-cycles.md` path, no second implementation
- [ ] Stock row present for injectables only
- [ ] Validation errors surface on their row, not as a block at the bottom
- [ ] "Saved to this device for you only" footer retained
- [ ] Picker, unit defaults, pill toggle and storage gating all unchanged
- [ ] No new shared components created without flagging
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Deployed to a Vercel preview subdomain and viewable
- [ ] Built step by step, each step verified before the next (per `code-standards.md`)