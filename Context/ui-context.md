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
| Page background  | `--bg-base`            | `#0E0E0D`                |
| Surface          | `--bg-surface`         | `#212120`                |
| Surface elevated | `--bg-surface-raised`  | `#2A2A28`                |
| Surface input    | `--bg-input`           | `#30302E`                |
| Primary text     | `--text-primary`       | `#F0EFE9`                |
| Muted text       | `--text-muted`         | `#8A8982`                |
| Subtle text      | `--text-subtle`        | `#54544F`                |
| Primary accent   | `--accent-primary`     | `#FFFFFF`                |
| Amber accent     | `--accent-amber`       | `#C8861A`                |
| Green accent     | `--accent-green`       | `#4ADE80`                |
| Border default   | `--border-default`     | `#333331`                |
| Border strong    | `--border-strong`      | `#45453F`                |
| Chart line (raw) | `--chart-line`         | `#6B7FD4`                |
| Chart fill       | `--chart-fill`         | `rgba(107,127,212,0.15)` |
| Chart trend      | `--chart-trend`        | `#4FB3A6`                |
| Chart trend fill | `--chart-trend-fill`   | `rgba(79,179,166,0.16)`  |
| Overlay backdrop | `--overlay-backdrop`   | `rgba(0,0,0,0.70)`       |
| Error            | `--state-error`        | `#EF4444`                |
| Success          | `--state-success`      | `#4ADE80`                |
| Warning          | `--state-warning`      | `#F59E0B`                |
| Destructive      | `--accent-destructive` | `#B91C1C`                |
| Skeleton block   | `--skeleton`           | `var(--bg-surface-raised)` |
| Skeleton graph   | `--skeleton-line`      | a mix of the two borders |
| Pad scrim        | `--pad-scrim`          | `rgba(0,0,0,0.42)`       |
| Picker body      | `--pick-body`          | `#31312e`                |
| Picker region    | `--pick-region`        | `#46463f`                |
| Inset            | `--bg-inset`           | `#1A1A19`                |
| Inset, deep      | `--bg-inset-deep`      | `#171716`                |
| Blend line 1–3   | `--blend-1..3`         | `#4682CC` `#AC942F` `#C35890` |

The five from `--skeleton` to `--pick-region` are the feel pass's (2026-09-17): the two picker tones are the
Log dose map's body on a raised surface (see the Spec 19 ramp below).

**The surface, text and border values are the "+1" contrast step (built
2026-09-24, see Surface treatment).** The public site (`/`,
`/reconstitution-calculator`) keeps the shipped values (base `#111110`, surface
`#1C1C1A`, raised `#242422`, muted `#7A7A74`, subtle `#4A4A46`, borders
`#2E2E2C` / `#3E3E3A`), pinned by `:root:has(.lp-site)` in `globals.css`, because
its AA measurements were taken against them and it is not part of this build.
The insets and blend lines are the half-life build's. `--bg-input` is not on the
dial; it moved one step with the others (`#2A2A28` → `#30302E`) so it stays ABOVE
raised, as it was. Left level with raised, every sliding thumb vanished into its
track (found building the blend tabs, 2026-09-24).

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
nothing is urgent. **Three sanctioned many-amber surfaces**, and only three: the
injection-site recency ramp below, a **settings screen carrying several
switches** (`/notifications` shows four amber tracks with everything on), and
an **onboarding answer list** (a selected chip reads amber: text, icon, tick,
and a 10% wash). All three are the same argument rather than three excuses: on
each of those surfaces the amber thing IS the live state, and it is the thing
the user came to the screen to see. Note the third is scoped to `/onboarding`;
inside the app amber means "this needs you now" against real data, and a
selected row in a list is not that (Adrian, 2026-08-01). The
switch rule below is why, and it is consistent with rarity rather than an
exception to it: a switch that is on IS the live state, and on a screen whose
entire job is showing you which things are on, that is the content, not
decoration.

### Rule: a switch that is ON is amber

**Every** `role="switch"` in the app uses `--accent-amber` as its ON track, with
a white (`--accent-primary`) knob; OFF is `--bg-input` with a
`--border-strong` hairline. No exceptions, and no per-screen variants
(Adrian, 2026-07-31).

This is consistent with the rule above rather than an exception to it: a switch
that is on IS the "this is live" state, which is the thing amber means. It is
also the state the user is looking for when they glance at a settings screen, so
it has to be the thing that reads first.

`--accent-primary` is **white**, so an ON track built from it put a white knob on
a white track — the control was legible only by the knob's shadow. That is the
mistake this rule exists to prevent; it was fixed on the cycle toggle first
(2026-07-30) and the notification switches were left behind until they were
caught side by side on a phone.

Applies to: notifications master, each reminder row (dose / missed-dose / low
stock), and "Run this compound on a cycle". Any new switch inherits it.

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

### Rule: the colour level is "Pushed" (Adrian, 2026-09-24)

Chosen over "as documented" and "further" on the half-life decision sheet.
**Category hues go on containers AND on half-life curves**: a compound's vial
liquid, its sparkline and its full curve all take its `--cat-*` hue, and the
expanded half-life card's two figure tiles take a 12% wash of it. This is a
deliberate departure from "severely restrained" above. It is written here so
that a later session does not revert it as drift. It stays inside the
categorical rule: a hue says WHICH compound, never whether a level is good.

What is NOT pushed: the tab bar stays monochrome, cards stay grey, and the
Protocol foot cards (Stacks / Cycles / Stock) are GREY cards with the ICON in
colour. Adrian corrected a full-colour card on 2026-09-24.

**Blend lines get their own palette.** A blend (Wolverine, Glow, CJC +
Ipamorelin) draws one line per component, told apart by dash pattern AND
colour. The colours are "Sorbet": `#4682cc`, `#ac942f`, `#c35890`, to be
added as `--blend-1..3`. It is the only palette of the four tried that passes
the dataviz validator on the dark card on every check: the lightness band
0.48-0.67, the chroma floor, colour-blind separation for every pair (worst
delta E 9.9) and the normal-vision floor. The periwinkle / teal / tan trio from
the chart tokens FAILS the band and chroma checks there. Colour tops out at
three. A fourth component (KLOW) is told apart by dash and label alone.

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

**The picker's ramp is one shade down** (feel pass §5, Adrian, 2026-09-17). In
the Log dose sheet's map, the site being PICKED is the only full amber (no white
outline), so the history under it starts a shade lighter and gains one extra,
faintest shade: heat = `1 - (d + 1) / (window + 1)` for `d < window`. The
rotation view keeps its own `siteHeat`. The day counts sit in the MARGINS there,
the way onboarding's demo body does it: a mono 10px chip (`--bg-surface`, full
radius) on the side the site is on, level with its centre, reading "Today" /
"1 day" / "N days", with a 1px non-scaling `--border-strong` leader to the site
and no dot. Chips on one side keep 9% apart. **Only the most recent site's chip
is amber.** In that sheet the body sits on `--bg-surface-raised`, so it takes the
`raised` tone (`--pick-body` / `--pick-region`) or the Sub-Q silhouette vanishes
into the card; the other maps keep `--muscle-region`. Under the map one reserved
two-line slot reads "Last time: <site>, <yesterday | N days ago>." until a site
is picked, then the existing `REST_DAYS` observation line.

### User palette — twelve colours a user picks from

Two features let the user pick a colour, and they share these twelve: a
**cycle** (an on/off pattern over a compound, Spec 06) and a **stack** (a
display grouping of compounds taken together, Spec 05). A cycle colour drives
the calendar's on-day fill and that cycle's containers; a stack colour drives
its members' containers wherever the stack is shown. Defined as `--palette-*`
tokens in `app/globals.css` and exposed as Tailwind utilities
(`bg-palette-teal`, …); reference them as tokens — **never paste these hex
values into a component**. The shared helpers live in `lib/palette.ts`.

| Name     | Token             | Value     | | Name     | Token             | Value     |
| -------- | ----------------- | --------- |-| -------- | ----------------- | --------- |
| Slate    | `--palette-slate`   | `#56687F` | | Clay     | `--palette-clay`    | `#8B6050` |
| Steel    | `--palette-steel`   | `#4C7285` | | Rosewood | `--palette-rosewood`| `#7E4E54` |
| Teal     | `--palette-teal`    | `#3D6B63` | | Mauve    | `--palette-mauve`   | `#7B5570` |
| Moss     | `--palette-moss`    | `#4C6A4E` | | Plum     | `--palette-plum`    | `#654C7C` |
| Olive    | `--palette-olive`   | `#616B41` | | Indigo   | `--palette-indigo`  | `#55568C` |
| Bronze   | `--palette-bronze`  | `#7A6440` | | Stone    | `--palette-stone`   | `#6D6A62` |

They are deliberately **deep rather than pastel**, none implies good or bad
(so the "categorical, never evaluative" rule is untouched — these are
organisational labels, like the category legend), and none clashes with amber
or the `--cat-*` hues. The colour is stored on the **cycle or stack**, never on
the compound, as its palette **name** — the hex lives once in `globals.css`, so
a retune never needs a data migration.

On the calendar the fill renders at **reduced opacity** so the logged-day
circle, today's ring and the dose/journal indicators still read above it.

## Typography

Two faces, exposed as CSS variables and mapped to Tailwind
utilities (`font-sans`, `font-mono`) in `app/globals.css`.

| Role          | Font       | Variable            |
| ------------- | ---------- | ------------------- |
| UI text       | Geist      | `--font-geist-sans` |
| Data/mono     | Geist Mono | `--font-geist-mono` |

**Notes**

- **A THIRD face exists, for exactly one line.** Caveat, as `--font-hand`,
  sets "Angus & Adrian" at the foot of the onboarding founder letter, in amber
  (Adrian, 2026-08-01). Their real signatures were built for that slot and he
  rejected them; this does the job they were there for.

  It is an exception and it stays one. **`--font-hand` is referenced in exactly
  one component**, and a handwriting face on a dose figure, a card title or any
  app surface is precisely the drift the two-face rule exists to prevent. It is
  loaded through `next/font` so it is self-hosted at build time, which keeps the
  no-external-host posture intact. If a second use ever appears, that is the
  moment to argue about it, not a precedent to lean on.
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
- **`COLUMN_EYEBROW`** — `text-[9px] font-sans uppercase tracking-[0.12em]
  text-text-muted` — the eyebrow for a **narrow column**, i.e. a third-width
  card in a row of three. At 10px/0.18em a single long word ("CONCENTRATION",
  ~109px) overruns a third of a phone's width and has no space to wrap on, so
  this is the same eyebrow one notch down in size and tracking. Use it **only**
  where the column is genuinely too narrow; a full-width card title stays
  `CARD_EYEBROW`. (Added for the calculator's three result cards, Spec 07.)
  **Below 360px it may be stepped down to `text-[8px]`** — "CONCENTRATION" is the
  longest label in the app and overruns a third of a 320px phone even at 9px
  (measured: 2.69px into the next column). That step-down is the only sanctioned
  use of 8px type; do not reach for it anywhere else.
  In a 3-up row the value beneath it is `font-mono text-base tabular-nums` with
  the unit inline at `text-[11px] text-text-muted`, and `[overflow-wrap:anywhere]`
  so a pathological figure wraps rather than overflowing the column.
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
  (Profile, Weight, Blocks, Notifications, Billing).
- **`FLOW_DISPLAY`** — `text-[2.5rem] font-light leading-[1.02]
  tracking-[-0.035em] text-foreground` — the MOMENT screens in a full-screen
  flow: celebrate, welcome, a single-sentence statement. One notch above
  `FLOW_TITLE` and tracked tighter, so the line reads as a statement rather than
  a page title. Reserved for a screen carrying one sentence and nothing else; a
  screen with a form under it uses `FLOW_TITLE`. A user-supplied name inside one
  needs `[overflow-wrap:anywhere]`, because 40px type and a long word do not
  share a phone. (Added for the onboarding flow, Spec 3-01.)
- **`FLOW_TITLE`** — `text-[2rem] font-light leading-[1.05] tracking-[-0.02em]
  text-foreground` — the headline on a **full-screen external flow**: `/login`
  and `/onboarding`. One notch ABOVE `PAGE_TITLE`, because these screens carry a
  single headline on an otherwise empty field rather than titling a page of
  data. It codifies the treatment `/login` already shipped rather than inventing
  one, so the onboarding flow could not drift into a second. Still Geist Light:
  the hierarchy is size and weight, never a second typeface. Its supporting line
  is **`FLOW_SUB`** (`text-[0.95rem] leading-relaxed text-text-muted`).
  (Added for the onboarding flow, Spec 3-01.)
- **`SHEET_TITLE`** — `text-xl font-light tracking-[-0.01em]
  text-foreground` — bottom-sheet headers.
- **Emphasis inside a headline** — `<em className="font-medium">`, i.e. Geist
  **Medium (500) and italic**, on the two or three words a `FLOW_TITLE` or
  `FLOW_DISPLAY` actually turns on ("the more you see", "the cheap part").
  Adrian, 2026-08-01. Weight alone was not enough at 32px on a dark canvas: the
  step from Light to Medium is visible in a paragraph and almost invisible in a
  headline, so the slant is doing most of the work and the weight is stopping it
  reading as a quotation. **Still 500, never 600+** — the type rule is
  unchanged. It is `<em>`, not a styled `<span>`, so the emphasis is in the
  markup rather than only in the paint.
  **Headlines only, and at most one span per headline.** A second one is two
  emphases, which is none. Use the shared **`FLOW_EMPHASIS`** preset rather than
  typing the class, so four call sites cannot drift into four treatments.
  **A data figure is never italicised, ever** — mono digits at a slant stop
  being scannable, which is the entire reason the figures are mono.
  **This is not the only emphasis in the flow, and the others are deliberate:**
  the hook's `<strong className="font-medium">Notes app</strong>` (upright,
  because it is naming the thing being replaced, not stressing it) and
  celebrate's `<strong className="font-normal text-accent-amber">exactly
  that</strong>` (amber, and that screen's single amber beat). Both are
  Adrian-approved and predate this preset. The founder letter also carries one
  `<em>` in body copy; it is a signed message from two people rather than
  system copy, and is exempt for the same reason its exclamation mark is.
- **`DANGER_ROW`** — a row inside Profile's **danger zone** (spec 09 · part
  two): Sign out, Clear all compounds, Delete my account. Red **label** on an
  unfilled row, with the boundary carried by the section's own
  `border-accent-destructive/40` outline. Outlined rather than filled so it
  reads as a place you enter deliberately rather than an alarm sitting on the
  page. **Scoped to a bounded destructive section only** —
  `--accent-destructive` is not a general accent (see Colour), and a red row
  loose on a page is exactly the misuse that scoping exists to prevent.

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
| 3-up figure row           | one card, `grid-cols-3 divide-x divide-border-default py-3`, cells `px-2` |
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

### Surface treatment: the canvas is lit and cards have depth

Introduced for `/onboarding` (Adrian, 2026-08-01: "it looks too simple"), and
the reference the app restyle will be pointed at. Two classes in
`globals.css`, both mixed FROM the tokens with `color-mix` so no hex escapes
that file and a palette retune carries them:

- **`.flow-canvas`** — a radial lift at the top of the page falling to
  `--bg-base` by 62%. A full-screen dark surface with no gradient reads as a
  void; a few percent of light at the top reads as lit.
- **`.flow-card`** — an inset hairline of 5% white along a card's top edge
  (where a light source would catch it) plus a soft drop shadow beneath. Both
  are far weaker than they sound; the effect is depth, not decoration.

The restraint is the point. This is one hairline and one shadow, not a glass
morphism kit: the moment surfaces start glowing it reads as generated rather
than designed.

**Rolled out app-wide (Adrian, 2026-09-24).** This is the deliberate pass the
line above used to reserve: every tab screen gets `.flow-canvas` and every card
gets `.flow-card`, in one change, not screen by screen. It ships together with
**one contrast step**: the card surface lifts and the page ground drops at the
same time, so separation grows from both sides rather than everything going
paler. The target values, chosen on the button-icons artifact's contrast dial
(step "+1"): page `#0B0B0A`, base `#0E0E0D`, surface `#212120`, raised
`#2A2A28`, border `#333331`, border-strong `#45453F`, muted `#8A8982`,
subtle `#54544F`. They replace the token values in `globals.css`; no component
takes a hex.

**As built (2026-09-24).** The canvas is `.flow-canvas-fixed` on the `(app)`
shell: the same lift painted on a layer FIXED to the viewport, because on a long
page an element's gradient stretched down its whole height; it stays at the top
of the screen while the page scrolls, as in the prototype. Every in-app card
(`rounded-2xl bg-bg-surface`) carries `flow-card`; sheets and dialogs do not,
and a bordered card keeps its outline instead. A new card adds `flow-card`.

**Inset surfaces are the opposite of `.flow-card`.** A graph inside a card, and
the panel a log tile opens into, sit IN the card rather than on it: a darker
fill (`#1A1A19`/`#171716`), an inner shadow at the top and a 4% highlight
along the bottom edge. A darker card with no inner shadow read as "lazy" to
Adrian; the shadow is what makes it read as indented. Built as `.inset-surface` (flat `--bg-inset`, the
log panels) and `.inset-graph` (`--bg-inset-deep` falling to `--bg-inset`, the
graphs).

### Rule: a full-screen flow is PINNED, and sized in `svh`, never `dvh`

`.flow-viewport` in `globals.css`, and it is the only place **`/onboarding`**
writes a full-screen height. The rest of the app still uses `min-h-dvh`;
migrating it is its own deliberate pass and is NOT implied by this rule.

**A FIXED height. The header and the CTA are pinned and the body scrolls
between them.** Both models were built and tried on a real phone: one page with
the CTA at the end of the content was Adrian's call on 2026-08-01 and he
reversed it the same day, because several of these screens are taller than an
iPhone's viewport once Safari's bars are up, so the only action on the screen
landed below the fold with nothing to say it was there.

**`svh`, not `dvh`.** `lvh` assumes the browser chrome is RETRACTED, `dvh`
tracks whatever it is doing right now, `svh` assumes it is SHOWING — the
smallest the viewport ever gets. `dvh` is the trap and was the original report:
correct at any instant, and therefore moving the layout as Safari's bar
collapses on scroll and returns on scroll-up. `100vh` first as the fallback for
a browser without `svh` (iOS before 15.4).

Two things follow, and they are the ones that break silently:

- **Every screen needs its own scroll port**, or `overflow: hidden` clips it.
  `StepFrame` provides one; hook, celebrate, welcome and demo carry their own.
- **Every flex ancestor between the shell and a port needs `min-h-0`.** A flex
  item's default `min-height: auto` refuses to shrink below its content, so
  without it the column grows past the shell and the footer is clipped instead
  of pinned — measured once at 177px of CTA outside a 660px viewport. Note this
  is the exact OPPOSITE of what the one-page model needed, which is why the two
  cannot be half-mixed: adding `min-h-0` under a scrolling page is what made the
  hook's phone go small and the paywall's carousel compress to nothing.

**One exception, by Adrian's call (2026-09-17): the first screen.** The flow
now opens on Kyle waving (`screens/intro.tsx`, rendered for the `hook` id),
and its button sits directly under the welcome text rather than pinned: "the
button should not be glued to the bottom of the screen in this section". Only
its fine print (18+ and the statutory links) is pinned. Every other screen
keeps the pinned CTA.

**Give the top the same respect as the bottom.** The footer has carried
`env(safe-area-inset-bottom)` since day one; the top was missed, and on a
notched iPhone the progress bar sat level with the clock. If the inset is
applied as PADDING, the element must not also have a fixed height — measured
with a 59px inset on a 40px row, the bar was pushed clean out of its box and
drawn through the first line of every headline.

**Measure these, do not look at them.** Every one was invisible in desktop
Chrome at 390x844. Drive the flow at 402x700 (his actual phone once Safari's
bars are counted), **375x548 (an iPhone SE in Safari)** and 320x454 (the same SE
with Display Zoom), with the safe-area inset simulated. And note the
stale-`.next` trap: a CSS change can sit unserved while the file on disk is
correct, so confirm a new rule is in `document.styleSheets` before concluding
anything about it.

### Rule: on a short phone the art and the air give way, never the words

Added 2026-09-11, from Adrian's dad's iPhone SE: "the button is pinned to the
bottom in heaps of different screens, which doesn't allow me to view stuff."
Every flow screen had been tuned to a 700px box. In Safari the SE has 548px, and
because the CTA is pinned (the rule above), the whole 152px shortfall came out of
the scroll port. The hook's headline, celebrate's answer ticks, the cost card's
Trackd row and the health-data consent tick all sat UNDER the button, and on
`welcome` the last line was cut with no fade to say there was more.

**The pin stays.** Unpinning on a short phone is the one-page model Adrian
already built and reversed. What changed is where the shortfall comes from.

- **`--flow-short`** on `.flow-viewport` is how much shorter the box is than
  700px: `0px` at 700 and taller, 152px on an SE, capped at 246px (a zoomed SE).
  It is written in `svh`, the unit the box itself is sized in, so it cannot
  measure a different box the way the hook's abandoned media query did. Nothing
  is size-contained, so it is not the container query Safari mishandled either.
- **`fit(tall, short, floor?)`** in `lib/onboarding/fit.ts` turns it into a
  length: `tall` px at 700 and up, `short` px on an SE, in a straight line
  between and onward to a zoomed SE. A `floor` stops it for anything that breaks
  below a size (a 44px chip, a gap that has to be seen). Use it for inline
  styles; the hook's card rules in `globals.css` write the same `calc()` by hand.
- **Only art and air take a `fit()`.** Kyle (`Mascot`'s `short` prop), the
  carousel, the demo's body map, paddings and gaps. Type is never resized.
- **A `StepFrame` with a pinned footer scrolls its headline with the body.**
  Where nothing scrolls this is not a visible change; on an SE it gives a list the
  whole height instead of a 284px window under a fixed title.
- **The hook opens scrolled to its end** when it still cannot fit, so what is out
  of view is the top card under the port's fade, not the headline. The re-pin
  after `document.fonts.ready` only fires if the port is still where the effect
  left it — in WebKit that promise resolves at window `load`, hundreds of
  milliseconds later, and it was yanking a reader back to the bottom.
- **A scroll port's fade is now as deep as what it hides** (2026-09-12), which
  amends the conditional-fade rule rather than replacing its reasoning: "a 44px
  gradient drawn to conceal 16px of overflow is a bigger lie than the hard edge
  it replaced" (Adrian, 2026-08-07) — so 16px of overflow now gets a 16px
  gradient, written as `--fade-top` / `--fade-bottom` beside `data-fade`. The
  all-or-nothing version left a hole this fix walked into: an edge hiding
  1-44px drew NO mask and guillotined the line. Shrinking the art lands the
  residue inside exactly that band, measured on `running`, `birthday`,
  `struggle`, `free` and `account` between 440 and 540px, and on the hook's own
  first card on any box of ~572-629px.

**A handset at 700px or taller is untouched by construction.** It was proven by
rendering origin/main beside the branch and diffing every element's layout box
on all nineteen steps at 402x700 and 390x844, plus the demo's four stages and
the expanded, error and long-name states. Everything was identical except the
scroll port's own box on `running` / `struggle`, which now starts at the
headline instead of under it.

**When you add or retune a flow screen,** measure it at 375x548 as well as
402x700. If it overflows there, give its art or its air a `fit()`; do not
shrink its type and do not unpin its button.

### Rule: an in-place edit pins its Save and never scrolls

Adrian chose this from a four-by-four bench on 2026-09-03 (artifact
`e4e2ca5a-1d9f-45df-ab58-289f6259055b`, four layouts x four motion treatments).
Two classes in `globals.css`, two presets in `lib/ui-presets.ts`
(`EDIT_BAR` / `EDIT_BAR_SAVE` / `EDIT_TOGGLE`, and `GROW_FIELD`). Profile's
details card is the reference implementation.

**A card edited in place does not scroll the page.** `PhysicalCard` used to bring
its Save row into view with `scrollIntoView({ block: "center" })`. Every field
sits ABOVE that row, so centring the buttons was the same instruction as pushing
the form off the top: you landed looking at Save and scrolled back up to reach
the thing you had opened.

**The scroll was not decoration, and deleting it alone would have been wrong.**
The tab bar and the FAB are `position: fixed`, so a card opened low on the page
put its own primary action underneath them, where a tap changed tabs and threw
the edit away. Pinning Save removes the NEED for the workaround rather than
dropping the guard: a control that is never below the fold has nothing to be
scrolled to.

- **Save is `.edit-action-bar`** — fixed to the bottom, full width, blurred,
  `env(safe-area-inset-bottom)` added to its padding, sliding up on open. It
  carries `PRIMARY_BUTTON` at full width, so the app still has exactly one
  confirm-button treatment. `z-index: 44`: above the nav (`z-40`) and its
  safe-area filler (`z-30`), below the shortcuts menu's modal layers
  (`z-[45]` / `z-[46]`), because a true modal still wins.
- **Cancel takes Edit's place in the section header** (`EDIT_TOGGLE`). One
  control, one position, two labels, so the header does not go empty mid-edit and
  the discarding action sits furthest from a thumb resting at the bottom.
- **Covering the tab bar is deliberate.** An in-place edit is a committed state,
  and the two taps it is protecting you from are the two that discard your work.
  The FAB stands down with it, driven by a `data-inline-edit` attribute on
  `<body>` rather than by props: the editing card and the shortcuts layer are
  siblings under the (app) layout with no state between them. It loses
  `pointer-events` as well as opacity, because a layer you cannot see but can
  still tap has bitten this codebase before.
- **`GROW_FIELD` is the entrance**, and it is the one that does not blink.
  The field's surface sweeps in from the right edge, from a `::before`, under a
  value that has not moved, staggered 26ms per VISUAL row (set `--grow-i` inline;
  read-only rows still count, or the sweep appears to skip). A crossfade and a
  staggered dissolve were both built and both flash the figure you are about to
  change, which is the thing the mono/tabular treatment exists to prevent.
  The surface is a pseudo-element rather than a `clip-path` on the wrapper
  precisely so the input keeps its own focus ring: a clip at the border box eats
  the ring. It is an ANIMATION, not a transition, because the field only enters
  the DOM when the card opens and a transition has no previous value to run from.

All three collapse under `prefers-reduced-motion`, and all three END in the
visible state, so switching the animation off leaves them correct. That is the
opposite of `.animate-flow-confetti`, which needs `display: none` because it ends
at zero.

### Rule: a number field opens the Trackd pad, never the phone keyboard

Feel pass §3 (Adrian, 2026-09-17). The iOS decimal pad has no Return key, and
none of the app's number inputs had `enterKeyHint`, Enter handling or a form, so
moving between figures meant dropping the keyboard every time. Every numeric
field in the app is now a **`PadInput`** (a button that looks like the
field) that opens **`NumberPad`** (`components/feel/`); a sheet with several
uses **`usePadSession`**, which owns which field is open. Text, dates and times
keep the system controls.

- **Focus layout** (the default). A 42% `--pad-scrim` over the sheet, the pad
  rising from the bottom (`max-w-md`, `rounded-t-3xl`): the field's label, a
  44px light readout, a chip per field on a sliding thumb (tap to jump), an open
  3x4 key grid, then hide and Next / **Done** (white on the last field).
  Portalled into the sheet it belongs to, so the sheet's own focus trap and
  drag still work.
- **The value opens SELECTED.** The first key replaces it; Delete clears it.
  Rules live in `lib/feel/pad.ts` (`applyPadKey`, unit tested): six digits at
  most, one decimal point, "." on an empty field reads "0.", a lone 0 is
  replaced. A key the field's own sanitiser would strip is REFUSED with a shake,
  never silently eaten.
- **The open field shows it**: a white ring and a blinking caret on the
  `PadInput`, so you can see which figure the pad is writing to. The caret
  takes no width, and a field never shows an ellipsis: a figure with a digit
  swapped for "…" is a wrong figure. Nor is it cut off (a clipped "10000"
  reads "1000"): a figure too long for its field steps its font down until it
  fits (`useFitText`).
- **A closing pad still catches taps** through its exit and acts on none, so
  a quick second tap never lands on the sheet or page under it (a sheet's
  overlay would close the sheet; a footer button would fire).
- **Focus moves into the pad** once it is on screen (it is announced as a
  group) and goes back to the field, or to whatever opened it, on close.
- **A hardware keyboard still works**: digits, "." or ",", Backspace, Enter or
  Tab for Next, Shift+Tab back, Escape to hide. Typing a digit on a focused
  field opens the pad with that digit, as an input would; a number field
  counts as typing for the desktop shortcuts.
- **Compact variant: the Calculator only.** No scrim, three chips across, a
  shorter key grid (34px keys at or under 650px tall) and the unit pills on the
  pad, because the point of that screen is watching the syringe and the result
  change as you type. While it is open, the Draw section pins under the header
  (`.calc-draw-pinned`, sticky), which REVERSES the 2026-07-31 "not pinned"
  call: the pad takes the bottom half, so an unpinned syringe scrolls away.
  Pinning never changes the section's box (on a short phone the "Draw" heading
  tucks under the title bar, which shows while pinned), and while the pad is
  open the misuse warning folds into one amber line beside the figure ("This is
  too little to read." / "It will not fit in this syringe.", Adrian, 18 Sep:
  the figure and the syringe size are on screen, so the line does not repeat
  them), so the
  results card stays above the pad on an SE.
- **The pad is the APP's rule, not the public site's.** The landing page's free
  calculator and its features widget share `CalculatorInputs`, and they pass
  change handlers instead of the pad's props, which renders plain inputs with
  the system keyboard: someone who has never seen Trackd should get the
  keyboard their phone gives them. Open for Adrian: whether the public
  calculator should use the pad too.
- **"Amount left" is not on the add-compound pad's chain** (Adrian, 18 Sep).
  The chips there are what the container HOLDS, and Next ends on the last
  amount. Someone who knows a vial is part used taps the field, which opens a
  pad of its own (one field, so it opens on Done). Saying how full something is
  belongs to the Stock tab, where `AddStockSheet` keeps its "Left" chip: on the
  add flow it invited a careless "half".
- **Log weight is the pad alone** (the FAB, the desktop rail, and the empty
  Weight card on Progress): it opens on
  the last weight, selected, and a confirmation drops down on Done. Back-dating
  and the photo live on the Weight screen and the Progress photo sheet.

### Rule: a sheet leads with one job, and the second one is a drop-up

Adrian, 2026-09-11, from a four-state prototype: **"I like eyebrow. More
discreet, yet still noticeable if you're looking."**

Two sheets each carried two jobs. "Log weight" opened on a weight field AND a
permanently-expanded row of pose tiles; "Progress photos" opened on tiles AND a
weight field. One number and a Save read as a form. Each now leads with the
thing it is NAMED after and folds the other behind one line.

**`components/layout/DropUp.tsx`, and nothing hand-rolled.** Presets are
`DROPUP_TRIGGER` and `DROPUP_COUNT`.

- **The trigger is `CARD_EYEBROW`'s treatment** (10px, tracked, uppercase,
  muted). It is the same small label every card title already wears, so it reads
  as a heading you could open rather than a second button competing with Save.
  Chosen over a full row (too loud) and a right-aligned subtle link (invisible
  on a phone, where there is no hover to reveal it).
- **⚠️ The discretion is spent on PAINT ONLY.** `min-h-11` keeps Apple's 44px
  floor whatever the type is doing. Quiet to look at and small to hit are two
  different decisions and only the first one was asked for; `EDIT_TOGGLE`
  carries the same note for the same reason.
- **The count is NOT amber.** Amber means "this needs you now". A tally of
  photos already attached is a SETTLED state, and settled reads white or muted
  (see "amber marks what's live" above). It brightens from muted to foreground
  when the panel opens, and that is the whole of its emphasis.
- **Motion:** the panel grows on a `grid-template-rows` transition (the idiom
  the week strip and the calculator's warning already use), **320ms open and
  220ms closed** — getting out of the way should not be a performance. Items
  inside arrive staggered via `.animate-dropup-item` with `--dropup-i` set per
  item, **26ms apart, which is `GROW_FIELD`'s interval rather than a second one
  invented here.** Both collapse under `prefers-reduced-motion` and both end in
  the visible state.
- **The panel stays MOUNTED and is `inert` when closed.** Unmounting gives the
  grid-rows transition no previous height to run from, so it jumps; `inert` is
  what keeps its controls out of the tab order meanwhile. Same pairing as Home's
  collapsible week strip.
- **An error inside a closed panel opens it first.** An error about a field the
  user cannot see is an error they cannot fix.

**When to reach for it:** a genuinely OPTIONAL secondary action on a sheet that
already has a primary one. **Never** to hide a required field, and never two on
one sheet: a sheet needing two drop-ups is a sheet doing three jobs.

### Rule: when a sheet's date can change, the date IS the title

Adrian, 2026-09-11, with two screenshots of another app's picker: **"make the
date there but incorporate it like this app"**, then **"do A but add
animations"**. Built 2026-09-12 in `AddProgressPhotoSheet`, and on the weight
sheet the same day — **"can you do the same calendar thing for weight too?"**

The photo sheet has now held a date three ways, and the middle one is the lesson.
An `<input type="date">` sat between the poses and Save, a control almost nobody
moved. Removing it for a read-only "Dated today" line made the sheet calmer and
made a back-dated session UNCHANGEABLE — you could read the date and not fix it.
As the title, one element is both the statement and the control.

**Two components, and NEITHER is to be hand-copied into a third sheet.**
`components/layout/SheetDateSteps.tsx` is the header, the two steps and the
height; `components/calendar/DatePickerPanel.tsx` is the month itself — the
Calendar screen's maths (`buildMonthMatrix`, Mon-first, a fixed six rows) and
`MonthGrid`'s ring treatment minus the adherence states, because a picker
answers "which day", not "what happened on it". The weight sheet already carries
the scar of the alternative: its drag-to-dismiss was a hand copy of
`useSheetDrag` missing one line, and it fought the user's thumb for months.

The CALLER owns which step is showing, because the sheet needs the same answer
for two things: Escape, and whether its primary button is the action in view.

- **The title is the date, mono, `dd/mm/yyyy`, with a caret**, over a
  `CARD_EYEBROW` naming the sheet. `formatDateKeyNumeric` SLICES the key rather
  than building a `Date`: keys are written in the user's own timezone, and
  parsing one as UTC hands back yesterday.
- **It pushes, it does not open a second sheet.** Poses slide out left and fade;
  the calendar enters from the right; the box EASES to the new height instead of
  jumping; the header crossfades into a back row travelling the same way. One
  sheet, two steps — a sheet stacked on a sheet is two scrims deep.
- **Escape unwinds ONE step.** Out of the calendar first, and only then out of
  the sheet, because closing from the date step would throw away attached
  photos. Save is disabled while the calendar is up: it is not the action in
  view.
- **Motion, all of it borrowed:** stepping a month is the Schedule's week
  parallax reused BY CLASS (`animate-schedule-back` / `-forward`, 26px/220ms far
  against 10px/190ms near); the chosen day's disc pops 0.72 → 1.07 → 1 over
  260ms, deliberately gentler than `home-tick-pop`, because logging a dose is
  the app's heartbeat and stays its biggest beat; the new date rises 7px into the
  title 120ms later, and only when the date actually changed.
- **A photo cannot be dated tomorrow.** Future days are disabled and the
  next-month arrow stops at this month — the `max={todayKey}` the native input
  used to carry.
- **The hidden step is `inert`,** same pairing as the drop-up: a control you
  cannot see must not be tabbable.

**Both sheets that log a day now wear it**, and they wear it identically: the
photo sheet (eyebrow "Progress photos") and the weight sheet (eyebrow "Log
weight"), where the field's own label drops "today" the moment the date is not
today. A back-dated weight and any photos attached to it are written under the
SAME key, so the session stays one thing.

**When to reach for it:** a sheet whose date is normally today but legitimately
sometimes is not. If the date can never move, state it in a line and do not
build a picker.

### The public site: `/` and `/reconstitution-calculator` (Spec 3-03)

**A scoped exception, like `/admin`, and scoped the same way.** Everything below
applies to `app/page.tsx`, `app/reconstitution-calculator/**` and
`components/landing/**`, and to nothing inside the app. Its CSS lives in
`globals.css` under the **`lp-`** prefix. A `lp-` class on an app screen is a
bug, not a precedent.

**What loosened, and what did not (Adrian, 2026-09-17).** *"It doesn't need to
be exactly Trackd UI, the same way that Pep AI's website isn't the same as the
UI of their app."* So the LAYOUT vocabulary is the site's own: panels with
depth, a two-column laptop hero, floating widgets, a carousel. The PALETTE and
the TYPE did not loosen: every colour is `color-mix`ed from a token (no new
hex), the faces are Geist and Geist Mono, weights stop at 500, and data figures
are mono. **The laptop layouts are designed, not the phone column stretched**:
he called the 3-02 page out for exactly that.

**The header is part of the hero.** No band, no divider, not sticky
(`.lp-hero` carries the light from above the wordmark). The menu is a
**drop-down** (not a drawer): full width with the page dimmed on a phone, a
narrow panel on the right with no dim on a laptop. It is a disclosure, not
`role="menu"`. Log in lives inside it, and under the hero button as "Already a
current user? Log in".

**Columns and rhythm.** `.lp-col` (reading column, 560px, 680px from 800px),
`.lp-wide` (1152px, for the laptop layouts), `.lp-sec` (72px, 112px from
800px), `.lp-bleed` (a carousel track that bleeds to both edges while its first
card lines up with `.lp-wide`).

**Surfaces.** `.lp-panel` (a panel with a caught top edge and a soft shadow,
one step stronger than `.flow-card`), `.lp-float` (a translucent widget over a
phone or around Kyle), `.lp-hero` / `.lp-glow` / `.lp-lift` (the grounds), and
`.lp-ring` (the concentric rings Adrian drew behind the hero device).

**Type.** `LANDING_DISPLAY` (the hero headline: 2.75rem, 3.75rem, 4.25rem),
`LANDING_TITLE` (each section's heading) and `LANDING_SUB` (the line under it,
in `--text-secondary`). All in `lib/ui-presets.ts`.

**It is measured, so it gets an AA-safe muted.** `--text-muted` measures
**4.38:1** on `--bg-base` and **3.95:1** on `--bg-surface`, under the **4.5:1**
floor WCAG AA sets for body text, so the public site's secondary prose uses
**`--text-secondary`** (`--text-muted` mixed a quarter of the way toward
`--text-primary`): **6.45:1** and **5.83:1**. **This is not a licence to swap
`--text-muted` out across the app.** The app-wide contrast question is real and
**OPEN** (raised 2026-09-16); it is not the landing page's to answer.

**The call to action is `.lp-cta`: the app's own button shape, plain amber a
step lighter than the token, with a soft glow** (third round, 2026-09-17:
"just amber, like a lighter amber", glow turned down; the gradient is gone) (Adrian, 2026-09-17, replacing a gradient pill with an outline ring that
he found too flashy: "more blocky ... a really small gradient ... more like a
native button"). 52px, `rounded-2xl`, a deeper amber with a whisper of
gradient, a faint top highlight, a soft amber glow beneath, and a sheen on hover
that is barely there. The onboarding flow's white `FlowCta` carries the same
kind of glow (`.flow-cta`), so the step from the site into the flow keeps one
button character. **The ink is `--bg-base`,
not white:** dark on amber is **6.19:1**, and the gradient's darkest stop
(amber 12% toward `--bg-base`) still measures **5.0:1**; white on amber is
**2.65:1** and fails. The label is "Start tracking" everywhere except Kyle's
section ("Let's get started", never "Begin tracking"). Under it, as its own
text and never inside it: **"7-day free trial. Cancel anytime."** (Adrian,
2026-09-17; it was "Cancel in one tap", which overstated a Billing, Cancel,
confirm flow). Every button carries `data-cta`.

**The docked widget** (`.lp-dock`) is a floating card, not a bar welded to the
edge. It arrives once the hero has gone and steps aside while any other
`data-cta` element (a button, or the two sections built round one) is on
screen, so two of the same button are never in view. `inert` while hidden. On a
short phone (under 600px tall) it drops the trial line.

**Between sections** (`.lp-sec-tight`, `.lp-band`, `.lp-enter`): Compare, the
founders' note and the questions sit closer, with a thin centred rule between
each; the note and the questions share one faint band; and headings and panels
rise in on a CSS scroll timeline (nothing waits on script). The founders' note
has a real heading above its card, like every other section.

**Features on a phone are pills and one phone** (Adrian's pick): a swipeable
tab row, the feature's line, one phone you can also swipe. The laptop keeps the
list beside the phone. The docked button stays out of the way while the widget
is on screen (`data-dock-hide`). **Kyle on a phone** has five small circles
round him instead of cards.

**Amber is still rare: three beats.** The call to action, the drawn underline
under "movement", and the liquid in the FAQ vials. Testimonial stars are white
for that reason. The testimonial cards snap to the CENTRE, with their dots
centred beneath (`.lp-snap-center`). In the comparison table the mark follows
the SYMBOL, not the column: a tick is always filled white, a cross always a
muted outline, so the deliberately inverted last row swaps them. Inside a PICTURE of the app, the app's own amber applies (a due
count, a run-dry date in its window, the insulin figure, the injection-site
recency ramp with its day labels), because that is what the app looks like.

**The hero phone is the drawn Dashboard** (Adrian preferred it to his own
recording, 2026-09-17). The recording moved to the onboarding flow's free-week
screen (`components/onboarding/phone-video.tsx`, classes `.phone-video`),
shipped as HEVC with alpha (Safari, every iPhone browser) and VP9 with alpha
(Chrome, Edge, Firefox), chosen in script because each of those browsers
claims to play the other's file and then drops the transparency. Its opening
is zoomed past the frame, so the box's top and bottom fade while it opens and
ease away as it settles, written per frame from the video's clock (a CSS
transition on the mask jumped in WebKit). No fade-in.

**The app, drawn: `Phone`.** In the features widget, a screen is laid out at the app's real 390x844 and
scaled as one piece (`.lp-phone`, which carries its scale beside its width
because CSS cannot divide lengths), with the app's header, tab bar and add
button. The whole screen is `inert`, which is what lets a real component (the
calculator's input sheet) sit in a picture without being tabbable. **Real
compound names** (Adrian, 2026-09-17, reversing the generic labels: it is a
preview with made-up data), no score, no streak. Kyle's section uses the same
idea at small size: the things round him are previews of the app's cards (a
stock card whose vial runs down and refills, the site map, the syringe). Callouts point at
targets that were MEASURED off the rendered screen (`data-mark`); their cards
overlap the device on a phone and stand clear of it on a laptop, and their
pointer is a hollow ring, because a filled dot hid a 10px injection site.

**A large monitor scales the whole site** (Adrian, 2026-09-17, on a 27-inch
screen: "a bit small"). From 1800 x 900 the root size is 112.5%, and from
2200 x 1100 it is 125%, via `html:has(.lp-site)`; every rem follows and a
laptop is untouched. The drawn phones are immune: `.lp-phone-logical` pins
Tailwind's rem theme values to px and carries `text-[16px]`, so anything
arbitrary inside a phone screen is written in px, never rem.

**Motion: a marketing surface, so the `/onboarding` argument applies.** There
are no figures on this page that motion could compete with, so it may move
more than the app, and every piece of it collapses under
`prefers-reduced-motion` with the **finished state as the base style** (checked
with no waiting: no running animations, every moment already resolved). The
sanctioned list:

- one-shot on load: the rings ripple out, the hero phone rises, and the due
  dose in it is logged at 900ms (`landing-ring`, the app's `home-tick-*`);
- one-shot on view: the underline is DRAWN (a tapered brush shape revealed
  along its centreline, then a lighter return pass: never a width wipe), Kyle
  rises and flexes, each feature screen plays its one moment when its row opens
  (a dose comes off the vial, a site is logged, a line draws), and the callouts
  arrive after it;
- on interaction: the menu's items drop in with a stagger, the FAQ vial lifts
  its cap and DRAINS as the answer opens (and refills, then caps, as it closes),
  and the dock slides;
- the loops: the cards around Kyle drift, and the stock card's vial runs down
  and refills while it is on screen. Decorative, `pointer-events-none`, and
  still under reduced motion.

Inline styles set longhands only (`animationDelay`, `transitionDelay`, custom
properties), never an `animation` or `transition` shorthand, which would
outrank the reduced-motion block.

### The half-life card and Today's Log (decided 2026-09-24; the Protocol card BUILT 2026-09-24)

Settled across fifteen rounds of the motion-set artifact
(https://claude.ai/artifact/LWtVifACjuM66UtLdHEqJy; Adrian's verdicts are in its
db, collection `motion`, docs `r2-*` … `r15-*`). Build from this section, and
open the artifact to see each piece moving.

**Protocol half-life card (Option A: per-compound rows, tap to expand).**
- The curve is ACCUMULATION: doses stack, with a first-order absorption ramp.
  It is not single-dose decay.
- Collapsed row: container, name, `t½ 6.0D`, sparkline. No figure on the
  collapsed row.
- Tap the header to open it and tap it again to close it (D2). While one row
  is open, the others CONDENSE: a smaller container, the name dimmed, no detail
  line, and the sparkline shrunk but kept. Open is springy and slower; close is
  fast and flat. The contents arrive in a 45ms stagger, un-blurring as they
  land.
- Expanded, top to bottom:
  1. The graph in an INSET (see Surface treatment). It draws in with the
     feel-pass tracer, has faint gridlines and a TODAY marker, and has no
     last-dose or next-dose dot. It scrubs like Weight: press and drag shows
     "5d ago · 254 mg".
  2. Two centred figure tiles in the compound hue at 12%, the same opacity for
     both, with a slight brightening from the bottom. **Circulating** (mg now,
     from every dose) and **Of last dose left** (%, Adrian 2026-09-24; the
     pharmacology term is "fraction remaining" of the last dose). Labels go below the figures, in
     sentence case.
  3. A raised grey card of rows: **Half-life** ("4.5 days"; a compound with no
     human PK data adds a small "est." in sans --text-muted, Adrian 2026-09-24), **Next dose**
     ("19h", with no "In"), **Steady** ("Yes" / "7 days"), and **Clears in**
     ("~21 days": when the last dose, depot included, falls below 3%; the
     model is in next-tasks, not five half-lives). The label is "Steady",
     not Plateau or Stable; that is Adrian's call.
  4. A small UP-ARROW button in the header's top-right corner, visible only
     while expanded. There is no "Details" link. The app has no compound page,
     and `CompoundDetailSheet` is reached from elsewhere.
- Blends: one line per component (Sorbet, with dash). Tabs above the graph (All
  · BPC · TB · GHK) isolate one line with the `ThumbGroup` thumb.

**As built on Protocol (2026-09-24).** `components/halflife/`: `HalfLifeCard` (single
compounds) and `BlendsCard`, between the compounds row and the Schedule. The motion is the
`.hl-*` block in `globals.css` (open 500ms springy, close 280ms flat, O2 unfold 550ms, the
up arrow spinning in from -180°). Settled in the build:
- The graph draws the MODEL's own samples (dense, exact at every dose and peak) as a path,
  not a spline: the kink where a dose starts absorbing is real. It keeps the chart style's
  2.5px line and tapered fill.
- The draw-in is the feel-pass tracer's values (1470ms quintic, 7px ring out over 320ms,
  fill in over 520ms), started 380ms after the tap, on EVERY open. The prototype used
  1100ms; ui-context (the feel-pass tracer) wins.
- Windows: the graph shows about 14 half-lives back (at least 2 days, at most 16) and half
  that ahead (at most 8 days); the sparkline the same history, capped at 12 days.
- A blend's row is called by its short name ("Glow"), its parts on the line beneath.
- A component with a half-life but no dose yet reads "No dose yet" on its tile; one with no
  half-life reads "No half-life data" and has no tab.
- "Steady": a gap is a break only when it is longer than 3 half-lives AND 1.75x the usual
  interval. With the half-lives alone, a daily 4-hour peptide restarted its run every dose.

**Today's Log, and logging a dose (Flow B).**
- The card carries an outside border that FILLS amber as doses are logged, a
  third per dose (for three due). When the last dose lands, the border holds
  bold, then exhales thin (E4: 2px → 3.5px, held, → 0.75px over ~3s,
  `cubic-bezier(.45,0,.25,1)`). The card then settles DARKER (`#1B1B1A`) and
  stays darker, because the day is logged. It does not lift, and the border
  stays amber rather than turning white. Measure the border on every resize
  AND once fonts load; measuring once drew it short of the card.
- A row's descriptor line shows the DRAW ("20 UNITS", or "1 TABLET"), in place
  of route and time. The Draw row is gone.
- The tick circle: the first tap OPENS the row, and a second tap logs it. A tap
  on a LOGGED dose's tick un-logs it (the tick only). Tapping the name, or
  anything else, opens the row; on a logged dose that is edit mode.
- Open row: **Dose** (a stepper; Adrian chose it over the pad here), **Time**
  ("Today · 9:41 AM", opening the date/time picker), then three tiles: **Site**
  (figure icon, dot always amber), **Stock** (the real vial drawing) and
  **Note**. A tile opens its panel IN PLACE, in the inset. The tapped tile
  LIFTS a few pixels and the other two fade back (K3, Adrian 2026-09-24); the
  other rows condense. Switching tiles swaps the content inside a panel that
  stays open: the old content drops away, the new settles in from above (S4,
  "drop and rise"), and the panel eases to its new height. Never a re-mount.
- Misclick guard: a panel stays open until you tap the UP ARROW in its top-right
  corner, the same spinning arrow that closes every card (D2). Give it room at
  the top so it never crowds the content. Nothing is logged until Track.
- Site panel: the body map, lifted off the inset (base `#383834`, regions
  `#4F4F49`), with front/back on the thumb. Picking a site marks it; the panel
  stays open until the up arrow closes it (the misclick guard above). There is no prompt text;
  Adrian rejected that.
- Stock panel: vial cards, two across, that swipe. Dry vials are dimmed and say
  "Mix first". "Don't count this dose" is centred and not underlined. Tapping
  it dims the cards and becomes "Count it", and the tile shows the real vial,
  half full in the compound hue, with a RED line drawn through it. The red is a
  UI state, so the state-colour rule allows it. With no stock at all, the tile
  shows the same vial faded (a touch brighter than the prototype) and the panel
  offers "Add stock", which leaves to the add-stock flow.
- The bar (the track button, A1): it rises from the edge on a spring when a
  row opens with a valid dose, reads "Track 2 mg · Abdomen L", and on Track it
  simply DROPS while the row takes the tick. It drops early only when an
  essential field (the dose) is emptied. In edit mode it reads "Save" and
  confirms with a calm circled tick before dropping.

**Motion and the five never-designed parts (Adrian, 2026-09-24).**
Artifacts: https://claude.ai/artifact/EiHW96Dez9cQSM1eFjqZRX (db `picks`) and
https://claude.ai/artifact/3MKAPLNdwawkUFk5cPuLBr (db `five/answers`).
- Opening a card: O2 UNFOLD, the contents tip down from the header like a flap.
- Blend figures on "All": F1, a small tile per component, TINTED in its Sorbet
  colour (L1).
- Dropper: B, the dose steps in mL. Cap = a screw collar and rubber bulb (it
  opens, so no flip-off disc). It serves BOTH research liquids (mL steps, mg
  shown) and vitamin drops (per drop).
- Unmixed vials: 2, tap the vial, then Mix. They are labelled
  "Unreconstituted" (Adrian: "unconstituted or whatever it's called").
- Mixing a new vial while one is open: BOTH stay open and either can be logged
  from; the old one is used first. No "runs dry, mix one" warning; people mix
  when they choose to.
- Bulk stock: in the Stock panel, spares GROUPED into one card ("9 · Mix
  first"). Spares count toward doses left only once started.
- Add stock from the log: A, a sheet over the open row. Keep the centred
  "Added" card. No "Refill" offer.
- Progress: UNCHANGED (Adrian, calls page). Keep it as the app has it today,
  where a tile opens its own page. The "four tiles that expand" decision and
  its animation rounds are withdrawn.
- Answers: https://claude.ai/artifact/VAmWRCJ5rHhf2DTa7q7YXi (db `calls/answers`).

**Stock, Stacks and Cycles pages (Adrian, 2026-09-24).** Preview:
https://claude.ai/artifact/ELsAnLtjny8JQCo3CY6HKj (db `ssc/answers`). Each foot tile pushes
its own page. Back is the existing "‹ Protocol" link. Rows open in place with the up arrow.
- Protocol KEEPS its Compounds row with stock, exactly as today ("the stock should still be
  visible on the Protocol page as is"). The Schedule sits UNDER the half-life card.
- On the Stacks and Cycles pages, vials take the STACK's or CYCLE's colour (it beats Pushed
  there). Stacks and cycles keep their colour pickers.
- Stock page: every add is for ONE compound. Its type is known, so the sheet never asks, and
  the paired fields sit side by side (Powder | BAC water, Volume | Strength). There is no
  multi-compound picker and no foot "Add stock" button. Compounds without stock sit in a
  "No stock" card.
- A spare that needs no mixing is "Unopened", grouped, and started the same way as Mix: tap it,
  then Open.
- An ended compound's stock stays hidden, as today.
- Cycles: an ENDED cycle just ends and is hidden. No "Ended" card. Figure tiles must never wrap
  (e.g. "1 of 3" over "Round", not "Round 1 of 3").
- Home stack row: the stack's tick STAYS one tap and logs every member (reversed his first
  pick, 2026-09-24: "people can add sites if they really want to"). A second tap un-logs.
  Opening the stack lets you add a site, stock or note to any member afterwards, and unticking
  a member first leaves it out. The single-dose rows keep Flow B (first tap opens).
- A cycle can end when a CHOSEN vial runs out. It defaults to the vial being logged from, and
  the user can pick another ("maybe you can select the vial"). This un-withholds
  VIAL_END_SUPPORTED, per container.
- Editing a compound from Home: A, THE ⋯ ON EACH ROW (Adrian, 2026-09-24). It is the one exception
  to "anything else opens the row". It opens the compound sheet WITHOUT its Log/Edit button
  (the open row does that): header, Started and Schedule tiles, Next, a filled "Edit dose &
  schedule", Skip this dose (only when nothing is logged), Pause, Stock, and Delete. It sits on
  every row, multi-dose parent rows and stack members included. Skip and Pause have no other
  entry point in the app.
- Laptop: a rough view is on the preview. Protocol keeps the compounds row full width, with the
  half-life card and Schedule side by side and the three foot tiles under them. Stock, Stacks
  and Cycles open in the main column.

**Home half-life glance.** H5: a swipeable card per compound (container, name,
Circulating and Of last dose left, a sparkline, a pager of short bars, and no
dots beside names). Tapping a half-hidden card scrolls it to the centre;
tapping the card NEAREST the centre opens its inset graph and the rows card
(a card is never exactly centred, so an exact test left the first one dead). The figures
are not repeated. Artifact: https://claude.ai/artifact/4jc9EG2QuUcSUaDgRwMPaJ. BUILT 2026-09-24 as
`HalfLifeGlance`, under Today's Log; single compounds only (a blend's parts are on
Protocol's Blends card).

**Scroll.** The edge bounce is iOS-native (Medium). On top of it, every card
SETTLES on its own spring, a beat behind the scroll, softer the further it is
from the finger. The strength is "Lighter": 0.6 of the Light setting. This is
app-wide. It keeps native scrolling, because the cards are nudged from the
scroll position and nothing replaces the scroller.

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

- **One line treatment, every series, every graph.** A smooth `type="monotone"`
  stroke at **2.5px** over a **downward linear-gradient fill** that fades
  **thick → thin** (the series' own colour at ~0.35 opacity at the line → 0 at
  the base). Define the gradient in the chart's `<defs>` (e.g.
  `weightTrendFill` / `weightScaleFill` / `consistencyFill`) — a flat fill token
  reads uniform, not tapered.
- **Only the COLOUR varies between series:** the teal `--chart-trend` for the
  trend and for consistency, the periwinkle `--chart-line` for the raw / scale
  series. Weight, curve and fill are identical (Adrian, 2026-08-07). The earlier
  rule gave the raw series "lower emphasis (thinner, no fill)" at 1.5 — that is
  **superseded**: the graphs read as one system, and which series you are
  looking at is carried by its colour and by the crossfade, not by a thinner
  stroke.
- **Emphasis is opacity, not weight.** A series that is not the active mode
  crossfades down (~0.3) rather than changing thickness or dropping its fill.
- **Affordances:** a press-and-drag **scrub tooltip** and a **range selector**
  (e.g. 30D / 90D / All) are the shared graph controls.
- **No bar charts for trends** — the Weight and Consistency graphs both use the
  line+gradient style above.
- **Glance sparklines** are the ONE sanctioned exception, and only in what they
  OMIT: a compact preview (e.g. the Home Weight glance card, the block
  retrospective's window graph) drops the scrub and range controls and adds a
  small `--accent-primary` dot on the latest point, because it only teases the
  full graph one tap away (`/weight`). The line itself is the same 2.5px
  monotone curve over the same tapered fill, in the same neutral
  `--chart-line` / `--chart-trend` hues — a glance that previews a graph should
  look like the graph. It stays non-evaluative. Shared geometry lives in
  `lib/progress/spark.ts`, so hand-rolled `<polyline>` sparklines are out.

Chart hues are a deliberately **neutral** teal/periwinkle (never red/green),
because trend visuals must stay **non-evaluative** per the health-data rule
above — a graph shows *movement*, never "good" or "bad".

**The first-load draw-in (a scoped exception to the scroll-triggered ban below;
feel pass §7, Adrian, 2026-09-17).** It is a data reveal he asked for, not
decoration, and it runs **once per session per graph**, only when the card is
genuinely in view (ratio ≥ 0.85 or ≥ 90% of the band above the tab bar). The
line sweeps left to right over **1470ms** on a quintic ease-out behind a px mask
with a 2px soft edge; a 7px ring in the series colour (filled `--bg-surface`)
rides the tip, sampled from the rendered path, and fades over 320ms; the
tapered fill stays hidden until the line is down, then fades in over 520ms.
Wrap the chart in `DrawFrame` with a `useFirstDraw("<screen>:<graph>")` key and
switch recharts' own animation off for that mount. A revisit shows the graph
finished, a range switch mid-draw finishes it, and **range switching itself is
unchanged** (the remount with recharts' 450ms line, no tracer, no fill fade).
Reduced motion shows it finished. Where it runs: Progress's weight and
consistency cards, and the `/weight` graph.

## Desktop (`>=1024px` AND a pointer)

Trackd is a phone app that also runs on a laptop. Adrian's call, 2026-09-10:
"I don't want it to look like something on mobile that was taken to a computer."
He chose this direction from a bench of five (artifact `54bd83bf`), then approved
the layout (artifact `91ae3225`).

**Everything below applies only above the breakpoint. Nothing on a phone changed,
and `lib/desktop/desktopLayer.test.ts` fails the build if a rule escapes.**

### Where the phone stops and the laptop starts

`(min-width: 1024px) and (pointer: fine)` — room AND a pointer, not room alone.
Width on its own is wrong in the direction that matters: an iPad Pro in landscape
is 1024-1366px and is a touch device being held, where the phone layout (big
targets, nav in thumb reach, sheets you flick away) is the BETTER of the two
designs. The pointer test keeps it there and gives the desktop shell to things
with a cursor. Stated once in `lib/desktop/breakpoint.ts` and once in
`app/desktop.css`; a test pins them together.

### The shell: sidebar, screen, rail

- **Sidebar (236px)** replaces the bottom tab bar. Six items, not five: Calendar
  joins them, because on a phone it hides behind a header icon only for want of a
  sixth thumb target. Beneath the nav, what you are currently RUNNING — standing
  context the phone can only answer by navigating. Sign out sits at the foot as
  the quiet `link` variant, **never `row`**: `DANGER_ROW` red is scoped to
  Profile's danger zone and a red control standing in the corner of every screen
  is exactly the misuse that scoping prevents.
- **Screen (fluid, capped at 1080px)** is the existing screen, placed into a grid
  rather than stacked in one column. Same components, same data.
- **Rail (340px)** is the day, and it never leaves. It is the single clearest
  thing the width buys: you can log a dose while reading Progress, which a phone
  cannot do. **It is not a second Dashboard** — the Dashboard is scoped to the
  SELECTED day and the strip can be parked anywhere; the rail is always TODAY and
  only ever shows what is actionable now. Keeping that line is what stops it
  becoming a duplicate.

### Rule: a bottom sheet becomes the rail, not a modal

There are 40 of them and the split is about what a sheet is FOR.

- **`data-desktop="rail"`** (the default, ~32) — shows or edits ONE thing: a
  compound, a day, a dose, a journal entry. It docks into the right rail and the
  screen behind stays fully readable, **with no scrim**. On a laptop there is no
  reason to cover a month to look at a day. It is still modal in behaviour (focus
  trapped, Escape closes, click-away dismisses); only the paint changes.
- **`data-desktop="dialog"`** — takes over a TASK: the compound catalogue, a
  compose form, a destructive confirm. Centred, with the scrim, because covering
  the page is the correct signal for these.
- **`data-desktop="viewer"`** — a photo or a scan. It wants the window.

**Drag-to-dismiss does not exist above the breakpoint.** It is a thumb gesture;
with a mouse it is a bar that looks grabbable and duplicates Escape.

### Rule: width is not always the gift it looks like

Two screens prove it and both were fixed only after being rendered and looked at.
The Progress photo card fills its column at a portrait aspect, so at two-thirds
of a laptop it grew past 1000px tall — it takes ONE column, near a phone's width,
because that is the proportion it was drawn for. The Protocol schedule's name
column is `w-[38%]`, right at 400px and 390px of reserved emptiness at 1030px.
**Give a component more room only where more room is the thing it was short of.**

### Keyboard

`Cmd/Ctrl+K` opens a search-and-jump palette; `1`-`6` jump to the sidebar's
screens (never while typing in a field). **No single key writes anything.** A
bare letter that records a dose is one mistyped keystroke away from a false entry
in someone's medical log, so logging stays a deliberate act through the rail or a
sheet, with its normal confirm.

### What has no desktop design, deliberately

`/login`, `/welcome`, `/onboarding` and the password flows stay full-screen
centred flows with no sidebar or rail. They carry one thing at a time and there
is nothing to put beside it. Most of them were unreachable on a laptop until this
pass, because the old phone-only gate did not exempt them.

## Admin — the one surface with its own rules (`/admin`)

`/admin` is the founder-only operations dashboard. It is the **single documented
exception** to "new screens reuse the system", and the exception is **scoped, not
open**: everything below applies to `app/admin/**` and `components/admin/**` and
**nowhere else**. A token or pattern from this section appearing on a user-facing
screen is a bug, not a precedent.

**Why it gets an exception at all.** Every other screen is a phone surface shown
to a customer, carrying one or two numbers about their own body. /admin is a
desktop surface shown to two people, carrying roughly ninety numbers about the
business. The app's rules — one amber beat, values as the display layer, a card
per idea — are tuned for the first job and actively fail at the second: at this
density, "restrained" becomes "unreadable".

**What is deliberately kept.** The dark ground, the surface/hairline card
treatment, `rounded-2xl`, the eyebrow-titles-and-large-values hierarchy, mono
tabular figures, Geist at Light/Regular, and the `lib/ui-presets.ts` presets.
/admin should still look like Trackd.

### Admin-only tokens

Defined in `app/globals.css` beside the palette and namespaced `--admin-*`:

| Role                  | Token              | Aliases            |
| --------------------- | ------------------ | ------------------ |
| Series 1 (periwinkle) | `--admin-series-1` | `--chart-line`     |
| Series 2 (teal)       | `--admin-series-2` | `--chart-trend`    |
| Series 3 (tan)        | `--admin-series-3` | `--cat-oral`       |
| Series 4 (dusty rose) | `--admin-series-4` | `--cat-thyroid`    |
| Metric up             | `--admin-positive` | `--state-success`  |
| Metric down           | `--admin-negative` | `--state-error`    |

**Not one new hex value.** Every one aliases a colour the palette already
defines, so the dashboard cannot drift away from the product's hues and a retune
carries automatically.

### Rule: directional colour is allowed here, on business metrics only

Retention, churn and unprocessed-webhook counts may be coloured with
`--admin-positive` / `--admin-negative`. This does **not** breach "categorical,
never evaluative": that invariant governs **biomarker and marker readings**, and
**no health reading is rendered on /admin, ever**. The numbers here are
operational facts about a business, shown to its operators — exactly the
"system/UI feedback" the state colours already exist for.

**Colour is never the only signal, and the second signal depends on what the
number is.** A metric that MOVED carries a caret (`direction="up" | "down"`) — a
retention rate that crossed its threshold. A metric that is merely in a good or
bad STATE carries a WORD instead ("Clear" / "Check this"), because an upward
arrow on "Unprocessed webhooks: 0" says something false: that count did not go
up, it is simply fine. Both are implemented in `Stat` (`components/admin/ui.tsx`),
which keeps `tone` (colour) and `direction` (arrow) as separate props for exactly
this reason.

### Rule: a categorical series palette is allowed here

Ranked bars (signup channels, subscription statuses, compound categories) cycle
`--admin-series-1..4`. In the app a categorical palette would compete with the
category legend and the user palette; on /admin neither is present.

### Rule: bar charts are allowed here

The app bans bar charts for trends (line + tapered fill only). /admin uses
**horizontal ranked bars** for categorical comparisons — which is what a ranked
tally is — and keeps the app's line/sparkline treatment for anything over TIME.
Sparklines reuse `lib/progress/spark.ts`; hand-rolled `<polyline>` is still out.

### Rule: a number that was not measured prints "—", never "0"

A percentage over a zero baseline is undefined, and a dashboard that renders it
as "0%" states a measurement nobody made. `percent()` in `lib/admin/aggregate.ts`
returns `null` for an empty denominator and the tiles print an em dash. The same
reasoning as the weight card refusing "+0.0 kg" on a first weigh-in.

### Rule: a failed query is shown, not swallowed

Every source that fails to read is listed on the page. A dashboard whose broken
queries fall back to zero silently is worse than no dashboard: it looks like
data. This rule exists because a `weight_logs` query was wrong for over a month,
its error was skipped by a bare `continue`, and every active-user number was
quietly too low the whole time.


### The Glass Console (the /admin visual system)

Adrian chose this direction from four samples (2026-08-13). Translucent panels
over a coloured wash, with a very faint engineering grid showing through.

- **Panels** are `--admin-glass-bg` (5% of `--text-primary`) behind a hairline at
  9%, `backdrop-filter: blur(16px)`, `--admin-glass-radius` 20px, deep soft
  shadow. `.glass-panel`, `.glass-panel-raised`, `.glass-pill`, `.glass-inset`,
  `.glass-divide`.
- **The ground** is `.admin-canvas`: a fixed 16px grid at 2.5% plus three large
  radial washes (periwinkle / amber / teal, all under 15%). The grid must read
  as TEXTURE. If it is the first thing you notice it is too strong.
- **Not one new hex.** Every `--admin-glass-*` and `--admin-wash-*` token is
  `color-mix`ed from `--text-primary`, `--chart-line`, `--accent-amber`,
  `--chart-trend` or the `--bg-*` set. Mixed from `--text-primary` rather than
  pure white on purpose: it keeps the glass in the palette's warm family.
- **Contrast on glass.** `--text-subtle` measures about 1.9:1 on surface and is
  worse behind translucency. **Never put small text on glass in `--text-subtle`**
  — the glass components use `--text-muted` as their floor, and every label is
  `CARD_EYEBROW` rather than the dimmer `METRIC_LABEL`.
- **`isolation: isolate` on `.admin-canvas` is load-bearing.** Without a stacking
  context the `z-index: -1` backdrop hides behind the body background. It cannot
  be a `transform` or `filter` instead, because either would make the canvas a
  containing block for the `position: fixed` backdrop.
- **Motion is big on arrival, still afterwards.** Panels stagger in via
  `.animate-admin-rise` on an inline `--admin-delay`, charts draw with
  `.animate-admin-draw`, figures land a beat later with `.animate-admin-value`.
  Nothing loops and nothing moves while you read. All of it is disabled under
  `prefers-reduced-motion: reduce`.
- **The chart draw-in is a widening clip rect, not `stroke-dashoffset`.** Under
  `vector-effect: non-scaling-stroke` the dash pattern is computed in device
  space, so a server-rendered `stroke-dasharray` is wrong by the card's unknown
  stretch factor. A clip has no length to get wrong.

### Rule: /admin is five tabs, never one long page

Overview, Money, Users, Product, System. Tabs are local state so switching is
instant; the RANGE control stays a real link because it changes what is fetched.
Overview's order is fixed and deliberate: **what needs you, then what changed,
then the headline numbers, then the funnel** — that is the order those questions
actually get asked.

### Rule: an alert says what to do, not that something is wrong

Every entry in the alert strip carries three things: the fact with its number,
what it means in one sentence, and the next concrete step. The version this
replaced coloured a number red and wrote "Check this", which told Adrian
something was wrong and nothing about how to check it. Wording lives in
`lib/admin/alerts.ts` and is unit-tested.

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
  Feel pass §1 (Adrian, 2026-09-17), built in `components/feel/Skeleton.tsx`:
  - **A skeleton, never the empty state, while the data is unknown.** "Start
    your log" shown to someone with a full protocol is a wrong statement.
    Home and Protocol wait on the cloud hydration flag
    (`lib/home/hydrationState.ts`: pending / done / failed); a device that
    already holds a stack renders it at once. A failed, timed-out (10s),
    fallen-back or offline first pull falls back to what the device has and
    says so with the sync notice, worded for a read (Adrian, 2026-09-17): "No connection. We're having trouble connecting to your account, so you're seeing what's saved on this phone. We'll keep trying."
    (A failed WRITE keeps "Saved on your device…".)
  - **Graph cards get a ghost graph** (`SkGraph`): the real curve and taper in
    skeleton tones, not a flat block.
  - **The wave** (`.sk`): opacity 0.5 → 1 → 0.5 over 1.9s, delayed 110ms per
    row (`--i`), so the breath travels down the page. The only loop allowed
    outside `/onboarding`, and only while loading; still under reduced motion.
  - **The sequence**: the skeleton fades in (320ms), waves, then fades out
    (240ms) laid absolutely over the content (`SkeletonSwap`) while the real
    cards rise through it with `animate-home-up` (55ms stagger). **One rise per
    arrival**: the title and week strip fade without moving; only content
    rises. Home's week strip waves its figures and fades its dots in.
  - **Every tab route has a `loading.tsx`** (`components/feel/RouteSkeletons.tsx`),
    so the tap switches at once and the route skeleton hands straight over to
    the screen's own, with no second fade (`useArrivedFromSkeleton` for the
    leaving skeleton; `useSkeletonOnScreen` for the title and a still
    skeleton, which also covers a full page load). A nested route that is its
    own screen gets its own `loading.tsx` (`/billing/manage`), or it opens on
    its parent's shell and title. `experimental.staleTimes.dynamic` (300s) keeps a visited tab in the
    client router cache, so a revisit shows the screen, not a skeleton.
  - **Late data in a sheet fills space that is already reserved.** It never
    pushes: the Log dose sheet holds a skeleton row for the Draw row and the
    stock card, then crossfades.
- **Success** — logging a dose ends on **"Mono"** (feel pass §8): the sheet's
  body is covered by `--bg-surface-raised`, an `--accent-primary` disc with a
  `--bg-base` tick pops (`animate-home-tick-pop`, one `animate-home-tick-ring`
  pulse at `--text-primary`/35), "Tracked" or "Updated" in `--text-primary`,
  and it closes itself at 900ms or on tap. The Home row's tick then pops as
  well. This replaced a green full-bleed state: `--state-success` is not the
  app's colour for its own heartbeat.
- **Error** — `--state-error`, one line + a retry. UI / system errors
  **only**, never health data (per the colour rule above). The one
  notification style is the amber pop-down notice
  (`components/notifications/amber-notice.tsx`) — never a modal pop-up.
  A **confirmation** uses the same notice with `icon={null}` (same shape,
  blur and amber outline, no glyph, announced as a status): the default
  `Warning` glyph means a problem, and Adrian rejected a tick ("Weight logged:
  85.2 kg").
- **Partial** — a card with some data shows what it has plus a muted
  placeholder for the rest, not a full empty state.

## Motion & Interaction

Motion **reinforces meaning, never decorates.** The keyframes live once
in `app/globals.css`; use the named `animate-*` classes rather than
hand-rolling animation per screen.

- **Entrance** — tab screens stagger their cards in with `animate-home-up`
  (fade + rise) via a per-card inline `animation-delay`. Same idiom on
  Home and Progress. **Figures never count up** (feel pass §7): a figure
  shows its value. A dose or draw mid-count is a wrong dose on screen.
- **The log action gets a moment.** Logging a dose is the app's
  heartbeat: the tick pops in (`animate-home-tick-pop` + one
  `animate-home-tick-ring` pulse) as the amber due-ring resolves to the
  white tick, the affected state updates, and the sheet dismisses. This
  is the line between "entered data" and "tracked".
- **Touch feedback: one press system** (feel pass §2, Adrian, 2026-09-17).
  Borderless cards need it, and iOS applies `:active` late and briefly, so a
  quick tap showed nothing. **Never write `active:scale-*`.** Put a `PRESS`
  preset from `lib/ui-presets.ts` on the element instead; one delegated
  listener (`components/feel/PressFeedback.tsx`, mounted in the root layout)
  sets `data-pressed` on pointerdown, holds it at least 110ms, and drops it on
  pointercancel or 10px of movement. Rows and cards wait 45ms first, so a
  scroll that starts on them does not flash; everything else presses at once.
  Press-in 70ms (`--motion-press-in`), release 180ms (`--motion-press-out`).

  | Preset | Use | Press |
  | --- | --- | --- |
  | `PRESS.card` / `PRESS.button` | cards, ordinary buttons (`PRIMARY_BUTTON` carries it) | scale 0.97, opacity 0.85 |
  | `PRESS.row` | a list row that presses whole | scale 0.97, `--bg-surface-raised` |
  | `PRESS.rowPart` | a tappable part inside a row (name, specs, ⋯) | presses its row |
  | `PRESS.text` | text buttons (Cancel, Track) | opacity 0.45 |
  | `PRESS.icon` | round icon buttons | scale 0.9, raised round backdrop |
  | `PRESS.tick` | ticks, swatches | scale 0.86 |
  | `PRESS.tab` | tab bar | scale 0.92, opacity 0.7 |
  | `PRESS.fab` | the + | scale 0.92 |
  | `PRESS.day` | week-strip day | scale 0.92, raised |
  | `PRESS.field` | a field-shaped button | scale 0.98 |
  | `PRESS.pill` | pills and segments | scale 0.94, opacity 0.8 |
  | `PRESS.key` | pad keys | scale 0.95, `--bg-input` |

  Under reduced motion the scale goes and the opacity stays. The state is an
  ATTRIBUTE, not a class, because React rewrites `className` on re-render.
  A blocked tap shakes (`animate-card-shake`); a notice slides down from the
  top edge (`animate-notice-in`).
- **A pill menu slides its selection** (feel pass §6). Every single-select
  segmented control (Front/Back, ranges, units, syringe size, stock type,
  routes, cadences, the week strip's day, the pad's chips) is a
  **`ThumbGroup`** (`components/feel/SlidingThumb.tsx`): one thumb measured
  from the `aria-pressed` / `aria-checked` item, gliding left/top/width/height
  over 300ms, never sliding on first placement, and re-fitting (not gliding)
  when the whole group resizes. **The thumb is the selection**, so the
  selected pill has no background of its own. A white thumb carries dark
  text; its unselected siblings are transparent so the thumb shows through
  as it passes. Multi-select chips, calendar grids and colour swatches are
  not segmented controls and do not get one. No transition under reduced
  motion.
- **Sheets land, then rise** (feel pass §4). Each section of a sheet fades up
  10px over 320ms, from 140ms with a 40ms stagger, so the contents rise as
  the sheet lands. Put `data-sheet-body` on the element whose direct children
  are the sections and globals.css does the rest; `SHEET_RISE` with an inline
  `--rise-i` does the same for a sheet that needs per-section control (Log
  dose). In a flex-column scroll body every section is `shrink-0`, or an
  `overflow-hidden` card is squashed to half its height. Full-screen viewers
  do not rise. The Log dose map arrives in its own beats after the landing:
  the body at ~330ms, the sites from ~450ms (30ms stagger), then the day chips
  and leaders.
- **A graph draws itself in once** (feel pass §7, `components/feel/FirstDraw.tsx`).
  See Charts.
- **The onboarding flow** (Spec 3-01) carries its own motion, and it is the
  ONLY surface in the product allowed to. (The public site at `/` is the other
  place motion is allowed, on the same argument and with its own list: see
  "The public site" above.) Entrances: `animate-flow-in`, `animate-flow-forward`
  / `animate-flow-back` (directional step transitions), `animate-flow-hero`,
  `animate-flow-caption`, `animate-kyle`'s arrival, `animate-flow-confetti` and
  `animate-dollar-fall` (both one-shot).

  **Four things in that flow DO loop, and the ban below still stands
  everywhere else** (Adrian, 2026-08-01):

  1. `animate-flow-drift` — the paywall's floating labels.
  0. (not a loop, but new) `animate-flow-nudge` — the demo's Next button
     lifting after a stage has sat a while, or once the user has finished what
     the stage asked for. It replaced an AUTO-ADVANCE (Adrian, 2026-08-01):
     the injection-site stage used to carry itself onward, which took the
     decision off the user on the screen they are most likely to still be
     exploring. Three iterations and it stops; tapping ends it. Movement that
     carries information, which is the exception the ambient-motion ban is
     written around.
  2. `animate-kyle`'s float — the mascot breathing on the two celebration beats.
  3. The paywall carousel's auto-advance (a `setInterval`, not a class).
  4. The hook's compare sweep — which is now BOUNDED to two passes and then
     stops, so it is a demonstration rather than a loop.

  The argument for the first three is that `/onboarding` is a marketing
  surface with no data on it, and the ban exists because movement competes with
  figures someone is reading. **Do not carry any of them into the app.** Every
  one collapses under `prefers-reduced-motion`, and a decorative layer is always
  `pointer-events-none`, because a layer that swallows the tap underneath it has
  bitten this prototype before.

  One trap worth naming: an **inline `animation` shorthand outranks the
  reduced-motion block** and cannot be switched off from the stylesheet. Use a
  class. Inline `animation-duration` / `transition-duration` longhands are safe.
  And an animation that ends at `opacity: 0` needs `display: none` under reduce,
  not just `animation: none`, or it strands itself visible on its first frame.
- **The Schedule history** (Protocol) carries two beats, and they are the app's
  first sanctioned DIRECTIONAL motion outside `/onboarding`. Both reinforce
  meaning rather than decorating, which is the only reason they exist:

  - **`animate-schedule-open`** — the card GROWS from its own top edge
    (`scaleY` 0.94 → 1, 300ms) when tapped, so the thing you touched is visibly
    the thing that opened. Y only: scaling both axes reads as a zoom, which is a
    different gesture.
  - **`animate-schedule-back` / `animate-schedule-forward`** — stepping a week
    PARALLAXES. Both layers enter from the direction travelled, and the date
    header (`.schedule-dayhead`) moves further than the compound rows
    (`.schedule-group`): 26px against 10px, under 220ms. The depth is what makes
    it read as the calendar moving rather than the card being redrawn. Adrian
    chose this over a flat slide and a crossfade (2026-09-03) having seen all
    three side by side.

  **Two layers, never thirty-five.** No per-mark motion: a grid of dots
  staggering in is decoration, and the ban below exists because movement competes
  with figures being read. Distances are deliberately small because the animation
  fires on every tap of an arrow the user may press repeatedly.

  **Restart by class, not by `key`.** These replay via a ref that removes the
  class, forces a reflow and re-adds it. Remounting the subtree to restart an
  animation also throws away the grid's scroll position, which is a real bug on
  a protocol long enough to scroll.
- **Sheets move on the house scale** (Adrian, 2026-09-11, all 40 at once).
  Every `SheetContent` opens on `--motion-slow` (320ms) and closes on
  `--motion-base` (240ms), both on `--motion-ease`. It is set ONCE, in the
  protected `components/ui/sheet.tsx`; a call site never puts `duration-*`,
  `ease-*` or `animate-*` on a sheet. shadcn shipped 500ms in / 300ms out on
  `ease-in-out`, and ease-in-out spends its first stretch barely moving, which is
  the "choppy" a thumb feels: you tap and for a beat nothing seems to happen. The
  house ease front-loads the travel. Desktop's rail and dialog run their own
  keyframes in `app/desktop.css` and are untouched by this; the scrim is a
  separate element and keeps its 150ms fade.

  **Drag-to-dismiss carries on from where the finger let go.** Never reset the
  drag offset before closing: the card transitions back up while the sheet slides
  out, so it rises against the finger at the exact moment of release.
  `useSheetDrag` gets this right. `AddWeightSheet` carries a hand copy that got it
  wrong until 2026-09-11. Radix holds the exit's last frame
  (`animation-fill-mode: forwards`) until it unmounts, so leaving the offset in
  place does not flash; measured per painted frame in Chromium and WebKit.
- **Banned** — ambient / decorative motion: floating particles, meteor
  or hero effects, cursor-follow, scroll-triggered decorative lines.
  These are the clearest "AI-built" tell and steal attention from the data.
  Two scoped exceptions, both from the feel pass: the skeleton wave (a loop,
  only while loading; see States) and a graph's first-load draw-in (a data
  reveal, once per session; see Charts). Neither is licence for anything else.
- **Respect `prefers-reduced-motion`** — every `animate-*` class already
  collapses to no motion under the reduce query (see `globals.css`); any
  new motion must do the same.

## Voice & Microcopy

The visual system is premium-minimal; the words must match, or the app
feels off even when it looks right.

- Terse, exact, confident. No exclamation marks, no emoji, no chirp
  ("Nice work!", "Oops!").
  **Two sanctioned exceptions, both in `/onboarding` and both Adrian's call
  (2026-08-01):** the welcome line after the trial starts ("You're in,
  {name}!") and the founder letter, which is a signed message from two people
  rather than system copy. The ban exists so an INSTRUMENT does not chirp at
  you about your own data; neither of those is the instrument talking. Nothing
  inside the app gets one.
- **Never an em dash.** Not in any user-facing string, anywhere in the app
  (Adrian, 2026-07-30). Use a full stop and a second sentence, a colon where
  one clause introduces another, or a comma. An em dash reads as an aside the
  writer could not be bothered to resolve, and at small sizes it is visual
  noise. This is a hard rule, not a preference: if a line seems to need one,
  the line needs rewriting. (Applies to copy. Prose in code comments and
  commit messages is unaffected.)
- Empty and error copy state the fact and the next action — nothing more.
- Numbers and units are formatted consistently app-wide (doses, mg / mcg,
  dates) — define the format once and reuse it. Units render demoted
  (`UNIT_SUFFIX`), never at value size.