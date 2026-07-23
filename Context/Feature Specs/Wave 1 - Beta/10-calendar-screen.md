# Spec: Calendar Screen

> **Built + evolved 2026-06-13 (Adrian-directed).** The first cut followed this
> spec verbatim (month grid, muted weight/markers/journal dots + active band,
> day-detail sheet). Adrian then directed a **Milligram-style** redesign, which
> SUPERSEDES parts of §3/§4 below:
> - **Day cells are adherence RINGS, not dots** — filled disc (logged: a dose,
>   journal, or weight + a tiny type icon), dotted ring (scheduled, unlogged),
>   regular stroke (past, nothing due), faint stroke (future / pre-protocol).
>   Stays health-data-neutral (white/stroke, never green/red); amber = selection
>   only. Scheduled-or-not is read from the device stack's cadence (`isDueOn`).
> - **Month/year dropdown picker** ("June 2026 ⌄") replaces prev/next chevrons;
>   a **"Today"** button + an **ⓘ "Calendar key"** legend sheet sit in the footer.
> - **No top-right control** — a Month ⇄ Agenda view switcher was built then
>   **removed at Adrian's direction** ("doesn't do much"). So §2's "month grid
>   only" stands; the corner is left clean. A per-compound **filter** was prototyped
>   and parked (re-addable in one step). The bigger per-compound "Protocol" view
>   (adherence ring + concentration curve, from the Milligram flow) is deferred to
>   its own spec.
> Entry point, data sources, deep-links, read-only stance, and the reserved Photos
> row are all unchanged from below.

**Context files (read before starting):** `AI-workflow-rules.md`, `architecture.md`, `code-standards.md`, `ui-context.md`, `project-overview.md`, `next-tasks.md`, `progress-tracker.md`. `ui-context.md` is the primary styling reference — every visual decision below defers to it.

**Workflow reminder:** Implement one step at a time. After each step, stop, confirm it builds with no TypeScript/lint errors and renders correctly on the mobile frame, then proceed. Do NOT batch steps. Do NOT create new shared components without flagging and asking first — reuse the existing primitives (cards, bottom sheets, the Home week strip's day-cell styling). Where a path, route, table, or column conflicts with the repo or live Supabase schema, FLAG it and reconcile against `architecture.md` and the schema — do not guess and do not duplicate.

**Data is real and read-only.** Every section reads existing Supabase tables, scoped to the logged-in user. The Calendar does NOT create or edit data — it surfaces it. Tables already exist; do NOT create, migrate, or alter schema. If a table or the client can't be found, FLAG and pause — do NOT fabricate mock data.

---

## 1. Goal

Build the Calendar screen — the date-first history view. Tap any day to see, in one place, what the user was running, their weight, their dialed markers, and their journal for that day. It is the long-range "look back" companion to Progress (which is metric-first); Calendar is date-first. Populated, read-only review this round.

---

## 2. Out of Scope (do NOT build)

- Do NOT create, migrate, or alter any Supabase table. Read the existing schema and follow it.
- Do NOT fabricate mock data. If a source is unreachable, flag and pause.
- Do NOT edit or create any data from the Calendar. It is read/review only. Tapping an item deep-links to its existing editor in Journal/Progress — editing happens there, not here.
- Do NOT build progress photos — no photo row content, no thumbnails, no upload, no storage. Leave the Photos slot reserved and empty pending the storage decision (see note in chat). Do NOT wire any photo source this round.
- Do NOT add it as a new bottom-nav tab. The nav stays five elements. Calendar is reached from the entry point in Step 1.
- Do NOT build a week or agenda alternate view. Month grid only this round.
- Do NOT build empty / first-run states. Wire the populated state; empty days simply show nothing in their rows.
- Do NOT duplicate the weight, journal, or protocol detail screens. Calendar reads the same sources and deep-links to the existing detail/editors.
- Do NOT introduce colours, fonts, radii, or transition tokens outside `ui-context.md`.

---

## 3. Design Decisions

Refer to `ui-context.md` for everything visual — Obsidian background, hairline borders, Playfair Display headings, Instrument Sans UI text, JetBrains Mono for dates/numbers, radius scale, spacing, and the amber accent (`#E2A33D`).

**Data & auth.** All data is per-user. Read the current user from the existing auth/session and scope every query to that user. Follow the existing Supabase access pattern. FLAG the current-user accessor if it can't be found.

**Entry point (PROPOSED — confirm).** A calendar icon in the top-right of the Progress screen header opens the Calendar screen. This keeps both look-back modes (trends + calendar) grouped under Progress without adding a sixth nav tab. Reconcile against `architecture.md`; flag if a different entry point is preferred.

**Calendar grid.** A month grid, navigable to previous/next months. Today is indicated; the selected day is amber (reuse the Home week strip's selected-day treatment). Honour the amber-restraint rule — selected day is the only amber element; everything else is muted/hairline.

**Day indicators.** Each day cell carries up to a few small muted dots showing what's logged that day — weight, markers, journal — plus a subtle hairline band/underline if a cycle/compound was active that day. Indicators are muted tones, never amber. Keep them minimal so the grid stays calm.

**Day detail.** Tapping a day opens a day detail (bottom sheet, reusing the existing sheet primitive) with the date as the heading and these rows, in order:
1. **Running** — the compounds/protocol active on that date, derived from the cycle/protocol schedule (the date ranges per compound/cycle). If the schedule data carries no date ranges, FLAG it.
2. **Weight** — the weight logged that day, if any. Tapping deep-links to the canonical weight view.
3. **Markers** — the marker words dialed that day (from the journal marker entries). Read-only words.
4. **Journal** — the day's write entry/entries (body preview). Tapping deep-links to that entry's view/editor in Journal.
5. **Photos** — RESERVED slot, empty this round. Do not wire or render photo content; leave the row stubbed/hidden pending the storage decision.

---

## 4. Implementation

Proposed paths below — reconcile against `architecture.md` and the existing screens before creating anything. Mirror existing route, component-folder, and data-access conventions; flag if they differ.

**Step 1 — Calendar screen scaffold + entry point.**
Create `CalendarScreen` (Obsidian background, "Calendar" display-font title). Add the entry point: a calendar icon in the Progress header that navigates here. Register the route per `architecture.md`.
*Verify:* the Progress header icon opens `CalendarScreen`; it renders; back returns to Progress.

**Step 2 — Data layer.**
Read, user-scoped, from the existing Supabase tables for: weight by date, journal entries (body + marker word values) by date, and the cycle/protocol schedule (to resolve active compounds for any given date). Follow the existing access pattern.
*Verify:* each source reads for the current user; FLAG any missing table/column/client — no mocks.

**Step 3 — Month grid.**
`MonthGrid`: render the current month, prev/next navigation, today indicated, selected day in amber. Tapping a day selects it.
*Verify:* month renders, navigation works, selection lands on the right day, today is marked.

**Step 4 — Day indicators.**
Add the per-day muted dots (weight / markers / journal) and the subtle active-cycle band, driven by the real data for each day in view.
*Verify:* indicators match the underlying data for sample days; nothing amber except the selected day.

**Step 5 — Day detail sheet.**
On day tap, open `DayDetailSheet` with the date heading and rows in order: Running → Weight → Markers → Journal → Photos(reserved/empty). Weight and Journal rows deep-link to their existing views/editors. Photos row stays stubbed.
*Verify each row in turn:* Running resolves the right compounds for the date; Weight shows that day's value and deep-links; Markers list the day's words; Journal shows the day's entries and deep-links; Photos renders nothing/stub.

**Step 6 — Final pass.**
Confirm the grid + sheet styling against `ui-context.md`, amber-restraint check, deep-links land correctly, no TypeScript or lint errors.

---

## 5. Check When Done

- [ ] Calendar reached via the Progress header calendar icon (not a sixth nav tab); route registered.
- [ ] Month grid: prev/next navigation, today indicated, selected day amber (and the only amber element).
- [ ] Day cells show muted dots for weight/markers/journal + a subtle active-cycle band; nothing amber but the selection.
- [ ] Tapping a day opens the day detail sheet with rows in order: Running → Weight → Markers → Journal → Photos.
- [ ] Running resolves the active compounds/protocol for that date from the schedule data.
- [ ] Weight and Journal rows deep-link to their existing canonical views/editors; Calendar creates/edits nothing itself.
- [ ] Markers row shows the day's dialed words, read-only.
- [ ] Photos row is reserved and empty — no photo content, source, upload, or storage wired.
- [ ] All data real, user-scoped, read-only; no schema created or altered; no mock data.
- [ ] Reused existing card/sheet/day-cell primitives; no new shared components without flagging.
- [ ] No new nav tab, no week/agenda view, no empty states, no editing from the Calendar.
- [ ] No TypeScript or lint errors.