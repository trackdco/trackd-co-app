# Stacks

## Goal
Let people group compounds they take at the same time, so those compounds show as one row on the dashboard and can be logged in a single tap.

**A stack is a display grouping, not a container.** Every compound inside it keeps its own schedule, its own dose, its own log entries and its own history. Removing a compound from a stack changes nothing about that compound. This framing is what makes the feature safe, so do not implement a stack as something that owns or wraps its members.

The rationale, so it does not get reinterpreted later: a stack means compounds injected at the same time, not compounds combined into one substance. Blends, where several peptides genuinely share a vial, already exist in the app as single compounds and are a different thing entirely.

Depends on `01-dose-integrity.md`, `03-add-compound.md` and `08-containers.md`.

## Out of Scope
- Do NOT let a stack own, wrap, or override a member's schedule, dose, or history.
- Do NOT allow a stack to be logged from Protocol. Logging happens on the dashboard only.
- Do NOT allow a compound to belong to more than one stack.
- Do NOT allow the same compound twice inside a stack.
- Do NOT convert existing blends into stacks or offer to. They are separate concepts.
- Do NOT add stacks to the compound picker as addable items beyond the segmented control described below.
- Do NOT create new shared/reusable components without flagging and asking us first.
- Do NOT introduce colours, fonts, or styles outside what `ui-context.md` defines.

## Design Decisions

**The model.**
- A stack has a name, a colour, and an ordered list of member compounds.
- Membership is a reference. Deleting the stack deletes nothing else.
- A compound belongs to at most one stack. This falls out of the model rather than needing a rule: a compound has one schedule, and a stack groups by when you take things.
- The same compound cannot appear twice in one stack. Enforce it in the picker by hiding or disabling already-added members.

**Naming.** User-named and required. Apply the character limits already defined in the codebase, do not invent new ones.

**Colour.** Chosen by the user from the twelve-colour palette in `10-calendar.md`. The stack colour overrides the category colour for its members' containers wherever the stack is shown. Individual compounds outside a stack context keep their category colour.

**Creation and editing.** Both happen in Protocol. Creating a stack asks for a name, a colour, and members chosen from the user's active compounds. Only compounds not already in a stack are offered.

**Stack detail.** Shows the containers in the stack colour, the member names with their doses, and the shared time below. Editable from here. Deleting the stack ungroups its members and leaves every compound running.

**On the dashboard.**
- The stack appears as one row under its own name, carrying the stack colour.
- The row expands to reveal its members, each individually tickable, so someone who took two of three can record exactly that.
- Logging the stack row logs every unlogged member at once, and animates all their container fills together.
- A partially logged stack shows partial state on the row rather than reading as complete.
- Members appear inside the stack row and **not** duplicated in their category sections.

**Deleting a member compound.** The stack survives with one fewer member. The compound's logged history before deletion is kept, as it is everywhere else. A stack reduced to one member stays a stack, but flag it to us if that looks wrong in practice.

**Compound picker.** With stacks present, the picker gains a segmented control splitting Compounds and Stacks, as anticipated in `03-add-compound.md`. The Stacks side lists existing stacks for reference. Stacks are created in Protocol, not from the picker.

## Implementation
Follow the project structure and conventions in `architecture.md` and `code-standards.md`.

**Work through this ONE STEP AT A TIME.** Implement a step, confirm it builds with no TypeScript or lint errors, then move to the next.

1. Write out the proposed data model, showing that membership is a reference and that no member field is owned by the stack. Share it before building.
2. Build the model and the one-stack-per-compound constraint.
3. Build creation in Protocol: name with existing limits, colour from the palette, members from compounds not already in a stack.
4. Build the stack detail view with editing and deletion. Verify deletion ungroups without touching compounds.
5. Apply the stack colour override to member containers.
6. Build the dashboard stack row, expandable, with individual member ticks.
7. Implement logging the row: log all unlogged members, animate the fills together, and write to the selected day.
8. Implement partial state on the row.
9. Verify members do not also appear in their category sections.
10. Add the Compounds and Stacks segmented control to the picker.
11. Test deleting a member compound and confirm the stack survives with history intact.

**Deployment / preview:**
- Deploy to a Vercel preview subdomain so we can view it from the subdomain URL. Confirm the preview deployment is live and share the link.

## Check When Done
- [ ] Data model shared and approved before building
- [ ] Membership is a reference, the stack owns no member field
- [ ] Each member keeps its own schedule, dose, logs and history
- [ ] A compound cannot belong to more than one stack
- [ ] The same compound cannot appear twice in one stack
- [ ] Stack name required, using existing codebase character limits
- [ ] Colour chosen from the twelve-colour palette
- [ ] Stack colour overrides category colour for member containers
- [ ] Compounds outside a stack context keep their category colour
- [ ] Creation and editing happen in Protocol
- [ ] Only compounds not already in a stack are offered as members
- [ ] Stack detail shows containers, member names with doses, and shared time
- [ ] Deleting a stack ungroups members and leaves every compound running
- [ ] Dashboard shows the stack as one row in its colour
- [ ] Row expands to individually tickable members
- [ ] Logging the row logs all unlogged members and writes to the selected day
- [ ] All member container fills animate together
- [ ] Partial state renders on the row, not as complete
- [ ] Members do not also appear in their category sections
- [ ] Compound picker has a Compounds and Stacks segmented control
- [ ] Stacks cannot be created from the picker
- [ ] No logging action on stacks in Protocol
- [ ] Deleting a member leaves the stack intact with history preserved
- [ ] Existing blends untouched and not offered for conversion
- [ ] No new shared components created without flagging
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Deployed to a Vercel preview subdomain and viewable
- [ ] Built step by step, each step verified before the next (per `code-standards.md`)