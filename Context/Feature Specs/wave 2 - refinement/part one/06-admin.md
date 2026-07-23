# Admin Page

## Goal
The admin page is currently a waitlist view: total signups, signups by channel, a list of recent signup emails, and a beta feedback count. The waitlist has served its purpose and the page needs to become an operational view of the running app instead.

Keep the email list, drop the waitlist framing, and add the metrics that actually tell us how the app is being used. Also verify that the founder-only restriction is enforced on the server rather than only hidden in the interface.

Independent of the other specs. Can run in parallel with 02 through 05.

## Out of Scope
- Do NOT expose any individual user's logged doses, compounds, markers, weights, photos, journal entries, or bloodwork. Every metric on this page is aggregate. The one exception is the email list, which already exists.
- Do NOT add the ability to edit, impersonate, or act on behalf of a user.
- Do NOT build charts beyond what is described below. Simple is fine here, this page is for us.
- Do NOT change the app's existing analytics or tracking setup as part of this.
- Do NOT create new shared/reusable components without flagging and asking us first.
- Do NOT introduce colours, fonts, or styles outside what `ui-context.md` defines.

## Design Decisions
Refer to `ui-context.md` for all styling. The page keeps the same restrained treatment it has now.

**Access control.** Check this first, before building anything.
- Confirm whether the founder-only restriction is enforced server-side or whether the page is merely hidden in the UI and reachable by anyone who knows the route.
- If it is not enforced server-side, fix that before adding a single new metric. Report which it was.
- Verify the check by attempting to reach the route while signed in as a non-admin account and while signed out. Both must fail at the server.
- The existing admin email allowlist and gating approach already live in the project. Use what is there rather than inventing a second mechanism. The details are in the database and the wider project context.

**Page structure, top to bottom.**

1. **Users.** Active users daily and weekly, and total registered accounts. Define active as a user who opened the app, and state your definition on the page so we read the number the same way every time.
2. **Signups over time.** A simple line or bar over a selectable range. Keep the by-channel breakdown that exists today, it is genuinely useful, just move it under this section rather than letting it head the page.
3. **Usage.** Total compounds logged, total doses logged, and the count of users with at least one compound currently active. These three together tell us whether people are actually using the app or just signing up.
4. **Feedback queue.** The beta feedback entries with an open or resolved state that we can toggle. This replaces the current count-and-collapse treatment. Show open items by default with resolved behind a toggle, which is roughly what happens now but with the state being something we can actually change.
5. **Email list.** Retained as it is today. Keep it at the bottom rather than the middle, since it is a reference list rather than a metric.

**Title.** The page is headed "Waitlist" today. Rename it to "Admin".

**Empty and small-number states.** We have very few users. Every metric must read sensibly at zero and at single digits. No percentage changes that divide by zero, no trend arrows computed from two data points.

**Performance.** These are aggregate queries over the whole user base. Make sure they are computed efficiently and do not scan more than they need. Flag it if any metric would become slow at scale.

## Implementation
Follow the project structure and conventions in `architecture.md` and `code-standards.md`.

**Work through this ONE STEP AT A TIME.** Implement a step, confirm it builds with no TypeScript or lint errors, then move to the next.

1. Determine how the founder-only restriction is currently enforced and report back before anything else.
2. If it is not enforced server-side, fix it and verify by attempting access as a non-admin and while signed out.
3. Rename the page from "Waitlist" to "Admin" and restructure the sections in the order above.
4. Build the Users section. Share your definition of an active user for approval before implementing it.
5. Build Signups over time, moving the existing by-channel breakdown underneath it.
6. Build the Usage section: compounds logged, doses logged, users with an active compound.
7. Build the Feedback queue with a toggleable open and resolved state.
8. Move the email list to the bottom, unchanged.
9. Check every metric renders sensibly at zero and at single-digit values.

**Deployment / preview:**
- Deploy to a Vercel preview subdomain so we can view and test it from the subdomain URL. Confirm the preview deployment is live and share the link.

## Check When Done
- [ ] Current enforcement of the founder-only restriction determined and reported
- [ ] Restriction enforced server-side, not only hidden in the UI
- [ ] Route access fails at the server for a signed-in non-admin account
- [ ] Route access fails at the server when signed out
- [ ] Existing admin allowlist reused rather than a second mechanism introduced
- [ ] Page renamed from "Waitlist" to "Admin"
- [ ] Active users daily and weekly shown, with the definition of active stated on the page
- [ ] Total registered accounts shown
- [ ] Definition of active user approved before implementation
- [ ] Signups over time shown with a selectable range
- [ ] Signups by channel retained, moved beneath signups over time
- [ ] Total compounds logged shown
- [ ] Total doses logged shown
- [ ] Count of users with at least one active compound shown
- [ ] Feedback queue shows open items by default with resolved behind a toggle
- [ ] Open and resolved state can be changed from the page
- [ ] Email list retained and moved to the bottom
- [ ] No individual user's logs, compounds, markers, weights, photos, journal, or bloodwork exposed
- [ ] No edit, impersonate, or act-on-behalf capability added
- [ ] Every metric renders sensibly at zero
- [ ] Every metric renders sensibly at single-digit values
- [ ] No divide-by-zero percentages or trends computed from two data points
- [ ] Query performance checked, anything that would not scale flagged
- [ ] No new shared components created without flagging
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Deployed to a Vercel preview subdomain and viewable
- [ ] Built step by step, each step verified before the next (per `code-standards.md`)