# UI Context

## Theme

Dark only. No light mode. The design language is a calm, editorial
dark interface — near-black backgrounds with subtly layered card
surfaces, generous spacing, and restrained colour. **White is the
primary accent** (primary text, primary actions, emphasis); a warm
**amber** is the secondary signature accent, reserved for
active/interactive state (due doses, current selection, key
metrics, etc.). High-contrast serif display type
pairs with a quiet sans-serif for UI labels, giving a premium
"clinical journal" feel rather than a neon technical one.

## Colors

Defined as CSS-variable tokens in `app/globals.css` (Tailwind v4
`@theme` block — see Styling Notes). All components must use these
tokens — **no hardcoded hex values** outside `globals.css`.

| Role             | CSS Variable           | Value                    |
| ---------------- | ---------------------- | ------------------------ |
| Page background  | `--bg-base`            | `#111110`                |
| Surface          | `--bg-surface`         | `#1C1C1A`                |
| Surface elevated | `--bg-surface-raised`  | `#242422`                |
| Surface input    | `--bg-input`           | `#2A2A28`                |
| Primary text     | `--text-primary`       | `#F0EFE9`                |
| Muted text       | `--text-muted`         | `#7A7A74`                |
| Subtle text      | `--text-subtle`        | `#4A4A46`                |
| Primary accent   | `--accent-primary`     | `#FFFFFF`                |
| Amber accent     | `--accent-amber`       | `#C8861A`                |
| Green accent     | `--accent-green`       | `#4ADE80`                |
| Border default   | `--border-default`     | `#2E2E2C`                |
| Border strong    | `--border-strong`      | `#3E3E3A`                |
| Chart line (raw) | `--chart-line`         | `#6B7FD4`                |
| Chart fill       | `--chart-fill`         | `rgba(107,127,212,0.15)` |
| Chart trend      | `--chart-trend`        | `#4FB3A6`                |
| Chart trend fill | `--chart-trend-fill`   | `rgba(79,179,166,0.16)`  |
| Overlay backdrop | `--overlay-backdrop`   | `rgba(0,0,0,0.70)`       |
| Error            | `--state-error`        | `#EF4444`                |
| Success          | `--state-success`      | `#4ADE80`                |
| Warning          | `--state-warning`      | `#F59E0B`                |
| Destructive      | `--accent-destructive` | `#B91C1C`                |

### Rule: state colours are for system/UI feedback ONLY

`--state-error` (red), `--state-success` (green),
`--state-warning` (amber), and `--accent-destructive` (deep red, for
deliberate destructive actions — sign out, delete) are **strictly for
UI and system feedback** — e.g. a failed login, a save error, a
successful save, form validation, a destructive confirm. They must
**never** be used to style **health data**. Biomarker results and side-effect markers are presented
**categorically and neutrally** (below / within / above — never
high / bad / red, never good / green). Using red/green/amber to
imply a health value is "bad," "good," or "warning" violates the
"categorical, never evaluative" invariant in `architecture.md` and
is not permitted.

> ⚠️ Note: `--accent-green` and `--state-success` share the same
> value (`#4ADE80`). The same caution applies — green is for UI
> accent / system success only, never to signal a health value is
> "good." Chart colours (`--chart-line` / `--chart-fill`) are a
> neutral blue precisely so trend visuals stay non-evaluative.

### Category legend dots

Compound **categories** (anabolic / oral / sarm / peptide /
ancillary / thyroid / supplement / stimulant) get one muted dot
colour each, defined as `--cat-*` tokens in `globals.css` and
exposed as `bg-cat-*` utilities. These are an **organisational
legend** — they label a compound's *type*, not a health value — so
they sit outside the "categorical, never evaluative" rule above
(which governs biomarker/marker **readings**). The hues are
deliberately restrained and non-alarming (no pure red). Source of
truth for the label + dot per category is
`lib/compound-categories.ts` (`CATEGORY_META`).

## Typography

Three faces, exposed as CSS variables and mapped to Tailwind
utilities (`font-display`, `font-sans`, `font-mono`) in
`app/globals.css`.

| Role          | Font             | Variable            |
| ------------- | ---------------- | ------------------- |
| Display/serif | Playfair Display | `--font-display`    |
| UI text       | Geist            | `--font-geist-sans` |
| Code/mono     | Geist Mono       | `--font-geist-mono` |

**Notes**

- The large headings and the `trackd` wordmark use a high-contrast
  Didone-style serif (**Playfair Display**).
- UI text, labels, metadata, and buttons use the sans (Geist),
  which is also the default body font.

### Rule: section + glance-card titles use the display serif, in white

Every section / glance-card **title** across Home and Progress — Today's
Log, Weight, Progress photos, Bloodwork, Journal, Consistency,
Reconstitution Calculator (and the "Good morning, …" greeting) — uses the
**display serif** (`font-display`) in **white** (`text-foreground`), so the
cards read as one consistent "clinical journal" system rather than three
different UIs. Apply the shared **`CARD_TITLE`** preset
(`lib/ui-presets.ts` → `font-display text-xl font-medium tracking-[-0.01em]
text-foreground`) rather than re-deriving the classes per card. The small
uppercase tracked sans treatment (`text-xs … uppercase tracking-[0.18em]
text-text-muted`) is reserved for **eyebrows / metadata** (e.g. the date
line above a page title), **never** for a card title.

**Three serif title sizes, one family** — always the matching preset, never
hand-rolled classes (`lib/ui-presets.ts`):

- **`CARD_TITLE`** (`text-xl`) — section / glance-card titles (above).
- **`SHEET_TITLE`** (`text-2xl`) — bottom-sheet + large section headers.
- **`PAGE_TITLE`** (`text-[2rem]`) — the `<h1>` on standalone (non-tab)
  screens (Settings, Weight, Billing, Archive). Tab screens (Home, Progress,
  Protocol) instead use the sans `PageScrollTitle` heading.

## Border Radius

| Context           | Class                                |
| ----------------- | ------------------------------------ |
| Inline / small UI | `rounded-full` (pills, date circles) |
| Cards / panels    | `rounded-2xl`                        |
| Modals / overlays | `rounded-3xl`                        |

## Spacing & Rhythm

"Generous spacing" is the most drift-prone phrase in a design system —
one session's *generous* is not another's. These values are **fixed**,
read off the as-built Home + Progress screens, and are the only spacing
values for page structure: no per-screen ad-hoc margins or padding.

| Role                      | Class                                             |
| ------------------------- | ------------------------------------------------- |
| Page column               | `mx-auto w-full max-w-md`                          |
| Screen horizontal padding | `px-5`                                             |
| Screen vertical padding   | `pt-4 pb-5`                                        |
| Section → section gap      | `space-y-5`                                        |
| Card internal padding     | `p-5`                                              |
| Intra-card element gap    | `space-y-3` (tight label/value pairs `space-y-1`) |
| Metric grid               | `grid-cols-2` + `gap-3`                            |
| Inline icon / label gap   | `gap-2` / `gap-3`                                  |

The scaffold every tab screen shares is
`mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5` (see `HomeScreen` /
`ProgressScreen`) — match it, don't re-derive a per-screen wrapper.
Spacing steps come from the Tailwind scale; the values above are the
canonical picks — reuse them rather than reaching for a new step.

## Component Library

UI primitives come from **shadcn/ui on Tailwind v4**, owned in-repo
under `components/ui/`. They render on-theme because shadcn's
semantic tokens are **mapped onto the Trackd palette** in
`app/globals.css` (e.g. `--primary` → `--accent-primary` white,
`--accent` → `--accent-amber`, `--card` → `--bg-surface`,
`--destructive` → `--state-error`). So shadcn utilities like
`bg-primary` / `bg-card` / `bg-accent` are on-theme out of the box.
The `--state-*` mapping is UI-only — the colour rule above still
applies to health data.

**Conventions**

- Theme components **only** through the token map in `globals.css` —
  never by restyling the generated files. `components/ui/**` is
  protected (see `ai-workflow-rules.md`).
- Add components **incrementally, as a feature needs them** (`npx
  shadcn@latest add <name>`) rather than hand-writing them or
  bulk-installing the whole set.
- Installation, config, and the full token map live in the design
  system build spec (`Context/Feature Specs/01-design-system.md`).

## Layout Patterns

- Mobile-first single column: vertically stacked sections on a
  near-black canvas with generous vertical rhythm (this is a PWA).
- Metric cards: 2-up grid of surface cards (e.g. Compliance,
  Next Dose) with a muted uppercase label and a large value.

### Rule: new screens reuse the system

Any new screen (Protocol, Calendar, Settings, …) is composed **only**
from the existing patterns — `CARD_TITLE`, `CARD_ICON_BADGE`, the 2-up
metric grid, the shared chart style, the radius scale, and the Spacing &
Rhythm scale above. If a screen needs a pattern that isn't yet a preset,
**add it to this doc and `lib/ui-presets.ts` first**, then use it — never
invent a one-off per screen. This is the rule that stops drift at the
source.

## Charts

Data graphs are **line / area charts** (recharts), kept visually identical
across the app so they read as one system:

- **Trend line:** the teal `--chart-trend`, a smooth `type="monotone"` stroke
  (~2.5px), over a **downward linear-gradient fill** that fades **thick → thin**
  (`--chart-trend` at ~0.35 opacity at the line → 0 at the base). Define the
  gradient in the chart's `<defs>` (e.g. `weightTrendFill` /
  `consistencyFill`) — a flat fill token reads uniform, not tapered.
- **Raw / secondary series** (e.g. the Weight "Scale" line) use the periwinkle
  `--chart-line` at lower emphasis (thinner, no fill), crossfading by opacity.
- **Affordances:** a press-and-drag **scrub tooltip** and a **range selector**
  (e.g. 30D / 90D / All) are the shared graph controls.
- **No bar charts for trends** — the Weight and Consistency graphs both use the
  line+gradient style above.
- **Glance sparklines** are the ONE sanctioned exception: a compact preview (e.g.
  the Home Weight glance card) may draw a minimal token-coloured `<polyline>`
  sparkline — same neutral `--chart-line` / `--chart-trend` hues, no fill / scrub /
  range — because it only teases the full graph one tap away (`/weight`). It stays
  non-evaluative; anything larger than a glance uses the full line+gradient style.

Chart hues are a deliberately **neutral** teal/periwinkle (never red/green),
because trend visuals must stay **non-evaluative** per the health-data rule
above — a graph shows *movement*, never "good" or "bad".

## Styling Notes

- Tailwind **v4** (CSS-first). The colour tokens above are defined
  once in `:root` in `app/globals.css` (the only place hex may
  appear) and exposed to Tailwind via an `@theme inline` block, so
  every token is usable both as `var(--token)` and as a utility
  (e.g. `bg-bg-surface`, `text-text-muted`, plus the shadcn
  semantic utilities). The `--radius` scale drives `rounded-sm/md/lg/xl`.
- Surfaces layer by elevation: `--bg-base` (page) → `--bg-surface`
  (cards) → `--bg-surface-raised` (raised) → `--bg-input` (fields).
- Follow the border-radius scale above; no hardcoded hex outside
  `globals.css`.

## Icons

**Lucide React** (shadcn's default icon set). Stroke-based icons
only. Sizes: `h-4 w-4` inline, `h-5 w-5` in buttons.

**Glance-card icon badges are amber.** The leading icon on a section /
glance card uses the shared **`CARD_ICON_BADGE`** preset
(`lib/ui-presets.ts`) — an **amber** stroke icon (`text-accent-amber`) on a
soft amber-tinted rounded square (`rounded-xl border border-accent-amber/25
bg-accent-amber/10`). Every Home + Progress card icon uses it (Weight,
Progress photos, Bloodwork, Journal, Consistency, Reconstitution Calculator)
so the cards read as one system. Amber is the secondary signature accent
(active/interactive state) — this is chrome/identity, not health data, so it
stays within the colour rule above.

For a smaller inline badge — an in-flow prompt or a numbered step, where the
`h-11` card badge is too big — use **`STEP_ICON_BADGE`** (the same amber-tint
idiom at `h-9`). Don't hand-roll a third badge size.

## States

Every screen and every glance card defines four states beyond "loaded".
A tracker *lives* in these (first run, empty days, mid-sync) — they are
part of the design, not a fallback.

- **Empty / first-run** — never a blank or a missing card. Keep the
  card's normal frame (surface + `CARD_TITLE` + `CARD_ICON_BADGE`) with
  one line of `text-text-muted` explanation in-voice and a single clear
  action. The first-run empty is the first thing a new user sees — a
  designed surface, not an absence.
- **Loading** — shaped **skeletons** on `--bg-surface-raised` that match
  the final layout (no layout shift). No spinners for content areas; a
  spinner is only for a discrete in-flight action (e.g. a button).
- **Error** — `--state-error`, one line + a retry. UI / system errors
  **only**, never health data (per the colour rule above). The one
  notification style is the amber pop-down notice
  (`components/notifications/amber-notice.tsx`) — never a modal pop-up.
- **Partial** — a card with some data shows what it has plus a muted
  placeholder for the rest, not a full empty state.

## Motion & Interaction

Motion **reinforces meaning, never decorates.** The keyframes live once
in `app/globals.css`; use the named `animate-*` classes rather than
hand-rolling animation per screen.

- **Entrance** — tab screens stagger their cards in with `animate-home-up`
  (fade + rise) via a per-card inline `animation-delay`. Same idiom on
  Home and Progress.
- **The log action gets a moment.** Logging a dose is the app's
  heartbeat: the tick pops in (`animate-home-tick-pop` + one
  `animate-home-tick-ring` pulse), the affected state updates, and the
  sheet dismisses. This is the line between "entered data" and "tracked".
- **Feedback** — a blocked tap shakes (`animate-card-shake`); a notice
  slides down from the top edge (`animate-notice-in`).
- **Banned** — ambient / decorative motion: floating particles, meteor
  or hero effects, cursor-follow, scroll-triggered decorative lines.
  These are the clearest "AI-built" tell and steal attention from the data.
- **Respect `prefers-reduced-motion`** — every `animate-*` class already
  collapses to no motion under the reduce query (see `globals.css`); any
  new motion must do the same.

## Voice & Microcopy

The visual system is "clinical journal"; the words must match, or the app
feels off even when it looks right.

- Terse, exact, confident. No exclamation marks, no emoji, no chirp
  ("Nice work!", "Oops!").
- Empty and error copy state the fact and the next action — nothing more.
- Numbers and units are formatted consistently app-wide (doses, mg / mcg,
  dates) — define the format once and reuse it.
