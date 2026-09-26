# Cold review: functionality

Reviewer lens: does every flow in `Context/build-brief-final.md` work on the real app, in both engines, at both
phone sizes. Branch `design/half-life-motion`, tip `1f77303`. Reviewed 26 Sep 2026 (Saturday, Australia/Sydney).

## Read this first: what this review could and could not run

- **Chromium only, mostly 390x844.** The WebKit pass never happened, and 375x548 was only checked on the signed-out
  previews. The session's permission classifier stopped the run part-way: first it refused to restart a dev server,
  then it refused anything touching the live database (the burner lives there), and finally it refused every
  browser run, previews included. Nothing below was seen in WebKit.
- **Server.** My own `hl-serve.cjs` on 3217 served false 404s for every nested Protocol route (`/protocol/stacks`,
  `/protocol/cycles`, `/protocol/half-life`, `/protocol/schedule`, `/preview/protocol/*`). The route files are
  committed and fine; it is the worktree's stale Turbopack cache (`.next/dev/cache/turbopack`, see memory
  "repo-is-on-icloud"). I stopped my server and, with the design reviewer's agreement, used theirs on
  `localhost:3218`, an off-iCloud copy of the same commit with no changes. **Do not log those 404s as a bug.**
  Before the next server run from the worktree, move that cache directory aside.
- **First run was not tested.** The burner has history, so the bubble, the "First Dose Logged" pop-up and the hidden
  + cannot show there, and making a new account was out of bounds.
- **Burner data I changed and could not put back** (the classifier stopped me mid-cleanup):
  1. BPC-157's OLDER open vial (5 doses left) is **discarded**. The Undo window (about 3s) lapsed between two of my
     calls. The sheet now reads "Current vial · 20 doses left", runs dry 17 Oct.
  2. **Ipamorelin's cycle is running again** (5 on / 2 off, restarted at about 10:15). At the start it was ended
     today and listed under Ended. To restore it: Protocol > Cycles > Paused > Ipamorelin > End > End cycle.
  3. BPC-157's dose today was unticked and re-logged twice; it is logged now, with no site and no note.
  4. The Morning stack was deleted and restored with Undo (checked after a reload). A BPC-157 cycle was added and
     ended the same day; it left nothing behind.
- One read-only SQL `select` on the burner's `protocol_compound_schedules` rows (evidence for F2). Nothing else
  touched the database except what the app wrote while I used it.

## Summary

The core loop holds up well. Logging from the row, the panels, Track, Unticked with Undo, the half-life rail with its
key and rolling digits, stacks, cycles, ended cycles, the + fan, Schedule, the half-life pages and the photo viewer
all did what the brief says in Chromium at 390x844. Every Undo I tried restored the state.

Two findings matter most:
- **F1:** the Protocol sheet and Home disagree about the same vial. The sheet labels the compound's total "Current
  vial".
- **F2:** Restarting a cycle can leave the compound and its schedule trail disagreeing. The Cycles page then shows it
  running while Ended still lists it, and the server holds both states.

The rest are minor or polish. The biggest gap is **coverage**: WebKit, reduced motion, first run, the syringe and
several Progress states still need a run (see the end of this file).

## Findings

### F1: major. The Protocol sheet's "Current vial" count is the whole compound's stock, and Home says otherwise
- **Screen and state:** Protocol, BPC-157's sheet, with two open vials (one with 5 doses left, one mixed later with
  about 19). Chromium 390x844, real app, burner.
- **Steps:** Home, expand Morning, tap BPC-157's circle, tap Stock: "Current vial · 5 doses left". Then Protocol,
  tap the BPC-157 card: "Current vial · 24 doses left" and "+1".
- **Brief §3.7:** "Stock: the vial in use as one line ("Current vial · 7 doses left"), "+2 vials"". The sheet's line
  is the total across both open vials, labelled as the one in use. The sample user already tripped on it ("24 doses
  left" against "runs dry in 5 days").
- **Cause:** `components/protocol/ProtocolScreen.tsx:263-265` overwrites the in-use container's `dosesRemaining`
  with `held.dosesReady` (every open container). `components/home/CompoundDetailSheet.tsx:359` then prints that
  under "Current vial".
- **Fix:** keep the in-use container's own `dosesRemaining` for the sheet line, and use `dosesReady` only for the
  runway (`daysToEmpty`). If the total is wanted, label it as the total ("24 doses in 2 vials").

### F2: major. Restart can leave a compound "on a cycle" and "ended" at the same time
- **Screen and state:** Protocol > Cycles > Ended, Ipamorelin (paused on Home until 10 Oct), cycle ended earlier the
  same day. Chromium 390x844, real app.
- **Steps (1 of 2 attempts):** Ended, tap Ipamorelin, Restart, then Undo (it worked). Tap Restart again. About 4s
  later load `/protocol/cycles` (a full page load). The Cycles page shows Ipamorelin under Paused with "5 days on,
  2 off", the Timeline draws it, and **Ended still lists it**. A reload changes nothing. The device store has
  `cycle` set, but today's schedule version has no cycle (`2026-08-21 cyc, 2026-09-26`). On the server,
  `protocol_compounds` carries the cycle (updated at the Restart) while the 2026-09-26 `protocol_compound_schedules`
  row still has `cycle_*` null.
- **Second attempt,** waiting 9s before reloading: both agreed. Right after tapping Restart the store had **not**
  changed yet: it was unchanged at 1s and changed by 9s. So the write lands late, and a load in that window loses
  half of it.
- **Brief §3.10:** "Restart re-applies the cycle"; `lib/protocol/endedCycles.ts` promises that "a compound currently
  on a cycle has no Ended row at all, so Restart can never be offered over a cycle that is running". Both break.
  The trail is also what decides whether a dose is due, so Home and Cycles can disagree about the compound.
- **Where I believe it is:** the compound row and its schedule version sync separately, and `hydrateProtocol` merges
  pulled versions with "Postgres winning per day" (`lib/home/protocolSync.ts`, comment around 1369-1371). If the
  version push has not landed when the page reloads, the server's older same-day version replaces the local one
  while `cycle` survives. Related: `restartCycle` (`lib/home/endedCycleActions.ts`) writes only after a delay.
- **Fix:** write the cycle row and its version together, in one server call, or push the version first. Do not let
  hydration replace a same-day local version whose push is still pending. Make the Restart write synchronous with
  the tap. Add a test for Restart, reload, hydrate, then both fields agree. The bugs review should own the root cause.

### F3: minor. A cycle begun and ended on the same day never reaches Ended, though the dialog says it will
- **Steps:** Cycles, +, pick BPC-157, On / off, Save, tap the row, End, End cycle. Ended's count stays the same, and
  the cycle is gone. Chromium 390x844, real app.
- **Brief §3.10:** "End ... The compound keeps running (today's Remove). The cycle moves to Ended." The dialog
  itself says "you can restart it from Ended."
- **Cause:** `recordScheduleVersion` replaces a same-day version (`lib/home/stack.ts:463-466`), so End on the day
  the cycle started erases the only version that carried it, and `endedCycles` has no run to derive.
- **Fix:** when End replaces the version that began the run, keep the rule on the ending version (for example an
  `endedRule` field) so `endedCycles` derives a one-day run. Or, in that one case, change the dialog line so it does
  not promise Ended. Already noted by the sample user; still open.

### F4: minor. The + "Journal" leaves Home and opens a different journal
- **Steps:** Home, tap + (or press-slide-lift) onto Journal. The app routes to `/progress` and opens a "Journal"
  sheet ("Write a note" / "Log markers" / "No entries yet."). Home's own in-place journal (Markers / Photos / Date
  tiles) is not opened. Chromium 390x844.
- **Brief §3.5:** "Journal opens in place on Home"; §0: "nothing shown twice in two places."
- **Cause:** `components/shortcuts/QuickActionsFab.tsx:149-152` (`requestProgressAction("journal-compose")` then
  `router.push("/progress")`).
- **Fix:** on the Dashboard, scroll to `HomeJournal` and open it (an event it listens to). From other tabs, go to the
  Dashboard and do the same. Retire the Progress compose sheet, or make it the same component.

### F5: minor. "Sub-Q" wraps onto two lines in Home's Injection Sites switch
- **Screen:** Home, Injection Sites card, at 390x844 in Chromium. The switch reads "Sub-" over "Q" (button 45x43).
- **Brief §3.4:** "Home card: as it is, switch labels IM / Sub-Q."
- **Cause:** `SEGMENTED_ITEM` is `flex-1` (`lib/ui-presets.ts:231-232`) inside a shrink-to-fit `inline-flex` group
  (`components/home/InjectionSitesGlanceCard.tsx:81-94`), so the item shrinks to min-content and breaks at the
  hyphen.
- **Fix:** add `whitespace-nowrap` to these items (or to `SEGMENTED_ITEM`). Check the 375 width too.

### F6: minor. The curve guide's "Peak" label has no leader, and two leaders run into the ½ label
- **Screen:** `/preview/protocol/half-life/pv-test-e`, "?" > "Reading the curve", Chromium 390x844.
- **Measured (CSS px):** the Peak dot is at x=275, the ½ line at x=278. Both leaders drop to y=476, inside the
  "½ Last dose half gone" label (x 227-346). The "Peak" label sits at x 185-221, with no line reaching it. The labels
  don't overlap, but the reader can't tell which mark is the peak.
- **Brief §3.11:** "the chart with straight vertical leaders to labels along the top and bottom, never overlapping."
- **Cause:** `components/halflife/CurveGuide.tsx` lane fit (`laneFit`, 41-72, and the lane passes at 133-159). Both
  labels ended up on the same bottom lane, which `holds()` should have refused. Possibly the layout ran before the
  pop-up finished scaling in and never re-ran.
- **Fix:** when two marks are closer than a label's width, send one to the other row or lane. Re-run the layout after
  the scale-in (or on resize). Add a unit case with `peakAtH ≈ halfAtH`.

### F7: minor. Tapping a side card on the half-life rail jumps it to the centre in one frame
- **Recorded per frame** (Chromium 390x844, real app, BPC-157 as the side card): card x 310 at 40ms, x 65 on the next
  sampled frame (399ms, after the click latency), then the 460ms grow. The 245px sideways move is instant.
- **Brief §3.3:** "Tapping ANY card (centre or side) centres it and opens it: the card grows to full width (460ms,
  the rail held on it every frame)."
- **Cause:** `components/halflife/HalfLifeGlance.tsx:107-124`: `pin()` sets `scrollLeft = centreLeft(card)` from the
  very first frame, called from `tap()` at 143-145.
- **Fix:** inside `pin()`, ease the scroll offset from where it was to the centred one over the grow, instead of
  writing the final value on frame one.

### F8: minor. The Cycles hint can be marked "seen" without ever being shown
- **Steps:** with one type of cycle, Cycles opens that type by itself and draws no hint (it needs 2+ groups). Tap a
  row. Later, with two groups (for example a Paused one), "Tap a type to see its cycles." never appears. The device
  flag `trakabl.cycles.hintSeen.v1.<uid>` was already `1` before the hint had rendered once on this device.
- **Brief §3.10:** "on a first visit, "Tap a type to see its cycles." It goes after the first tap and stays gone.
  All types start folded." The build also auto-opens a single type (the builder's choice; worth Adrian's eye).
- **Cause:** `components/protocol/pages/CyclesScreen.tsx:155-157`: `dropHint()` writes the flag even when the hint
  is not on screen (called from the row tap at 257-260).
- **Fix:** mark it seen only when `hintRef.current` exists (the hint was drawn).

### F9: minor. The paused cycle row is not dimmed
- **Screen:** Cycles, Paused group open, Ipamorelin. The name is full white, and only the small container is at 45%.
- **Brief §3.10:** "When a cycle's compound is paused, its row dims to 45%."
- **Cause and fix:** `components/protocol/pages/CyclesScreen.tsx:386` puts `opacity-45` on the container only. Put it
  on the row's content. The slide-into-Paused animation is not built (the builder's note: nothing on this page can
  pause), so it can never play. That needs Adrian's ruling, not a fix.

### F10: minor. Empty Stacks and empty Cycles are one grey line, not a setup card
- **Screens:** Stacks after deleting the only stack: "No stacks yet." Cycles with none running: "No cycles running."
- **Brief §3.1:** "Every other empty page shows its own setup card (settled in round one)."
- **Where:** `components/protocol/pages/StacksScreen.tsx:142-145`, `components/protocol/pages/CyclesScreen.tsx:212-215`.
- **Fix:** give each its round-one setup card, whose action is the page's own "+".

### F11: polish. The Markers tile says "None" while three unrated markers sit below it
- **Steps:** Home, Journal, Markers, tick Energy, Libido, Acne, "Add 3". The tile reads "Markers / None" with three
  "Not rated" rows below. After rating one it reads "1 noted".
- **Intended:** `components/home/HomeJournal.tsx:241` would say "Not rated". Cause not traced: `commit()` in
  `components/progress/MarkerDialer.tsx:411-416` looks right, so the Add N path may not call it until a rating.

### F12: polish. The + keeps a visible focus ring after a touch
- After press-slide-lift, the + shows an amber focus ring. `close()` puts focus back on it
  (`components/shortcuts/QuickActionsFab.tsx:81-84`) whatever opened the fan. Restore focus only when the fan was
  opened from the keyboard.

### F13: polish. Body-map regions still announce the spaced dash
- The regions' accessible names are "Side Abdomen – Left", "Outer Thigh – Lower Right". The visible names are
  fixed. **Brief §3.4:** "Site names without the spaced dash ("Side Abdomen, Left")." Run the region `aria-label`s
  through the same formatter the visible names use (source file not traced).

### F14: polish. Small copy slips
- The Protocol sheet's "Next: Sat 26 Sep, Sun 27 Sep, Mon 28 Sep" lists today although today's dose is logged.
- The Mix sheet reads "Draw 40 units for 2  mg": there is a double gap before the unit.
- The sheet shows "+1" where the brief writes "+2 vials" (§3.7). The card outside says "+1 vial".
- Home's Injection Sites "Last logged" lists a dose with no site as its first entry ("No site / BPC-157 / today").

## Observations, not findings
- Once, tapping the Stacks tile went to `/protocol/stacks` and a few seconds later was back on `/protocol`. It did not
  happen again in a traced retry; probably first-compile churn on the dev server.
- On a fresh browser the Stacks page stayed blank (no skeleton) for about 6 to 14s before the stack appeared.
  Probably dev compile; worth a look on a production build.
- The Protocol Schedule card lists compounds deleted this week ("+4 more", 8 rows for a 3-compound user). It is true
  history, but noisy.
- Already known from the sample user and still true: "0.00 mg Circulating" for Testosterone Cypionate before any
  dose, and "100% of last dose left" with Circulating unchanged right after a log.
- Before 026, the live database cannot hold a dry spare, so "Mix one" never appears on the real app. The preview
  shows the sheet but cannot complete a mix. Mix and its Undo are unverified end to end.

## Checked and working (Chromium 390x844 unless noted)
- **Dose row (§3.2):** due circles white. First tap opens the panel, the second logs it. A logged circle unticks,
  with the "Unticked" toast and Undo; Undo restores the dose, and the toast is gone by 3.5s. The Track bar rises
  with the dose and site ("Track 250 mcg · Side Abdomen L") and drops after Track. Recorded per frame: `scrollY`
  does not move on Track. The + hides while a row is open. Once every due dose was logged, the Log card's edge was
  amber all round, and it went back when a dose was unticked (screenshots; the E4 timing and the settle to
  `--bg-surface-done` were not recorded).
- **Panels:** one header row each. Site: Front/Back and the arrow; it closes itself after a pick. Stock: the vial
  row only, no arrow, and a tap on the row closes it. The same tile closes its panel. Note: "Add a Note", the arrow,
  "Anything to remember?"; the note survives closing and the tile reads "Added". Switching cross-fades (recorded:
  old header out in about 100ms, new in about 200ms). Opening Site under the Track bar eased the page up.
- **Half-life rail (§3.3):** type rail; closed cards with a down chevron. A side card opens to full width with its
  graph (grow recorded at about 460ms; see F7 for the jump). Swiping while open switched to Ipamorelin (touch). The
  up arrow closes. The key pop-up "Reading the graph" matches the brief word for word; Escape closes it with no
  scroll. Digits roll on a log (three roll columns for about 900ms, recorded) with no scroll.
- **Sites sheet (§3.4):** "Intramuscular" / "Subcutaneous"; day chips with leaders; the freshest chip ("Today")
  amber; the mirrored-front note.
- **Journal (§3.5):** opens in place with nothing open. Markers: ticked chips turn white and the picker stays open;
  "Add 3" adds three rows; a touch-drag across the steps reaches the fifth ("Wired"); "Add more markers",
  "Search 31 markers" and "Create your own" are present. "Use my last" did not show (the burner has no earlier
  markers).
- **The + (§3.6):** four rounded squares on the arc (Weight, Journal, Add compound, Add stock). Tap, then tap, opens
  (Weight pad; Add stock with its compound picker). Press-slide-lift lights the item under the finger and opens it.
  The + turns into ×.
- **Add stock (§3.12):** only the fields the container needs, empty fields showing their unit. Add with an empty
  field opens the pad on it and saves nothing (the shake was not measured).
- **Protocol (§3.7):** type rail, compound cards (container, "+1 vial", runs-dry date, dotted "Add stock"), the Add
  card. The sheet: header, the long card (curve mark, "4h est.", "250 mcg", "Sub-Q"), Started / Schedule, Next,
  Stock, ⋯ with Correct and Discard, Add stock, Edit dose & schedule. Delete asks ("Delete BPC-157?"; cancelled).
  Discard asks ("Discard this vial?"), then "Discarded" with Undo; Undo restored it on the first try. Correct opens
  Edit stock.
- **Schedule:** the card opens `/protocol/schedule`; back through weeks; Next is disabled on this week; legend shown.
- **Stacks (§3.9):** the "?" copy is exact; "+" is New stack; a card opens to its members with Edit and Delete.
  Delete asks with the brief's copy ("BPC-157 keeps running."), then "Morning deleted" with Undo; Undo restores it,
  and it survives a reload.
- **Cycles (§3.10):** the "?" copy is exact. "+" lists compounds, and Add cycle saves. Rows show name, pattern and a
  28-day strip, and open to Edit and End. The End dialog copy is exact; "Cycle ended. BPC-157 carries on." with Undo
  works. Timeline with 1M / 3M / 1Y / All and the Today line. Paused sits last. Ended: name, pattern, date. Restart
  toast "Restarted. Ipamorelin is back on its cycle." with Undo works. Delete for good asks with the brief's copy,
  then "Cycle deleted" with Undo; Undo works. `?n=50` preview: the hint shows and all types are folded.
- **Half-life pages (§3.11, preview):** the list is grouped by type with Blends; the "?" copy is exact. The compound
  page: In you now and Next dose, the shaded band, Level / Next peak in / Half-life, the "Usually peaks …" line,
  and Past runs opening in place. The guide's labels never overlap (see F6 for the leaders).
- **Progress viewer (§3.15, preview `?photos=more`):** two tiles and "+3". The viewer grows from its tile (about
  400ms, recorded). Date and weight at the top beside ×, dots at the bottom. Swipe goes to "Photo 2 of 5"; a tap
  hides and shows the controls. Ctrl+wheel zoom springs back (recorded, with overshoot). Swipe down closes; a tap on
  the dark closes.
- **Mix sheet (§3.12, preview):** starts dry and fills once both amounts are in. "Add the powder and water to see
  the draw" shows first, water starts at 2 mL, and "Draw 40 units for 2 mg" (10 mg in 2 mL, 2 mg dose) is right.
- **No page scrolls sideways at 375x548** on all ten previews (Chromium): home, protocol, stacks, cycles,
  cycles?n=50, ended, half-life, a compound's half-life, progress, containers.

## Not covered: the next run must do these
- **All of WebKit,** at both sizes (headless WebKit needs `delete window.PushManager` in an init script).
- **375x548 on the real app** (dose row, panels, Track bar, the +, sheets).
- **Reduced motion** (§3.16): the fan, folds, pop-ups, the rail, digits, the tick.
- **First run** (§3.1): the bubble and its looping preview, the + hidden until the first log, the "First Dose Logged"
  pop-up and its timings. It needs a fresh account, or a preview state with no logs.
- **Progress:** the Running fold (§3.15), the new account (`?fresh=1`: "Your first photos", "None yet",
  "Starts with your first dose"), pinch in Safari (`gesturestart`), adding a photo with a pose.
- **The calculator's syringe (§3.13)** and **the containers (§3.14):** not looked at.
- **Mix one and its Undo** end to end (needs 026, or a dry spare in a test database).
- **Other gaps:** Add compound (real flow), "Use my last", "Create your own" markers with Edit (× and Undo), Pause and
  Skip from Home with their toasts, Edit dose & schedule, "Add N" arrival timing (60ms apart, 320ms each), and the
  Timeline at 2 and 12 cycles.
- **A fix for F2 needs a reload test** in both engines.
