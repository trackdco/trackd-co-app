# Spec 01 — Account creation before the paywall

## Context for the Implementing Agent

Read these first, in this order, before touching anything:
`project-overview.md`, `architecture.md`, `ui-context.md`, `code-standards.md`, `HANDOVER-onboarding.md`.

Working rules for this spec:

- Branch: `wave3/onboarding-flow`. Do NOT merge to `main` without Adrian's explicit word — `main` deploys straight to Vercel production.
- This is Next.js 16, not 14. `middleware` is `proxy.ts`. Read `node_modules/next/dist/docs/` before using any Next API you are unsure of.
- Do NOT create new shared components without asking first. Reuse what exists.
- Verify by EXECUTING, not by reading. Every claim in the Check When Done list must be confirmed by measuring the running app, not by reading the source. Confirm on a real phone viewport, not just desktop — desktop reports a 0 safe-area inset and hides an entire class of bug.
- Do one Implementation step at a time. Stop and report after each.

## Goal

Move account creation out of the paywall screen and into its own step, positioned between the last onboarding question and the paywall.

The flow becomes:

1. Anonymous onboarding (14 steps, unchanged)
2. **New:** Create account screen
3. Paywall (now signed-in, payment only)

Three reasons this change is being made, in priority order:

1. **Capture the email before the price.** Today, a user who completes all 14 steps and then balks at the price leaves no trace. After this change, they leave an account and an email address.
2. **Remove the auth/payment collision.** Google sign-in navigates the browser away and back, which is a full page reload. Any payment UI mounted on the same screen is destroyed by that reload. Separating the screens removes the entire bug class before spec 02 introduces payment UI.
3. **Remove the two-CTA ambiguity.** The paywall currently has a "Continue with Google" button that is not the call to action. After this change the paywall has exactly one button.

## Out of Scope

Do NOT do any of the following in this spec:

- Anything involving Stripe, payments, subscriptions, trials, or entitlements. That is spec 02. This spec ends at "user has an account and lands on the paywall."
- Changing any of the 14 onboarding questions, their order, their copy, or their design.
- Changing pricing, plan copy, or the paywall's visual design beyond removing the auth controls.
- Adding new auth providers. Whatever is configured today is what ships.
- Building any email sending, drip sequence, or marketing automation. Capturing the email is in scope; using it is not.
- Adding a "skip account creation" or guest-mode path.

## Design Decisions

**Placement**

The new screen sits after the final onboarding question and before the paywall. It is a full screen in the onboarding flow, using the existing onboarding shell — same progress indicator, same safe-area handling, same headline treatment. It is NOT a modal or a bottom sheet.

The onboarding progress indicator must account for the new screen. If the flow currently reads as 14 steps, it now reads as 15. Do not leave the indicator showing "complete" while a screen remains.

**Framing**

This screen is framed as saving work the user has already done, not as a gate. Headline direction: the user is protecting the protocol they just built, not signing up for something.

Do NOT use the words "sign up", "register", "create an account to continue", or any phrasing that reads as a toll. Do NOT mention payment, trials, pricing, or "next you'll..." on this screen. The price is revealed on the paywall and nowhere earlier.

**Controls**

Whatever auth providers exist today, in the same order and with the same styling as they currently appear on the paywall. Move them; do not redesign them.

There is no skip. There is no back-to-onboarding destruction of answers — see Back navigation below.

**Anonymous state handoff**

This is the highest-risk part of the spec.

The 14 onboarding answers currently live client-side. The moment auth succeeds and a `users` row exists, those answers must be written to the database against that user, and only then cleared from client storage.

Ordering is strict: write to the database first, confirm the write succeeded, then clear local state. If the write fails, keep the local copy and surface a retry — never clear local state on an unconfirmed write.

Google sign-in causes a full page reload. The answers must survive that reload, which means they must be in a storage medium that persists across navigation, and the code that claims them must run on return from the auth redirect, not on button press. Assume Safari clears storage more aggressively than you expect and handle the empty case rather than crashing.

**Paywall changes**

The paywall loses its auth controls entirely. It gains an assumption: a signed-in user is always present. It must not render at all for an anonymous visitor — see Route protection below.

The paywall's single button remains the trial CTA. Its behaviour is unchanged in this spec; spec 02 rewires what it does.

**Back navigation**

Back from the account screen returns to the last onboarding question with all answers intact. Back from the paywall returns to the account screen, which — for an already-signed-in user — should skip forward to the paywall rather than showing a sign-in form to someone already signed in. In practice: if a signed-in user hits the account screen, redirect them straight to the paywall.

**Route protection**

The paywall route requires a session. An anonymous visitor hitting the paywall URL directly is sent to the start of onboarding, not to the account screen — arriving at a bare account screen with no answers to save makes no sense.

This check is server-side. A client-side redirect is not protection.

**Edge cases to handle explicitly**

- User already has an account and signs in on the account screen: their existing data wins. Do NOT overwrite an existing user's saved protocol with a fresh set of onboarding answers. If answers already exist for that user, discard the anonymous set and proceed.
- Auth succeeds but the answer write fails: user is signed in, answers are still local, show a retry. Do not silently drop them.
- User abandons on the account screen: nothing to clean up, answers stay local, they can resume.

## Implementation

Do these one at a time. Stop and report after each step.

1. Read the four context files listed above plus `HANDOVER-onboarding.md`. Report back what the current onboarding route structure is, where the 14 answers are stored client-side, and exactly how the paywall's auth controls are wired today. Do not write code in this step.

2. Create the account screen route inside the existing onboarding flow, positioned after the final question. Use the existing onboarding shell. Render the headline and subcopy only — no auth controls yet. Confirm it appears in the flow and that the progress indicator counts it correctly.

3. Move the auth controls from the paywall to the account screen. Do not restyle them. Confirm sign-in works end to end from this screen and lands the user on the paywall.

4. Implement the answer handoff: on successful auth, write the 14 onboarding answers to the database against the new `users` row, confirm the write, then clear client storage. Handle the existing-user case by discarding the anonymous answers. Handle the failed-write case with a retry that does not clear local state.

5. Verify the handoff survives the Google redirect specifically. Complete onboarding, sign in with Google, and confirm the answers are in the database afterwards. This must be tested by inspecting the database, not by trusting the UI.

6. Add server-side route protection to the paywall: no session sends the visitor to the start of onboarding. Add the signed-in-user redirect on the account screen so a signed-in user passing through lands on the paywall instead of a sign-in form.

7. Remove any now-dead auth code, copy, or conditional rendering left behind on the paywall. Confirm the paywall renders exactly one button.

8. Run the full gate: `tsc`, `eslint`, the test suite, and `next build`. All clean. Never run `next build` while a dev server is up.

9. Push the branch and deploy a Vercel preview. Report the preview URL. Do not merge.

## Check When Done

Every item below must be confirmed by executing the app, not by reading code.

- [ ] The account screen appears between the last onboarding question and the paywall
- [ ] The onboarding progress indicator counts the new screen correctly and does not read as complete while a screen remains
- [ ] The account screen uses the existing onboarding shell and matches its treatment
- [ ] The account screen contains no mention of price, trial, or payment
- [ ] The paywall contains no auth controls and renders exactly one button
- [ ] Completing onboarding then signing in with email lands the user on the paywall
- [ ] Completing onboarding then signing in with Google lands the user on the paywall
- [ ] After Google sign-in specifically, the 14 onboarding answers are present in the database against the new user — verified by inspecting the database directly
- [ ] Local storage of the answers is cleared only after the database write is confirmed
- [ ] A failed answer write leaves the answers intact locally and shows a retry
- [ ] An existing user signing in keeps their saved protocol; the anonymous answers are discarded, not merged over the top
- [ ] Hitting the paywall URL directly while signed out redirects to the start of onboarding, enforced server-side
- [ ] A signed-in user hitting the account screen is redirected to the paywall
- [ ] Back from the account screen returns to the last onboarding question with answers intact
- [ ] The whole flow is verified on a real phone viewport, including safe-area insets, and every control is above the fold or reachable by scrolling
- [ ] `tsc`, `eslint`, the test suite and `next build` are all clean
- [ ] Branch pushed, Vercel preview deployed, preview URL reported, nothing merged