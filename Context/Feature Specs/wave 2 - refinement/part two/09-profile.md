# Profile

## Goal
Dissolve the Settings page into Profile. Physical details become editable in place behind an edit toggle rather than sending people to another screen. Billing and Notifications become rows in the App card. The destructive actions get grouped into a bounded danger zone instead of sitting loose at the bottom of the page.

The result is one page where everything about your account lives, with a single consistent row treatment throughout.

Depends on `02-compound-lifecycle.md`, which removes the Archive row this spec assumes is already gone.

## Out of Scope
- Do NOT integrate Stripe or RevenueCat. This spec prepares the surface only. See Billing below.
- Do NOT change what Delete account or Clear all compounds actually do. Only their presentation changes.
- Do NOT remove the Archive row here. `02-compound-lifecycle.md` already did that. If it is still present, that spec has not merged and you should stop.
- Do NOT change the notification settings themselves, only where the entry point lives.
- Do NOT create new shared/reusable components without flagging and asking us first.
- Do NOT introduce colours, fonts, or styles outside what `ui-context.md` defines.

## Design Decisions

**Page order.** Title, avatar block, Physical card, App card, danger zone, version string.

**Avatar block.**
- The avatar is noticeably larger than today.
- The "Change photo" and "Remove" text controls are removed. **Tapping the avatar opens the photo picker directly.** Removing a photo moves inside that flow.
- Below it: name, email, and the plan badge.
- The photo picker routes through the adjust step from `05-photo-adjust.md` at a square ratio.

**Physical card.**
- Sex, Age, Height, Weight, Goal, Units, as rows in one card.
- An **Edit** control sits on the section header, not inside the card.
- **Default state:** rows render slightly dimmed and are not editable.
- **On Edit:** the rows fade out of the dimmed state and become inputs in place. The fade is the transition, so do not swap layouts or push the user to another screen.
- Saving returns the card to its dimmed read state.
- Changing Sex here is what drives the marker filtering in `04-markers-by-sex.md`. No warning, no confirmation, and logged marker history is never touched.

**App card.** One card, one row treatment throughout, in this order:
1. **Billing**, showing the current plan on the right
2. **Notifications**
3. Terms of Service
4. Privacy Policy
5. Medical Disclaimer
6. Send feedback

- Every row uses the same height, padding and divider. The notifications entry must not be a visually heavier card as it is today.
- **Settings is removed entirely.** The route and page go with it. Confirm nothing else links to it first.

**Billing before RevenueCat.**
- The row is present and shows the user's current plan on the right.
- It has no actions and does not navigate anywhere yet.
- It is not greyed out or disabled-looking. It reads as information, because that is what it is.
- Once RevenueCat is integrated the row gains a destination, and nothing else about it changes.

**Danger zone.**
- A bounded section beneath the App card, with a red section label and a red outline around the card.
- Contains, in order: Sign out, Clear all compounds, Delete my account.
- Row labels are red. The container is outlined rather than filled, so it reads as a place you enter deliberately rather than an alarm.
- Each action keeps its existing confirmation. Confirmations follow the red treatment established in `02-compound-lifecycle.md`.

**Version string.** Stays at the bottom, muted and centred.

## Implementation
Follow the project structure and conventions in `architecture.md` and `code-standards.md`.

**Work through this ONE STEP AT A TIME.** Implement a step, confirm it builds with no TypeScript or lint errors, then move to the next.

1. Confirm `02-compound-lifecycle.md` has merged and the Archive row is gone. Stop and report if not.
2. Find every link to the Settings route and list them before removing anything.
3. Enlarge the avatar, remove the Change photo and Remove controls, and wire tapping the avatar to the photo picker through the adjust step.
4. Move the Physical fields into Profile as a card with an Edit control on the section header.
5. Implement the dimmed default state and the fade into inputs on Edit.
6. Verify changing Sex drives marker filtering and touches no logged history.
7. Rebuild the App card with one consistent row treatment and the six rows in order.
8. Add the Billing row showing the current plan, with no actions.
9. Remove the Settings route and page.
10. Build the danger zone with its red outline and three actions, keeping existing confirmations.

**Deployment / preview:**
- Deploy to a Vercel preview subdomain so we can view it from the subdomain URL. Confirm the preview deployment is live and share the link.

## Check When Done
- [ ] `02-compound-lifecycle.md` confirmed merged, Archive row absent
- [ ] Every Settings link found and listed before removal
- [ ] Avatar noticeably larger
- [ ] Change photo and Remove text controls removed
- [ ] Tapping the avatar opens the photo picker
- [ ] Photo picker routes through the adjust step at a square ratio
- [ ] Name, email and plan badge below the avatar
- [ ] Physical fields editable within Profile
- [ ] Edit control sits on the section header, not inside the card
- [ ] Rows render dimmed and non-editable by default
- [ ] Tapping Edit fades rows out of dimming and into inputs in place
- [ ] No layout swap or navigation on entering edit mode
- [ ] Saving returns the card to its dimmed read state
- [ ] Changing Sex drives marker filtering with no warning and no history change
- [ ] App card uses one consistent row treatment throughout
- [ ] Notifications is no longer a visually heavier card
- [ ] App rows in order: Billing, Notifications, Terms, Privacy, Medical Disclaimer, Send feedback
- [ ] Billing row shows the current plan and has no actions
- [ ] Billing row does not read as disabled or greyed out
- [ ] Settings route and page removed
- [ ] Danger zone bounded with a red outline and red section label
- [ ] Danger zone contains Sign out, Clear all compounds, Delete my account
- [ ] Each danger action keeps its existing confirmation
- [ ] Confirmations follow the red treatment from `02-compound-lifecycle.md`
- [ ] Version string present at the bottom
- [ ] No Stripe or RevenueCat integration attempted
- [ ] No new shared components created without flagging
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Deployed to a Vercel preview subdomain and viewable
- [ ] Built step by step, each step verified before the next (per `code-standards.md`)