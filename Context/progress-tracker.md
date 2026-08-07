# Progress Tracker

Records the **state** of the build: what's done + the decisions behind it — the
rear-view mirror. Forward steps live in `Context/next-tasks.md`. The full
blow-by-blow history of every spec is in git; this file keeps only what a future
session needs at hand.

Last updated: 2026-08-07 (every graph unified to one stroke + one gradient)

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
  every table; entitlement gates read `profiles.tier` only).

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

## Environment

- Supabase project ref `boqqracwdpuisgvwbqlc`; hosted MCP in `.mcp.json` (OAuth
  browser login can't run in the VS Code extension — hand-apply DDL via the SQL
  Editor when the MCP won't authenticate).
- Founder accounts: Angus `admin@trackdco.app`, Adrian `adrianschimizzi1@gmail.com`.
- `main` deploys straight to Vercel prod. UI/docs changes only need `next build` +
  `tsc` + `lint`; schema changes go through `supabase/` migrations or the SQL Editor.
