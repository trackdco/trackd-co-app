Save as: Context/Feature Specs/10-refund-requests.md

*(Canonical path. The founder saves these locally as `billing-10 - Refund
Requests.md`, so the filename on disk may differ. Cross-spec references are by number
— 01, 02a, 10 — which is unambiguous either way.)*

# Spec: Refund Requests

**Context files (read before starting):** `AI-workflow-rules.md`,
`architecture.md`, `code-standards.md`, `ui-context.md`, `project-overview.md`,
`next-tasks.md`, `progress-tracker.md`. `ui-context.md` is the primary styling
reference — every visual decision below defers to it.

**Workflow reminder:** Implement one step at a time. After each step in the
Implementation section, stop, confirm it builds with no TypeScript/lint errors
and renders correctly, then proceed. Do NOT batch steps. Do NOT introduce new
shared components without flagging first (see `code-standards.md`).

---

## 0. Dependencies, and what ships with what

**Depends on:** `08-billing-screen.md`, which builds the Manage sub-screen this row
lives on.

**In no ship-together pair**, but it should not ship before `08`, because it has
nowhere to live until Manage exists.

**Seams:**

- `05-read-only-gate.md` establishes that feedback submission is never gated. **This
  spec inherits that and depends on it**: a lapsed user is exactly who asks for a
  refund, and a refund form behind the write gate would be the product refusing the
  complaint about the product. §3.7.
- `14-admin-billing-dashboard.md` owns the rest of the admin billing surface. This
  spec owns only the refund queue's appearance on Overview.
- **The legal documents carry the same reply-time wording.** They were drafted to
  match exactly the reality this spec builds, so the two must not drift. §3.6.
- `12-go-live.md` owns the runbook that names refunds as a hand-issued dashboard
  action with no support tooling.

**The whole flow, in one line, so nothing drifts from it:** a user submits a request
in the app, it lands in the queue the founder already opens, the founder replies from
their own mail client to the address shown there, and any refund is issued by hand in
the Stripe dashboard at the founder's discretion.

---

## 1. Goal

A user who wants their money back can ask, inside the app, and know when they will
hear back.

The screen collects a request and says when somebody will reply. **It does not issue a
refund, promise one, or say anything about whether the reason qualifies.** Refunds are
a person's decision, made in the Stripe dashboard, with the invoice in front of them.

The reason it exists at all is a number: somebody who has not heard back in three or
four days goes to their bank instead, and a dispute costs the money, the fee and a
mark on the processor account whichever way it is decided. **An in-app request that
lands somewhere the founder already looks is what beats that reflex.** A request
sitting in a table nobody opens is the same as no request at all.

---

## 2. Out of Scope (do NOT build)

- **Do NOT** issue a refund, trigger one, queue one, or call any Stripe refund API.
  Refunds are issued by hand.
- **Do NOT** promise a refund, estimate one, or say anything about whether a reason
  qualifies. The screen collects and acknowledges, nothing more.
- **Do NOT** write "we will reply", "guaranteed", or a bare "within 2 business days".
  The word is **"usually"** and it is load-bearing. §3.6.
- **⚠️ Do NOT use a `mailto:` link.** There is no email system in this codebase, and a
  `mailto:` depends on the user having a mail client configured, which on an installed
  PWA is frequently false. The request would go nowhere, silently.
- **Do NOT** put this row on the main Billing screen. It is rare and deliberate, and
  beside Cancel it would read as an invitation.
- **⚠️ Do NOT widen anything in `lib/db/admin/` to return a row.** That layer returns
  counts only, and the boundary is the return type rather than the permission — the
  service role can already read everything. §3.5.
- **Do NOT** add the founder email list to a fifth place. It already exists in one
  TypeScript module and three SQL policies, kept in sync by hand.
- **Do NOT** gate this form behind write access.
- **Do NOT** let `legal@trackdco.app` appear anywhere. It does not exist. The support
  address is `support@trackdco.app`.
- **Do NOT** build an in-app refund status, a ticket thread, or a reply surface. The
  reply is an email from a person.
- **Do NOT** merge anything to `main`.

---

## 3. Design Decisions

### 3.1 Where it lives, and why not on Billing

Profile → Billing → **Manage** → a "Request a refund" row, **beneath Card and
Receipts**.

Not on the main Billing screen. Asking for money back is a rare, deliberate act, and a
row for it sitting beside Cancel would read as an invitation to try. One screen deeper
is far enough that somebody arrives having decided, and shallow enough that they can
find it.

Follow `Context/ui-context.md` for the row's treatment. It is an ordinary row, not a
destructive one and not a highlighted one.

### 3.2 The form

**Reason — a required dropdown**, its options mirroring the policy so the answer
arrives already categorised:

> I was charged after I cancelled

> I was charged twice

> I couldn't use Trackd Co during the period I paid for

> I renewed by accident

> Something else

**Details — a required free-text field.** Not optional. A request with no explanation
cannot be judged and costs an email round trip to make sense of.

**Submit, then a confirmation state.** The confirmation is immediate, and it is doing
most of the reassurance work — more than the number is. Somebody who sees "we have
this" the moment they press the button is far less likely to go to their bank than
somebody staring at a form that cleared itself.

**The confirmation keeps the user's own words.** Beneath the thank-you, the submitted
text renders **read-only**, introduced by one line. Nothing is stored twice: it renders
from the row that was just written.

**⚠️ The confirmation is derived from the open request, not from transient component
state, and that is what makes two things work at once.** It survives a refresh — a
device reload after submitting lands back on the confirmation rather than on an empty
form or an error — and it is the same server fact that disables the entry point under
D44. One source, two behaviours, no way for them to disagree.

**One open request per person (D44).** While a request is open, the entry point renders
its disabled state rather than the form. Resolving the request re-enables it. A person
with something already in the queue does not need a second row in it, and a founder
reading the queue does not need the same complaint twice.

**The empty-submission error (D45):**

> Add a few words about your request first.

No blame, names the fix.

**The confirmation's introductory line is still to be signed** — the shape given is "A
copy of your request is below for your reference." Drafted with the rest of the screen
in D43, no em dash.

### 3.3 How it is stored, and why not a new table

It writes a row through the existing feedback path, into the same table the in-app
feedback goes to, which the founder already reads in `/admin`. That is the established
pattern for a user-to-founder message in this codebase, and following it means nothing
is ever lost to a channel that does not exist.

**The write is a new server action beside the existing one, not a reuse of it.** Three
things must be set by the server rather than accepted from the client: the user, their
email, and the marker that makes this a refund request rather than ordinary feedback.

**The marker carries the literal value `refund_request`, set server-side, in the
column the table already has for the in-app route.** No new table and no new column.
A single equality on a server-set value is the whole queue query.

**⚠️ It is set by the server, never accepted from the client.** Otherwise ordinary feedback could be dressed up as
a refund request and clutter the one queue with money and a clock attached.

**The reason is composed into the message server-side** on its own leading line, so
the stored row carries both the category and the user's own words, and the queue can
show them separately without a schema change. D41 in §7 offers the alternative.

**⚠️ The table is append-only for users and almost append-only for founders.** There is
no update or delete grant for a submitter, so a user cannot withdraw or edit a
request. A founder may update exactly one column, the resolved marker, by a
column-scoped grant. **So there is nowhere to record a decision, an amount, or a
note.** The founder resolves the request in Stripe and ticks the row. That is the
whole tooling, and this spec states it rather than implying more exists.

### 3.4 ⚠️ It must appear in /admin, and that is not optional

A refund request that only exists in a table nobody opens is the same as no request at
all, and it is what turns a late reply into a chargeback.

**It surfaces on the Overview tab, in the "what needs you" block at the top**, not
buried in a sub-tab. It is the one message type with money and a clock attached.

**The block shows an open count and how long the oldest has been waiting**, so an
ageing request is visible without opening anything.

**And it shows the rows themselves**: the full message the user wrote, their reason
category, their email, and what they are actually paying — so a decision can be made
without going hunting across three screens.

**It uses the existing feedback queue's alert shape rather than inventing a second
pattern**: the fact with its number, why it matters, and the concrete next step, with
the step in the severity colour. That shape already exists and already reads well.

**⚠️ The thresholds are not the feedback queue's.** That queue has one threshold at
seven days, which is the right shape for a bug report and the wrong one for a request
with a two-business-day target and a chargeback window behind it. D42 in §7.

### 3.5 ⚠️ Reading rows without widening the counts layer

Two rules collide here and both hold.

**The admin data layer returns counts only.** Every function in it returns a count, a
tally, a set size, a date or a pure-derived figure, and none returns a row carrying an
identity. **The boundary is the return type, not the permission** — the service role
underneath can already read every table. Widening it is the one thing this spec must
not do.

**Refund requests break the no-rows rule by design**, because the point is reading what
somebody wrote.

**So they are read the way the waitlist and the feedback already are: through the
founder's own session-scoped client**, with the database's founder policy widening the
read rather than the application asserting a privilege. Three independent layers stand
behind that — the page redirects a non-founder before any query runs, the policy
restricts the rows regardless of the application, and the admin entry point re-checks
the caller.

**The one piece that cannot come that way is what they are paying.** The billing
tables have no founder-read policy at all, and `/admin` cannot answer "what is this
person on" for anybody today. There are exactly two ways to change that:

- **Add a founder policy to the billing tables.** That is a fourth and fifth copy of
  the founder email list kept in sync by hand, and it makes those tables readable by a
  browser session.
- **Add a narrow service-role reader returning exactly the fields needed**, for
  exactly the user ids in the open refund queue.

**Take the second, and put it in its own module outside the admin counts layer.** No
new policy, no new copy of the email list, nothing newly readable from a browser, and
the widening is visible in one return type in one file. It is guarded by the same
founder check the counts layer uses, and it returns the plan, the interval, the amount
and the next date for a given set of users — nothing else, and never a free-form
query.

**⚠️ It goes outside `lib/db/admin/` precisely so that layer's rule stays absolute.**
A module that returns rows must not live in the module that promises it never does.

### 3.6 The reply time, and why the number is short

**In the app and in the policy, the words are:**

> We usually reply within 2 business days.

Not "we will". Not "guaranteed". Not a bare "within 2 business days".

**"Usually" is honest, sets the expectation that beats the chargeback reflex, and is
not a contractual promise to be measured against.** Missing a self-imposed reply target
is a service failure rather than a breach of a guarantee about the product.

**⚠️ Do not write a longer number to be safe. Seven days is not the cautious option; it
is the one that invites the dispute.** The real cost of a long promise is somebody
going to their bank on day four.

**The number is only honest because the request lands somewhere the founder already
looks.** §3.4 is what makes §3.6 true, and if the queue is not surfaced the promise
should not be made.

**One flag for the legal review, and it is not legal advice:** under Australian
Consumer Law a representation that is systematically untrue can be misleading conduct.
One late reply is not that; a promise the business never intends or is never able to
keep could be. Which is another argument for "usually" and for a number that is
actually achievable.

**⚠️ The legal documents carry this same wording** and were drafted to match this
reality exactly. If either moves, both move. This spec must not drift from the
documents and the documents must not drift from it.

### 3.7 It is never gated

Feedback submission is not behind the write gate, deliberately, and this form
inherits that.

**A lapsed, read-only user is exactly the person most likely to ask for a refund.** A
refund form that refuses them would be the product blocking the complaint about the
product, on the screen where somebody is already deciding whether to call their bank.

### 3.8 Invariants this spec touches, and how the work preserves each

- **A user's logged data is never deleted, hidden, or withheld to apply commercial
  pressure.** This form asks for nothing and withholds nothing, and it works in
  read-only.
- **No secret ever reaches a client bundle.** The service-role reader is server-only
  and returns a fixed shape. No key, no email list, and no free-form query reaches the
  browser.
- **A screen never states a price, date or promise the server would contradict.** The
  screen makes exactly one promise — a reply target — and §3.4 is the mechanism that
  keeps it. Nothing else on it is a commitment.
- **A server action never accepts an identifier saying whose data to act on.** The
  submit action takes the reason and the details and nothing else; the user, the email
  and the route marker are all resolved server-side. **⚠️ The founder's resolve action
  is the deliberate exception**: it takes a row id, because acting on somebody else's
  row is the entire point of an admin queue. It is guarded twice — a founder check in
  the application and a founder-only, column-scoped policy in the database, which
  permits exactly one column to be written. Named here so a reviewer reads a decision
  rather than a leak. **⚠️ Every export of a `"use server"` module is a publicly
  dispatchable HTTP endpoint**, so any helper added here stays private.

### 3.9 If this goes wrong after go-live

There is no support tooling. No self-serve deletion, no in-app receipts list, no admin
control to fix an individual's subscription. Everything exceptional is the founder in
the Stripe dashboard, and refunds are the clearest example. The runbook is §9e of the
founder's brief, carried in `12-go-live.md`. Refer to it; do not restate it.

**The failure specific to this spec is silence:** a request that arrives and is not
seen. That is why §3.4 is written as a requirement rather than a nicety, and why its
count and its ageing are on the first screen rather than behind a tab.

---

## 4. Implementation

Follow `architecture.md` for the project's actual folder structure, navigation,
and naming conventions — place files where existing screens/components live; the
paths below are intent, not literal if they conflict with the repo. Follow
`code-standards.md` for component patterns, typing, and lint cleanliness.

Build in this order, verifying each step before the next:

**Step 1 — The write path first, before any screen.**
Add the submit action beside the existing feedback one. The user, the email and the
route marker are set server-side; the reason is composed into the message on its own
leading line. Respect the existing length limits.
**⚠️ Do not export any helper from that module.**
*Verify before moving on:* a row lands with the right marker, the right email, and a
message containing both the category and the user's words, and a forged marker from a
client is impossible because the client never supplies one.

**Step 2 — The screen and the row.**
The row under Manage, beneath Card and Receipts. The form with both fields required.
The immediate confirmation state. Apply D43's copy once decided; if it is open, build
the screen and mark the strings `OPEN` rather than inventing them.
**⚠️ No `mailto:` anywhere. ⚠️ `legal@trackdco.app` must not appear.**
*Verify before moving on:* neither field can be submitted empty, and the confirmation
appears without a page change.

**Step 3 — Prove it works while read-only.**
Seed a lapsed account and submit a request end to end.
*Verify before moving on:* the row lands, and nothing on the path is refused.

**Step 4 — The narrow billing reader.**
Its own module outside the admin counts layer, server-only, founder-guarded, returning
the plan, interval, amount and next date for a given set of user ids and nothing else.
**⚠️ Do not add a function to `lib/db/admin/`. Do not add an RLS policy. Do not copy
the founder email list anywhere.**
*Verify before moving on:* its return type contains no free-form field, and the counts
layer's diff is empty.

**Step 5 — The Overview surfacing.**
The alert with its open count and oldest age, then the rows: message, reason, email
and what they are paying. Reuse the existing alert shape. Apply D42's thresholds once
decided.
*Verify before moving on:* an open request is visible on Overview without opening
anything, and a resolved one is not.

**Step 6 — Resolve, and the limits of it.**
Ticking a request writes the one column it may write. Confirm there is nowhere to
record an amount or a note, and that the screen does not imply there is.
*Verify before moving on:* a non-founder cannot resolve, through the action or
directly.

**Step 7 — Drive it and attack it.**
**⚠️ The Supabase database is production, with ~90 real users. Seed test accounts on
`@trackd-qa.invalid` and delete them BY ID ONLY.**
**⚠️ `http://127.0.0.1` does not hydrate.**
**⚠️ Do NOT run `next build` or delete `.next` while a dev server is running.**
*Verify before moving on:* every box in §5 answered yes, by observation.

---

## 5. Check When Done

Gates and environment:

- [ ] `tsc` clean, ESLint clean, all tests pass, `next build` succeeds
- [ ] Verified by DRIVING the running app at 390x844 on `http://localhost`, not by
      reading code or trusting tests
- [ ] The screen works with the newest migration UNAPPLIED
- [ ] Every dialog: focus moves in, Tab cycles inside it, Escape closes it, and
      focus returns to the trigger
- [ ] Every tap target at least 44px
- [ ] Animation collapses to nothing under `prefers-reduced-motion`
- [ ] Nothing sits under the fixed bottom nav or the FAB
- [ ] Any new server action refuses an anonymous caller and another signed-in user
- [ ] No helper was exported from a `"use server"` module

What the screen must never do:

- [ ] It issues no refund and calls no refund API
- [ ] It promises no refund and says nothing about whether a reason qualifies
- [ ] It contains no `mailto:` link anywhere
- [ ] `legal@trackdco.app` appears nowhere; `support@trackdco.app` is the only address
- [ ] The reply line reads "We usually reply within 2 business days." — not "we will",
      not "guaranteed", not a bare number
- [ ] No em dash appears anywhere on the screen
- [ ] The row is under Manage and not on the main Billing screen

The form and the write:

- [ ] Neither field can be submitted empty
- [ ] The confirmation appears immediately, before any human reply
- [ ] The submitted text renders on the confirmation, beneath the thank-you
- [ ] It is read-only: it cannot be edited, resubmitted, or focused as an input
- [ ] **A device refresh after submitting lands back on the confirmation**, not on an
      empty form and not in an error state
- [ ] With a request open, the entry point renders its disabled state and the form
      cannot be reached
- [ ] Resolving the request re-enables the entry point
- [ ] Submitting an empty details field shows exactly the D45 wording
- [ ] The stored row carries the reason category and the user's own words
- [ ] The email on the row is the session's, never the client's
- [ ] The route marker is server-set and cannot be supplied or forged by a client
- [ ] Ordinary feedback cannot appear in the refund queue
- [ ] **A lapsed, read-only user can submit a request end to end**

The admin surfacing:

- [ ] An open request is visible on the Overview tab's "what needs you" block without
      opening anything
- [ ] The open count and the oldest waiting age both render
- [ ] The full message, the reason, the email and what they are paying all render
- [ ] The alert uses the existing feedback queue's shape, not a second pattern
- [ ] A resolved request drops out of the open list
- [ ] Rows are read through the founder's own session-scoped client
- [ ] **`lib/db/admin/` returns no row, and its diff is empty**
- [ ] The new billing reader lives outside that layer, is server-only, and returns a
      fixed shape with no free-form field
- [ ] No new RLS policy was added and the founder email list still exists in exactly
      four places

Attacks:

- [ ] A non-founder cannot read a refund request, through the page or directly
- [ ] A non-founder cannot resolve one
- [ ] A founder cannot write any column but the resolved marker
- [ ] A submitter cannot edit or withdraw their own request
- [ ] The billing reader refuses an anonymous caller and a non-founder

- [ ] **⚠️ THE PROJECT IS NOT DONE UNTIL COLD AGENTS COME BACK CLEAN.** Once
      everything is built, run independent cold-agent reviews — one on money and
      races, one on the gate and entitlements, one on the UI at 390x844 — and keep
      fixing and re-running until no CRITICAL and no HIGH findings remain. Low and
      medium findings unrelated to payments may be accepted deliberately and written
      down. Payments are the strict bar.

---

## 6. The four standing rules

1. **⚠️ DO NOT EDIT THE CONTEXT FILES.** `ui-context.md`, `architecture.md`,
   `code-standards.md`, `project-overview.md` and `ai-workflow-rules.md` are fixed
   input and must stay identical. If work seems to require changing one, stop and
   ask the founder. The only files an agent updates as it goes are
   `progress-tracker.md` (state) and `next-tasks.md` (steps).

2. **⚠️ THE PROJECT IS NOT DONE UNTIL COLD AGENTS COME BACK CLEAN.** As stated at
   the end of §5. It applies to the work as a whole rather than to this spec alone.

3. **Billing is verified against real Stripe test mode, never a fixture.** Other
   specs in this repo build against mock data. This one cannot: the defects live in
   Stripe's own state machine, and two CRITICALs on this project were found only
   with a test clock.

4. **Migrations are written, never applied.** This spec produces no SQL as written.
   If D41 goes the other way it produces one, and that file opens with a ▶ HOW TO RUN
   THIS block and ends with a VERIFY block that returns rows, for the founder to apply
   by hand.

---

## 7. Open items

Three decisions. Steps 1, 3, 4 and 6 depend on none of them.

**⚠️ Numbering note.** Two decisions arrived under numbers already in use here. The
one-open-request rule is recorded as **D44** and the empty-submission error as **D45**,
so that one number means one decision. The original D41 and D42 are below, one
resolved and one still open.

~~`D41 — how a refund request is told apart from ordinary feedback`~~ **Resolved 15
Aug 2026.** A server-set `refund_request` type discriminator, in the column the table
already has, with no new tables and no migration. Carried in §3.3.

~~`D44 — one open request per person`~~ **Resolved 15 Aug 2026.** The entry point
renders a disabled state while a request is open; resolving re-enables it. Carried in
§3.2.

~~`D45 — the empty-submission error`~~ **Resolved 15 Aug 2026.** "Add a few words
about your request first." Carried in §3.2.

**`OPEN — D42, the queue's thresholds.`** The existing feedback alert has one
threshold at seven days. That is right for a bug report and wrong here: this queue has
a two-business-day target and a chargeback window behind it.

**Recommended: three tiers.** Informational while inside the target. A warning once
the oldest open request has passed two business days, which is the moment the promise
starts being broken. And the queue's only critical tier at four days, because that is
where somebody stops waiting and calls their bank — the outcome the whole feature
exists to avoid. The exact days are yours; the shape of three tiers rather than one is
the recommendation.

**`OPEN — D43, the screen's copy.`** The title is settled by the brief. Two lines are
not, and both were marked as drafts in the brief rather than signed.

*The line that sets the expectation, under the title:*

- **A.** "Tell us what happened and we'll take a look. We usually reply within 2
  business days." — states the action and the target in the order somebody needs them.
- **B.** "We usually reply within 2 business days. Refunds are decided case by case,
  so tell us what happened." — leads with the number, and says plainly that nothing is
  automatic.

**Recommended: A.** B's second clause edges toward describing a policy, and the screen
is meant to promise nothing about qualification. A asks for what is needed and states
the one thing being committed to.

*The confirmation, on success:*

- **A.** "We've got your request. We usually reply within 2 business days." — repeats
  the same timeframe in the same words, which is the point of repeating it.
- **B.** "Thanks, we've got it. Someone will be in touch within 2 business days." —
  warmer, but it drops "usually" and turns a target into a commitment. **Not
  recommended**, and named only so the reason for rejecting it is on the record.

**Recommended: A.**

**`ALSO IN D43's PASS`** — two more strings, signed in the same round: the
confirmation's introductory line above the user's copied text (shape: "A copy of your
request is below for your reference."), and the entry point's disabled state under
D44, which must say a request is open and when they will hear back without repeating
the whole promise.

**Also carried, not a decision:** the reply-time wording appears in the legal
documents as well as here. They were drafted to match this reality and must be checked
against the final wording before go-live, so that one number does not exist in two
forms.
