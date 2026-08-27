Save as: Context/Feature Specs/17-email-and-auth-identity.md

*(Canonical path. The founder saves these locally as `billing-17 - Email And Auth
Identity.md`, so the filename on disk may differ. Cross-spec references are by number.)*

# Spec: Email and Auth Identity

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

**Depends on:** nothing. It is the missing foundation the others have been working
around.

**⚠️ Post-launch, and not a blocker.** Launch is Thursday 20 August and the product
ships without an email system, deliberately — every promise made in the launch set was
written to be true without one.

**Seams, and they run one way: this spec must not quietly change what other specs
promised.**

- **`07` carries "we'll remind you first" on the in-app banner and push.** Stripe's
  email is supplementary. **When this ships, that does not automatically change** —
  making email the carrier is a decision, not a consequence.
- **`10`'s refund reply comes from the founder's own mail client.** That is pinned.
  **⚠️ When a sending domain exists, the reply must not silently become an automated
  message** — the two-business-day line was written about a person replying.
- `12` gains launch-morning checks for Stripe's own email settings.
- `06`'s notice is in-app only and the founder accepted that a non-opener lapses
  without warning. **This spec is what would change that**, and doing so is a decision.

---

## 1. Goal

Trackd Co can send an email, and its sign-in screen says its own name.

There is no transactional email service wired anywhere in this codebase. The only mail
any user has ever received is a Supabase password reset, sent from Supabase's own
infrastructure. Two consequences run through every other spec.

**A user who stops opening the app cannot be warned before a charge.** That is why the
beta notice is in-app only and why a non-opener lapses cold, and it is why the offer's
reminder rests on push and a banner.

**The Google sign-in screen names the Supabase project rather than Trackd Co.** The
first thing a new user is asked to trust is a name they have never heard.

**Working looks like this:** a sending domain on trackdco.app, authenticated properly,
wired into Supabase for auth mail and available directly for anything else — and a
sign-in screen that says Trackd Co.

---

## 2. Out of Scope (do NOT build)

- **⚠️ Do NOT add an email to any existing flow because it is now possible.** Every
  promise in the launch set was written to be true without email. Changing a carrier is
  a decision per flow, not a migration.
- **⚠️ Do NOT automate the refund reply.** `10` pinned it to a person.
- **Do NOT** send marketing, digests, or anything a user did not ask for. This is
  transactional capability only.
- **Do NOT** put health content in an email. Not a compound name, not a dose, not a
  bloodwork value, not a photo. The same rule as `13` §3.5, for the same reason, on a
  channel that lands in an inbox somebody else may see.
- **Do NOT** replace Supabase's auth mail with our own sending path. Custom SMTP means
  Supabase sends **through** our domain; the auth flows stay Supabase's.
- **Do NOT** treat this as a launch blocker or reference it as one.
- **Do NOT** merge anything to `main`.

---

## 3. Design Decisions

### 3.1 Two jobs, one domain, and they are not the same job

**Auth mail** — password resets, and anything else Supabase sends. Today it comes from
Supabase's infrastructure. It should come from trackdco.app, which is what custom SMTP
does: Supabase keeps owning the flows and the templates, and our domain owns the
envelope.

**Product mail** — anything we decide to send ourselves. Nothing today. The capability
is what this spec builds; **what gets sent through it is each owning spec's decision.**

**One authenticated sending domain serves both.** Two would be two reputations to
maintain and two ways for one to poison the other.

**⚠️ Password reset is the only mail users receive today, which makes deliverability a
lockout risk rather than an inconvenience.** A misconfigured domain does not degrade
the experience; it means somebody cannot get back into an account holding their
medical history. **The cutover is staged**, and §4 keeps the old path working until the
new one is proven.

### 3.2 The channel slot

The notification layer sends web push and nothing else. **It gains an email channel
slot behind the same interface**, so a future message can choose a channel without its
call site knowing which one it got.

**The slot ships empty.** Building the seam and filling it are different decisions, and
§0's seams exist precisely so that filling it later cannot silently rewrite a promise.

**What each channel is worth, stated so a future decision is made with it in view:**
push reaches a device that granted permission and is subscribed; the in-app banner
reaches anybody who opens the app; email reaches an address that may be stale (§3.4)
and may land in spam. **No channel reaches everybody, and no combination does.**

### 3.3 Stripe's own emails (D65)

**Automatic receipt emails are ON.** Successful payments and refunds both. Toggled in
test today; **`12`'s launch-morning checklist gains the live-mode toggle for both,
verified alongside the trial-ending email setting.**

This is worth naming as the exception to §2's first rule: it is not us sending mail, it
is Stripe sending mail about a transaction Stripe processed, and it needs no
infrastructure from us. **It also covers the receipt case entirely**, which is why `19`
builds an in-app list rather than an email.

**⚠️ Stripe's other emails have timing this spec does not control**, and `12` decides
what to do about them after the observation. Nothing here changes that.

### 3.4 ⚠️ The Stripe customer's email is written once and never refreshed

It is set when the customer is created, from the verified session, and **nothing ever
updates it.** There is no local column holding it either — Stripe is the only place it
exists for billing purposes.

So a user who changes their address in the app keeps the old one at Stripe
indefinitely. **Every Stripe email — receipts, refunds, trial reminders, dunning —
goes to an address they may no longer read**, and nothing in the product would show
that anything was wrong.

**Fix it here**, because this is the spec that makes email matter: when a user's
address changes, the Stripe customer is updated to match. **⚠️ There is a silent
failure to close alongside it** — customer creation accepts an undefined address
without erroring, so a future auth path yielding no email would create an uncontactable
customer and the trial would start normally. Assert rather than assume.

### 3.5 The sign-in screen

The Google sign-in screen names the Supabase project. **It must name Trackd Co.**

`OPEN: awaiting answer to Q104` — whether that name comes from the OAuth application's
own configuration, from Supabase's project branding, or from the auth domain, because
the fix differs and only one of them is in the repo.

**⚠️ Changing an OAuth application's identity can invalidate existing sessions or force
re-consent.** Establish that before touching it, and if it does, the change belongs on
a quiet morning with the ~90 existing users in mind.

### 3.6 Invariants this spec touches

- **No secret ever reaches a client bundle.** SMTP credentials and any sending key are
  server-side only.
- **A user's logged data is never deleted, hidden, or withheld.** Nor transmitted:
  §2's health-content ban applies to this channel absolutely.
- **A screen never states a price, date or promise the server would contradict.** §0's
  seams are that invariant applied across time — a promise written when no email
  existed must not be quietly reinterpreted once one does.

### 3.7 If this goes wrong after go-live

**A sending domain that fails silently is the failure mode.** Mail that bounces, is
filtered, or is never attempted looks identical from inside the product, and the first
symptom is a user who cannot reset their password.

So the cutover is staged, the old path stays available until the new one is proven, and
**the auth path is verified against a real inbox rather than a log line.** The general
runbook is §9e of the founder's brief, carried in `12-go-live.md`.

---

## 4. Implementation

Follow `architecture.md` for the project's actual folder structure, navigation, and
naming conventions. Follow `code-standards.md` for component patterns, typing, and lint
cleanliness.

Build in this order, verifying each step before the next:

**Step 1 — Stand up the sending domain, authenticated, and prove it before wiring
anything to it.** *Verify:* a message from it arrives in a real inbox at three major
providers, and authentication passes on each.

**Step 2 — Point Supabase auth mail at it via custom SMTP.** **⚠️ Keep the existing
path available until Step 3 passes.** *Verify:* a password reset arrives, from our
domain, and the link works.

**Step 3 — Prove the auth path against real inboxes, then retire the old one.**
*Verify:* reset and any other auth mail delivered and actioned at each provider. **A
log line is not verification.**

**Step 4 — Add the empty channel slot to the notification layer.** *Verify:* the
interface compiles with no email implementation wired, and no existing call site
changed.

**Step 5 — Keep the Stripe customer's email current, and close the undefined case.**
*Verify:* changing an address in the app updates Stripe; a customer cannot be created
without one.

**Step 6 — The sign-in screen, per Q104.** **⚠️ Establish the session impact first.**
*Verify:* the screen names Trackd Co, and existing sessions survive or the cost is
known and accepted before the change.

**Step 7 — Confirm nothing changed that was not decided.** *Verify:* no flow gained an
email, the refund reply is still a person, and `07`'s carrier is unchanged.

---

## 5. Check When Done

- [ ] `tsc` clean, ESLint clean, all tests pass, `next build` succeeds
- [ ] No SMTP credential or sending key is reachable from a client bundle
- [ ] Mail from the domain authenticates and arrives at three major providers
- [ ] **A password reset arrives and works, verified against a real inbox**
- [ ] The old auth path was retired only after the new one was proven
- [ ] The channel slot exists and is empty, with no call site changed
- [ ] Changing an address in the app updates the Stripe customer
- [ ] A Stripe customer cannot be created without an email address
- [ ] Stripe's automatic receipt emails are on for successful payments **and refunds**,
      in test, with the live toggle on `12`'s checklist
- [ ] The sign-in screen names Trackd Co
- [ ] Existing sessions survived, or the cost was known and accepted first
- [ ] **No health content of any kind can appear in any email this system sends**
- [ ] **No existing flow gained an email**, and `07`'s carrier is unchanged
- [ ] **The refund reply is still sent by a person**

- [ ] **⚠️ THE PROJECT IS NOT DONE UNTIL COLD AGENTS COME BACK CLEAN.** Once everything
      is built, run independent cold-agent reviews — one on money and races, one on the
      gate and entitlements, one on the UI at 390x844 — and keep fixing and re-running
      until no CRITICAL and no HIGH findings remain. Payments are the strict bar.

---

## 6. The four standing rules

1. **⚠️ DO NOT EDIT THE CONTEXT FILES.** They are fixed input. If work seems to require
   changing one, stop and ask the founder. Only `progress-tracker.md` and
   `next-tasks.md` are updated as work proceeds.

2. **⚠️ THE PROJECT IS NOT DONE UNTIL COLD AGENTS COME BACK CLEAN.** As stated at the
   end of §5, and it applies to the work as a whole.

3. **Billing is verified against real Stripe test mode, never a fixture.**

4. **Migrations are written, never applied.** This spec produces no SQL as written. If
   storing an email locally becomes necessary it stops and asks first.

---

## 7. Open items

**`OPEN — what email should carry, once it can.`** Not a question for this spec to
answer, and named so it is not answered by accident. Three candidates, each owned
elsewhere: the beta notice for a non-opener (`06`), the courtesy-charge reminder
(`07`), and dunning. **Recommended: decide them one at a time, each as its own
decision**, because each one changes a promise that was made in writing without email.

**`Q104`** — where the Google sign-in screen's name comes from, and whether changing it
invalidates existing sessions or forces re-consent. Blocks Step 6 only.
