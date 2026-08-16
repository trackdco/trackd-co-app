Save as: Context/Feature Specs/16-account-deletion.md

*(Canonical path. The founder saves these locally as `billing-16 - Account
Deletion.md`, so the filename on disk may differ. Cross-spec references are by number
— 01, 02a, 16 — which is unambiguous either way.)*

# Spec: Account Deletion

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

**Depends on:** `03-cancel-flow.md` for the cancel machinery, and `05-read-only-gate.md`
for the exemption this flow relies on.

**First among the post-launch set**, and the reason is in §1: the interim state is not
merely missing a feature, it is quietly failing a promise the product already makes.

**Seams:**

- **`05` exempts this entire flow from the write gate**, and carries the reciprocal
  statement. **A lapsed user can always leave.** Not the Stripe cancellation, not the
  storage sweep, not the row delete — none of it is gated.
- `03` owns the period-end cancel a user chooses. **This uses a different function**,
  which cancels immediately, and the two must never be confused. §3.3.
- `10-refund-requests.md` writes rows that this flow destroys. §3.6.
- `12-go-live.md` carries the interim manual runbook until this ships.

**⚠️ The order in §3.2 is not negotiable and is the reason this spec exists.**

---

## 1. Goal

Somebody can delete their account, and everything of theirs actually goes.

Today deletion is an email to support, performed by hand. Two things about that are
worse than "a missing feature", and both are true right now rather than after go-live.

**The function that cancels at Stripe before a deletion has no callers.** It exists, it
is correct, its own comment says to call it before deleting the user — and nothing
does. So a deletion performed today leaves a live subscription billing a person who no
longer exists in our database, with the only mapping back to them cascaded away.

**The database cascade cannot reach Storage.** Bloodwork scans, progress photos,
journal photos and avatars all survive a row delete. So an account "deleted" today
leaves the most sensitive files this product holds sitting in a bucket.

**Working looks like this:** one control, a confirmation that does not trap anybody,
and afterwards nothing of theirs exists in Stripe, in the database, or in Storage.

---

## 2. Out of Scope (do NOT build)

- **⚠️ Do NOT delete anything before the Stripe cancellation has succeeded.** §3.2.
- **⚠️ Do NOT delete the database rows before the storage objects.** §3.4. The rows are
  the map to the objects.
- **Do NOT** use the period-end cancel here. §3.3.
- **Do NOT** gate any part of this flow behind write access.
- **Do NOT** offer a save offer, a discount, a pause, or a "are you sure you don't want
  to just cancel instead" diversion. This is somebody leaving, and the exit is not a
  funnel.
- **Do NOT** soft-delete, anonymise-in-place, or flag-and-retain as a substitute for
  deleting. If something must be retained, that is D56 and it is named explicitly.
- **Do NOT** delete by email, by domain, or by any matcher. **BY ID ONLY.** A previous
  cleanup matched a whole domain and destroyed sixteen real fixtures.
- **Do NOT** make deletion reversible by keeping a copy somewhere. An undo that keeps
  the data is not an undo, it is a retention policy nobody agreed to.
- **Do NOT** merge anything to `main`.

---

## 3. Design Decisions

### 3.1 What exists, and the verdict

| | Verdict |
|---|---|
| The immediate-cancel function, its idempotency and its reasoning | **Correct, and unreachable.** Zero callers. §3.3 |
| The cascade from the profile row through the billing tables | **Correct as far as it goes.** It does not reach Storage. §3.4 |
| Deletion as a support email | **The interim state**, and it is failing silently. §3.7 |
| Signed URLs at an hour | **Too long**, and one call site hardcodes it. §3.5 |

### 3.2 ⚠️ The order, which is the whole spec

**1. Cancel at Stripe. 2. Delete the storage objects. 3. Delete the database rows.
4. Delete the auth user.**

**Stripe first**, because the billing tables cascade from the profile row. Delete the
row first and three things happen at once: the only mapping from a Stripe customer back
to a person is erased, the subscription stays live and keeps billing, and every future
webhook for that customer becomes permanently unattributable. The result is somebody
who deleted their account and keeps being charged, with no row anywhere connecting the
charge to them and no way to find it except by reading Stripe by hand. **That is a
chargeback with extra steps, and dispute rate is the number that closes payment
processor accounts.**

**Storage before rows**, for the same reason wearing a different hat. §3.4.

**⚠️ If any step fails, the following steps do not run.** A failed cancellation stops
the deletion. A failed storage sweep stops the row delete. The user is told the
deletion did not complete and it is retried, because a half-deleted account is worse
than an undeleted one — and every step is idempotent so a retry is safe.

### 3.3 Immediate, not at period end, and why that is the opposite of everywhere else

Every other cancellation in this product preserves what was paid for, because the
person keeps using the app.

**Here they do not.** The account and its data are going. There is no access to
preserve, and leaving a subscription to run out quietly after the account is gone is
exactly the orphaned-subscription state above.

**Stripe does not refund the remainder and this does not ask it to.** That is a support
decision, made by a person, with the invoice in front of them — which is `10`'s
territory, not this one's.

**The confirmation says so plainly, and the line is signed (D59):**

> Your subscription will be cancelled. Any remaining paid time ends when your account is deleted, and no further charges will be made.

**⚠️ It renders only when a live subscription or trial exists.** An account with
neither sees no money line at all, because a sentence about a subscription somebody
does not have is noise on the one screen where clarity matters most.

The function is idempotent: a subscription Stripe has already ended returns its
cancelled object rather than erroring, and an account with no subscription returns an
empty list.

### 3.4 ⚠️ The cascade cannot reach Storage, and the rows are the map

Four buckets hold this product's most sensitive files: bloodwork, progress photos,
journal photos and avatars. **A database cascade deletes rows. It does not touch object
storage.** So a bare row delete leaves every one of those files in place.

**And the paths to those objects live in the rows the cascade destroys.** Delete the
rows first and the objects are orphaned with no index back to them — the same failure
as the billing mapping, on the data that matters most.

**So the sweep enumerates and deletes the user's objects across all four buckets
before any row is deleted.** `OPEN: awaiting answer to Q98` — where the paths are
recorded and whether objects are keyed under a user-id prefix, because a prefix layout
gives a second, independent way to enumerate and a flat layout does not.

**The sweep is verified by listing afterwards, not by trusting the delete call.**
Storage deletes can partially succeed, and "no error returned" is not "nothing
remains".

### 3.5 The signed-URL window (D47)

Signed URLs currently live for an hour. **They become five minutes**, held in one
shared constant, applied at all seven call sites **including the avatar page's
hardcoded value** — a hardcoded duration is the one that survives a policy change and
nobody notices.

An hour is a long time for a link to somebody's bloodwork to be forwardable. Five
minutes is comfortably longer than a page needs and short enough that a leaked URL is
usually already dead.

`OPEN: awaiting answer to Q100` — the seven call sites, so none is missed.

### 3.6 ⚠️ Deleting an account destroys any open refund request

Feedback rows cascade from the profile, and refund requests are feedback rows. **So a
user who asks for their money back and then deletes their account erases the request
— while the founder may still owe them the money.**

The person then has no in-app record, no reply, and one obvious next move: their bank.

**Three ways to handle it, and this spec does not choose (D56):**

- Warn at deletion time if a request is open, and let them decide.
- Retain the request, detached from the deleted account.
- Do nothing, and rely on Stripe's own invoice record, which survives regardless.

**Recommended: warn, and retain nothing.** The warning is honest, cheap, and puts the
decision where it belongs. Retention conflicts with an erasure promise and would need
its own legal answer; Stripe holds the invoice and the payment record either way, so
the money is traceable even when the request is not.

**⚠️ This is a legal-lane question as much as a product one**, because retention and
erasure pull opposite ways and the answer belongs with whoever holds the policy.

### 3.7 Until this ships, the runbook is not optional

**Every hand-performed deletion today must include a dashboard storage sweep of the
four buckets under that user's id, and a Stripe cancellation first.** Without both, the
erasure promise is not being kept and a subscription may still be billing.

**That is true now, not after go-live**, and `12` carries it as an interim step. This
paragraph exists so that the runbook and this spec cannot disagree about what the
interim obligation is.

### 3.8 Invariants this spec touches, and how the work preserves each

- **Deleting an account cancels Stripe first, or a live subscription bills with
  nothing connecting it to a person.** §3.2 is that invariant, and this spec is what
  finally makes it reachable in code rather than true only in a comment.
- **A user's logged data is never deleted, hidden, or withheld to apply commercial
  pressure.** Deletion here is the user's own act. **And the exemption in §0 is the
  same invariant from the other side: an account nobody can leave is data held
  hostage.**
- **No user holds more than one billable subscription at any moment.** The cancel
  covers every live subscription on the customer, not one.
- **A server action never accepts an identifier saying whose data to act on.** The
  deletion action takes no user id. The account comes from the verified session, and a
  confirmation phrase is not an identifier. **⚠️ Every export of a `"use server"`
  module is a publicly dispatchable HTTP endpoint — an unguarded delete-by-id export
  would be the most dangerous endpoint in the product.**

### 3.9 If this goes wrong after go-live

A partially completed deletion is the failure to plan for, and §3.2's ordering is what
makes each partial state safe: cancelled but not deleted is a person with no
subscription and their data intact, which is recoverable. The reverse is not.

There is no support tooling and no admin control to fix an individual, so a stuck
deletion is the founder in the Stripe dashboard and the Supabase dashboard. The
runbook is §9e of the founder's brief, carried in `12-go-live.md`.

---

## 4. Implementation

Follow `architecture.md` for the project's actual folder structure, navigation,
and naming conventions — place files where existing screens/components live; the
paths below are intent, not literal if they conflict with the repo. Follow
`code-standards.md` for component patterns, typing, and lint cleanliness.

Build in this order, verifying each step before the next:

**Step 1 — The signed-URL constant (D47).**
One shared constant at five minutes, applied at all seven call sites including the
hardcoded one.
*Verify before moving on:* no duration literal remains at any call site, and every
signed URL expires at five minutes when checked.

**Step 2 — The storage sweep, on its own, before any deletion exists.**
Enumerate a user's objects across all four buckets and delete them. Verify by listing
afterwards.
`OPEN: awaiting answer to Q98`.
*Verify before moving on:* run it against a seeded account with files in all four
buckets and confirm the buckets are empty of that user's objects by listing, not by
return value.

**Step 3 — Wire the Stripe cancellation.**
Call the existing immediate-cancel function. **⚠️ It currently has no callers; this is
the call it was written for.** Do not modify it.
*Verify before moving on:* a seeded account with a live subscription has it cancelled
immediately at Stripe, and running it twice is harmless.

**Step 4 — The deletion action, in order, failing closed.**
Cancel, sweep, delete rows, delete the auth user. Each step gated on the previous
succeeding. No user id argument.
`OPEN: awaiting answer to Q99` — how the auth user is removed, and whether an admin
client already exists for it.
*Verify before moving on:* force a failure at each step and confirm nothing after it
runs and the account is left in the recoverable state.

**Step 5 — The screen, with type-to-confirm (D58).**
A destructive row in the danger zone. **The user types `DELETE` to enable the final
action, and it stays disabled until the string matches exactly** — a localised
equivalent if the app ever localises. Hold-to-confirm and a plain dialog are both
declined: this is irreversible health data, and the friction is the feature.
Render D59's money line when a live subscription or trial exists, and D57's remaining
copy once decided. **⚠️ No save offer, no diversion, no discount.**
**⚠️ Not gated:** drive it from a lapsed, read-only account.
*Verify before moving on:* a read-only account completes deletion end to end.

**Step 6 — The refund-request warning, per D56.**
Do not build against a guess.
*Verify before moving on:* an account with an open request sees whatever D56 decides,
and one without sees nothing extra.

**Step 7 — Drive it, and prove the absence.**
**⚠️ Seed on `@trackd-qa.invalid`. Delete BY ID ONLY.**
**⚠️ Clean up Stripe objects BEFORE deleting the user** — which is what this flow now
does, so this is a test of the flow rather than a manual step.
*Verify before moving on:* every box in §5 answered yes, by observation.

---

## 5. Check When Done

Gates and environment:

- [ ] `tsc` clean, ESLint clean, all tests pass, `next build` succeeds
- [ ] Verified by DRIVING the running app at 390x844 on `http://localhost`
- [ ] Verified against real Stripe test mode, never a fixture
- [ ] Every dialog: focus moves in, Tab cycles inside it, Escape closes it, and focus
      returns to the trigger
- [ ] Every tap target at least 44px
- [ ] Animation collapses to nothing under `prefers-reduced-motion`
- [ ] Nothing sits under the fixed bottom nav or the FAB
- [ ] The deletion action refuses an anonymous caller and another signed-in user, and
      **takes no user id**

The order, proven by breaking each step:

- [ ] **Stripe is cancelled before anything is deleted**
- [ ] A failed cancellation stops the deletion entirely, and the account is intact
- [ ] **Storage objects are deleted before any database row**
- [ ] A failed sweep stops the row delete, and the account is intact
- [ ] The auth user is removed last
- [ ] Every step is idempotent and a retry after a partial failure completes cleanly

Nothing remains:

- [ ] No live subscription exists at Stripe for the deleted account
- [ ] **All four buckets confirmed empty of that user's objects, by listing them**
      afterwards rather than by trusting the delete call
- [ ] Every cascaded table is empty of that user
- [ ] The auth user no longer exists
- [ ] No orphaned webhook events become unattributable as a result

Signed URLs:

- [ ] The TTL is five minutes everywhere, from one constant
- [ ] No duration literal remains at any of the seven call sites, including the avatar
      page's
- [ ] A signed URL is dead at five minutes and one second

The exit is never blocked:

- [ ] **A lapsed, read-only user completes deletion end to end**
- [ ] No part of the flow consults write access
- [ ] No save offer, discount, pause or diversion appears anywhere in it
- [ ] The confirmation does not imply a refund
- [ ] The final action is disabled until the typed string matches `DELETE` exactly,
      and a near-miss does not enable it
- [ ] The money line renders when a live subscription or trial exists, and is absent
      when neither does
- [ ] Neither a hold gesture nor a plain dialog can complete the deletion

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

4. **Migrations are written, never applied.** This spec produces no SQL. If any is
   needed it stops and asks first, and any file it eventually produces opens with a
   ▶ HOW TO RUN THIS block and ends with a VERIFY block that returns rows, for the
   founder to apply by hand.

---

## 7. Open items

**`OPEN — D56, whether an open refund request survives deletion.`** A legal-lane
question as much as a product one, because retention and erasure pull opposite ways.

**Recommended: warn at deletion time and retain nothing.** Honest, cheap, and it puts
the decision with the person whose money it is. Stripe holds the invoice and the
payment record regardless, so the money stays traceable even when the request does
not.

**`OPEN — D57, the rest of the deletion confirmation's copy.`** The money line is
signed (D59) and the mechanism is decided (D58). What remains is the title and the
body around them: it must be clear that this is permanent, it must not read as a
threat or a plea, and it must say what "everything" covers, since a user typing
`DELETE` deserves to know that their photos and bloodwork go too.

I have not drafted it, and the reason is the same one that applied to the Manage
sentence: this is the last thing a leaving user reads, and the tone belongs to you
rather than to me. **Give me one line and I will build the set around it**, or tell me
the shape and I will draft it.

**`Q98`** — where storage object paths are recorded, and whether objects are keyed
under a user-id prefix in each bucket. A prefix layout gives a second, independent way
to enumerate; a flat layout means the rows are the only map, which raises the cost of
getting §3.4's ordering wrong.

**`Q99`** — how the auth user is deleted, and whether an admin client already exists
for it, so this follows a pattern rather than inventing one.

**`Q100`** — the seven signed-URL call sites, so D47's constant reaches all of them.
