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
than designed. **Applies to `/onboarding` only for now.** Rolling it through
the app is its own deliberate pass, not something to sprinkle screen by screen
(that is how a design system ends up with four slightly different cards).

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

**Give the top the same respect as the bottom.** The footer has carried
`env(safe-area-inset-bottom)` since day one; the top was missed, and on a
notched iPhone the progress bar sat level with the clock. If the inset is
applied as PADDING, the element must not also have a fixed height — measured
with a 59px inset on a 40px row, the bar was pushed clean out of its box and
drawn through the first line of every headline.

**Measure these, do not look at them.** Every one was invisible in desktop
Chrome at 390x844. Drive the flow at 402x700 (his actual phone once Safari's
bars are counted) and 360x560, with the safe-area inset simulated. And note the
stale-`.next` trap: a CSS change can sit unserved while the file on disk is
correct, so confirm a new rule is in `document.styleSheets` before concluding
anything about it.

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
- **The onboarding flow** (Spec 3-01) carries its own motion, and it is the
  ONLY surface allowed to. Entrances: `animate-flow-in`, `animate-flow-forward`
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