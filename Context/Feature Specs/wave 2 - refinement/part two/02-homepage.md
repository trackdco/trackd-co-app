# Homepage

## Goal
Strip the dashboard back to the things people open the app to do, and fix the parts of it that currently read as unfinished. Weight and progress photos move to Progress. The week strip gets a lighter treatment and becomes collapsible. The greeting stops floating in the middle of the page. Next Dose starts resolving properly and gains a container image. The Today card carries what is outstanding rather than only a fraction. A journal quick action goes at the bottom.

The reference is a competitor dashboard that kept it to the log, the completion circle, the next dose and the injection sites. That is the shape we are aiming at.

Depends on `01-dose-integrity.md` and `08-containers.md` being merged.

## Out of Scope
- Do NOT remove or change the injection sites card. It stays on the dashboard exactly as it is today.
- Do NOT change how compounds look in the log list. The category colour coding and row treatment stay identical.
- Do NOT delete weight or progress photo data. They move surface only, and `15-progress.md` gives them a home.
- Do NOT build the journal entry flow itself. The card opens the existing journal surface.
- Do NOT change dose resolution logic. That is `01-dose-integrity.md`.
- Do NOT create new shared/reusable components without flagging and asking us first.
- Do NOT introduce colours, fonts, or styles outside what `ui-context.md` defines.

## Design Decisions
Refer to `ui-context.md` for all styling, spacing, and type.

**Page order, top to bottom.**
1. Header: date eyebrow, "Dashboard" title, icon row on the right
2. Week strip
3. Today's Log card, with the greeting inside it
4. Today card and Next Dose card, side by side
5. Injection sites card, unchanged
6. Journal quick action

**Header icon row.** Three icons, right aligned, in this order left to right: collapse toggle, calendar, profile. The profile icon navigates to Profile. The calendar icon navigates to the calendar as it does today.

**Week strip.**
- Replace the filled circle treatment with an underline. The selected day gets an amber underline beneath it, the day number in full white, and a three-letter day name below the number in a smaller muted size.
- Unselected days show the number and day name muted. Days with nothing scheduled sit a step dimmer again.
- Collapsible via the header toggle, with a smooth slide. **Defaults to open.** The open or closed state persists between sessions.
- Selecting a day still drives the whole page, including which doses the log shows and what any logging action writes to. That behaviour comes from `01-dose-integrity.md` and must not regress.

**The greeting.**
- "Good afternoon, [name]" moves inside the Today's Log card and sits above the `TODAY'S LOG` eyebrow.
- It is the largest text in that card, in the standard title treatment.
- The date eyebrow above the page title stays as it is.
- Rationale, so it does not get undone later: as a standalone row it was a full-width line doing no work between two things that do. Inside the card it introduces the content.

**Next Dose.**
- Shows the container image for the compound, with the compound name below it, then the time and dose.
- Resolves the soonest unlogged scheduled dose for the **selected** day, not necessarily today.
- When everything for the day is logged: title "Nothing due", subtitle "You're clear until tomorrow".
- When the selected day has no doses scheduled at all, that copy is wrong. Propose alternative wording for that case before shipping.
- Never render a bare dash. If the card cannot resolve a value, that is a bug, not an empty state.

**Today card.**
- A ring with "1 of 3" inside, where the denominator is the number of doses due on the selected day.
- Beneath the ring, one dot per compound due, in that compound's existing category colour. Outlined when outstanding, filled when logged.
- With many compounds due the dots must wrap or cap gracefully rather than overflowing. Propose the cap.

**Journal quick action.**
- A card at the bottom with a `JOURNAL` eyebrow and a single tappable input reading "How did today go?".
- Tapping it opens the existing journal surface for the selected day. The markers section appears there as it does now.
- It writes to the selected day, not today.

**Removals.** The weight card and the progress photos card come off this page entirely.

## Implementation
Follow the project structure and conventions in `architecture.md` and `code-standards.md`.

**Work through this ONE STEP AT A TIME.** Implement a step, confirm it builds with no TypeScript or lint errors, then move to the next.

1. Remove the weight and progress photo cards from the dashboard. Confirm both surfaces still hold their data and are reachable from Progress before merging.
2. Rebuild the week strip with the underline treatment.
3. Add the collapse toggle with a slide animation, defaulting to open and persisting state.
4. Add the header icon row in the order collapse, calendar, profile, and wire the profile icon to the Profile route.
5. Move the greeting inside the Today's Log card, above the eyebrow.
6. Rebuild Next Dose with the container image, name, time and dose, plus the "Nothing due" state. Propose the no-doses-scheduled wording.
7. Rebuild the Today card with the ring and the category dots. Propose the dot cap.
8. Add the journal quick action card, writing to the selected day.
9. Verify the injection sites card is untouched and still renders in position.

**Deployment / preview:**
- Deploy to a Vercel preview subdomain so we can view it from the subdomain URL. Confirm the preview deployment is live and share the link.

## Check When Done
- [x] Weight card removed from the dashboard, data intact and reachable from Progress
- [x] Progress photos card removed from the dashboard, data intact and reachable from Progress
- [x] Injection sites card present and unchanged
- [x] Log list rows and category colour coding unchanged
- [x] Week strip uses the amber underline treatment with three-letter day names
- [x] Days with nothing scheduled render a step dimmer
- [x] Week strip collapses and expands with a smooth slide
- [x] Week strip defaults to open and its state persists between sessions
- [x] Selecting a day still drives the log, the cards, and what logging writes to
- [x] Header icons appear in the order collapse, calendar, profile
- [x] Profile icon navigates to Profile
- [x] Greeting sits inside the Today's Log card above the eyebrow
- [x] Date eyebrow above the page title unchanged
- [x] Next Dose shows the container image with name, time and dose
- [x] Next Dose resolves against the selected day
- [x] Next Dose shows "Nothing due" and "You're clear until tomorrow" once the day is complete
- [~] Wording DECIDED (awaiting sign-off): "Nothing scheduled" / "No doses planned for this day."
- [x] Next Dose never renders a bare dash
- [x] Today card ring shows completed of due for the selected day
- [x] Category-coloured dots below the ring, outlined when outstanding, filled when logged
- [~] Dot cap DECIDED (awaiting sign-off): 9, then "+N". Verified no overflow.
- [x] Journal card present with a tappable input
- [x] Journal writes to the selected day, not today
- [x] No new shared components created without flagging
- [x] No TypeScript errors
- [x] No lint errors
- [ ] Deployed to a Vercel preview subdomain and viewable
- [x] Built step by step, each step verified before the next (per `code-standards.md`)