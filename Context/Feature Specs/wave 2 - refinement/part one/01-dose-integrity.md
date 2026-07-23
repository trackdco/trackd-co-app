# Dose & Schedule Integrity

## Goal
Fix the way scheduled doses, logged doses and compound deletion relate to each other. This is a correctness fix, not a feature. Three symptoms are known: altering a dose does not cleanly apply from the chosen day forward, logging a dose from a past day on the week strip writes the dose to today instead of the selected day, and a previously deleted compound reappeared in the logs after signing out and signing back in.

The app's own UI already promises the correct behaviour. The "Alter dose & schedule" row reads "Changes upcoming doses · today's logged dose stays as-is" and the delete confirmation reads "It stops being dosed from here on, but every logged dose is kept". So the labels are right and the implementation does not match them. The job is to make the data layer honour what the interface already claims.

Nothing else in the overhaul should start until this is merged. Every later spec sits on top of this data model.

## Out of Scope
- Do NOT redesign any screen, move any card, or change any layout. Visual changes are handled in later specs.
- Do NOT rewrite user-facing copy for tone or length. That is `07-global-sweep.md`.
- Do NOT build cycles, stacks, or the per-compound unit defaults. Those are separate specs.
- Do NOT delete or migrate any existing user log data as part of a fix. If a fix appears to require destroying history, stop and flag it.
- Do NOT create new shared/reusable components without flagging and asking us first.
- Do NOT introduce colours, fonts, or styles outside what `ui-context.md` defines.

## Design Decisions

**A schedule is a rule. A logged dose is an event. They are separate records and they never overwrite each other.**

This is the core principle and every decision below follows from it. A schedule describes intent going forward. A log describes something that actually happened. Editing intent must never mutate history.

**Altering a dose or schedule.**
- An alteration takes effect from the selected day onward and never earlier.
- Past logged doses are never rewritten, re-dosed, or recalculated when a schedule changes.
- The system must not back-fill or compensate. If a user raises a dose, no catch-up dose is scheduled for the days before the change.
- Prefer versioning the schedule (a new schedule row with an effective-from date) over mutating the existing row in place. Resolving what was due on any given date then means finding the schedule version that was active on that date. If the current data model cannot support this without a migration, flag it before writing the migration.

**Logging from a date context.**
- Any screen that has a selected date (the home week strip, the calendar) passes that date into the logging action.
- The logging action uses the passed date. It must never fall back to "now" when a date was supplied.
- If no date context exists, today is the correct default.
- The dose time is a separate field from the dose date and is covered below.

**Dose time.**
- The time field on the add and log forms must not pre-fill to the current clock time. It starts empty and the user chooses it.
- An empty time is a valid state to display. Decide with us what an unset time renders as before implementing a placeholder.

**Deletion.**
- Deleting a compound ends its schedule. It stops producing future doses from that moment.
- All logged doses for that compound are retained and remain visible in history, the calendar, and any past-day view.
- A deleted compound must not return to the active set on any subsequent load, sign-out and sign-in cycle, cache rehydration, or session restore. This is the reported bug and it needs a root cause, not a filter added at the render layer.

**Next dose resolution.**
- The Next Dose card must resolve the soonest unlogged scheduled dose for the selected day and display it.
- The preview build currently shows `-` in Next Dose while two doses are due at 3:42 PM and 3:43 PM, so this is failing with real data present and is not only an empty state. Treat it as part of this spec.
- What Next Dose shows once everything for the day is logged is a copy decision handled in the homepage spec. Here, only make it resolve correctly.

## Implementation
Follow the project structure and conventions in `architecture.md` and `code-standards.md`.

**Work through this ONE STEP AT A TIME.** Implement a step, confirm it builds with no TypeScript or lint errors, then move to the next. Do not build everything at once.

1. **Audit before changing anything.** Produce a short written map of how compounds, schedules, and logged doses currently relate: which tables or stores exist, which fields carry dates and times, how deletion is represented, and where the session rehydration path reads from. Share this before writing any fix. Do not skip this step, the ghost-compound bug has an unknown root cause and guessing at it risks masking it rather than fixing it.
2. **Reproduce the ghost compound.** Write down the exact steps that bring a deleted compound back into the logs, then fix the root cause. If the cause is that deletion is only applied client-side, or that a cached list is rehydrated ahead of the deletion flag, say so explicitly in the fix.
3. **Make deletion authoritative.** Deleting ends the schedule and keeps the logs. Verify across a full sign-out and sign-in cycle and a hard reload.
4. **Fix date context on logging.** Thread the selected date through from the week strip and the calendar into the logging action. Remove any fallback to "now" that fires when a date was supplied.
5. **Fix alteration semantics.** Make schedule changes apply from the selected day forward, with no retroactive rewriting and no compensating back-fill. If this needs schedule versioning, present the migration plan before running it.
6. **Remove the time pre-fill.** The time field starts empty on the add and log forms.
7. **Fix Next Dose resolution** so it returns the soonest unlogged scheduled dose for the selected day.
8. **Write regression tests** covering each of the reproductions in the checklist below, so these cannot silently return.

**Deployment / preview:**
- Deploy to a Vercel preview subdomain so we can view and test it from the subdomain URL. Confirm the preview deployment is live and share the link.

## Check When Done
- [ ] Data model audit written and shared before any code changed
- [ ] Root cause of the ghost compound identified in writing, not worked around at the render layer
- [ ] Deleting a compound stops future doses and keeps every logged dose
- [ ] Deleted compound does not reappear after sign out and sign in
- [ ] Deleted compound does not reappear after a hard reload or cache rehydration
- [ ] Selecting a past day on the week strip and logging a dose writes it to that day
- [ ] Selecting a past day on the calendar and logging a dose writes it to that day
- [ ] Altering a dose applies from the selected day forward only
- [ ] No past logged dose is rewritten by a schedule change
- [ ] No compensating or catch-up dose is scheduled for days before a change
- [ ] Time field does not pre-fill to the current time on the add form
- [ ] Time field does not pre-fill to the current time on the log form
- [ ] Next Dose resolves correctly with doses due and does not show a dash
- [ ] Regression tests exist for each reproduction above
- [ ] No existing user log data destroyed or migrated away
- [ ] No layout, copy, or styling changed by this spec
- [ ] No new shared components created without flagging
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Deployed to a Vercel preview subdomain and viewable
- [ ] Built step by step, each step verified before the next (per `code-standards.md`)