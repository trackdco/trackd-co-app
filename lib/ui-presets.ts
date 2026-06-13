/**
 * Shared className presets for the calm-editorial card chrome (see
 * `Context/ui-context.md`). They keep every glance card on Home + Progress one
 * consistent system instead of each card re-deriving its own title/icon styles:
 *
 * - `CARD_TITLE` — the section/card title: the display **serif**, white,
 *   matching the "Today's Log" heading and the "Good morning, …" greeting.
 * - `CARD_ICON_BADGE` — the leading icon badge: **amber** (the app's secondary
 *   signature accent), a stroke icon on a soft amber-tinted rounded square.
 *
 * Apply these rather than hand-writing the classes, so a future tweak is one
 * edit. Pure strings — no React, safe to import anywhere.
 */

/** Section / card title — Playfair display serif, white (matches Today's Log). */
export const CARD_TITLE =
  "font-display text-xl font-medium tracking-[-0.01em] text-foreground"

/** Leading icon badge — amber stroke on a soft amber-tinted rounded square. */
export const CARD_ICON_BADGE =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent-amber/25 bg-accent-amber/10 text-accent-amber"
