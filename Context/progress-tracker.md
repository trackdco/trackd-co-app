# Progress Tracker

Records the **state** of the build: what's done + the decisions behind it — the
rear-view mirror. Forward steps live in `Context/next-tasks.md`. The full
blow-by-blow history of every spec is in git; this file keeps only what a future
session needs at hand.

Last updated: 2026-07-31 (evening session)

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

## Open Questions

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
  every table; entitlement gates read `profiles.tier` only).

## Environment

- Supabase project ref `boqqracwdpuisgvwbqlc`; hosted MCP in `.mcp.json` (OAuth
  browser login can't run in the VS Code extension — hand-apply DDL via the SQL
  Editor when the MCP won't authenticate).
- Founder accounts: Angus `admin@trackdco.app`, Adrian `adrianschimizzi1@gmail.com`.
- `main` deploys straight to Vercel prod. UI/docs changes only need `next build` +
  `tsc` + `lint`; schema changes go through `supabase/` migrations or the SQL Editor.
