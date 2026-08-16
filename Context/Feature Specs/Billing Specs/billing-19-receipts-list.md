Save as: Context/Feature Specs/19-receipts-list.md

*(Canonical path. The founder saves these locally as `billing-19 - Receipts List.md`,
so the filename on disk may differ. Cross-spec references are by number.)*

# Spec: Receipts List

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

**Depends on:** `08-billing-screen.md`, which builds the Manage sub-screen and the
Receipts row this replaces.

**⚠️ Post-launch and the last spec in the corpus.** Launch is Thursday 20 August;
receipts hand off to Stripe's hosted portal until this ships, and `08` says so on the
screen rather than implying otherwise.

**Seams:**

- `08` owns the Manage screen and currently routes Receipts to the portal through the
  approved handoff. **This spec changes the destination and nothing else about that
  screen.**
- `17` established that Stripe sends automatic receipt emails for payments and refunds.
  **This is the in-app record, not a replacement for those** — the two answer different
  questions and neither makes the other redundant.
- `18` makes the currency per invoice rather than fixed.

---

## 1. Goal

Somebody can see what they have paid, in the app, without leaving it.

Today the only route to an invoice is Stripe's hosted portal, which means a handoff
dialog, another origin, and a page that does not look like this product. For a rare
action that is a reasonable trade — it is the trade `08` makes deliberately for card
management — but reading what you have paid is not rare, and it is the question people
ask before they ask for a refund.

**Working looks like this:** a list, newest first, each row saying when, how much, in
what currency, and whether anything happened to it afterwards. A tap opens the invoice
itself.

---

## 2. Out of Scope (do NOT build)

- **Do NOT** store invoice data in our database. §3.2.
- **Do NOT** compute, format, or adjust an amount. Every figure comes from the invoice.
- **Do NOT** build an invoice renderer. Stripe's hosted invoice is the document.
- **Do NOT** gate this behind write access. §3.5.
- **Do NOT** remove the card-management handoff to the portal. Only Receipts moves.
- **Do NOT** email anything. `17` established that Stripe already does.
- **Do NOT** show another user's invoice under any circumstance. §3.4.
- **Do NOT** treat this as a launch blocker.
- **Do NOT** merge anything to `main`.

---

## 3. Design Decisions

### 3.1 What a row says

**When, how much, in what currency, and what happened to it.** Newest first.

**The status is the part that is easy to get wrong and expensive to omit.** A paid
invoice, a refunded one, a partially refunded one and a failed one are four different
facts, and a list that shows only amounts tells a refunded customer they were charged
and stops there. **Somebody checking whether their refund came through is one of the
two reasons this screen exists.**

**A tap opens Stripe's hosted invoice**, in a new context, because that document is the
receipt and rebuilding it would be inventing a second version of a financial record.

**⚠️ A zero-dollar invoice is labelled, never left bare (D69).** Free periods raise
invoices, and a row reading "$0.00" with nothing beside it tells somebody nothing —
worse, it looks like an error on the one screen that exists to be unambiguous about
money. The discriminators already exist on the subscription, and each maps to a label:

| Marker | Row reads |
|---|---|
| Courtesy period, monthly grant | Free month (save offer) |
| Courtesy period, weekly grant | Free week (save offer) |
| Grace-aligned | Your 14 days on us |

The amount still renders as **$0.00 USD**, per the house rule that the currency is
always named.

**⚠️ An undiscriminated zero-dollar invoice renders bare and is not hidden.** None
should exist. If one does, hiding it would conceal exactly the state worth finding, so
it shows as it is and **`11`'s script flags it as unattributed** — the same treatment
an unattributable webhook gets, for the same reason.

### 3.2 Read live, store nothing

**Invoices are read from Stripe at request time, server-side, and nothing is
persisted.** No table, no migration, no sync job, no cache to go stale.

The reasoning is the same one that keeps prices in Stripe: **a stored copy of a
financial record is a second version of the truth, and the day it disagrees with
Stripe is the day somebody is reading the wrong one.** Refunds and disputes both change
an invoice after it is issued, and a local copy would need a sync path for each.

**The cost is a network call on a screen open, and it is the right cost.** This is a
rare screen and correctness beats latency on it.

**Full history, paginated (D68).** Not a rolling window and not a recent-twelve view.
**This audience keeps years of protocol data; their payment record sits beside it**,
and a product that truncates the financial half of that record is making a judgement
about what somebody is allowed to keep.

**⚠️ Pagination is built from day one rather than added when it hurts.** A yearly
subscriber accumulates slowly, a weekly one accumulates fifty-two invoices a year, and
a list that silently shows the first page is a list that hides old receipts. **This is
the same failure `11` §3.2 guards against**, in a place where it is visible to a
customer rather than to a script.

### 3.3 Currency comes from the invoice

Each row's currency is the invoice's own. **Not the account's, not the current plan's,
and never converted.**

Today every invoice is in one currency and this looks like ceremony. **After `18` it is
not**, and a customer who subscribed before a currency change would otherwise see their
history rewritten into a currency they were never charged in.

### 3.4 Whose invoices

**The customer is resolved from the verified session**, through the caller's own
row-level-scoped client, exactly as the cancel and portal paths already do. **The
action takes no customer id and no invoice id from a client.**

**⚠️ An invoice id is a financial record identifier and it must never be accepted as an
argument.** Every export of a `"use server"` module is a publicly dispatchable HTTP
endpoint, and an endpoint that fetches an invoice by id is one guess away from another
person's billing history.

**The hosted invoice link is Stripe's own URL and is not access-controlled by us.**
Open it in a new context; do not embed it, do not proxy it, and do not treat its
presence in the page as harmless — it is a link to a financial document, and it belongs
to the row it came from.

### 3.5 Never gated

**A lapsed, read-only account can read its receipts.** They paid for them, the records
are theirs, and a product that hides your payment history when you stop paying is
describing itself badly at the exact moment somebody is deciding whether to complain.

`05`'s gate covers writing. This is reading.

**A deleted account has nothing to show**, because `16` cancels and removes everything —
Stripe's own records survive for the founder, which is where a post-deletion question
gets answered.

### 3.6 The empty state

**A new subscriber has no invoices**, and a trialist may have one for zero. Say so
plainly rather than showing an empty box, and **do not imply something has gone
wrong** — no receipts is the normal state for most of a trial.

### 3.7 Invariants this spec touches

- **A screen never states a price, date or promise the server would contradict.** §3.2
  is the strongest available form of that: there is no local copy to contradict
  anything with.
- **A server action never accepts an identifier saying whose data to act on.** §3.4,
  and an invoice id is the sharpest example in the corpus.
- **A user's logged data is never deleted, hidden, or withheld to apply commercial
  pressure.** §3.5 extends that to their payment history.

### 3.8 If this goes wrong after go-live

A failed fetch shows a failure and offers the portal, which still exists and still
works. **The fallback is the thing this replaces**, which makes this the safest screen
in the corpus to get wrong. The general runbook is §9e, carried in `12-go-live.md`.

---

## 4. Implementation

Follow `architecture.md` for the project's actual folder structure, navigation, and
naming conventions. Follow `code-standards.md` for component patterns, typing, and lint
cleanliness.

Build in this order, verifying each step before the next:

**Step 1 — The read path.** Session-scoped, paginated to exhaustion or with an explicit
"show more", returning only the fields the list renders. **⚠️ No id arguments.**
*Verify:* an account with more invoices than one page shows all of them; another user's
customer cannot be reached by any argument.

**Step 2 — The list.** Newest first, with date, amount, currency and status. Follow
`ui-context.md`. **⚠️ 44px tap targets, and nothing amber.**
*Verify:* driven at 390x844 and 320x568.

**Step 3 — Statuses.** Paid, refunded, partially refunded, failed — each visibly
different. *Verify:* seed one of each on a test clock and read the list cold.

**Step 4 — The invoice link.** Opens Stripe's hosted invoice in a new context.
*Verify:* it opens, and nothing embeds or proxies it.

**Step 5 — Repoint `08`'s Receipts row here**, leaving the card handoff untouched.
*Verify:* Card still goes through the approved handoff; Receipts no longer does.

**Step 6 — The empty and failure states.** *Verify:* a new subscriber sees the empty
state; a forced fetch failure offers the portal.

**Step 7 — Drive it, including read-only.**
**⚠️ Seed on `@trackd-qa.invalid`, delete BY ID ONLY, clean up Stripe objects first.
`http://127.0.0.1` does not hydrate. Do NOT run `next build` while a dev server is
running.**
*Verify:* every box in §5 answered yes, by observation.

---

## 5. Check When Done

- [ ] `tsc` clean, ESLint clean, all tests pass, `next build` succeeds
- [ ] Verified by DRIVING the running app at 390x844 on `http://localhost`
- [ ] Verified against real Stripe test mode with a test clock, never a fixture
- [ ] Every tap target at least 44px, and nothing amber is a control
- [ ] Animation collapses to nothing under `prefers-reduced-motion`
- [ ] Nothing sits under the fixed bottom nav or the FAB

The data:

- [ ] **Nothing is stored locally**: no table, no cache, no sync job, and no migration
- [ ] Every amount, date and currency comes from the invoice
- [ ] **Each row's currency is the invoice's own**, not the account's or the plan's
- [ ] **The list paginates**, and an account with more invoices than one page shows all
      of them
- [ ] **Full history is reachable**, with no window, cutoff or recent-only view
- [ ] **A courtesy user's list shows the labelled free row followed by the real charge
      row**, driven on a test clock
- [ ] A grace-aligned zero-dollar invoice reads "Your 14 days on us"
- [ ] Every zero-dollar amount still renders as "$0.00 USD"
- [ ] An undiscriminated zero-dollar invoice renders bare rather than hidden, and
      `11` flags it
- [ ] Paid, refunded, partially refunded and failed are each visibly distinct
- [ ] A refunded invoice cannot be mistaken for a paid one

Access:

- [ ] The customer resolves from the verified session
- [ ] **No action accepts a customer id or an invoice id from a client**
- [ ] Another signed-in user cannot reach these invoices by any argument
- [ ] An anonymous caller is refused
- [ ] **A lapsed, read-only account can read its receipts**
- [ ] The hosted invoice opens in a new context and is neither embedded nor proxied

The seam:

- [ ] `08`'s Receipts row points here; the Card row still uses the approved portal
      handoff
- [ ] A fetch failure offers the portal as a fallback
- [ ] The empty state reads as normal, not as an error

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

4. **Migrations are written, never applied.** This spec produces no SQL, deliberately:
   §3.2 is the reason there is nothing to store.

---

## 7. Open items

~~`D68 — how much history the list shows`~~ **Resolved 15 Aug 2026.** Full history,
paginated. Carried in §3.2.

~~`D69 — zero-dollar rows`~~ **Resolved 15 Aug 2026.** Labelled from the existing
subscription markers, never bare; an undiscriminated one shows as it is and is flagged
by `11`. Carried in §3.1.

**Nothing blocking remains.** One question worth answering during Step 3.

**`Q105`** — how a partial refund appears on Stripe's invoice object for this account's
configuration, so the four statuses in §3.1 are distinguished from the invoice's own
fields rather than inferred from an amount comparison. An amount comparison would
misread a proration credit as a partial refund, which is exactly the kind of wrong
number this corpus has spent its length avoiding.
