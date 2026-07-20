# UI Context

## Theme

Dark only. No light mode. The design language is a calm, premium-minimal
dark interface — near-black backgrounds with soft borderless card
surfaces, hairline dividers, generous spacing, and severely restrained
colour. **White is the primary accent** (primary text, primary actions,
completed states); a warm **amber** is the secondary signature accent,
reserved for the **single active/due moment on screen** (the due dose,
the current selection). The typographic hierarchy is inverted from a
conventional app: **data values are the display layer** — large,
light-weight sans figures — while titles recede into small tracked
eyebrows. Mono figures for all data give an instrumented, "clinical
journal" precision rather than a neon technical one.

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

### Rule: amber marks what's live — one or two beats per screen

Amber's job is **"this needs you now / this is live."** Keep it to **one, at most
two, purposeful beats** on a screen — never everything (the old build amber-ed
titles, badges and chevrons; that blanket amber is exactly the vibe-coded tell
we're leaving behind). The sanctioned amber beats are the **due signal** (Today's
Log's "N due", a due-dose ring) and the **day's live progress pulse** (the Home
completion **ring**, which sweeps as you log — the satisfying "tracked" feedback).
Everything **settled** reads white or muted: a single logged-dose **tick**
resolves to a filled `--accent-primary` (white) mark; the **active selection** in
a control is white; the tab bar is monochrome (active white, inactive
`--text-subtle`). Rarity is what makes amber read — if half the screen is amber,
nothing is urgent. (The injection-site recency ramp below is the one sanctioned
many-amber surface.)

### Category legend — compound type icons

Each compound carries a small **type icon** that shows its **form** at a glance —
a **vial** (`TestTube`) for injectables, a **tablet** (`Pill`) for orals, a **tub**
(`Cylinder`) for supplements — **coloured by category** (anabolic / oral / sarm /
peptide / ancillary / thyroid / supplement / stimulant), one muted `--cat-*` hue
each. Rendered by **`<CategoryIcon>`** (`components/compounds/CategoryIcon.tsx`); the
source of truth for a category's label, `form` and colour (`text-cat-*`) is
`lib/compound-categories.ts` (`CATEGORY_META`). This **replaces the old plain
category dot** (`bg-cat-*`), which is retired per surface as each is migrated — the
shape now tells you the form, the colour the category. These are an **organisational
legend** — they label a compound's *type*, not a health value — so they sit outside
the "categorical, never evaluative" rule above (which governs biomarker/marker
**readings**). The hues are deliberately restrained and non-alarming (no pure red).

### Injection-site recency ramp (Spec 19 — a sanctioned amber exception)

The injection-site **rotation view** shades each site **amber** by how recently it
was used — full saturation on the day of injection, **one shade lighter per day**,
fading to a **neutral/unfilled** state at the end of the decay window (**IM 7 days,
Sub-Q 5 days**, named constants in `lib/home/siteRecency.ts`). This is a
**deliberate, documented exception** to the one-amber-moment rule and the
amber-for-active convention, explicitly sanctioned by the spec. It does **not**
violate "categorical, never evaluative": it encodes injection **recency** (a
behavioural fact about the user's own logging), not a health/biomarker reading,
and **every site carries its factual day-count label** ("2d", "today") so the
colour reads as heat, not a warning. There is **no discrete amber ramp token** —
the ramp is achieved with **opacity on `--accent-amber`** (lower opacity = more
rested), so it stays token-based with **no hardcoded hex**. The feature
**reports, it does not recommend**: never a suggested-next-site, ranking, risk
score, or warning icon.

## Typography

Two faces, exposed as CSS variables and mapped to Tailwind
utilities (`font-sans`, `font-mono`) in `app/globals.css`.

| Role          | Font       | Variable            |
| ------------- | ---------- | ------------------- |
| UI text       | Geist      | `--font-geist-sans` |
| Data/mono     | Geist Mono | `--font-geist-mono` |

**Notes**

- The display serif (**Playfair Display** / `--font-display` /
  `font-display`) is **retired from the UI**. Remove the font load and
  the utility; no screen may reference it. The serif `trackd` wordmark
  survives only as a **static logotype asset** (SVG), not a live font.
- Hierarchy comes from **weight and size contrast within Geist**:
  Light (300) for large values and page greetings, Regular (400) for
  body, Medium (500) for the rare emphasis. Never 600+.
- **All data figures use the mono** (`font-mono`) with
  `tabular-nums` — doses, times, counts, deltas, units. Apply
  `font-variant-numeric: tabular-nums` globally as the base so even
  sans numerals align.

### Rule: card titles are eyebrows; values are the display layer

Every section / glance-card **title** across Home and Progress — Today's
Log, Weight, Progress photos, Bloodwork, Journal, Sites, Consistency,
Reconstitution Calculator — is a small **tracked-uppercase eyebrow**, not a
large heading. The largest text
on any card is its **value** (the number, the time, the weight), set light
and tightly tracked. Apply the shared presets (`lib/ui-presets.ts`) rather
than re-deriving classes per card:

- **`CARD_EYEBROW`** — `text-[10px] font-sans uppercase tracking-[0.18em]
  text-text-muted` — every card/section title. A dimmer variant
  (`text-text-subtle`, `tracking-[0.2em]`) labels metric values.
- **`METRIC_VALUE`** — `text-[28px] font-light tracking-[-0.02em]
  tabular-nums text-foreground` — the big number on metric and glance
  cards. Units and suffixes are demoted inline via **`UNIT_SUFFIX`**
  (`text-sm text-text-muted`), e.g. `92`▸`%`, `8:00`▸` pm`.
- **`DATA_MONO`** — `font-mono text-xs tabular-nums text-text-muted` —
  row-level data (doses, timestamps, counters), **right-aligned** in list
  rows so figures rail vertically. Uppercase mono metadata (e.g.
  `L-DELT · 3D`) adds `tracking-[0.08em]` — tracked-out mono at small
  sizes is the "instrument panel" detail; default spacing reads generic.
- **`PAGE_TITLE`** — `text-2xl font-light tracking-[-0.02em]
  text-foreground` — the greeting and the `<h1>` on standalone screens
  (Settings, Weight, Billing, Archive).
- **`SHEET_TITLE`** — `text-xl font-light tracking-[-0.01em]
  text-foreground` — bottom-sheet headers.

Never hand-roll these classes per screen, and never promote an eyebrow to
a heading size — the inversion (small titles, large values) **is** the
identity.

## Border Radius

| Context           | Class                                |
| ----------------- | ------------------------------------ |
| Inline / small UI | `rounded-full` (pills, date circles) |
| Cards / panels    | `rounded-2xl`                        |
| Modals / overlays | `rounded-3xl`                        |

## Spacing & Rhythm

"Generous spacing" is the most drift-prone phrase in a design system —
one session's *generous* is not another's. These values are **fixed**
and are the only spacing values for page structure: no per-screen
ad-hoc margins or padding.

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
| In-card row dividers      | `divide-y divide-border-default` (rows `py-3`)     |

The scaffold every tab screen shares is
`mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5` (see `HomeScreen` /
`ProgressScreen`) — match it, don't re-derive a per-screen wrapper.
Spacing steps come from the Tailwind scale; the values above are the
canonical picks — reuse them rather than reaching for a new step.

### Rule: cards are borderless; hairlines live inside

Cards separate from the page by **surface alone** (`bg-bg-surface` on
`--bg-base`) — **no card borders**. Structure *within* a card comes from
hairline dividers (`divide-border-default`) between rows, never from
nested boxes or borders-in-borders. A border is reserved for genuinely
interactive outline elements (the due-dose ring, an unchecked circle, an
input focus).

Hairlines render at **true 0.5px** on high-DPI screens — a CSS `1px`
divider reads chunky on a phone and is half of why web apps feel less
fine than native. Define one `hairline` utility in `globals.css`
(`border-width: 0.5px`, with the transform-scaled pseudo-element
fallback where 0.5px is unsupported) and use it for every divider —
never raw `border-t` / `divide-y` widths per screen.

## Component Library

UI primitives come from **shadcn/ui on Tailwind v4**, owned in-repo
under `components/ui/`. They render on-theme because shadcn's
semantic tokens are **mapped onto the Trackd palette** in
`app/globals.css` (e.g. `--primary` → `--accent-primary` white,
`--accent` → `--accent-amber`, `--card` → `--bg-surface`,
`--destructive` → `--state-error`). So shadcn utilities like
`bg-primary` / `bg-card` / `bg-accent` are on-theme out of the box.
The `--state-*` mapping is UI-only — the colour rule above still
applies to health data. Note `--card` surfaces render **without**
shadcn's default border per the borderless-card rule.

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
  Next Dose) with a subtle uppercase eyebrow, a `METRIC_VALUE`
  number, and one muted context line beneath.
- List rows (doses, entries): status circle → name + muted detail
  line → right-railed `DATA_MONO` figure, separated by hairlines.
- The primary action (log/add) is a **white** circular button —
  primary action takes the primary accent; the tab bar stays
  monochrome (active item white, inactive `--text-subtle`).
- The tab bar is **fixed and translucent**: `bg-bg-base/80` +
  `backdrop-blur`, a `hairline` top divider, and safe-area inset
  padding (`pb-[env(safe-area-inset-bottom)]`), so content slides
  under it on scroll instead of stopping at a solid block — the last
  visible "web app" tell on scroll-heavy screens.

### Rule: new screens reuse the system

Any new screen (Protocol, Calendar, Settings, …) is composed **only**
from the existing patterns — `CARD_EYEBROW`, `METRIC_VALUE`,
`DATA_MONO`, the 2-up metric grid, the list-row pattern, the shared
chart style, the radius scale, and the Spacing & Rhythm scale above. If
a screen needs a pattern that isn't yet a preset, **add it to this doc
and `lib/ui-presets.ts` first**, then use it — never invent a one-off
per screen. This is the rule that stops drift at the source.

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
  range, with a small `--accent-primary` dot on the latest point — because it only
  teases the full graph one tap away (`/weight`). It stays non-evaluative;
  anything larger than a glance uses the full line+gradient style.

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
- `font-variant-numeric: tabular-nums` is set on the body so **every
  numeral in the app aligns** — no per-component opt-in.
- Follow the border-radius scale above; no hardcoded hex outside
  `globals.css`.

## Icons

**Phosphor** (`@phosphor-icons/react`), **light weight**, set once
globally via `<IconContext.Provider value={{ weight: 'light' }}>` in the
app root — never per-icon, so stroke weight cannot drift. The light
stroke matches the weight-300 type so icons and typography read as one
system (Lucide's fixed 2px stroke is the most recognisable AI-built
tell and is retired). Sizes: `h-4 w-4` inline, `h-5 w-5` in buttons.

- **Import from the barrel, never the package.** Every icon is imported
  from **`@/components/icons`** (`components/icons.ts`), never from
  `@phosphor-icons/react` directly. The barrel carries a `"use client"`
  directive: Phosphor icons read React Context (for the global weight), so
  importing them straight into a **Server Component** would evaluate
  `createContext` on the server and crash the build. The barrel turns them
  into client references, so a Server Component can render `<Plus />` and it
  hydrates client-side under the provider — still light, no `/dist/ssr`
  split, no per-icon `weight`. Only `components/icons.ts` and the provider
  touch `@phosphor-icons/react`; adding an icon = one line in the barrel.
- **Migration:** Lucide is fully retired (no `lucide-react` imports in app
  code). The generated `components/ui/**` primitives are protected — their
  icon imports were repointed to the barrel (import only, not styling).
- **Identity icons:** the five core glyphs (four tab-bar icons + the log
  `+`) are candidates for **custom-drawn SVGs** later — at that quantity
  a commissioned set is cheap and is the one thing no AI-built app has.
  Until then they use Phosphor light like everything else.

**Icon badges are retired.** The amber `CARD_ICON_BADGE` /
`STEP_ICON_BADGE` presets are removed — cards lead with their
`CARD_EYEBROW`, not an icon, per the one-amber-moment rule. Where an
icon genuinely aids scanning (a trailing chevron, a status glyph, a
tab), it renders **muted** (`text-text-subtle`, or `text-text-muted`
on hover/active) — never amber, never in a tinted container. Numbered
steps use a plain `DATA_MONO` numeral, not a badge.

## States

Every screen and every glance card defines four states beyond "loaded".
A tracker *lives* in these (first run, empty days, mid-sync) — they are
part of the design, not a fallback.

- **Empty / first-run** — never a blank or a missing card. Keep the
  card's normal frame (surface + `CARD_EYEBROW`) with one line of
  `text-text-muted` explanation in-voice and a single clear action
  rendered in `--text-primary`. With no icon badge carrying meaning,
  **the copy does all the work** — empty-state lines are written and
  reviewed, never placeholder. The first-run empty is the first thing
  a new user sees — a designed surface, not an absence.
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
  Home and Progress. `METRIC_VALUE` numbers **count up** (~400ms,
  ease-out) as part of the same stagger — one shared hook, not
  per-card timing — and render instantly under `prefers-reduced-motion`.
- **The log action gets a moment.** Logging a dose is the app's
  heartbeat: the tick pops in (`animate-home-tick-pop` + one
  `animate-home-tick-ring` pulse) as the amber due-ring resolves to the
  white tick, the affected state updates, and the sheet dismisses. This
  is the line between "entered data" and "tracked".
- **Touch feedback** — borderless cards need it: interactive cards and
  rows compress on press (`active:scale-[0.98]` + a slight opacity dip),
  so touches land even without borders. A blocked tap shakes
  (`animate-card-shake`); a notice slides down from the top edge
  (`animate-notice-in`).
- **Banned** — ambient / decorative motion: floating particles, meteor
  or hero effects, cursor-follow, scroll-triggered decorative lines.
  These are the clearest "AI-built" tell and steal attention from the data.
- **Respect `prefers-reduced-motion`** — every `animate-*` class already
  collapses to no motion under the reduce query (see `globals.css`); any
  new motion must do the same.

## Voice & Microcopy

The visual system is premium-minimal; the words must match, or the app
feels off even when it looks right.

- Terse, exact, confident. No exclamation marks, no emoji, no chirp
  ("Nice work!", "Oops!").
- Empty and error copy state the fact and the next action — nothing more.
- Numbers and units are formatted consistently app-wide (doses, mg / mcg,
  dates) — define the format once and reuse it. Units render demoted
  (`UNIT_SUFFIX`), never at value size.