/**
 * Shared className presets for the calm-editorial card chrome (see
 * `Context/ui-context.md`). They keep every screen one consistent system
 * instead of each card / sheet / page re-deriving its own title + icon styles:
 *
 * - `CARD_TITLE` — the section/glance-card title: the display **serif**, white,
 *   matching the "Today's Log" heading and the "Good morning, …" greeting.
 * - `SHEET_TITLE` — the larger serif header on bottom-sheets / large sections
 *   (one step up from `CARD_TITLE`).
 * - `PAGE_TITLE` — the serif `<h1>` on standalone (non-tab) screens (Settings,
 *   Weight, Billing, Archive). Tab screens use the sans `PageScrollTitle`.
 * - `CARD_ICON_BADGE` — the leading icon badge: **amber** (the app's secondary
 *   signature accent), a stroke icon on a soft amber-tinted rounded square.
 * - `STEP_ICON_BADGE` — the smaller sibling of `CARD_ICON_BADGE` for inline
 *   prompts / steps where the card badge is too large.
 *
 * Apply these rather than hand-writing the classes, so a future tweak is one
 * edit. Pure strings — no React, safe to import anywhere.
 */

/** Section / glance-card title — Playfair display serif, white (matches Today's Log). */
export const CARD_TITLE =
  "font-display text-xl font-medium tracking-[-0.01em] text-foreground"

/** Sheet / large section header — one serif step up from CARD_TITLE (Add photos,
 *  Journal, Edit cycle, … bottom-sheet titles). */
export const SHEET_TITLE =
  "font-display text-2xl font-medium tracking-[-0.01em] text-foreground"

/** Standalone screen page title + the Home greeting — sans, light, tightly tracked
 *  (was the Playfair serif; retired with the type inversion, see ui-context.md →
 *  Typography). Settings, Weight, Billing, Archive `<h1>`, and "Good morning, …". */
export const PAGE_TITLE =
  "text-2xl font-light tracking-[-0.02em] text-foreground"

/** Leading icon badge — amber stroke on a soft amber-tinted rounded square. */
export const CARD_ICON_BADGE =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent-amber/25 bg-accent-amber/10 text-accent-amber"

/** Smaller sibling of CARD_ICON_BADGE (h-9) — the amber leading icon on inline
 *  prompts / steps (notifications prime, install steps) where the card badge is
 *  too large. Same amber-tint idiom. */
export const STEP_ICON_BADGE =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent-amber/25 bg-accent-amber/10 text-accent-amber"

/** The CARD_ICON_BADGE idiom made round — the icon-over-label tiles in the
 *  quick-actions FAB menu (Spec 20). Circular is the shape that reads as a
 *  tappable action rather than a card's leading mark; same amber tint, so the
 *  menu still belongs to the same system. */
export const QUICK_ACTION_BADGE =
  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-accent-amber/25 bg-accent-amber/10 text-accent-amber"

/* ---------------------------------------------------------------------------
   Premium-minimal inversion presets (see ui-context.md → Typography). The new
   identity flips the hierarchy: card TITLES recede into small tracked-uppercase
   eyebrows, and the DATA VALUE becomes the display layer (large, light, mono).
   These are added now; the serif `CARD_TITLE` / `PAGE_TITLE` / `SHEET_TITLE`
   and the amber `*_BADGE` presets above are retired as each screen migrates.
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
