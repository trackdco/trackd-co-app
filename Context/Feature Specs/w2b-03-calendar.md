# Calendar

## Goal
The calendar works well and needs only one addition: showing cycles. A user running something seven days on and seven days off should be able to see that shape at a glance, colour coded by cycle.

Only repeating on-and-off cycles render. Cycles with a fixed end and no off-period do not, since a continuous run tells you nothing when drawn as a band across every day.

Depends on `08-containers.md` for the colour palette and `13-cycles.md` for the cycle data model. If `13-cycles.md` has not merged, stop and say so rather than inventing a cycle shape here.

## Out of Scope
- Do NOT change the month grid, the day sizing, the logged and future day treatments, or the existing dose and journal indicators. They all stay.
- Do NOT render continuous cycles that have no off-period.
- Do NOT build cycle creation or editing here. That is `13-cycles.md`.
- Do NOT create new shared/reusable components without flagging and asking us first.
- Do NOT introduce colours, fonts, or styles outside what `ui-context.md` defines.

## Design Decisions

**Rendering.** An on-day gets a soft coloured fill behind the date, at reduced opacity so the existing indicators still read on top. The fill spans consecutive on-days as one continuous band with rounded ends, so a run reads as a block of time rather than a row of separate squares.

**Layering.** The fill is the bottom layer. The logged-day white circle, today's ring, and the dose and journal icons all render above it and are unchanged.

**Overlaps.**
- Two cycles on the same day: split the cell vertically, first cycle on the left half, second on the right.
- Three or more: stack thin bars beneath the date instead of filling the cell. Do not attempt to split a cell three ways.
- Order stacked bars consistently, by cycle start date, so they do not reshuffle between months.

**The palette.** Twelve approved colours. Deep rather than pastel, nothing implying good or bad, and none clashing with amber or the category colours.

| Name | Hex | | Name | Hex |
|---|---|---|---|---|
| Slate | `#56687F` | | Clay | `#8B6050` |
| Steel | `#4C7285` | | Rosewood | `#7E4E54` |
| Teal | `#3D6B63` | | Mauve | `#7B5570` |
| Moss | `#4C6A4E` | | Plum | `#654C7C` |
| Olive | `#616B41` | | Indigo | `#55568C` |
| Bronze | `#7A6440` | | Stone | `#6D6A62` |

- These are stored on the cycle, not the compound, and are chosen by the user when the cycle is created.
- The same colour drives that cycle's containers elsewhere in the app.
- Add them to `ui-context.md` as a named cycle palette rather than scattering hex values through components.

**Horizon.** Indefinite cycles project forward twelve months and stop. Do not compute an unbounded projection.

**The key.** Below the grid, one row per active cycle: a colour swatch, the compound name, and the cycle summary. A repeating cycle reads as its pattern, for example "7 on / 7 off". A cycle with an end reads as its end, for example "ends 26 Jul".

**Day detail.** Tapping a day that falls inside a cycle shows the cycle and its end date in the existing day sheet. Do not put end dates on the grid itself, it would clutter every on-day.

## Implementation
Follow the project structure and conventions in `architecture.md` and `code-standards.md`.

**Work through this ONE STEP AT A TIME.** Implement a step, confirm it builds with no TypeScript or lint errors, then move to the next.

1. Confirm `13-cycles.md` has merged and the cycle model exists. Stop and report if not.
2. Add the twelve-colour cycle palette to `ui-context.md`.
3. Render single-cycle fills as continuous bands with rounded ends across consecutive on-days.
4. Confirm the existing logged, today, dose and journal indicators still render above the fill and are visually unchanged.
5. Implement the two-cycle vertical split.
6. Implement stacked bars for three or more, ordered by cycle start date.
7. Bound indefinite cycles at twelve months forward.
8. Build the key below the grid.
9. Surface the cycle and its end date in the day detail sheet.
10. Check a month with no cycles renders exactly as it does today.

**Deployment / preview:**
- Deploy to a Vercel preview subdomain so we can view it from the subdomain URL. Confirm the preview deployment is live and share the link.

## Check When Done
- [ ] `13-cycles.md` confirmed merged before starting
- [ ] Twelve-colour cycle palette added to `ui-context.md`, no hex values scattered in components
- [ ] On-days show a soft coloured fill at reduced opacity
- [ ] Consecutive on-days render as one continuous band with rounded ends
- [ ] Logged white circles still read above the fill
- [ ] Today's ring still reads above the fill
- [ ] Dose and journal icons still read above the fill
- [ ] Two overlapping cycles split the cell vertically
- [ ] Three or more render as stacked bars, not a three-way split
- [ ] Stacked bar order is stable across months
- [ ] Continuous cycles with no off-period are not rendered
- [ ] Indefinite cycles bounded at twelve months forward
- [ ] Key below the grid shows swatch, compound name and cycle summary per active cycle
- [ ] Repeating cycles show their pattern, ending cycles show their end date
- [ ] Day detail sheet shows the cycle and its end date
- [ ] No end dates rendered on the grid itself
- [ ] A month with no cycles renders identically to today
- [ ] Month grid, day sizing and existing indicators otherwise unchanged
- [ ] No new shared components created without flagging
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Deployed to a Vercel preview subdomain and viewable
- [ ] Built step by step, each step verified before the next (per `code-standards.md`)