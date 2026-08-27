Save as: Context/Feature Specs/18-multi-currency.md

*(Canonical path. The founder saves these locally as `billing-18 - Multi Currency.md`,
so the filename on disk may differ. Cross-spec references are by number.)*

# Spec: Multi-Currency Pricing

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

**Depends on:** `02b` for the checkout disclosure, `08` for the Billing screen, and
`14` for the reporting side.

**⚠️ Post-launch, and nothing here is built now.** Launch is Thursday 20 August, ships
single-currency, and this spec is not referenced as a blocker anywhere. **What this
document does today is hold the signed price table and the seam audit**, so that the
build, when scheduled, is a build rather than a design.

**Seams:** every surface that renders a price. §3.4 is the audit.

---

## 1. Goal

A customer in Sydney sees a price in Australian dollars, is charged in Australian
dollars, and never sees a converted figure beside a charge that lands in something
else.

**Never client-side conversion.** A converted figure beside a charge in another
currency is a dispute, and it is the reason this is Stripe multi-currency prices rather
than arithmetic.

---

## 2. Out of Scope (do NOT build)

- **⚠️ Do NOT build any of this now.** Single-currency ships.
- **⚠️ Do NOT convert a currency anywhere, client-side or server-side, for display or
  for charging.** Every figure is a Stripe price object.
- **Do NOT** recompute the table from an exchange rate. §3.1.
- **Do NOT** change a subscriber's currency after their first subscribe. §3.3.
- **Do NOT** block, warn about, or degrade a card from a country with no price. §3.3.
- **Do NOT** show a price and then change it once more is known about the user. §3.2.
- **Do NOT** merge anything to `main`.

---

## 3. Design Decisions

### 3.1 The signed table (D6)

Weekly, monthly, yearly, in that order.

| | Weekly | Monthly | Yearly |
|---|---|---|---|
| **USD** (default and fallback) | 3.99 | 11.99 | 69.99 |
| **AUD** | 5.99 | 17.99 | 109.99 |
| **EUR** | 3.99 | 10.99 | 64.99 |
| **GBP** | 3.49 | 9.99 | 54.99 |
| **CAD** | 5.49 | 15.99 | 94.99 |
| **NZD** | 6.49 | 19.99 | 119.99 |

**⚠️ These exact figures are the prices. They are never recomputed from an exchange
rate, and they must not be "corrected" toward one.** The charm endings are deliberate:
a price ending in .99 in every market is a pricing decision, and a rate-derived figure
would produce 108.43 and undo it. **A price that drifts with a rate is a price nobody
decided.**

**USD is the default and the fallback for every country not listed.**

**At build time each row becomes a Stripe price object** on the existing product, and
every screen keeps reading the price object rather than the table. **The table above
is the input to that build, not a source the app reads.**

### 3.2 ⚠️ Card country cannot choose the currency, and this is the one real conflict

The signed rule is that currency is selected by card country at checkout, USD when
unknown. **That ordering does not work, and the reason is structural rather than
awkward.**

**The price is displayed before a card is entered.** The disclosure states the renewal
amount at first paint. And for a customer charged today, `02a` establishes that the
Payment Element takes its amount **at mount** and cannot be switched afterwards — so
the currency is already fixed before the card field exists.

**So card country can only ever be a correction after the fact**, and correcting means
the number changes under somebody who has already typed their card into it. That is the
one thing a payment screen may not do.

**Three ways out, and this needs a decision (D67):**

- **A. Choose from an earlier signal** — edge geolocation or a stored country at page
  render — and treat card country as a **mismatch detector only**. If they disagree,
  the displayed currency stands and the mismatch is logged. **Never change a number
  after showing it.**
- **B. Offer a currency picker** on the paywall, defaulting to the earlier signal. The
  user chooses, so nothing changes under them, at the cost of a control on a screen
  that currently has none.
- **C. Use Stripe's own adaptive pricing**, if the account supports it, and let Stripe
  make the choice before the Element mounts.

**Recommended: A, with C checked first.** A is the smallest change and it preserves the
rule's intent — the customer's own market — without the ordering problem. C may do the
same thing with less of our code, which is worth ten minutes of checking before
building A. B is the fallback if neither signal proves reliable, and its cost is real:
a currency picker on a paywall invites shopping for the cheapest market.

**⚠️ Whatever is chosen, the number shown at first paint is the number charged.**

### 3.3 Frozen at first subscribe, and never a blocked card

**A subscriber's currency is fixed at their first subscribe and never changes on
renewal.** No re-evaluation, no correction if they travel, no change if the table is
edited later.

**This needs no new storage**: the subscription carries its price, and the price
carries its currency. Reading it is reading Stripe.

**⚠️ A card from a country with no price is never blocked.** They are charged in USD,
which is the fallback, and nothing tells them their card is wrong — because it is not.
**Refusing a foreign card to protect a pricing table is refusing money.**

### 3.4 The seam audit — every surface that renders a price

Each of these currently assumes one currency, and each must take it from the price
object. **This list is the audit and it stands whether or not the build is scheduled.**

- **Checkout disclosure** (`02b`) — the amount, the currency code and the interval
  suffix, including the monthly-equivalent bracket on yearly, which must be computed
  within the same currency and never across one.
- **The paywall's plan rows**, including the savings badge, which is a ratio within one
  currency.
- **The read-only pop-up**, whichever way its plan list resolves.
- **The Billing screen** and the Manage summary (`08`).
- **The save offer's gift card** (`04`), currently signed as "$0.00 USD" — **a zero is
  the one amount where the currency is cosmetic, so this line changes with the suffix
  rule below rather than with the amount.**
- **`14`'s revenue**, which already buckets per currency and picks the largest bucket
  as the headline. **That machinery becomes real rather than theoretical**, and its
  per-currency bucketing is the reason totals in different currencies are never added.
- **`19`'s receipts list**, per invoice.
- **`15`'s switch preview**, which comes from Stripe and therefore already carries the
  right currency.

### 3.5 The USD suffix (D66)

**While the product is single-currency, every rendered price keeps its USD suffix.**
"$69.99 USD/yr", not "$69.99/yr".

The dollar sign is ambiguous across at least five of the six currencies in the table
above, and the suffix is what makes the approved copy true for a reader in Sydney
looking at a US price today. **It also means the copy does not change shape when the
table ships** — the currency code is already there, it just starts varying.

### 3.6 Invariants this spec touches

- **A screen never states a price the server would contradict.** §3.2's
  never-change-after-display rule and §3.1's Stripe-price-object rule are both this.
- **Nobody is ever charged after being told they would not be.** Charging in a
  different currency than the one displayed is a version of that, and the frozen-currency
  rule in §3.3 is what prevents it at renewal.

### 3.7 If this goes wrong after go-live

A currency mismatch is a dispute, and disputes cost the money, the fee and a mark on
the processor account. **`11` gains an assertion when this ships**: every live
subscription's price currency matches the currency of every invoice raised against it.
The general runbook is §9e, carried in `12-go-live.md`.

---

## 4. Implementation

**Nothing is built now.** When scheduled, in this order:

**Step 1 — Resolve D67**, checking Stripe's own adaptive pricing before building a
signal of our own.

**Step 2 — Create the per-currency Stripe prices** from §3.1's table, exactly, each at
an interval count of one. **⚠️ Typed from the table, never derived from a rate.**

**Step 3 — Walk the §3.4 audit**, surface by surface, taking every figure from the
price object.

**Step 4 — Prove the ordering.** The number at first paint is the number charged, in
every variant, with a card from a matching country and a mismatching one.

**Step 5 — Prove the freeze.** A subscriber's currency survives a renewal, a plan
switch, a courtesy period and a table edit.

**Step 6 — Add `11`'s currency assertion.**

**⚠️ Seed on `@trackd-qa.invalid`, delete BY ID ONLY, clean up Stripe objects first.
`http://127.0.0.1` does not hydrate.**

---

## 5. Check When Done

- [ ] `tsc` clean, ESLint clean, all tests pass, `next build` succeeds
- [ ] Verified against real Stripe test mode with a test clock, never a fixture
- [ ] **Every price in Stripe matches §3.1's table exactly**, to the cent
- [ ] No figure anywhere is derived from an exchange rate
- [ ] **No conversion exists anywhere in the codebase**, client-side or server-side
- [ ] Every rendered price comes from a Stripe price object
- [ ] **The number shown at first paint is the number charged**, verified with a
      matching and a mismatching card country
- [ ] No number changes after being displayed
- [ ] A subscriber's currency survives a renewal, a plan switch, a courtesy period and
      an edit to the table
- [ ] **A card from a country with no price is charged in USD and never blocked or
      warned**
- [ ] The monthly-equivalent bracket and the savings badge are computed within one
      currency, never across two
- [ ] `14` reports per-currency buckets and never adds two currencies together
- [ ] Every surface in §3.4's audit was checked and is listed as done
- [ ] `11` asserts that a subscription's price currency matches its invoices
- [ ] While single-currency, every rendered price still carries its USD suffix

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

4. **Migrations are written, never applied.** This spec produces no SQL: the currency
   travels with the price and needs no column.

---

## 7. Open items

**`OPEN — D67, how the currency is chosen before a card exists.`** §3.2 sets out the
conflict and the three ways out. **Recommended: check Stripe's adaptive pricing first,
then build option A** — an earlier signal, with card country as a mismatch detector
only and never as a corrector.

**Everything else about this spec is decided.** The table is signed, the rules are
signed, and the audit stands. When this is scheduled, D67 is the only thing between the
table and the build.
