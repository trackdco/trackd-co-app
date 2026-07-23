# Spec: Progress Screen

> **BUILT 2026-06-13 — as-shipped deviations (Adrian-directed during the build;
> full record in `progress-tracker.md`).** Order is **Title → Weight → Progress
> photos → Bloodwork → Journal → Consistency** (photos added under Weight).
> • **Weight hero** = a summary that taps into the canonical `/weight` (not the
> full graph embedded). • **Bloodwork** = a dated **photo store** (attach a
> screenshot + note; over `lab_panels` + the `bloodwork` bucket) — the structured
> catalogue/charts/reference-bands version was built then removed. • **Journal**
> markers use a **searchable catalogue** (3 presets + add-more + custom), one
> entry/day. • **Consistency** = a scrubbable **adherence bar graph** from the
> device-local dose data (per-cycle deferred). • **Progress photos** = a NEW
> feature (NEW `progress_photos` table + `progress-photos` bucket): MacroFactor
> month/day gallery, swipeable card, before/after compare, pose catalogue +
> custom, weight linked by date, capture also embedded in the weight quick-log.
> This supersedes the original "do NOT build progress photos" line — the storage
> decision was made.

**Context files (read before starting):** `AI-workflow-rules.md`, `architecture.md`, `code-standards.md`, `ui-context.md`, `project-overview.md`, `next-tasks.md`, `progress-tracker.md`. `ui-context.md` is the primary styling reference — every visual decision below defers to it.

**Workflow reminder:** Implement one step at a time. After each step, stop, confirm it builds with no TypeScript/lint errors and renders correctly on the mobile frame, then proceed. Do NOT batch steps. Do NOT create new shared components (cards, sheets, charts, scrubber, dialer) without flagging and asking first — reuse the existing primitives from the Home build. Where a path, route, table, or column below conflicts with what is already in the repo or Supabase, FLAG it and reconcile against `architecture.md` and the live schema — do not guess and do not duplicate.

**Data is real this round.** Every section reads/writes existing Supabase tables. The tables already exist — do NOT create, migrate, or alter any schema. Before writing any data access, locate the existing Supabase client and the repo's established data-access pattern, read the live schema for each table, and follow it. If a table or the client cannot be found, FLAG it and pause that section — do NOT fabricate mock data to fill the gap.

---

## 1. Goal

Build the Progress tab — the metric-first "look back" screen. It is where weight, bloodwork, and journal logging live, kept separate from Home ("today"), Protocol ("the schedule"), and the Calendar (date-first history, separate spec). Single vertical scroll, weight as the hero, wired to real Supabase data and scoped to the logged-in user.

---

## 2. Out of Scope (do NOT build)

- Do NOT create, migrate, or alter any Supabase table or column. The schema exists — read it and follow it.
- Do NOT fabricate mock data. If a data source is unreachable, flag and pause that section.
- Do NOT build the long-range, cross-time marker history view here. That lives in the Calendar screen (separate spec). Progress shows the recent journal feed plus logging/editing only.
- Do NOT let users create brand-new journal markers. They can only switch on the existing optional ("false") markers.
- Do NOT use numbers for journal marker values. Values are the words defined in Supabase for each marker.
- Do NOT add edit-history/versioning to journal entries. Editing an entry in place is fine; keeping past versions is not.
- Do NOT build progress photos — no card, no placeholder, no upload, no storage. Deferred pending a storage decision.
- Do NOT build body measurements (tape). Not in this app yet.
- Do NOT add lab-report photo import or OCR for bloodwork. Values are typed in manually.
- Do NOT build a reference-range editor. Ranges come from the bloodwork metrics catalog if present; if a metric has no range, flag — do not invent one.
- Do NOT build the cycle overlay (protocol bands/markers on the charts). Later layer.
- Do NOT touch the center "+" button or the "Add to Stack" flow. Each Progress section gets its own "+ add" inside its own screen.
- Do NOT build empty / first-run states this round. Wire the populated state; empty states are the next pass.
- Do NOT add rich text, tags, or attachments to the journal free-write. Plain free text only.
- Do NOT create a second weight view. There is one canonical weight view (Step 3) — reconcile, do not duplicate.
- Do NOT introduce colours, fonts, radii, or transition tokens outside `ui-context.md`.
- Do NOT add habits, nutrition / macros, or any AI / chat bar. Trackd has none.

---

## 3. Design Decisions

Refer to `ui-context.md` for everything visual — Obsidian background, hairline borders, Playfair Display headings, Instrument Sans UI text, JetBrains Mono for all numeric/data values, the radius scale, spacing, and the amber accent (`#E2A33D`). Do not hardcode any of these; pull them from the file.

**Data & auth.** All Progress data is per-user. Read the current user from the existing auth/session (Adrian's setup) and scope every query to that user. Follow the repo's existing Supabase access pattern; do not roll a new one. If the current-user accessor can't be found, FLAG it — do not hardcode or invent a user.

**Layout.** Single vertical scroll of stacked cards, no sticky elements, Obsidian background. Screen title "Progress" in the display heading font at the top. Order, top → bottom: Title → Weight (hero) → Bloodwork → Journal → Consistency.

**Amber discipline.** Honour the accent rule in `ui-context.md` (no more than 3–4 amber elements visible per screen). On charts, amber is the active/highlighted series only. Reference-range bands, gridlines, and inactive series are muted/hairline — never amber.

**Cards, sheets & controls.** Reuse the existing card and bottom-sheet primitives from the Home build (the pattern used by `TodaysCycleCard` / `WeightCard` / `LogDoseSheet`). Reuse the existing press-and-hold scrubber and the Scale/Trend opacity-crossfade behaviour and transition tokens — do not reimplement either. Do not author new shared components without flagging.

**Journal — two ways to log, neither forced.** The journal "+" branches into two paths that both write to the same entries feed:
- **Write** — a free-write entry. The user may optionally attach markers, but markers are never required.
- **Markers** — dial markers without writing. No body required.
An entry must contain a body, markers, or both (at least one). Both fields are optional individually; confirm the existing entries table allows a null body and/or no markers, and FLAG if it forces one. Entries are editable in place and deletable.

**Journal markers.** Markers are global and defined in Supabase. Each marker has a preset flag (true = always shown when logging markers, false = optional) and an ordered set of word values. The "dialer" selects one word value per marker from that marker's words — single-select, words not numbers. True markers render by default in the Markers path; optional markers are added via a "+ add marker" picker listing the false markers. Users cannot create new markers.

**Bloodwork entry.** Keep it dead simple and clean: search the metrics catalog, tap the metrics that were measured, type a value for each, save. The fewest taps possible.

**Capture.** Each section adds its own data inside its own screen ("+ Add panel" for bloodwork, the "+" branch for journal). The center "+" is untouched.

---

## 4. Implementation

Proposed paths below — reconcile against `architecture.md` and the existing Home/Protocol screens before creating anything. Mirror the existing route, component-folder, and data-access conventions; flag if they differ.

**Step 1 — Progress screen scaffold.**
Create `ProgressScreen` as a single vertical scroll, Obsidian background, with the "Progress" display-font title at top. Register/confirm it as the Progress tab (replacing the current blank placeholder) per `architecture.md`.
*Verify:* the Progress tab navigates here, renders, scrolls, and shows selected (amber) in the bottom nav.

**Step 2 — Data layer.**
Locate the existing Supabase client and data-access pattern. Read the live schema for the tables backing: weight, consistency (cycle adherence), journal markers, journal entries, and the bloodwork metrics catalog (plus the user's recorded bloodwork values). Wire user-scoped read access to each, following the existing pattern.
*Verify:* each table can be read for the current user; FLAG any missing table, column, or client — do not proceed with mocks.

**Step 3 — Weight (hero).**
First check whether a weight-detail view and a Scale/Trend crossfade component already exist from the Home build. If so, host/reuse that as the canonical view here and FLAG any conflict — do not build a second weight view.
Render the hero at the top: current weight + delta, the trend graph with the Scale/Trend crossfade, a range toggle (1M / 3M / 1Y / All), and the press-and-hold scrubber — reading the user's real weight data. Point the Home `WeightCard`'s tap navigation at this canonical view.
*Verify:* renders from real data; crossfade, range toggle, and scrubber all work; Home's weight card deep-links here; only one weight view exists.

**Step 4 — Bloodwork.**
1. `BloodworkCard` on Progress: latest panel date + 1–2 headline markers (value + tiny up/down vs previous).
2. `BloodworkDetail`: list of the user's recorded metrics, each row showing latest value, its reference range (from the catalog), and trend direction.
3. Tap a metric → per-metric chart over time with the shaded reference-range band; tapping a point shows value + date.
4. "+ Add panel" → bottom sheet: search the metrics catalog → tap the metrics measured → type a value for each → save to Supabase (user-scoped); charts update.
*Verify each sub-step before the next:* card → detail list → per-metric chart → add-panel writes through to Supabase and the charts.

**Step 5 — Journal.**
1. `JournalCard` on Progress: most recent entry preview (date + body first line or marker summary).
2. `JournalFeed`: the user's entries, reverse-chronological, from Supabase. An entry renders for what it holds — a write entry shows its text, a marker entry shows its dialed words, an entry with both shows both.
3. The journal "+" branches into two paths:
   - **Write** → bottom sheet: date (default today) + optional title + free-text body, with an optional "+ add markers" affordance.
   - **Markers** → bottom sheet: the true/preset markers shown to dial (one word value each), plus a "+ add marker" picker for the optional false ones. No body required.
   - Saving requires at least one of body/markers. Persist to Supabase, user-scoped.
4. Tap an entry → read view (body + any marker words); allow EDIT in place and DELETE.
*Verify each sub-step:* card → feed → "+" branches correctly → each path persists and prepends → marker dialer shows Supabase words (true preset shown, false addable, no create) → read/edit/delete works.

**Step 6 — Consistency.**
`ConsistencyCard` on Progress: long-term adherence read from the consistency data (based on the user's cycle consistency) — % over the last 30 and 90 days, plus the per-cycle breakdown. Summary card only, no detail screen this round.
*Verify:* renders from real data, numbers read correctly.

**Step 7 — Final pass.**
Confirm order top → bottom (Title → Weight → Bloodwork → Journal → Consistency), spacing and dividers per `ui-context.md`, amber-restraint check, no TypeScript or lint errors.

---

## 5. Check When Done

- [ ] Progress tab renders `ProgressScreen`; single vertical scroll, nothing sticky, Obsidian background.
- [ ] Order top → bottom: Title → Weight (hero) → Bloodwork → Journal → Consistency.
- [ ] All sections read real Supabase data, scoped to the logged-in user; no mock data; no schema created or altered.
- [ ] Weight hero: current + delta, Scale/Trend crossfade, range toggle (1M/3M/1Y/All), press-and-hold scrubber — all working from real data.
- [ ] Exactly one canonical weight view exists; Home's weight card deep-links into it (no duplicate screen).
- [ ] Bloodwork: card → detail metric list → per-metric chart with shaded reference band → "+ Add panel" (search catalog → pick measured → type values) writes through to Supabase.
- [ ] Journal "+" branches into Write and Markers; an entry can be body-only, markers-only, or both; saving requires at least one.
- [ ] Journal entries persist to Supabase (can't be lost); entries are editable in place and deletable; no versioning.
- [ ] Journal markers: global, from Supabase; true shown by default when logging markers, false addable via picker, users cannot create new ones; values are the marker's words (not numbers), single-select via the dialer.
- [ ] Consistency card shows 30/90-day adherence + per-cycle from real data, summary only.
- [ ] Charts: JetBrains Mono values, amber = active series only, reference bands muted/hairline. Amber-restraint respected.
- [ ] Reused existing card/sheet/scrubber/crossfade primitives; no new shared components added without flagging.
- [ ] No Photos, no Measurements, no OCR, no range editor, no cycle overlay, no long-range marker history (that's the Calendar), no center-"+" changes, no empty states.
- [ ] No TypeScript or lint errors.