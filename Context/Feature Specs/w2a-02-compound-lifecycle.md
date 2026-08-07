# Compound Lifecycle

## Goal
Collapse the current three-state compound lifecycle down to two. Today a compound can be active, archived (with a Reactivate action), or permanently erased via a trash icon on the Archive page. That is more states than the app needs and it produces two ways to bring a compound back, one of which is a dedicated page most people will never find.

After this spec there is one verb, Delete. Deleting stops future doses and keeps all logged history. Bringing a compound back is the same action as adding any other compound: find it in the picker and press the plus. The Archive page is removed and the reactivate arrow disappears with it.

Depends on `01-dose-integrity.md` being merged. Deletion semantics are defined there, this spec builds the surface on top of them.

## Out of Scope
- Do NOT change what deletion does to the data. That is defined and implemented in `01-dose-integrity.md`. This spec only changes the interface around it.
- Do NOT redesign the compound picker's layout or add the Recently used row. That is `03-add-compound.md`.
- Do NOT rewrite copy for tone or length beyond the specific strings named below. General tightening is `07-global-sweep.md`.
- Do NOT add a permanent-erase option anywhere. We have decided history is kept.
- Do NOT create new shared/reusable components without flagging and asking us first.
- Do NOT introduce colours, fonts, or styles outside what `ui-context.md` defines.

## Design Decisions
Refer to `ui-context.md` for all styling. The one deliberate exception is called out under Warning styling below.

**States.**
- A compound is either active or deleted. There is no archived state and no erased state.
- Deleted compounds keep their full logged history, visible everywhere history is shown.
- Deleted compounds appear in the compound picker exactly like any compound the user has never added.

**The picker.**
- A previously deleted compound shows the standard plus, not a reactivate arrow.
- It renders at full opacity. No dimming, no greyed treatment, no visual marker that it was once deleted.
- Pressing the plus opens the normal add flow. The user sets dose, schedule and start date fresh, the same as a first-time add.
- A compound that is currently active continues to show the existing checked state so users cannot add a duplicate.

**Adding back a compound with history.**
- Adding back a previously deleted compound creates a new active schedule from the chosen start date forward.
- Old logged doses remain in history and are not merged into, or altered by, the new schedule.
- The compound's history is continuous from the user's point of view: one compound, one history, with a gap where it was deleted.

**Warning styling.**
- The delete confirmation currently uses amber. Amber is the app's accent colour and reads as emphasis, not danger.
- Restyle it to match the existing Sign out treatment in Profile: a red outline on the confirmation card, with a solid red confirm button.
- Cancel stays as the neutral secondary action.
- This is a deliberate override of the accent-colour convention in `ui-context.md`, applied to destructive confirmation only. Do not apply red anywhere else and do not add red to `ui-context.md` as a general accent.

**Copy.**
- The confirmation text must stop referring to the Archive page, since it will no longer exist. It currently ends "you can bring it back any time from your Profile."
- Replace with wording that says what deletion does and how to bring the compound back through the picker. Keep it to a single short sentence. Propose the exact string to us before shipping.

**Archive removal.**
- Remove the Archive row from the App card in Profile.
- Remove the Archive route and its page.
- Confirm nothing else in the app links to the Archive route before deleting it.

## Implementation
Follow the project structure and conventions in `architecture.md` and `code-standards.md`.

**Work through this ONE STEP AT A TIME.** Implement a step, confirm it builds with no TypeScript or lint errors, then move to the next.

1. Find every reference to the archived state and to the Archive route across the codebase and list them before changing anything. Share the list.
2. Change the compound picker so a previously deleted compound renders with the standard plus at full opacity, and pressing it opens the normal add flow.
3. Verify that adding back a deleted compound creates a fresh forward schedule and leaves old logged doses untouched.
4. Restyle the delete confirmation to the red outline card with a solid red confirm button, matching the Sign out treatment.
5. Propose the replacement confirmation string, get it approved, then apply it.
6. Remove the Archive row from Profile and remove the Archive route and page.
7. Remove any now-dead code for the archived state, the reactivate action, and permanent erase. Do not leave unused branches behind.

**Deployment / preview:**
- Deploy to a Vercel preview subdomain so we can view and test it from the subdomain URL. Confirm the preview deployment is live and share the link.

## Check When Done
- [ ] Every reference to the archived state and Archive route listed and shared before changes
- [ ] A previously deleted compound shows the standard plus in the picker
- [ ] No reactivate arrow appears anywhere in the app
- [ ] A previously deleted compound renders at full opacity with no dimming
- [ ] Pressing the plus opens the normal add flow with fields set fresh
- [ ] An active compound still shows the existing checked state and cannot be duplicated
- [ ] Adding back a deleted compound creates a forward schedule and leaves old logs untouched
- [ ] Old logged doses for a re-added compound still appear in history
- [ ] Delete confirmation uses a red outline card with a solid red confirm button
- [ ] Red is used only for destructive confirmation and is not added to `ui-context.md` as a general accent
- [ ] Replacement confirmation copy proposed, approved, and applied
- [ ] Confirmation copy no longer references Profile or the Archive page
- [ ] Archive row removed from Profile
- [ ] Archive route and page removed
- [ ] No permanent-erase action exists anywhere in the app
- [ ] Dead code for archived, reactivate, and erase removed
- [ ] No new shared components created without flagging
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Deployed to a Vercel preview subdomain and viewable
- [ ] Built step by step, each step verified before the next (per `code-standards.md`)