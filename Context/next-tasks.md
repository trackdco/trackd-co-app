# Next Tasks

The **windscreen** — the concrete next steps. This file says *what to do next*;
`progress-tracker.md` records what's already done. When a task finishes: log it in
`progress-tracker.md`, delete it here, add the next steps. Full history is in git.

Last updated: 2026-07-30

---

## 🎯 Current focus

# WAVE 2 PART TWO IS IN PROGRESS ON A BRANCH. READ THIS BEFORE ANYTHING ELSE.

**Branch: `wave2/containers-cycles-calendar`. NOT merged, NOT pushed. `main` is
untouched.** Everything below is committed on that branch, so nothing is at risk;
a new session picks up by reading this file and `git log d26034a..HEAD`.

Last updated: 2026-07-30

### Sequencing

The readme's table is BUILD order, not numeric order. Part two runs:
containers -> cycles -> stacks -> homepage -> calendar -> protocol -> calculator
-> progress -> profile -> add-compound -> log-a-dose. The calendar was pulled
forward out of order (Adrian's call) because cycles are invisible without it.

### DONE and reviewed

| Spec | File | State |
| --- | --- | --- |
| 01 Containers | `01-containers.md` | Done, reviewed. Demo page at `/preview/containers`. |
| 06 Cycles | `06-cycles.md` | Done, reviewed twice. FOUR of five end conditions live. |
| 03 Calendar | `03-calendar.md` | Done, reviewed. |
| 05 Stacks | `05-stacks.md` | Done, reviewed twice. |
| 02 Homepage | `02-homepage.md` | Done, reviewed. |
| 04 Protocol | `04-protocol.md` | Done, reviewed. |
| 07 Calculator | `07-calculator.md` | Done, reviewed twice, then reworked on Adrian's phone review and re-reviewed. See "Awaiting Adrian" below. |
| 08 Progress | `08-progress.md` | Done, reviewed, findings fixed. Journal widget + widget height need Adrian's eye. |

### ⚠️ OPEN BUGS FOUND BY THREE BREAKAGE AGENTS (2026-07-30). FIX BEFORE NEW SPECS.

Adrian's instruction: fix these before starting another spec. Several are in code
that predates this wave and is LIVE ON PROD, which makes them more urgent, not
less. Fixed so far: the DST drift, the `__proto__` mirror wipe, the dose-unit rewrite,
the un-log resurrection race, offline doses never syncing, and the injection-site
corruption.

**Migration 009 is APPLIED** (Adrian, 2026-07-30), together with the committed
change to `protocol_compounds.ts` / `protocolSync.ts` it had to land with: 009
re-scopes the schedule-version unique key and the app's `onConflict` was updated
to match, so one without the other would have broken every schedule-version
write. Nothing is pending. See "Migrations" further down.

**Still open: items 4, 5, 6 and 7 below.** 1, 2, 3 and 8 are fixed.

1. ~~Offline doses never reach Postgres.~~ **FIXED** via a narrow
   `repushDoseLogs` on reconnect. The old path called
   `migrateDeviceState(force)`, which checks the durable cloud flag BEFORE
   honouring `force`. That flag is load-bearing (a full re-migration resurrects
   deleted compounds from the stale mirror), so it was left alone and the
   reconnect now pushes only the dose logs. Original description: `migrateDeviceState` checks
   `hasMigratedInCloud()` BEFORE honouring its own `force` flag, so the
   `online`-event re-push in `useCloudHydration` is a no-op for every existing
   user. `hydrateFromPostgres` re-pushes compounds only, never dose logs, and
   there is no outbox. Log offline, reconnect, reinstall: those doses are gone.
2. ~~22 of 36 injection sites corrupted.~~ **FULLY FIXED.** `supabase/sites/011`
   extends the `injection_site` enum by 26 values so every catalogue site has its
   own member, and both mapping directions in `lib/db/types.ts` are now 1:1.
   `lib/db/injectionSiteRoundTrip.test.ts` proves all 36 survive a round-trip and
   fails loudly if a site is ever added without an enum member. Hydration also
   still prefers a local siteId where the pulled row has none, which covers rows
   written before 011. **APPLIED by Adrian, 2026-07-30.** Original description: or erased by the Postgres
   round-trip.** `LOCAL_SITE_TO_ENUM` (`lib/db/types.ts`) covers 18 ids; the rest
   collapse to `other` and return as `null`. "Trap - Left" is erased; "Front Quad
   - Left" comes back as "Outer Quad - Left", a different muscle. The verbatim
   siteId IS in `user_dose_logs` but Postgres wins the merge. Fix: extend the enum
   or prefer the mirror's siteId.
3. ~~Un-log has no TOMBSTONE.~~ **FIXED**: `trackd.doselog.tombstones.v1.<uid>`
   records the intent, hydration filters every source by it, it clears only when
   Postgres confirms the delete, drops on a re-log, and expires after 14 days.
   Original description: The critical-sync fix closes the race, but an
   un-log performed OFFLINE is still resurrected by the next pull, because
   hydration seeds from `pg.doseRows` unconditionally and there is no
   local-wins reconciliation for logs (compounds have one).
4. **Dose writes derive the Postgres id instead of resolving it.**
   `pushProtocolDoseLog` / `deleteProtocolDoseLog` use `resolvePcId`, not
   `findProtocolCompoundId`. When ids diverge the write returns
   `{ok:false, skipped:true}` and `trackSync` suppresses the warning, so it is
   silently lost.
5. **Protocol has NO add-compound affordance** and its own empty copy tells the
   user to add one. Every control on the page is dead for a new account.
6. **"add stock" on a dose row discards the compound** - it pushes `/protocol`
   and drops the argument, so the user must find the card again themselves.
7. **The journal card opens the EDIT editor, not Write**, with the marker dialer
   force-expanded, and dismissing it opens the feed sheet nobody asked for. On a
   FUTURE day the save is rejected and the date field is hidden in edit mode, so
   the entry cannot be saved or corrected, only abandoned.
8. ~~Three sibling tables share the RLS hole 008 fixed.~~ **FIXED and APPLIED**
   as `009_ownership_hardening.sql` (Adrian, 2026-07-30). Original description:
   `protocol_compound_schedules` (005), and `protocol_compounds`' uniques from
   003/004. Same shape: RLS checks only `user_id`, single-column FK, globally
   unique index. Squatting a slot permanently breaks a victim's sync with no
   repair path. `protocol_compounds_id_user_key` already exists from 008, so the
   fix is ~3 lines per table.

**MEDIUM, still open:** first-ever add of stock writes the client id as the FK;
custom-compound form guessed two different ways (card vs sheet); the Today ring's
denominator counts logged-but-not-due doses so it can contradict Next Dose;
CompoundDetailSheet's "Next:" lists the FIRST doses of the run, not upcoming ones;
back-dated deletes retro-erase a completed run; the Calendar's todayKey is never
corrected to the device clock; a timezone change moves logged doses a day;
`wipeMyProtocol` misses stacks; `est_empty_date` is a day out for any non-UTC
user; `interval_days` clamped on one write path and raw on the other;
`protocol_compound_schedules` has no cycle CHECK so negative rounds can mark a
cycle permanently ended; PGRST204 retries drop a cycle and report ok.

Full detail is in the three agent reports in this conversation. If that context is
gone, re-run the agents: they reproduce these by executing the real code.

### NEXT UP

`09-profile.md`, then `10-add-compound-item.md`, `11-log-a-dose.md`. Then part
one's `07-global-sweep.md`, which runs last. BLOCKS is new scope and slots in
wherever Adrian wants it.

**Two spec 08 items need Adrian's eye rather than a fix:**
- The widgets are ~228px tall against the dashboard's 183px. The width and card
  chrome match; the height is what a sparkline plus a toggle actually needs. The
  spec said "condensed to a square" and they are not square. Forcing it would
  clip content.
- The journal widget now shows two preview lines, marker word-chips and an entry
  count, which is MORE than the spec describes ("one-line preview", chips
  dropped). That was Adrian's call after seeing it read thin; the spec file still
  says the opposite and has not been amended.

### PARKED DECISIONS (coded around, nothing blocked)

**BLOCKS — SETTLED and STARTED. Two things must land before it ships.**
1. **No Postgres mirror yet.** `lib/blocks/blockStore.ts` is device-local only.
   Losing a sixteen-week prep to a PWA reinstall would be the worst possible bug
   in a feature whose whole point is looking back, so a `blocks` table + mirror
   is REQUIRED before this is user-visible. The store's shape is already the one
   that table would take, so it is a sync layer rather than a rewrite.
2. **`/blocks` is a scaffold.** The banner links to it and reads a live block
   correctly; the live detail, the retrospective, and the create flow are next.

Settled by Adrian 2026-07-30: called a BLOCK, one live at a time, real dates
rather than a week count, slim banner on Progress linking to its own page, the
Progress widgets scope themselves to the live block, and targets cover weight and
consistency but NEVER bloodwork ("I'm not doing targets for blood work. No way.")
— a target on a biomarker turns a reading into a pass or a fail, which is what
the categorical-never-evaluative invariant exists to prevent.

Still open: whether a block may be open-ended, what happens on the end date
(I lean prompt-to-close, since an auto-close gets no reflection), and where the
rest of it sits in the build order.

**Superseded proposal notes below.**
`Context/Feature Specs/proposals/blocks.md`. Settled by Adrian 2026-07-30: it is
called a BLOCK (a training block), one is live at a time, targets are in and are
not limited to weight, and a block is bounded by real DATES rather than a week
count. Still open: which tracked variables may be targets (I recommend weight and
consistency, and never a biomarker, since a target on a reading turns it
pass/fail against the categorical-never-evaluative invariant), whether a block
may be open-ended, what happens on the end date, and where it sits in the build
order. New scope: not one of the eighteen wave 2 specs.

**Does a compound that is not taken daily count as "running" under a photo?**
Adrian raised creatine: in the protocol, not taken every day. The shipped rule is
"in the protocol, started, not stopped, on-cycle" — so it DOES show, regardless
of whether a dose fell that day. I think that is right (it is what you were on,
which is what the photo is asking) but he flagged it to discuss, so it is
recorded rather than assumed. `lib/progress/running.ts` is the one place to
change if he disagrees.


**The mg/mcg control's look — SETTLED, kept here for the record.** Adrian asked
for it "dropped into the input area so it's part of the little tablet thing", and
then for both units to stay visible. Shipped as a two-segment `mg | mcg` pill
INSIDE the field's right edge (`UnitPill` in `CalculatorInputs.tsx`). A
tap-to-flip chip was tried in between and rejected: it hides the alternative
behind a tap, and with two units 1000x apart the alternative is exactly what
someone needs to see to notice they picked wrong. The pill fits because it is
10px text and the powder/BAC row unpairs below 360px; measured, the powder input
is never under 61px against the ~42px a five-character value needs. The live
conversion under each field stays regardless: it is what actually catches the
slip.

### Awaiting Adrian (from spec 07, none of it blocking the next spec)

1. **Spec 07 asks for a Vercel preview deployment; you asked for no pushes.** The
   branch has no remote, so no preview URL exists for the calculator. The two
   instructions collide and yours wins for now. Say the word and it goes up on a
   preview subdomain without touching `main`.
2. **One new shared preset was added, which spec 07 says to flag first.**
   `COLUMN_EYEBROW` in `lib/ui-presets.ts`, documented in `ui-context.md`. It
   exists because "CONCENTRATION" at the 10px eyebrow's 0.18em tracking is ~109px
   and overruns a third of a phone's width with no space to wrap on.
   `ui-context.md`'s own rule says add the preset rather than invent a one-off,
   so that is what happened, but it is your call to keep. (`COLUMN_VALUE` was
   added at the same time and has since been removed: the figures row became a
   divided strip, which orphaned it.)
3. **The calculator now shows four amber elements at once** in the misuse state:
   the barrel fill, the insulin-units figure, the warning, and the permanent
   disclaimer. Three of the four are spec-mandated, so spec 07 and
   `ui-context.md`'s "one or two amber beats per screen" rule are in genuine
   tension. The warning and the disclaimer no longer share identical chrome, so
   they at least read as different things. Worth a decision before the global
   sweep.
4. **The pre-existing open bugs below (items 4 to 7) are still open.** This
   file's older note says to clear them before starting another spec; your
   instruction on 2026-07-30 was to run 07 next, so 07 ran. They are unchanged.

5. **Spec 07 says "this stays a stateless calculator"; the syringe size now
   persists.** It is a preference about equipment, not a saved calculation, and
   you asked for it explicitly, so it is not a violation in spirit. Recorded here
   rather than silently done, and noted in `architecture.md`.

6. **The spec's page order and its "three result cards" both changed** on your
   phone review: the readout and barrel are now bare rather than carded, and the
   three figures are one divided strip with the unit inline rather than three
   cards with the unit beneath. The spec file itself has not been amended, so its
   "Check When Done" list reads as unmet on those two lines. Say the word and I
   will amend the spec so a future session does not "fix" it back.

### The working loop Adrian asked for

Per spec: implement -> verify (tsc, lint, `npm test`, `next build`) -> commit ->
run an INDEPENDENT review agent -> fix findings -> commit -> update these context
files. Do not merge, do not push. Adrian merges everything at the end, in one go.

**Review agents have found real defects on every spec so far, including one
critical regression the author missed.** This is not ceremony. Keep doing it, with
a FRESH agent rather than self-review.

### Migrations: ALL APPLIED by Adrian (006, 007, 008, 009, sites/011)

`supabase/protocol/006_compound_cycles.sql` (cycle columns + runs-dry fix),
`007_stacks.sql` (stack tables), `008_stack_members_ownership.sql` (closes an RLS
hole 007 shipped), `009_ownership_hardening.sql` (the same hole on three more
constraints, plus the version trail's missing shape CHECK), and
`supabase/sites/011_injection_site_enum.sql` (26 new enum values so all 36 sites
round-trip). **Nothing pending.**

### KNOWN GAPS, carried deliberately

**Cycle end condition 3, "ends when the vial runs out", is WITHHELD.** The rule is
implemented and tested; nothing derives the day a vial actually ran dry, so it is
gated behind `VIAL_END_SUPPORTED = false` in `lib/protocol/cycleRule.ts` rather
than shipped as a control that silently does nothing. Wiring it means threading a
Postgres read into `isDueOnFor`, which is pure and synchronous and called by the
week strip, calendar, consistency and Next Dose. Its own pass.

**Injection sites are not captured when a stack is logged in one tap.** A stack
tick has no body map, and inventing a site would corrupt the recency view.

### Decisions Adrian has SETTLED - do not re-litigate

- Week strip: soft raised block for the selected day, NOT the amber underline the
  spec specified. Status dot sits INSIDE the block.
- "Nothing scheduled / No doses planned for this day." for a day with no doses.
- Today card dot cap: 9, then "+N".
- Runs-dry: amber on the BAR at 7 days or fewer, never on the text. The date takes
  `--text-muted` to match the other figures; the "runs dry" label is lowercase and
  dimmer. Recorded as a scoped exception in `architecture.md`.
- Cycle countdown-versus-date crossover: 14 days.
- Schedule: rows of dots, NOT a table. Icon-led headings, white labels.
- New stack / new cycle: hairline outline card, ghost preview, ONE line of copy
  when empty.
- Unnamed stacks auto-name "Stack N", lowest free number. Relaxes Spec 05's
  "name required".
- Tabs and caps DO show stock (it already existed and was merely hidden). Powders
  genuinely have none and say so.
- Compound detail sheet leads with the CONTAINER. Specs 10 and 11 reuse that header.
- **NO EM DASHES in any user-facing string.** Hard rule, `ui-context.md` under
  Voice and Microcopy.

### Merging, when Adrian says so

`main` deploys straight to Vercel prod, so merge ONLY on his word. Before it:
tsc, lint, `npm test` and `next build` all clean; decide whether the `/preview/*`
demo pages ship; do not rewrite the migration files.

---

