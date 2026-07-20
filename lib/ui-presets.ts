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
 *  Settings, Weight, Billing, Archive, Profile `<h1>`, and "Good morning, …". */
export const PAGE_TITLE =
  "text-2xl font-light tracking-[-0.02em] text-foreground"

/** Bottom-sheet header (Add photos, Journal, Edit cycle, …) — sans, light, tightly
 *  tracked. One notch smaller than PAGE_TITLE. */
export const SHEET_TITLE =
  "text-xl font-light tracking-[-0.01em] text-foreground"

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
