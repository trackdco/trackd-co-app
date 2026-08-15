# Progress Tracker

Records the **state** of the build: what's done + the decisions behind it — the
rear-view mirror. Forward steps live in `Context/next-tasks.md`. The full
blow-by-blow history of every spec is in git; this file keeps only what a future
session needs at hand.

Last updated: 2026-08-15 (spec 01 · trial eligibility: one trial per user, and nobody charged inside a promised free period)

## Trial eligibility, and a trial that was being burned by an abandoned tap (2026-08-15)

Billing spec 01 of three. `01`, `02a` and `02b` are a SHIP-TOGETHER TRIPLE and
none of them reaches `main` alone: this one decides who gets free days, which
makes the current checkout copy false for a returning customer (`02b`) and
routes a post-grace user onto a payment path that cannot succeed yet (`02a`).

**The rule.** One seven-day trial per user, ever. A trial counts as used only if
a card actually validated on it. The ~85 beta accounts on the fourteen-day grace
do not also get a trial, because that fortnight IS their trial.

### The money fix: a mid-grace user is no longer charged inside their fortnight

A beta user who reached checkout part-way through their fourteen days had
`trial_period_days` omitted, so Stripe raised an invoice with an amount due
immediately. The app had told them in writing they had until a named date.

Their subscription is now created with `trial_end` AT the grace end, taken from
`entitlements.active_until` — a fixed instant rather than a day count, because
expressing it as "N days from now" means computing a remainder and a rounding
error there is a charge on the wrong day. `lib/billing/freeTime.ts` is the pure,
tested decision: a full trial, a grace-aligned start, or nothing.

It also fixes the broken button, which is a benefit rather than the
justification: nothing due today means Stripe issues a SetupIntent, which is the
arm the client is built for.

**The clamp errs long, twice.** `STRIPE_MIN_TRIAL_END_OFFSET` is 48 hours, and
the seconds conversion CEILS. Measured on the day (Q76): `subscriptions.create`
with an explicit `trial_end` actually accepts every offset tried, down to ten
minutes — the documented two-day minimum does not apply to this call, and the
only constraint Stripe enforces is that the instant is in the future. A
`trial_end` of exactly NOW is accepted but comes back `active` with an invoice
due, which is the dangerous edge; `resolveFreeTime` never reaches it, because a
grace end at or before `now` resolves to "no free time" instead. 48h is kept
anyway: the margin is free, and undocumented behaviour can tighten without
notice.

**The ceil turned out to close the entitlement handover too.** On a test clock,
the `stripe` row's `active_until` lands 943ms LATER than the `comp` row's, so
there is no instant at the boundary where neither row is active.

### The defect the drive found, which no test would have

**A genuine first-timer was losing their trial to an abandoned tap.** Abandon a
3D Secure challenge, come back, pick a DIFFERENT plan: `startTrial` cancels the
abandoned attempt to make way, and from that moment `hasValidatedCard` read the
cancelled attempt as a real trial purely because of
`if (sub.status !== "trialing") return true`. Measured on the object:
`default_payment_method` null, `default_source` null, `pending_setup_intent`
still pending, and the predicate returning true. No card ever touched it.

That is §3.2's "wrong in the expensive direction" arriving through a door the
guard did not cover, and it charges a first-time customer on a screen that just
promised them seven free days. Two steps to reach, not three. Pre-existing —
`eligibleForTrial` called the same predicate — and found only by driving it.

The fix is a set, `CARD_STEP_MAY_BE_UNFINISHED` = `trialing`, `canceled`,
`incomplete_expired`: for those, ASK rather than inferring "validated" from the
status. The discriminator is the surviving `pending_setup_intent`, which is the
residue of a card step that never finished. A subscription that genuinely ran
and was later cancelled or refunded has none, so it still counts as a used
trial — the case Out of Scope protects, verified unchanged by driving it.

**`sync.ts` did NOT move with it.** `cardIsValidated` there answers a different
question (whether to GRANT access) and is reached only for `ENTITLING` statuses
(`trialing`, `active`), so it is never asked about a cancelled subscription and
the two cannot disagree about one.

### Comps cannot buy, and the comp list cannot reach a browser

A free-for-life comp (a `comp` entitlement with a NULL `active_until`) is
refused with `already-subscribed` BEFORE any Stripe object exists. Driven: zero
subscriptions, zero customers, zero `billing_customers` rows. The schema still
permits a founder who also subscribes (`001_billing_tables.sql` says so
explicitly); this forecloses it at the application layer, because a comp being
charged costs more than a comp being unable to buy what they already have free.

`lib/billing/betaGrace.ts` gained `import "server-only"`. It holds five real
email addresses and nothing but convention had been stopping a client component
pulling them into a bundle. None of the five appears anywhere in `.next/static`;
they do appear in `.next/server`, which is what proves the grep was looking.

### One read, and the select that must not grow

`compEntitlement` answers all three questions from one query — may this account
buy at all, have they had their free run, and when does it end —
because `entitlements_one_per_source` guarantees at most one comp row per user.
⚠️ The select is `source, active_until` and must stay that way: a column added
there breaks the whole request if its migration has not been run, and this
request decides whether somebody is charged today. `003_courtesy_until.sql` is
still unapplied, confirmed live, and every drive below ran against that database.

### Verified by DRIVING it, at 390x844 on localhost, against real Stripe test mode

| Case | Result |
|---|---|
| brand-new account | 7 free days, `trialing`, metadata `user_id` only |
| abandoned 3DS, returns, same plan | resumes, still 7 days |
| abandoned on two plans, picks a third | exactly ONE live subscription, 7 days |
| used a trial, cancelled, returns | "You've had your trial", charged today |
| mid-grace subscribe | `trial_end` = grace end +818ms, invoice `amount_due=0`, SetupIntent, `trackd_grace_until` beside `user_id` |
| 1 hour of grace left | clamped to now+48h, 47h LATER than the promise; metadata still carries the PROMISE |
| post-grace | routed to paid-today: `amount_due=1199`, `incomplete`, nothing charged (this is `02a`'s to fix) |
| free-for-life comp | `already-subscribed`, zero Stripe objects |
| entitlement overlap | comp and stripe rows, identical `active_until`, 0s gap |
| grace-end boundary (TEST CLOCK) | advanced 1h past `trial_end`: subscription `active`, $11.99 invoice PAID on the promised day, stripe row extended to +1 month, no read-only gap |
| Stripe unreachable | screen stays generous (`eligible: true`); no payment form renders at all, so nothing can be charged |
| entitlements read failing | trial GRANTED, not refused; button refuses; no charge |
| anonymous `startTrial` | refused, "Please sign in again." |
| forged plan key, tampered in flight | generic error, ZERO subscriptions, no fallback to a cheaper price |
| `startTrial` payload | `["monthly"]` — plan only, no user identifier |
| two tabs at once | exactly ONE live subscription |

**Cleanup was audited afterwards**: back to exactly 90 auth users, zero
`@trackd-qa.invalid` accounts, zero test clocks, zero `entitlements` and zero
`billing_customers` rows. Test accounts were deleted BY ID with the Stripe
objects cleaned up first.

### The QA harness this needed, now in `scratchpad/`

`qa-billing.mjs` (seeded billing states + teardown that does Stripe before the
user), `qa-eligibility.mjs`, `qa-start-trial.mjs`, `qa-one-trial.mjs`,
`qa-attacks.mjs`, `qa-forged-plan.mjs`, `qa-failure-directions.mjs`,
`qa-overlap.mjs`, `qa-test-clock.mjs`, `qa-stripe-min-trial.mjs`. The test-clock
driver `12-go-live.md` was going to own now exists in first draft.

⚠️ Two traps worth keeping. The Stripe card iframe must be targeted by
`title="Secure payment input frame"` — the FIRST `__privateStripeFrame` is the
wallets frame and has no card fields. And replaying a captured server action
loses the session, so it refuses at `!user` before reaching what you meant to
test; tamper with the body in flight via route interception instead.

## The paywall carousel: HEIC in a `.png`, P3 colour, and a frame that wasn't a phone (2026-08-14)

## The paywall carousel: HEIC in a `.png`, P3 colour, and a frame that wasn't a phone (2026-08-14)

Adrian re-shot the four app screenshots to strip his name off the dashboard and
put a photo in the empty Progress card. Wiring them up turned up three defects
that had nothing to do with what he changed, two of them live.

**Three of five files were HEIC with a `.png` extension.** `app-dashboard`,
`app-progress` and `notes-app` were ISO/HEIF; the other two were JPEG, also
misnamed. Safari renders a misnamed HEIC, **Chrome does not**, so the carousel
was one merge away from showing empty slots to most of its audience. This is
also why the images could not be read when pasted into chat — same bytes, and
"re-exporting as PNG and JPG" changed only the extension.

**All five were Display P3.** iPhone screenshots always are. The numbers in a P3
file are wider-gamut coordinates, so anything ignoring the profile reads them as
sRGB and renders flat: `--cat-anabolic` `#c8861a` was arriving as `#bd8836`,
blue more than doubled. Converted with `sips --matchTo` sRGB, the amber lands on
`(198,133,27)` against a token of `(200,134,26)` and the peptide blue on
`(107,127,211)` against `(107,127,212)`. Not a grade — a colourspace conversion
putting the colour back where the CSS already said it was.

**`app-home.png` was deleted while the carousel still pointed at it**, so the
first slide was a broken image. Repointed at `app-dashboard.png`, which is what
the tab is actually called.

**The frame was never a phone.** `<Image>` declared 1170×2280 (0.513) while
every screenshot is a real capture at ~0.46. With `object-cover object-top` the
mismatch ate the bottom ~10% of all four — exactly where the tab bar sits, so
the element proving this is a five-section app was cropped out of every slide,
silently, because `object-cover` never errors. Now 1170×2532 (iPhone 390×844);
residual crop is under 1% on all four. Adrian also asked for the Dynamic Island
and home indicator to be drawn back on — the screenshots have iOS chrome cropped
off, which is right, but what was left read as a card rather than a device. Both
are sized in **percent with Apple's own aspect ratios** (island 125×37pt, home
indicator 140×5pt) so they survive the 2× inspection view.

**Two slides were off-family, for two different reasons** (Adrian's eye, then
measured at the 176×382 they actually render at). Dashboard was the flattest of
the four — mean saturation 2.52 against 3.09/3.67 — because it has no large
solid colour anywhere, only thin accent text and icon strokes; a controlled test
ruled out the downscale, since Protocol resampled to 688px keeps its amber
exactly. Progress was mean luminance 71 against ~29, and 27.6% warm pixels
against ~1%, entirely from the photo. Dashboard took a global saturation ×1.1 to
3.43, inside the family range. Progress was graded **on the photo block only**
(x 56–632, y 364–1140), brightness ×0.86 and saturation ×0.80 — a global grade
would have darkened its UI chrome away from the other three and created a new
mismatch. It sits at 62.9/12.17: nudged toward the family, not forced into it,
because dimming it further starts hiding the feature it exists to sell.

**The originals are not in the repo.** They were untracked, so they were backed
up to scratchpad before anything was overwritten.

## The comp list is closed, and one of the five has no account (2026-08-14)

Adrian gave the last free-for-life address — `Angusbrake6@gmail.com`, stored
lowercase as the file's own warning requires — and closed the list.
`COMP_EMAILS` is five: two founder accounts and three friends.

**Checked against production rather than assumed:** 90 auth users, and four of
the five have an account. **`angusbrake6@gmail.com` does not.**

That is not a rounding error, because of where the list is read. `COMP_EMAILS`
has exactly one consumer — the backfill route — and it enumerates
`auth.admin.listUsers()` and grants against the accounts it finds. **Nothing
reads the comp list at sign-up.** So an address with no account is never
considered at all: sign up before the backfill and he is comped for life; sign up
after and he is an ordinary new user on a trial, with the comp entry doing
nothing, silently, forever.

The same silent-failure shape as the capitalisation trap the file warns about,
reached through a different door — and it fails in the direction where nothing
errors and nobody is told. The dry run reports one fewer comp than expected and
does not say which one is missing, so the number has to be read.

`scratchpad/comp-check.mjs` prints every comp address against the live account
list. The go-live order gained a step 3b for it.

Not fixed in code, deliberately: granting at sign-up would mean a new write path
into `entitlements` from the auth flow, and the answer Adrian actually needs is
"ask him to sign up", which costs nothing.

## Earlier state (2026-08-13) — the notification mirror's third missing gate; the read-only gate, the save offer, the beta grace; the /admin dashboard rebuild + the Glass Console + the arcade

## The push engine was announcing compounds deleted in July (2026-08-13, evening)

Adrian's phone said "4 doses are still unlogged today" at 20:00 while his
dashboard showed everything logged. Both were right, about different things.

**What the data said.** Deleting a compound writes three facts — `archived` on
the device, a `stopped` version in `protocol_compound_schedules`, and
`is_active = false` on `protocol_compounds` — and all three are fire-and-forget.
Two landed and the third did not: Nandrolone on 31 July, and Ipamorelin, Test E
and Anastrozole on 7 August, seventeen minutes after he added them for the
onboarding screenshots. Those rows stayed `is_active = true` for six to thirteen
days, and every day of it the runner announced them and then nagged for missing
them. They were reconciled at 20:32 that night — half an hour AFTER the push —
when a hydration noticed the mismatch and re-pushed the archive.

**The gate the mirror never had.** `lib/notifications/reminders.ts` is the
server-side mirror of the client's `isDueOnFor`, and this was its THIRD missing
gate after cycles (31 July) and pauses (7 August). The rule now: every gate in
`isDueToday` runs the client's own function — `isOnCycle`, `isPausedOn`,
`effectiveCadenceStart`, `cyclePauseContext`, `isStoppedOn`. Nothing in that
file is reimplemented; what is left is the mapping from Postgres columns to
those functions' arguments. `lib/protocol/scheduleVersions.ts` holds the
version-in-force rule both sides read.

**Three cold reviews, then a fourth on the fixes.** They found, in order: the
`stopped` gate silencing a live compound after a BACK-DATED re-add (the client
drops superseded versions with a local array filter; the push only ever
upserted, so Postgres kept the stop as the newest row — and the hydration union
then restored it to the device, un-fixing the client too); the mirror's pause
handling being a boolean where the client has three behaviours, leaving the two
grids offset on 7 of 11 days after any pause; sign-out leaving the push
subscription so one user's reminders reached the next user's phone; and then two
regressions in those fixes — `unsubscribe()` on sign-out silently killing push
for the same user signing back in, and the supersede sweep deleting history when
a stale device merely tapped Pause.

**Decisions worth keeping.**
- The sweep in `pushScheduleVersions` is OPT-IN (`supersede`). Only the three
  paths that record a version ask for it. A pause re-pushes the trail — which is
  how a failed sync heals — and never deletes.
- The read-only gate is DIRECTIONAL on two functions now
  (`setProtocolCompoundActive`, `pushScheduleVersions`), because each serves both
  a delete and an add. `scripts/gate-audit.mjs` reports a third bucket for that,
  and it moved out of `scratchpad/` — which is gitignored, so the doc in
  `gate.ts` rested on a file nobody else had.
- Sign-out deletes the subscription ROW but does not revoke the browser's
  subscription; `usePushNotifications` re-registers on mount. Deleting the row is
  what stops the leak; revoking the subscription is what broke the common case.

**Measured against production.** Across 17 push-enabled accounts and 51 active
compounds, over a fortnight, the new mirror changes nobody's due days. It differs
only where it was broken. Replayed at the exact instant of the 20:00 push: four
due before, none after, no push at all.

## Billing, finished: one subscription, one offer, and read-only after (2026-08-13)

Six steps on `wave3/billing-cancel`, all committed, **nothing pushed, `main`
untouched**. tsc, eslint, 940 tests green throughout. Every one of them was
verified by DRIVING the running app against real Stripe and the live database;
the gates caught none of what follows.

### 1. The URL stops saying "paywall", and the undo says what it gives you

`?step=paywall` -> `?step=plans`, `?step=checkout` -> `?step=start`. Step VALUES
only: `screens/paywall.tsx` and `PaywallScreen` are untouched, so it stayed a
copy change rather than a refactor of thirty files. Every screen puts its own id
in the address bar, so the id IS copy — it is on screen for the whole time
somebody is deciding whether to pay, and "paywall" is the industry's word for
the thing standing between a person and what they want.

The retired ids still RESOLVE, through `resolveStepId`, used by the only two
places that read a raw URL. Not politeness: a Stripe `return_url` written before
this change carries `?step=checkout`, and a user coming back from a 3DS
challenge they had already passed would have been dropped at the start of the
flow.

**The alias map is a `Map`, and that is load-bearing.** On an object literal
`LEGACY["constructor"]` returns a function and `LEGACY["__proto__"]` returns
`Object.prototype` — both truthy, both would have been handed back as a `StepId`
and looked up in `SCREENS` as `undefined`. `?step=constructor` would have
rendered a crash.

**"Restart my trial" is gone** (Adrian: it is meaningless, nothing has stopped).
Trial: "Keep Trackd after 19 Aug". Paid: "Keep my subscription". On a trial the
date is the only thing that changes, and it is the day the two futures separate;
on a paid plan there is no comparable cliff.

### 2. ONE SUBSCRIPTION PER USER, EVER

The root of the $69.99 defect. `startTrial`'s guard was a read of Stripe then a
write to Stripe, serialised only by an idempotency key of
`trial:${user}:${plan}` — **two plans are two keys**.

Three changes:

- **A per-user LEASE** across the whole check-and-create
  (`lib/billing/trialLease.ts`, `supabase/billing/002`). One conditional UPDATE
  on `billing_customers`, held across the Stripe round-trip, expiring after 90s.
- **The live-subscription check widened** to `BILLABLE_STATUSES`, now exported
  from `cancel.ts` and shared. It was a narrower literal three, so a `paused` or
  `unpaid` subscription did not block a second trial, and both of those can
  charge once Stripe resumes or retries them.
- **A RECONCILE after every create.** Re-lists and, if more than one is live,
  keeps the OLDEST and cancels the rest. Unreachable while the lease is
  enforced; it is what closes the race in the window before `002` is applied.

**Why not `pg_advisory_lock`.** It is the textbook answer and it cannot work
over this stack. The session-scoped one is taken on one pooled PostgREST backend
and released on another, so `pg_advisory_unlock` fails and the lock leaks
PERMANENTLY. The transaction-scoped one releases when the RPC returns, which is
before the Stripe call it exists to guard. The thing being protected is an HTTP
round-trip to a third party and no Postgres lock spans one.

`survivorOf` is pure and tested, and the property tested is not "it sorts" but
that TWO RACERS REACH THE SAME VERDICT — if they disagree they cancel each
other's subscription and the user ends up with none. `created` is
second-resolution and the race is milliseconds wide, so ties are the norm; the
id breaks them by code unit, not `localeCompare`, which is locale-dependent and
could order two servers differently.

### 3. The trial reminder's stamp stops being the user's to write, OR DELETE

`notification_preferences.trial_reminder_sent_for` was writable by the account it
is about. Reproduced live with a user JWT and the publishable key: clearing it
(the reminder then fires every cron tick, ~96 pushes a day about somebody's
money), setting it forward (the promised notice is silenced and they are charged
with no warning), smuggling it inside a legitimate settings payload, INSERTING a
row already stamped, and — the one nobody had spotted — **simply DELETING the
row**, which silences it permanently on its own, because the claim is a
conditional UPDATE and against a missing row it matches nothing and reports NO
ERROR at all. One request, permanent, silent.

`supabase/notifications/005` closes all three verbs: a BEFORE INSERT OR UPDATE
trigger, plus `revoke delete`.

**A trigger, not column grants.** Postgres has no "revoke one column": the only
way to say it is to revoke the table privilege and re-grant an explicit list of
every other column, which goes stale the moment a column is added. That trap has
bitten `profiles` twice.

**`current_user`, not `auth.role()`.** They agree for every request that reaches
this table, but `current_user` is the role PostgREST actually switched into and
it is a built-in that cannot be missing — `auth.role()` lives in the `auth`
schema, and if it were ever absent the trigger would throw on EVERY write and
take the settings screen and the reminder cron down together.

### 4. One save offer, AFTER the cancellation, once ever

Adrian's shape: "Cancel my trial" -> confirm naming the date -> a second pop-up
offering EXTRA TIME -> done.

**The order is the whole compliance story.** The cancellation is written to
Stripe and `cancelSubscription` has returned before the offer is even looked up.
Verified rather than asserted: `cancel_at_period_end` reads TRUE at Stripe in the
same breath as the offer comes back. "No thanks", Escape, the backdrop, a killed
tab and a dropped connection all leave the user cancelled, and the offer lookup
lives in its own try/catch that can only affect one optional field.

Two offers, because they are genuinely different:

- **TRIAL:** seven more free days, and the cancellation STANDS.
  `cancel_at_period_end` is deliberately untouched, so the copy can say "you
  still won't be charged" and be completely true. Computed from the CURRENT
  trial end rather than from today, so cancelling on day 1 buys a fourteen-day
  trial instead of shortening it.
- **PAID:** the next period free, and taking it DOES un-cancel, because the thing
  they cancelled is the next period. There is no honest way around that, so the
  dialog states it in the same sentence rather than a footnote. A 100%-off
  `duration: once` coupon, so the invoice literally reads $0.00 and the renewal
  date does not shift.

Once ever, in Stripe CUSTOMER metadata (no migration). `shown_at` is written when
the offer is PRESENTED and is what decides availability, so **a second
cancellation goes straight through with no offer** even if the first was
declined — re-offering every time is exactly the friction click-to-cancel exists
to stop.

Two guards over two windows: the metadata flag for coming back tomorrow, and a
Stripe idempotency key for two taps in the same tick, which the flag cannot
cover because metadata has no compare-and-swap.

`claimExtraTime` refuses a caller who was never OFFERED it. A server action is a
public HTTP endpoint, and "the dialog only appears when the offer is available"
is a fact about the screen.

### 5. Read-only when it lapses, and a pop-up with the real prices

A lapsed trial or subscription does not lock anybody out. Every screen opens,
every dose, photo, reading and block stays exactly where it was. What stops is
ADDING. **Nothing is hidden and nothing is deleted** — this is health data
somebody entered about their own body, and withholding it to apply commercial
pressure is the one thing this product must never do. So the gate is a PROVIDER,
not a third redirect in `app/(app)/layout.tsx`.

**Two layers, and only one is enforcement.** The client provider + `useWriteAccess()`
hook is what a user meets: it stops the action before a sheet opens, and it keeps
the DEVICE STORE from being written for something that will never sync (the home
and protocol domain writes localStorage first and mirrors afterwards). The server
layer is the rule — thirteen write functions call `requireWriteAccess`.

**Deletes are NOT gated**, and neither are settings. Removing data you put in is
yours to do; a read-only user must still be able to fix their timezone and turn
off notifications about a subscription they no longer have. `lib/billing/gate.ts`
carries the full list of what is covered and what is not, with the reason for
each — including why the protocol PLAN pushes are deliberately left ungated
(they are shared with `hydrateProtocol` and `migrateDeviceState`, which REPLAY
data the user already owns) while the DOSE pushes are gated (that path re-reads
localStorage on every reconnect and upserts on a deterministic id, so a refused
dose stays on the device and syncs the moment the account is entitled again).

**It is OFF unless `BILLING_GATE_ENABLED=true`.** There are ~90 real accounts and
NOT ONE has an `entitlements` row. Merging changes nothing until the switch is
set, which is the point: a gate that goes live as a side effect of a deploy goes
live at the wrong moment.

`NO_ENTITLEMENT_LABEL`'s tripwire was disarmed in the same commit, as its comment
had required for four days. It cannot be one string: gate off, the account
genuinely has the whole product; gate on, "Pro" would be a lie on the one screen
they opened to find out why they are locked out.

`PlanRows` was extracted from the paywall and the paywall now renders it too, so
the pop-up's prices cannot drift from the checkout's.

### 6. What happens to the ninety people who were already here

`COMP_EMAILS` free forever, everybody else **14 days** then the gate, and a
one-time modal explaining it. Fourteen is double the trial deliberately: a notice
shorter than a stranger's trial would read as worse treatment for having been
early, and people who feel ambushed dispute charges.

**`COMP_EMAILS` is deliberately not `FOUNDER_EMAILS`.** That list also opens
`/admin` and is duplicated into an RLS policy in SQL. Adding a friend to a comp
list must not hand them the admin dashboard.

The backfill is a ROUTE, not a SQL file, because the comp list is TypeScript and
Adrian is going to edit it — a SQL file would put the same addresses in two
languages with no way for one to notice the other changed. Secured with the same
Bearer `CRON_SECRET` as the cron, `?dry=1` writes nothing, idempotent, and it
never shortens anybody's access.

**The grace drives the trial banner and the day-5 push.** Adrian expected that to
fall out of the entitlement machinery; it did not quite, because both read the
`subscriptions` MIRROR and a graced account has no Stripe subscription at all.
`graceAsTrial` describes it as the trial it functionally is, which costs both
nothing. ⚠️ The `comp` test in there is load-bearing: a PAID subscriber's
entitlement also carries an `active_until`, so without it their dashboard would
have announced "Your free trial ends 13 Aug 2027".

### What the drives actually showed

| Drive | Result |
|---|---|
| NINE concurrent `startTrial` across three plans | 3 created, 2 cancelled by the reconcile, **1 live** |
| five concurrent, same plan | 1 live, all five got the SAME subscription id |
| yearly, abandon, back for monthly | yearly cancelled, monthly live |
| an already-paying customer | `already-subscribed`, nothing created |
| ten concurrent lease claims | exactly ONE winner, nine losers |
| the stamp attack | 5 routes succeed today; recorded as the baseline for `005` |
| cancel -> offer (trial) | cancelled at Stripe BEFORE the offer returned; +7 days; `cancel_at_period_end` still true |
| cancel -> offer (paid) | one 100%-off discount, un-cancelled, renewal date unchanged, **next invoice total 0 USD** |
| two concurrent claims | 7 days, not 14 |
| a different user claiming | refused, nothing leaked, victim could still claim their own |
| gate OFF | lapsed and entitled identical. Merging is inert. |
| gate ON, lapsed | all ten screens 200, every write refused, `deleteWeight` still works, /billing reads "Read only" |
| gate ON, entitled comp | completely unaffected, reads "Complimentary" |
| beta backfill dry run | **90 accounts, 2 comp, 88 grace, 0 already entitled**, nothing written |
| mid-grace / expired grace | writable / refused, dashboard 200 either way |
| the banner on a grace | "Your free trial ends tomorrow." with no subscription row anywhere |

### The cold review, 2026-08-13 — three adversarial agents, and they were right

Security/payment, the gate + entitlements, and UI at 390x844. **Every finding
below was found by EXECUTING** — driving real Stripe, the live database and a
headless Chromium at `http://localhost` with the iPhone 14 safe-area insets
injected. tsc, eslint and 949 tests were green throughout and caught none of it.
Same lesson as every wave before.

| Sev | Finding | Resolution |
|---|---|---|
| CRITICAL | **The pop-up was completely dead on a phone.** Radix sets an inline `pointer-events: none` on `<body>` while a sheet is open; the pop-up portals to `<body>` and inherited it. Measured: it paints correctly on top, `elementFromPoint` at every button returns the sheet underneath, ZERO hit-testable elements, real taps time out. Escape worked, and **a phone has no Escape key** — the only way out was to reload the app. | `pointer-events-auto` on all three backdrops. Re-measured: 5/5 reachable, a real tap closes it. |
| CRITICAL | **A read-only user could log a dose that never reached the cloud, and was told the app would keep trying.** The tick was guarded; "Log today's dose" on the compound detail sheet was not. `localStorage` written, server refuses, toast says *"Still syncing. We'll keep trying."* It never syncs — not on reload, not on an `online` event, **not after they resubscribe**. | `handleTracked` (the COMMIT) is guarded as well as every entry point, so a route added later is covered by construction. |
| HIGH | **The gate wrapped wrappers, not writes.** Every export of a `"use server"` module is a dispatchable action, so `startBlockAction` refused while `startBlock` wrote the row. It reached dose logging: `ensureActiveCycle` + `upsertProtocolCompound` + `upsertDoseLog` wrote what `pushDoseLog` refused. | The guard moved to the write itself: 34 functions across 13 modules. A 23-call sweep now refuses every one with nothing landing in any table. |
| HIGH | **A paying subscriber was told they were on a free trial, with no cancel button.** `strongestEntitlement` preferred the longest row, so a 14-day beta grace outranked a fresh 7-day Stripe trial: `manageActionFor` saw `comp`, returned `{kind:"none"}`, and `/billing` read "Complimentary" with NO CANCEL CONTROL for somebody whose card was on file. | Ordered by KIND first, date second. A forever comp still wins; a real subscription beats a time-limited comp; the grace is weakest. Six tests. |
| HIGH | **The day-5 push told the ninety beta accounts money was about to move.** *"Day 5 of 7 … and billing starts then."* They are on day 12 of 14, never had a trial, have no card, and will not be charged. It also contradicted the notice they were shown a fortnight earlier. | The grace gets its own words, in the same phrasing the notice and the pop-up use. |
| HIGH | **The beta notice rebuilt the entire app shell on every dashboard load.** Server returned `null`, client returned a portal. Measured: `<main>` created TWICE instead of once, one hydration error naming the frame, for all ~90 accounts until dismissed. Larger than the trial-banner defect this branch already paid to fix. | Gated on mount via `useSyncExternalStore`. Re-measured: `<main>` created 0 times, 0 hydration errors. |
| HIGH | **The focus trap let go for the whole 2s "Working…" window.** Both buttons go disabled, `button:not([disabled])` matches zero, the handler stood aside. Five Tabs walked out of a dialog still claiming `aria-modal="true"`. The exact defect the file's own comment says was fixed — it was fixed for the idle state only. | Focus goes to the dialog itself; the initial focus targets an ENABLED button. 0 escapes. |
| HIGH | **The app refused to CLOSE a block and allowed DELETING one.** A lapsed user could destroy a block but not end it, and was left with one reading "running" forever. | `closeBlock`/`extendBlock` ungated: both wind down something that exists. |
| HIGH | **The `?stock=` deep link walked past the guard**, and the save then blamed the user's connection. | Guarded on `canWrite` (not `guard()` — it runs during render). |
| HIGH | **The save offer's week never reached the mirror or the entitlement.** Only the webhook writes them; a lost one meant read-only on the old date having been promised a week in writing. | `syncSubscription` immediately, the way `applyCancelFlag` already did. Driven with no webhook: Stripe, mirror and entitlement all agree. |
| MEDIUM | **Two live billable subscriptions, through the `incomplete` blind spot.** Stripe keeps an `incomplete` subscription's first invoice payable ~23h; it was missing from `BILLABLE_STATUSES`, so neither the duplicate guard nor the pre-deletion sweep could see one. | `incomplete` is billable now, and `hasValidatedCard` treats it as "has not paid" so the abandoned-attempt retry still works. |
| MEDIUM | **The retention week was claimable by somebody who was not leaving** — cancel, un-cancel, claim; or cancel, let it die, start a new one, claim. | `grantExtraTime` requires `cancel_at_period_end` at grant time. |
| MEDIUM | **The host allowlist let two kinds of stranger through.** `192.168.evil.com` matched the private-IP prefix test (and was served over PLAINTEXT); `.endsWith(".vercel.app")` accepted anybody's deployment. The comment claimed an unrecognised host fell back to production. | `lib/billing/originAllowlist.ts`, pure and tested. ⚠️ **`fix/host-header-allowlist` has the `.vercel.app` hole too, where the value becomes a password-reset email link.** |
| MEDIUM | **`gate.ts`'s coverage doc was wrong in BOTH directions** — seven documented-ungated functions were gated, four gated ones were in neither list, and a paragraph described the opposite of the code. | Rewritten from the code; `scratchpad/gate-audit.mjs` regenerates it by parsing function bodies. |
| MEDIUM | **The backfill re-granted a fresh fortnight to everybody whose grace had expired**, on every re-run, and adding a friend to `COMP_EMAILS` afterwards did nothing for them. | Skips any account with a row; a comp-list member on a time-limited row is UPGRADED to no-expiry. |
| MEDIUM | **The grace banner and push fired regardless of `BILLING_GATE_ENABLED`** while the notice explaining them required it — so the documented go-live order produced warnings with no explanation. | Both gated on the switch. |
| MEDIUM | Fourteen refusals returned a bare `{ok:false}`, so the UI said "check your connection". | `readOnly: true` on the refusal; `AddStockSheet` reads it. |
| LOW | Orphan Stripe customers: 15 concurrent calls made 15 customers, 14 orphans, on demand. | An idempotency key on the customer create. |
| LOW | The live backfill returned every account's email address. | Names on the dry run only. |

**What they could NOT break**, worth not re-reviewing: every read for a lapsed
user (SSR byte-identical entitled vs lapsed on all ten screens except the plan
label); every delete; every profile setting; cross-user attacks on all three
billing actions; RLS on all four billing tables with a real JWT; the step alias
resolver across 24 hostile inputs with server and client agreeing on every one;
the age gate on the payment endpoint; timezone handling across +14, -11, Sydney
and LA walked hour by hour over the final 84 hours; and the duplicate-subscription
invariant under 15 concurrent calls.

**A mistake of mine the drive caught**, worth keeping: un-gating two functions by
exact-string replacement removed the FIRST match in the file rather than the
named one — the guard text is identical everywhere — so it silently un-gated
`startBlock` and left `closeBlock` gated, the exact inverse of the intent, inside
the commit fixing it. Every gated function is now audited by PARSING each body.

### Two defects the build itself produced, both found by EXECUTING

Neither was caught by tsc, eslint or the tests. Same lesson as every spec before.

- **The unapplied-migration branch tested the wrong error code.** `trialLease.ts`
  caught Postgres's `42703`; the real answer is PostgREST's **`PGRST204`**, which
  validates the request body against its schema cache and rejects before
  Postgres sees the statement. So an unapplied `002` fell through to the generic
  branch, returned "busy", retried five times over two seconds and then
  **REFUSED TO START ANY TRIAL AT ALL** — the exact fail-closed outcome the
  tolerance exists to prevent, on a payment path. (`runner.ts` already handled
  both codes, which is how the right answer was found.)
- **The alias map's prototype chain.** `?step=constructor` would have rendered a
  crash. Caught by writing the test before the implementation.

### Two traps worth keeping

- **A portal renders NOTHING on the server.** `BetaLaunchNotice` and the
  read-only pop-up are portals, so no amount of reading the served HTML can
  confirm them. What CAN be confirmed over HTTP is the server's DECISION —
  the component's reference is in the RSC payload, and is completely ABSENT once
  the seen cookie is set. The rendering itself is a browser check.
- **`server-only` is not a real package outside a Next bundle.** Sixteen suites
  died with "Cannot find package 'server-only'" the moment `gate.ts` entered the
  dose-sync import graph. Aliased to a stub in `vitest.config.ts` rather than
  removed from the source: the marker fails the BUILD if a client component
  imports a server module, which is what keeps the service-role key out of a
  browser bundle.

## The cold review of the billing branch (2026-08-12)

Three adversarial agents against the running app, the live database and real
Stripe test clocks. **Everything below was found by EXECUTING; tsc, eslint and
908 tests were green throughout.** The same lesson as every wave before it.

| Sev | Finding | Resolution |
|---|---|---|
| CRITICAL | **Cancel took the money anyway.** `limit(1)` off the mirror ordered by `updated_at`, while one user can hold two live trials (the duplicate guard keys on user AND plan). Cancel stopped the wrong one, returned `{ok:true}`, and the mirror write bumped `updated_at` on the row it had just cancelled — pinning `limit(1)` to the dead row, swapping the screen to "Restart my trial", and removing the only control that could have stopped it. Test clock to day 8: **$69.99 taken** from somebody who pressed Cancel and was told in writing they would not be charged. | Asks STRIPE, not the mirror, and cancels **all** billable subscriptions. `liveSubscriptionsForUser` is shared with the deletion path. |
| CRITICAL | **The reminder fired AFTER the charge.** `trial_ends_at` is an instant; the stop condition compared day numbers. Every trial ends in the small hours of its final local day (7×24h from a signup at any time), so a 09:00 send on that day is after the money moved. Measured: a real encrypted push delivered **7h21m after the charge**, announcing it. | Compares against the instant. The banner too. |
| CRITICAL | **Two overlapping cron ticks each sent one**, and **a failed stamp write reported `"sent"` and re-sent every tick** — ~96 notifications a day about somebody's money, while the cron's own JSON said everything was fine. | Claim-before-send: a conditional UPDATE whose row count decides who owns the send. A send that lands keeps the claim; one that does not hands it back. |
| HIGH | **`cancelNowForUser` read the mirror** — the thing it exists to distrust. With one subscription mirrored and one not (a webhook in flight, or left `unattributed`), it returned a clean success with a live subscription still billing, clearing a deletion to cascade away the only row connecting it to a person. | Asks Stripe. And a WIDER status set than the cancel button uses: `paused` and `unpaid` can still take money. |
| HIGH | **The page and the action selected different rows.** The page had no status filter, so a dead `incomplete_expired` row (which `startTrial` creates when it cancels an abandoned attempt) rendered "This one can't be changed from here. Email support" for a user with a perfectly live trial. | One filter, one ordering, soonest-ending first. |
| HIGH | **A `reminder_time` inside quiet hours killed the reminder permanently.** 23:00 with quiet 22:00→08:00: every tick is either "too early" or "quiet hours" and the two gates never open together. Three trial days walked, zero pushes, no error anywhere. Reachable — the settings screen offers three unconstrained time inputs. | The trial reminder falls back to `quiet_end` when its time is unreachable. |
| HIGH | **A trial-stamp failure knocked out the other three reminders**, because all four stamps went in one UPDATE — the exact outcome `004`'s header claims it avoids (true of the read, false of the write). | The trial stamp is its own write. |
| MEDIUM | **The Stripe `return_url` trusted `X-Forwarded-Host`.** Poisoned to an arbitrary origin; Stripe validates nothing. | Allowlist, falling back to production. **The same pattern is still live in `forgot-password` and `login`, where it becomes an email link** — flagged, not fixed. |
| MEDIUM | **Both new migration headers said "NOT YET APPLIED"** about migrations applied hours earlier — the same error this branch had just repaired for `grants/004`. | Corrected, with what was executed to verify them. |
| MEDIUM | A stale trialing row could hide an imminent one (`updated_at` ordering) in the runner and on the dashboard. | Soonest-ending first, everywhere. |
| LOW | `012`'s own VERIFY block expected `0` em dashes where a correct apply leaves `1` (the heading line it deliberately keeps), so anyone following it would see a failure and reach for the blanket replace the file forbids. | Corrected to expect 1, with why. |
| HIGH | **The dismissed banner was painted on every load and then yanked.** `localStorage` cannot be read on the server, so `getServerSnapshot` returned null, the server rendered the banner every time, and the client removed it after hydration. Measured in headless Chrome: in the DOM 200ms, **painted ~166ms**, then content below jumped **806px → 738px**. Every dashboard load, for the whole window, about being charged. Both docstrings claimed the opposite. | A COOKIE, read in `cookies()` before the page is built, so a dismissed banner is never sent to the browser. The external store is gone. |
| MEDIUM | **The dismiss X was a 24×24 target** with the `/billing` link 12px away. A real dispatched touch grid: 18px left of centre the LINK won and the user was navigated instead of closing the notice. | 44px, Apple's floor. Icon and optical spacing unchanged. |
| MEDIUM | **The confirm dialog had no focus management** while claiming `aria-modal="true"`. Focus never entered it; six Tabs walked out onto the portal row, the back link and all four nav tabs; Escape left focus in the tab bar. For a screen-reader user `aria-modal` made it worse than silence. | Focus moves in, Tab cycles, focus returns to the trigger. |
| MEDIUM | **The resume screen printed the same date three times** under two labels, to somebody re-reading it to be sure they had cancelled. The guard covered `cancel` only. | Suppressed for the whole trial case. |
| LOW | **One account's dismissal hid another's banner** on a shared browser. **The first fix — matching the cookie by its `:${date}` suffix — did not fix it** (same date, any account), and the same driver caught that too. | The account is compared where the account is known; the pure module still knows nothing about accounts. Pinned by tests. |
| LOW | Two clicks in the SAME TICK fired the action twice (`useTransition`'s `pending` has not committed yet), and a same-tick backdrop tap closed the dialog mid-flight so a failure had nowhere to render. Neither is thumb-reachable. | An `inFlight` ref guards both. |

**⚠️ A TRAP WORTH KEEPING: the app does not hydrate on `http://127.0.0.1:3100`,
only on `http://localhost:3100`.** No `__reactFiber$` key on any node, zero
DevTools renderers, HMR socket fails. Every scratchpad driver points at
`127.0.0.1`, which is fine for SSR and server-action assertions — those go over
the same HTTP surface a browser uses — but **no conclusion about clicking,
tapping or dismissing can be drawn through them.** It produced one false critical
before it was caught.

**What they could NOT break** (worth not re-reviewing): cross-user and anonymous
calls to all three actions, with forged arguments, the victim's subscription id,
the victim's customer id, tampered cookies, and from four different routes —
every one refused, nothing leaked, the owner's subscription untouched. RLS denied
every billing write with a real JWT including a user's own `cancel_at_period_end`.
Cancel+resume fired together six times and five concurrent cancels: Stripe and
the mirror agreed every time. Cancelling never revoked access. `trial_will_end`
granted nothing to a card-less trial at day 0 or day 4 on a test clock. Timezone
handling across +14, −11, +05:45 and +10:30, and DST transitions in four zones,
all correct.

On the UI side: the modal really is above the nav and the FAB (`elementFromPoint`
at the centre of both returns the backdrop); `prefers-reduced-motion` genuinely
wins (`animationName: none` on dialog AND backdrop); nothing on `/billing` sits
under the bottom nav (the page ends 266px clear of the FAB); every App-card row
on Profile measures 48px with the caret at 354 for both `Free trial` and
`Complimentary`; tap heights are 44px and 46px; the error path keeps the dialog
open, shows the message and re-enables both buttons; and the module-level
`sessionDismissed` never leaked across users on the server.

## The cancel control, and the trial notice on screen (BUILT, 2026-08-12)

Three surfaces promised "cancel any time before then" and nothing in the app
could do it. `/billing` now can.

### In-app, not Stripe's hosted portal (Adrian's call)

The portal was offered and rejected in favour of a narrow in-app control. It
never leaves the PWA, the copy at the moment that most needs it is ours, and the
capability is exactly two fields wide. The portal remains the right answer for
**card updates and invoices**, which is a different job and is still owed.

### The shape

- **`/billing`**, its own route beside `/notifications`, opened from Profile's
  Billing row. States access, price, trial end, renewal date.
- **`cancelSubscription` / `resumeSubscription`** (`app/(app)/billing/actions.ts`)
  set `cancel_at_period_end` and nothing else. **Neither takes an argument**: the
  subscription is resolved from the verified session every time, because a server
  action is a public HTTP endpoint and an id parameter would be an
  "cancel anyone's subscription" endpoint with a reasonable-looking signature.
  The READ goes through the session client so RLS refuses another user's row
  independently of the scoping; the service client appears only for the mirror
  write.
- **Cancelling never revokes.** `entitlements` is not written by this path at
  all: `active_until` already holds the date and `isEntitlementActive` lets the
  clock do the work. Cancel on day 3 of a paid year, keep the year.
- **`manageActionFor`** (`lib/billing/manage.ts`, pure) decides which control to
  render from the ENTITLEMENT's source, not the subscription's status. A comp
  gets nothing (there is nothing to cancel), Apple/Google get pointed at the
  store, and a comp held beside a live Stripe row is still a comp.
- **`/billing` cannot start billing.** No upgrade control, no link to
  `/onboarding`, by construction. A user with no subscription is told what they
  are on and nothing else.
- **No subtitle under the title** (Adrian, 2026-08-12). It read "Your plan and
  when it renews." and the Plan card directly beneath already states the plan and
  the date, so the line was a caption for something that captions itself.
  `/notifications` keeps its subtitle because it introduces a screen of switches
  whose purpose is not self-evident; this one does not.

### The Stripe portal, for the job we did NOT rebuild

`openBillingPortal` opens Stripe's Customer Portal for **payment method and
invoices only**. Cancelling stays in the app because the copy at that moment
matters; updating a card means handling card details, which is exactly the thing
to hand to Stripe and never touch, and a `past_due` user previously had no way to
fix a declining card from inside the app at all.

- **Returns a URL rather than redirecting.** A `redirect()` inside a server
  action throws a control-flow signal that a caller's `try/catch` swallows, and
  the failure mode is a button that silently does nothing.
- **`siteOrigin()` reads the request headers**, so a LAN dev server and a preview
  deploy return to themselves rather than bouncing a tester to production.
- The row is hidden unless the user actually has a `billing_customers` row, and
  hidden for an Apple/Google subscription, where Stripe holds no card.
- ⚠️ The account's DEFAULT portal configuration also enables
  `subscription_cancel`, so a user who goes looking finds a second cancel button
  in Stripe's wording. Harmless (the webhook syncs either way) but it is two
  paths to one outcome. Disabling that feature on the portal configuration is a
  dashboard change, not a code change. Carried in `next-tasks.md`.

**Verified against real Stripe:** a real portal session URL was created for the
owner and resolved 200; the attacker got "There's nothing to manage on this
account yet." with no customer id leaked; anonymous got "You need to be signed
in."; and a user with no Stripe customer never sees the row.

### `profiles.tier` is no longer read, and the beta label is gone

Profile hardcoded `"Beta · Pro"` from `profiles.tier` while `/billing` read the
entitlement, so one user could be told two different things on two screens.
`planLabelFor` (pure, in `manage.ts`) is now the single answer both ask for, and
it reads the ENTITLEMENT's source, so a founder who also subscribes reads as
`Complimentary` rather than being described by the subscription.

The "Beta ·" prefix is gone (Adrian, 2026-08-12: "we won't be in beta by then").

⚠️ **`NO_ENTITLEMENT_LABEL` is `"Pro"` and that is true only today.** Nothing in
the app reads `entitlements`, so all 106 accounts genuinely have the whole
product; saying "Free" would be the app lying about what it is giving away.
**Whoever wires `hasProAccess` into `app/(app)/layout.tsx` must change that
constant in the same commit**, or every locked-out user sees a screen telling
them they are on Pro. The comment beside it says so.

### Deleting an account must cancel the subscription FIRST

`lib/billing/cancel.ts` holds the shared path. `applyCancelFlag` is what the user
action uses; `cancelNowForUser` is the immediate cancel a deletion needs and it
**throws rather than returning** on any failure, because a deletion must be able
to stop.

The danger it exists for: `billing_customers`, `subscriptions` and `entitlements`
all cascade from `profiles`, so deleting an account erases the only mapping from
a Stripe customer back to a user **while the Stripe subscription keeps billing**,
and every later webhook is permanently `unattributed`. There is no self-serve
deletion today (it is a `mailto:` to support), so this currently binds whoever
processes that email by hand.

### The trial notice on screen

The push reaches 17 of 106 accounts. The same promise is now stated on Home for
everyone, in the trial's final stretch, dismissible per-trial.

**Audience: everyone, not only users who cannot be pushed.** Adrian raised the
conversion worry — reminding people invites them to leave. The answer taken was
that the wording is the lever, not the silence: the people most likely to cancel
when reminded are the same people most likely to DISPUTE the charge when not,
and a dispute rate is what closes a payment processor account. Reminding
converts a chargeback into a voluntary non-purchase.

**The copy is ONE sentence.** Two drafts died to get there, both cut by Adrian on
sight the same day:

1. `"Your free trial ends 15 Aug. Everything you've logged stays."` — reassurance
   nobody asked for. Softening a billing notice is how a billing notice stops
   being believed.
2. `"Your free trial ends 15 Aug. Billing starts then."` — the app explaining its
   own warning. "Just your free trial ends whenever it ends. A warning."

It now reads `"Your free trial ends 15 Aug."`, and "tomorrow" / "today" on the
last two days. `/billing` is one tap away and states the money in full. The word
"cancel" is on neither surface, and `trialReminder.test.ts` pins the whole shape:
one sentence, no tail, no "billing", no "stays", no em dash.

`trialNoticeFor` lives in `lib/notifications/trialReminder.ts` beside the push
and shares `trialReminderDateKey` with it, so the two surfaces cannot compute
different days for the same promise.

### Verified by executing

Real Stripe trials, a real signed-in session against a dev server, the real
server actions invoked over their real HTTP surface (the `next-action` header).

- `/billing` renders **"Free trial · $69.99 USD / year · Trial ends 19 Aug
  2026 · Cancel my trial"**. Anonymous → **307 `/login`**. No `/onboarding` link.
- Cancel → **Stripe `cancel_at_period_end = true`**, mirror updated, and the
  entitlement **still active with its date intact**. The page flips to "Ends on
  … / Restart my trial". Resume → back to false.
- **A different signed-in user calling `cancelSubscription` left the owner's
  subscription untouched**, returned `{"ok":false,"error":"There's no active
  subscription on this account."}`, and leaked neither the subscription id nor
  the customer id. Anonymous got `"You need to be signed in."`.
- **The banner window, walked day by day**: silent at 7, 4 and 3 days out; at 2
  days "ends 14 Aug", at 1 "ends tomorrow", at 0 "ends today", silent at -1.
  Silent for an already-cancelled trial inside the window. Links to `/billing`.

### One trap worth keeping

**A test account cannot reach `/billing` without passing the 18+ gate first**,
and since `grants/004` those columns are service-only — so a harness must write
`is_18_plus` / `tos_accepted_at` / `date_of_birth` with the SERVICE ROLE. The
first run of this driver reported the page as broken when it had simply been
redirected to `/welcome`.

Server action ids are addressable for driving: Turbopack stamps them into the
client chunk as `__next_internal_action_entry_do_not_use__ [{"<id>":{"name":…}}]`.

## The trial reminder (BUILT, 2026-08-12)

## The trial reminder (BUILT, 2026-08-12)

The paywall timeline ("Day 5 · Reminder") and the checkout disclosure ("We'll
remind you on day 5") both promised a notification out loud and nothing sent one.
It sends now.

### The shape, and why it is not the obvious one

**Stripe's `trial_will_end` is a SIGNAL, not the schedule.** It fires three days
before the trial ends, which on a 7-day trial is DAY 4, and both screens promise
day 5. So the handler does one thing: `syncSubscription` on the re-read live
object, which refreshes `subscriptions.trial_ends_at`. It sends nothing.

`lib/notifications/trialReminder.ts` then decides the day from that stored end
date, and the existing reminder cron sends it — after the user's `reminder_time`,
outside their quiet hours, in `profiles.timezone`.

**It counts BACK from the trial end, not forward from the start**
(`TRIAL_REMINDER_LEAD_DAYS = TRIAL_DAYS - REMINDER_DAY`, derived). The sender
never sees the start day; all it holds is the end. Counting back is also the more
honest of the two if a trial is ever not exactly `TRIAL_DAYS` long (a coupon, a
support extension): "day 5" would then describe a schedule that no longer exists,
while "two days before you are charged" is still exactly what the screen said.

### The decisions worth not re-deriving

- **It fires ON OR AFTER the promised day, never after the charge.** An exact
  `today === reminderDate` rule turns any missed cron tick — a deploy, an outage
  — into no warning at all before money moves. A late warning is worth a great
  deal; a missed one is the thing the screen promised would not happen.
- **The stamp is the reminder's DATE, not the day it was sent**, which is why the
  column is `trial_reminder_sent_for` and not `last_trial_reminder_on`. A
  catch-up send on day 6 stamps DAY 5, so the next tick sees its own work. It
  also means a returning customer's second trial has a different reminder date
  and correctly gets its own reminder.
- **Somebody who has already cancelled gets nothing.** The promise is "before
  anything changes", and for them nothing is about to.
- **It is not behind the three content toggles** (`dose_reminders_on` and the
  rest). Those are preferences about protocol nudges; turning off dose reminders
  is not consent to be charged without warning. It IS behind the master switch
  and quiet hours.
- **The copy says nothing about cancelling and quotes no price.** There is no
  cancel control in the app to send anyone to (see `next-tasks.md` — this is now
  the largest unkept promise left), and the runner holds the subscription mirror,
  not the plan's amount, so any figure here could contradict checkout.

### Two defects the build itself produced, both found by executing

Neither was caught by tsc, eslint or the tests. Same lesson as every spec before.

- **A stamp was advanced on the TOTAL send count**, so a message that reached no
  device was recorded as delivered. Pre-existing shape, and it never mattered
  while all three messages were protocol nudges that come round again tomorrow.
  The trial reminder has no tomorrow. Each stamp is now gated on its own
  message's delivery, via `SendReport.byTag`.
- **A composed-but-undelivered reminder reported `undefined`** — identical, from
  outside, to a user with no trial. Surfaced by pointing the real runner at a
  push endpoint returning 410. It reports `send-failed` now, and does not stamp,
  so the next tick retries.

### Verified by executing, against the live database and real Stripe

A local HTTPS endpoint stood in for a push service, so the payloads below were
really encrypted by `web-push`, really delivered over the wire, and decrypted
with the subscription's own keys rather than asserted from the composer.

- **The real payload**, off the wire: `{"title":"Your free trial ends soon",`
  `"body":"Day 5 of 7. Your trial ends on 15 Aug, and billing starts then.",`
  `"url":"/profile","tag":"trackd-trial-ending"}`
- **Two users, one subscription, different promised days.** A trial ending
  14 Aug 15:39 UTC is the 15th in Sydney and the 14th in Los Angeles: Sydney was
  reminded on 13 Aug and told "15 Aug", LA on 12 Aug and told "14 Aug".
- Sends **once**: every later tick that day, and on the 14th and 15th, returned
  `already-sent`. Silent on the 12th (`too-early`) and the 16th (`trial-over`).
- **The catch-up holds**: nothing ran on the 13th, the 14th still warned, and it
  stamped 13 Aug so the 15th did not fire again.
- **A dead endpoint does not stamp** — `sent: 0`, `send-failed`, stamp still null.
- **`trial_will_end` through the real route**: a mirror deliberately seeded with
  `1999-01-01` was refreshed to the true trial end; a replay of the same event id
  returned `duplicate`; a forged signature returned 400.
- **The whole chain in one run**: real Stripe trial with an attached card →
  signed `trial_will_end` → the real webhook route created the mirror from
  nothing → the real secured cron at `/api/notifications/run` picked the user up
  and reached the reminder decision. Unauthorised cron still 401s.

### Known and accepted

- ~~**A trialing user with notifications off is never reminded.**~~ **CLOSED the
  same day** by the in-app notice on Home (see the section above). The push still
  only reaches opted-in users; the banner reaches everyone.
- **`supabase/notifications/004` is unapplied**, so it withholds today and says
  so in the cron's own output. Deliberately read in its own query so the
  unapplied state cannot take quiet hours and the other three stamps down with it.

## `grants/004` was ALREADY APPLIED — the header was stale (2026-08-12)

The file still said "NOT YET APPLIED" and `next-tasks.md` carried it as owed. It
is applied. Proven by running the attack: all four gate columns 42501 to a real
user JWT with the publishable key, `sex` still 200. Then all 23 `profiles`
columns swept against the enumerated grants in `003` + `004` — 18 writable, 5
denied, zero mismatches either way.

**The rule this re-earns:** a hand-applied migration's file header is a claim,
never a record. Two sessions carried this as outstanding work that was already
done.

## /admin — the founder dashboard, rebuilt (BUILT, 2026-08-13)

Branch `admin/dashboard`, cut from `main`. Deliberately NOT built on
`wave3/billing-cancel`: that branch is nine commits of billing work with a dirty
tree, and Adrian's instruction was to leave it alone.

### The bug that was already there, and had been for a month

`lib/db/adminMetrics.ts` counted an "active user" across five tables and
selected `user_id` from all five. **`weight_logs` keys on `profile_id`.** The
query returned 42703, the error was swallowed by a bare `continue`, and
bodyweight logging never once counted toward an active user. The live table
holds 51 rows, so the daily and weekly active numbers on that page were
understated for the whole time it shipped.

Fixed three ways, because the column was the symptom and the swallow was the
cause: each activity source now carries its own user-id column, every failed read
is collected in an `IssueLog`, and the page renders the failures in red at the
top. A broken source is now visible the same day instead of looking like a quiet
week.

### Structure

`lib/db/adminMetrics.ts` is gone, replaced by `lib/db/admin/`:
`core.ts` (client, founder gate, the query boundary type, `IssueLog`),
`activity.ts`, `billing.ts`, `people.ts`, `product.ts`, `ops.ts`, `index.ts`.
Pure helpers that can be unit-tested live in `lib/admin/aggregate.ts` and
`lib/admin/labels.ts` — 40 new tests.

**The counts-only invariant is unchanged and now written down where it is
enforced** (`lib/db/admin/core.ts`): nothing in that directory may return a row.
Columns are read, tallied and dropped inside the module. Adrian's call on the
onboarding free-text field (`signup_intake.struggle_detail`) was counts-only, so
the page shows how many people typed something and never what they typed.

### `"use server"` → `server-only`

The old module was marked `"use server"`, which made every export a publicly
reachable server action guarded only by its own founder check. Nothing calls it
from the browser, so it is now `server-only`: unreachable from the client, and
importing it into a client bundle fails the build. The founder re-check stayed.

### What the page shows now

Overview, growth (waitlist + accounts sparklines, channels, attribution),
onboarding funnel, retention (incl. weekly return rate and never-written
accounts), revenue (subscription statuses, trials ending, cancelling,
entitlements by source), what people run (compound leaderboard, category/route/
schedule splits, inventory), feature adoption across 11 features, onboarding
answers, demographics (bucketed ages — no DOB or individual age is ever
returned), system health (unprocessed webhooks, push staleness), feedback SLA,
consent coverage, and the email list. The range control (7D/30D/90D/All) now
drives every time-based section rather than one chart.

### CSV export

`app/admin/export/route.ts`, founder-gated, allowlisted datasets, reading through
the caller's OWN RLS-scoped client rather than the service role — so the SQL
policies decide, not the app. Every field goes through `csvField`, which
neutralises spreadsheet formula injection: the waitlist email and the feedback
body are stranger-controlled, and `=HYPERLINK(...)` in a feedback note would
otherwise be a live formula when the download opened in Excel.

### Styling

`ui-context.md` gained an **Admin** section: /admin is the one documented
exception to "new screens reuse the system", scoped to `app/admin/**` and
`components/admin/**`. Seven `--admin-*` tokens, **none of them a new hex** —
every one aliases an existing palette colour. Bar charts and directional colour
are permitted there (business metrics, never health readings) and nowhere else.

### Three cold reviews, 2026-08-13 — security, correctness, UI

**Security: no critical, no high.** The counts-only invariant was traced field by
field and holds; auth gates run before every query; `server-only` is effective
(Next aliases it, and the client layer throws at build); the CSV route is sound.
Three low findings, all fixed: `beta_feedback.path`, `affiliate_code` and
`profiles.timezone` are all user-writable and were being rendered raw as chart
labels — they now go through allowlists and shape checks. `IssueLog.detail`
claimed "never contains user data" and could not promise it; the comment now says
what is true.

**One medium was NOT fixed, deliberately** — the founder gate keys on an email
string in `lib/admin.ts` and three SQL policies, so it depends on Supabase Auth
project settings that are not in this repo. Moving it to two fixed `auth.uid()`s
is a change to the auth model and a migration. Written up in `next-tasks.md` for
Adrian to decide.

**Correctness found five real bugs beyond the three already caught:**
- `entitledAccounts` filtered on `is_active` alone. `sync.ts` deliberately leaves
  that true on cancellation and lets `active_until` lapse, so users who cancelled
  months ago still counted as having access, forever. Now calls
  `isEntitlementActive` from `lib/billing/access.ts` — the product's own gate.
- Truncation detection compared against the client limit, which cannot see
  PostgREST's own `max-rows` ceiling (Supabase default 1,000). Now compares
  against the server's exact count. Verified: nothing truncates today.
- Dose activity keyed on `taken_at`, which the user picks — back-logging made you
  active in the past, future-dating made you active in advance. Now `created_at`.
- "Never written" came from 5 tables while adoption came from 11, so the same
  account could appear in both. Both now derive from one set of reads.
- The page's own three queries still did `data ?? []` with the error dropped —
  the exact pattern this work removed, surviving one file away.

**UI found eight**, the substantive ones being: directional colour with no arrow
(colour as the only signal), `--admin-series-4` at ΔE 14.5 from series-1 (they
read as one colour at legend size, now `--cat-thyroid`), `SplitBar` cycling four
colours over up to nine unlabelled categories, a fourth per-screen switch variant
where the app documents none, and a 120-char waitlist `source` silently clipping
the date column off its row.

### Verified

`tsc` clean, `eslint` clean, **915 tests** pass, `next build` succeeds. Every live
query was fired against the real schema with the service role before each commit —
that check is what proves the column names, which TypeScript cannot see through
PostgREST's strings. The funnel was additionally checked against live data to
confirm it is monotonic.


## /admin — the Glass Console rebuild + the arcade (BUILT, 2026-08-13, later)

A second pass, after Adrian looked at the first one and said it read as "a lot
of data and I don't know where to start".

### Structure

**Five tabs, never one long page.** Overview, Money, Users, Product, System.
Tabs are local state (instant); the range control stays a real link because it
changes what is fetched. Overview's order is fixed: what needs you, what
changed, the four numbers, the funnel.

Adrian picked the **Glass Console** direction from four rendered samples. See
`ui-context.md` → The Glass Console for the tokens and the rules. Not one new
hex — everything is `color-mix`ed from the existing palette.

### What the data layer gained

Period-over-period deltas (+1 query total: existing reads are widened to 2× the
window and split in memory), MRR priced off live Stripe prices, ranked movers, a
one-sentence auto-headline that refuses to speak unless a change clears a
percentage bar AND an absolute bar AND a baseline, all-time records, and a
cohort retention grid whose cells distinguish "not observed" from a real 0%.

**A quarterly plan would have tripled MRR.** Stripe writes "every 3 months" as
`interval: month` + `interval_count: 3` and nothing read the count. Every price
configured today is 1, which is precisely why it would have gone unnoticed.
Fixed on `PlanPrice`, divided out in `monthlyAmount`, tested.

### "Check this" is gone

Every alert now carries the fact, what it means, and the next concrete step.
`lib/admin/alerts.ts` is pure and unit-tested. Adrian's exact objection — "how
am I meant to check that" — was correct and the two-word status deserved to go.

### The consent number, corrected

84% was two unrelated things counted as one. Consent has TWO mechanisms:
`consent_records` (granular, earliest row 2026-06-24) and the original
`profiles.is_18_plus` + `tos_accepted_at`, which is still what
`getSessionContext` reads to grant access. Counting only the newer one said the
two oldest accounts never agreed to terms they demonstrably accepted. Live now:
**78 consented, 12 never finished onboarding (no data, no access), 0 with data
and no consent.** That last is the only alarming number and it has its own row.

### The arcade

Behind an "Arcade" control in the header, or by typing "games" into ⌘K. Not a
tab and not a footer button — a takeover, so the dashboard stays a dashboard.

**Chess has a real engine** in `lib/admin/arcade/chess.ts`: 27 tests including a
400-position perft, so move generation is provably correct. Castling through
check, en passant, promotion, stalemate, fifty-move draw.

**The Elo was wrong by ~1000 points and is now researched.** Stockfish skill
level 0 searches to depth 1 and rates ~1100-1250; lichess level 1 is under 400;
chess.com's Martin at 250 shows no development at all and lets you take every
piece for free. So a genuine 250 must blunder nearly every move rather than
merely search shallowly. **Quiescence search was added** — a fixed-depth engine
stops at the horizon and scores "I take your queen" without seeing the
recapture, worth roughly 300 points on its own. Eleven rungs, 250 → 2000.

Pieces went 16×16 → 24×24: at 16 a horse head is nine pixels of head, which is
why the knight was unrecognisable. Drag as well as tap, a 600ms thinking pause
(an instant reply reads as a script), amber confetti on a win, a per-character
taunt on a loss, and nothing locked.

Plus Vial Stack (a perfect drop grows the vial back and the pitch climbs), Dose
2048, Vial Snake, Titration on a real exponential half-life, Kyle Run and Draw
Time. All sound is generated live via Web Audio — no files to load or block.

### Verified

`tsc`, `eslint`, **1045 tests**, `next build`, 31 live reads validated against
the real schema, and every range variant smoke-tested against a running server.

## Spec w2b-15 — Stripe billing (BUILT, 2026-08-08)

Same branch, `wave3/account-before-paywall`. **Not merged, and deliberately so —
Adrian is not billing yet, so nothing may route a user at `/onboarding`.** The
flow is still additive and `/login` is untouched, so that is already true; the
thing to avoid is wiring the entry point.

**One migration, `supabase/billing/001_billing_tables.sql`, APPLIED by Adrian.**
Shape and reasoning are in `architecture.md` → **Billing**; do not re-derive.

### Four cold reviews, 2026-08-08 — SQL/money, webhook, paywall UI, security

**Two CRITICALs and seven HIGHs, every one real and every one live.** None was
caught by tsc, eslint or the 756 tests. Two of them were found only by a Stripe
TEST CLOCK, which is now the tool of record for anything billing-shaped.

| Sev | Finding | Resolution |
|---|---|---|
| CRITICAL | **Seven free days with no card, repeatable forever.** The trial entitled on `status: trialing`, and Stripe sets that AT CREATION — before the SetupIntent is confirmed, because the confirm needs the secret the creation returns. Type any Luhn-valid number, tap, close the tab. The day-7 auto-cancel then reopened the duplicate guard, so it was one request a week, per account, indefinitely. | A trial entitles only once Stripe reports a payment method attached OR no pending setup intent. Requiring the payment method ALONE would have withheld it from every genuine trial — `save_default_payment_method` fires on an invoice and a trial pays none. |
| CRITICAL | **Abandon 3DS once and the next attempt took no card.** The duplicate guard counted mirror rows with `trialing`, and that row is written even when the card was never validated. Second attempt on a DIFFERENT plan → "You're in!" in 746ms, no card, old plan, unshown price, silently cancelled on day 7. | The guard asks STRIPE. Same plan → hand back the existing SetupIntent so they finish what they started. Different plan → cancel it, because they chose something else. |
| HIGH | **Cancelling handed back the free month.** `subscription.deleted` re-granted the unpaid period — and Stripe cancelling at the end of dunning is the DEFAULT end state of a failed renewal, so it undid the claw-back. | Deletion may only ever SHORTEN. |
| HIGH | **The claw-back was a whole billing period out.** `invoice.period_start` is the cycle just COMPLETED, not the one being billed. A customer paid through 14 Sept was locked out instantly at 17 Aug — on yearly, ~362 days in the past. | Reads the line item's period. |
| HIGH | **A failed webhook failed forever.** The event row was inserted first, so every retry short-circuited on the primary key. `stripe events resend` delivers the SAME id, so Stripe's retries, the dashboard and the CLI were all guaranteed no-ops — the comment claiming otherwise was simply false. | A conflict means SEEN, not DONE. An unprocessed row older than 60s is re-runnable. |
| HIGH | **No ordering protection at all.** Three measured reorderings each produced a wrong entitlement, and Stripe guarantees no ordering. | Every subscription handler re-reads the live object, so arrival order stops mattering. |
| HIGH | **Nothing could ever revoke.** `is_active = false` was written nowhere, so a chargeback left full paid access standing. | Disputes and refunds revoke. |
| HIGH | **The 18+ gate was a column the client could write.** One PATCH with the publishable key opened the whole `(app)` group AND the payment path to an account whose recorded date of birth said eleven, with zero consent rows. | `grants/004` takes the gate columns off `authenticated`; both legitimate writers move to the service role. |
| HIGH | **`TrialHold` polled twice.** One `alive` boolean set true at the top of every effect run meant a cleanup followed by a re-run RESURRECTED the old loop — measured, 20 requests in 29s, in pairs. | A run token compares identity. |
| MEDIUM | Five concurrent calls made five subscriptions (check-then-act against a mirror only the webhook writes). | A Stripe idempotency key per user+plan. |
| MEDIUM | The wallet was never told a payment failed; Apple Pay's sheet sits above our DOM so the inline error painted behind it. | `paymentFailed()` on the confirm event. |
| MEDIUM | The 3DS full-redirect returned to the paywall — the price list they had just paid on. | Returns to the card screen. |
| MEDIUM | An unattributable event was stamped processed, so the only monitoring signal was permanently empty. | Left unprocessed for review. |
| LOW | `CURRENCY_SYMBOL` hardcoded `$` while the currency was data-driven — an EUR price would have rendered dollars everywhere. | Derived from the currency. |

### What the reviews could NOT break

RLS and the grants (32 attacks with a real JWT across all four tables — every
one 42501, denied at the privilege layer before RLS); cross-user reads; the
`server-only` boundary (a deliberate client import FAILS THE BUILD); **no secret
in the client bundle**, checked against the literal key values; the signature
verification (a valid signature over a different payload → 400, a genuine replay
after the tolerance → 400); concurrent duplicate delivery (12 simultaneous → one
handler run); the hand-written schema types against the live database, column for
column; and the disclosure requirement, re-measured against the scroll port's
fade mask in four configurations.

### Still open, deliberately

- **Nothing in the app reads `entitlements`.** `hasProAccess` has one consumer:
  the post-payment poll. `app/(app)/layout.tsx` gates on session + age only, and
  Profile still renders the plan from `profiles.tier`. That is CORRECT while
  Adrian is not billing — but it means the paywall is not currently enforcement,
  and it is easy to mistake for it. Wiring the gate is a deliberate, separate
  decision.
- **A trial can still be restarted** after a genuine cancellation. With the
  no-card fix that buys nothing without a card, so it is a product question
  (should a returning customer get another trial?) rather than a hole.
- **Apple Pay has never been driven.** It needs HTTPS and a registered domain.

### Adrian's overrides of the spec body

1. **Three plans, all wired** — not "one monthly price". Annual is no longer out
   of scope.
2. **7-day trial**, not 5. Every figure on the paywall derives from `TRIAL_DAYS`.
3. **USD, not AUD**, and **no conversion to AUD anywhere**. The card issuer
   converts at its own rate on its own day, so a printed AUD figure would be
   invented. The currency is NAMED instead ("$69.99 USD per year"). A real AUD
   price selected by country is the correct future answer, not a client-side sum.

### What was found by driving it rather than reading it

- **Every declined card bought a free month.** The full write-up is in
  `architecture.md`; the short version is that Stripe reports `active` for a
  moment when the period rolls, BEFORE attempting the charge, so the extension
  looked legitimate at the time. Only a test clock surfaces this.
- **The paywall could be paid on with the price scrolled off.** The disclosure
  sat above the Payment Element, which measured 550px above the CTA at 390x844 —
  the exact defect the spec's own previous audit records. It is now passed INTO
  `PaymentSheet` and rendered directly above the button, so nothing added above
  can separate them again.
- **Link took over the payment block** with a phone-number field, a full-name
  field and its own terms before a card number. Disabled on the payment method
  configuration (API, not the Wallets panel — which is why it could not be found
  in the dashboard).
- **`interface` collapses a Supabase schema generic to `never`**, silently, with
  the error surfacing on an unrelated insert. Type aliases have the implicit
  index signature `Record<string, unknown>` needs.
- **`current_period_end` moved onto subscription ITEMS.** Reading the top-level
  field returns undefined → a NULL `active_until` → which the access rule reads
  as NEVER EXPIRES. A billing bug that grants forever is the expensive direction.

### Known and accepted

- **Apple Pay cannot be verified on a preview.** Each preview deploy gets a new
  hostname and every one would need registering with Stripe. `trackdco.app` is
  registered (`pmd_1U1q10Em…`) and the verification file is committed at
  `public/.well-known/`, so LIVE registration is a click — but test mode does not
  enforce verification at all, so "active" there proves nothing. Google Pay has
  no such requirement and is the one to check a preview with.
- **The floating "stripe" pill over the CTA is `elements-inner-easel`**, Stripe's
  test-mode indicator. Only renders for a `pk_test_` key.
- ~~**The trial reminder is still a promise nothing keeps.**~~ **BUILT
  2026-08-12** — see the section at the top of this file. `trial_will_end` now
  refreshes the stored trial end and sends nothing; the existing reminder cron
  fires on the day the SCREEN promised.

## Spec w2b-14 — account before the paywall (BUILT, 2026-08-07)

Branch `wave3/account-before-paywall`, off `main`. **Not merged.** The spec named
`wave3/onboarding-flow`; that branch had diverged ~20 commits of unrelated wave-2
work and was missing main's onboarding fixes, so Adrian took a fresh branch.

**One migration: `supabase/onboarding/002_signup_intake.sql`, APPLIED by Adrian
2026-08-07.** Live DB now at 28 tables.

Account creation is its own step between `free` and `paywall`. `account` is the
new phase boundary — the paywall and everything after it may assume a session,
which is what spec w2b-15 mounts a Payment Element on. Full shape in
`architecture.md` → **Account before the paywall**; do not re-derive it.

### What the spec assumed that was not true

- **"14 steps" is 18** (19 now), and **five of them come AFTER the paywall** —
  welcome, notifications, attribution, letter, install. The flow is one route
  (`/onboarding`) with `?step=` in the URL, advanced by `pushState`, not
  fourteen routes.
- **The paywall had no auth controls to move.** They were unmounted 2026-08-05.
  So step 3 was mounting `/login`'s components on the new screen, unrestyled.
- **There was nowhere to put most of the answers.** No `name` column on
  `profiles`, no table for running/struggle. Hence `signup_intake`.

### The three defects that only showed up by driving it

None were caught by tsc, eslint or the (then) 728 tests. Same lesson as w2b-13.

1. **A server `redirect()` is a SOFT navigation.** The flow is one mounted client
   tree that reads `?step=` at mount and on `popstate` only, so `?step=paywall`
   appeared in the address bar while the account screen — sign-in form and all —
   stayed on screen for a user who had just signed in. `signIn` now hands the
   destination back for `window.location.assign`, which also makes all three auth
   returns full document loads and gives the handoff ONE arrival to hook.
2. **The paywall's `setAccountName(null)`** ran after the handoff had set the
   name from the claimed row. Welcome would have greeted a signed-in user as
   nobody. Deleted with the rest of the dead auth code.
3. **The second-device hole, and it destroyed the whole answer set.** Sign up by
   email on the phone, open the confirmation link on the laptop where your email
   is — that laptop has no onboarding session, and it claimed an EMPTY
   `signup_intake` row. The table is append-only and first-write-wins, so the
   phone's real answers then hit a row that already existed, were reported as
   "already claimed", and were cleared. Every individual step behaved exactly as
   designed. `carriesAnswers` now refuses to write a claim with nothing in it.

### Verified by executing, against the real database

Playwright at 390×844 with the iPhone 14 insets simulated (headless Chromium
reports a 0 inset, which is the class of bug desktop hides). Disposable accounts
created through the admin API, since `.env.local` points at production and there
is no local Supabase.

- Progress counts the new screen: free 67% → account 72% → paywall 76% →
  install 100%. Monotonic, never complete while a screen remains.
- Email sign-in from the account screen lands on the paywall; `/login` unchanged.
- Google OAuth starts with `redirect_to=/auth/callback?next=/onboarding?step=paywall`.
- The answers survive **leaving the site and returning through a server 302** and
  are claimed on arrival — driven through `/auth/confirm` with a real single-use
  token rather than `/auth/callback` with a Google code, because there is no
  Google account to drive. The two routes exchange, write cookies onto the
  response and `NextResponse.redirect(next)` in the same order.
- **A failed write keeps the answers and shows a retry** — verified against a
  real failure (the missing table) rather than a simulated one.
- **An existing user's data wins**: signing the claimed account back in carrying
  a completely different session (different name, dob, sex, tags, code) changed
  nothing — not the intake row, not the profile, not even `tos_accepted_at`, and
  `consent_records` stayed at exactly four rows.
- Anonymous `?step=paywall` → **307 to `/onboarding`** before any HTML; signed-in
  `?step=account` → **307 to `?step=paywall`**.
- Back walks cost → free → account → free → cost with answers intact.

### Four cold reviews, 2026-08-08 — SQL, the handoff, auth/routing, the flow

Run adversarially against the running app and the live database before anything
merged. **Not one of the defects below was caught by tsc, eslint or the 732 tests
then passing** — every one lived at a boundary. Same lesson as w2b-13, and worth
repeating on the next spec of this size.

| Sev | Finding | Resolution |
|---|---|---|
| CRITICAL | **A duplicated `?step=` walked past the whole of §Route protection.** `searchParams` hands back `string[]` for a repeated param, `isStepId` tests `typeof === "string"`, so `requested` fell to null and every guard short-circuited — while the client's `URLSearchParams.get` read the first value and rendered it. `?step=paywall&step=paywall` returned 200 with zero cookies. | `requestedStep` takes `[0]`, which is exactly what the client reads. A guard that resolves a different value than the thing it guards is not a guard. |
| HIGH | **The age gate was satisfiable by making an account.** The exemption keyed off `signedIn`, so signing up at `/login` and never visiting `/welcome` rendered the paywall. A regression: on `main` the paywall was anonymous and clamped to `name`. | The clamps take `passedGate` — `is_18_plus AND tos_accepted_at`, server-read. See below for what that forced. |
| HIGH | **A thin `signup_intake` row destroyed the real answers.** The first `carriesAnswers` was an OR, so a laptop where somebody typed a name and stopped squatted the primary key; the phone's full set then read as "already claimed" and was cleared. | An AND over both intent tag sets — `clampIntent`'s own condition, so every legitimate claimer passes by construction. Plus `003` as a CHECK, because the destructive rule must not live only in TypeScript. |
| HIGH | **A transient auth blip was reported as "signed out", and dropped the answers in silence.** `getCurrentUser` discards `getUser`'s error, `no-session` is deliberately not a failure, so nothing retried and nothing appeared on screen. | The claim calls `getUser` itself and branches on the error. `getCurrentUser` is untouched: every other caller is a guard, and a guard that reads an unreachable auth server as "signed in" is far worse. |
| HIGH | **One failed claim stranded the answers forever.** The retry banner was the only recovery, and tapping past it to the end of the flow destroyed it — re-entering `/onboarding` lands on `hook`, an anonymous step, so the claim never fired again. | Two backed-off automatic retries before the banner is shown at all, and the handoff fires on the SESSION rather than the step phase. |
| HIGH | **`history.replaceState` was called during render**, setState-ing Next's Router mid-render — the exact hazard `goNext` documents and was fixed for. Pre-existing on `main`; this branch added a reachable trigger. | `resolveStep` is pure; a `syncUrlToStep` effect owns the address bar. |
| MEDIUM | **A NUL byte or a half-cut emoji made the retry fail forever.** Both pass `normaliseSession` and both are rejected by Postgres (`22P05`, `PGRST102`), so every retry failed identically and the notice never cleared. | `capCharacters` strips C0/C1 controls and cuts by CODE POINT with `Array.from` — which is what `char_length()` counts, so the caps and the CHECKs finally agree about what "24" means. |
| MEDIUM | **The wrong device stamped the 18+ gate.** `passGateFromSession` ran on the `already-claimed` path too, so a stale phone whose answers were discarded a line earlier still set `date_of_birth` and `sex` — and `sex` decides which body the injection-site map draws. | `answersMatch` — only the device whose answers are the ones on the account may stamp. Keeps the retry idempotent, since the same device finds its own answers stored. |
| MEDIUM | **`readNext` accepted `/\evil.com` and tab/LF/CR.** The URL parser folds a backslash to `/` and strips controls, so `/\` IS `//` by the time a browser reads it — a prefix test checks a value nothing will ever use. | Parsed against an unreachable base; only pathname/search/hash survive. Not remotely triggerable today (the `next` is a constant), but the comment claimed a guarantee the code did not provide. |

**The age-gate fix forced the auth return to move.** It cannot land on the paywall
any more: the paywall requires a proven age, the thing that proves it is the
claim, and the claim needs the device's `localStorage` — which the server deciding
the redirect cannot read. So auth returns to `?step=account`, which renders a
waiting state for a signed-in user, and the flow moves them on once the gate is
written. Every claim outcome now has a destination (`onResolved`), because a
spinner with no resolution was the first thing that arrangement produced.

### Kept deliberately

- **A device abandoned AFTER the intent screens still wins the row** over a fuller
  set claimed later. Both are the user's own genuine answers, first-write-wins is
  the rule the spec asked for, and the alternative is an UPDATE grant — which
  would dismantle the structural guarantee that an existing user's data cannot be
  overwritten. The `sex`/`dob` harm is gone with `answersMatch`.
- **No terminal state on a deterministic claim error.** It retries forever. With
  two silent retries first, the case that reaches a user is rare.
- **A tab that loaded before a sign-in elsewhere still shows the sign-in form.**
  `passedGate` is baked into that tab's render; nothing client-side can fix it,
  because nothing asked a server. The next real request corrects it.
- **`install` reads 100% while a screen remains**, and **a reload mid-flow drops
  the in-app back arrow**. Both pre-existing, both outside this spec.
- **The paywall renders six buttons**, one of which is the CTA; the others are
  three plan radios, a disclosure and its Apply. The two-CTA ambiguity the spec
  set out to remove is gone.

### Still open

- **`auth_started` now has no emitter.** It was fired by the paywall under
  `method: "preview"`, reporting a sign-in that had happened on another screen.
  `auth_completed` moved to the handoff, which is the only server-confirmed
  "there is an account" moment. Firing `auth_started` honestly means touching the
  shared auth components, which the spec forbids without asking.
- **`signup_attribution` is still unwritten.** The attribution screen is
  post-paywall and out of this spec. `affiliate_code` is claimed into
  `signup_intake` because it is captured before the account exists and would
  otherwise be lost by anyone who abandons after the paywall.
- **The paywall renders for a signed-in user whose `is_18_plus` is false.** They
  would have had to pass the client age gate to get an account through this flow,
  but the server does not re-check it to render a price list. **Spec w2b-15's
  payment endpoint must verify it server-side** — that is where §3.2's "no
  payment path bypasses the age gate" lands.

## Spec w2b-13 — compound controls (BUILT, 2026-08-07)

All eight steps on `wave3/onboarding-flow`. tsc, eslint, **646 tests**, `next
build` green. **Ten migrations, `023`–`022`, applied by Adrian by hand.**

| Step | What it is |
|---|---|
| 1 | `protocol_compounds.inventory_form` — the form is a FACT, not re-derived from name + route each render |
| 2 | `bulk_powder` as a fourth form; an oral's strength in mg OR iu, and optional |
| 3 | Real fill for tubs and bottles, from the same `remaining_base / total_base` the vial uses |
| 4 | The powder stock form; the sheet opens on the compound's OWN form |
| 5 | Multi-dose days (`slot_index`) + per-slot amounts |
| 6 | Pause — an interval table, invisible to adherence |
| 7 | The detail sheet rebuilt: one filled button, four rows, no `More` |
| 8 | One-off logs — something taken once, off-plan |

### The decisions that are load-bearing

- **`023` REPLACED the unapplied `013_compound_form_override.sql`.** That file
  overrode the container PICTURE; this stores what the picture is derived from,
  so it fixes the picture, the stock form and the depletion maths at once.
- **Slot 0 is UNSUFFIXED** — its store key is the bare compound id and its row id
  seeds with the pre-slot string byte for byte. That is the entire reason Step 5
  needed no backfill. Both halves must agree; changing one orphans every log.
- **A one-off references the CATALOGUE, never a protocol row.** That is what lets
  it appear in history (calendar, block look-back) while counting toward nothing:
  consistency, the runway, stock and the picker all read
  `protocol_compounds`/`dose_logs`, so it is excluded by ABSENCE rather than by
  four filters. Adrian's call over the spec's "references nothing".
- **Per-slot amounts were scope the spec DEFERRED**, added on Adrian's call
  (`supabase/protocol/021`). Do not reinstate the restriction on the strength of
  the spec's Out of Scope paragraph.
- **A pause changes what was DUE; a skip does not.** So a paused day never
  reaches the consistency calculation, and a skipped dose counts as
  due-and-not-taken. A skip is still NOT nagged about — those are different
  questions. (Adrian, 2026-08-07.)
- **The cadence RE-ANCHORS to the resume day** after a pause (Adrian's call,
  overturning the first build). The trade: a pause shifts every future dose date,
  and two pauses drift the calendar further each time.
- **Spec Step 7.7 was REVERTED** — tapping a compound row opens the sheet, it
  does not log. The tick is still the only thing that logs.

### The cold review, 2026-08-07

Four agents ran adversarially over the SQL, the pause/slot logic, the sync layer
and the React before any migration was pasted. **None of the ~25 defects they
found were caught by tsc, eslint or the 633 tests then passing** — every one
lived at a boundary. Worth repeating on the next spec of this size.

The two that mattered most:

- **`018` reproduced the exact shape `009_ownership_hardening` exists to close** —
  a single-column FK plus an unscoped unique index, letting any authenticated
  user squat a victim's pause slot permanently. Now a composite FK.
- **`022` was MISSING and required.** `005` caps `dose_times` at exactly one
  element, so every multi-dose schedule version Step 5 makes possible was being
  rejected `23514` with no retry.

Plus four silent data-loss paths (slot-blind dose-log pull, slot-blind re-push,
hydration replacing the one-off and pause stores wholesale, Skip overwriting a
taken dose). Detail in the commit `3291e6f`.

### Known gap, deliberately left

A user who explicitly states `oral_solid` for a gram-dosed supplement still gets
a TUB. Not fixable in `containerFormFor` — `inventoryTypeForCompound` returns the
same string whether the form was stored or derived — and forcing it would
silently reclassify every off-catalogue supplement. `014` retyped all 13
catalogue powders, so only a deliberate override lands there. Reason is written
into `lib/containers/form.ts`.

## Current state (2026-07-23)

The app is **fully built and live on prod** (`trackdco.app`), in beta. Stack:
Next.js 16 + Supabase (Postgres / RLS / Auth / Storage) on Vercel (`syd1`). Live:
the data model, auth (Google + email/password), the core dose-logging loop,
Protocol (Plan + Stock), Progress (weight / bloodwork / journal / consistency /
photos), Calendar, Weight, injection-site maps, the reconstitution calculator,
push notifications, a billing scaffold, legal/consent, and the PWA install flow.

**Premium-minimal UI restyle — SHIPPED** (PR #59 squash `d501fff`; polish PR #60
`9a8c7aa`). Every in-app screen + sheet and every external surface moved to the
revised `ui-context.md`: borderless cards, small tracked-uppercase eyebrow titles,
light mono metric values, hairline dividers, compound type-icons (`<CategoryIcon>`),
disciplined amber (due/live beats only), and the retired display serif (Playfair +
`--font-display` gone repo-wide; `lucide-react` dropped). Palette unchanged (warm
near-black + gold amber — a cooler sample was trialled and rejected). Non-urgent
follow-ups (amber judgment calls, etc.) are in `next-tasks.md`.

**Wave 2 part two — ALL ELEVEN SPECS BUILT on branch
`wave2/containers-cycles-calendar`** (started 2026-07-29, **not merged, not
deployed**), in the readme's dependency order (build order, not numeric order):
containers, cycles, calendar, stacks, homepage, protocol, calculator, progress,
profile, add-compound, log-a-dose. Part one's global sweep has had its em-dash
pass; its wordiness table and its portrait fallback are waiting on Adrian.
Blocks is new scope on top and is built end to end.

- **01 · Containers** — drawn `Vial` / `Bottle` / `Tub` SVGs + the `Container`
  resolver (`components/containers/`), form and colour resolvers
  (`lib/containers/`). Form-driven, never category-driven, except the
  bottle-vs-tub split among orals, which has no data to key on (Adrian's call:
  the catalogue's `supplement` form picks the tub). Four structural greys had no
  token and were snapped to the nearest existing ones (Adrian's call).
- **06 · Cycles** — an on/off rule ABOVE the schedule, riding on
  `ScheduleVersion` so a mid-cycle edit is the existing "effective from today
  forward" write. Five end conditions; one gate in `isDueOnFor`, which every
  retrospective caller already routes through. Named `CycleRule` in code because
  the `cycles` TABLE is a different concept (the protocol run / "Week 3 of 12").
- **03 · Calendar** — soft cycle fills as continuous bands behind on-days, the
  key below the grid, the cycle in the day sheet. Only repeating on/off cycles
  render; indefinite ones stop at a twelve-month horizon.

- **05 · Stacks** — a display grouping over compounds that stay fully
  independent (see `architecture.md` → Stacks). Protocol → Stacks creates and
  edits; the dashboard renders one expandable row that logs every unlogged member
  in a tap. The dashboard uses a PARTITION so a member can never appear both in
  its stack row and its category section.

- **02 · Homepage** — the dashboard stripped back to what people open it for.
  Week strip with a soft raised block for the selected day (Adrian's call, not
  the spec's amber underline) and the status dot inside the block.

- **04 · Protocol** — one scrolling page, no tabs: Plan, Cycles, Stacks, Stock.
  Leads with the container, hairline affordance cards, auto-named stacks.

- **07 · Calculator** — a presentation rebuild around a **proportional syringe**.
  The arithmetic moved verbatim to `lib/calculator/recon.ts` and is PINNED by
  `recon.test.ts` to 21 input cases captured from the pre-rebuild component, so
  no later refactor can quietly move a figure. Barrel scale and fill are in
  `lib/calculator/syringe.ts`; the same dose fills a fifth of a 0.5 mL barrel and
  a tenth of a 1 mL one, which is the whole point. Gradations labelled every 5 U
  on 0.3 and 0.5 mL, every 10 U on 1 mL (Adrian, 2026-07-30). Layout reworked on
  his review of a phone preview: readout and barrel BARE (no card, not sticky),
  three figures as one divided strip beneath, inputs as a grid with powder and
  BAC water paired. The whole form clears the fold on a 390x844 phone
  in its normal state (Reset ends at ~744px, against ~906px before the rework).
  With a misuse warning showing it does not, which is accepted: that state means
  a figure needs re-checking, and the warning is the thing worth seeing. Powder defaults to mg and dose to mcg, with a
  live conversion under each, because vials are labelled in mg while doses are
  written in mcg and that 1000x slip is the most common error in this space. The
  syringe size opens at 0.5 mL and STICKS once changed; Reset does not clear it.
  `COLUMN_EYEBROW` was added to `ui-presets` + `ui-context.md` because
  "CONCENTRATION" at the 10px eyebrow's tracking overruns a third of a phone.

  A blocking "which syringe?" gate was built and then dropped once Adrian pointed
  out the units figure is identical on every barrel, so the size only moves the
  fill proportion and the over-capacity threshold. Worth remembering: the review
  of that build found the gate had made a refused `localStorage` write brick the
  screen, because the UI read the choice back out of storage instead of holding
  it. Dropping the gate removed the hazard; the rule it produced is in
  `architecture.md` under the localStorage preferences note.

- **09 · Profile** — Settings dissolved in and its route deleted. Physical
  details edit IN PLACE behind an Edit toggle (`PhysicalCard`), Billing and
  Notifications became App rows, and the three destructive actions moved into a
  bounded danger zone. The review of this one found the card could only be saved
  ONCE: `useActionState` holds its last result, so the `success` flag the card
  watched to close itself stayed true forever. The action returns a `savedAt`
  token now. It also found Save and Cancel sitting underneath the FIXED bottom
  nav on a 390-wide phone, where a tap navigated away and discarded the edit.

- **10 · Add compound** — the form became a compound header plus three row
  cards, with errors rendered ON the row rather than in a block at the foot of
  the sheet.

- **11 · Log a dose** — the same header and row language as 10, so the two
  cannot drift: `components/compounds/CompoundHeader.tsx` is shared by both (a
  new shared component, flagged for Adrian). Dose, Draw, Date and Time as rows;
  the body map moved behind a Site row into its own sheet with every prop
  unchanged. Draw is new to this sheet and prices against the vial in use on the
  DOSE'S OWN DAY. The note row spec 11 asks for SHIPPED once Adrian approved it,
  and needed no migration: `dose_logs.note` has existed since v0.4.2 and nothing
  had ever written to it. The date is EDITABLE (Adrian, 2026-07-30) and changing
  it MOVES the dose rather than copying it.

- **Blocks** (new scope, not one of the eighteen) — create sheet, end-date
  prompt (Extend / Close / Leave running), `/blocks` and the retrospective, all
  reading from Postgres via `supabase/blocks/001`. Reviewed twice. The second
  review found that closing a block ERASED a reflection the user had already
  written, and that two of the first round's own fixes had introduced new
  defects: a consistency rule that manufactured missed doses for archived
  compounds, and a client guard driven by the server's UTC date that stopped an
  Australian starting a block dated today.

**All migrations APPLIED:** `supabase/protocol/006` (compound cycles + the
runs-dry fix), `007` (stacks), and `008` (stack_members ownership hardening —
007 shipped an RLS hole where the one-stack index was global across users; 008
makes ownership structural via composite FKs) on 2026-07-29; `009`
(ownership hardening on three sibling constraints) and
`supabase/sites/011_injection_site_enum.sql` (26 new enum values so all 36
catalogue sites survive a Postgres round-trip) on 2026-07-30, plus
`supabase/blocks/001_blocks.sql`.

**010, 011 and 012 APPLIED (Adrian, 2026-07-30/31). Nothing pending.**
`010_inventory_days_to_empty` (a timezone-free runway), `011_dose_logs_logged_for`
(the day a dose belongs to, stored rather than re-derived) and
`012_logged_for_undo_backfill`.

**012 exists because 011 shipped a wrong backfill, and it reached prod.** 011
filled `logged_for` with the UTC date of `taken_at` on the claim that this
reproduced what the app already showed; it does not, because `toDateKey` uses the
DEVICE's local date. For any dose whose local and UTC days differ — in Sydney
everything logged before 10am — it wrote a day the app had never shown, and since
hydration prefers `logged_for` while the device mirror keeps the original local
day, the same dose rendered on two days and the ghost could not be deleted. 012
nulls the column. **The rule that came out of it: `logged_for` is written by the
device at log time and by nothing else, ever. A backfill cannot know a past
dose's timezone, which is the entire reason the column exists.**

The containers review page (`app/preview/containers/`) was reviewed. It was
recorded here as deleted; it is not — the branch ADDS it, and it is still on
disk. Corrected 2026-07-31 by the pre-merge review. It is dev-only and safe
(gated by `VERCEL_ENV`, the only preview page gated that way rather than by
`NODE_ENV`, so it is also the only one visible on a Vercel preview deploy).
Spec 01's checklist item is therefore still outstanding, not done.

**Deferred: cycle end condition 3, "ends when the vial runs out."** The rule is
implemented and tested, but nothing derives the day a vial actually ran dry from
dose logs, so it is withheld behind `VIAL_END_SUPPORTED = false` rather than
shipped as a control that does nothing. Wiring it means threading a Postgres read
into `isDueOnFor`, which is pure and synchronous and called by the week strip,
calendar, consistency and Next Dose — its own pass. Spec 06 asks for five
conditions; four are live.

**An independent review agent (never the author) has been run on every spec in
this wave, and has found real defects on every single one** — including a live
security hole, stacks being write-only to Postgres, custom compounds silently
dropped from stacks on every hydration, one-tap logging stamping the scheduled
time rather than the actual one, and on spec 07 a `prefers-reduced-motion`
opt-out that could never fire because an inline `transition` outranked the
utility class meant to disable it. All fixed. The recurring lesson is that the
author's own claim that something works is not evidence: the reviews that caught
the most were the ones that measured the running page instead of reading it.

**Two bugs found and fixed in already-merged code**, both the same class — a
field silently dropped in a round-trip, causing a deliberate break to read back
as missed doses: `normalizeHistory` was discarding spec 02's `stopped` flag on
every localStorage read, and `scheduleVersionToRow`/`pullScheduleVersions` never
carried a version's cycle to or from Postgres.

## Shipped feature ledger

One line each; full detail in git + `Context/Feature Specs/`.

- **Foundation** — schema v0.4.2 (16 tables / 2 views, RLS everywhere), seed
  catalogues (compounds / biomarkers / markers / ranges), 18+/ToS gate, PWA shell +
  splash, legal docs in-DB, custom domain, Vercel `syd1`.
- **Auth** — Google OAuth + email/password + password reset; Resend custom SMTP.
- **Core loop** — home dashboard, add-to-stack, dose logging, per-compound
  injection-site rotation, back-dating (log/start on a past day).
- **Protocol** — `cycles → protocol_compounds → dose_logs` (Postgres canonical),
  Plan + Stock views, inventory maths from `v_inventory_math`, part-used vials,
  custom "make your own" compounds with vials.
- **Progress** — weight (hero + `/weight`), bloodwork photo store, journal + custom
  markers/scales, consistency graph, progress photos.
- **Spec 19** — injection-site rework: anatomical IM + Sub-Q region maps,
  mirror-front convention, sex-aware bodies (male + female), amber recency ramp.
- **Spec 20** — quick-actions FAB + Calculator nav slot.
- **Spec 21** — per-dose draw on the today's-log row (`50u (0.5 mL)`).
- **Spec 22** — per-dose hint, custom markers, compound soft-delete, journal photo
  attachments (migrations applied by hand + verified live on prod).
- **Specs 15 / 16 / 17** — cycle-id stamping (the moat), `profiles.tier` lock,
  Supabase advisor hardening.
- **Spec 14** — push notifications (transport + reminder scheduler, opened beyond
  founders; per-user timezone; `reminder-runner` cron `*/15`).
- **Spec 13** — perf + security hardening pass.
- **Other** — waitlist + founder dashboard, desktop interstitial (phone-only gate),
  beta feedback, archive/reactivation, splash animation, install prompts.

### Wave 2 · part one — SPECS 01–07 BUILT AND MERGED TO MAIN (2026-07-29)

Merged straight to `main` (Adrian's call) rather than held behind the PR: the app
is in beta with few users, everything verified green (`tsc`, lint, 68 tests,
production build, a structured self-review and a security pass), and merging was
the only way to device-test — the Vercel preview link wasn't reachable for him.

**Still outstanding after the merge:**
- **Device testing.** Nothing on this branch has been used on a real phone. The
  riskiest is pinch-zoom in the photo adjust step (Spec 05 step 9) and rotation
  (Spec 07 step 7).
- ~~Two migrations remain unapplied~~ — **ALL THREE APPLIED by Adrian, 2026-07-29**:
  `supabase/legal/011` (support@ address), `supabase/markers/001` (marker rename),
  and `supabase/protocol/005` (schedule versions + the `stopped` column). Wave 2
  part one has no outstanding schema work.
- ~~The re-add consistency decision~~ — **RESOLVED and shipped 2026-07-29**: the
  delete gap is now recorded rather than inferred (see the entry below).
- **Spec 06's blocked paths** were verified by reading code and RLS policies, not
  by executing them as a non-founder.

- **Spec 01 · Dose & Schedule Integrity — all 8 steps built; migration applied.**
  Ghost compound root-caused and fixed (Postgres id ⇄ client id divergence made
  archive/delete silently no-op, and a zero-row PostgREST write reports success —
  see `architecture.md` → Dose & Schedule Integrity); hydration now waits for
  in-flight deletes; the quick-actions FAB writes to the selected day instead of
  today; ~~the dose time no longer pre-fills and is REQUIRED at both entry
  points~~ — **SUPERSEDED 2026-07-29, see the pre-fill entry below; the current
  contract is: pre-filled, optional**; an unset time is still displayable as "Not
  set" and stored as `dose_times = ARRAY[NULL]`. Next Dose reads the real stack
  instead of the empty `seedStack` fixture; logged doses keep their own unit and
  time so an alteration can't restate history. **Vitest added** (`npm test`,
  `lib/home/doseIntegrity.test.ts`) — the repo had no test framework at all
  before this.
- **Spec 01 · step 5 — schedule versioning BUILT (uncommitted, migration pending).**
  A schedule is now a series of effective-from versions rather than one mutable
  row, so "what was due on 12 June" resolves against the rule in force *then*.
  `resolveScheduleOn` / `isDueOnFor` (`lib/home/stack.ts`) replace every past-date
  `isDueOn` call — week strip, calendar, consistency, Next Dose. Editing a compound
  seeds a baseline version from the OUTGOING values, so days before the edit keep
  the old rule and nothing is back-filled. `supabase/protocol/005_protocol_compound_schedules.sql`
  is written but NOT applied; every sync call tolerates `42P01` and degrades to the
  device store, so the branch runs correctly either way. Forward-looking UI
  (`upcomingDoseDates`) still reads the current rule, which is correct.
- **Calendar can log a past day.** `DayDetailSheet` lists compounds due-but-unlogged
  on the selected day and opens the dashboard's `LogDoseSheet` against that date —
  the last unbuilt half of step 4. The calendar also publishes its selected day via
  `selectedDay.ts`, so the FAB writes there too.
- **Spec 02 · Compound Lifecycle — all 7 steps built.** Three states collapsed to
  two: active or deleted, one verb (Delete), no Archive page and no permanent erase
  anywhere. A deleted compound now shows the standard plus at full opacity in the
  picker and re-adds through the normal add flow, writing back to the SAME record id
  (`reuseId`) so its logged history stays attached; the re-add versions the schedule
  from its new start date so the pre-deletion run keeps the rule it was run under.
  The delete confirm moved from amber to the `--accent-destructive` Sign-out
  treatment, with Adrian's approved copy. Deleted outright (not just unwired):
  `/archive` + `ArchiveManager`, the Profile row, every Reactivate control, the
  `reactivate` mode, `removeFromStack` / `removeCompoundLogs` /
  `deleteProtocolCompound{,ForStack}` / `deleteStackCompound` / `deleteCompoundLogs`,
  and the `/preview/archive-weight` + `/preview/profile` harnesses. Storage unchanged
  — "deleted" is the existing `archived` / `is_active=false` flag, so no migration
  and no user data touched. See `architecture.md` → Compound Lifecycle.
  - **Adrian's calls (2026-07-29):** the deleted-period gap is left open rather than
    recorded as a "stopped" schedule version (no change to what deletion writes);
    confirm copy = "It stops being dosed from here on, every logged dose is kept, and
    you can add it back from search any time."
- **Spec 03 · Add Compound Flow — all 7 steps built.** Picker is now "Add compound"
  (form still "Add to log"); structure is search → Recently used (cap 5) → Your
  compounds → Browse by category (all 8 existing categories, collapsible) → Make
  your own, with "Popular in comp prep" gone. Stock on the add form is gated to
  VIALS by inventory form (`reconstituted`/`preconcentrated`), never by category —
  tabs/caps stock is untouched in Protocol → Stock. Two new device-local stores:
  `lib/home/recentCompounds.ts` and `lib/home/unitPrefs.ts` (per-compound unit
  override memory). See `architecture.md` → Add Compound Flow.
  - **Adrian's calls (2026-07-29):** rename user-facing "stack" strings only (4 of
    them), leave every internal identifier and the `user_stack_compounds` table;
    Recently used = 5; browse by all 8 existing categories, not the spec's 4;
    **make no catalogue unit changes yet** (the per-compound `default_unit` data is
    already differentiated — forcing every peptide to mcg would render Tirzepatide
    as 2400 mcg), so only the override memory shipped.
- **Spec 04 · Sex-Specific Markers — all 6 steps built.** The picker offers shared
  markers + the profile's own sex; five sex-specific markers are silently absent for
  the other sex (Adrian: no labelling of which markers belong to whom). Sex is read
  raw from `profiles.sex` — no sex set ⇒ shared only, never a male guess. Filtering
  is done with `addable: false` rather than omission, because the dialer resolves an
  entry's existing readings from the same list it offers from; dropping the option
  would blank a logged reading after a sex change. History is filtered nowhere.
  "Cycle Changes" → **"Menstrual Changes"** (Adrian's pick) needs no data migration —
  readings reference markers by id. 9 new tests. See `architecture.md` →
  Sex-Specific Markers.
  - **Needs Adrian to run:** `supabase/markers/001_rename_cycle_changes.sql` (one
    UPDATE, idempotent). Until then the marker still reads "Cycle Changes" in the
    app; the applicability map covers both names so filtering is right either way.
- **Spec 05 · Photo Adjust — built across all five photo surfaces.** One shared
  `PhotoAdjustSheet` + pure `lib/media/framing.ts` (22 tests): pinch/drag inside a
  fixed frame, zoom clamped so letterboxing is unreachable, faint rule-of-thirds
  guides, adjusted-only storage with the original kept in memory for in-session
  re-framing. See `architecture.md` → Photo Adjust.
  - **Adrian's calls (2026-07-29):** apply it to bloodwork and journal photos too
    (I flagged that a fixed frame can crop information off a lab report); faint
    rule-of-thirds grid; adjusted-only storage; shared component approved.
  - **Not yet done:** step 9, device testing on iOS Safari + Android Chrome. Pinch
    inside an installed PWA is the likeliest place this breaks and it cannot be
    verified from here.
- **Spec 06 · Admin Page — all 9 steps built.** `/admin` is now an operational
  dashboard (Users → Signups over time + by-channel → Usage → Feedback → Emails),
  renamed from "Waitlist". **The access audit came back clean:** the founder gate
  was already enforced server-side in a Server Component before any query runs,
  with RLS as an independent second layer on both `waitlist` and `beta_feedback` —
  no fix was needed. Cross-user aggregates run as the service role in
  `lib/db/adminMetrics.ts`, which is aggregate-only by construction and re-checks
  the caller. See `architecture.md` → Admin Dashboard.
  - **Adrian's calls (2026-07-29):** active = "wrote something" (dose/weight/
    journal/photo/compound), stated on the page; signups range 30D/90D/All.
  - **Flagged:** the distinct-user counts de-duplicate in TS (PostgREST can't do
    `count(distinct)`) — fine at beta size, wants a SQL view past ~10k writes/week.
    The founder email list is duplicated in `lib/admin.ts` and both SQL policies.
- **Contact email — `legal@trackdco.app` → `support@trackdco.app`** (Adrian,
  2026-07-29; the legal@ mailbox is gone). The account-deletion request in
  `components/auth/delete-account-request.tsx` is updated. The LIVE legal documents
  are text rows in Postgres, so they need
  `supabase/legal/011_support_email.sql` — a targeted `replace()` on the current
  rows only, no version bump (the substance is unchanged; bumping would make every
  existing `consent_records` row read as consent to a superseded version).
  Superseded v1.0/v0.x rows keep the old address as the historical record; they are
  never rendered.
- **Dose-time pre-fill RESTORED (Adrian, 2026-07-29) — reverses Spec 01 step 6.**
  The log form live-tracks the clock on today and falls back to the compound's
  scheduled time when back-dating; the add form live-tracks the clock; a time is no
  longer required to save. An unset time is still a valid, displayable state
  ("Not set"), so only the pre-fill and the required-field guard came back. Spec
  01's checklist items "time field does not pre-fill" are therefore deliberately
  no longer true.

## Pre-merge review + fixes (2026-07-31)

Three parallel review passes over the whole branch (the merge diff as one change;
data integrity + security; a cold start), then the fixes. **Two CRITICALS, both
data defects invisible to any per-spec review, both fixed and pinned by tests.**

- **Push notifications never learned about cycles.** `lib/notifications/` is the
  server-side mirror of "what's due today" and the branch changed ONE line of it
  (a `revalidatePath`), so no spec review ever opened it. Off-cycle days were
  announced and then nagged about while the app itself correctly showed nothing.
  Fixed by reusing the client's own `isOnCycle` rather than a second copy of the
  maths, plus the seven `cycle_*` columns in the runner's select
  (`PC_REMINDER_SELECT`, with a test asserting it covers `CYCLE_COLUMNS` — a
  missing column does not throw, it silently stops the gate gating). The same
  blind spot had left low-stock alerts on the timezone-broken `est_empty_date`
  subtraction that `supabase/protocol/010` exists to replace.
- **A device timezone change duplicated every dose and rewrote `taken_at`.** After
  012 nulled `logged_for`, every historical row fell back to re-deriving its day
  from the CURRENT device timezone; the row id is built from the day, so a
  re-derived day minted a SECOND row, double-decremented the vial, and stored the
  guess permanently. **The fix recovers the day from the row's own id** rather
  than guessing: the id is a hash of the day it was written under, so a candidate
  either reproduces it or does not, and no timezone shifts a calendar day by more
  than one (`recoverLoggedDay`, `lib/home/doseLogIds.ts`). `repushDoseLogs` also
  no longer writes `logged_for` at all — a replay cannot tell a recorded day from
  a derived one, which is exactly what 012 forbids.

Also fixed: a fabricated `+0.0 kg` "trend" on a single weight reading in three
places (`photosAcross` already refused the same shape; `weightAcross` did not);
Progress headlining a bare `0 %` for a dose whose time had not come; a compound
with a future start date being invisible everywhere but one Protocol card; three
writes reporting success on a zero-row update (`extendBlock`, `updatePhysical`,
`startBlock`'s compensating restore); stack members silently dropped from
Postgres then deleted locally (fixed centrally in `commit`, so a future caller
cannot forget the names again); a cycle ending in 2027 reading as "5 Aug"; and
`lib/db/resetProtocol.ts` deleted — a caller-less `"use server"` module that
could still wipe five tables.

**`supabase/blocks/001_blocks.sql` shipped with no `GRANT`**, which would have
made Blocks return `42501` on every read and write the moment it merged. Applied
by hand and written into the migration. `012` is now marked SPENT with its
destructive `UPDATE` commented out: it was safe only while no app code wrote the
column, and that code is now deployed.

Adrian's changes on top: continuous cycles can no longer be given "No end" (it
was measurably identical to having no cycle); the calendar's cycle bars moved to
sit directly under the day disc; the calculator's syringe pins while the keyboard
is up, fading in; the injection-site body map went back INLINE in the log sheet,
reversing spec 11's move of it behind a "Site" row; and the beta feedback row
left the quick-actions menu.

## Authenticated cold-start walkthrough (2026-07-31)

A throwaway account was driven through the whole app against the PRODUCTION
Supabase, in Chrome, at 360/390/430, capturing `console` + `pageerror` on every
step. **The four never-executed code paths all work**, so nothing here blocks the
merge. What the walkthrough established, all MEASURED:

- **Blocks is alive.** The hand-applied `GRANT` holds: start, list, retrospective,
  extend (5 Aug → 30 Sep), reflection, and close all reach Postgres with no
  `42501`. Closing PRE-FILLS the existing reflection and keeps it.
- **`startBlock`'s compensating restore genuinely restores.** Forced a real
  insert failure (a 61-character name against the 60-character CHECK, which the
  form caps but the server action does not) while a block was live: the live
  block came back `status=active, closed_on=null`, and the sheet reported the
  plain "Could not start the block." rather than the may-have-ended wording.
- **`updatePhysical` saves, and saves REPEATEDLY** — three consecutive edits in
  one session each closed the card, which is the `savedAt` token doing its job.
  An out-of-range height never reaches the action: `min`/`max` on the input make
  the browser refuse the submit with its own message.
- **Stack membership survives every operation.** Create, remove a member, re-add,
  and delete the stack: `stack_members` tracks each one (positions renumber), and
  deleting a stack leaves both `protocol_compounds` and the cycle untouched. A
  full `localStorage` wipe rehydrates the stack from Postgres alone.

The two CRITICALs were re-tested against real rows rather than re-read:

- **`recoverLoggedDay` holds.** With `logged_for` nulled (the state 012 left every
  production row in) and the device store wiped, loading under
  `America/Los_Angeles` — where the device's own day is 30 Jul — put the doses
  back on **31 Jul**, minted no second row, and left `taken_at` alone.
  `repushDoseLogs` left `logged_for` null, as 012 requires.
- **Coverage is total.** Across ALL 288 `dose_logs` rows (15 users), 288 are
  recoverable from the row id and 0 are not, so there is no legacy-id population
  taking the `toDateKey(taken_at)` fallback. 41 of those rows have a recovered
  day that differs from their UTC day: those are the rows that would have
  re-bucketed and duplicated.
- **The reminder cycle gate gates.** Driving `isDueToday` through the runner's own
  `PC_REMINDER_SELECT` against live rows: an off-cycle compound is not due, an
  uncycled one is, and an on-cycle AND scheduled day is due again — so the gate
  is not merely always-false. `v_inventory_math.days_to_empty` is present in prod.

Also confirmed working: editing a dose's date MOVES it (old row gone, new row
under the new day's id, note and injection site carried, no duplicate); the
`delt_left` enum round-trip; a first weight reads "First reading" with no
fabricated delta; first journal entry, first vial and first photo all persist;
and the calculator's arithmetic is exact (5 mg / 2 mL / 250 mcg → 2.5 mg/mL,
0.1 mL, 10 U) with the mg⇄mcg conversion hints live under both fields.

**Two defects found and fixed**, both dev-only, neither user-facing in
production:

- **The photo adjust step could never preview a photo in `next dev`.** The object
  URL was created in a lazy `useState` initialiser and revoked in an effect
  cleanup; state outlives a cleanup, so React StrictMode's mount → unmount →
  remount handed the component back a URL it had already revoked. Every photo, on
  all five surfaces, fell to "This photo can't be previewed on this device". A
  `useMemo` was measured and behaves identically. Creating the URL IN the effect
  is the only arrangement that survives the remount. **This is the likely reason
  spec 05's device testing never happened.**
- **A React `key` warning on every dashboard load**, from `notificationsBanner`
  crossing the RSC boundary and arriving unvalidated. Keyed at the creation site,
  because wrapping it in an element would open a `space-y-5` gap when the banner
  renders null.

**Three follow-ups then fixed on Adrian's call**, each verified by execution on a
second throwaway account:

- **Blocks ignored `units_preference` and showed kg to everyone.** The
  retrospective, the live block card, the Progress banner's target line and the
  create sheet all hard-coded it, and `app/(app)/blocks/page.tsx` never read the
  column — so an imperial user saw "186.4 lbs" on Progress and "84.5 kg" on the
  retrospective for the SAME weigh-in. Fixed as one piece, display and the typed
  target together, because converting only the display leaves a lbs reading
  measured against a kg target. **The write path had a second defect the display
  hid:** the direction inference compared the typed number against a kg
  weigh-in, so "lose to 180 lbs" from 186.4 lbs stored `direction: "up"`.
  Storage stays kg throughout (a 180 lbs target stored 81.6466266). Pinned by
  four tests; a fraction is unitless, so the percentage reads identically in both.
- **Progress and Blocks read a device store nothing filled.**
  `useCloudHydration` ran on Home and Protocol only, so a cold entry to a
  retrospective stated a measured "0%" consistency for a block with doses in it.
  Blocks calls the hook directly; Progress's shell is a Server Component and gets
  `components/home/CloudHydration.tsx`, a mount point that renders nothing. The
  hook is idempotent, so this costs one reconciliation on entry.
- **The empty Progress weight card offered no control**, so the state that most
  needs a way in was the only one without one.

## Wave 3 cold review + the onboarding flow (2026-07-31, evening)

**Branches: `wave3/fixes` (off `wave3/progress-blocks-polish`) and
`wave3/onboarding-flow` (off `main`). Both PUSHED, NEITHER MERGED. `main` is
untouched and still deploys prod.** Adrian's call: hold everything for preview.

### The review found two HIGH defects the author's own pass could not

Three agents attacked `097b424..50d150c` cold. Both survivors were introduced by
the branch's own fixes, and both are now fixed and pinned:

- **The block retrospective stopped reporting what you ran.** `a90815a` gave
  `compoundsRunningOn` a third `logs` argument defaulting to `{}`;
  `retrospective.ts` was never updated, and an omitted optional argument is not
  a type error. With `logs = {}` every compound fails the first-dose bound on
  every day, so "what you ran" silently became "what you logged inside the
  window". `logs` is now REQUIRED, which turns the whole class into a compile
  error. **410/410 tests were green throughout** — all six existing cases logged
  a dose inside the window, so one was passing vacuously.
- **The journal date field kept the `|| todayKey` coercion `ed3eed5` removed
  from four others, and it is the only one with side effects**: an empty change
  event (which an iOS wheel picker fires mid-pick) deleted photos already
  uploaded in that session from the `journal` bucket and overwrote the note
  being typed.

Also fixed: the Scale sparkline had been given the trend treatment so it changed
weight when you tapped through to `/weight`; the cycle switch was the exception
to a rule that says "no exceptions"; "Delete block" hand-rolled `DANGER_ROW` and
lost its focus ring and destructive hover; a failed progress photo was left as a
permanently empty box; three of five category groupings had no name tiebreak, so
unknown categories ordered differently per screen; five comments described the
opposite of their code.

**Confirmed clean by measurement** (worth not re-reviewing): `deleteBlock`'s RLS,
its real FK cascade on `block_targets`, and its zero-row check; the bulk-log
being structurally unable to bulk-unlog; `spark.ts`'s monotone maths (0.0000
overshoot across 13 shapes, 201 samples per segment); and the Running list's
pre-hydration behaviour, which omits the section rather than showing a wrong one.

### Two things Adrian hit on his own phone

- **"Discard this vial" was clipped by the screen edge.** `StockActionsSheet`
  ended in a flat `pb-2` with no safe-area inset, so its last control sat under
  the home indicator.
- **Vitamin C and D3 were drawn as tubs of powder.** Every `supplement` got a
  tub, because category was the only signal and category cannot tell creatine
  from cholecalciferol. **The resolver now reads the catalogue's DOSE UNIT**: a
  supplement priced in grams is scooped (9 of 84), one priced in mg/mcg/iu/
  capsules is counted out. No migration, no new column. An unidentifiable custom
  supplement keeps the tub so nothing already added changes shape.
  `containerFormFor` takes a `name`, threaded through all 12 real `<Container>`
  call sites. **The per-user form override Adrian approved is NOT built** — see
  `next-tasks.md`, it needs a migration only he can apply.

### Onboarding (Spec 3-01) is built, on its own branch

Sixteen screens at **`/onboarding`**, public and anonymous, outside `app/(app)/`
because that group's layout is the auth guard and the whole pre-paywall half has
to run with no session. State lives on the device (`lib/onboarding/session.ts`);
nothing is written to Postgres while anonymous.

- **The age gate is load-bearing**: `canLeaveHousekeeping` is the only thing that
  opens the button, and DOB is compared by CALENDAR COMPONENTS — parsing an ISO
  date string as a `Date` reads it as UTC and moves every Australian user's
  birthday by a day.
- **The demo is throwaway.** Measured: after a full walk the only localStorage
  key is `trackd.onboarding.v1`; nothing touches `trackd.stack.v2.*` or
  `trackd.doselog.v1.*`.
- **Auth and payment are deliberately stubbed.** There is no RevenueCat
  integration on this project, and creating live billing objects from a preview
  branch is not an unattended decision. `startTrial()` is the single seam; the
  real Google button sits beside it and the screen says which is which.
- **The spec's own §11 token table was NOT followed** (`#060607`, `#F3A63C`,
  Playfair, Caveat, Lucide). It contradicts `ui-context.md`, which the same spec
  names as binding. Built to `ui-context.md`; the conflict is Adrian's to
  resolve. `FLOW_TITLE` / `FLOW_SUB` were added to `ui-presets.ts` and
  documented before use, per the rule that a pattern goes in the doc first.

Verified in Chrome at 360/390/430 across all sixteen screens: no console errors,
no page errors, no horizontal overflow. Gates: tsc clean, eslint clean, **458
tests** on the onboarding branch and **421** on the fixes branch, `next build`
green on both.

## Onboarding, second and third passes (2026-08-01)

Branch `wave3/onboarding-flow`, pushed, NOT merged. `main` carries the wave3
review fixes and the calculator unpin and is otherwise untouched.

**The flow is fourteen steps and the demo is one of them.** It used to be four
routes; walking between pages broke the illusion the demo exists to create, so
logging a dose now ticks the card, recedes it and floats the stock card in
underneath on the same surface. Three beats with a deliberate hold, because
rushing it read as a page swap rather than a consequence.

**The surface treatment is the thing Adrian reacted to most.** `.flow-canvas`
lights the top of the page, `.flow-card` gives every card a 5%-white top edge
and a soft shadow, and screens slide in directionally. All token-derived via
`color-mix`. Documented in `ui-context.md` and scoped to `/onboarding`; the
app-wide roll-out is a separate spec (see `next-tasks.md`).

**The paywall is a carousel of the real app.** Four actual captures of
`/preview/home|protocol|recon|progress` inside one phone that never moves,
cross-fading on a 1.1s eased fade, with four labels orbiting each and a caption
above. The capture script strips the name from the greeting, because the
screenshot is shown to strangers.

**Kyle is in**, thumbs-up on celebrate and flexing on welcome, feathered rather
than matted.

**Three `ui-context.md` amendments, all Adrian's call:** a selected onboarding
chip may be amber (third sanctioned many-amber surface, same argument as the
switch rule); exclamation marks are allowed in exactly two onboarding strings
and nowhere in the app; and the surface treatment is written down.

Gates on the branch: tsc clean, eslint clean, **487 tests**, build green.
Driven at 360/390/430 across every step: no console errors, no page errors, no
horizontal overflow, and the demo still leaves nothing behind but
`trackd.onboarding.v1`.

Two bugs found by measuring rather than looking: the directional entrance
created a real 408px horizontal scroll area on a 390 phone for the length of
the animation (clipped), and "5 days on us" rendered as "5days" because JSX
drops whitespace between an expression and text across a line break.

## Onboarding review pass 2 (2026-08-01) — Adrian's screen-by-screen notes

He walked the flow and dictated changes for almost every screen. All built,
all verified by execution at 360 / 390 / 430 (no console errors, no page
errors, no horizontal overflow). tsc / eslint / **496 tests** / `next build`
green.

- **The hook names no compound at all now.** Genericised on his instruction. The
  screen loses nothing, because its argument was never the substances: it is
  "you do not know how much is left, and you are not sure when you last did it".
  Every Notes-app line is about UNCERTAINTY and the Trackd rows use the demo's
  own generic labels. **Note the reasoning, because the age gate is not the
  operative line** — see Open Questions.
- **Two floating cards** off the phone's corners, on the side each describes:
  Trackd top-right with three ticks, Notes app bottom-left with three crosses.
  The in-panel eyebrows they duplicate were removed.
- **The progress rail is centred**, 144x6 (was 64x3, railed right). Absolutely
  positioned so the back arrow's presence cannot shift it between screens.
- **"What's the plan?" is back to "What are you running?"** — his call,
  reversing his own earlier one. "What's the plan" reads as though the app is
  about to give you one.
- **"Converting a dose into syringe units" is gone** from the struggle list, and
  its tag is removed from `StruggleTag` (a stored session carrying it is dropped
  on read, so no migration).
- **The celebrate answers name features rather than feelings** ("Full stock
  tracking, counted for you", not "What's left, without counting"), and the list
  **always ends on "And plenty more."**, muted and unticked. "Something else" now
  carries no line of its own, because it names no feature.
- **The demo's day-count chips moved OUTSIDE the body** into the gutters, with a
  hairline reaching back, and say only the day count. The seeded history moved
  to 2 / 4 / 6 days: the old 9 and 11 sat outside the 7-day IM decay window, so
  `siteHeat` returned zero and one chip pointed at a completely invisible region
  on the screen whose whole claim is "see which sites have rested".
- **Tapping a site now carries the stage on by itself**, like the vial running
  dry does on the stage before. His note was that with a body map filling the
  screen he would not have known when to press Next. The back handler cancels
  the pending timer, or stepping back would be dragged forward again.
- **The look-back's cards are the app's cards**: Running uses
  `PhotoRunningList`'s row treatment (container, name, right-railed mono),
  Weight has a WORKING Trend/Scale toggle with the real crossfade, and Schedule
  adopts `ScheduleGrid`'s day initials and mark treatment.
- **Payoff and cost headlines carry one emphasised span** ("the more you see",
  "the cheap part") in Medium italic — a new, documented, headline-only
  treatment. Cost copy is his wording; the tall bar climbs over 2.6s with money
  falling off it as it goes, and the Trackd bar sheds exactly two AMBER dollars.
- **The paywall gained three ticks** and the caption/dots got the space he
  asked for. That pushed the trial CTA **21px below the fold at all three
  widths**, measured, so the hero ring came down from 15rem to 13.5rem. This
  screen's budget is fixed: anything added below the ring comes out of the ring.
- **The Android install path now falls back to instructions** when the OS dialog
  does not end in an install, instead of leaving the user on a button that
  already did nothing. `install_prompt_failed` is its own event.
- **Attribution**: "A mate" is "A friend", the catch-all is "Someone else" and
  unfolds a typed field. ~~`supabase/onboarding/001` is written and NOT applied.~~
  **It IS applied — verified live 2026-08-07** against the Data API. It was
  applied by hand and neither this line nor the file's own header was updated.

**The two tricep regions are fixed, and the fix reaches the real site picker.**
Measured rather than guessed: swept all 42 regions across both bodies and both
views, found exactly two unreachable at their visual centre (the triceps, both
sexes), and fixed them with a scoped transparent stroke. The first attempt used
a blanket halo and **broke four regions to fix two** — the quad-front region
swallowed the narrow quad-out and ventroglute centres beside it. Now 42/42
reachable. See `architecture.md` → Injection Sites.

**Safari's URL bar was overlapping the CTA** (his report). The flow was sized in
`dvh`, which tracks the CURRENT chrome state and therefore moves the footer as
the bar collapses and returns. It is now `svh` (the smallest viewport, i.e. bar
showing) via one `.flow-viewport` rule, with a `100vh` fallback and
`overscroll-behavior-y: contain`. **Reasoned and applied, NOT verified on a real
iPhone** — desktop Chrome cannot reproduce the toolbar behaviour.

## Repo cleanup (2026-08-07)

A full sweep of the working tree. Gates after: `tsc` clean, `eslint` clean,
**526 tests pass**. `next build` NOT re-run — a dev server was up, and this
project's rule is never to build against a live `next dev` (they share `.next`).
Every deletion was a file with **zero importers**, so build risk is nil.

- **Four orphaned components deleted** (552 lines): `components/ui/card.tsx`,
  `ui/dialog.tsx`, `ui/tabs.tsx` (shadcn scaffolding the app never adopted — it
  uses its own `ui-context.md` surfaces) and `components/pwa/install-prompt.tsx`
  (superseded by `InstallHomeScreenPopup` + `usePwaInstall`). All four were
  verified unreferenced by symbol, not just by filename.
- **100 `condensed_GLBX-*.csv` untracked** (7.0 MB). They were committed BEFORE
  the `.gitignore` rule was added, and gitignore does not untrack — so the rule
  had been silently doing nothing. **They are a friend's trading-bot data, not
  Trackd's**, and were MOVED, not deleted, to
  `~/Documents/GitHub/glbx-trading-data/`. They also remain in this repo's git
  history at the pre-cleanup commits.
- **Junk removed:** `.next 2/` (an empty iCloud-duplicated build dir),
  `public/images/` (held nothing but a `.DS_Store`), and 9 stray `.DS_Store`s.
- **`scripts/gen-female-body-art.py` had a broken path** — it read
  `Context/Feature Specs/body-svg/female`, missing the `svgs/` segment, so it
  would have failed the moment Angus redrew the female artwork. Fixed and the
  path verified to resolve. This is the only behavioural fix in the sweep.

**`Context/Feature Specs/` flattened to ONE folder (2026-08-07).** `Wave 1 - Beta/`,
`wave 2 - refinement/part one|two/` and `proposals/` are gone; 43 specs now sit at
the root with `00-INDEX.md` over them. **The flattening REPAIRED references rather
than breaking them** — ~15 SQL migrations and source comments already cited flat
paths (`Context/Feature Specs/08-Home-page-fixes-v1.md`, `.../15`, `.../16`,
`.../17`), because the specs were flat first and the wave folders came later and
silently orphaned every one. Wave 1 keeps its bare numbers for exactly that
reason; Wave 2 takes `w2a-`/`w2b-` because both waves number from 01. Four
malformed filenames fixed on the way through (a trailing space, two missing
`.md`, one `md` missing its dot), and `18-SPEC_INDEX.md` became
`18-build-order-snapshot-2026-07-02.md` — it was never an index, it is a stale
July plan on its own conflicting numbering where "02" means the file numbered 15.
`svgs/` is NOT archive: `scripts/gen-female-body-art.py` reads `svgs/body-svg/female/`.

**Schema verified against prod, not against these docs (2026-08-07).** Probed the
live Data API read-only with the service key, one request per migration. **Every
migration on disk is applied except `protocol/013`, which was never written.**
Two doc corrections came out of it:

> **⚠️ SUPERSEDED 2026-08-14 — `protocol/013` IS applied.** Re-probed with the
> same read-only method: `stacks?select=effective_from`,
> `stack_members?select=effective_from,effective_to,id` — all 200. It was
> applied at some point after 2026-08-07 and nobody updated this line, which is
> the third time this exact rot has happened in this file. The check below takes
> ten seconds; **run it rather than reading either claim.**
>
> The same sweep found **one genuinely unapplied migration**:
> `billing/002_trial_start_lease.sql` (`billing_customers.trial_lock_until`
> returned 400). **Adrian applied it the same day and it is verified** — the
> column now returns 200 and zero rows hold a lease, which is the correct
> backfill to `'-infinity'`. `startTrial` therefore has its real per-user lease
> the moment `wave3/billing-cancel` deploys, and the Stripe re-list
> reconciliation stops being the only thing closing the double-trial race.
>
> **Every migration on disk is now applied**, with one unverifiable from here:
> `protocol/024_review_repairs.sql`, whose checks are `pg_constraint` /
> `pg_indexes` queries the Data API does not expose. It has been on `main` since
> 2026-08-07 and is idempotent, so re-pasting it is free if anyone wants
> certainty.

- **`onboarding/001` (signup attribution) IS applied.** Both this file and the
  migration's own header said otherwise. Hand-applied migrations never appear in
  `list_migrations`, so a file's comment is its only status record — and that is
  precisely why it rotted. Trust the schema, not the comment.
- **`profiles.welcome_seen` is correctly absent**, which confirms `profile/005`
  (the drop) ran.

**How to re-run this check** — no MCP needed, and it is strictly read-only
(`limit=0` returns no rows). One `curl` per table against the Data API:

```sh
set -a; source .env.local; set +a
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/<table>?select=<column>&limit=0"
# 200 = applied · 400 = column missing · 404 = table missing
```

**Use the SERVICE key for existence checks and read the migration for the real
identifiers first** — a wrong column guess returns the same 400 as a missing
one, which produced six false alarms on the first pass here. Note the service
key bypasses grants, so this proves the object exists, NOT that the Data API can
reach it; an `anon`-key 42501 is the EXPECTED answer for every `authenticated`
table and is not evidence of a missing grant.

**A naming collision worth knowing about:** `supabase/markers/` holds TWO `001`
migrations — `001_custom_marker_polarity.sql` and `001_rename_cycle_changes.sql`.
Both are applied, so they were NOT renumbered (renaming an applied migration
buys confusion, not clarity). Every other folder numbers cleanly.

## Open Questions

- **Naming compounds in marketing copy — the age gate is not the operative
  line.** Adrian asked whether real compound names before the age gate are a
  legal problem. The honest answer, and it is not legal advice: an age gate is a
  PRODUCT control, and it is not what makes naming a prescription-only substance
  in promotional material acceptable. Under the Therapeutic Goods Act,
  restrictions on advertising prescription-only (S4) and controlled (S8)
  substances to the public apply to the advertisement, not to the age of who
  sees it. So the question is not "before or after the gate", it is "is this
  surface promotional". The hook is, and has been genericised. **Two things
  follow and both are Adrian's:** the same reasoning applies to the existing
  website, which he says already names compounds; and it arguably reaches the
  demo screen too, though a tool demonstration shown to a gated, self-identified
  adult is materially weaker exposure than a public landing screen. Worth twenty
  minutes of an actual Australian regulatory lawyer before launch, because the
  penalties here are real.
- **Reading signup attribution back** — service-role aggregate (narrows
  `adminMetrics.ts`'s "never return a row" rule) versus a founder-only SELECT
  policy (a third hardcoded copy of the founder emails). Spelled out at the foot
  of `supabase/onboarding/001`.
- ~~**Schedule versioning — migration awaiting Adrian.**~~ **RESOLVED 2026-07-29.**
  `supabase/protocol/005` is applied, so schedule versions (and the Spec 02 delete
  `stopped` markers) now persist server-side instead of living only on the device
  that made them.
- **"Not set"** is the current wording for a dose time on LEGACY records (worded
  once, in `formatTimeLabel`). A time is now required at every entry point, so this
  can no longer be produced fresh. Spec 01 requires Adrian to confirm the wording.
- **Testing scope** — Vitest covers `lib/**` only (pure by house rule). The
  `seedStack` wiring bug that caused the Next Dose dash was a *wiring* error, which
  a logic-only suite cannot catch; component coverage is not set up.
- **Legal copy — parked Privacy Policy edits (stored verbatim, awaiting Adrian).**
  (1) §7 data retention — the backup-retention window is still unconfirmed;
  (2) §9 your rights — a "comply with the user's regional data-protection law"
  clause needs legal sign-off; (3) §5/§10 — Supabase + Vercel regions must be named.
  Untouched until Adrian directs the edits.
- DB-enforced cycle limits — left as an app-layer decision (the single-active-cycle
  index stays commented in the schema); tester behaviour decides post-beta.

## Architecture Decisions (durable — the ones a future session needs)

- **Vercel functions pinned to Sydney `syd1`** (`vercel.json`) — Supabase + users
  are AU; the US-East default added round-trips. `preferredRegion` is NOT the lever
  (edge-only; the app is Node for `@supabase/ssr`).
- **Every new `public` table must ship its own grants** — the Data API needs a
  table-level GRANT to `anon`/`authenticated` before RLS runs; this project doesn't
  auto-grant. Grants live in `supabase/grants/`; RLS still gates the rows.
- **`profiles.tier` is webhook-only** (column-level privilege, Spec 16) — any new
  `profiles` column must be added to the UPDATE **and** INSERT grant lists in a new
  `supabase/grants/00N_*` migration; new service-only columns stay out.
- **iOS PWA install is manual-only** — no programmatic Add-to-Home-Screen exists;
  the prompt's job is clarity, not automation. iOS push needs the PWA installed
  first. Web Push = VAPID + service worker (`web-push`). Memory:
  `pwa-install-and-push-reality`.
- **Next.js 16, not 14** — `middleware` → `proxy` (`proxy.ts`, Node runtime); read
  `node_modules/next/dist/docs/` before using an unfamiliar Next API. Client key is
  the `sb_publishable_…` key; server secret is `SUPABASE_SECRET_KEY` (no `NEXT_PUBLIC_`).
- **Cycles are archived, never hard-deleted** (`is_active=false`); the delete cascade
  is for account deletion only. Compound "Delete" is also soft (Spec 22).
- **Migrations applied by hand (SQL Editor) don't appear in `list_migrations`** —
  verify schema state by querying `information_schema` / the schema directly, not the
  tracked-migrations list (e.g. Spec 22 is live but unlisted).
- **Don't run `npm run build` while `next dev` is up** — they share `.next`; a
  concurrent build 500s the dev server. Build with dev stopped.
- **Health data is categorical, never evaluative**; state colours (red/green/amber)
  are UI feedback only. Locked invariants live in `architecture.md` +
  `project-overview.md` (never store derived values; RLS `(SELECT auth.uid())` on
  every table).
- ⚠️ **Entitlement gates read `entitlements`, NOT `profiles.tier`** (since
  2026-08-12). This line said "`profiles.tier` only" for a fortnight after it
  stopped being true, in the section a future session treats as settled.
  `planLabelFor` and `manageActionFor` (`lib/billing/manage.ts`) both read the
  entitlement's SOURCE; nothing reads `tier` for display any more. `tier` is
  historical (Spec 16) and is still webhook-only at the privilege layer.
  **`project-overview.md` still describes `tier` as the entitlement column and
  is still wrong** — carried in `next-tasks.md`.

## Stacks are dated (2026-08-01)

Adrian found a stack he had just created ("Vitamins" — creatine, vitamin D3,
vitamin C) rendering on days before it existed, with members that had not been
added yet. Reproduced: the compound-level gate was correct (a compound is not due
before its start date), but `Stack` carried **no date at all**, so
`partitionByStack` applied the present-day grouping to whichever day the
dashboard was showing.

- `Stack.effectiveFrom` + per-membership `from`/`to` spans (`to` EXCLUSIVE);
  `supabase/protocol/023_stack_dating.sql` mirrors both.
- The one-stack-per-compound unique index is now **partial** (`WHERE effective_to
  IS NULL`) — the rule is about the present, and a closed span must not hold the
  slot or a compound could never move between stacks. The composite PK on
  `stack_members` is replaced by a surrogate `id` so a compound can rejoin.
- Device store bumped `trackd.stacks.v1` → `v2`, migrating rather than
  abandoning. A migrated stack's start is a GUESS ("today"), flagged
  `provisionalStart` so `pushStacks` omits the column and `hydrateStacks` adopts
  the server's real `created_at`-derived date instead.
- **Eight review rounds, fifteen cold agents, and every round but the last found a
  defect introduced by the previous round's fix.** Round 1: 1 CRITICAL + 4 HIGH
  (below). Round 2: a new CRITICAL created BY the round-1 fix — the pre-023 write
  retry sent every span as its own row, which the old key rejects — plus a
  `provisionalStart` flag that was written and never read. Round 3: a clamp
  written `<=` where it needed `<`, which broke the ordinary same-day move while
  fixing a rare backwards-clock case, and two removal paths that disagreed.
  Round 4: a merge that built its map device-last so the device would win, then
  discarded the result unless a new key appeared. Round 5: the same-day move
  again (the device's record of it is an ABSENCE, so the server's stale span was
  re-adopted) and `adoptStart` back-dating a member added ON the migration day.
  The pattern was always the same shape — the server's copy quietly overwriting
  something only the device knew — and the fix that finally held was to state one
  rule (`mergeStack`: the device is authoritative) instead of three branches with
  three policies, and to give the pure merge functions their own tests. The
  Rounds 6 and 7 continued the pattern (a same-day removal left no evidence at
  all, so the merge re-adopted the server's stale span; then the departure record
  that fixed it collided with a same-day re-join in the dedupe key). Round 8
  returned GO: 37 mutants and ~3,400 fuzzed operations through the real write
  paths — offline, online, pre-023 and post-013 — lost no span, stack or day of
  grouping. Every guard the rounds added is now pinned by a test that was checked
  by reverting the fix and watching it fail. The round-1 findings were: no missing-COLUMN tolerance in `stackSync.ts` (the un-migrated state
  broke every push and pull); `pushStacks` wiped membership before knowing it
  could rebuild it; `hydrateStacks` judged resolution on current members only and
  dropped closed spans; stack mutations were not `trackCriticalSync`, so
  hydration raced a delete and resurrected it.
- **Known and accepted:** a stack inserted into Postgres while its start date is
  still provisional takes the database's UTC `CURRENT_DATE`, which is a day out
  for a far-enough offset; and a member removed on a SECOND device is re-inserted
  by this device's next push (`mergeStack` is device-authoritative — the
  single-device assumption `mergeAndSave` already states). A retired stack is
  also unreachable to delete, by design: it is hidden from every present-tense
  screen but kept so the days it grouped still read correctly.
- **Decision — a past day still shows due-but-unlogged compounds.** Adrian asked
  whether they should only show what was logged; they should not. "Due and not
  logged" IS the missed-dose concept, and day status, Consistency, the calendar
  and the Blocks retrospective all read it.

## Spec w2b-13 — Adrian's device pass (2026-08-07)

Sixteen fixes found by driving the built feature rather than reading it. Types,
tests, four cold review agents and a build were all green on every one of them,
because every one lives in a place none of those look: what a control *says*,
whether it can be *reached*, and what a screen looks like with real data in it.

- **The add-compound sheet crashed.** A review fix compared `toSource()` — a
  fresh object every render — by identity, so `setShown` fired forever. Fixed by
  comparing CONTENT, and shipped to `main` on its own before anything else.
- **Stock opened on the wrong compound.** The sheet took `refillFor` but had no
  way to say "start on this one", so every entry point landed on the first
  compound in the list. It now takes `preselectFor` and locks the picker.
- **Pause could not be undone from where you'd look for it.** The pause glyph on
  a row was a `<span>`; it is a button now and opens straight to resume. The
  sheet also said "Pause X" on the resume branch, and a paused stack member was
  tickable in the pause checklist — pausing it again would have absorbed its
  pause and moved dates the user set deliberately.
- **Resume had no whole-stack option**, so a stack paused in one action came back
  one compound at a time. Added, listing every CURRENTLY-paused member whatever
  stretch it is on (Adrian's call: "resume the stack" means bring it all back).
  Each ticked member resumes on its own — the sheet passes `onlyThis`, because
  the default group resume would bring back a member the user had just unticked.
- **A fully paused stack never moved to the Paused section**, despite the comment
  saying it did: a later change excluded all stack members unconditionally. It
  now collapses to one row carrying the stack's name and its count. A PARTLY
  paused stack still keeps its paused members in the stack row, and a stack with
  anything logged that day stays in the log regardless.
- **Off-plan entries were reachable only through a "+2"** on the day sheet's
  "⋯" — too small a thing to stand for something the user actually did, and you
  could not see WHAT you had taken without opening a menu. They now get a real
  section on days that have them, on Home and in the day sheet, and the "⋯" moves
  onto that heading. Called **"Also logged"**, Adrian's wording.
- **Containers drew empty with no stock recorded.** They were changed to that on
  the argument that liquid beside "Add stock" is a claim; Adrian's call is that a
  drained vial reads as a compound in trouble rather than one you have not
  entered yet. Back to `ILLUSTRATIVE_FILL` — a gauged ZERO still draws empty,
  which is the distinction that matters.
- Section eyebrows gained icons (hollow `Pause`, `Plus`) matching `CategoryIcon`;
  "tab"/"cap" spelled out; Count given its own row; dose-removal is a bin icon;
  the pause toggle is visible when off; the date input stays inside its corner.
- `app/preview/pause` gained a paused-stack fixture. The resume branch's
  whole-stack row needs a paused MATE, and no fixture had one — the branch was
  built and could not be looked at.

**Known and accepted:** `PausedEntry` for a collapsed stack reads its return date
from the first member. Members paused in one action share a group and agree;
members paused separately do not, and one date has to be chosen.

## Stock gets a moment (2026-08-07)

Adding stock closed the sheet and dropped you back on a card that had silently
changed. `ui-context.md` → Motion already says the log action "gets a moment",
for the same reason, so stock now has one: `StockAddedCard` fills the compound's
container from empty to the level just entered (900ms), holds 500ms, and leaves.
Tapping anywhere skips it — a confirmation you cannot skip is one that will be
in the way the fiftieth time (Adrian). A REFILL gets it too; an amounts
correction does not, because that is not "you now have this".

The fill it lands on is `resolveFill().percent`, the same remaining-over-total
ratio `v_inventory_math` will report — so a vial entered as half used settles at
half rather than filling to the brim.

**How the motion works, and why not CSS.** `.container-fill` only ever animated
the VIAL: its liquid is a `<rect>` and `y`/`height` are CSS-animatable SVG
geometry. A tub's powder is a `<path d>` (not reliably animatable outside
Chromium) and a bottle's contents are DISCRETE tablets. `useAnimatedFill` eases
the NUMBER instead, which covers all three because every container derives its
artwork from it. `AnimatedContainer` is a separate component rather than a prop
on `Container`, which has no `"use client"` and renders from server components.

Two things that were wrong on the first pass and are worth not re-introducing:

- **Clearing the eased value in the effect cleanup pops.** Cleanup runs, React
  re-renders at the new target, the browser paints it, and only then does the
  replacement animation's first rAF fire — one frame at the destination before
  easing there. Cancel the frame and leave the value; the new animation
  overwrites it immediately.
- **The dismiss timer must not depend on `onDone`.** It is an inline arrow at
  every call site, so the timer re-armed on each parent render and the sheet
  could stay open indefinitely. Held in a ref, written from an effect
  (`react-hooks/refs` forbids writing one during render).

It eases on CHANGE only — mounting the Protocol tab does not replay a fill on
every card — and is instant under `prefers-reduced-motion`.

Also this pass: the stock actions sheet leads with the compound's container at
its real level instead of a bare name; "Add" as a word became a `+` glyph on
both rows that used it (rotating 45° into an × where the row also expands); the
detail sheet's filled button dropped its pencil and the pencil moved to "Edit
dose & schedule", replacing a calendar that named only half of what it does.
`/preview/stock` gained the moment on its own, because saving there needs a
session and the real path cannot be reached in a harness.

## The two stock forms became one layout (2026-08-07)

`STOCK_FIELD`, `STOCK_FIELD_LABEL` and `STOCK_PILL{,_ON,_OFF}` now live in
`lib/ui-presets.ts` and both stock forms import them — the "Stock on hand" panel
in Add-a-compound and the standalone Add-stock sheet. They were written months
apart and had drifted: uppercase tracked labels against sentence case,
proportional figures against mono, `px-3 py-1.5` pills against `px-2.5 py-1`.
Add-a-compound's version won, being the one most people meet first, and the
standalone sheet's raw `<input>`s became the `Input` component to match.

⚠️ **`STOCK_FIELD` assumes `Input`'s base underneath it.** It carries no
`border` keyword and no width, because the component supplies both. A `<select>`
or a bare `<input>` wearing it needs `border` and a width added back — and needs
`font-sans` restated if it holds a NAME rather than a figure, which the compound
picker does.

Also: low stock moved from the gauge to the "runs dry" DATE (Adrian reversed the
earlier call — the bar measures, the date warns); the stock confirmation is a
CENTRED dialog via a new `side="center"` on the shared Sheet, not a bottom sheet,
and runs 550ms + 300ms rather than 900 + 500; both `+` glyphs are
`text-foreground`; and a leftover `value="Add"` was still printing the word
beside the plus on "Another dose".

## Every graph is one graph (2026-08-07)

Adrian's call: **one stroke weight and one gradient for every series in the app,
with colour as the only thing that varies.** Trend and Consistency were already
the reference — a 2.5px monotone curve over a fill tapering from 0.35 at the
line to 0 at the base — and everything else has been brought to it.

- **`/weight` Scale** — was 1.5 and `fill="transparent"`; now 2.5 over a new
  `weightScaleFill` in its OWN periwinkle `--chart-line`.
- **Home glance sparkline** — the `emphasis="trend" | "raw"` prop is GONE, along
  with the branch that drew the raw series thinner and unfilled. Both callers
  updated.
- **Block retrospective's window graph** — the app's last hand-rolled
  `<polyline>`, straight-segment and unfilled. It now uses `sparkGeometry` from
  `lib/progress/spark.ts` like the glance card, at 2.5 over a taper in
  `--chart-line`. This closes the "ODD ONE OUT" note its own comment carried.
- **Onboarding payoff variant D** — same treatment, so the graph the screen
  sells looks like the graph the user gets.

**`ui-context.md` → Charts was rewritten, not just appended to.** The previous
standard actively REQUIRED the thing that was removed: raw/secondary series at
"lower emphasis (thinner, no fill)", called out as "the one thing that must NOT
collapse". It has collapsed, deliberately. Emphasis is now carried by **opacity**
(the inactive series crossfades to ~0.3) and by colour — never by weight or by
dropping a fill. A future session reading the old rule would have undone this.

The progress ring in `DayStatusWidgets` is untouched: it is a ring, not a line
graph. Colours were not touched anywhere — teal stays teal, periwinkle stays
periwinkle.

## The onboarding phone pass (2026-08-07, `wave3/onboarding-phone-fixes`)

Adrian, driving the flow on his phone. Everything here was CONFIRMED BY
MEASUREMENT at 402x700 before and after, because two of the three faults are
invisible in desktop Chromium and the third looks correct there.

**One scroll port, seven callers.** `ScrollPort` (`components/onboarding/chrome.tsx`)
replaces seven hand-rolled copies of the same class string in `chrome`, `hook`,
`celebrate`, `welcome`, `free`, `greeting` and `demo`. Two separate faults were
sitting in that string, which is how each of them reached seven screens:

- **The focus ring was sliced off down both sides of every control in the
  flow.** `overflow-x: hidden` clips at the padding box and each port's box was
  flush with its full-width content: measured on the name field, input and port
  both spanned x=20→382, so a 2px `--ring` (which is `--accent-amber`, hence
  Adrian's "golden outline") had nowhere to draw. The port now bleeds `-mx-5`
  and re-applies `px-5`, leaving content where it was and moving the clip edge
  20px clear. Re-measured at 20px of clearance on name, birthday, gender,
  running and paywall.
- **The edge fade ran whether or not anything was hidden behind it.** The old
  comment claimed the cost fell only on centred screens whose first 34px is
  empty; that was false. The top fade was washing out the `cost` and `free`
  headlines and the bottom fade was washing out cost's `$69.99`, the paywall's
  billing line and celebrate's last answer — and `free` and `celebrate` do not
  scroll at all, so the gradient was advertising content that did not exist.
  `data-fade` is now written from the real scroll position, and an edge only
  earns a gradient when MORE than that gradient's own depth is hidden past it.
  After: eleven of thirteen screens carry no mask, `hook` (12px hidden) and
  `cost` (16px) correctly carry none, and the paywall fades bottom → both → top
  as it scrolls.

**The date field's corners.** `appearance-none` on the birthday input. iOS
Safari draws `input[type="date"]` as a native control that paints over
`rounded-2xl` and takes its own intrinsic width — Adrian's "cuts off, the
corners should be rounded". Desktop Chromium honours the radius at 402, 360 and
320, which is exactly why this survived review. The wheel still opens; that is
the input TYPE, not its chrome.

**Two options off the intent screens** — "Blast & cruise" and "Can't compare one
run to the last", one from each, so the pair stays even at six and six.
**Removed from the OFFER, not the PARSER**: both tags stay in their unions, in
`RUNNING_TAGS`/`STRUGGLE_TAGS` and in celebrate's answer map, per the rule
`off_season` documents in `session.ts`. Dropping a tag from the runtime arrays
makes `normaliseSession` strip it from anyone who already picked it, which is
the CRITICAL that shipped once for `took_today`.

**No monthly equivalent on the weekly plan.** `monthlyEquivalent` returns null
for `period === "week"`. The bracket exists to make a headline figure read
smaller, which it does for yearly ($69.99 → $5.83/mo) and precisely inverts for
weekly ($4.99 → $21.62). Yearly keeps its bracket, so the comparison that
justifies the weekly tier being poor value is still on screen. Pinned by a test
so a "every plan should show one" tidy-up cannot put it back.

⚠️ **`components/profile/PhysicalCard.tsx` still offers "Blast & cruise"** as a
profile goal. Left alone deliberately: that is an app surface with a stored
value behind it, not the onboarding offer, and removing an option someone has
already set is a separate decision. Flagged for Adrian.

Gates: `tsc`, `eslint`, **727 tests**. `next build` NOT run — it cannot run
while the phone-preview dev server is up.

### Second pass, same day: install last, the carousel moves, icons stop matching

**INSTALL IS THE LAST STEP.** An installed iOS home-screen app gets its own
storage container, so a user who added the icon at step 15 and opened it arrived
with no session and no auth cookie, hit `start_url` (`/dashboard`), and was
bounced to `/login` by the `(app)` guard — signed out of something they had just
paid for, with `notifications`, `attribution` and `letter` abandoned. Last is the
only position where adding the icon costs nothing. Its CTA calls `finish()`, and
"Enter Trackd" moved onto it from the letter, whose button now reads "One last
thing".

**The consequence, and it is a real one: `notifications` no longer asks on iOS.**
That screen used to sit AFTER install precisely because iOS cannot grant web push
to an uninstalled site. It now sits before it, so on iOS the screen records intent
(`notifications_deferred`) and defers the real request to the installed app.
Firing `Notification.requestPermission()` from an uninstalled iOS site does not
just fail, it spends the single prompt the OS ever grants and leaves the user
denied. **Verified by driving the tail under an iPhone UA with
`requestPermission` instrumented: it is never called.** Android is untouched and
still asks in place.

**The carousel moved from the paywall to `free`** and `paywall-hero.tsx` became
`app-carousel.tsx` with it (`PaywallHero` → `AppCarousel`, `.paywall-label` →
`.carousel-label`). "We want you to have your first week on us" is the screen
that has to show what the week contains, and a still of one Home screen said
"there is an app" rather than "there is all of this". The paywall keeps the
trial timeline as its only graphic, **one size up** — 40px discs, 1.05rem
titles, `space-y-7` — since it no longer shares the screen. Its below-fold
content dropped 505px → 224px.

**No two intent options share an icon.** `Compass` was on both "First cycle" and
"Just tracking for now", and `Pulse` on both "TRT" and "Supplements & general
health". Now: `Plant` (Adrian's pick) / `ClipboardText` / `Cylinder` (the tub the
category legend already uses for a supplement). Also `Drop` → `MapPin` on "last
site" (a site is a place, not a droplet) and `Check` → `CalendarCheck` on
"took_today", because the chip draws its OWN tick when selected and a check on
the left made one row look permanently half-ticked. `Plant`, `MapPin` and
`CalendarCheck` added to `components/icons.ts`.

⚠️ **The stale-`.next` trap fired again and was caught by measuring.** After
renaming `.paywall-label` → `.carousel-label`, the file on disk was correct and
`document.styleSheets` still served the OLD selector — the labels measured 16px
where the rule says 9.5px. A dev-server restart with `.next` cleared fixed it.
Renaming a CSS class is a case where HMR does not reliably invalidate; assert the
new selector is served before believing any measurement of it.

## A paused stack opens (2026-08-07)

A fully paused stack collapses to one row under Paused, and tapping it opened
the sheet headed **"Resume Creatine"** — the stack's FIRST MEMBER, a compound the
user never tapped. The entry acts through that member (a stack has no pause of
its own; see `pauseCompounds`), so the sheet was naming its own implementation.

Now:

- `PausedEntry` carries `members` and `stackName`. The row gains a caret and
  OPENS, on the grid-rows `0fr` ↔ `1fr` idiom, listing what is inside it.
- Tapping the ROW means the stack: `PauseSheet` takes a `title` that overrides
  the compound's name in both the visible header and the sr-only `SheetTitle`,
  and `defaultStackMode` opens it already on the whole-stack list, ticked. The
  tap already said "the stack"; a toggle asking again is a second answer to a
  question the user has answered.
- Tapping a MEMBER inside opens that compound's own sheet, which still offers
  the whole stack from within — so both "resume everything" and "resume just
  this one" are one tap from the same row.

The container in the header stays the first member's: a stack has no artwork of
its own, and inventing one would be a picture of nothing.

## "Resume the whole stack" is a select-all, not a mode (2026-08-07)

It was a toggle that REVEALED the member list, so switching it off left nothing
to tick and made "resume the whole stack" a thing you could turn off with no
alternative behind it (Adrian).

It now READS the ticks instead of gating them: untick one member and it goes
off, tick them all and it comes back on, switch it off and every member unticks.
The list is always rendered, because the toggle can no longer be what reveals
it, and the write follows the ticks alone — `onlyThis` on every call, so an
unticked group-mate stays paused.

Opened from a compound → only that compound is ticked. Opened from the collapsed
STACK row (`defaultStackMode`) → all of them. Resuming what you tapped therefore
never requires unticking anything first, and nothing-ticked disables the button.

**`PRIMARY_BUTTON` now lives in `lib/ui-presets.ts`.** The confirm button was
written out per-sheet and drifting a class at a time; the Pause sheet's had
neither the press-scale nor any disabled state, so a button with nothing to do
looked identical to one that would act. Width is left to the caller — some are
full-width, some share a row.

## Container wording, powder units, whole-stack untick (2026-08-12)

Branch `fix/container-wording-and-stack-untick`, from three reports by Adrian.
Not merged; he merges. Six cold reviews across two rounds.

### A tub is not a vial — `lib/containers/labels.ts`

"Powder · same as your current vial" about a tub of creatine. The same
assumption was in six places, and two of them printed a **unit the thing has
never been measured in**: a 1 kg tub read "1000 mL left" in `StockActionsSheet`
and in `LogDoseSheet`.

No new taxonomy was added. `containerFormFor` already resolves vial/bottle/tub
for the ARTWORK and its three values are already the three English nouns, so
`containerNoun` names that existing answer and `remainingLabel` holds the one
amount-left implementation. **The wording had been written seven times and was
right twice.** Anything that needs it now imports it — a compound can no longer
be drawn as a tub and described as a vial in the same row.

The noun prefers everything the STOCK ROW knows over what the catalogue infers.
Its `totalAmountUnit` is what actually fixes the off-catalogue oral supplement:
both sides agree on `oral_solid` there, and the tub comes from `isScoopedPowder`
answering TRUE for any name it cannot resolve. A stored tab/cap count is the
evidence that settles it. (An earlier version of this note blamed the
`inventoryType`, which was wrong — preferring the row's type matters separately,
for a compound stocked in a form the catalogue does not expect.)

### `iu` is not a unit you offer — `lib/protocol/stockUnits.ts`

Both add-stock paths offered `mg | iu` beside "Powder in vial" for every
injectable. **It was never cosmetic.** `base_unit` is written straight from that
toggle and `unit_family_compatible` (016) pairs `iu` with `iu` alone, so a 5 mg
peptide saved as `iu` never links to a dose in mg or mcg: every dose logs
cleanly, reports no error, and the vial stays permanently full.

**The offer derives from the compound's own DOSE UNIT** — the thing the database
actually pairs `base_unit` against. Keying it off the catalogue (the first
attempt, caught in review) denied `iu` to a custom compound dosed in `iu`, which
"Make your own" allows and which cannot be fixed by editing `compounds.csv`. An
iu-dosed compound is offered `iu` ALONE: offering `mg` beside it is offering the
broken state. So there is no toggle here any more, for anything — the field
states its unit. A unit already on a row is preserved, appended not substituted.

### Unticking a stack

Ticking a stack ticked every member; nothing unticked it. Reversed on Adrian's
call — "if they want to re-log it, they can always re-log it."

The old refusal (each log carries its own amount, time and site; there is no
undo anywhere in this app) is answered by **scope, not by a confirm step**. A
whole-stack untick spares what was decided SEPARATELY: paused members, doses
marked Skipped, and historic slots — the last because a historic slot exists
only by carrying a log, so deleting it removes the slot and nothing in the app
can re-create it. Injection sites are NOT spared; a stack tick never records
one, so a site means that member was ticked individually, and its own row
already discards it in one tap.

Rules live in `lib/home/stackTicks.ts`, not in the component: picking the wrong
slots deletes doses, so it is worth a test rather than a comment.

**A 600 ms guard refuses the second half of a double-tap.** Unticking flips the
same 24px target to "log all", so two quick taps deleted five doses and re-logged
them from the plan — losing every edited amount, real time, site and note, with
the row looking exactly as before and nothing on screen to show it.

### Stock figures re-read when a write LANDS — `subscribeDoseSynced`

Ticking a stack always did come off the stock (`logDose` has the server resolve
the vial). The dashboard simply never asked again: its figures were read on
mount, on a day change and on focus, and none of those is a dose being logged.

**Coalesced by COUNTING writes in flight, not by a timer.** The first attempt
debounced the subscriber at 250 ms; every `"use server"` call is a Server Action,
Next runs those strictly FIFO on one queue, and `logDose` enqueues two per dose —
so consecutive events are **two round trips** apart. It coalesced on localhost
and made exactly the five duplicate reads it existed to prevent on a phone. Fires
only when something actually landed, so an offline tick issues no doomed request.

### Oral stock had ONE legal shape and the form offered four

Found by the third cold review, going past the change to the thing under it.
`inv_type_fields` allows exactly two oral rows — strength STATED with
`base_unit IN ('mg','iu')`, or strength ABSENT with `base_unit IN
('tab','capsule')` and `total_amount_unit = base_unit` — and
`check_inventory_unit_family` then requires `base_unit` to pair with the
compound's `dose_unit`. Together those pin the answer completely.

**123 of the catalogue's 125 orals are dosed in mg or mcg**, so the strengthless
shape was rejected for all but Probiotics and Vitamin B Complex — while the
field said "optional" and the form reassured "No strength stated, so doses are
counted in tablets". In `AddStockSheet` that surfaced as a message about a
container type being unavailable; in `AddCompoundSheet` the compound saved, the
sheet closed and **the stock row silently never existed**, because both writes
had their results discarded.

`oralStockRule` derives the shape once and both sheets build from it. A test
walks every oral in the catalogue and asserts the result satisfies both
constraints. The discarded write is now `trackSync`ed, so a failure raises the
app-shell notice that outlives the closed sheet.

**Also: a hidden field kept feeding the maths that sizes the bottle.** The
strength input is hidden for a compound dosed in tablets, and hiding an input
does not clear it — `vialBasis` sizes an oral as `count × strength`, while a
strengthless row is sized as `count`. Switching compounds mid-sheet wrote
`prior_used_base` at strength× the right scale (25,000 instead of 50 on a
half-full bottle of 100), which `v_inventory_math` then subtracts forever.

**`isPendingEnumValue` claimed too much.** It read ALL of `23514` as "your
database is behind", and both unit-family triggers raise with that code — so an
ordinary constraint rejection told the user "This container type isn't available
yet. Try Reconstituted, Pre-mixed or Oral for now." on a sheet with Oral already
selected. It now claims that only for a tub, which is the one case it was written
for, and a constraint rejection says the numbers don't fit rather than promising
that retrying will help.

### Two pre-existing bugs, fixed because this made them easier to hit

- **`unlogDose` waits for BOTH deletes.** The jsonb mirror's delete was fired and
  forgotten while the tombstone dropped on the canonical one alone — and
  hydration merges the mirror, so a failed mirror delete brought the dose back
  with its original amount, time and site, unreported. One tap now issues five.
- **`unitFamilyOk` moved to `lib/db/doseUnits.ts`.** `LogDoseSheet` carried a
  private copy that had drifted to mg/iu only, so a tub and a strengthless bottle
  never appeared in its stock picker though the server linked them anyway.
  `protocolSync.ts` is `"use server"` and could not export it; both share it now.

### Housekeeping

26 iCloud conflicted-copy files (`<name> 2.ext`) deleted from the working tree,
plus an empty `app/api/stripe/webhook 2/`. All were untracked, gitignored and
byte-identical to committed originals — `.gitignore` already documents them and
says to delete them freely. ~18 more sit in `.git/objects` and make `git fsck`
report "bad sha1 file"; harmless, left alone.

## Environment

- Supabase project ref `boqqracwdpuisgvwbqlc`; hosted MCP in `.mcp.json` (OAuth
  browser login can't run in the VS Code extension — hand-apply DDL via the SQL
  Editor when the MCP won't authenticate).
- Founder accounts: Angus `admin@trackdco.app`, Adrian `adrianschimizzi1@gmail.com`.
- `main` deploys straight to Vercel prod. UI/docs changes only need `next build` +
  `tsc` + `lint`; schema changes go through `supabase/` migrations or the SQL Editor.
