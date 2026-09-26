# Cold review: bugs

Branch `design/half-life-motion` at `1f77303` (worktree `trackd-halflife-wt`), 26 Sep 2026. Read-only: nothing
in the code, the branch or the database was changed. This file is the only thing written.

## Summary

- **1 blocker, 12 major, 24 minor proven** (37 total). Most majors come with a failing test; the rest have an
  exact code path that I read and confirmed. **12 suspected.** 2 older bugs already on `main`.
- **The blocker (B1) is the migration plan.** None of the three PostgREST joins between `inventory_items` and
  `protocol_compounds` is hinted with the foreign-key name, on this branch or on `origin/main`. Applying `026`
  as written adds a second foreign key between those two tables. Stock then fails to load for every user, and
  the low-stock push goes silent. 025 and 026 are not applied (checked read-only on the live database), so
  nothing is broken today.
- **Stock has three data bugs** from the branch's new "several containers open at once" rule:
  - the low-stock push misfires every day (B2);
  - HGH mixed at the box's mg figure draws 3× the dose (B3);
  - a closing row can start another compound's spare (B7).
- **Logging has one:** saving an opened Skipped row turns it into a taken dose (B4).
- **The Home journal has two data-loss bugs** (B5, B6).
- **Every confirm pop-up opens without its animation or focus** the first time it opens (B9).
- **The half-life rail gets three figures wrong for common regimens** (B11 to B13).
- **The rest is minor:** edge cases, timing races, formatting and accessibility.
- **Clean:** stacks' `restoreStack`, Mix's Undo refusal, the gate manifest, the toast store, the `v_inventory_math`
  replacement in 026, and the half-life model's numeric safety (no NaN or Infinity anywhere).

## `npm run check`

- **As written, it exits 2**, but not because of the code. The dev server on port 3217 (started 09:16) wrote a
  corrupt generated file, `.next/dev/types/routes.d.ts`: line 129 reads `are global {` instead of
  `declare global {`. The git-ignored `next-env.d.ts` imports that file.
- **Run against the source**, with a temp tsconfig in /private/tmp that points `next-env` at the intact build copy
  `.next/types/routes.d.ts`, every step passes:
  - **tsc:** clean.
  - **eslint:** clean.
  - **gate audit:** clean (35 gated, 2 conditional, 73 ungated).
  - **vitest:** 141 files, 2468 tests, all pass.
- **To clear it:** a fresh `next dev` or `next build` regenerates the file. Don't delete `.next` by hand (iCloud).

## How to re-run the proofs

The tests are throwaway, outside the repo, and /private/tmp is wiped on reboot. The repro text below stands
on its own.
- Harness: `/private/tmp/coldbugs/vitest.config.mjs`. It sets the root to the worktree and the `@` alias.
- Run: `cd <worktree> && ./node_modules/.bin/vitest run --config /private/tmp/coldbugs/vitest.config.mjs <file-name-part>`.
  Filter by file name (e.g. `ended-same-day`) or by an absolute directory. `tests/x` matches nothing.
- Test files:
  - `tests/mine/{ended-same-day,lowstock-per-container,mix-hgh}.test.ts`;
  - `tests/halflife/{edges,dst,clean}.test.ts`. Run `dst` with `TZ=Australia/Sydney` and
    `TZ=America/Los_Angeles`; `clean` passes and records the edges that are fine;
  - `tests/home/*.test.ts` (with `hookshim.ts`, a small hook runtime);
  - `tests/react/{popdialog,homejournal-markers}.test.ts` (with `fakedom.ts`, which runs real react-dom 19.2.4).
- **Failing means the bug is there**, except `tests/react/*`: those assert the current behaviour, so there
  **green** means the bug reproduced.

---

## PROVEN

### Blocker

**B1. Applying 026 as planned breaks Stock for every user (PGRST201), on this branch and on main.**
- **Where:** `lib/db/inventory.ts:34` and `:40`, `lib/notifications/runner.ts:634`. The same three embeds are on
  `origin/main` (`lib/db/inventory.ts:31`, `:37`; `runner.ts:634`). Each is `protocol_compounds!inner(...)` with
  no foreign-key hint.
- **What goes wrong:** `026` adds `protocol_compounds_cycle_end_item_fk`
  (`026_stock_spares_and_dropper.sql:404`), a second foreign key between the same two tables.
  - PostgREST then finds two relationships for `inventory_items → protocol_compounds` and refuses the unhinted
    embed (PGRST201).
  - `listStock` treats that as a failed read and returns `{ ok: false }`. Protocol shows no stock and the
    "couldn't read" line for everyone.
  - The cron's inventory read fails, and it is tolerant by design (`runner.ts:691-705`), so every low-stock push
    stops with only a log line.
  - `026` also makes `protocol_compound_schedules` a junction between the two tables, a third path.
  - The file's own header (`026:23`) says it is "BACKWARD COMPATIBLE WITH `main`". That is false for these embeds.
- **Proof:** read-only catalog query on the live project:
  - `inventory_items` has exactly one foreign key to `protocol_compounds`, named
    `inventory_items_protocol_compound_id_fkey` (the name the brief gives);
  - the `dropper` and `drop` enum values are absent, as are `cycle_end_item_id`, `v_compound_stock` and
    `compounds.half_life_estimated`. So 025 and 026 are unapplied.
  - The second foreign key comes from 026's text. The PGRST201 behaviour is what the team saw live before
    (memory: "Second FK breaks PostgREST embeds").
  - I did not run PostgREST against a 026 database. This is proven from the schema, not executed.
- **Why:** the brief §5 step "hint every embed ... on this branch AND origin/main" was not done. `git grep`
  finds no hint anywhere.
- **Fix:**
  - Change all three to `protocol_compounds!inventory_items_protocol_compound_id_fkey!inner(...)`, on this
    branch and on `main`. The `protocol_compounds.is_active` filter keeps working under the hint; alias it if in doubt.
  - Deploy `main` first, then 025, then 026.
  - Correct 026's header, and add "the embeds are hinted and deployed" as step 0 of its HOW TO RUN.

### Major

**B2. The low-stock push says "running low, about 0 doses left" every day while a full vial sits beside the
empty one.**
- **Where:** `lib/notifications/runner.ts:819-855`, `lib/notifications/reminders.ts:402-419`. The cause sits in
  `lib/db/inventory.ts:409-495` (adding stock no longer archives) and `components/protocol/ProtocolScreen.tsx:452`.
  Every mount of `AddStockSheet` passes `replaceItemId={null}`, as does the + menu.
- **Sequence:** use up vial A and don't Discard it. Add stock (vial B) from Protocol. Vial A stays active with
  `days_to_empty = 0`, so the runner lists it as low: "BPC-157 is running low. About 0 doses left." once a day,
  until the user finds and discards A.
- **Second form:** two open containers that are each short read "2 compounds are running low: BPC-157, BPC-157".
  - The runner judges each container as if it were the only one, which was true on `main` (add archived the others).
  - The app's own Runs dry is per compound (`runsDryInDays` over `v_compound_stock`), so the push and the
    screen now disagree.
- **Proof:** `tests/mine/lowstock-per-container.test.ts`. Both cases fail. Received body:
  `"BPC-157 is running low. About 0 doses left."`.
- **Fix:** group by `protocol_compound_id` in the runner:
  - sum `doses_remaining` over started containers (after 026, read `v_compound_stock`);
  - leave out empty containers when another open one has doses;
  - compute days from the sum;
  - list each name once.

**B3. HGH: typing the box's mg figure at Mix draws 3× the dose and overwrites the stored powder.**
- **Where:** `components/protocol/MixVialSheet.tsx:148-149` (the powder unit is fixed to the spare's stored unit)
  and `:185-193` (a changed powder is saved over the row).
- **Sequence:**
  - Add stock for Somatropin, "10 mg". The Add sheet offers mg and converts it, storing 30 IU
    (`stockUnits.ts:161-190`, whose comment says the box prints mg).
  - Mix one: the powder field starts empty with an "IU" unit. The user types "10" from the box, water 2 mL,
    dose 3 IU.
  - Result: "Draw 60 units for 3 IU". The right figure is 20. Mix also rewrites the row to 10 IU, so the stock
    maths is 3× off too.
- **Proof:** `tests/mine/mix-hgh.test.ts`: expected "Draw 20 units for 3 IU", received "Draw 60 units for 3 IU".
- **Why:** Mix skips the `powderEntryUnits` / `powderAmountInBase` pair that the Add sheet uses for exactly this.
- **Fix:** offer the same mg / IU choice at Mix and convert before `mixDrawLine` and before saving. Or, for
  `isMgLabelledIuCompound`, show "= 30 IU" under the field as Add does.

**B4. Saving an opened Skipped row turns it into a taken dose.**
- **Where:** `lib/home/logDraft.ts:131-149` (`draftToLog` drops `status`), `components/home/log/useLogRows.tsx:131-146`.
- **Sequence:** skip a dose, tap the row's name (edit mode opens, `useLogRows.tsx:179-186`), tap Save.
  `commitDoseOn` writes the log as given (`lib/home/doseLog.ts:529`), with no status, meaning taken. The dose
  now comes off stock and counts toward consistency.
- **Proof:** `tests/home/pure.test.ts` "keeps it skipped" (expected `'skipped'`, received `undefined`);
  `tests/home/useLogRows.test.ts` "Save on a SKIPPED row".
- **Fix:** carry `existing.status` through `RowDraft` into `draftToLog`, or don't offer Save on a skipped row.

**B5. The Home journal can save today's note into another day, and wipes typing.**
- **Where:** `components/home/HomeJournal.tsx:98-116`.
- **Sequence:** open the journal card. Before `readJournalForHome` returns, pick another day under Date (the 20th),
  or start typing.
  - When the read lands, `preload(dayKey, next)` loads TODAY's note and markers while `date` is the 20th.
  - Save sends `{ entryDate: 20th, body: today's note, markers: today's }`. The server treats markers as the full
    set, so the 20th's own entry is overwritten.
  - Anything typed during the read is replaced.
- **Proof:** `tests/home/homeJournal.test.ts`, "does not load TODAY's ..." and "does not wipe what was typed ...".
- **Fix:** preload from the current date (via a ref), and only if nothing has been edited. Or disable the note,
  the markers and Date until the read lands.

**B6. The Home journal loses marker ratings when you switch tiles.**
- **Where:** `HomeJournal.tsx:251-257` (the dialer gets `initial={entry?.markers ?? []}`, the SAVED entry) and
  `:387-389` (only the shown tile's body is mounted). `MarkerDialer.tsx:350-353` seeds from `initial` only on mount.
- **Sequence:** Markers, add Sleep, rate it Good. Tap Photos, then Markers again. Sleep is gone, but the tile still
  says "1 noted". Rate Energy, then Save: only Energy is saved.
- **Also:** the dialer's unmount cleanup (`:380-398`) drops a pending "removed" Undo toast and sends the custom-marker
  removal at once.
- **Proof:** `tests/home/homeJournal.test.ts` "re-mounted dialer ..." (expected `[['energy',4]]`, received `[]`);
  `tests/react/homejournal-markers.test.ts` reproduces it in real react-dom.
- **Fix:** keep `MarkerDialer` mounted while the card is open and hide it when another tile shows. Feeding back
  only the rated `markers` would still lose rows added but not yet rated.

**B7. A closing row's late stock read makes Track on the NEXT row start the first compound's spare.**
- **Where:** `components/home/log/useLogRows.tsx:214-216`. `onSpare` writes the shared `spareRef` with no
  `live && sameRow` check. `onDraft` at `:203-207` has one.
- **Sequence:** A holds only a sealed spare. Tap row A, then open row B before A's stock read returns. A's panel
  stays mounted for 520ms while it folds away; its read lands and sets `spareRef` to A's spare. Track on B then
  calls `openStockItem(A's spare, today)` (`:120-129`). A's spare is started for no reason, and if B also held
  only a spare, B's dose is left unlinked.
- **Proof:** `tests/home/useLogRows.test.ts` "closing row's late stock read ..." (`openStockItem` called with
  `['spare-of-A', '2026-09-26']`).
- **Fix:** guard `onSpare` the same way, or keep the spare id in that row's `draft`.

**B8. Opening a logged dose to edit it can move it to another container, or start a spare.**
- **Where:** `components/home/log/LogRowPanel.tsx:151-157`. The auto-pick runs whenever
  `draft.inventoryItemId === undefined`, edit mode included. The deleted `LogDoseSheet` only did it for a new log.
- **When the link is undefined:** doses from the whole-stack tick (`HomeScreen.tsx:1037-1068`, logged with no
  container), and a quick double tap before the stock read landed.
- **Sequence:** the dose emptied its vial. Open it to add a note and press Save. The panel picks the next open
  container, or a sealed spare (calling `onSpare`), so Save starts the spare and re-links the dose. The dose
  leaves the vial it came from.
- **Proof:** `tests/home/logRowPanel.test.ts` "does not re-pick ..." (received `inventoryItemId: 'spare-S'` and
  `onSpare('spare-S')`).
- **Fix:** pass an `editing` flag and skip the auto-pick for an existing log.

**B9. Every pop-up's FIRST open has no scale-in, doesn't move focus in, and doesn't return focus.**
- **Where:** `components/feel/PopDialog.tsx:47-75, 117-119`.
- **Sequence:** the first `open` of an instance. While `host` is null only the probe renders. The host layout
  effect's `setHost` re-renders and creates the portal, but the "In" effect (`[open, mounted]`) already ran and
  returned early (no `scrimRef`), and its deps don't change, so it never runs.
  - No animation.
  - Focus stays on the trigger behind the scrim, so a screen reader never lands in the alertdialog and Tab walks
    the page behind it.
  - `returnTo` stays null, so focus isn't restored on close.
  - The second open of the same instance works.
- **Which pop-ups are first-open every time:** the confirms in `CompoundDetailSheet.tsx:510-543` (DetailBody
  remounts per open) and the viewer's Delete confirm (`ProgressPhotoViewer.tsx:728`). Explainers and the Stacks,
  Cycles and Ended confirms are hit once per page visit.
- **Proof:** `tests/react/popdialog.test.ts` (3 tests, real react-dom), confirmed by reading.
- **Fix:** deps `[open, mounted, host]`, and return early while `!host`.

**B10. A toast's Undo can't be reached by keyboard or screen reader while a sheet is open (accessibility).**
- **Where:** the toast lives in the app shell (`app/(app)/layout.tsx:167`, `components/feel/Toast.tsx`). A Radix modal
  sheet runs `hideOthers` and a focus trap, so the toast gets `aria-hidden` and Tab can't reach Undo.
  `BottomSheet.tsx:66-70` fixed only the pointer.
- **When:** "Unticked" from Quick log or the Calendar day sheet, "Discarded" (`CompoundDetailSheet.tsx:537`, the
  sheet stays open), and "<Marker> removed" inside `JournalEntrySheet`.
- **Proof:** code path, confirmed against `@radix-ui/react-dialog` (`hideOthers(content)` and the trapped `FocusScope`).
- **Fix:** while a sheet is open, portal the toast into the top `[data-slot="sheet-content"]`, as PopDialog does.

**B11. Level reads "Climbing" around the clock for a short half-life taken two or three times a day.**
- **Where:** `lib/halflife/model.ts:186-192` (`breakGap`), used by `runStartH` (`:203`) and `steadyAt` (`:290`),
  and shown by `levelWord` (`HalfLifeCards.tsx:163-166`).
- **Sequence:** BPC-157 (4 h) at 08:00 and 16:00 for 14 days. The "usual" gap is the lower median of all gaps,
  8 h. The overnight 16 h gap is more than 1.75 × 8 and more than 3 half-lives, so every morning starts a new
  run and steady is never reached. The same happens at 08/13/18.
- **Second trigger:** two untimed slots both placed at noon make the median 0.
- **Proof:** `tests/halflife/edges.test.ts` (expected 8, received 320; `{kind:'in',hours:23}` where `reached`
  was expected).
- **Fix:** measure the usual gap per slot, e.g. the median gap between same-slot doses. Merge identical instants
  first. Use the same rule for `lapsed`.

**B12. "Peak · Passed" while the next dose is scheduled, for any interval over about 8 days.**
- **Where:** `model.ts:471-486` (`peakCountdown` sees only the drawn doses), `HalfLifeCards.tsx:213` (the schedule
  is built only to `nowH + 192`), `HalfLifeCompoundScreen.tsx:161-163`.
- **Sequence:** Testosterone Cypionate every 14 days, 5 days after a dose. Next dose shows a date, but Peaks in
  says "Passed". That is wrong for about 4 days in every 14. For Testosterone Undecanoate every 10 weeks it is
  wrong for about 50 days.
- **Proof:** `tests/halflife/edges.test.ts` (expected "Next peak in", received "Peak").
- **Fix:** pass the real `nextDoseAtH` into `peakCountdown` (as `figuresAt` already gets it), or build the schedule
  to at least the next two doses.

**B13. "Next dose" rounds hours, not calendar days.**
- **Where:** `components/halflife/HalfLifeCards.tsx:170-173` (`Math.round(h / 24)`). It feeds the rail's rows and
  the compound page's big figure (`HalfLifeCompoundScreen.tsx:228`).
- **Sequence:** at 21:00 with the next dose at 08:00 tomorrow, it reads "Today" (every evening, for any morning
  dose). At 07:00 with the dose at 20:00 today, it reads "1 day".
- **Proof:** `tests/halflife/edges.test.ts`, both "Next dose words" cases.
- **Fix:** count days between the local date keys of now and of the next dose.

### Minor

**B14. A cycle added and ended on the same day never reaches Ended.** The sample user hit this.
- **Where:** `lib/home/stack.ts:463-465` (`recordScheduleVersion` replaces a version with the same
  `effectiveFrom`), reached through `endCycle` (`lib/home/endedCycleActions.ts:27-29`). `endedCycles` derives
  runs only from versions that carry a cycle (`lib/protocol/endedCycles.ts:157-191`).
- **Sequence:** New cycle on a running compound today, then End today. End's no-cycle version replaces the cycle's
  own version, so no run is left to list, and the cycle can't be restarted once the 3s Undo is gone. The same
  happens for a compound added today with a cycle. The brief §3.10 says "The cycle moves to Ended."
- **Proof:** `tests/mine/ended-same-day.test.ts`. Both cases fail (no version carries the cycle; Ended is `[]`).
- **Fix:** don't let End erase the run's only record. Keep the ended rule where the derivation can read it (e.g. an
  `endedCycle` field on the End version, device-first like the hidden list), and have `endedCycles` build a
  one-day run from it.

**B15. 026's file doesn't carry the plan's safety settings.**
- **Where:** `supabase/protocol/026_stock_spares_and_dropper.sql`.
- **What's missing:** brief §5 says to run it "in one transaction with `SET lock_timeout='5s'`". The file has
  neither, and its HOW TO RUN tells Adrian to paste the WHOLE file. Its header claims compatibility with `main`
  (see B1) and doesn't list the embed hint as a prerequisite.
- **Proof:** file contents (`grep` finds no `lock_timeout`, `BEGIN;` or `COMMIT`).
- **Fix:** start the file with `BEGIN; SET LOCAL lock_timeout = '5s';` and end it with `COMMIT;`. Add the
  prerequisite and the ":00/:15/:30/:45 cron" warning to HOW TO RUN.

**B16. A spare that fails to start leaves the dose unlinked for good.**
- **Where:** `useLogRows.tsx:127-134`. The result of `openStockItem` is ignored, and the dose is committed with the
  spare's id.
- **What happens:** the server drops a link to a container that isn't started (NULL). The retry sends the same id,
  so the dose never comes off stock. This happens offline or on a failed request.
- **Proof:** `tests/home/useLogRows.test.ts` "a spare that fails to start".
- **Fix:** on failure, leave the link undecided (`undefined`) or keep the row open with an error.

**B17. "Unticked" Undo overwrites a dose re-logged within the 3 seconds.**
- **Where:** `useLogRows.tsx:166-168`.
- **Sequence:** untick, open the row, Track a new dose, tap Undo. The old dose overwrites the new one. The stack
  untick's Undo (`HomeScreen.tsx:1091-1095`) has the same shape.
- **Proof:** `tests/home/useLogRows.test.ts` "Unticked's Undo ...".
- **Fix:** make Undo do nothing when the slot has a log now.

**B18. An untick during Save's 620ms confirm is undone by the timer.**
- **Where:** `useLogRows.tsx:136-146`. The timer isn't kept, cleared or re-checked.
- **Proof:** `tests/home/useLogRows.test.ts` "Save's confirm timer".
- **Fix:** keep the id, clear it in `close()` and on untick, and re-check the row before committing.

**B19. On a back-dated day, the Time row shows slot 0's time, but Track writes the slot's own time.**
- **Where:** `LogRowPanel.tsx:285` versus `logDraft.ts:105-117`.
- **What happens:** slot 1 shows "8:00 AM" and writes 20:00, and the picker starts from 08:00.
- **Proof:** `tests/home/logRowPanel.test.ts` "Time row ..." (expected '20:00', received '08:00').
- **Fix:** pass `slot` in and show `draftTime`'s answer.

**B20. On a back-dated day, the panel says "No container was in use that day" while linking the dose to one.**
- **Where:** `LogRowPanel.tsx:145, 316, 402-406`.
- **When:** that day's vial is now empty or archived, so it isn't in the open list.
- **Proof:** `tests/home/logRowPanel.test.ts` "back-dated day whose container has since run out".
- **Fix:** show the vial from `dateVialId` whether or not it is open.

**B21. The Site panel hides this morning's site of the same compound.**
- **Where:** `lib/home/logRows.ts:77` (`siteDaysBefore` excludes every slot of the compound that day).
- **What happens:** the evening dose's map shows this morning's site as unused.
- **Proof:** `tests/home/pure.test.ts` (expected `{sq-abdo-l:0}`, received `{}`).
- **Fix:** exclude only `slotKey(compoundId, slot)`.

**B22. Cycles Timeline says "Day 4 of 5" on a paused day, and again the next day.**
- **Where:** `lib/protocol/cycleTimeline.ts:101-112` (`nowWords` ignores a pause today). The lane draws today as a gap.
- **Proof:** `tests/home/pure.test.ts`.
- **Fix:** return "Paused" when `isPausedOn(pauses, todayKey)`.

**B23. A dose tracked in the first minute after midnight lands on yesterday at 00:00.**
- **Where:** `HomeScreen.tsx:366` (`todayKey` is re-read once a minute) with `logDraft.ts:115`.
- **What happens:** a spare started in that window gets yesterday as its start date.
- **Proof:** `tests/home/useLogRows.test.ts` "first minute after local midnight".
- **Fix:** read `toDateKey(new Date())` inside `track()`.

**B24. The "Reading the curve" guide can point a leader at the wrong label.**
- **Where:** `components/halflife/CurveGuide.tsx:44-48`. Both inset checks are true for any `left`, so the widest
  label is never handed back.
- **What happens:** Retatrutide at the preview's Now, at 312px wide: the Peak leader lands at x=228, inside
  "½ Last dose half gone" (184–312). The brief says "never overlapping".
- **Proof:** `tests/halflife/edges.test.ts` (transpiles the real `laneFit`).
- **Fix:** `inL = left <= 0 ? 0 : INSET`, `inR = left + w >= width - 0.5 ? 0 : INSET`, then
  `it.px >= left + inL && it.px <= left + w - inR`.

**B25. Natural Desiccated Thyroid's parts assume the compound is dosed in mg.**
- **Where:** `lib/compound-blends.ts:211-214` with `lib/halflife/compoundCurve.ts:182-188`.
- **What happens:** added in mcg (the Add sheet offers it), a 60000 mcg dose draws 38000 mcg of T4, not 38.
- **Proof:** `tests/halflife/edges.test.ts`.
- **Fix:** convert the dose to mg before `perDoseUnit`, and drop it if the conversion fails.

**B26. The formatters round across their own thresholds.**
- **Where:** `model.ts:528-539, 552-563`.
- **What happens:** `formatDuration(47.6)` gives "48h" (it should read 2 days), `formatHalfLife(0.995)` gives
  "60 min", and `formatAmount(99.96)` gives "100.0".
- **Proof:** `tests/halflife/edges.test.ts`, three tests.
- **Fix:** round first, then pick the unit or precision from the rounded value.

**B27. A Past run's Length disagrees with its own dates.**
- **Where:** `HalfLifeCompoundScreen.tsx:302` versus `:314`.
- **What happens:** 1 Sep 08:00 to 3 Sep 20:00 reads "1 Sep to 3 Sep" and "4 days".
- **Proof:** `tests/halflife/edges.test.ts`.
- **Fix:** count days between the two local date keys, plus 1.

**B28. Past runs split a one-week break only across the autumn clock change.**
- **Where:** `model.ts:239, 251, 255` (`gap > 168` epoch hours).
- **What happens:** that week is 169 h in Sydney (5 Apr) or Los Angeles (1 Nov), so it splits into 2 runs.
- **Proof:** `tests/halflife/dst.test.ts` under those two timezones.
- **Fix:** measure the week in local calendar days, or allow an hour's slack.

**B29. A later slot tracked without a time is placed in the future.**
- **Where:** `lib/halflife/compoundCurve.ts:79-83` (`takenAt`).
- **What happens:** today's 20:00 slot, tracked at 09:00 with no time, sits at 20:00. The figures don't move,
  the digits don't roll after Track, and a "taken" tick shows ahead of Now.
- **Proof:** `tests/halflife/edges.test.ts`.
- **Fix:** record the time at Track, or clamp an untimed log for today to Now.

**B30. "Clears in" stops too early for a tiny custom half-life taken orally or nasally.**
- **Where:** `model.ts:124` (the walk is capped at `60 × halfLifeH`, which ignores absorption).
- **What happens:** at 0.02 h, 9.8% is left when it says cleared. No catalogue compound is affected.
- **Proof:** `tests/halflife/edges.test.ts`.
- **Fix:** `60 * Math.max(halfLifeH, absHalfH(...))`.

**B31. Two quick tile taps leave the pressed tile and the panel out of step, and can leave the panel blank.**
- **Where:** `LogRowPanel.tsx:217-268`, and the same code at `HomeJournal.tsx:132-170`.
- **Sequence:** with Site open, tap Note, then Stock within 110ms.
  - The `[shown]` effect cancels every part animation, including the second fade-out. The second `Promise.all`
    rejects, `.catch(() => {})` swallows it, and `setShown(Stock)` never runs: Stock is pressed while Note shows.
  - Then tap Note: `setShown(Note)` changes nothing, the fill-forwards fade is never cancelled, and the panel
    stays blank.
- **Proof:** code path (read and confirmed).
- **Fix:** swap on a token and `setShown(next)` even on rejection.

**B32. Reopening a row within 520ms reuses its closing panel.**
- **Where:** `FlowRow.tsx:186, 251` (same key); the container pick runs only in the one-time read
  (`LogRowPanel.tsx:151-168`).
- **What happens:** for a compound holding only a spare, the panel says "No stock yet", and Track neither starts
  the spare nor links the dose. The old tile stays open.
- **Proof:** code path.
- **Fix:** add a per-open counter to the panel's key.

**B33. Scrubbing the week strip onto a finished day replays the "day finished" edge.**
- **Where:** `components/home/log/LogFlow.tsx:67-68, 96-113` (`wasFull` carries across days); `LogEdge` isn't keyed
  by day (`TodaysCycleCard.tsx:316`). Its own comment says "never on a load of a day that already was."
- **Proof:** code path (read and confirmed).
- **Fix:** key `LogEdge` by `dayKey`.

**B34. A failed Restart under Ended leaves the row invisible.**
- **Where:** `EndedCyclesScreen.tsx:35-43, 78-97`. The fill-forwards leave animation plays before
  `restartCycle`, and on `not-saved` the row stays at opacity 0.
- **Proof:** code path (read and confirmed).
- **Fix:** cancel the animation on failure.

**B35. The photo viewer has no Previous / Next for assistive tech (accessibility).**
- **Where:** `ProgressPhotoViewer.tsx:613, 711, 424-451, 591-595`. Other frames and the dots are `aria-hidden`, and
  moving is swipe or arrow keys only.
- **What happens:** VoiceOver and Switch Control users can't reach photos 2..N of a day.
- **Proof:** code path.
- **Fix:** Previous and Next buttons, hidden until focused.

**B36. Pop-up focus and the First Dose timer.**
- **Where:**
  - PopDialog on `<body>` has no Tab trap (only Escape, `PopDialog.tsx:104-115`) behind `aria-modal`.
  - `FirstDoseModal` never returns focus (`:104, 107-133`).
  - Its root (`:148`) lacks `pointer-events-auto`, so if a sheet is open when HomeScreen's 420ms timer fires
    (`HomeScreen.tsx:757`), Done and the scrim can't be tapped.
  - That timer isn't cleared, and `markCelebrated` (`:755`) runs first, so leaving Home within 420ms of the first
    dose loses the celebration for good.
- **Proof:** code path. The timer order I read and confirmed.
- **Fix:** trap Tab in PopDialog; return focus from FirstDoseModal; add `pointer-events-auto`; clear the timer on
  unmount, and mark it celebrated when the pop-up opens.

**B37. Protocol's Runs dry can read a day late if the screen stays open past midnight.**
- **Where:** `ProtocolScreen.tsx:222-282`. The days count is baked into state at fetch time. The effect doesn't
  depend on `todayKey`, which is recomputed each render (`:139, 179`).
- **What happens:** a PWA resumed the next morning without a dose sync shows "Tomorrow" when it is today, and the
  date form is a day late.
- **Proof:** code path.
- **Fix:** keep `dosesReady` in state and compute `runsDryInDays` in render, or add `todayKey` to the deps.

---

## SUSPECTED (not proven)

- **S1 (minor). A cycle "deleted for good" can come back after a sync.** The hidden list is keyed
  `compoundId|runStart` (`lib/home/endedCycleActions.ts:81`, `lib/protocol/endedCycles.ts:68`). Hydration re-keys
  a compound to its Postgres id (`lib/home/hydrateProtocol.ts:84-85, 181-190, 418-430`) for logs and stacks, but not
  for this list. Fix: remap the hidden keys with `idRemap`.
- **S2 (minor). CurveGuide hides a label with `display = "none"` and never resets it** (`CurveGuide.tsx:125-127,
  178-180`). The layout re-runs every minute, a hidden label measures w=0 and "fits", and a leader is drawn to it.
  Masked today by B24. Fix: reset `display` at the start of each layout.
- **S3 (minor). The + button ignores clicks with `e.detail !== 0` and no pointerdown**
  (`QuickActionsFab.tsx:300-301`). Some assistive-tech activations may send those. Low confidence.
- **S4 (minor). Twin CloseArrow / FoldArrow buttons stay in the accessibility tree** (`CloseArrow.tsx:51`,
  `FlowRow.tsx:58-79`). They are hidden only by opacity and `tabIndex=-1`, so screen readers hear duplicates.
- **S5 (minor). A spare's water can be set through Correct without starting it.** Editing an unmixed spare with a
  water figure (`AddStockSheet.tsx:474-477` treats it as mixed only if `bacWaterMl` is null) stores water with
  `acquired_on` NULL. 026 allows it, and it still offers "Mix one", which overwrites the water.
- **S6 (minor). Mix writes twice without a transaction** (`MixVialSheet.tsx:185-198`). If the powder update lands
  and the mix fails, the powder is changed and the vial is still dry. Undo's powder restore is best-effort (`:352-354`).
- **S7 (judgement). Back-dated doses judge "something left" by today's level** (`protocolSync.ts:752-786`, rule 1),
  so a back-dated dose can link to a newer vial when the older one has run out since.
- **S8 (minor). A journal photo upload still in flight when the date changes or the card closes** is added to
  `pending` afterwards and can attach to the wrong day (`HomeJournal.tsx`).
- **S9 (minor). Half tablets.** The pad refuses decimals for tab, capsule and drop, but `draw.ts` treats a
  half tablet as real, so a 0.5-tab plan steps 0.5 → 1.5.
- **S10 (minor). The Consistency card reads "Starts with your first dose"** to a user with history once every
  compound is archived (`computeAdherence` returns `[]`).
- **S11 (minor, older). The dose panel filters stock by the device compound id**, so a compound whose Postgres id
  differs shows "No stock yet". The deleted `LogDoseSheet` did the same.
- **S12 (minor). Discard and its Undo are ungated** (`setStockArchived`), by the stated policy in
  `lib/billing/gate.ts:345-353`. The Undo is un-archiving, which re-activates stock for a read-only account. It is
  harmless, but it is a write the policy does not name.

## Older bugs already on `main` (not from this branch)

- **The sites card treats two days as one across London's March clock change.** `lib/home/siteRecency.ts:50, 54`
  divides a local midnight by a whole day, so in Europe/London 29 and 30 March count as the same day. Home's sites
  card says "today" for yesterday's site, and now disagrees with the new Site panel, which is right.
  Proof: `tests/home/siteRecencyLondon.test.ts` with `TZ=Europe/London`.
- **Progress uses the server's (UTC) date.** `app/(app)/progress/page.tsx:136` passes it down, and
  `JournalSection.tsx:60, 133-134` and `AddProgressPhotoSheet.tsx:101` use it as is. Before about 10am in
  Sydney, new entries and photos default to yesterday. Found by reading, not tested.

## Checked and clean

- **Stacks:** `restoreStack` restores the stack exactly and refuses on "member-taken" and "exists". The delete and
  its Undo can't race: Next dispatches server actions one at a time (`next/dist/docs/.../07-mutating-data.md:206`),
  and both go through `trackCriticalSync`. Only one delete path exists (`StacksScreen.tsx:110`).
- **Mix and Undo:**
  - `mixStockItem`, `openStockItem` and `unmixStockItem` are gated, validate `dateKey`, and touch only a spare
    (`acquired_on IS NULL`) or a mix made that day.
  - `unmix` refuses once any dose is logged against the vial.
  - A spare is never picked by the server's vial-on-a-date rule.
  - The pre-026 fallback in `AddStockSheet` (`:776-785`) turns into "Mix one now" and works against the live
    schema. A spare oral or oil added pre-026 is kept out of `dosesReady` by `compoundsFromItems`.
- **Ended cycles:**
  - End, Restart and each Undo round-trip across days: one version today, and the same Ended row back.
  - A finished cycle restarts fresh.
  - Hidden-list snapshots are stable.
- **The read-only gate:** `gate:check` is clean. Every new server write is gated (mix, open, unmix), and
  `readJournalForHome` checks auth, takes no input and never writes. On Home, the tick, Track and
  `handleTracked` are guarded, and the stack-untick Undo goes through the guarded `handleTracked`.
- **Toasts:** one at a time, and an Undo is dropped when its toast is replaced.
- **026's view:** `v_inventory_math` is replaced with the same columns in the same order, and `is_started` is
  appended. Existing rows pass the widened CHECK. The composite foreign key is ownership-safe.
- **Other stock and route checks:**
  - `half_life_estimated` is never read from the database (the app reads the TS catalogue).
  - Every `/preview/*` route is `notFound()` in production.
  - The new routes await `params` (Next 16).
  - The Schedule card has nothing interactive nested inside its link.
- **The half-life model:** every catalogue half-life on both routes, no doses, one dose, Now exactly at a dose,
  1000 days on, a stopped compound, out-of-order and duplicate doses, Vitamin D3 (no curve), the blend split,
  `rangeBand` at Now and ±6 days, `formatPeakIn` thresholds, and local date keys at midnight and on DST days
  (`tests/halflife/clean.test.ts`). No `toISOString` date keys in the slice.
- **React:**
  - Every `useSyncExternalStore` snapshot is cached or primitive, and the server snapshots can't cause a
    hydration mismatch (the output is gated on the skeleton).
  - setState-in-render uses are the sanctioned pattern and settle.
  - Refs are only written in effects or handlers.
  - Timers, listeners, rAF and pointer capture are cleaned up.
  - Keys are stable.
  - Escape in a PopDialog inside a sheet closes only the pop-up.
  - The + fan has keyboard and tap alternatives.
- **Home dates and helpers:**
  - `lib/format/date.ts` and `dose.ts` never go through UTC (Sydney, Los Angeles, London).
  - `pauseUndo`, `cycleTimeline` and `cyclePage` are fine at the 60-day switch and at cycle edges.
  - `recencyRamp` is fine at 0, 1, NaN and out of range; the syringe fill at 0, NaN and over capacity.
  - `stepFor` is fine for tab, capsule, drop, mcg and iu.
  - `markerPick` and the photo tiles are fine.
