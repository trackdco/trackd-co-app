/**
 * Shared className presets for the premium-minimal card chrome (see
 * `Context/ui-context.md` → Typography). They keep every screen one consistent
 * system instead of each card / sheet / page re-deriving its own title + value
 * styles. The identity is an INVERSION: card TITLES recede into small
 * tracked-uppercase eyebrows, and the DATA VALUE is the display layer (large,
 * light, mono).
 *
 * Apply these rather than hand-writing the classes, so a future tweak is one
 * edit. Pure strings — no React, safe to import anywhere.
 *
 * (The old serif `CARD_TITLE` + amber `*_ICON_BADGE` presets were retired with the
 * restyle — cards lead with their `CARD_EYEBROW`, not a serif heading or an icon
 * badge; see ui-context.md → "Icon badges are retired".)
 */

/** Standalone screen page title + the Home greeting — sans, light, tightly tracked.
 *  Settings, Weight, Billing, Profile `<h1>`, and "Good morning, …". */
export const PAGE_TITLE =
  "text-2xl font-light tracking-[-0.02em] text-foreground"

/** Bottom-sheet header (Add photos, Journal, Edit cycle, …) — sans, light, tightly
 *  tracked. One notch smaller than PAGE_TITLE. */
/**
 * Emphasis on the two or three words a full-screen flow headline actually turns
 * on ("the more you see", "the cheap part"). Used as
 * `<em className={FLOW_EMPHASIS}>`, so the emphasis is in the markup and not
 * only in the paint.
 *
 * Geist Medium (500) AND italic. Weight alone was not enough at 32px on a dark
 * canvas: the step from Light to Medium is visible in a paragraph and almost
 * invisible in a headline, so the slant does most of the work and the weight
 * stops it reading as a quotation. Still 500, never 600+.
 *
 * A preset rather than a literal because the flow already carries three other
 * emphasis treatments; see `ui-context.md` → Typography for which and why.
 */
export const FLOW_EMPHASIS = "font-medium"

export const SHEET_TITLE =
  "text-xl font-light tracking-[-0.01em] text-foreground"

/** The headline on a FULL-SCREEN EXTERNAL FLOW — sign-in and onboarding. One
 *  notch ABOVE `PAGE_TITLE`, because these screens carry a single headline on an
 *  otherwise empty field rather than titling a page of data. Codifies the
 *  treatment `/login` already shipped, so the onboarding flow could not drift
 *  into a second one. Still Geist Light: the hierarchy is size and weight, never
 *  a second typeface (the display serif is retired). */
export const FLOW_TITLE =
  "text-[2rem] font-light leading-[1.05] tracking-[-0.02em] text-foreground"

/** The supporting line under a `FLOW_TITLE`. */
export const FLOW_SUB = "text-[0.95rem] leading-relaxed text-text-muted"

/** The MOMENT screens in a flow — celebrate, welcome, the cost statement.
 *  One notch above `FLOW_TITLE` and tracked tighter, so the line reads as a
 *  statement rather than a page title. Reserved for a screen carrying a single
 *  sentence and nothing else; a screen with a form under it uses `FLOW_TITLE`. */
export const FLOW_DISPLAY =
  "text-[2.5rem] font-light leading-[1.02] tracking-[-0.035em] text-foreground"

/* ---------------------------------------------------------------------------
   Inversion presets (see ui-context.md → Typography): card TITLES recede into
   small tracked-uppercase eyebrows, and the DATA VALUE becomes the display layer
   (large, light, mono).
   --------------------------------------------------------------------------- */

/** Card / section title — a small tracked-uppercase eyebrow, NOT a heading.
 *  The inversion (small titles, large values) IS the identity. */
export const CARD_EYEBROW =
  "text-[10px] font-sans uppercase tracking-[0.18em] text-text-muted"

/** Dimmer eyebrow — labels a metric value, one notch quieter than a card title
 *  so the value dominates. */
export const METRIC_LABEL =
  "text-[10px] font-sans uppercase tracking-[0.2em] text-text-subtle"

/** Eyebrow for a NARROW column — a third-width card in a row of three, where the
 *  10px eyebrow's 0.18em tracking pushes a single long word ("CONCENTRATION",
 *  ~109px) past the column and there is no space to wrap on. Same uppercase
 *  eyebrow identity, one notch down in size and tracking so it fits. Use it only
 *  where the column is genuinely too narrow for CARD_EYEBROW; a full-width card
 *  title is always CARD_EYEBROW. */
export const COLUMN_EYEBROW =
  "text-[9px] font-sans uppercase tracking-[0.12em] text-text-muted"

/** The big number on metric / glance cards — the display layer. Light-weight
 *  mono, tightly tracked, tabular. Units/suffixes demote inline via UNIT_SUFFIX
 *  (e.g. 92▸%, 8:00▸pm) — never at value size. */
export const METRIC_VALUE =
  "text-[28px] font-light tracking-[-0.02em] tabular-nums text-foreground"

/** Demoted unit / suffix rendered inline beside a METRIC_VALUE. */
export const UNIT_SUFFIX = "text-sm text-text-muted"

/** Row-level data (doses, timestamps, counters) — right-aligned in list rows so
 *  figures rail vertically. Uppercase mono metadata (e.g. `L-DELT · 3D`) adds
 *  `tracking-[0.08em]`: tracked-out mono at small sizes is the instrument-panel
 *  detail; default spacing reads generic. */
export const DATA_MONO = "font-mono text-xs tabular-nums text-text-muted"

/** A row inside the Profile danger zone (spec 09 · part two) — Sign out, Clear
 *  all compounds, Delete my account. Red LABEL on an unfilled row; the boundary
 *  is the section's own outline, so the rows themselves stay quiet. A preset
 *  rather than three copies, because three copies of a destructive treatment is
 *  how one of them quietly stops matching the others. Never use it outside a
 *  bounded destructive section: `--accent-destructive` is scoped to deliberate
 *  destructive actions, not a general accent. */
export const DANGER_ROW =
  "flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-accent-destructive outline-none transition-colors hover:bg-accent-destructive/10 active:bg-accent-destructive/10 focus-visible:bg-accent-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"

/* ------------------------------------------------ stock entry (shared) --- */

/**
 * The stock form's field styling, shared by the two places you can enter it:
 * the "Stock on hand" panel inside Add-a-compound, and the standalone Add-stock
 * sheet (Adrian, 2026-08-07 — "make the stock thing the same layout").
 *
 * They were written months apart and drifted: uppercase tracked labels against
 * sentence-case ones, mono figures against proportional, `px-3 py-1.5` pills
 * against `px-2.5 py-1`. Same fields, same units, same task — so one definition.
 * Add-a-compound's version won, because it is the one most people meet first.
 */
export const STOCK_FIELD_LABEL = "mb-1 block text-xs text-text-muted"
/** Pair with the `Input` component, which supplies the base. */
export const STOCK_FIELD =
  "h-11 min-w-0 rounded-xl border-border-default bg-bg-input font-mono dark:bg-bg-input"
export const STOCK_PILL = "rounded-full border px-2.5 py-1 text-sm transition-colors"
export const STOCK_PILL_ON =
  "border-transparent bg-accent-primary font-medium text-bg-base"
export const STOCK_PILL_OFF =
  "border-border-default bg-bg-input text-text-muted hover:text-text-primary"
