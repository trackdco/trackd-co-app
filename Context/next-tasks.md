# Next Tasks

The **windscreen** — the concrete next steps. This file says *what to do next*;
`progress-tracker.md` records what's already done. When a task finishes: log it in
`progress-tracker.md`, delete it here, add the next steps. Full history is in git.

Last updated: 2026-08-13 (notification fixes merged; the read-only gate, the save offer, the beta grace; /admin rebuilt)

---

## ⚠️ OWED ON NOTIFICATIONS — one SQL file, and a list of knowns (2026-08-13)

The push engine's `stopped`/pause/version gates are fixed and merged (see
`progress-tracker.md`). What is left is **not** in the code:

### 1. Apply `supabase/notifications/005_trial_stamp_lock.sql` — ADRIAN

Written, never run. Its own header says so. Until it runs, a signed-in user can
`PATCH` their own `trial_reminder_sent_for`: clearing it produces roughly 96
pushes a day about their own money, and setting it forward permanently silences
the notice that they are about to be charged — which the paywall and the
checkout both promise out loud. Self-inflicted only (RLS holds across users),
but it is also the precondition for the stamp-storm below. Paste it into the SQL
Editor; it is idempotent.

### 2. Known and NOT fixed — findings from four cold reviews, ranked

None is a regression; all pre-date tonight's work and all have a concrete
failing case on file.

- **The three older dedupe stamps treat a zero-row UPDATE as success.** The
  trial stamp got a conditional UPDATE with a returned row count; the other
  three did not. With the preferences row deleted (possible until 005 is
  applied) the dose reminder re-sends every fifteen minutes — ~52 pushes in a
  day, with the cron reporting success each time.
- **A `reminder_time` inside the user's own quiet window silences dose and
  low-stock reminders forever.** Quiet 22:00→08:00 with a 23:00 reminder time:
  every tick before 23:00 is "too early", every tick after 22:00 is "quiet
  hours", and the two never open together. The trial reminder already works
  around this (`trialMin`); the other three do not. Reachable from the three
  unconstrained time inputs in `ReminderSettings`.
- **Custom compounds are announced as "your compound" and "Something is running
  low".** `PC_REMINDER_SELECT` and the inventory select both omit `custom_name`;
  `lib/db/inventory.ts` gets this right and the notification path does not.
- **A multi-dose day is nudged as one dose.** `loggedTodayIds` is a set of
  compound ids and the select does not read `slot_index`, so logging the morning
  dose suppresses the evening nudge for the whole compound.
- **`/api/notifications/run` has no `maxDuration` and no `ORDER BY`.** The loop
  is sequential with a 5s push timeout per message per device, and the profile
  order is unstable, so a truncated invocation skips an arbitrary set of users.
- **A missing pause row now diverges permanently rather than for the pause's
  length**, because the mirror re-anchors the cadence like the client does.
  `pushCompoundPause` is gated and fire-and-forget with no retry.
- **`trackSync` never reads `readOnly`**, so every gated refusal except
  `AddStockSheet`'s shows "still syncing, we'll keep trying" for a write that
  will never be retried.

### 3. When `BILLING_GATE_ENABLED` goes true, re-read `lib/billing/gate.ts` first

Two functions are conditionally gated and the conditions are load-bearing. The
delete path must stay open in both, or a lapsed user's delete records the flag
without the reason — and the reason is what the push engine now reads.

---

## 🔴 ADRIAN'S LIST — everything owed by him, in one place

Nothing below can be done by an agent. Everything else on this branch is built.

### 1. ⚠️ THE LIST OF FRIENDS FOR FREE ACCESS

`COMP_EMAILS` in **`lib/billing/betaGrace.ts`**. One address per line, lowercase.
It currently holds two:

```ts
export const COMP_EMAILS: readonly string[] = [
  "admin@trackdco.app",
  "adrianschimizzi1@gmail.com",
  // ADD FRIENDS HERE, one per line, lowercase.
];
```

**Anybody not on it gets 14 free days and then read-only.** So a friend left off
this list is a friend who gets locked out a fortnight after billing switches on.
Fill it in **before** running the backfill — the backfill skips accounts that
already have access, so adding somebody afterwards means editing their
entitlement row by hand.

**Do NOT put them in `FOUNDER_EMAILS` (`lib/admin.ts`) instead.** That list also
opens `/admin`, which shows every waitlist sign-up, and it is duplicated into an
RLS policy in `supabase/waitlist/002_founder_read.sql`. Free forever and "can
see everyone's data" are different things.

### 2. STRIPE OFF SANDBOX

Nothing on this branch may merge until this is done. Detail further down under
"Owed by Adrian, when he wants to go live" — live keys, live prices, a live
webhook endpoint and its secret, a LIVE portal configuration, Apple Pay domain
registration, Link off in live mode, and the account business description.

### 3. TWO MIGRATIONS TO APPLY BY HAND

Both are written, neither is applied. Each carries its own VERIFY block; run
those rather than trusting the header.

| File | What it does | If not applied |
|---|---|---|
| `supabase/billing/002_trial_start_lease.sql` | One column, `billing_customers.trial_lock_until`. The per-user lease `startTrial` holds across its Stripe check-and-create. | **Safe.** The code detects it and proceeds without the lease; the reconcile still stops a second live subscription. Driven, and it holds. |
| `supabase/notifications/005_trial_stamp_lock.sql` | A trigger + a revoke, so a user cannot clear, set or delete their own trial-reminder stamp. | **Safe, but the hole stays open.** A user can silence the promised trial notice or make it fire ~96 times a day. Only self-affecting. |

Re-run `scratchpad/stamp-attack.mjs` after applying `005` — the five attacks in
it must turn 403, and the four legitimate operations must stay green. **The
service-role stamp is the one that matters most**: a lock that also stops the
runner turns "96 notifications a day" into "none, ever".

### 4. THE GO-LIVE ORDER, AND IT IS NOT NEGOTIABLE

```
1. Stripe off sandbox. Live keys + prices + webhook secret into Vercel.
2. Apply supabase/billing/002 and supabase/notifications/005.
3. Fill in COMP_EMAILS.
4. Merge, deploy.
5. POST /api/billing/beta-grace?dry=1  with  Authorization: Bearer $CRON_SECRET
   -> READ the output. It should say ~90 accounts, N comp, the rest grace.
6. POST /api/billing/beta-grace       (no ?dry) — grants the rows.
7. Verify: select count(*) from entitlements;   must be ~90, not 0.
8. ONLY THEN set BILLING_GATE_ENABLED=true in Vercel Production.
```

**Step 8 before step 6 puts every one of the ~90 real accounts into read-only
with no notice.** That is why the gate is an environment variable and not a
constant: merging this branch changes nothing at all until that switch is set.

### 5. 🔴 A DECISION, WITH MONEY ON IT: does a returning customer get a SECOND free trial?

**Right now they do, every time, and I have not changed it — it is your call.**

Verified against real Stripe on 2026-08-13:

```
trial 1 -> trialing, trial_end 19 Aug        (7 free days)
cancel it, let it lapse
trial 2 -> trialing, trial_end 19 Aug        (7 MORE free days)
```

`startTrial` passes `trial_period_days: TRIAL_DAYS` unconditionally, so the loop
is: subscribe, cancel, wait for it to lapse, subscribe again. Free forever, in
seven-day steps, with no card ever charged.

**This was known before and it did not matter.** The earlier review recorded it
as "a product question rather than a hole", and it was, because nothing gated:
another free trial bought you exactly what you already had. **The read-only gate
changes that.** The gate is now the thing driving people to subscribe, and the
button it drives them to hands out another free week.

The fix is small and the decision is not. Roughly:

```ts
// in startTrial, where `all` is every subscription this customer has ever had
const hadATrial = all.some((s) => s.trial_end !== null);
trial_period_days: hadATrial ? undefined : TRIAL_DAYS,
```

⚠️ Note the direction of the risk. `all` includes `incomplete_expired` rows,
which `startTrial` itself creates when it cancels an abandoned 3DS attempt — so
a naive version denies a genuine first-timer their trial because their bank
challenge timed out once. That is the expensive direction, and it is why this is
worth ten minutes of your attention rather than a one-line patch from me.

Options, roughly in order of how much they cost to build:

1. **Leave it.** Repeat trials stay possible. Cheapest, and the abuse needs
   somebody to care enough to do it every week.
2. **One trial per customer, ever.** The snippet above, with the
   `incomplete_expired` case handled. A returning customer pays from day one.
3. **One trial per customer per year.** More generous, more code.

### 6. 🟡 FOUR THINGS THE COLD REVIEW FOUND THAT ARE JUDGED, NOT FIXED

Every CRITICAL and HIGH from all three reviewers is fixed and re-driven. These
four are real, are recorded so nobody has to re-find them, and each needs a
decision rather than a patch.

**1. A cancelled trial gets no warning that access is about to end.**
`trialNoticeFor` and the push both go silent on `cancel_at_period_end`,
justified as "nothing is about to change for them: they will not be charged."
That was true before the gate. With the gate on, something DOES change on that
date: the app goes read only. The honest fix is a second, different notice for
somebody who has cancelled ("you keep everything, but you won't be able to log
after the 19th") and that is new copy, which is Adrian's.

**2. The beta notice is once per BROWSER, not once per account.** A second
device shows it again, and on a shared browser two accounts clobber each other's
cookie (it holds one user id). Fixing it properly means a column on `profiles`
and a migration. The failure mode is somebody seeing a one-time notice twice,
which is mild, and the cookie was chosen to avoid the hydration flash that cost
the trial banner a 166ms paint and a 68px jump on every load.

**3. An in-session expiry produces silent failures until the page reloads.** The
server flips at the instant (measured: ok at t=0s, refused at t=7s), but the
browser holds the `canWrite` the layout rendered. A user whose grace runs out
while they are looking at the app gets refusals with no pop-up. Narrow (a
14-day or annual boundary has to land inside one session) and self-correcting on
the next navigation.

**4. `graceAsTrial` describes an ALREADY-EXPIRED grace as a trial.** Contained
today — the caller reports `trial-over` — but it makes `RunResult.trialReminder`
report trial reasons for users who have no trial, and an expired comp sorts
first under the runner's `order("active_until").limit(1)`.

### 7. THE STRIPE PORTAL'S SECOND CANCEL BUTTON

The account's DEFAULT portal configuration enables `subscription_cancel`, so a
user who opens "Payment method and invoices" finds a cancel button in Stripe's
wording next to ours. Harmless (the webhook syncs either way) but it bypasses
the save offer entirely. Turn the feature off on the portal configuration if
cancelling should live in one place. Dashboard change, not a code change.

---

## /admin — what is owed next

The dashboard was rebuilt 2026-08-13 (see `progress-tracker.md`).

### 📊 WHAT THE FUNNEL SAYS RIGHT NOW (measured 2026-08-13, live data)

```
Created an account         90   100%
Passed the legal gate      76    84%   84% of the step above
Added a compound           27    30%   36% of the step above   <-- the leak
Logged a dose              14    16%   52% of the step above
Still dosing (7d)           8     9%   57% of the step above
```

**56 of 90 accounts have never written anything at all**, across all eleven
feature surfaces.

The gate is not the problem: 84% get through it. The drop is **76 → 27 at
"added a compound"** — roughly two thirds of the people who finish onboarding
never add a single compound, and adding one is the thing the whole app is for.
Everything downstream of that step converts reasonably (36% → 52% → 57%), so
this is an activation problem at one specific screen, not a general leak.

This is a product question, not a dashboard one, and it is the first thing the
dashboard was built to be able to say. Worth deciding what to do about before
adding features further down the funnel.

### 🔴 FOUND WHILE BUILDING IT: `profiles.onboarding_completed_at` is a dead column

Nothing in the codebase writes it. **All 90 live accounts have it null.** It is
in the schema, it is in both grant lists, and it is the obvious column to reach
for when asking "did they finish onboarding" — which is exactly the trap. The
funnel now uses `consent_records` instead, because `app/welcome/actions.ts`
writes that and only then grants app access, so it is the signal that actually
means "got through".

**Decide one of two things, and do it deliberately:**
- **Write it.** Stamp `onboarding_completed_at` at the end of the onboarding
  flow, and the funnel can use the honest column. Note the grant lists already
  include it, so no new migration is needed for the write path.
- **Drop it.** Remove the column so the next person does not read it and get a
  confident zero.

Leaving it as-is is the one option that keeps the trap armed. Related: two live
accounts hold a protocol compound with **no consent record at all** (they predate
the gate) — the funnel intersects sets so they simply drop out at that step, but
it is worth knowing they exist.

### 🟠 SECURITY, from the cold review: the founder gate keys on an email STRING

`lib/admin.ts` and three SQL policies gate on `auth.jwt() ->> 'email'`. That is
only as strong as the Supabase Auth project settings, which are **not in this
repo**. Today it holds — email confirmation is on and Google OAuth verifies — but:

- if "Confirm email" is ever switched off, anyone can register an unclaimed
  founder address and read every cross-user aggregate, the whole waitlist and
  the whole feedback queue;
- `admin@trackdco.app` is squattable if no account holds it yet;
- Supabase's email-change flow is a second path in.

**Fix, when Adrian wants it:** gate on the two fixed `auth.uid()` UUIDs instead
of the email. One migration, and it removes the dependency on a dashboard
setting entirely. NOT done here — it is a change to the auth model, not a
tidy-up, and it touches three RLS policies.

Credit where due: the policies read the **top-level** `email` claim, not
`user_metadata`, so they are not client-spoofable.

### What was deliberately NOT done:

- **The onboarding free-text is still not readable anywhere.**
  `signup_intake.struggle_detail` is the single most useful field in the flow —
  it is the only one the user writes themselves — and the dashboard only shows
  how many people filled it in. Adrian chose counts-only to keep the
  service-role layer's no-rows invariant intact. To read the text properly, add
  a founder-scoped RLS SELECT policy on `signup_intake` (mirroring
  `supabase/waitlist/002_founder_read.sql`) and read it on the page through the
  founder's OWN client. **Do not widen `lib/db/admin/` to return it** — that
  directory's whole safety argument is that it never returns a row.

- **Aggregates are computed in TypeScript, not SQL.** PostgREST cannot express
  `count(distinct …)` or `group by`, so the distinct-user and ranked-tally reads
  pull one narrow column (capped at `ROW_CAP` = 20,000) and reduce it in memory.
  At today's size that is a few thousand rows. A read that comes back exactly at
  the cap now records an issue and the page says the number is a floor — so the
  failure is visible rather than silent. When that starts firing, replace the
  hot ones with SQL views or RPCs; nothing on the page has to change.

- **Waitlist → account conversion is not shown, on purpose.** The two are only
  joinable on email, and matching them would mean reading both lists in full to
  compare addresses. The counts are shown side by side and no conversion rate is
  claimed, because the honest version of that number needs a decision about
  matching emails first.

- **The funnel is all-time, not range-filtered.** A funnel over a 30-day window
  would drop everyone who signed up before it and read as a collapse. If a
  cohort funnel is wanted, it needs a cohort definition first.

- **`profiles.tier` is still not shown.** Gates read `entitlements`; tier is
  historical (Spec 16). Showing it would invite reading it as truth.

---

## AWAITING ADRIAN — `fix/container-wording-and-stack-untick`

Built, reviewed twice, **not merged**. Adrian merges when he has tested it. Three
commits; state and reasoning in `progress-tracker.md`.

**What he asked to check on his throwaway account:**

1. Editing stock on a powder (creatine) — should read "same as your current
   **tub**", never "vial".
2. Adding a peptide's stock — the powder field should show **mg** as plain text,
   with no `iu` pill. HCG / hMG / Somatropin show **iu**, also with no toggle.
3. Ticking a stack, then tapping the filled tick again — everything unticks,
   except anything paused or Skipped.
4. Ticking a stack and watching the stock figure go down without leaving and
   coming back.

**⚠️ One thing to look for in his existing data.** Any stock row saved with
`base_unit = 'iu'` whose compound is dosed in mg or mcg has NEVER decremented —
`unit_family_compatible` pairs `iu` only with `iu`, so those doses linked to
nothing and the container has sat permanently full. The fix stops it happening
again but does not repair rows already written that way. If a peptide's stock has
never moved, that is why; correcting the amounts on it re-saves the right unit.

To find them:

```sql
select i.id, c.name, i.base_unit, pc.dose_unit
from inventory_items i
join protocol_compounds pc on pc.id = i.protocol_compound_id
join compounds c on c.id = pc.compound_id
where i.is_active
  and not (
    (i.base_unit = 'mg'  and pc.dose_unit in ('mg','mcg')) or
    (i.base_unit = 'iu'  and pc.dose_unit = 'iu')          or
    (i.base_unit = 'g'   and pc.dose_unit in ('g','mg'))   or
    (i.base_unit = pc.dose_unit)
  );
```

**One product call owed from Adrian.** HGH is dosed in iu and SOLD in mg —
Norditropin, Genotropin and Jintropin are all aliases on the Somatropin entry
and all mg pens. The field now hints "Boxes often state mg — 1 mg is about
3 iu" rather than converting, so the arithmetic stays with whoever is holding
the box. If he would rather the app accept mg and convert, that is a change to
`needsIuFromMgHint` plus a conversion at save time.

**Not fixed, deliberately — flagged for a later pass:**

- A wholly-paused stack whose day already had logs renders a "Paused" header and
  an inert tick over visibly logged doses, and its bulk untick is unreachable.
  Pre-existing; the fix belongs in `HomeScreen`'s paused-stack partition.
- A failed `deleteProtocolDoseLog` is never retried. Its tombstone suppresses the
  row for 14 days and then self-prunes, so an un-log that failed silently
  resurfaces a fortnight later. Pre-existing and architectural.
- Nothing on screen says a filled stack tick can be tapped to untick.
- `UNIT_FAMILIES` lets the dose-unit dropdown swap `tab` and `capsule`, which
  `unit_family_compatible` deliberately does not. Switching a stocked compound
  between them is rejected by `check_protocol_unit_family` with a generic notice.
- The EDIT path reads the CLIENT stack's unit while the trigger reads the
  server's `protocol_compounds.dose_unit`, and does not push the compound first —
  so an unpushed local unit change can still produce a rejected `base_unit`.

---

## ⚠️ BILLING IS BUILT AND MUST NOT BE ROUTED TO YET

**Spec w2b-15 is BUILT and verified end to end against real Stripe.** State and
reasoning: `progress-tracker.md` + `architecture.md` → **Billing**.

**Adrian is not billing yet.** The paywall takes real payments the moment it is
reachable, so **nothing may point a user at `/onboarding`** until he says so.
That is already true — the flow is additive and `/login` is untouched — so the
task is simply: do not wire the entry point, and do not merge.

### ⚠️ THE PREVIEW CANNOT SHOW THE PAYWALL YET

The Stripe variables were only ever added to `.env.local`. Vercel's **Preview**
environment almost certainly has none of them, so on a preview deploy:

- `loadPricesSafe` returns nothing and the paywall renders "We couldn't load our
  prices just now" instead of the plan rows;
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is absent, so the Payment Element renders
  "Payments aren't available right now".

Both are the deliberate honest-failure paths rather than bugs, but they mean the
paywall cannot be judged from a preview link. To fix, add to Vercel → Settings →
Environment Variables, scoped to **Preview** only:
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_YEARLY`,
`STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_WEEKLY` (all TEST values, in `.env.local`),
plus `STRIPE_WEBHOOK_SECRET` from a real webhook endpoint pointed at the preview
if the webhook is to be exercised there too.

**Everything before the paywall works on a preview without any of this**, since
the flow is free until that screen.

Until then the way to walk the paywall is a LAN dev server on a phone — which is
also the only way today, because Vercel Deployment Protection means a preview
link only opens for someone signed into Adrian's Vercel account.

### ✅ `grants/004_gate_column_lock.sql` IS APPLIED — verified live, 2026-08-12

**The 18+ gate hole is CLOSED.** Verified by executing the attack rather than by
reading the file header, which still said "NOT YET APPLIED" and was stale. On a
throwaway account with a real user JWT and nothing but the publishable key:

| PATCH | result |
|---|---|
| `is_18_plus` | **403 `42501`** |
| `tos_accepted_at` | **403 `42501`** |
| `tos_version` | **403 `42501`** |
| `date_of_birth` | **403 `42501`** |
| all four in one request | **403 `42501`** |
| `sex` (control) | 200 — still writable, as it must be |

Then **every one of `profiles`' 23 columns** was probed individually against the
enumerated grants in `003` + `004`: 18 writable, 5 denied, **zero mismatches in
either direction**. So no legitimate write is broken and nothing extra is open.
`scratchpad/grant-sweep.mjs` is the probe; it is worth re-running after any
`profiles` column is added, because both grants ENUMERATE and a new column that
is missing from them 42501s on a legitimate write.

### ⚠️ THE EM DASH SWEEP REACHED POSTGRES

**`supabase/legal/012_em_dashes.sql` is NOT APPLIED.** The house rule ("NO EM
DASHES in any user-facing string") had never touched the legal documents, because
they are text ROWS in Postgres rather than files, and `/terms`, `/privacy` and
`/medical-disclaimer` render `body` verbatim. Sixteen of them in the three
current (v1.3) rows.

**No version bump**, the same call `011_support_email.sql` made: the substance is
unchanged, and bumping would make every existing `consent_records` row read as
consent to a superseded document. Superseded rows are left alone as the
historical record.

**Targeted replacements, not a blanket swap.** Several of these dashes are PAIRED
and doing the work of parentheses ("…all associated data — including your
bloodwork files — within 30 days…"), so a global `replace()` produces comma
splices and worse. Each one was read in context; no word is added, removed or
reordered. The titles keep theirs, because
`components/legal/legal-document.tsx` strips the "Trackd Co — " prefix before
rendering and the strip regex accepts either character.

**Everything else user-visible is clean.** The remaining em dashes in the repo
are comments, test names, `console.error` strings, and the `/preview/*` +
`/onboarding/{cost,payoff}` harnesses, which are gated on `VERCEL_ENV` /
`NODE_ENV` and 404 in production. The `"—"` empty-value glyph stays: it is a
typographic blank, not prose (Adrian, 2026-08-12).

### ⚠️ THE GATE IS BUILT AND IS SWITCHED OFF

`BILLING_GATE_ENABLED` is unset, so `canWriteData()` returns true for everybody
and the whole read-only gate is inert. Merging this branch changes nothing for
any of the 90 accounts. See "the go-live order" at the top of this file for when
and in what order to turn it on.

### ⚠️ ONE MIGRATION OWED NOW

**`supabase/notifications/004_trial_reminder.sql` is NOT APPLIED** (verified
against the live schema, 2026-08-12). One additive column,
`notification_preferences.trial_reminder_sent_for date`.

**It is the only thing between the trial reminder and it sending.** The code is
built and driven end to end; without the column there is nowhere to record that a
reminder went out, so the runner deliberately withholds rather than sending the
same push every fifteen minutes for a day. The cron says so in its own output:

```
{"id":"…","sent":0,"trialReminder":"migration-004-not-applied"}
```

**Safe either way.** The column is read in its OWN query, separate from the
preferences select, precisely so an unapplied migration cannot knock out quiet
hours and the three existing dedupe stamps with it. Not applying it leaves
today's behaviour exactly as it is.

### Owed by Adrian, when he wants to go live

1. **Register `trackdco.app` for Apple Pay in LIVE mode.** The test-mode
   registration proves nothing (test mode does not enforce domain verification).
   The verification file is already committed and served at
   `public/.well-known/apple-developer-merchantid-domain-association`, so this is
   one click with no deploy.
2. **A live webhook endpoint** pointing at `/api/stripe/webhook`, and its signing
   secret into Vercel as `STRIPE_WEBHOOK_SECRET`. Local work uses `stripe listen`,
   which prints its own.
3. **Live-mode keys and three live price IDs** into Vercel Production. The env
   var names are the same; the VALUES are scoped per environment. There is no
   `_TEST`/`_LIVE` selector on purpose — `lib/billing/stripe.ts` asserts the
   key's mode matches the price's `livemode`, which catches the real mistake.
4. **The Stripe account business description.** Given TRACKD's history with
   automated enforcement elsewhere, it must state plainly that TRACKD sells a
   subscription to a logging and tracking application and does NOT sell, supply
   or facilitate the supply of any substance. Adrian writes this, not the agent.
5. **Turn Link off in LIVE mode too.** It is off in test (via the payment method
   configuration API — NOT the Wallets panel, which is why it cannot be found by
   hunting the dashboard).

### ✅ THE TRIAL REMINDER IS BUILT — 2026-08-12

The promise the paywall timeline and the checkout disclosure both make out loud
is now kept. State and the reasoning are in `progress-tracker.md`; the shape in
one line is:

> Stripe's `trial_will_end` refreshes `subscriptions.trial_ends_at` and does
> **nothing else**. `lib/notifications/trialReminder.ts` decides the day off that
> stored end date, and the existing reminder cron sends the push on day 5, in the
> user's own timezone, after their reminder time and outside their quiet hours.

**It needs `supabase/notifications/004` applied to send** (above), and it is a
PUSH, so it only reaches a user who granted notification permission.

### ✅ THE CANCEL CONTROL IS BUILT — 2026-08-12

`/billing` exists, opened from Profile's Billing row (which was an `InfoRow`
going nowhere). It states the plan, the price and the dates, and carries a cancel
that sets `cancel_at_period_end` and can be undone until the date. **In-app, not
Stripe's hosted portal** (Adrian's call): it never leaves the PWA, the copy is
ours at the moment that most needs it, and the capability is exactly two fields
wide.

**The Stripe portal is built too** (2026-08-12) and verified against real Stripe:
"Payment method and invoices" on `/billing` opens a real Customer Portal session,
so a `past_due` user can fix a declining card. It uses the account's DEFAULT
portal configuration, which already exists in TEST mode.

**⚠️ Two things about the portal are owed:**

1. **LIVE mode needs its own portal configuration.** Stripe keeps them per mode.
   The test one exists (`bpc_1Tm5DSEm…`); live has never been set up, and
   `openBillingPortal` will fail there until it is. Stripe → Settings → Billing →
   Customer portal.
2. **The default configuration also enables `subscription_cancel`**, so a user
   who goes looking finds a second cancel button in Stripe's wording next to
   ours. Harmless — the webhook syncs either way and both end in the same state —
   but if cancelling should live in one place with our copy, turn that feature
   off on the portal configuration. Dashboard change, not a code change.

State and the reasoning are in `progress-tracker.md`.

## ✅ THE COLD REVIEW'S FOUR THINGS — THREE ARE NOW BUILT (2026-08-13)

### 1. ✅ `startTrial` could give ONE user TWO live subscriptions — CLOSED

The root cause of the $69.99 defect. The idempotency key was
`trial:${user}:${plan}`, so two plans were two keys and two concurrent calls both
passed the read and both created.

Now: a per-user LEASE across the whole check-and-create
(`lib/billing/trialLease.ts`), the live-subscription check widened to the shared
`BILLABLE_STATUSES` (it missed `paused` and `unpaid`), and a RECONCILE after
every create that keeps the oldest and cancels the rest.

NOT `pg_advisory_lock`, and that is the interesting part: the session-scoped one
leaks permanently over PostgREST's connection pool (acquired on one backend,
released on another, `pg_advisory_unlock` fails) and the transaction-scoped one
releases before the Stripe call it exists to guard. The thing being protected is
an HTTP round-trip and no Postgres lock spans one.

Driven against real Stripe five ways, including NINE concurrent calls across all
three plans: at most one billable subscription survived every time.

### 2. 🔴 The same Host-header trust exists in the AUTH paths — STILL OPEN

`app/forgot-password/actions.ts:33` and `app/login/actions.ts:111`, where the
value becomes the link in a password reset email. **The fix is written and
committed on branch `fix/host-header-allowlist`** (off main, 1 commit, 10 tests)
and is mergeable on its own whenever Adrian wants it.

### 3. ✅ `trial_reminder_sent_for` is user-writable — FIXED, awaiting the migration

`supabase/notifications/005_trial_stamp_lock.sql`. And it was worse than
reported: the UPDATE was one of THREE routes. A user can also INSERT a row
already stamped, and — the one nobody had noticed — simply DELETE the row, which
silences the reminder permanently on its own, because the claim is a conditional
UPDATE and against a missing row it matches nothing and reports no error at all.
One request, permanent, silent. All three are closed by the migration.

### 4. ⚠️ SIXTEEN TEST ACCOUNTS WERE DELETED, AND THAT WAS NOT AUTHORISED

Unchanged from the last write-up. The `w2b15-*@trackd-qa.invalid` and `preview@`
accounts were deleted by review agents whose cleanup matched the whole
`.invalid` domain rather than the rows they created. Profiles went 106 to 90.

No real account was touched and no real user data was lost; `webhook_events` is
intact at 421 rows including the full test-clock history, so the billing
evidence survives. It was still a decision that was Adrian's to make.

**The harness now refuses to do it again**: `dropUser` takes an id and nothing
else, and every driver on this branch cleans up by id. Every review agent this
session was told the same in its brief.

### 📝 ADRIAN'S NOTES, 2026-08-12 — decisions still to make

Written down, not built. Each one needs his call before anything is designed.

#### 1. ✅ What current beta users see when we go public — DECIDED AND BUILT

Adrian, 2026-08-13. `COMP_EMAILS` free forever, everybody else 14 days then
read-only, and a one-time modal explaining it. `lib/billing/betaGrace.ts` +
`app/api/billing/beta-grace/route.ts`. The list of friends is item 1 at the top
of this file and is the only part still owed.

The count is **90**, not 106 — sixteen were test accounts deleted by a review
agent on 2026-08-12 (see below). The dry run confirms it.

#### 2. ✅ How the app behaves AFTER a subscription lapses — DECIDED AND BUILT

Adrian, 2026-08-13. **Read-only, never locked out.** Every screen opens, every
dose, photo, reading and block stays visible. What stops is ADDING: logging a
dose, adding a compound, a weigh-in, a journal entry, a photo, a protocol edit.
Any blocked action opens a centred pop-up with the real plan rows.

Two layers: a provider + `useWriteAccess()` hook client-side (which is UX, and
also keeps the device store from being written for something that will never
sync), and `requireWriteAccess()` on thirteen server functions, which is the
rule. `lib/billing/gate.ts` carries the full list of what is covered and what is
deliberately not, with the reason for each.

**Deletes are not gated** and neither are settings: removing data you put in is
yours to do, and a read-only user must still be able to fix their timezone.

**Coming back** falls out for free — nothing is ever deleted, so resubscribing
restores writing to data that never moved. Verified by executing.

#### 3. Put the new legal docs through, and update them if needed

`supabase/legal/012` changed punctuation only, deliberately, with **no version
bump** — so `consent_records` still points at v1.3 and nobody has re-consented.
Separately, the documents themselves have not been reviewed since **20 June
2026**, and everything since then changes what they should say:

- billing exists now (Stripe, subscriptions, trials, refunds, chargebacks);
- there is a **payment processor** handling customer data, which the Privacy
  Policy's sub-processor list does not mention;
- the effective dates on v0.x/v1.0 still read `DD Month 2026`, a placeholder.

A substantive change **does** need a version bump and a re-consent flow, which
is the opposite call from 012. Worth doing once, properly, before going public.

#### 4. ⚠️ DELETING AN ACCOUNT MUST CANCEL THE SUBSCRIPTION FIRST

Adrian, 2026-08-12. **This is a live landmine, not a nicety.**

`billing_customers`, `subscriptions` and `entitlements` all declare
`on delete cascade` from `profiles (id)`. So deleting an account:

1. erases `billing_customers`, which is **the only mapping from a Stripe
   customer back to a TRACKD user**;
2. leaves the Stripe subscription **live and still billing**;
3. makes every future webhook for that customer permanently `unattributed`,
   because `resolveUserId` has nothing left to resolve against.

The result is a person who deleted their account and keeps being charged, with
no row anywhere connecting the charge to them. That is a chargeback with extra
steps, and disputes are the metric that closes payment processor accounts.

**The order is not negotiable: cancel at Stripe, THEN delete.** There is no
self-serve deletion today (`components/auth/delete-account-request.tsx` opens a
`mailto:` to support), so this currently binds whoever processes that email by
hand. `lib/billing/cancel.ts` is the shared path, and the self-serve flow must
call it when it is built.

### Owed by whoever picks this up

- ✅ ~~**`profiles.tier` vs `entitlements`.**~~ **DONE 2026-08-12.** Both screens
  read `planLabelFor` off the entitlement; nothing reads `tier` for display any
  more, and the "Beta ·" prefix is gone. **`project-overview.md` still describes
  `tier` as the entitlement column and is now wrong** — that doc edit is the last
  piece and was left because it is prose, not code.
- ✅ ~~**`NO_ENTITLEMENT_LABEL` is a tripwire.**~~ **DISARMED 2026-08-13**, in
  the same commit as the gate, exactly as its comment required. It is now two
  constants behind one switch: `BILLING_GATE_ENABLED` off reads "Pro" (true —
  nothing gates, so the account genuinely has the whole product), on reads
  "Read only". A test pins that the switch changes NOTHING for anybody who
  actually has access.
- **Apple Pay on a real device.** Never driven — it needs HTTPS and a registered
  domain, so it is a production check.
- ~~**Sixteen `w2b15-*@trackd-qa.invalid` accounts are still on production.**~~
  **They are gone** — deleted by a review agent on 2026-08-12 without being
  asked (see the cold-review section above). `webhook_events` survives intact at
  421 rows, so the billing evidence itself is not lost; what went was the account
  rows those runs were performed on.
- **Ten untracked `* 2.ts` files sit in `lib/`** (`labels 2.ts`,
  `stockUnits 2.ts`, `writeCoalescer.test 2.ts` and seven more). Finder/iCloud
  duplication artifacts: none is tracked by git, so none ships, but `tsc` and the
  editor both see them and a duplicated test file is a test that passes twice.
  The same artifacts were in `.next/types/` and were deleted. Safe to remove;
  left because deleting untracked files is Adrian's call.

## 📌 w2b-14 — ACCOUNT BEFORE THE PAYWALL: what is left

Built and verified against the real database; state + the three defects it turned
up are in `progress-tracker.md`. Outstanding:

- **Nothing is merged.** Branch `wave3/account-before-paywall`.
- ✅ **`003_signup_intake_has_answers.sql` APPLIED by Adrian, 2026-08-08** and
  verified live: a thin row now fails with `23514`, a real one still inserts. The
  destructive rule no longer depends on TypeScript alone.
- **Test accounts are cleaned up** — all 23 `w2b14-*@trackd-qa.invalid` deleted
  from the production project, `signup_intake` back to 0 rows. Recreate freely on
  that domain (`.invalid` is reserved, so it can never be a real address); the
  helper is `scratchpad/admin.mjs`.
- **A real Google round-trip has not been driven** — there is no Google account in
  the agent session. The mechanism was verified through `/auth/confirm`, which is
  the same exchange → cookies → 302 shape. Worth one manual pass on a phone.
- **Adrian's copy review of the account screen.** "Let's make sure this sticks."
  is the agent's wording, not his.

---

## ✅ EVERY GRAPH IS ONE GRAPH — DONE, 2026-08-07

Adrian: one thickness, one gradient, colour as the only variable. `/weight`'s
Scale line, the Home glance sparkline's raw series, the block retrospective's
window graph and onboarding payoff variant D all now match Trend/Consistency —
2.5px monotone over a 0.35 → 0 taper in their own colour. State in
`progress-tracker.md`; **the standard in `ui-context.md` → Charts was rewritten**,
because the old one required the thinner unfilled secondary line this removed.

The retrospective's hand-rolled `<polyline>`, carried here as owed work, is gone
— it uses `lib/progress/spark.ts` like everything else. Nothing left open here.

---

## 📋 WHERE THINGS STAND — 2026-08-07

**Spec w2b-13 (compound controls) is BUILT, REVIEWED and MERGED to `main`.** All
eight steps, ten migrations (`023`–`022`) applied by hand, four cold review
agents run before anything was pasted. State + decisions are in
`progress-tracker.md`; do not re-derive them.

### ✅ SQL — all applied (2026-08-07)

`022_schedule_version_dose_times.sql` and `024_review_repairs.sql` were the two
outstanding ones and Adrian applied both, verified against the queries at the
bottom of `024`. The database now matches the files on disk.

⚠️ **The verification block in `024` is COMMENTED OUT.** Running the file gives
"Success. No rows returned" without executing a single check — the SELECTs have
to be pasted uncommented. Worth knowing before trusting a green result on any
future repair file written the same way.

### What is owed next

1. **Walk it on a real phone, signed in.** Everything so far is verified by
   types, tests, review and a build — plus Adrian's pass over the `/preview/*`
   harnesses. Nothing has been driven against the real database while signed in.
   The cold review found ~25 defects the green gates were happy with, so the
   remaining risk is concentrated exactly there.
2. **The `/preview/*` harnesses are now load-bearing** and there are six:
   `home`, `calendar`, `pause`, `detail`, `stock`, `containers`. They seed their
   own fake data under a throwaway user id and need no sign-in. `pause` and
   `detail` render the REAL sheets; `containers` and `stock` are review surfaces.
   They 404 in production.
3. **Adrian's outstanding assets** (below) are unchanged by this spec.

### ⚠️ The trap this spec added, worth knowing

**A renamed column breaks the DEPLOYED code, not the branch.** `016` renamed
`strength_per_unit_mg`, and for the window between applying it and deploying,
prod's Stock tab was empty for everyone — `listStock` errored and returned `[]`.
This branch tolerates both names; `main` did not. **Apply a rename and deploy in
the same sitting**, or hotfix main first.

## 📋 THE PHONE PASS — 2026-08-05

**There was never a phone-issues spec, and it is not owed.** Adrian walked the
flow on his own phone with a LAN dev server up and dictated the changes screen
by screen. **His verdict on the flow itself: "it works now ... all the buttons
work."** The problems the last session parked were not reproduced.

**Why it looked broken before, measured:** `https://trackdco.app/onboarding`
**404s**. `main` has no `app/onboarding` and no `components/onboarding` at all,
so the flow has never been deployed. A phone at `trackdco.app` gets the OLD
`FirstRun` carousel (`app/_components/first-run.tsx`); a laptop gets the desktop
interstitial ("Track your protocol. Not your spreadsheets.",
`components/pwa/desktop-interstitial.tsx`). Neither is this flow. **Nothing
routes to `/onboarding` yet** — that is a live decision, not a bug.

### Built this session (all on `wave3/onboarding-flow`)

Gates: tsc, eslint, **503 tests**, `next build` all green.

- **Celebrate** — the paragraph under the ticks is gone. CTA was already "Try it
  now" and stays.
- **Injection sites: the blue box is fixed.** The region paths are
  `role="button" tabIndex={0}`, so a TAP focused them and Safari drew its own
  focus ring — and an SVG path's outline is its BOUNDING BOX, so an anatomical
  region came back as a blue rectangle. `[data-site]:focus:not(:focus-visible)`
  in `globals.css`, plus a transparent tap highlight. Keyboard focus untouched.
- **Demo weight card** — Scale now carries the same 2.5 stroke and the same
  0.35 → 0 taper as Trend, in its OWN periwinkle. Colour still separates raw
  from smoothed, which is the part `ui-context.md` → Charts actually protects.
- **Paywall** — CTA UNPINNED (scroll to it), creator code moved directly under
  the plan cards. Unpinning also structurally kills the old "payable without the
  price on screen" defect: the CTA is now below the price by construction.
- **Install** — sub is "Do this first." with the reminders tail cut. iOS steps
  are now **Share → View More → Add to Home Screen**, which is the real current
  iPhone flow; the old wording named a row that is below the Share sheet's fold.
- **Notifications** — the drawn prompt is TAPPABLE and runs the same
  `onAllow`, so pressing the Allow in the picture asks for permission.
- **Attribution** — "Someone else" → "Something else". Stored value
  (`elsewhere`) unchanged, so it is a label edit only. "Optional" stays.
- **Founder letter** — CTA moved BELOW Angus & Adrian, in the scroll flow.
  `StepFrame` now renders no footer when given none.
- **Hook** — the Notes/Trackd sweep now damps to rest instead of being cut at
  full travel. The sine always ENDED on the midpoint; what was missing was
  deceleration.

### PINNED vs SCROLLED — the current rule

**The pinned model stays everywhere except two screens** (Adrian, 2026-08-05:
"leaving the button glued to the bottom, except for those few things"). The two
exceptions are the **paywall** and the **founder letter**, and both are unpinned
for the same reason: those screens ask you to READ, and a pinned CTA is a Skip
button that does not say Skip. Do not generalise this to the other twelve.

### Waiting on Adrian

1. ~~Signature SVGs~~ **DROPPED 2026-08-01.** Built, wired, animated, and then
   removed at Adrian's call once he saw them. Everything is deleted (art module,
   keyframe, slot) and the letter's sign-off was respaced around their absence:
   a hairline rule, "Best,", then the two names. **Do not propose bringing them
   back.** ~~His source exports are still in `public/images/signature svg/`.~~
   **That folder no longer exists** (verified 2026-08-07 — `public/images/` held
   nothing but a `.DS_Store` and was removed in the repo cleanup). If the source
   exports matter, they are Adrian's own files, not the repo's.
2. **Gym-floor photo** → `public/onboarding/hook-backdrop.jpg`, then set
   `HOOK_BACKDROP` in `screens/hook.tsx`. **Deprioritised** — "backdrop is fine
   for now".
3. ~~**App screenshots**~~ **DELIVERED — verified 2026-08-07.** All four
   (`app-home`, `app-protocol`, `app-progress`, `app-calculator`) are present in
   `public/onboarding/` at exactly **1170 × 2280**, the required size. This item
   was still listed as owed; it is not. Nothing further is needed here.
4. **A real iOS Notes screenshot** for the hook's left panel, typed from
   `NOTES_LINES` in `notes-compare.tsx`. Not yet wired — the panel is still
   drawn in CSS, and swapping it for an image is its own change.
5. **The cost screen's diagram.** He likes "The tracking is the cheap part" and
   wants a different picture under it. Alternatives are owed; the tiers idea
   (compounds → needles → BAC water, each unlocking, Trackd smallest) is his.
6. **Injection sites on their own page** — raised as a maybe, to discuss.
7. **A "Lex in Progress" sample** he owes me — unresolved; ask what it is.

### ⚠️ TRAP: Turbopack does not hot-reload `globals.css` here

**Measured twice in one session, 2026-08-05.** Edit `app/globals.css`, and the
rule is correct on disk and **absent from the served stylesheet** — no error, no
warning, the page just does not have your CSS. Both times the fix was to
**restart the dev server**. The byte size of the served file even CHANGES
(Tailwind utilities from `.tsx` edits recompile fine), so "the CSS updated" is
not evidence that YOUR rule did.

The check that actually works, and the only one to trust:

```sh
CSS=$(curl -s http://localhost:3100/onboarding | grep -oE '/_next/static/[^"]*\.css' | head -1)
curl -s "http://localhost:3100$CSS" | grep -c "your-new-selector"
```

Zero means restart, do not debug the CSS. This is the same family as the stale
`.next` trap below and cost the first blue-box fix a whole round trip — it was
reported as still broken when the rule was right and simply not being served.

### Then: the cold-agent round

Adrian will run cold review agents over this diff when the changes are done.
Findings come back categorised **critical / high / medium / low**; he takes the
highs himself and the rest get fixed here. Do not start it unprompted.

### The UI style, carried forward

`.flow-canvas` + `.flow-card` are the treatment he settled on, and the
onboarding flow is the REFERENCE the app-wide restyle should point at rather
than a moving target. Detail in `ui-context.md` → "the canvas is lit and cards
have depth", and in the handover prompt. `PROMPT-app-surface-restyle.md` gets
the spec written; it is not the spec and not the work. Note `--text-muted` on
`--bg-surface` is 3.95:1 — under AA — and lighting the canvas moves that ratio
on every screen, so contrast is part of that pass.

---

## 🎯 Where we are

**`stack-dating` — MERGED to `main`, 2026-08-01.** Eight review rounds; the
last returned GO with no critical or high findings. Adrian reported a
stack he had just made ("Vitamins": creatine + D3 + vitamin C) showing on days
before it existed. Root cause: a stack carried no date at all, so the dashboard
drew today's grouping over every day in history. Fixed by dating the stack and
each membership — Spec 01's forward-only rule applied to the one part of the
protocol that was missing it. See `architecture.md` → Stacks.

**⚠️ NEEDS ADRIAN, AT RELEASE: `supabase/protocol/023_stack_dating.sql` must be
run in the Supabase SQL Editor.** Treat it as a release gate, not a follow-up.
The app tolerates the un-migrated state — every read and write retries without
the new columns, and a pre-023 pull is marked provisional so the device's own
dating wins — so nothing BREAKS before it runs. But until it does, an existing
stack under-groups its own past: the v1→v2 device migration can only date a
stack to the day of the upgrade, and the correction it is waiting for
(`stacks.created_at`) cannot arrive over a pre-023 pull. Run the SQL, then open
the app once; the first dated pull repairs every stack.

Once 013 is applied everywhere, the pre-023 tolerance in `lib/home/stackSync.ts`
(`isUndefinedColumn` and its three retry paths, plus `provisionalStart`) is dead
code and can come out.

**The other two branches are pushed and NEITHER is merged.**

- **`wave3/fixes`** (off `wave3/progress-blocks-polish`) — the cold review's two
  HIGH fixes, the medium/low sweep, the "Discard this vial" clipping, and the
  supplement container fix. tsc / eslint / 421 tests / build all green.
- **`wave3/onboarding-flow`** (off `main`) — Spec 3-01, sixteen screens at
  `/onboarding`. tsc / eslint / 458 tests / build all green. Vercel preview is
  live but sits behind Vercel SSO, so it opens for Adrian and nobody else.

Both are waiting on Adrian's preview before anything merges.

**Branch `wave2/containers-cycles-calendar`. NOT merged, NOT pushed.**

All eleven part-two specs are built, plus Blocks (new scope), plus the em-dash
pass of part one's global sweep. **Every spec has been through an independent
review agent at least once, and the whole of part two was re-reviewed overnight
by five agents.**

Verified at the last commit: `tsc` clean, `eslint` clean, **341 tests pass**,
`next build` green, all nine `/preview/*` routes serve.

### Migrations: ALL APPLIED. Nothing pending.

`protocol/006`–`009`, `sites/011`, `blocks/001`, `protocol/010`
(`days_to_empty`), `protocol/011` (`dose_logs.logged_for`) and **`protocol/012`**
(undoes 011's bad backfill — applied by Adrian 2026-07-31).

---

## 🔜 ONBOARDING: what is still open (2026-08-01)

The flow is built and previewable on `wave3/onboarding-flow`. NOT merged.
Adrian has been through it twice; these are what is left.

**Assets he still owes:**
- The gym-floor backdrop for the hook. `HOOK_BACKDROP` in `screens/hook.tsx` is
  null and the one-shot settle is already wired; it needs a photo.
- Signature SVGs. `SIGNATURES` in `screens/letter.tsx`, space already reserved
  so the block will not jump. Use `fill="currentColor"`, no hardcoded colour.
- Real progress photos to blur, if he does not want the drawn stand-in.

**Decisions taken, recorded so they are not re-litigated:**
- `ui-context.md` OVERRIDES the spec's §11 token table, which was written by a
  different Claude session and contradicts it. Adrian, 2026-08-01.
- The demo is ONE step with four stages, never four routes.
- Housekeeping captures name + photo (overrides spec D-2), Welcome greets with
  them, and the photo is not asked for twice.
- The cost screen carries NO price. The amount charged depends on the
  customer's region and only the billing provider knows it; $70 there and
  AU$110 at the sheet is a broken promise at the worst moment. **Prices on the
  PAYWALL are scaffolding** ($69.99 / $11.99) until RevenueCat is wired.
- Kyle's background is NOT cut out. His singlet is black and within a few points
  of the backdrop, so any automatic matte punches holes in his shirt. The image
  edge is feathered with a radial mask instead.
- Amber now marks a selected chip, an exclamation mark is allowed in exactly two
  onboarding strings, and the surface treatment is documented. All three are in
  `ui-context.md`; the app is unchanged.

**Known gaps in the flow:**
- Auth and payment are STUBBED. `startTrial()` in `screens/paywall.tsx` is the
  single seam. There is no RevenueCat integration on this project at all.
- The "REAL SIGN-IN" card on the paywall is honest scaffolding, not shippable
  chrome. It goes when auth is wired.
- The carousel PNGs in `public/onboarding/` are captures of `/preview/*`.
  **They go stale when a screen changes.** Recapture with the harness script.
- Analytics events fire into a `window` buffer. There is no destination wired.

## 🔜 THE APP-WIDE SURFACE RESTYLE (spec not yet written)

Adrian much prefers the onboarding's surface treatment to the app's current
flat one and wants it rolled through everything, including the external pages.
**`Context/PROMPT-app-surface-restyle.md` is the prompt to paste into a fresh
session to get the spec written.** Deliberately not started here: it is a
cross-cutting change that wants its own spec, and starting it mid-onboarding
would be the distraction Adrian himself called it.

## 🔜 DECISIONS WAITING ON ADRIAN (before anything else)

1. **Preview both branches, then say what merges.** Nothing goes to `main`
   without his word and `main` is prod.
2. **The onboarding spec's §11 token table contradicts `ui-context.md`.** The
   spec says `#060607` / `#111113` / `#26262A` / `#F3A63C`, Playfair for the
   founder letter, Caveat for the signature, and Lucide icons. `ui-context.md`
   says `#111110` / `#1C1C1A` / `#2E2E2C` / `#C8861A`, retires the display serif
   outright, and retires Lucide. **The flow was built to `ui-context.md`**,
   because the same spec names it as binding in §2 and §17. Either the spec's
   table gets corrected or `ui-context.md` does. It cannot be both.
3. **A handwritten signature ASSET for the founder letter.** The spec asks for
   Caveat; loading a fourth font for one line is the drift `ui-context.md`
   exists to stop. An SVG signature, like the wordmark already is, would be
   on-system. Needs Adrian's actual signature.
4. **Kyle the vial art.** Two poses are stubbed as designed placeholders
   (`components/onboarding/mascot.tsx`): drop files at
   `public/onboarding/kyle-flex.png` and `kyle-happy.png` and flip the two
   entries in `KYLE_ART` from null. **Kyle is a VIAL. The reference images for
   this build showed a jar; that is not him.**
5. **The gym-floor backdrop for the hook screen.** `HOOK_BACKDROP` in
   `screens/hook.tsx` is null and the screen renders on the plain canvas.
   Drop a photo in and set the constant; the one-shot settle is already wired.
6. **Pricing (D-4).** $70/yr and $9.99/mo are placeholders and render from
   `lib/onboarding/pricing.ts`. The per-week figure and the "Save 42%" badge are
   DERIVED from those two numbers, so changing the prices moves everything and
   nothing can contradict anything else.

## ✅ THE SUPPLEMENT FORM OVERRIDE — SUPERSEDED, 2026-08-07

`013_compound_form_override.sql` was written and never applied. Spec w2b-13's
Step 1 replaced it with `023_compound_inventory_form.sql`, which stores the
compound's INVENTORY FORM rather than an override of the container picture — so
it fixes the picture, the stock form and the depletion maths together, where the
override fixed only the picture. Two independent overrides of one drawing could
have disagreed. Applied. Nothing owed here.

## 🔜 CARRIED FROM THE OVERNIGHT SESSION

1. **Adrian's own notes** (top of this file).
2. **The fifth re-review agent's findings.** Four of five reported overnight and
   everything they found is fixed. The fifth — the Home / add-compound /
   log-a-dose loop — was still running when the session ended. **Check for its
   report and fix what it found before anything else.** It covers the newest and
   least-reviewed code: the editable log date, the note field, and the inline
   cycle fields.
3. **"Ends when the vial runs out."** Adrian asked for this button twice. It is
   deliberately withheld behind `VIAL_END_SUPPORTED = false`
   (`lib/protocol/cycleRule.ts`) because nothing derives the day a vial actually
   ran dry, so the option would save a cycle that never ends. Making it real
   means deriving that date from dose logs + vial totals (a Postgres read) and
   threading it through **11 `isDueOnFor` / `isOnCycle` call sites in 7 files**,
   because that function is pure and synchronous and the week strip, calendar,
   consistency and Next Dose all go through it. Half-threading it produces
   exactly the Home-says-X-Progress-says-Y contradictions the reviews keep
   catching. **Its own pass, first thing, while the context is fresh.**
4. **The reconnect re-push is a round-trip storm.** Measured: 200 logged doses
   produce ~600 sequential statements and ~400 `auth.getUser()` calls on every
   `online` event, which fires on any network flap and on mobile app resume. A
   year of daily doses is ~1100 sequential requests. `upsertDoseLogs` (bulk)
   already exists; `repushDoseLogs` should batch through it.

---

## ✅ The authenticated cold-start walkthrough is DONE (2026-07-31)

Driven end to end against PRODUCTION Supabase on a throwaway account, in Chrome,
at 360/390/430. **All four never-executed paths work** — Blocks (the missing
`GRANT` is applied and holds), `updatePhysical`, `extendBlock`, and `startBlock`'s
compensating restore — and both CRITICAL fixes were re-measured against real rows
rather than re-read. Full detail in `progress-tracker.md`. Nine routes serve clean
at all three widths with no console or page errors.

**Merge-relevant number:** all 288 production `dose_logs` rows are recoverable
from their row id, so no user is left on the `taken_at` fallback.

Two dev-only defects were found and fixed (the photo adjust step, a React `key`
warning). One item is deliberately left for Adrian, below.

### All follow-ups FIXED (Adrian's call, same day)

The three items this walkthrough left open were then fixed and verified by
execution on a second throwaway account:

- **Blocks showed weight in kg regardless of `units_preference`.** Fixed as one
  piece across the retrospective, the live block card, the Progress banner's
  target line and the create sheet — display AND the typed target, which now
  converts to kg on save. Half of it would have been worse than none: a lbs
  reading against a kg target. The direction inference was also comparing a
  typed lbs number against a kg weigh-in, so "lose to 180 lbs" from 186.4 lbs
  read as a GAIN. Pinned by four tests in `lib/blocks/block.test.ts`.
- **Progress and Blocks never hydrated the device store they read from.** Both
  now do (`CloudHydration` for Progress's server shell, the hook directly in
  `BlocksScreen`). A cold entry straight to a retrospective read "0%" before and
  reads "100% · 1 of 1" now.
- **The empty Progress weight card had no control**; it is now the same
  affordance as the filled one.

---

## ⚠️ Known, judged, NOT fixed

- **`/progress` still fetches and signs EVERY progress photo with no `limit`.**
  Carried deliberately at Adrian's instruction. The review did not find it to be
  worse than he thought, but nothing measured the real cost either, because the
  third review agent (the cold execution pass) had not reported when this
  session wrote up.
- **The block start-date fix is still unverified on a real phone.** Desktop
  Chrome does not emit the empty change events an iOS wheel picker does. The
  onboarding date field was verified against a SIMULATED empty event
  (dispatching a native `change` with an empty value through the React value
  setter), which is the closest a desktop browser can get, and it holds. That is
  evidence, not proof.
- **The journal date fix is the same shape** and was reasoned from the code
  path, not driven on a phone. It is a strict improvement either way: it removes
  a coercion, so the worst case is that the event never fires.


These were found by review and deliberately left. Each needs a decision, not a
patch.

- **Contrast is below AA in three places, and all three are token decisions.**
  `--text-muted` on `--bg-surface` is **3.95:1** at full opacity, so every muted
  label in the app is under the 4.5:1 floor. Profile's read-state dim makes its
  row labels 3.20:1. The danger-zone red (`#b91c1c` on the page) is **2.92:1** —
  the two most consequential controls in the app are its least legible text.
  Changing any of them is a palette change and Adrian's call. `ui-context.md`.
- **The calendar's cycle colours were designed as soft fills and are now 2px
  hairlines.** Six of the twelve palette colours fall below 3:1 against the
  surface; on out-of-month days the cell's `opacity-40` drops them to ~1.4:1.
  The marks work structurally (measured: no collisions, uniform cells) but the
  quiet half of the palette is close to invisible at that size.
- **The calendar key does not describe the cycle marks.** The ⓘ sheet still
  explains only the four ring states, and the Cycles key draws a 12px circle
  where the grid now draws a 16×2 bar.
- **The bands take a cycle's CURRENT colour**, so recolouring a cycle repaints
  its history — while the pattern and end shown beside it are historical.
- **Blocks: ending early is now 4 taps** (Progress → banner → list → card → ⋯).
  That follows directly from Adrian's "tapping a block opens the look-back"
  call, and the amber end-date dot is unaffected. Flagged in case it grates.
- **Spec 09 and spec 11 files no longer match what shipped.** 09 still mandates
  the "Clear all compounds" row that was removed and says the sex change takes
  no confirmation; 11 describes a time field that does not pre-fill. Their
  checklists can never pass as written. **Say the word and they get amended** —
  otherwise a future session will "fix" the app back.
- **The Blocks empty-state copy** was deleted rather than rewritten. If the
  screen ever needs a line again, Adrian rejected both the original and the
  first proposal.

---

## PARKED — Adrian's calls, carried forward

- **A note on a dose SHIPPED** (he approved it). No migration was needed:
  `dose_logs.note` has existed since v0.4.2 and nothing had ever written to it.
- **`CompoundHeader`** is a new shared component, flagged as the specs require.
- **The two spec 08 items are settled**: fix the widget height as needed
  ("don't worry about what the spec file says"), and the journal widget stays as
  it looks now.
- **Portrait lock is done and softened** the way he asked: manifest for the
  installed PWA, and a browser fallback that waits for a sustained 1.2s of
  landscape, fades in, and can be dismissed for the session so someone who has
  locked their phone to landscape for accessibility is never walled out.
- **The timezone fix is done**: `logged_for` is written by the device at log
  time and read back, and 012 undid the bad backfill.

---

## The trap that cost the first review round most of its run

**A stale `.next` from a production build wedges `next dev`.** The server accepts
TCP, answers `/manifest.webmanifest`, then hangs forever on `○ Compiling …`. It
looks like a slow compile and never finishes. Three agents lost most of a run to
it and wrongly reported that `/preview/*` pages do not hydrate. They do.

`pkill -f "next dev" && rm -rf .next`, then restart. **Never run `next build`
against the same `.next` as a running dev server** — and tell every review agent
the same, because two of them did it anyway.

---

## KNOWN GAPS, carried deliberately

**Cycle end condition 3 is WITHHELD** — see item 3 above.

**Injection sites are not captured when a stack is logged in one tap.**

**No component tests.** Vitest covers `lib/**` only (pure, by house rule). Every
critical found in this wave came from executing the real screen in Chrome, not
from the suite. 341 tests pass and would not have caught any of them.

---

## Decisions Adrian has SETTLED - do not re-litigate

- Week strip: soft raised block for the selected day, status dot INSIDE it.
- Today card dot cap: 9, then "+N". Cycle countdown-vs-date crossover: 14 days.
- Schedule: rows of dots, NOT a table. Unnamed stacks auto-name "Stack N".
- Compound detail sheet leads with the CONTAINER; specs 10 and 11 reuse it.
- Tapping a block opens its look-back; end/extend live behind the ⋯ on that page.
- Cycles annotate the calendar as a thin rule under the date, never a fill.
- "Cycle this" expands INLINE in the add form, with every variable on it.
- The log sheet's date is editable, and changing it MOVES the dose.
- The danger zone is two plain rows. "Clear all compounds & stock" is gone.
- **NO EM DASHES in any user-facing string.**
- Health data is categorical, never evaluative.

---

## Merging, when Adrian says so

`main` deploys straight to Vercel prod, so merge ONLY on his word. Before it:
tsc, lint, `npm test` and `next build` all clean; decide whether the `/preview/*`
demo pages ship; do not rewrite the migration files.
