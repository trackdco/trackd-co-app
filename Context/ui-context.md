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
| Chart line       | `--chart-line`         | `#6B7FD4`                |
| Chart fill       | `--chart-fill`         | `rgba(107,127,212,0.15)` |
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

## Border Radius

| Context           | Class                                |
| ----------------- | ------------------------------------ |
| Inline / small UI | `rounded-full` (pills, date circles) |
| Cards / panels    | `rounded-2xl`                        |
| Modals / overlays | `rounded-3xl`                        |

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
