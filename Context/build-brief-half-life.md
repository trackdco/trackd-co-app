# Build brief: half-life, Today's Log, and Stock / Stacks / Cycles

Handover to a builder session, written 2026-09-24. The design is finished and every call
has been made by Adrian. This brief is the index; the canonical rules are in
`Context/ui-context.md`, and the steps and specs are in `Context/next-tasks.md`. If this brief
and those files disagree, the files win. Tell Adrian about the disagreement in your report.

## 0. Who and what

- **The product is Trakabl.** It was renamed from Trackd Co on 2026-09-21. The legal entity
  is still Trackd Co Pty Ltd. The name is never spelled "Trackable".
- **Adrian is the founder.** He decides things up front, then wants the work run without
  check-ins. Interrupt him only for:
  - a spec that contradicts the code
  - money
  - a destructive or outward-facing action
  - a finding he would want before more is built on top

  Otherwise work through the phases and report at the end of each one, in plain terms.
- **Style bar:**
  - "Simplicity sells": one label per figure, no helper sentences inside cards.
  - Readable text is `--text-muted` at minimum. `--text-subtle` is for decoration only.
  - Use the presets and tokens in ui-context verbatim, never approximated.
  - A container is always a vial, bottle, tub or dropper, never a jar.

## 1. Where to work

- **Worktree:** `/Users/adrianschimizzi/Documents/GitHub/trackd-halflife-wt`
- **Branch:** `design/half-life-motion`, cut from `origin/main` at 72dba59. Upstream is unset, and
  nothing on this branch has been pushed.
- **Never touch the main checkout** (`/Users/adrianschimizzi/Documents/GitHub/trackd-co-app`):
  - It holds another session's uncommitted admin work on `deletion/steps-1-2`.
  - Other Claude sessions share it, so never switch its branch.
  - Never `pkill` a bare tool name, and kill only the PIDs you started.
- **The repo is on iCloud.** Never `npm install` or copy `node_modules` into the worktree.
  Symlink both from the main checkout, exactly as `../trackd-feel-wt` does:
  ```
  cd /Users/adrianschimizzi/Documents/GitHub/trackd-halflife-wt
  ln -s ../trackd-co-app/node_modules node_modules
  ln -s ../trackd-co-app/.env.local .env.local
  ```
- **Dev server:**
  - Start it with `TRACKD_TURBOPACK_ROOT=/Users/adrianschimizzi/Documents/GitHub`, which
    `next.config.ts` reads, bound to 127.0.0.1 on an unusual port such as 3217.
  - Browse `http://localhost:3217`, not 127.0.0.1.
  - Other sessions run `pkill -f "next dev"`. Survive that by starting Next programmatically
    (`next({dev:true,dir,port})` plus `http.createServer`), so "next dev" never appears in
    argv.
  - Launch Playwright with `channel: "chromium"`.
  - Do not `rm -rf .next` casually. It has frozen the Mac through a Spotlight storm. Restart
    the server first.
  - If a CSS edit seems ignored, check that the rule is actually in the served chunk.
- **`python3` is blocked** by the Xcode licence (it exits 69 and runs nothing). Use node for
  scripted edits and grep afterwards.
- **Keep the laptop load light:**
  - one dev server, one Playwright run at a time, and at most one batch of background agents
  - kill what you start
  - if Adrian reports slowness, check the session count, swap and disk first
- **Next.js here has breaking changes.** Read the relevant guide in
  `node_modules/next/dist/docs/` before writing Next code (AGENTS.md).

## 2. Read first, in this order

1. `CLAUDE.md` / `AGENTS.md`
2. `Context/project-overview.md`, then `architecture.md` and `code-standards.md`
3. `Context/ui-context.md`, all of it. The sections this build lives in:
   - Surface treatment: the +1 contrast step and the app-wide `.flow-card` / `.flow-canvas`.
   - The "Pushed" colour level, and the Sorbet `--blend-1..3` tokens.
   - "The half-life card and Today's Log (decided 2026-09-24, NOT YET BUILT)".
   - "Motion and the five never-designed parts".
   - "Stock, Stacks and Cycles pages".
   - "Home half-life glance" (H5).
   - "Scroll" (the "Lighter" settle).
4. `Context/ai-workflow-rules.md`, and the top section of `Context/progress-tracker.md`.
5. `Context/next-tasks.md`, top section: "HALF-LIFE + LOGGING — BUILD TRACK". It includes "The
   curve model" spec and the build notes.
6. This brief.

## 3. The prototypes: the reference for look, numbers and motion

Read them with the Artifact tool (`action: "read"`). Each is a single HTML file, and the motion
code in them is real: springs sampled into WAAPI keyframes, FLIP moves, the tracer and the
scroll settle. Port values from them; don't guess.

| What | Link |
|---|---|
| Whole app on one phone: Home H5, Protocol half-life card, blends, Today's Log Flow B, curve model | https://claude.ai/artifact/6TdUNo2Mq56JnNARqnZ7Cw |
| Stock / Stacks / Cycles pages, stack logging, Protocol as-is + Schedule, edit-from-Home (A), laptop | https://claude.ai/artifact/ELsAnLtjny8JQCo3CY6HKj |
| Motion set, 15 rounds: dismiss, Track bar, scroll settle, blend rows, logging flow | https://claude.ai/artifact/LWtVifACjuM66UtLdHEqJy |
| Panel close, tile lift, card unfold, tinted blend tiles | https://claude.ai/artifact/EiHW96Dez9cQSM1eFjqZRX |
| Dropper, Mix, box of ten, Add stock sheet | https://claude.ai/artifact/3MKAPLNdwawkUFk5cPuLBr |
| Curve model before/after, with figures | https://claude.ai/artifact/Vwvq67fraBr5qSSYk3TV8B |
| Foot-tile icons (rack / vial in a loop / three levels, Glass, Sorbet, B2 tall tiles) | https://claude.ai/artifact/NMfJbkH2qwD7noHyE3qtqG |
| Home H5 swipe cards | https://claude.ai/artifact/4jc9EG2QuUcSUaDgRwMPaJ |
| Half-life research (already written to `compounds.csv`) | https://claude.ai/artifact/B8zwEk47HTJabqPzV16bpJ |

Adrian's recorded answers live in each page's database, readable with ArtifactData. They are
already transcribed into ui-context. Two artifacts are superseded and are not to be built:
- the Progress tile animation rounds (Progress stays as it is)
- the "track" stack flow

## 4. Everything decided: an index into ui-context

**Surfaces and colour**
- The +1 contrast step:

  | Token | Value |
  |---|---|
  | page | #0B0B0A |
  | base | #0E0E0D |
  | surface | #212120 |
  | raised | #2A2A28 |
  | border | #333331 |
  | border-strong | #45453F |
  | muted | #8A8982 |
  | subtle | #54544F |

  `.flow-card` / `.flow-canvas` go on every tab screen, with the inset surface for graphs.
- The colour level is "Pushed": a vial's liquid takes its `--cat-*` hue. The EXCEPTION is on
  the Stacks and Cycles pages, where vials take the stack's or cycle's own colour, and the
  pickers stay.
- The nav stays monochrome.
- Blends use Sorbet: #4682CC / #AC942F / #C35890.

**The curve model** is built FIRST and everything reads it. The full spec and test fixtures
are in next-tasks, "The curve model":
- one pure module `lib/halflife/model.ts`, the Bateman sum
- absorption half-time 0.09 × hl for injections and 0.35 h for oral, with NO floor
- "Of last dose left" = depot + circulating
- "Clears in" = when that falls below 3%
- sampling at dose times and peaks
- "Steady" anchored to the current run

"Circulating" stays as the label. BPC-157, TB-500 and GHK-Cu show a small "est." after the
half-life value, driven by a `half_life_estimated` catalogue flag, not a hardcoded list.

**Protocol page:**
- **It keeps its Compounds row with stock, EXACTLY as today** (`CompoundsRow` /
  `CompoundStorageCard`).
- **The half-life card:**
  - Per-compound rows open in place: O2 unfold, the other rows condense, and the up arrow
    spins in at the top right.
  - Inside an open row, top to bottom:
    - an inset graph that draws in with the tracer and scrubs like Weight
    - two tinted figure tiles, Circulating and "Of last dose left", with sentence-case labels
      below
    - a rows card: Half-life, Next dose, Steady, Clears in
  - There is no Details link.
- **Blends:** one line per component in Sorbet, with the component tabs on the sliding thumb.
  "All" shows a small tinted tile per component (F1 + L1).
- **The Schedule** (the week grid, as today) sits UNDER the half-life card.
- **At the foot:** three B2 tall grey tiles with coloured Glass icons: Stacks (a rack of three
  vials), Cycles (a vial in a loop of seven arcs, five lit) and Stock (three vials at
  different levels). Each tile pushes its own page.
- There is no segmented control.

**Home:**
- **The H5 half-life glance:** swipeable cards showing Circulating and %. Tapping a half-hidden
  card centres it. Tapping the card NEAREST the centre opens it in place, with the sparkline
  growing into the graph and the rows sliding in.
- **Today's Log, Flow B:**
  - **Tick circle:** the first tap opens the row and a second tap logs. On a logged dose, the
    tick un-logs. The name opens the row (edit mode when logged).
  - **The descriptor shows the DRAW** ("20 UNITS"). There is no Draw row.
  - **Open row:**
    - a Dose stepper, and Time ("Today · 9:41 AM", which opens the picker)
    - Site / Stock / Note tiles. Tapping one LIFTS it (K3) and opens its panel in place.
      Switching tiles drops the old content and raises the new (S4) inside a panel that stays
      open.
    - The panel closes with the up arrow in its corner, with room above it (D2). Nothing is
      logged until Track.
  - **The Track bar (A1)** rises on a spring and reads "Track 2 mg · Abdomen L". On Track it
    DROPS while the row takes the tick (the label gathers into a circled tick). In edit mode
    it reads "Save".
  - **The Log card border** fills a third per dose (L1). When full it stays amber and thins
    to a fine line, with the E4 finish, and the logged card goes darker.
- **Stack row:** the stack's tick stays ONE TAP and logs every member. A second tap un-logs.
  Open the stack to add a site, stock or note to a member afterwards, or untick a member
  first to leave it out.
- **The ⋯ on each row (option A)** opens the compound sheet without its Log button. The sheet
  holds:
  - Started and Schedule
  - Next
  - "Edit dose & schedule"
  - Skip this dose (only when nothing is logged)
  - Pause
  - Stock
  - Delete

  Skip and Pause have NO other entry point in the app, so this must ship with Flow B.
- **Add stock from a log row** is a sheet over the open row. The centred "Added" card stays,
  and there is no Refill offer.

**Stock, Stacks and Cycles pages:**
- **Shared header:** the existing "‹ Protocol" back link (the Blocks look-back pattern), then
  PAGE_TITLE. There is no header action.
- **Shared rows:** rows open in place with the up arrow. Destructive actions confirm by
  turning into two pills, Cancel and a red Discard / Remove / Delete, with no sentence.
- **Stock:**
  - Every running compound shows its in-use container at its real level, with doses left.
    Runs dry turns amber at 7 days or fewer.
  - An open row shows:
    - Doses left and Runs dry tiles
    - the containers, three across: the open vials (the old one marked NEXT is used first,
      and BOTH stay open and can be logged from), then grouped spares ("9 unreconstituted ·
      MIX FIRST", tap then "Mix one"; "1 unopened · OPEN FIRST", tap then "Open one")
    - Add stock · Correct · Discard
  - Compounds with no stock sit in a "No stock" card with a +.
  - Add stock is always for ONE compound. The type is implied and never asked, and the paired
    fields sit side by side (Powder | BAC water, Volume | Strength).
  - There is no multi-compound picker and no foot "Add stock" button.
  - Spares count toward doses left only once started.
  - Ended compounds' stock stays hidden.
- **Stacks:**
  - Each row shows the member vials in the stack colour, the name, the member count and time,
    and a colour dot.
  - An open row lists each member's dose and cadence, plus Edit.
  - "New stack" is a hairline card at the foot.
- **Cycles:**
  - Each row draws its rhythm (a cell per day, or a proportional bar for long cycles, with
    today marked) and shows the days on or off left.
  - An open row shows two tiles that NEVER wrap ("1 of 3" over "Round"), then Pattern /
    Started, then Edit · Remove.
  - A "No cycle" card lists compounds without a cycle, with a + that opens the sheet for that
    compound.
  - An ended cycle just ends and is HIDDEN.
  - A cycle can end when a CHOSEN vial runs out, defaulting to the one being logged from.
    This lifts `VIAL_END_SUPPORTED`, per container.

**Also decided:**
- "Unreconstituted" is the word for unmixed vials.
- The dropper is the new inventory form: mL steps for research liquids and per-drop for
  vitamin drops, with a screw collar and bulb.
- Custom compounds get an optional half-life field.
- Scroll: iOS-native Medium edge bounce, plus a per-card settle ("Lighter" = 0.6 of Light),
  app-wide.
- **Progress is UNCHANGED:** a tile opens its page. The expanding tiles and their animations
  are withdrawn.

**Laptop:** a rough placement is in the Stock/Stacks/Cycles artifact.
- Protocol keeps the compounds row full width, with the half-life card and Schedule side by
  side and the foot tiles under them.
- Stock, Stacks and Cycles open in the main column.
- Everything else follows the existing desktop system (`app/desktop.css`, the rail, sheets as
  rail/dialog).

## 5. Data-model changes (verify each against the schema before writing)

The latest protocol migration is `supabase/protocol/024_review_repairs.sql`, so new ones start
at 025. The Stock/Stacks/Cycles review found these gaps:
1. `inv_type_fields` requires `bac_water_ml` on reconstituted rows, so an unmixed vial can't be
   stored. Relax it so water, mix date and start date are all null or all set.
2. `acquired_on` defaults to today, so a spare would be saved as already started. A spare needs
   a null start. Mix and Open stamp today, and picking one in the log panel starts it.
3. `v_inventory_math` counts unmixed powder as doses. Exclude unstarted rows. Doses ready, spares
   held and runs dry need a per-compound read, not per row. Runs dry should count forward over
   the days a dose is due, skipping cycle off-days and pauses.
4. `updateStockItem` never writes `acquired_on`, so Mix and Open need their own action.
5. `vialOnDate` and `LogDoseSheet` pick the NEWEST vial. The rule is OLD first.
6. `listStock` returns `[]` on any error, so every card reads "Add stock". It must report the
   failure instead.
7. `addStockItem` archives every other active row. The rule is BOTH stay open, one row per
   container, and adding N containers inserts N rows.
8. The dropper is a FIFTH `inventory_type`; `bulk_powder` is already the fourth. The `ml` unit
   exists in `dose_unit`, but it is excluded from `inv_backed_dose_unit` and every
   unit-family mirror. "Drop" has no unit at all.
9. Blends need a `components` field (per-component lines, and later NDT as T4 168 h + T3 24 h).
10. There is a `half_life_estimated` flag on the catalogue, and an optional custom half-life
    (`add-to-stack-menu.tsx` hardcodes `halfLifeHours: null`).
11. `supabase/seed/002_seed_catalogues.sql` has been regenerated with the new half-lives. It is
    applied to the live database at merge, not before.

**Migrations touch the LIVE Supabase project**; there is no local stack. Write each migration
file under `supabase/<area>/`. Then ask Adrian ONCE per batch before applying anything with
the Supabase MCP `apply_migration`. Keep them additive and backward-compatible, because
production runs `main` against the same database.

## 6. Build order, with liberal estimates

Run each phase to its gates before starting the next. Commit on the branch as you go, in the
repo's commit style: a descriptive sentence title, and the Co-Authored-By line the harness
gives you.

| # | Phase | Est. |
|---|---|---|
| 0 | Set up the symlinks. Run the baseline `npm run check` and note anything already red. | 0.5 h |
| 1 | The curve model, `lib/halflife/model.ts`, with the fixture tests from next-tasks. | 1–2 h |
| 2 | Tokens and surfaces: the contrast step, `--blend-1..3`, `.flow-card`/`.flow-canvas` on every tab screen, "Pushed". | 2–3 h |
| 3 | Data layer: migrations 025+ (ask before applying), the stock read and write rules in §5, the dropper, units, components, flags. | 4–6 h |
| 4 | The Protocol half-life card and blends, the Schedule under it, the foot tiles, the "est." marks. | 5–7 h |
| 5 | Home H5 glance. | 2–3 h |
| 6 | Today's Log Flow B, stack row, the ⋯ sheet, add stock over the row, border fill and finish. | 6–9 h |
| 7 | The Stock / Stacks / Cycles routes (`/protocol/stock`, `/stacks`, `/cycles`), each with its `loading.tsx`, rows, sheets, Mix/Open, and the cycle vial end. | 6–8 h |
| 8 | The "Lighter" scroll settle, app-wide. | 1–2 h |
| 9 | Desktop placement. | 2–3 h |
| 10 | Cold review (a panel of reviewers if you have workflows), then fix regressions only. | 2–3 h |

The total is about 32–47 hours of agent time, so plan for several sittings. Report at the end
of each phase in a few lines: what shipped, anything that needed a call, and what is next.

## 7. Gates and verification, every phase

- `npm run check`, which is tsc, eslint, the gate audit and vitest. Also run `next build` at
  phases 2, 4, 6, 7 and 10.
- Look at every screen you change: 390×844, plus the SE at 375×548 for any flow screen, and
  WebKit as well as Chromium (iOS Safari is the real target). Don't make Adrian the check.
- Check motion with an in-page `requestAnimationFrame` recorder, never with `page.evaluate`
  round-trips. Aim for 60 fps. Don't blur large surfaces during a transition.
- Grep your diff for readable text set in `--text-subtle`, and for non-preset styling.
- Loading states are skeletons, never the empty state.
- Guard writes with `useWriteAccess().guard()`. The exception is Discard, which is deliberately
  ungated.
- After each meaningful change, update `Context/progress-tracker.md` (state) and
  `Context/next-tasks.md` (steps). If the build changes a rule, update ui-context first.

## 8. Hard lines

- Never push, merge to `main`, or open a PR. Pushing `main` deploys to production through
  Vercel. Adrian merges.
- Never apply a migration or the seed without asking first.
- Never delete the demo account `driancomedia@gmail.com` ("Marcus") or any real user data.
- Don't touch the admin work, the paused plus-menu rethink, the landing page, or Progress.
- When fixing review findings, reason about who else touches that data and in what state
  (stale device, second account, read-only, offline) before choosing a fix. Prefer read-side
  fixes.

## 9. Still open (not blocking the build)

- Natural Desiccated Thyroid waits on the `components` field.
- Survodutide's 144 h should be re-checked against Jungnik 2023, Table S2 (paywalled).
- Progress has no rounded-squares history strip; it is not being built.
