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

/** Standalone screen page title — the serif `<h1>` on non-tab screens (Settings,
 *  Weight, Billing, Archive). Tab screens use the sans `PageScrollTitle` instead. */
export const PAGE_TITLE =
  "font-display text-[2rem] font-medium leading-[1.1] tracking-[-0.02em] text-foreground"

/** Leading icon badge — amber stroke on a soft amber-tinted rounded square. */
export const CARD_ICON_BADGE =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent-amber/25 bg-accent-amber/10 text-accent-amber"

/** Smaller sibling of CARD_ICON_BADGE (h-9) — the amber leading icon on inline
 *  prompts / steps (notifications prime, install steps) where the card badge is
 *  too large. Same amber-tint idiom. */
export const STEP_ICON_BADGE =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent-amber/25 bg-accent-amber/10 text-accent-amber"
