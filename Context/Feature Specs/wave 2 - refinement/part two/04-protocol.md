# Protocol Page

## Goal
Collapse the Plan and Stock tabs into one page. Protocol becomes the place you see everything you are running: your containers with their stock levels, your stacks, your week at a glance, and your cycles. No tabs, one scroll.

Protocol is for viewing and editing. **Logging never happens here.** The dashboard has a selected date and Protocol does not, so a log action from this page would have to assume today, which is exactly the bug `01-dose-integrity.md` exists to remove.

Depends on `08-containers.md`. Sections for stacks and cycles are placeholders until `12-stacks.md` and `13-cycles.md` merge.

## Out of Scope
- Do NOT add any logging action to this page, including on stacks. Tapping a stack may offer to jump to the dashboard, but must not log.
- Do NOT build stack creation or editing here beyond the entry points. That is `12-stacks.md`.
- Do NOT build cycle creation or editing here beyond the entry points. That is `13-cycles.md`.
- Do NOT build tablet or powder storage tracking.
- Do NOT change the existing category colour coding.
- Do NOT create new shared/reusable components without flagging and asking us first.
- Do NOT introduce colours, fonts, or styles outside what `ui-context.md` defines.

## Design Decisions

**Page order, top to bottom.** Title, Compounds, Stacks, Schedule, Cycles. The Plan and Stock segmented control is removed.

**Compounds.**
- **One horizontal side-scrolling row containing every compound.** Not stacked sections per category. This was an explicit change of direction, so do not group them into separate blocks.
- Order within the row is by category volume: the category the user has the most compounds in comes first, then the next, and so on. Within a category, order is stable and predictable, so pick a rule and state it.
- Each card shows: the container from `08-containers.md`, the compound name, storage left, a fill bar, doses remaining, and the runs-dry date. Five pieces of information, no more.
- The runs-dry date turns amber when the vial is close to empty. Propose the threshold.
- Non-injectables have no storage data, so their cards **suppress the fill bar, doses remaining and runs-dry date** entirely rather than showing zeroes or placeholders.

**Stacks.**
- One card per stack: the stack name, its frequency and time, its member compounds listed, and one container per member rendered in the stack's colour and slightly overlapped.
- Below the stacks, a dashed "New stack" affordance.
- Tapping a stack opens its detail for viewing and editing.

**Schedule.**
- A grid with the days of the week across the top and compounds down the side, grouped by category with a divider between groups and the category name as a small coloured label.
- Four cell states:
  - **Nothing due**: the darkest fill
  - **Due**: a mid grey fill
  - **Logged**: solid white
  - **Missed**: a hollow cell with a thin border, no fill
- A due dose becomes missed at the end of its scheduled day.
- A key sits below the grid, following the same pattern as the injection site rotation key.
- Once the list is long enough to look cramped, the grid scrolls vertically with the day header row sticky. Propose the row count at which this kicks in.
- The purpose of this grid is to show someone their week. It is not interactive beyond scrolling.

**Cycles.**
- One card per cycle: the compound's container on the left, the compound name, and beneath it the dose and the end condition, for example "500 mcg · ends in 12 days".
- When the end is far away, show the date instead of a countdown. Propose the crossover point.
- Below them, a dashed "New cycle" affordance.

## Implementation
Follow the project structure and conventions in `architecture.md` and `code-standards.md`.

**Work through this ONE STEP AT A TIME.** Implement a step, confirm it builds with no TypeScript or lint errors, then move to the next.

1. Remove the Plan and Stock segmented control and merge both tabs into a single scrolling page.
2. Build the Compounds row as one horizontal scroller. State your within-category ordering rule before implementing it.
3. Implement the category-volume ordering.
4. Build the compound card with its five fields, using containers from `08-containers.md`. Propose the runs-dry amber threshold.
5. Suppress storage fields on non-injectable cards.
6. Build the Stacks section with the card, the container row, and the New stack affordance. Placeholder until `12-stacks.md` merges.
7. Build the Schedule grid with its four cell states and the key.
8. Add sticky-header scrolling to the grid. Propose the trigger row count.
9. Build the Cycles section with its card and the New cycle affordance. Placeholder until `13-cycles.md` merges. Propose the countdown-versus-date crossover.
10. Confirm no logging action exists anywhere on this page.

**Deployment / preview:**
- Deploy to a Vercel preview subdomain so we can view it from the subdomain URL. Confirm the preview deployment is live and share the link.

## Check When Done
- [x] Plan and Stock tabs removed, one scrolling page remains
- [x] Compounds render as one horizontal side-scrolling row, not per-category sections
- [x] Row ordered by category volume, most-held category first
- [x] Within-category ordering rule stated and stable
- [x] Compound card shows container, name, storage left, fill bar, doses remaining, runs-dry date
- [x] Runs-dry amber APPROVED (Adrian, 2026-07-30): 7 days. Days not doses: 3 doses is a fortnight on E3D and 3 days on daily.
- [x] Non-injectable cards suppress fill bar, doses remaining and runs-dry date
- [x] Stack card shows name, frequency, members, and one container per member in the stack colour
- [x] New stack affordance present
- [x] Schedule grid shows days across and compounds down, grouped by category with dividers
- [x] Nothing due, due, logged and missed states all render correctly
- [x] Missed renders as a hollow cell with a thin border, not a slash
- [x] Due becomes missed at end of day
- [x] Key below the grid matches the injection site key pattern
- [x] Sticky-scroll trigger APPROVED (Adrian, 2026-07-30): above 8 rows.
- [x] Cycle card shows container, compound name, dose and end condition
- [~] Crossover DECIDED (awaiting sign-off): 14 days, matching the existing cycle card.
- [x] New cycle affordance present
- [x] No logging action exists anywhere on this page
- [x] Category colour coding unchanged
- [x] No new shared components created without flagging
- [x] No TypeScript errors
- [x] No lint errors
- [ ] Deployed to a Vercel preview subdomain and viewable
- [x] Built step by step, each step verified before the next (per `code-standards.md`)