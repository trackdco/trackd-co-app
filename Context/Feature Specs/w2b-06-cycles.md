# Cycles

## Goal
Let a compound run on an on-and-off pattern, or run until a defined end, without the user having to manually stop and restart it. A cycle attaches to a single compound and governs when that compound's schedule is active.

A cycle is not a separate thing you log. It is a rule sitting above an existing schedule that switches it on and off.

Depends on `01-dose-integrity.md` and `08-containers.md`. `10-calendar.md` and `11-protocol-page.md` both consume this, so build it before them or their cycle sections stay placeholders.

## Out of Scope
- Do NOT name cycles. A cycle is just its compound. Naming belongs to stacks, not cycles.
- Do NOT apply a cycle to more than one compound. One cycle, one compound.
- Do NOT delete or hide logged doses when a compound enters an off period.
- Do NOT build the calendar rendering here. That is `10-calendar.md`.
- Do NOT create new shared/reusable components without flagging and asking us first.
- Do NOT introduce colours, fonts, or styles outside what `ui-context.md` defines.

## Design Decisions

**End conditions.** Five, and no others without asking us:
1. **X days on, X days off**, repeating
2. **Ends on a date**
3. **Ends when the vial runs out**, using the existing stock projection
4. **Ends after X rounds**, where a round is one on-period plus one off-period
5. **No end**, runs indefinitely

Conditions 1 and 4 combine, and 1 and 5 combine. Condition 3 only makes sense where storage is tracked, so offer it for vials only.

**Off periods.**
- During an off period the compound **disappears from Today's Log entirely.** It is not greyed, not moved to a separate section, not shown as skipped.
- The rationale, so it does not get reversed: off-cycle means the user is not taking it, so there is nothing to track. A greyed row would be a daily reminder of a non-event.
- Nothing is marked missed during an off period. Verify this against the missed-dose logic in `11-protocol-page.md`.
- Logged history from previous on-periods stays visible everywhere, including the calendar and past days.

**Cycle colour.** Chosen by the user from the twelve-colour palette in `10-calendar.md`, and used for the calendar fill and for the compound's containers in cycle contexts.

**Where cycles are created.** Two entry points, both required:
- **Protocol > Cycles**, for a compound already running
- **Inside add-compound**, so a compound can be set up as a cycle from the start

Both write the same cycle. Do not build two implementations.

**Editing mid-cycle.** A change takes effect from today forward. It never rewrites past on and off periods and never back-fills. This is the same rule as dose alteration in `01-dose-integrity.md`, and it should reuse that machinery rather than reimplementing it.

**Ending a cycle.** When a cycle ends the compound stops producing doses. It is not deleted and its history is kept. It reappears in the compound picker with a normal plus, exactly like a deleted compound in `02-compound-lifecycle.md`. Keep those two paths consistent.

**Display.** A cycle card shows the compound's container, the compound name, the dose, and the end condition. Near ends read as a countdown, far ends read as a date. `11-protocol-page.md` owns the crossover point.

**Stock interaction.** A cycle changes when doses are due, so the runs-dry projection must account for off periods. A vial that lasts fourteen doses lasts twice as long on a seven-on seven-off cycle. Confirm the existing projection handles this and fix it if not.

## Implementation
Follow the project structure and conventions in `architecture.md` and `code-standards.md`.

**Work through this ONE STEP AT A TIME.** Implement a step, confirm it builds with no TypeScript or lint errors, then move to the next.

1. Write out the proposed cycle model, showing how it sits above an existing schedule rather than replacing it. Share it before building.
2. Build the model and the five end conditions, gating the vial-runs-out condition to tracked vials.
3. Implement on and off resolution: given a compound and a date, is it on or off.
4. Make off-period compounds disappear from Today's Log entirely.
5. Verify nothing is marked missed during an off period.
6. Verify logged history from previous on-periods stays visible everywhere.
7. Build cycle creation in Protocol > Cycles.
8. Add the cycle option inside add-compound, writing through the same path.
9. Implement mid-cycle editing using the effective-from machinery from `01-dose-integrity.md`.
10. Implement cycle end: stop dosing, keep history, return the compound to the picker with a normal plus.
11. Update the runs-dry projection to account for off periods, or confirm it already does.
12. Build the cycle card.

**Deployment / preview:**
- Deploy to a Vercel preview subdomain so we can view it from the subdomain URL. Confirm the preview deployment is live and share the link.

## Check When Done
- [ ] Cycle model shared and approved before building
- [ ] Cycle sits above an existing schedule rather than replacing it
- [ ] All five end conditions implemented and no others
- [ ] Vial-runs-out condition offered only where storage is tracked
- [ ] X on / X off combines correctly with X rounds and with no end
- [ ] Cycles are not named
- [ ] One cycle applies to exactly one compound
- [ ] Off-period compounds disappear from Today's Log entirely
- [ ] Off-period compounds are not greyed, moved, or shown as skipped
- [ ] Nothing is marked missed during an off period
- [ ] Logged history from previous on-periods visible everywhere including the calendar
- [ ] Cycle colour chosen from the twelve-colour palette
- [ ] Cycle colour drives calendar fill and containers in cycle contexts
- [ ] Cycles can be created from Protocol > Cycles
- [ ] Cycles can be created inside add-compound
- [ ] Both entry points write through one implementation
- [ ] Mid-cycle edits take effect from today forward only
- [ ] No past on or off period rewritten, no back-fill
- [ ] Effective-from machinery from `01-dose-integrity.md` reused
- [ ] Ending a cycle stops dosing and keeps history
- [ ] Ended compounds return to the picker with a normal plus
- [ ] Runs-dry projection accounts for off periods
- [ ] Cycle card shows container, name, dose and end condition
- [ ] No new shared components created without flagging
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Deployed to a Vercel preview subdomain and viewable
- [ ] Built step by step, each step verified before the next (per `code-standards.md`)