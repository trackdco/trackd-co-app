# The test-clock harness

Tooling for spec 04 Steps 9, 10 and 11, and for Monday's three observations.

```
# The reminder half. Needs no Stripe. Runs now, repeatably, in seconds.
npx vitest run --config scratchpad/harness/vitest.harness.config.ts \
  scratchpad/harness/monday.scenario.ts

# Steps 9/10/11. Creates Stripe objects. ONLY when nobody else is in the tree.
HARNESS_ALLOW_STRIPE=1 npx vitest run \
  --config scratchpad/harness/vitest.harness.config.ts \
  scratchpad/harness/steps.scenario.ts
```

Add `--reporter=verbose` to see `console.log`; the default reporter swallows it.

---

## ⚠️ The answer to the clock question: YES, the runner takes an injectable `now`

```ts
// lib/notifications/runner.ts:695-701
export async function runForUser(
  supabase: Client,
  userId: string,
  opts: { force?: boolean; now?: Date } = {},
): Promise<RunResult> {
  const force = opts.force ?? false;
  const now = opts.now ?? new Date();
```

It threads that instant into `collectUserData` and on into
`trialReminderVerdict(trial, tz, now, sentFor)`, which is pure.

**So the reminder half of every observation needs no Stripe test clock at all.** A
Stripe test clock moves *Stripe's* clock, and the runner counts back two days from
the stored end date using the *server's* — injecting `now` removes the need for the
two to agree. The mirror supplies the end date, the caller supplies the moment.

The production cron never passes it — `app/api/notifications/run/route.ts` calls
`runForUser(supabase, id, { force: false })` — so real time still governs in
production and none of this adds surface there.

**The fallback plan is not needed.** Choosing an original `trial_end` so the moved
end lands two days from real now would work, but it makes each observation a
one-shot that cannot be repeated without waiting a real day, and it cannot produce
"too early", "already sent" or "trial over" at all.

---

## ⚠️ D1 is already observed, and it passes

`monday.scenario.ts`, 4/4, no Stripe:

| Assertion | Result |
|---|---|
| a reminder fires against the ORIGINAL trial end, and stamps its own date | ✅ |
| **a SECOND reminder fires against the MOVED end after the courtesy grant** | ✅ |
| the second is not suppressed by the first's stamp | ✅ |
| nothing fires twice for the same ending (`already-sent`) | ✅ |
| nothing fires before the promised day (`too-early`) | ✅ |
| nothing fires to somebody already cancelled (`already-cancelled`) | ✅ |
| nothing fires after the charge instant (`trial-over`) | ✅ |

This is the mechanism `07` §3.5 says "must be verified, not assumed": the stamp is
keyed to the reminder DATE, so moving the end produces a fresh claim. One reminder
would have proved nothing — the failure mode is precisely a second reminder being
swallowed, which would end the courtesy period in an unwarned charge.

**What this does and does not settle.** It settles the RUNNER's half. It does not
settle `07`'s carrier half (that the right words are composed and delivered), which
is `07`'s own to prove, nor Q79, nor Smart Retries. Deliveries are captured as real
HTTP, so "fired" here means bytes left the server under a valid VAPID signature —
not that a phone displayed anything.

---

## Safety

- **The database is production, ~90 real users.** Every account is
  `@trackd-qa.invalid`, recorded in a `Ledger`, deleted **by id**. Teardown reads
  the ledger and nothing else — there is no `like`, no domain match, no query that
  selects rows to delete. A previous agent's domain sweep destroyed sixteen real
  fixtures.
- **Stripe is opt-in.** `requireStripeBudget` throws unless
  `HARNESS_ALLOW_STRIPE=1`. Two sessions creating and tearing down clocks and
  customers at once collide on cleanup. Unset, guarded scenarios *skip*; anything
  that reaches Stripe anyway *throws loudly* rather than silently passing.
- **Teardown is Stripe first, then the account.** `billing_customers` cascades away
  with the profile and is the only mapping back to a Stripe customer, so the other
  order leaves a live subscription billing somebody nothing can attribute.
- **It never runs with `npm test`.** The committed suite is
  `include: ["lib/**/*.test.ts"]`; this config is separate and uses a different
  file suffix.

---

## Traps that each cost a run, kept here so they do not cost another

**A SYNTAX ERROR IN A DRIVER MEANS TEARDOWN NEVER RUNS.** The module fails to
parse, so the `try`/`finally` never executes and every seeded account survives.
Found on 2026-08-17: a redeclared identifier in `qa-05-entitled-probe.mjs` left one
`@trackd-qa.invalid` account with a live `comp` entitlement on production. **Run
`node --check <file>` before running a driver.**

⚠️ **AND PARSING IS ONLY HALF OF IT. BEFORE ANY DRIVER THAT WRITES, DO BOTH:**

    npx esbuild <file> --outfile=/dev/null      # 1. it parses
    node -e "import('./scratchpad/qa-billing.mjs').then(async m => {
      const a = await import('./scratchpad/admin.mjs');
      for (const n of ['stripe','env','TEST_PM'])            if (!(n in m)) console.log('MISSING', n);
      for (const n of ['admin','makeUser','dropUser','signIn']) if (!(n in a)) console.log('MISSING', n);
      console.log('import resolution OK'); })"    # 2. its imports RESOLVE

**`esbuild` parses imports without resolving them.** A wrong export NAME is
syntactically perfect, so step 1 passes — and an ESM link error throws **before the
`try` block is entered**, so the `finally` never fires and whatever the driver
already created leaks. This is the exact failure the parse gate was added for, in
the one variant the parse gate structurally cannot catch.

Found on 2026-08-18 building `qa-08-step5-declined.mjs`: it imported `dropUser` and
`signIn` from `qa-billing.mjs`, which re-exports only `admin`, `env` and
`makeUser`. Caught before running. Had it run, a Stripe **test clock** would have
been created and then orphaned, and a clock keeps its subscriptions and invoices
forever.

**Do not drop step 2 as redundant.** It is the half that catches the class step 1
cannot see. Neither step is a substitute for the other, and neither is a substitute
for the backstop below.

⚠️ **AND NEITHER CATCHES EVERYTHING. THE OUT-OF-PROCESS COUNT AFTER A *FAILED* RUN
IS STILL THE ONLY BACKSTOP.** A driver can parse, resolve, and still die halfway —
a network error, a Stripe 400, an assertion that throws outside the `try`. Both
gates above reduce how often the `finally` is skipped; only the count tells you
whether anything survived when it was.

⚠️ **AND THE COUNT MUST RUN OUT OF PROCESS.** A check that lives inside the driver
dies with the driver, which is exactly the failure above — every safety property
here (ledgered, deleted by id, torn down in a `finally`) is downstream of the file
parsing. Count with something the driver cannot take down with it: the Supabase MCP,
`psql`, a separate `node` invocation. Never a `finally` block.

⚠️ **AND MEASURE AFTER FAILED RUNS, NOT ONLY SUCCESSFUL ONES.** Three consecutive
session reports said "0 QA accounts left". Each was true, and each was taken
immediately after a run that had *completed* — which is the only moment the check
could pass. The leak was from a run that crashed, and nothing looked there. **A
crashed run is the case the count exists for; it is the one least likely to be
followed by anybody running it.**

    select count(*) from auth.users where email ilike '%@trackd-qa.invalid';

**The 127.0.0.1 trap is about the URL you OPEN, not the address the server BINDS.**
`npm run dev` binds `-H 127.0.0.1`, deliberately, so the server listens on loopback
only rather than on every interface — it was reachable from the network while
holding the production service-role key, the production VAPID keys and
`CRON_SECRET`. Verified 2026-08-17: with that bind, `http://localhost:3100` still
answers 200 and still hydrates. **Do not widen the bind to "fix" the trap.** Drive
on `http://localhost:3100`; never on `http://127.0.0.1:3100`.

**`setup.ts` must load `.env.local` before any module under test is imported.** ESM
imports are hoisted, so `runner.ts` captures `VAPID_PUBLIC`/`VAPID_PRIVATE` into
module-level consts before anything in `core.ts` executes. Parsing env after that is
too late, and the symptom is misleading: `runForUser` returns
`{ reason: "vapid-unconfigured" }` and every assertion fails with
`trialReminder: undefined`, which reads as "the runner refused to send".

**The push sink must be HTTPS.** `web-push` speaks TLS unconditionally. A plain
`http` sink fails with `EPROTO ... wrong version number`, which the runner swallows
into `trialReminder: "send-failed"` — so a *correct* verdict reads as a dead
reminder. The sink self-signs for `127.0.0.1` and `setup.ts` disables TLS
verification for this process only.

**A scenario that never reaches the state it names is worse than no scenario.**
This has now happened six times on this branch, twice inside this harness:
`billingreason`'s clawback branch seeded `active_until` at the OLD period end and
so never created the extension the clawback undoes, and `pausedcancel` first
seeded no mirror row, so the mirror write matched nothing and passed vacuously.
Both were green. **Before trusting any scenario here, read what state it actually
constructs**, and prefer asserting you have ARRIVED somewhere before asserting
anything about it — `qa-22-declined.mjs` checks it reached the declined screen
before reading the declined screen's copy.

⚠️ **NEVER READ A SIMULATED MOMENT OFF `event.created`. WALK THE CLOCK INSTEAD.**

On a test clock, `event.created` is WALL-CLOCK time, not the simulated instant the
event logically belongs to. Measuring a lead time as `deadline - event.created` gives
you "the deadline minus the moment your test ran", which is not a lead time at all.

Found on 2026-08-17 answering Q79. The first measurement advanced straight to the trial
end and reported the lead as **168 hours** — which is exactly 7 days, which is exactly
the number the Stripe dashboard's own setting uses, so **it read as a confirmation of
the thing under test.** The tell was elsewhere: the two events were stamped SIX SECONDS
APART in real time while their simulated positions were a week apart.

**The method that works, and it interprets no timestamp:** advance the clock in small
steps and look for the event after each one. The first step at which it appears IS the
simulated firing moment, to within the step size. Re-measured that way, Q79's answer is
**3 days**, which is what Stripe documents.

    for (let day = 1; day <= 7; day += 1) {
      await clock.advanceTo(new Date(t0 + day * DAY));
      const fresh = (await eventsFor(subId)).filter(e => !alreadySeen.includes(e));
      if (fresh.length) return (endMs - (t0 + day * DAY)) / DAY;   // <- the lead
    }

A number that looks like an answer and is not one is worse than no number, because the
decision gets made on it. **`advanceTo` hops in 7-day steps** for a separate reason —
Stripe caps a single advance at two billing intervals of the shortest subscription on
the clock, and a trial plus a courtesy period is exactly two.

⚠️ **AND IT IS NOT ONLY `event.created`. CHARGE TIMESTAMPS DO NOT FOLLOW A TEST
CLOCK; INVOICE TIMESTAMPS DO.**

Measured 2026-08-18 (`scratchpad/probe-declined-fields.mjs`), one captured
past-due state:

    invoice.created / status_transitions.finalized_at   2026-08-24   <- SIMULATED
    charge.created (the failed one)                     2026-08-17   <- WALL CLOCK

Eight days apart, in the same object graph, describing the same failure. **In
production the two agree**, because there is no clock — so this divergence is an
artefact of the instrument and never a defect in the code.

The consequence for drivers: **any assertion on a charge time inside a clock run is
measuring wall clock.** Assert it against the charge object itself, never against a
date the script calculates from the simulated timeline, and never against an
invoice timestamp from the same state. `qa-08-step5-declined.mjs` reads
`charge.created` from Stripe and compares the screen to that.

⚠️ **TWO STRIPE TEST-CARD FACTS, MEASURED, THAT DECIDE WHICH DEFECT YOU CAN MODEL.**

    pm_card_chargeDeclined       throws StripeCardError AT ATTACH.
    pm_card_chargeCustomerFail   attaches cleanly; every charge to the customer fails.

Stripe validates the card when it is attached to a customer, so
`pm_card_chargeDeclined` can never become a default payment method and can never
reach a renewal. **It models a decline AT CHECKOUT and cannot model a dunning
failure.** For a card that worked in June and stops working in July —
`past_due`, the declined card, the retry schedule — the token is
`pm_card_chargeCustomerFail`.

And it must be set on the **subscription**, not only the customer: a subscription's
own `default_payment_method` wins. Setting only
`customer.invoice_settings.default_payment_method` leaves the renewal **paid**, and
the run reports "no failure" while looking correct. (The same fact is a support-desk
answer; it is recorded in `12-go-live.md` §3.8 for the day.)

⚠️ **AND A DRIVER THAT COMPUTES THE DATE THE APP IS SUPPOSED TO COMPUTE IS A
FIXTURE WEARING A COSTUME.**

The arrival rule, stated for dates. If the driver calculates the expected value with
the same arithmetic the app uses, it proves the arithmetic agrees with itself and
nothing else — the app could read the wrong field, the wrong row or the wrong
source and still match. Make the app's own path produce the value, then read it back
from its source and compare. `qa-08-step5-declined.mjs` delivers a real
`invoice.payment_failed` to the app's OWN webhook and then reads
`entitlements.active_until`; it never computes "period start plus three days".

⚠️ **A CONTROL MUST BE A NAMED ARTEFACT, NEVER A THRESHOLD OR AN APPROXIMATION.**

A control exists to prove the instrument read something. A number you chose, or a
pattern that merely resembles the text, cannot do that — and both failed in one session
on 2026-08-17:

**A prose regex only ever approximates signed copy.** `04` Step 9 route 1 detected the
save offer with `/free (week|month)/i`. The approved line is "we'd like to offer you
another week, **free**" — free follows the noun — so it never matched. Every route
reported `offer shown = false`, *including the first cancellation*, which had
demonstrably offered because `shownAt` was written. **"No second offer" was passing
because the detector never fired.** Fixed by detecting the dialog's own confirm button,
`Another {period}, thanks`, which exists on that dialog and nowhere else — and by
asserting the offer IS shown on the first cancel, the positive control it never had.

**A threshold cannot tell short-because-correct from short-because-broken.** The
flag-proof scenario asserted `text.length > 200` as its "did the page render" control
and failed at 99, on a page that had rendered perfectly: `/billing` for an account with
no entitlement, no subscription and no customer is legitimately
`"Sign out / Billing / PLAN / Access / Pro / Back to profile"`. Replaced with the
screen's own furniture — `"Billing"` is its heading, `"Access"` is the row the label
sits in — so both present proves it rendered AND that the label position was reached.

**Use:** a signed label, a required element, an `aria` role the screen must have, the
row a value lives in. **Never:** a length, a timeout that "felt long enough", a regex
over prose, or a count you picked after seeing one passing run.

And the tell for both, which is its own rule: **if two lines of your own output
contradict each other, the assertion between them is wrong.** `offer shown = false`
directly above a written `shownAt` cannot both be true, and it was in the log the whole
time.

Two smaller traps of the same family: compare timestamps as INSTANTS, not strings
(Postgres returns `+00:00` where JS writes `.000Z`), and check text reads the way
a user reads it — a `ml-1` margin looks like a space and is absent from the text.

A third, smaller one: these trials end near local midnight, so "the ending plus an
hour" lands inside quiet hours (22:00–08:00) and the runner short-circuits there
first. Probe the morning after instead. `atLocalTime` resolves the real UTC offset
for the target day rather than assuming +10, because AEDT starts in October and
these scenarios seed dates weeks out.

---

## §5's "the whole flow works with 003 UNAPPLIED"

**Not tickable by driving any more, and deliberately not faked here.** The column
now exists in production (`select courtesy_until` returns an empty set, not
`42703`), so the unapplied state cannot be reproduced without dropping a column on
a production table.

The box is answered from **spec 03's evidence**, where `42703` was probed
throughout, plus the two independent mechanisms that were built for it and are still
in the tree:

1. the mirror write tolerates the column's absence — PostgREST answers `PGRST204`
   and the write is retried without it (`supabase/billing/003_courtesy_until.sql`);
2. `courtesyUntilFor` is its own tolerant query, deliberately not folded into the
   billing screen's main select, so an unapplied migration cannot take the whole
   screen down (`app/(app)/billing/page.tsx:88-103`).

Do not strike the box and do not tick it by observation.

---

## Files

| File | What it is |
|---|---|
| `vitest.harness.config.ts` | separate runner, `.scenario.ts`, no file parallelism |
| `setup.ts` | env into `process.env` **before** imports; harness-only TLS opt-out |
| `core.ts` | ledger, seeding, push sink, `fireReminder`, offer markers, `TestClock` |
| `monday.scenario.ts` | job D — D1 (runs now), Q79 and Smart Retries (guarded) |
| `steps.scenario.ts` | jobs A/B/C — **Steps 9/10/11, still `it.todo`** (guarded), plus a live self-check |
| `clockwindow.scenario.ts` | measures the `incomplete` expiry window. **Answered: ~23h, invoice voided by Stripe** |
| `billingreason.scenario.ts` | `markPastDue`'s guard, both branches: first-invoice and renewal |
| `pausedcancel.scenario.ts` | D80 — a genuinely `paused` subscription, cancelled immediately |

**⚠️ `steps.scenario.ts` is the one with work left in it.** Steps 9, 10 and 11 are
`it.todo` with their assertions written out but no bodies. The other three
scenarios are complete and passing, and are the worked examples to copy from:
`clockwindow` for advancing a clock and sampling, `pausedcancel` for driving a
subscription into an awkward status, `billingreason` for invoking a handler
directly with a real Stripe object.


---

## Where the next session picks up

`04`'s Steps 9, 10 and 11 are the outstanding work and they live in
`steps.scenario.ts`. Everything they need already exists:

- **Stripe test clocks** — `TestClock` in `core.ts`, and `clockwindow.scenario.ts`
  is a complete worked example of create → advance → sample.
- **Awkward statuses** — `pausedcancel.scenario.ts` shows how to reach `paused`
  (a trial ending with `missing_payment_method: "pause"` and no card).
- **The offer's markers** — `readOfferMarkers` in `core.ts` reads
  `trackd_save_offer_shown_at` off the STRIPE CUSTOMER, which is where the
  once-ever flag actually lives. Step 9's four routes all reduce to whether that
  value is present and unchanged.
- **Reminders** — `fireReminder` needs no clock at all. Step 11's reminder leg is
  a separate `it` for that reason: when `07` lands it un-skips without rebuilding
  anything around it.

**Run guarded scenarios only when nobody else is spending Stripe test objects.**
`HARNESS_ALLOW_STRIPE=1` is the switch, and a reviewer's fixtures have collided
with a QA run on this branch once already.
