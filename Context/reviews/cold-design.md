# Cold review: design and simplicity

Reviewed 26 Sep 2026 on `design/half-life-motion` at `1f77303`, with no uncommitted changes. The lens is fidelity
to `Context/build-brief-final.md`, the ui-context FINAL DESIGN DECISIONS, and the final-check reference
(`~/trakabl-mockups/final-check/r6/`, round three `*8.js`, `round4.js`, `sections9.js`, and the answers in
`answers/final*/answers.json`). It also covers motion, accessibility and simplicity. Nothing in the code was changed.

**Screenshots:** `~/trakabl-mockups/final-check/shots/cold-design/`. File names are `<engine><width>-<screen>.jpg`:
`c390` is Chromium 390x844, `w375` is WebKit 375x548, and `-rm` means reduced motion.

**How it was run:** the dev previews were opened signed out in fresh contexts, in Chromium and WebKit at 390x844
and 375x548. Motion was recorded per frame with an in-page requestAnimationFrame recorder. Words and actions were
counted in the page, excluding hidden (`inert`) content.

**Server note (not a code finding):** the shared server on `localhost:3217` returned 404 for every nested
Protocol route, including `/protocol/stacks`, `/protocol/half-life`, `/protocol/cycles/ended` and their
`/preview/…` twins. A fresh server started from an off-iCloud copy of the same commit served them normally, so
the 3217 server had a stale Turbopack route cache. This review ran on that fresh server (`localhost:3218`).

## Summary

The build is faithful to the reference on most screens. The look is right everywhere I checked: Plex, the deeper
black, Instrument surfaces, rounded rectangles, and no inner corner rounder than its card. The public site keeps
Geist and its shipped tokens, while its 13 app previews take Plex and the new surfaces. Copy matches the brief
almost word for word: the explainers, the confirms, "Reading the graph", Add stock, Mix, and End and Delete for a
cycle.

The biggest problems:
1. The first-run bubble tells a new user the wrong thing.
2. Every bottom sheet still slides when reduced motion is on.
3. The half-life guide points "Peak" at nothing.
4. The main action on Home, the tick circle, is a 24px target.
5. Past four cycles, the Cycles page lists the types twice with different counts.

| Screen | Words / actions (390) | Simplicity | One line |
|---|---|---|---|
| First run: bubble and "First Dose Logged" | n/a (code) | 6 | The pop-up's timings match the brief exactly; the bubble's one instruction is wrong (D1) |
| Home: Today's Log and the dose row | 158 / 49 | 7 | Panels are clean, one header row each; tick too small (D4); stack name and count shown twice (D11); header stack (D20) |
| Home: half-life rail and open card | in Home | 8 | Chevron, growth, black "?" strip, ½ line and key pop-up as specified |
| Home: Injection sites card | in Home | 7 | "Sub-Q" breaks onto two lines (D7) |
| The + fan | 4 items | 8 | 132px arc and spring as specified; labels float over content (D27) |
| Protocol | 201 / 26 | 7 | Names cut off (D10); small "Add stock" target (D8) |
| Compound sheet | ~50 / 8 | 7 | "+4" with no noun, and three "Next" dates (D13) |
| Add stock | ~30 / 6 | 9 | As briefed |
| Mix a vial | ~25 / 5 | 8 | Asks for water that is already filled in (D17) |
| Schedule page | 187 / 9 | 7 | Missed and nothing-due squares look the same (D19) |
| Stacks | 13 / 10 | 7 | Two white "+" buttons with different jobs (D5) |
| Cycles, 2 cycles | 42 / 18 | 8 | Hint, folds and End confirm as briefed |
| Cycles, 12 or 50 cycles | 52 / 26 | 5 | Types listed twice, counts disagree (D6) |
| Ended | 25 / 9 | 9 | As briefed |
| Half-life list | 31 / 14 | 8 | A flat line for "No doses yet" (D28) |
| Half-life compound page | 49 / 9 | 8 | Leads with In you now and Next dose; band replaces fill |
| "Reading the curve" guide | ~20 / 1 | 5 | Peak label orphaned (D3) |
| Explainers (What is a stack / cycle / half-life?) | ~40 | 9 | Words exactly as briefed, picture, Got it |
| Confirms (Delete stack, End cycle, Delete cycle) | ~20 | 9 | One question, one line, Cancel and red action |
| Progress | 68 / 20 | 7 | Photo labels differ between card and viewer (D18) |
| Progress, new account | 42 / 10 | 8 | The Block card breaks the "None yet +" pattern (D29) |
| Photo viewer | 16 / 2 | 9 | Grows from its tile; date and weight at top, dots at bottom, 93% black |
| Calculator | 131 / 18 | 7 | Syringe drawn small and left-heavy (D21); "—" for empty values (D23) |
| Onboarding start, sign-in | 34 / 6 | 9 | New look applied |
| Public site | as shipped | n/a | Only the app previews changed, as asked |

## Findings

### D1 · major · First run, Home, the first due row with the bubble
- **Wrong:** the bubble says "Tap the circle to log it." (`components/home/FirstRunBubble.tsx:18`). On this
  build, the first tap on a due circle OPENS the row, and only the second tap logs it. The circle's label is
  "Open …", then "Log …" (`components/home/log/FlowRow.tsx:212`), as brief §3.2 says: "First tap on a row's circle
  opens its panel; the second logs it".
- **Why it matters:** the bubble goes away on that first tap (`onAnyTick` in `HomeScreen.tsx`). The new user is
  left looking at an open panel their one instruction didn't mention.
- **Change:** make the copy true, and loop the preview as two taps: "Tap the circle twice to log it." The bubble's
  wording is the builder's (brief §3.1: "Wording is mine"), so changing it overrides no decision of Adrian's. Adrian
  rejected "Tap it, then track." Alternative: during first run only, let the first tap on the bubbled circle log
  directly.

### D2 · major · Every bottom sheet, with reduced motion on
- **Seen on:** the compound sheet (trace below). Every sheet uses the same component.
- **Wrong:** with `prefers-reduced-motion: reduce`, the sheet still slides up from 585px to 0 over about 450ms
  (per-frame trace: ty585 → 414 → 197 → 68 → 14 → 0). Brief §3.16: "Reduced motion: slides and springs become
  short fades".
- **Cause:** `components/ui/sheet.tsx:101-109` uses `slide-in-from-bottom` / `slide-out-to-bottom` with no reduced
  variant. The reduced-motion block in `globals.css` covers `.animate-sheet-rise`, which the Radix sheet doesn't
  use.
- **Change:** under reduced motion, drop the slide and keep a 160ms fade, for example
  `motion-reduce:data-[state=open]:slide-in-from-bottom-0`, plus the same for closing, or a rule in the reduced
  block. The + fan (a fade in place), the pop-ups and the first-dose pop-up are already correct.

### D3 · major · Half-life compound page, "Reading the curve" (Testosterone Enanthate)
- **Screenshots:** `c390-hl-guide-zoom.jpg`, `w375-hl-guide-zoom.jpg`. Same in both engines and both sizes.
- **Wrong:** the "Peak" chip has no leader under it. Two leaders, the peak's and the ½ line's, run 4px apart
  into the "½ Last dose half gone" chip. Brief §3.11: "straight vertical leaders to labels along the top and
  bottom, never overlapping". A reader will take the peak dot for the ½ mark.
- **Where:** `components/halflife/CurveGuide.tsx:41-75` (`laneFit`) and `:133-160` (lane hand-off). The laid-out
  "Peak" chip (x 185 to 221) does not contain its leader x (about 250).
- **Change:** after layout, assert that every shown chip contains its own leader x. When two marks sit within a
  chip's width, send one to the other side; the top lane has room (Likely range, Now, Ahead). Add a unit test on
  this Test E case.

### D4 · major · Home, Today's Log, the tick circle
- **Screenshot:** `c390-home.jpg`.
- **Wrong:** the circle that opens, logs and unlogs a dose is 24x24 with no larger hit area
  (`FlowRow.tsx:215`: `h-6 w-6`, no `::before` inset). Nested rows and the stack child are 19 to 24px. It is the
  most-pressed control in the app, and the brief's bar is 44px.
- **Change:** keep the 24px drawing and add a transparent hit area of at least 44x44, for example
  `before:absolute before:-inset-2.5`, so it doesn't overlap the name button.

### D5 · minor · Stacks and Cycles pages, two white "+" buttons (Adrian's call)
- **Screenshots:** `c390-stacks-s0.jpg`, `c390-cycles-s0.jpg`.
- **Wrong:** the page's "+" at top right (New stack or New cycle) and the floating "+" at bottom right (quick
  actions) are both white, and mean different things. That breaks "one obvious action per screen".
- **Note:** this matches the reference, where the Protocol phone carries the floating "+" on its pages too. So
  it's a question, not a build miss.
- **Change:** hide the floating "+" on pushed Protocol pages (Stacks, Cycles, Ended, Half-life, Schedule), as it
  already hides under sheets. Ask Adrian first.

### D6 · major · Cycles, more than four cycles (`?n=12`, `?n=50`)
- **Screenshots:** `c390-cycles12-s1.jpg`, `c390-cycles-paused.jpg`.
- **Wrong:** the list card names the types with counts, and the grouped Timeline under it names them again with
  different counts. At 12 cycles the Timeline has an "Orals 1" lane the list doesn't have, because its one oral is
  paused. At 50: list "Anabolics 6", "Peptides 15", Paused 5; Timeline "Anabolics 7", "Peptides 16". The Timeline
  counts paused cycles in their type; the list moves them to Paused. The brief: "nothing shown twice in two
  places".
- **Where:** `components/protocol/CyclesTimeline.tsx:70-81` (`grouped = cycles.length > LANES_MAX`).
- **Change:** in grouped mode, drop the names and counts from the lanes. The type colour and bar are enough under
  a list that already names them. At minimum, count paused the same way the list does.

### D7 · minor · Home, Injection sites card, route switch
- **Screenshots:** `c390-home-full.jpg`, `c390-hl-open.jpg`. Both engines.
- **Wrong:** "Sub-Q" breaks at the hyphen onto two lines ("Sub-" / "Q") in the white thumb. The brief keeps
  "IM / Sub-Q" on this card.
- **Where:** `lib/ui-presets.ts:231-232`. `SEGMENTED_ITEM` has no `whitespace-nowrap`. Used at
  `components/home/InjectionSitesGlanceCard.tsx:81-95`.
- **Change:** add `whitespace-nowrap` to both segmented presets.

### D8 · minor · Tap targets under 44px (both engines)
- **Wrong:** the stepper's − and + are 30x30 (`components/home/log/LogRowPanel.tsx` near `:485` and `:503`).
- Type rail chips are 30px tall (Home, Protocol, Progress).
- The "?" beside titles and on the graph is 26x26.
- The top-right "+" is 34x34.
- The Cycles Timeline 1M / 3M / 1Y / All chips are 25px tall.
- The compound card's "Add stock" is 67x17 (`components/protocol/CompoundStorageCard.tsx`).
- The close arrows are 30x30.
- Body-map regions go down to 9x42 (Outer Quad) and 13x29 (Ventroglute).
- Footer legal links are about 12px tall.
- **Change:** enlarge the hit areas, not the drawings. For the body map, add invisible, larger hit paths per
  region.

### D9 · minor · Home, open dose row, at 375 (WebKit)
- **Screenshot:** `w375-stepper-zoom.jpg`.
- **Wrong:** the stepper's "+" loses its right edge. Its outer ring is cut flat by `.log-body > div
  { overflow: hidden }` (`app/globals.css:1895`), whose right edge is exactly the button's.
- **Change:** give the panel's inner div 2px of inline padding with a matching negative margin, or inset the row.

### D10 · minor · Compound names cut off
- **Screenshots:** `c390-protocol-full.jpg`, `c390-schedule-s0.jpg`, `c390-running-open.jpg`.
- **Wrong:** Protocol card "Glow (BPC-157 + TB-500 + GHK-.."
  (`components/protocol/CompoundStorageCard.tsx:84`, `line-clamp-2`). Schedule grid "Testosterone Enant…" and
  "Glow (BPC-157 + TB…" (`components/protocol/ScheduleGrid.tsx:173`, `truncate`), on both the Protocol card and
  the Schedule page. Progress Running "Testostero…". The brief's copy rule: "compound names in full".
- **Change:** let the grid's name column wrap to two lines, and let blend names take a third line on the card or
  wrap on the Running tiles.

### D11 · minor · Home, Today's Log, a stack group
- **Screenshot:** `c390-home.jpg`.
- **Wrong:** the group header "● MORNING SHOT · 1 due" sits right above the row "Morning shot · 1 OF 2
  LOGGED". It shows the same name and the same count twice.
- **Change:** for a stack group, drop the group header, since the row names it. Or drop the header's "N due" and
  keep the row's line.

### D12 · minor · Home, half-life card, with reduced motion on
- **Wrong:** the card still grows its width (260 → 310px over about 300ms, per-frame trace).
- **Cause:** `app/globals.css:1622-1627` transitions `flex-basis` on `.hl-glance-card`. The reduced block at
  `:1747-1752` only covers `.hl-glance-card *`.
- **Change:** add `.hl-glance-card` itself to that block.

### D13 · minor · Protocol, a compound's sheet
- **Screenshots:** `c390-sheet.jpg`, `c390-sheet-reta.jpg`.
- **Wrong:** the stock line ends in a bare "+4" or "+1" (`components/home/CompoundDetailSheet.tsx:370`). The brief
  says '"+2 vials"', and the Protocol card says "+4 vials".
- **Also:** "Next: Mon 28 Sep, Thu 1 Oct, Mon 5 Oct" (`:329-336`) lists three dates where the brief says
  '"Next dose"'.
- **Change:** "+4 vials". "Next dose" with one date.

### D14 · minor · Cycles, an open type
- **Screenshot:** `c390-cycles-row-actions.jpg`.
- **Wrong:** rows take the cycle's own colour, not the category's. Under the violet Peptides mark, Ipamorelin is
  brown, TB-500 green and CJC-1295 pink. The brown reads as the anabolic amber. The reference draws each row with
  the compound's category colour (`holder(y.c,…)` in `r6/cycles8.js`).
- **Where:** `components/protocol/pages/CyclesScreen.tsx:120`, `:391`, `:403`.
- **Change:** use the category colour for the container and the 28-day strip.

### D15 · minor · Onboarding, welcome
- **Wrong:** "You're in, {name}!" and "You're in!" (`components/onboarding/screens/welcome.tsx:88`). The brief
  says no exclamation marks. This one isn't among the exceptions the builder left for Adrian ("Trakabl is going
  paid!", "exactly that!").
- **Change:** "You're in, {name}." Confirm with Adrian if unsure.

### D16 · minor · Every empty field
- **Screenshots:** `c390-addstock.jpg`, `c390-home-note-panel.jpg`.
- **Wrong:** units and placeholders ("mL", "mg/mL", "mg", "Anything to remember?", "How did today go?") are
  `--text-muted` `#8D8B89` on `--bg-input` `#282725`, which is 4.40:1, under 4.5. The brief's 5.2:1 is measured
  on the surface, not the input. Since "empty fields show only their unit", the unit is the field's label.
- **Change:** use a slightly lighter muted for text on inputs (about `#9A9895`, 5:1), or darken `--bg-input` a
  step.

### D17 · minor · Mix a vial, before the powder is in
- **Screenshot:** `c390-mix.jpg`.
- **Wrong:** Water is prefilled with 2 (`mixWaterDefault`), yet the line says "Add the powder and water to see the
  draw" (`lib/protocol/mixDraw.ts:18`). That's the brief's wording, but it asks for something already there.
- **Change:** name what is missing: "Add the powder to see the draw" once water is in. This is a brief-copy
  change, so flag it to Adrian.

### D18 · minor · Progress, photos card and viewer
- **Screenshots:** `c390-progress-s0.jpg`, `c390-viewer.jpg`.
- **Wrong:** tiles read "Front relaxed", "Side relaxed", "Back relaxed"
  (`components/progress/ProgressPhotoCard.tsx:141`, `poseLabel`), while the viewer's top line reads "Front · 22
  Sep". Brief §3.15: "Labels come from the pose picked when adding: Front, Side, Back or Other."
- **Change:** use the short pose name on the tiles, the same as the viewer.

### D19 · minor · Schedule, Protocol card and Schedule page
- **Screenshots:** `c390-schedule-s0.jpg`, `c390-protocol-tiles-zoom.jpg`.
- **Wrong:** a "Missed" square (a grey outline) and a "Nothing due" square (a dimmer outline) are nearly the same.
  Protocol's card has no legend, so Enclomiphene's missed week reads as blank days.
- **Change:** give Missed its own mark, such as a short inner dash. Keep state colours off health data.

### D20 · minor · Home at 375x548 (Adrian's call, layout)
- **Screenshot:** `w375-home.jpg`.
- **Wrong:** the screen opens with a date eyebrow "SAT 26 SEP", the title "Dashboard", the week strip (with
  "26 SAT" lit, the date a second time), then "Good morning, Adrian" and "TODAY'S LOG" inside the card. That's two
  headlines and the date twice. The first dose row sits at y≈370 of 548, so only two rows show above the nav.
- **Change:** drop one headline (the greeting already heads the screen) or the eyebrow date. This is
  pre-existing, not a build miss.

### D21 · minor · Calculator, the syringe
- **Screenshots:** `c390-recon-filled.jpg`, `c390-recon-syringe-zoom.jpg`.
- **Wrong:** the syringe is drawn at about 60% of the row, left-aligned. The rod's reserved travel leaves the
  right third empty at small draws. On 1 mL, the scale labels run together ("90100"). The reference `syringe9`
  spans the width.
- **Where:** `components/calculator/SyringeGraphic.tsx:125-166`.
- **Change:** scale the drawing so barrel plus full rod travel fills the width. Label every 20 on 1 mL.

### D22 · polish · Stacks card
- **Screenshot:** `c390-stacks-s0.jpg`.
- **Wrong:** a coloured dot sits at the right of each stack card (`components/protocol/pages/StacksScreen.tsx:186`)
  and means nothing to the user.
- **Change:** remove it. The containers already carry the stack colour.

### D23 · polish · Calculator, empty results
- **Wrong:** em dashes stand in for empty values (`components/calculator/ReconCalculator.tsx:41`,
  `NO_VALUE = "—"`), against "no em dashes".
- **Change:** leave the figure blank until there is one.

### D24 · polish · Disabled buttons
- **Wrong:** their words drop to `--text-subtle`, about 1.9:1 (`components/home/AddCompoundSheet.tsx:1516`,
  `components/media/PhotoAdjustSheet.tsx:350`, `components/navigation/add-to-stack-menu.tsx:640`). The rule:
  readable text never in subtle.
- **Change:** muted at reduced opacity.

### D25 · polish · Body map, screen reader
- **Wrong:** regions announce the catalogue name with the spaced dash ("Front Quad – Left",
  `components/sites/BodyMap.tsx:295-297`, `site!.label`). The brief retires that form.
- **Change:** use `siteDisplayName(site.label)`.

### D26 · polish · Compound sheet at 375
- **Screenshot:** `w375-sheet.jpg`.
- **Wrong:** the Schedule tile wraps "Mon · Thu · 8:00 / AM".
- **Change:** keep the time on one line (`whitespace-nowrap` on the time).

### D27 · polish · The + fan
- **Screenshot:** `c390-fan.jpg`.
- **Wrong:** item labels float over the dimmed page with no backing. "Add compound" sits on top of the schedule
  grid's squares.
- **Change:** a soft dark pill behind each label, or a slightly darker scrim.

### D28 · polish · Half-life list
- **Screenshot:** `c390-hl-list-s0.jpg`.
- **Wrong:** "No doses yet" (Enclomiphene) still draws a flat full-width line.
- **Change:** no line until there is a dose.

### D29 · polish · Progress, new account
- **Screenshot:** `c390-progress-fresh-s0.jpg`.
- **Wrong:** the Block card is the one section that breaks the "None yet and a plus" pattern (brief §3.15). It
  shows a ghost preview, a centred "+ New block" and a sentence ("A prep, an off-season, a cut. Start and end
  dates, and what you ran.").
- **Change:** "None yet" and the plus, like the rest.

### D30 · polish · Home, amber budget (Adrian's call)
- **Wrong:** every type header on Today's Log carries "N due" in amber (`FlowRow.tsx:101`): four on the preview
  screen, plus the Log edge and the site shading. That's more than "one or two beats".
- **Note:** it matches the reference (`look8.js` also colours "N due" amber), so it's Adrian's call.
- **Change:** muted "N due". Keep amber for the edge.

### D31 · polish · Calculator, focused field
- **Screenshot:** `c390-recon-filled.jpg`.
- **Wrong:** the Dose field shows a 2px amber ring. Fields elsewhere use the inset muted ring (brief §3.5: "A
  field's focus ring sits INSIDE the field (inset 1.2px muted)").
- **Change:** use the shared field focus style.

## Checked and right
- **Dose row panels:** one header row each. Site has the Front/Back switch and the arrow; Stock is the vial row
  only; Note is "Add a Note" with "Anything to remember?".
- **Switching panels:** header, body and arrow fade out and in while the height eases, and the page eases up so
  an open panel isn't under the Track bar.
- **Tick lift:** plays .8 → 1.04 → 1 in about 330ms (recorded from the class). Due circles are white.
- **Half-life card:** any card centres and grows to full width. The graph's own black strip holds a circled "?".
  "Reading the graph" key matches the brief.
- **The + fan:** four 48px items on a 132px arc, spring .3 → 1.04 → 1, the + turns to ×. Reduced motion fades it
  in place.
- **First Dose Logged:** code matches every timing in brief §3.1, has a reduced-motion fade, and focuses Done.
- **Compound sheet:** ONE long card (half-life mark, days, dose, route), Stock line, Add stock and Mix one,
  Delete in red. Add stock and Mix follow §3.12 to the word.
- **Explainers and confirms:** the three explainers, Delete stack, End cycle and Delete cycle are word for word
  from the brief.
- **Cycles:** the hint goes after the first tap. Folds are `inert` while shut, so taps and Tab skip hidden rows.
  Paused sits last.
- **Half-life compound page:** In you now and Next dose, the band replacing the fill, Level, Next peak in,
  Half-life, and the centred "Usually peaks …" line.
- **Photo viewer:** grows from its tile (about 330ms), date and weight at top, dots at bottom, 93% black.
- **Other checks:** no page scrolls sideways at 375. Focus is visible on every control (an amber outline).
- **Public site:** keeps Geist, `#111110` and `#c8861a`; only its phone previews use the new look.

## Not checked here (needs a signed-in account or a real log)
The prompt left the burner password as a placeholder, and the signed-out preview doesn't commit a Track. These
were not seen live:
- the first-run bubble and the pop-up on screen;
- the Log edge filling and the E4 finish;
- digits rolling after a log;
- the "Unticked" toast;
- pinch zoom;
- the Paused slide, which the builder says isn't built because nothing on the Cycles page can pause yet.

The functionality reviewer did see three of these live on the burner: the "Unticked" toast with Undo (it restores
the dose), digits rolling after a log (about 900ms, no scroll), and the Log edge amber all round once every dose
was logged. They couldn't see first run either, because the burner has history. So the bubble and the pop-up are
still unseen on screen.

The sample user's "0.00 mcg circulating, 100% of last dose left" right after injecting
(`Context/reviews/sample-user.md` §3) is a real simplicity problem for this lens: it reads as if the log did
nothing. A short "Absorbing" state in place of 0.00 would fix it. I didn't reproduce it.
