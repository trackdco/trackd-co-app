# Spec: Home / Dashboard Screen

**Context files (read before starting):** `AI-workflow-rules.md`, `architecture.md`, `code-standards.md`, `ui-context.md`, `project-overview.md`, `next-tasks.md`, `progress-tracker.md`. `ui-context.md` is the primary styling reference — every visual decision below defers to it.

**Workflow reminder:** Implement one step at a time. After each step in the Implementation section, stop, confirm it builds with no TypeScript/lint errors and renders correctly, then proceed. Do NOT batch steps. Do NOT introduce new shared components without flagging first (see `code-standards.md`).

---

## 1. Goal

Build the Home (Dashboard) screen — the default tab the user lands on. It is a glanceable status board: within ~3 seconds the user sees where they're at today and what's due, and can act directly (log a dose, scrub their weight trend, tap into a detail screen). The week strip is a pinned (sticky) header that stays visible while the cards scroll beneath it; everything else scrolls. Fully populated with realistic mock data for this pass.

---

## 2. Out of Scope (do NOT build)

- Do NOT build a Habits section. There are no habits in Trackd — do not invent one.
- Do NOT add a Journal card to Home. Journal stays off this screen for now (may be added later).
- Do NOT add any AI / chatbot input bar (e.g. Milligram's "Ask … anything"). Trackd has no AI surface.
- Do NOT add a nutrition / calories / macros hero. Trackd does not track nutrition — no calorie ring, no food search bar.
- Do NOT add ads, premium upsells, or promo banners.
- Do NOT build empty / first-run states yet. Spec the populated state only; empty states are a later pass.
- Do NOT pin or make sticky anything other than the week-strip header. The content cards all scroll, including the Reconstitution Calculator at the bottom. The sticky header lives only on Home — do NOT carry it onto detail screens.
- Do NOT add a greeting / "Hello {name}" block. The top of the screen is the week-strip header only (see Design Decisions).
- Do NOT build the detail screens themselves (weight detail, protocol detail, reconstitution calculator screen). Home only needs to navigate to them — wire navigation to existing routes or placeholders per `architecture.md`.
- Do NOT add new shared/global components without flagging. Reuse existing ones per `ui-context.md`.
- Do NOT add any new npm dependency (charting, SVG, gesture, animation, bottom-sheet libs, etc.) without flagging first. Check what the repo already uses and reuse it; if something genuinely needs a new package, stop and flag before installing.
- Do NOT wire real data sources. Mock data only, in one local fixture file.

---

## 3. Design Decisions

All styling per `ui-context.md` (Obsidian system): cool near-black background, Playfair Display headings, Instrument Sans UI text, JetBrains Mono for data/numbers, amber accent `#E2A33D` used sparingly, hairline borders. Active/selected = amber; default = gray.

**Layout (top → bottom):**
- **Pinned header (sticky):** Week strip + selected-day date label. Stays fixed while the content scrolls.
- **Scrolling content:**
  1. Today's Cycle (due items + consistency)
  2. Weight
  3. Reconstitution Calculator entry card

**Week strip (sticky header)**
- Pinned to the top of Home: it stays fixed while the content cards scroll beneath it (MacroFactor-style "always see the week"). It is part of the Home screen only — when the user taps a card and navigates to a detail page, that page is a normal full screen without this header.
- Mon–Sun, seven day cells, each showing weekday letter + date number.
- Selected day highlighted in amber; other days gray.
- Per-day status indicator (small dot) showing whether that day's protocol was logged — at-a-glance consistency.
- A slim date label for the selected day (e.g. "Tuesday, 9 June") sits in the header so the user always knows which day is in view; it updates as the selection changes.
- Interactive: tapping a day re-scopes the content (Today's Cycle + Weight) to that day, so a missed dose can be back-logged. Today is the default selection.
- Keep the header compact — a single row of day cells plus the date label. No greeting, no other controls in this pass.

**Today's Cycle (hero)**
- Card titled "Today's Cycle" (top-left).
- **Next dose line:** a prominent line near the top of the card reading "Next dose in {Xh Ym}" (e.g. "Next dose in 3h 20m"), showing time until the next scheduled item relative to the current time. Compute it once on mount/render from `nextDose` — do NOT run a live ticking timer (`setInterval`) for this pass. Shown only on today's view; when the week strip is scoped to a past day this line is hidden (a past day has no "next").
- Body: list of compounds due on the selected day. Each row styled like a Compound Library row — `{compound} · {dose} · {time}` (e.g. "Compound A · 0.5 mg · 8:00 AM") — with a `+` affordance on the right edge.
- **Tap targets (no overlap):** the `+` is an isolated hit area that opens the Log sheet and nothing else; tapping anywhere else on a row, or on the card chrome, navigates to the protocol detail screen. A row tap must never accidentally trigger logging, and a `+` tap must never navigate.
- Log sheet (bottom sheet / modal): pre-filled amount/dose the user can adjust, then a primary "Track" button.
- On "Track": show a brief full-bleed green success state with a tick that auto-dismisses after ~1.2s (or on tap), returning to Home with that row now marked logged and its day status updated (see Step 6). Keep it quick and clean.
- Below the due-items list, in the same section: a **Consistency** strip — a 30-day compliance view (dot-grid or mini-bar per `ui-context.md`). This is the long-term "how consistent have you been" read, folded into the cycle section.

**Weight**
- Card with current weight (large, mono) + change vs. prior.
- Trend mini line-graph.
- MacroFactor-style scrubber: press-and-hold on the graph shows a crosshair/intersect line at the touch point with that point's value + date; releasing returns the graph to its resting state.
- Tapping the card navigates to the weight detail screen.

**Reconstitution Calculator**
- Simple entry-point card, last in the scroll (bottom-most, but NOT sticky).
- Tapping navigates to the reconstitution calculator screen.

**Navigation pattern**
- Cards navigate to their detail screens on body tap (MacroFactor model). Inline affordances (the `+`, the scrubber) act in place without navigating.
- A detail screen is a separate full page reached via the app's normal navigation/back stack — the sticky week-strip header does NOT appear on it.

**Mock data**
- One local fixture file with realistic values: a believable current protocol (2–3 compounds with doses/schedules), ~30 days of weight data trending realistically, and per-day logged/missed status for the visible week. Realistic, not lorem.

---

## 4. Implementation

Follow `architecture.md` for the project's actual folder structure, navigation, and naming conventions — place files where existing screens/components live; the paths below are intent, not literal if they conflict with the repo. Follow `code-standards.md` for component patterns, typing, and lint cleanliness.

Build in this order, verifying each step before the next:

**Step 1 — Mock data fixture.** Create a single fixture (e.g. `home/mockHomeData.ts`) exporting: `consistency` (per-day logged/missed for the last ~30 days — the single source of truth for daily status), `todaysCycle` (compounds: name, dose, time, logged bool), `nextDose` (the next scheduled item's name + scheduled time, used for the countdown), `weightSeries` (~30 points: date + kg), `currentWeight` + delta. The week strip's 7 dots derive from `consistency` — do NOT keep a separate week array that can diverge from it. Realistic values. Verify it type-checks.

**Step 2 — Screen shell.** Create `HomeScreen` with two regions: a pinned header region at the top and a scrollable content region beneath it (the content cards live in the scroll, the header does not). Use the project's standard sticky-header pattern per `architecture.md` — do NOT reach for a new library if the repo already has a way to pin a header. Obsidian background per `ui-context.md`. Verify the content scrolls while the header region stays fixed.

**Step 3 — Week strip.** `WeekStrip` component: 7 day cells (dots derived from `consistency`), selected day in amber, tap selects a day and lifts selection state to `HomeScreen` (drives Today's Cycle + Weight). Verify selection re-scopes the mock data shown.

**Step 4 — Pin the header.** Render `WeekStrip` plus a slim selected-day date label inside the pinned header region from Step 2, so they stay fixed while content scrolls. Verify: scrolling the content keeps the week strip + date visible; the date label updates when a different day is selected; and the header is not duplicated/carried onto any detail screen.

**Step 5 — Today's Cycle card.** `TodaysCycleCard`: title + a "Next dose in {Xh Ym}" countdown line (today's view only) + due-items list (compound rows with `+`) + consistency strip below. The `+` is an isolated hit area that opens the Log sheet; tapping elsewhere on a row or the card chrome navigates to protocol detail (placeholder route ok). Verify layout, that the countdown is computed once (no live timer) and hides on past-day views, that a row tap never triggers logging, and that the `+` never navigates.

**Step 6 — Log sheet + success state.** `LogDoseSheet` (bottom sheet / modal): editable amount/dose + "Track" button. On Track → `TrackSuccess` full-bleed green tick state (auto-dismiss ~1.2s or on tap) → mark that row logged in local state AND flip the selected day's entry in `consistency` so back-logging a missed day is reflected in both the week strip dot and the Consistency strip. Verify the flow end-to-end on mock data, including that logging a re-scoped past day updates that day's dot.

**Step 7 — Weight card.** `WeightCard`: current weight + delta, trend line graph, press-and-hold scrubber (intersect line + value + date, returns on release). Before building the graph, check what charting/SVG and gesture capability the repo already has (per `architecture.md` / `package.json`) and reuse it — do NOT add a new dependency without flagging (see Out of Scope). The scrubber needs a touch/pan gesture mapping the X position to the nearest data point; use the gesture lib the repo already uses. Tapping the card (outside an active scrub) navigates to weight detail (placeholder ok). Verify scrubber behaviour matches the MacroFactor reference.

**Step 8 — Reconstitution Calculator card.** `ReconCalcCard`: entry-point card at the very bottom, navigates to the calculator screen (placeholder ok). Verify it is last in the scroll and not sticky.

**Step 9 — Wire into navigation.** Register/confirm `HomeScreen` as the Home tab per `architecture.md`. Verify the bottom nav (Home, Protocol, center `+`, Progress, My Profile) shows Home selected in amber.

---

## 5. Check When Done

- [ ] Week-strip header is pinned/sticky and stays visible while the content cards scroll; everything else scrolls.
- [ ] Content order beneath the header: Today's Cycle → Weight → Reconstitution Calculator.
- [ ] No greeting block anywhere on the screen.
- [ ] Week strip: selected day in amber, per-day status dots (derived from `consistency`), a selected-day date label in the header, tapping a day re-scopes the content (allows back-logging a missed day); today is the default selection.
- [ ] Sticky header appears on Home only — not carried onto detail screens.
- [ ] Today's Cycle shows a "Next dose in {Xh Ym}" countdown on today's view (hidden on past-day views).
- [ ] Today's Cycle shows due compounds with a `+` each; consistency strip sits below in the same section.
- [ ] `+` opens the Log sheet; "Track" shows the green tick success state, then marks the item logged.
- [ ] `+` is an isolated hit area: a row tap navigates and never logs; a `+` tap logs and never navigates.
- [ ] Logging a re-scoped past day flips that day's status in `consistency` (week dot + Consistency strip both update).
- [ ] Next-dose countdown is computed on mount with no live timer.
- [ ] Weight graph reuses existing charting/SVG + gesture capability; no new npm dependency added without flagging.
- [ ] Weight card scrubber: press-and-hold shows value + date at the touch point and returns on release.
- [ ] Every card navigates to its detail screen on body tap (placeholders fine); inline affordances act without navigating.
- [ ] Reconstitution Calculator card is bottom-most and not sticky.
- [ ] No Habits, no Journal, no AI bar, no nutrition hero, no ads, no empty states.
- [ ] Mock data only, in one fixture file; realistic values.
- [ ] No new shared components added without flagging; no TypeScript or lint errors.