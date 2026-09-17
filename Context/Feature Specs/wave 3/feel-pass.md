# Feel pass: loading, press, number pad, sheet motion (wave 3)

**Status:** designed through six rounds of an interactive prototype, and
**every section approved by Adrian in round 6 (2026-09-17)**. Build on branch
`polish/feel` (worktree `../trackd-feel-wt`, cut from `main` at `ac222fa`).
Nothing below is built yet.

**Approval record** (round in which each section was last approved):
- press (r1)
- loading, tabs (r2)
- copy, after-Track "Mono", log-dose body map with no leader dot (r5)
- graphs with no count-up, and the number pad (r6)

Where this brief and the prototype disagree, **this brief wins**: it carries
Adrian's final notes, some of which came after the last prototype version
(see §9).

**The prototype is the reference, not the code.** It is a single HTML file:
- Published: https://claude.ai/artifact/6hRaiTJRofP5wKqYbAmJu2 (v8, "Round 6").
- Local copy: `Context/Feature Specs/wave 3/feel-pass-prototype/trackd-feel-test.html`,
  plus `body-subq.js` and `wordmark.png`.
- The "Today / Proposed" switch compares the app as it is with what was approved.
- Adrian's verdicts and notes for every round are in the artifact's database,
  in the collections `signoff`, `signoff-r2` … `signoff-r6`. Read them with the
  Artifact tool (`action: "read_db"`, `db_op: "list"`). The latest note in each
  section overrides earlier ones.

The prototype's code is a proof of feel. It is vanilla JS inside an IIFE, and
it is not how the app is built. Port the behaviour into the real components,
using the app's own conventions (React, Tailwind v4 tokens, `lib/ui-presets.ts`,
recharts, Phosphor through `@/components/icons`).

---

## Goal

Every flow feels smooth and deliberate instead of choppy:
- screens never flash the wrong state while loading;
- every tap visibly lands;
- number entry never drops the keyboard between fields;
- sheets arrive without snapping or growing;
- graphs arrive with one considered motion.

## Out of scope

- The app-wide surface restyle (`Context/PROMPT-app-surface-restyle.md`). That
  is its own spec.
- Any change to data, schema, RLS or billing.
- Date and time pickers. They stay native.
- Text fields (names, notes, search). They keep the system keyboard.

---

## Decisions (all signed off by Adrian)

### 1. Loading screens

- **Skeletons, never the empty state, while data is unknown.**
  - Shaped like the real cards, in `--bg-surface-raised` on the card surface.
  - Graph cards get a **ghost graph**: the same smooth curve and taper as the
    real chart, in skeleton tones, not a flat block.
  - The Progress photos skeleton follows the app's real photo card shape.
- **The pulse is the "wave".**
  - Opacity 0.5 → 1 → 0.5 over 1.9s, ease-in-out, infinite.
  - Each block is delayed by its row: `--i` = round(offsetTop / 70px) × 110ms,
    so the breath travels down the page.
  - This is the one sanctioned loop outside `/onboarding`, and only while
    loading. It collapses to static under reduced motion.
  - Write this exception into `ui-context.md`.
- **Sequence.** The skeleton fades in (320ms), waves, then fades out (240ms,
  absolutely positioned over the content) while the real content fades up
  through it with `animate-home-up` (520ms, house ease, 55ms stagger).
  **One rise per arrival:** the title and week strip fade in without moving,
  and only the content rises.
- **Week strip while loading.** Home's date numbers and day letters wave with
  the page. The status dots are hidden and fade in when the data lands.
- **Skeletons only when something is actually loading.** Show them on the
  first open of a screen in a session. A revisit shows the screen at once.
  - For server-rendered tabs, that needs Next's client router cache for
    dynamic pages (`staleTimes`). Check `node_modules/next/dist/docs` for the
    Next 16 name and behaviour.
- **Tabs switch the moment you tap.**
  - Give every tab route a `loading.tsx` (dashboard, protocol, progress,
    profile, calendar, and any others reached from the tab bar or Home), so
    Next prefetches the loading shell and never waits on the server before
    switching.
  - Today a dynamic route with no `loading.tsx` keeps the old screen up until
    the server answers, so the tap feels ignored.
- **Home root cause, and the fix it needs.**
  - `HomeScreen` renders `EmptyLogCard` whenever `stack.length === 0`.
  - The server snapshot is always `seedStack = []`.
  - `useCloudHydration` exposes no "hydrated" flag.
  - So the first-run instructions show on every load, and for seconds on a
    fresh device.
  - Fix: add a hydration-state signal (store-level, e.g. `hydrated` alongside
    the stack snapshot).
    - Render the skeleton while the stack is empty **and** not yet hydrated.
    - Render `EmptyLogCard` only once hydration has finished and the stack is
      still empty.
    - A device that already has a stored stack renders it immediately.
  - Mind `loadStack` returning `null` for `[]` (`lib/home/stack.ts`); "empty"
    and "never loaded" are currently stored the same way.
  - Handle the offline case. If hydration fails, fall back to what the device
    has, and show the existing sync-failed signal rather than a skeleton
    forever.

### 2. Press feel (approved round 1, unchanged since)

One shared system, not per-component `active:` classes. iOS applies `:active`
late and briefly, so a JS pressed state is the reliable way to make a quick
tap visible.

- **Mechanism.** An attribute (e.g. `data-press="<variant>"`) and one delegated
  listener.
  - `pointerdown` adds `is-pressed`.
  - On release, it stays on for at least **110ms** after it was applied.
  - `pointercancel`, or movement over 10px, removes it immediately.
  - Rows and cards wait **45ms** before pressing, so a scroll that starts on
    them doesn't flash every row. Keys, ticks, text buttons, icons, tabs, the
    FAB, pills and fields press instantly.
- **Variants.** Press-in is 70ms; release is 180ms on the house ease.
  - card / button: scale 0.97, opacity 0.85
  - row: scale 0.97 plus a `--bg-surface-raised` background
    - A Home compound row presses as a whole when its name, specs or "⋯" is
      touched. The tick presses on its own.
  - text button (Cancel, Track): opacity 0.45
  - icon button: scale 0.9 plus a raised round backdrop
  - tick: scale 0.86
  - tab: scale 0.92, opacity 0.7
  - FAB: scale 0.92
  - week day: scale 0.92 plus a raised background
  - field: scale 0.98
  - pill: scale 0.94, opacity 0.8
  - pad key: scale 0.95 plus `--bg-input`
- `PRIMARY_BUTTON`'s `active:scale-[0.99]` currently snaps, because only
  opacity is transitioned. Fold it into the system.
- Add the variants to `lib/ui-presets.ts` and to the Motion section of
  `ui-context.md`. Under reduced motion, drop the scale and keep the opacity.

### 3. The Trackd number pad (approved: the "Focus" layout)

- **Scope.** It replaces the iPhone keypad for **number** fields only.
  - The survey found none of the app's number inputs had `enterKeyHint`,
    Enter handling or a `<form>`, and the iOS decimal pad has no Return key.
  - Coverage: the LogDoseSheet dose; AddCompoundSheet dose, "every N days",
    extra-dose amount, cycle days on/off and rounds, and all stock fields;
    AddStockSheet stock fields; the Calculator (powder, BAC water, dose);
    the weight (see below); the AddProgressPhotoSheet weight; the OneOffSheet
    amount; the CycleRuleSheet numbers; the BlockCreateSheet number; the
    PhysicalCard number.
  - Audit for others with `inputMode="decimal"|"numeric"` and `type="number"`.
- **Shape.**
  - One panel slides up over the whole phone: radius 24, `--bg-surface`,
    320ms in and 240ms out on the house ease.
  - Behind it, a 42% black scrim. On the Calculator only, there is no scrim.
  - Tapping the scrim hides the pad.
  - The panel is **not** docked inside the sheet. The form never shrinks or
    grows when the pad opens.
- **Focus layout, top to bottom.**
  1. **Readout.** The field label as an eyebrow, then the value (44px, light),
     then the unit.
  2. **Field chips** (multi-field forms). One chip per field, showing its short
     label and current value. A **white sliding thumb** marks the active field
     and re-fits as the value grows. Tap a chip to jump to that field.
  3. **Open keys.** No key boxes, a 3×4 grid: 1–9, `.`, 0, ⌫. Rows are 50px.
  4. **Bottom row.** A hide chevron, then **Next →**, which becomes a white
     **✓ Done** on the last field.
     - No field name on the Next button. Adrian rejected "Next: BAC water".
- **Calculator variant (compact).**
  - The chips *are* the fields: label, value and unit, with the active one
    filled white.
  - Keys are 42px rows (34px when the viewport is ≤650px tall, which also
    hides the chip labels).
  - The bottom row carries the **mg/mcg toggle** for the active field, kept in
    step with the form's own unit pill.
  - Opening the pad scrolls the Draw section to the top and **pins it**
    (sticky), so the draw figure and syringe stay in view with the results card
    just under them.
  - The syringe's fill and stopper animate to the new value (420ms, house
    ease).
  - The form fields behind update live.
- **Behaviour.**
  - At most 6 digits and one decimal point. `.` is disabled for integer
    fields. A rejected key shakes.
  - An empty field is empty: **no placeholder numbers**, anywhere the pad is
    used.
  - A laptop keyboard drives it: digits; `.` or `,`; Backspace; Enter or Tab
    for Next; Shift+Tab for previous; Escape to hide.
  - The field being edited shows a white ring and a caret.
- **Log weight is the pad and nothing else.**
  - Tapping Log weight (the Weight card, quick actions, or empty state) opens
    the pad straight away, with no sheet and no "Dated today".
  - The last weight is prefilled and **selected**: the first key replaces it,
    and Delete clears it.
  - **Done saves** and shows the drop-down notice ("Weight logged: 85.2 kg",
    with the amber outline and no icon; see §9). The hide chevron or a scrim
    tap cancels without saving.
  - When opened from the day editor for a past day, put that date in the pad's
    label, because the sheet that used to state it is gone. The rule in
    `ProgressPhotoSection` / `AddWeightSheet` about not misfiling back-dated
    entries still applies.
- **Accessibility.**
  - Keys are real buttons with labels.
  - Fields are buttons with an `aria-label` carrying the value.
  - The pad is announced as a group.
  - Focus goes somewhere sensible when the pad closes.

### 4. Sheets: land, then rise

- **House timing.** Sheets already open on 320ms and close on 240ms
  (`components/ui/sheet.tsx`, 2026-09-11). Keep that.
- **Contents.** Each section fades up 10px over 320ms on the house ease,
  starting at 140ms with 40ms stagger, so they rise as the sheet lands.
- **Late data fills space that is already reserved.** It never pushes. Hold a
  skeleton row for the Draw row and the stock card, then crossfade.
- **LogDoseSheet root causes.**
  - It refetches `listInjectionSiteCatalogue()` on every open, although the
    dashboard already loaded it and passes it to `HomeScreen` as
    `injectionCatalogue`. Pass it through.
  - `resolveDrawSources`, the catalogue and `listStock` are **server actions**,
    and Next runs server actions one at a time (see
    `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`).
    Combine draw and stock into one call, or read them in a route handler or
    server component, so they arrive together.
  - The Draw row appeared late and grew the sheet by 53px.
  - The body map rendered 500KB of paths during the slide.
- **Body map arrival.**
  - The body fades in once the slide has landed (about 330ms).
  - The injection sites then fade in (280ms, 30ms stagger, from about 450ms).
  - Then the day chips and leader lines appear (+300ms).
- **Layout trap.** In a flex-column scroll body, every section needs
  `flex-shrink: 0`. In the prototype, `overflow: hidden` cards were squashed to
  half height, which is what "I can only see the shoulders" was.

### 5. Log-dose body map (approved)

- **Front/Back** uses the app's original opacity crossfade (300ms). Only the
  pill slides (see §6). No flip, no slide.
- **The site being picked is the only full amber.** No white outline.
- **History in the picker** starts one shade down and gains one extra, faintest
  shade: heat = `1 - (d + 1) / (window + 1)` for `d < window` (Sub-Q 5, IM 7).
  - The rotation view keeps its own ramp (`siteHeat`).
  - Write this into `ui-context.md` next to the Spec 19 exception.
- **Day counts in the margins,** the way onboarding's `demo-body.tsx` does it.
  - A chip sits on the side the site is on (mirror-front: x < 50% is left),
    level with the site's centre, reading "Today" / "1 day" / "N days".
    - Style: mono 10px, `--bg-surface`, full radius.
    - Chips on one side stay at least 9% apart.
  - A **hairline leader** (`--border-strong`, 1px non-scaling) runs from the
    chip to the site's centre. **No dot at the end.**
  - Only the overall most recent site's chip reads amber.
  - Chips are recomputed when the view flips.
- **Under the map,** one reserved two-line slot:
  - "Last time: <site>, <yesterday | N days ago>."
  - Once a site is picked, it shows the existing observation line instead
    (the `REST_DAYS` amber rule).
- **The body reads whole.**
  - In the log sheet, the Sub-Q silhouette was nearly the same colour as the
    card behind it.
  - The prototype used body `#31312e` and regions `#46463f` on
    `--bg-surface-raised`. Choose tokens for this, and check the other
    BodyMap uses (InjectionSitesSheet, recency view) before changing
    `--muscle-region` globally.

### 6. Sliding pill thumb, on every pill menu

- **The pattern.** The journal's `MarkerDialer` `WordScale`: a thumb measured
  from the selected pill, transitioning left/top/width/height over 300ms
  ease-out, with no slide on first placement.
- **Build it once as a shared component** outside `components/ui/**`, which is
  protected.
- **Use it for:**
  - Front/Back
  - the Calculator syringe size and its mg/mcg pills
  - AddCompound / AddStock stock type (white thumb, dark text)
  - graph range pills (30D / 90D / All)
  - Home's week-strip selected day
  - the pad's field chips
  - any other segmented control found in the audit
- **Other rules.**
  - The thumb is the selection: selected pills lose their own background.
  - Under reduced motion there is no transition.

### 7. Graphs (approved round 6)

- **No count-up anywhere.** Figures show their value, as the app does today.
  - Remove the `ui-context.md` line saying `METRIC_VALUE` numbers count up.
  - A dose or draw figure must never animate: a mid-count dose is a wrong dose
    on screen.
- **First-load draw-in only,** once per session per screen, when the card is
  genuinely in view.
  - Observer root: the screen's scroller, with rootMargin bottom −64px for the
    tab bar.
  - It fires when the intersection ratio is ≥ 0.85, or when the card fills
    ≥ 90% of the visible band.
- **The draw.**
  - The line sweeps left to right over **1470ms** with a quintic ease-out.
    Mask with a px gradient that has a 2px soft edge.
  - A **tracer** rides the tip:
    - a 7px circle with a 1.5px border in the series colour, filled with the
      card's `--bg-surface`;
    - positioned from the rendered path, sampled with `getPointAtLength`, and
      offset by the svg's position in its wrapper;
    - it fades out over 320ms when the line finishes.
  - The **area gradient** stays hidden during the sweep, then fades in over
    520ms.
  - The white end dot on Weight is revealed by the sweep.
  - Revisits show everything finished.
- **Overlapping draws.** A newer draw of the same chart owns it, and an older
  one must not finish it early. The prototype tags each clip with its run.
- **Range switching is unchanged.** The app remounts the chart per range
  (`key={rangeId}`) with recharts' 450ms ease-out line and a non-animated area.
  Keep exactly that. No tracer, no fill fade.
- **recharts.** During the first-load draw, disable the Line's own animation
  (`isAnimationActive`), mask the chart wrapper, and read the tip from the
  rendered `.recharts-line-curve`.
- **The ui-context ban.** The doc bans "scroll-triggered decorative lines".
  This is a data reveal Adrian asked for, so write it in as a scoped
  exception.

### 8. After Track: "Mono" (approved)

- **Replace the green full-bleed success state** in `LogDoseSheet` with the
  same moment in the app's own colours.
  - The overlay is `--bg-surface-raised`.
  - The ring pulses once with a rgba(240,239,233,0.35) border.
  - The circle is `--accent-primary` with a `--bg-base` tick (`home-tick-pop` +
    `home-tick-ring`).
  - "Tracked" / "Updated" in `--text-primary`, Geist sans.
  - It auto-dismisses at 900ms, or on tap.
- **After it closes,** the Home row's tick pops (the app's existing tick-pop
  and ring).
- **Update `ui-context.md`,** which currently documents the green state as
  sanctioned.

### 9. The drop-down notice (round-6 note, final)

- **Leave `components/notifications/amber-notice.tsx` as it is,** amber
  outline (`border-accent-amber/40`) included. Adrian reversed the round-6
  "no outline" change in his final note: "keep the amber outline".
- **The "Weight logged" confirmation** (§3) uses that same drop-down: same
  shape, blur and amber outline, but **no icon**.
  - The component's `Warning` glyph means a problem, so it is wrong on a
    confirmation.
  - Adrian rejected the tick the round-6 prototype showed ("I don't like the
    tick").
  - So add an icon-less variant (e.g. an `icon` prop that defaults to
    `Warning`) rather than changing the existing callers.
- **The round-6 prototype is superseded here.** It shows this notice with a
  tick and no outline.

### 10. New-account wording (approved)

`components/home/EmptyLogCard.tsx`:
- **Step 1 title:** "Start with a compound"
- **Step 1 body:** "Tap the white + at the bottom right. Find your compound in
  the catalogue, or create one."
- **Footer:** "Saved to your account. Only you can see it." This is the same
  sentence the log sheet uses. The old footer claimed "saved on this device",
  which is false.
- **Steps 2 and 3** are unchanged.
- No em dashes, as always.

---

## Implementation order (suggested; each step verifiable on its own)

1. **Foundations.**
   - Press system and presets.
   - Sliding-pill component.
   - Skeleton primitives: wave, ghost graph, crossfade helper.
   - Motion tokens and ui-context updates for all the exceptions above.
2. **Home.**
   - Hydration flag and skeleton.
   - Week-strip wave and sliding day pill.
   - Row press.
   - Log-weight pad.
   - First-load graph draw on the Weight card.
3. **LogDoseSheet.**
   - Catalogue passthrough.
   - Combined draw and stock read.
   - Reserved rows.
   - Land-then-rise.
   - Body map (crossfade, picker ramp, margin chips, last-site line).
   - Dose on the pad.
   - Mono tracked state.
4. **The number pad component,** then roll it through every number field
   (Calculator compact variant included).
5. **Tab routes.**
   - `loading.tsx` per tab, with skeletons shaped like each screen.
   - Router cache for instant revisits.
   - Progress graphs' first-load draw.
6. **The notice's icon-less variant (for the weight confirmation) and the
   EmptyLogCard copy.**
7. **Sweep.** Every other sheet gets land-then-rise; every other number field
   gets the pad; every other pill menu gets the thumb.

## Verification

- **Motion.** Measure it; don't eyeball it.
  - Record per frame with an in-page `requestAnimationFrame` loop. Round trips
    through `page.evaluate` read states that never paint.
  - Run in Chromium **and WebKit**, since iOS Safari is the real target.
- **Layouts.** Drive them at 402×700, 390×844, 375×548 and 360×560, with
  safe-area insets simulated. Check reduced motion collapses everything.
- **Gates.** `npx tsc --noEmit`, eslint, vitest, and a production build. In a
  worktree on iCloud, build with
  `TRACKD_TURBOPACK_ROOT=/Users/adrianschimizzi/Documents/GitHub`.
- **Before calling it done,** run an independent multi-lens review of the diff
  (runtime/state, iOS Safari, layout at phone sizes, spec fidelity) with an
  adversarial verify pass. Each prototype round shipped real bugs that this
  review found.

## Docs to update in the same change

- **`ui-context.md`:** Motion; States (loading); the Charts draw-in exception;
  the amber rules (picker ramp); the success state; the notice's icon-less
  variant; the press presets; the number-pad pattern.

## Working constraints (from this session)

- **The shared checkout.** `/Users/adrianschimizzi/Documents/GitHub/trackd-co-app`
  is shared with other live sessions, and is on another branch with
  uncommitted work.
  - Do all work in the worktree, and never switch that checkout's branch.
  - Never `pkill` a bare tool name. Kill only processes you started.
- **Dev server.** Start it through a small Node script that calls
  `next({ dev: true, dir, port })`, so other sessions' `pkill -f "next dev"`
  doesn't hit it. Use an unused port; 3217 was taken. Launch Playwright with
  `channel: "chromium"`. Kill both as soon as you're done, because Adrian's
  laptop is slow.
- **Python is blocked.** `/usr/bin/python3` fails until Adrian accepts the
  Xcode licence (`sudo xcodebuild -license`; his to run). Use Node for scripted
  edits.
- **`git status` in the worktree** can hang for minutes, because the repo is on
  iCloud. Background it or scope it to paths.
- **Shipping.** Nothing is committed on `polish/feel` yet. Commit when a phase
  is verified. Pushing to `main` deploys to production, so push or merge only
  when Adrian says so.
- **`progress-tracker.md` and `next-tasks.md`.**
- **`code-standards.md`,** if the number-pad rule ("number fields use the
  Trackd pad") becomes a standard.
