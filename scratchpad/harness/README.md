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

## Two things that cost a run, kept here so they do not cost another

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
| `steps.scenario.ts` | jobs A/B/C — Steps 9/10/11 (guarded), plus a live self-check |
