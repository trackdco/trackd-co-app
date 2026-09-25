# Build brief: the final design (everything decided since the half-life build)

Written 2026-09-26 for a NEW builder chat. Adrian signed off four rounds of the final-check page on
https://claude.ai/artifact/2Mnj2qS3FKxiSNsNPjxiv1 (db `final/`, `final2/`, `final3/`, `final4/`) and answered
the last questions in chat. This brief is the ONE document you build from. Where it and an older Context file
disagree, this brief wins; `Context/ui-context.md` has a matching override section at its top ("FINAL DESIGN
DECISIONS"). Adrian's raw answers beat everything: `~/trakabl-mockups/final-check/answers/{final,final2,final3,final4}/answers.json`.
History and verified code facts: `~/trakabl-mockups/final-check/handover/reference.md` (§2 decisions, §5 code facts).

## 0. Who and how

- Trakabl (never "Trackable"; legal entity Trackd Co Pty Ltd). Dark, phone-first dose tracker, Next 16.
- Adrian is the founder. He is asleep while you build. Work through every phase without asking. Stop only for:
  a migration that must be APPLIED, money, a destructive or outward action, or a spec that contradicts the code.
  If you hit one, write it down, skip that piece, and carry on with the rest.
- His bar, in his words: "our whole goal is simplicity. I want this to be a simple app to use. If it gets too
  complex, I don't want to use that." One obvious action per screen, few words, nothing shown twice in two places.
- Copy rules: no em dashes and no exclamation marks in UI copy; readable text never in `--text-subtle`; Kyle is a
  VIAL, never a jar; compound names in full (short names are Adrian's call); the app reports, it never recommends
  (no suggested site, ever; Apple 1.4.2: no dosing advice).

## 1. Where

- Worktree `/Users/adrianschimizzi/Documents/GitHub/trackd-halflife-wt`, branch `design/half-life-motion`
  (pushed tip `3e26a9d`; local is ahead with Context-only commits). Never touch the main checkout
  `/Users/adrianschimizzi/Documents/GitHub/trackd-co-app` or switch its branch. Never push; never merge to main.
- `node_modules` and `.env.local` are symlinked from the main checkout. The repo is on iCloud: if a tool hangs on a
  dataless file, copy to `/private/tmp` rather than waiting; never mass-delete `.next`.
- The visual reference is the final-check page (URL above). Its source is `~/trakabl-mockups/final-check/r6/`
  (round three `*8.js`, round four `round4.js`, `sections9.js`). Read the mock for numbers, copy and motion; build
  the real thing from the app's own components.

## 2. The look (Adrian picked it; it replaces the whole app UI, onboarding included)

**Style: Instrument. Type: IBM Plex. Palette: Deeper black.** Black, white and amber stay.

### 2.1 Palette tokens (map onto the app's existing token names)
| App token | New value | Was |
|---|---|---|
| page / `--bg-base` | `#050504` (page behind cards `#040303`) | `#0E0E0D` |
| `--bg-surface` | `#191918` | `#212120` |
| `--bg-surface-raised` | `#222120` | `#2A2A28` |
| `--bg-input` | `#282725` | `#30302E` |
| `--bg-inset` / `--bg-inset-deep` | `#131211` / `#100F0E` | `#1A1A19` / `#171716` |
| `--bg-surface-done` (a finished day's Log card) | `#141312` | `#1B1B1A` |
| `--border-default` / `--border-strong` | `#2B2A28` / `#3D3B39` | `#333331` / `#45453F` |
| `--text-primary` | `#F5F3F0` | `#F0EFE9` |
| `--text-muted` (the minimum for words) | `#8D8B89` (5.2:1 on surface) | `#8A8982` |
| `--text-subtle` (decoration only) | `#4F4D4A` | `#54544F` |
| `--accent-amber` AND `--cat-anabolic` | `#D0802B` | `#C8861A` |
| body-map base / region | `#282725` / `#32312F` | `#30302E` / `#3A3A37` |
Other category colours, state colours and the Sorbet blend lines stay. Dark ink on the new amber is 6.26:1.

### 2.2 Type
- IBM Plex Sans for UI, IBM Plex Mono for every figure (`tabular-nums`, slashed zero). Weights 300/400/500 only.
- Load with `next/font/google` (`IBM_Plex_Sans`, `IBM_Plex_Mono`), replacing Geist and Geist Mono app-wide. Keep the
  existing presets' sizes; only the families change. The Caveat one-liner stays.

### 2.3 Instrument surfaces (turn these into presets in `lib/ui-presets.ts` first, then use them)
- Card: radius 20; background surface; shadow `inset 0 1px 0 rgba(ink,.08), inset 0 0 0 1px rgba(ink,.035),
  inset 0 -1px 0 rgba(0,0,0,.35), 0 0 0 1px rgba(0,0,0,.6), 0 14px 28px -18px #000`.
- Rows block: radius 12; raised; `inset 0 1px 0 rgba(ink,.07), inset 0 0 0 1px rgba(ink,.03), 0 0 0 1px rgba(0,0,0,.45)`.
  Row dividers: `1px solid rgba(0,0,0,.42)` plus `inset 0 1px 0 rgba(ink,.04)`.
- Primary (white) button: radius 10; `linear-gradient(180deg, ink 0%, ink mixed 6% black 100%)`;
  `inset 0 1px 0 rgba(255,255,255,.85), inset 0 -1px 0 rgba(0,0,0,.16), 0 0 0 1px rgba(0,0,0,.65), 0 8px 16px -10px rgba(0,0,0,.9)`.
- Ghost button: radius 9; raised; `inset 0 1px 0 rgba(ink,.09), inset 0 -1px 0 rgba(0,0,0,.3), 0 0 0 1px rgba(0,0,0,.55)`.
- Chip rail: radius 11; `linear-gradient(180deg, inset-deep, inset)`; `inset 0 1px 2px rgba(0,0,0,.55),
  inset 0 0 0 1px rgba(0,0,0,.4), 0 1px 0 rgba(ink,.06)`. Its thumb: radius 8, white gradient like the button.
- Tile: radius 12; `inset 0 1px 2px rgba(0,0,0,.45), inset 0 0 0 1px rgba(0,0,0,.22), 0 1px 0 rgba(ink,.05)`.
- Inset (graph wells): radius 12; `linear-gradient(180deg, inset-deep, inset)`; `inset 0 1px 3px rgba(0,0,0,.55),
  inset 0 0 0 1px rgba(0,0,0,.4), 0 1px 0 rgba(ink,.06)`.
- Eyebrows: weight 500, tracking .2em, muted, `text-shadow 0 -1px 0 rgba(0,0,0,.6), 0 1px 0 rgba(ink,.035)`.
- Big figures: tabular-nums slashed-zero, tracking -.01em, the same engraved text-shadow.
- Tick circle: 1px border, `inset 0 1px 1px rgba(0,0,0,.4), 0 1px 0 rgba(ink,.06)`.

### 2.4 Shapes
Rounded rectangles everywhere (switches, buttons, chips, tiles, steppers, the panel close arrow at 9px, the
top-right "+" buttons at 10px). Still round: the camera shutter, avatars, the log tick, the main "+" button, and
the half-life graph's "?" (he asked for a circle around it). Corners inside a card are never rounder than the card.

### 2.5 The amber recency ramp (sites)
Never amber at an opacity over grey (it drifts to olive, which is why it looked "too yellowy"). Pre-mix solid
steps in OKLCH at a fixed hue: for heat h in (0,1], t = h^0.85, L = L_base + (L_amber − L_base)·t,
C = C_base + (C_amber − C_base)·t, H = H_amber − 4·(1 − t), base = the region grey, amber = `#D0802B`.
Heat and windows are unchanged (IM 7 days, Sub-Q 5; `1-(d+1)/(W+1)`). The freshest day chip is amber text.

## 3. Screen by screen

### 3.1 First run
- Adding the first compound uses the app's REAL add flow (library search, then browse by type; one compound
  at a time; dose, how often, time, stock). Do not rebuild it from the mock.
- On Home the new row gets a bubble pointing at its tick circle: "Tap the circle to log it." with a tiny looping
  preview of a tap on the circle. It goes after the first tap and never comes back. (Wording is mine; he picked
  the bubble.) The + stays hidden until the first log.
- Logging the first dose opens a centred pop-up card over a dimmed Home (not full screen):
  a 140px amber ring (`--accent-amber`) that draws closed, a white check that draws inside it, amber sparks;
  title "First Dose Logged"; line "Now that you’ve got the basics down, have a look around."; white button "Done".
  Motion: scrim fades in 220ms; card rises from translateY(18px) scale(.94) over 420ms
  `cubic-bezier(.34,1.3,.64,1)`; ring draws 760ms after 180ms `cubic-bezier(.65,0,.35,1)`; check pops
  (scale .6 → 1.06 → 1, 520ms after 260ms) and its stroke draws (460ms after 720ms); ten sparks burst 18px
  outward and fade (560ms after 940ms); title, line and button fade up 8px (360ms after 1000/1110/1220ms).
  Done or a tap on the scrim closes it: card 180ms ease-in down and out, scrim 220ms. No Kyle here.
- Every other empty page shows its own setup card (settled in round one).

### 3.2 Home: Today's Log and the dose row
- Log card: rows grouped by type (a type title folds it, only when tapped). Due circles are WHITE. First tap on
  a row's circle opens its panel; the second logs it; the name opens the row; a logged row's circle un-logs it
  and shows the toast "Unticked" with Undo (3s).
- Track bar pinned over the tab bar; it rises when a row with a dose opens and drops after Track (built).
- Tiles Site / Stock / Note (Solid icons; Site only for IM and Sub-Q). A tile opens its panel; the SAME tile
  again closes it. Every panel starts with ONE header row, no empty band:
  - Site: the Front/Back switch and the close arrow on one line; the map below; it closes itself about 0.5s
    after a site is picked. Never a suggested site.
  - Stock: the vial row only ("Current vial" / "N doses left"). NO arrow. Tapping the vial row (or "No stock
    yet") closes the panel, as does the Stock tile. With no stock the row shows "No stock yet" and "Add stock".
  - Note: title "Add a Note" and the arrow on one line; the field below, placeholder "Anything to remember?";
    the note survives closing and the tile reads "Added".
- Switching tiles: the old header, body and arrow fade out (110ms ease-in, 4px down), the panel height eases to
  the new one (280ms `cubic-bezier(.22,1,.36,1)`), the new ones fade in (240ms, from 4px up). Panels open and
  close with a 450ms grid-rows ease. If a panel opens under the Track bar, the page eases up just enough to show
  it (this is the one allowed scroll, on opening only).
- Track: no "Tracked" cover. The row's circle fills (logged grey `#C9C8C2`) with a gentle lift: scale .8 → 1.04
  → 1 over 360ms `cubic-bezier(.3,1.1,.5,1)`, the check draws in 240ms after 100ms. The Log card's edge fills its
  share per dose (LogEdge, built); the last dose plays E4 (2 → 3.5 → 0.75px over 3000ms after 760ms,
  `cubic-bezier(.45,0,.25,1)`) and the card settles to `--bg-surface-done` over 1800ms. Nothing scrolls.
- Dose number: tap it to type (Trakabl NumberPad); steppers step whole units for tab, capsule and drop.

### 3.3 Home: the half-life rail
- Type chip rail (All = four squares) over swipe cards (84% wide). Each closed card shows its name, Circulating,
  "Of last dose left" and a sparkline, plus a small DOWN chevron at its top right so it reads as openable.
- Tapping ANY card (centre or side) centres it and opens it: the card grows to full width (460ms, the rail held
  on it every frame) and the graph grows out of it, lined up exactly with the card. Swiping while open switches
  compound. The up arrow closes it and it shrinks back.
- Open, the card adds the graph and the rows (Level: Climbing / Holding / Dropping; Half-life, "est." for BPC-157,
  TB-500, GHK-Cu; Next dose "X days"; "Clears in" once stopped). It does NOT repeat the two figures (as the branch
  already does). No countdown row: Adrian chose "key only".
- The graph: past solid, future dashed (your schedule), Now a thin line (no dot), dose ticks along the bottom,
  and a dashed ½ line with a "½" label at the point where "Of last dose left" crosses 50% (the model's
  depot-plus-curve fraction; about 1.14 × the half-life after an injection, NOT last dose + half-life).
- The graph area gets its own top strip on solid black with a circled "?" at its right. Tapping it opens a
  pop-up (not a drop-down) titled "Reading the graph" with the key: "½ Last dose half gone", "Now",
  "Your doses", "Ahead" (dashed), each with its mark, and one short line: "Estimated from your doses and your
  schedule." (wording mine).
- After Track: no auto-scroll, vertical or sideways. If that compound's card is on screen its digits roll from
  the old value (never from zero); otherwise the figures update quietly. The graph's scale eases.

### 3.4 Injection sites
- Home card: as it is, switch labels IM / Sub-Q. The sheet (InjectionSitesSheet): switch labels
  "Intramuscular" / "Subcutaneous", as the app has them. Map = the log sheet's map (day chips in the margins,
  1px leaders, freshest chip amber), shaded with the ramp in 2.5. Front is mirrored.
- Site names without the spaced dash ("Side Abdomen, Left"); short names in the Track bar ("Abdomen L").

### 3.5 Journal and markers
- Journal opens in place on Home; nothing is open until Markers, Photos or Date is tapped. Each panel has a header
  row with its name and the arrow; switching cross-fades (as 3.2).
- Markers: tick as many as you like (a ticked chip turns white with a tick; the picker stays open); one button
  "Add N" adds them all as rows (they arrive 60ms apart, 320ms each); then rate each on its five steps (drag or
  tap; the step animation stays as it is, "perfect"). Links "Add more markers" and "Use my last". Search
  "Search N markers". Create your own (name, steps, which end is better) saves under Yours, with Edit (× + Undo).
- A field's focus ring sits INSIDE the field (inset 1.2px muted), so no panel clips it.
- Markers words, suggestions (the same for everyone) and female-only markers: as settled (reference.md §2).

### 3.6 The + and the nav
- The + is a CIRCLE at bottom right. Press, slide onto an item, lift to open it; or tap it and tap an item. Four
  items fan out in an arc (132px radius, 30ms stagger, spring `cubic-bezier(.34,1.4,.64,1)`): Weight, Journal,
  Add compound, Add stock. Items are rounded squares. No Calculator item (it is the middle tab). The + hides
  under sheets; toasts sit above it.
- Nav: the app's five tabs, labels as the app has them: Dashboard, Protocol, Calculator (middle), Progress,
  Profile. NEW monochrome Solid icons (filled, 24 grid, light-grey gradient; active white, others muted):
  Dashboard = four rounded squares; Protocol = a vial; Calculator = a syringe; Progress = a rising area line;
  Profile = head and shoulders. Glyph paths: `NAVG9` in `~/trakabl-mockups/final-check/r6/round4.js`.

### 3.7 Protocol (stock lives here now; the Stock page goes)
- Top: "Protocol". "Compounds" with a type chip rail above the compounds row (the same rail as Home). Each
  compound card: its container (fill = the one in use), full name, "+N vials" when it has spares, and Runs dry
  as the app writes it (`runsDryText`: "Today", "Tomorrow", "In N days" in amber at 7 or fewer, else the date).
  A compound with nothing on hand shows a dotted container and "Add stock", as the app does today. An "Add" card
  ends the row.
- Tapping a compound opens its sheet:
  - Header as before: container and full name. Under it ONE long card holding only: the curve half-life mark
    (in the compound's colour), "14 days" | "250 mg" | "IM" with hairline separators. A compound with no
    half-life (Vitamin D3) or a blend shows no half-life there.
  - Started / Schedule tiles, "Next dose".
  - Stock: the vial in use as one line ("Current vial · 7 doses left"), "+2 vials", and two actions: "Add stock"
    and, when a spare is dry, "Mix one". Correct and Discard sit behind ⋯. No vial previews, no pager.
  - "Edit dose & schedule"; then Skip this dose / Pause (from Home) and "Delete <name>" (red, asks).
- Schedule card: this week as a grid, tidied: square cells (rounded 3px) in each compound's colour, today's column
  lit, a hairline between types (no type labels), keeping the app's current done / due / missed states. Tapping
  it opens the app's Schedule page (ScheduleWeeks: go back weeks), restyled to the same squares.
- THREE tall tiles at the bottom: Stacks, Cycles, Half-life. Marks: Solid, in their colours (`PMK8` in
  `r6/proto8.js`). Pages slide in (300ms, 26px, fade).

### 3.8 Explainers
Each page title gets a small "?" beside it: "Stacks ?", "Cycles ?", "Half-life ?". It opens a pop-up with a
picture and two or three lines (drawings: `tileHelp9` in `r6/round4.js`):
- "What is a stack?" — "A stack is compounds you take together, at the same time." / "Tick the stack once and
  every compound in it is logged."
- "What is a cycle?" — "A cycle gives a compound days on and days off." / "On off days it isn’t due, and the
  cycle shows where you are."
- "What is a half-life?" — "A half-life is how long your body takes to clear half of what it has absorbed." /
  "Each compound has its own: some clear in hours, others over days, depending on how the body breaks it down
  and how slowly it is released." / "Trakabl uses it to estimate how much is in you now and when a dose has
  cleared. These curves are estimates from your doses and your schedule." (Facts only; no advice.)

### 3.9 Stacks
Title "Stacks ?" with a "+" rounded square at top right (New stack). U1 cards; tap to open; Edit and Delete.
Delete asks ("Delete this stack?" / "<A> and <B> keep running." / "Delete stack" / "Cancel"), then the toast
"<Name> deleted" with Undo. Undo needs a new `restoreStack` that re-commits the stack verbatim and refuses if a
member joined another stack meanwhile.

### 3.10 Cycles
- Title "Cycles ?" with the "+" (New cycle) at top right.
- The list card: on a first visit, "Tap a type to see its cycles." It goes after the first tap and stays gone.
  All types start folded. A type header shows only its mark, the type and a count ("Peptides 4 ›"), no names.
  A row: name, pattern ("5 days on, 2 off"), a 28-day strip. Tapping a row shows Edit and End (red, icon and
  word). The in-row Pause / Resume button waits for the event-actions spec (not this build).
- Paused sits LAST in the same card, folded. When a cycle's compound is paused, its row dims to 45% (260ms),
  then slides down into the Paused header and fades (560ms); the Paused header then makes an impact: a short
  highlight flash (600ms) and its pause icon pops once. No count bump. The toast says "Paused".
- End (e2): "End this cycle?" / "<Name> keeps going, <schedule>, without weeks off. Your logs stay, and you can
  restart it from Ended." / "End cycle" / "Cancel". The compound keeps running (today's Remove). The cycle moves
  to Ended. Toast "Cycle ended. <Name> carries on."
- "Ended N ›" at the bottom opens Ended. A row: name, pattern, the date it ended. Tapping it shows Restart and
  Delete. Restart re-applies the cycle (new work; toast "Restarted. <Name> is back on its cycle." with Undo).
  Delete asks: "Delete this cycle for good?" / "You can’t restart it. Your dose logs stay." / "Delete cycle"
  (red) / "Cancel"; then "Cycle deleted" with Undo. Cycles that reach their own end also land in Ended.
  Today the app hides a finished cycle and erases one you end, so Ended needs storage (see §5 and §6).
- The Timeline card (renamed from "Live timeline"): cycles only, as before — a lane per cycle with its curve
  under it, ranges 1M / 3M / 1Y / All, smooth bars past 60 days, the Today line. No separate Timeline page.
  Demo scale to hold: 2, 12 and 50 cycles.

### 3.11 Half-life pages
- List: title "Half-life ?" (the explainer above). Grouped by type, blends as their own group; each row a
  sparkline and "Circulating" or "Cleared". No intro lines (they moved into the "?").
- A compound's page: title with its curve mark. The card leads with "In you now" (big) and "Next dose" beside
  it. Then the graph: the likely-range shading REPLACES the fill and looks as it did (the curve ×1.14 above and
  ×0.86 below at Now, widening to ×1.30 / ×0.76 six days either side), past solid, future dashed, Now a thin
  line, dose ticks, the ½ line (3.3). Rows: Level, Peaks in (from the drawn curve: the top of the stacked curve
  between the last dose and the next; after it, "Next peak in"; days, then hours, then "<1h"), Half-life.
  Centred line: "Usually peaks ~X after a dose and clears ~Y after the last." No About row. Past runs, tappable.
- The "?" guide on this page ("Reading the curve"): the chart with straight vertical leaders to labels along
  the top and bottom, never overlapping: Likely range, Now, Ahead / Your doses, Peak (when upcoming),
  ½ Last dose half gone. Button "Got it". No paragraph.

### 3.12 Stock actions (from the compound sheet, the dose row and the +)
- "Add stock" sheet: pick the compound when it isn't known ("Add stock" list); then a count stepper ("Vials" /
  "Bottles") and only what that container needs (every container stores an amount: `total_amount` NOT NULL):
  powder vial "Powder in each" (mg); oil vial "Volume" (mL) + "Strength" (mg/mL); tablets or capsules
  "In each" (tabs / caps) + "Strength" (mg / IU; Vitamin D3 is capsules in IU); a tub "Tub weight" (g).
  Empty fields show only their unit (no placeholder text). "Add" won't save with an empty field (it shakes and
  focuses it). Toast "Added N to <name>."
- "Mix a vial" sheet (from "Mix one"): "Cancel" at top right; the vial starts dry and fills as you type powder and
  water (animate a transform, never re-render the field); "Draw N units for X mg"; before both are in:
  "Add the powder and water to see the draw"; water starts at what you used last time (`mixWaterDefault`); button
  "Mix"; toast "Mixed. Now in use." with Undo. The Mix vial is drawn with the approved containers.
- Home's dose-row Stock tile stays (logging needs it).

### 3.13 The calculator's syringe (redesigned in the new look)
Keep SyringeGraphic's rules (fills from the needle end; the fill is a fraction of the SELECTED capacity; scale
from `lib/calculator/syringe`). New look: clear glass barrel with engraved graduations (a dark tick with a light
offset line), labels in Plex Mono below; amber fill with a vertical gradient `#E7A15A → #D0802B`; dark stopper;
MORE gradient on the grey parts (hub, flange, rod, thumb rest). New: the plunger rod travels WITH the stopper as
the draw changes (reserve the width so the graphic's box never changes size). Switching 0.3 / 0.5 / 1 mL
animates: the scale cross-fades (200ms) and the fill eases to its new fraction (550ms `cubic-bezier(.22,1,.36,1)`).
Reference drawing: `syringe9` in `r6/round4.js`.

### 3.14 Containers
The approved set B (vial, oil vial, ampoule, dropper, bottle, tub, plus the syringe; artifact
https://claude.ai/artifact/5ox8a4jXsypSaYXHQb7kib), redrawn on the new ground with the new amber. Drawing rules
unchanged: flat plus depth (one gradient in the contents, one highlight); clear glass for liquids, coloured body
for solids; the cap says whether it opens; graduations only on measured things; the tub lid drawn last.

### 3.15 Progress
- Photos card: the latest day's photos. Up to three show as tiles; with more, the first two and a "+N" tile that
  opens the viewer there. Labels come from the pose picked when adding: Front, Side, Back or Other.
- Viewer: grows from its tile (420ms); swipe between that day's photos; the date and weight at the TOP beside
  the ×; the dots at the BOTTOM; backdrop black at 93% so the app barely shows; tap the photo to hide or show the
  controls; tap the dark around it, swipe down, or × to close. Pinch to zoom (touch; ctrl+wheel in Chromium;
  `gesturestart`/`gesturechange` in Safari) springs back on release (420ms `cubic-bezier(.34,1.3,.64,1)`);
  press-and-hold zooms with a mouse.
- Running: under the photos, a folded row "Running N" with a chevron; it opens to the type rail and a sideways
  row of the compounds you run.
- New account: a quiet "Your first photos" card: three clear frames labelled Front, Side, Back and a small "+" at
  its top right. No big button, no "Only you can see these". The other sections preview what they become
  ("None yet" and a plus); Consistency reads "Starts with your first dose".

### 3.16 App-wide
- All 30 consistency fixes (`Context/consistency-review.md`; Adrian ticked them all).
- Every pop-up animates: sheets rise from where you tapped; dialogs scale in (from 16px down, .96, 340ms
  `cubic-bezier(.34,1.3,.64,1)`) and out (170ms); both leave the way they came.
- Bottom toasts everywhere (Paused, Mixed, Saved, Unticked…), with Undo wherever it can undo.
- Reduced motion: slides and springs become short fades; nothing bounces; drawn lines appear drawn.
- No page scrolls sideways at 375px.
- Landing: leave it alone EXCEPT the app previews inside its sections, which must show the new look (Adrian's
  explicit exception to "don't touch landing").
- Settled from earlier rounds and still true (details in reference.md §2): curve model (`lib/halflife/model.ts`),
  "Circulating" / "Of last dose left", Level words, digits roll, Track pinned, Holding, Raging, Gyno Severe,
  suggested markers the same for everyone, Bloods = the lab report mark, category marks keep today's gradient,
  button icons get the lighter gradient, settle "Lighter".

## 4. Code facts that constrain the build (verified on this branch)
- Runs dry counts open or mixed containers only; spares count once started; amber at ≤7 days
  (`lib/protocol/runsDry.ts`, `stockPage.ts runsDryText`). ui-context forbids a "runs dry, mix one" nudge.
- `total_amount` is NOT NULL and the catalogue has no vial size, so adding stock always asks the amount.
- `mixStockItem` only restarts rows where `acquired_on IS NULL`; `mixWaterDefault` = last mixed water, else 2 mL.
- A dose row opens with NO site (`logDraft.ts`); tablets and orals have no Site tile.
- Vitamin D3 has no catalogue half-life (`halfLifeHours: null`): no curve, no half-life shown anywhere.
- `useMinuteNow` drifts figures every minute: animate only on a log.
- The real graph already draws Now as a thin line and "TODAY"; the ½ line, dose ticks and key are new.
- Custom markers already exist (`MarkerDialer` `CreateMarkerForm`). 36 markers, 14 defaults, 3 female-only.
- Stack delete lives in `StackEditSheet`; `removeStack` has no undo (add `restoreStack`). Stacks are
  device-first (`trackd.stacks.v2.{userId}`) then synced.
- Compound Pause holds a cycle's clock (`lib/home/pauses.ts`); a cycle has no pause of its own.
- The cycle "Remove" (`CyclesScreen.tsx:115`) calls `setCompoundCycle(null)`: the compound runs on without
  weeks off. A cycle that reaches its end stops the compound and the page hides it (`CyclesScreen.tsx:63-68`).
- `stepFor` ignores the unit (fix: whole steps for tab, capsule, drop).
- Blends: the Home glance shows single compounds; a blend's parts switch with tabs (Sorbet lines).
- Sites sheet props: `history`, `historyWindow`, `dayChips`, `freshestId` (`InjectionSitesSheet.tsx`).

## 5. Migrations and data
- 025 (`supabase/protocol/025_dropper_enums.sql`) and 026 (`026_stock_spares_and_dropper.sql`) are written,
  PGlite-tested and NOT applied. They wait for the merge and Adrian's yes. Before any of it: hint every embed
  between `protocol_compounds` and `inventory_items` with the FK name
  (`protocol_compounds!inventory_items_protocol_compound_id_fkey!inner(...)`) on this branch AND origin/main,
  or 026's second FK empties Stock for every live user (PGRST201). Then 025 alone; then 026 in one transaction
  with `SET lock_timeout='5s'`, avoiding :00/:15/:30/:45 (the cron); then check the view's reloptions and ACL and
  the API logs for PGRST201. The seed `002` regeneration (`half_life_estimated`) goes in at the merge.
- Ended cycles need a record (new). Prefer a design with no schema change (e.g. kept like stacks, device-first
  and synced). If it truly needs one, write the migration, test it in PGlite, do NOT apply it, and build the UI
  behind the data layer so it lights up once applied. Say so in the summary.
- Never apply any migration without Adrian's explicit yes. Never delete driancomedia@gmail.com.

## 6. Out of scope
Dose, protocol, cycle and vial event actions (the Cycles-page Pause/Resume button, anything that STOPS a
compound); cycle ramps and complex patterns; logging a dose on another day; an "if you dose now" preview; a
cycle ending when a chosen vial runs dry (`VIAL_END_SUPPORTED=false`); dropper mL steps on Home; the NDT
components field; bloods PDF upload.

## 7. Build order (a gate after each phase)
0. Read, baseline: `npm run check` green before you touch anything; note the test count.
1. The look: tokens (2.1), fonts (2.2), Instrument presets (2.3), shapes (2.4), the ramp util (2.5), nav icons
   (3.6). Sweep the app so every surface uses the presets. Onboarding included.
2. Home, part one: the dose row, panels, Track, tick, edge (3.2); first run bubble and the pop-up (3.1);
   Journal and markers (3.5).
3. Home, part two: the half-life rail, graph, ½ model, key pop-up, no auto-scroll (3.3); sites (3.4).
4. Protocol: compounds with stock, the sheet, Schedule card and page, three tiles, explainers (3.7, 3.8);
   remove the Stock page and route everything to the sheet; Add stock and Mix (3.12).
5. Stacks and Cycles (3.9, 3.10), including Ended and `restoreStack`.
6. Half-life pages (3.11).
7. Progress (3.15), the + (3.6), the syringe (3.13), containers (3.14).
8. App-wide (3.16): the 30 fixes, pop-up motion, toasts, reduced motion, site names, landing previews.
9. Final: `next build`, the full visual pass, the sample user, the summary, the three review prompts (§9).

## 8. Gates, every phase
- Check each change at 390x844 AND 375x548, in Chromium AND WebKit, and look at the screenshots yourself.
  Record motion per frame with an in-page requestAnimationFrame recorder (evaluate round-trips lie).
- `npm run check` green. Update `Context/progress-tracker.md` (state) and `Context/next-tasks.md` (steps).
- Commit on the branch in the repo's style (plain-English sentence subjects; the trailer your session gives).
- Report in a few plain lines. `next build` at the end.
- Test setup: dev server via `~/trakabl-mockups/final-check/tools/hl-serve.cjs` on 0.0.0.0:3217 (reuse it if
  running; kill only your own PID); use `localhost`, not 127.0.0.1; the burner account
  `burner-halflife@trackdco.app` (login helper `tools/s-login.cjs`, `BURNER_PW` from the prompt); one server
  and one browser at a time. Dev preview pages: `/preview/home`, `/preview/protocol/*`.

## 9. When the build is done
You cannot open new chats, so:
1. **Sample user.** Walk the real app on the burner as a first-time user who runs TRT plus two peptides:
   add a compound, log the first dose, open the half-life card, add and mix stock from Protocol, pause a
   compound, end and delete a cycle, add photos. Screenshot each step and write their honest thoughts
   (confusions, hesitations, words they didn't understand) to `Context/reviews/sample-user.md`.
2. **Summary** for Adrian: what was built per phase, what was skipped and why, anything waiting on him (a
   migration, a spec clash). A few plain lines per phase.
3. **Do not push** the branch.
4. **Three cold-review prompts**, one per lens, each standalone and read-only except for writing its report:
   (a) functionality: every flow in this brief does what it says, on the real app, both engines, both sizes;
   (b) bugs: code-level correctness, edge cases, regressions, data integrity, tests, types, the migration plan;
   (c) design and simplicity: fidelity to the final-check page and ui-context, motion, accessibility, and
   "is this simple". Each writes findings (ID, severity, file:line or screen, repro, fix) to
   `Context/reviews/cold-<lens>.md`. Save the three prompts to `Context/reviews/PROMPTS.md` and give them to
   Adrian in your final message, ready to paste into three new chats. Once their reports exist, a chat told to
   "act on the reviews" reads all three files and fixes what they found.
