/**
 * The press system's rules, as pure data (feel pass, wave 3 §2).
 *
 * One shared system rather than per-component `active:` classes. iOS applies
 * `:active` late and only briefly, so a quick tap on a phone often never shows
 * its pressed state at all. A JS-driven state is the reliable way to make every
 * tap visibly land. `components/feel/PressFeedback.tsx` is the one listener;
 * `app/globals.css` ("PRESS") holds what each variant looks like.
 *
 * The variant is a CLASS, `press-<variant>`, rather than an attribute, so a
 * className preset (`PRIMARY_BUTTON`) can carry it with no change at its call
 * sites. The pressed STATE is an attribute (`data-pressed`), because React
 * rewrites `className` on every render and would wipe a class added mid-press.
 *
 * No React, no DOM: the listener reads these, and the tests pin them.
 */

export const PRESS_VARIANTS = [
  "card",
  "button",
  "row",
  "text",
  "icon",
  "tick",
  "tab",
  "fab",
  "day",
  "field",
  "pill",
  "key",
] as const

export type PressVariant = (typeof PRESS_VARIANTS)[number]

/**
 * A part of a row that presses the WHOLE row: a Home compound row presses as
 * one when its name, specs or "⋯" is touched, while its tick presses on its own.
 * The row itself carries `press-row`.
 */
export const PRESS_ROW_PART = "press-row-part"

/** Once applied, the pressed state holds at least this long, so a quick tap still dips. */
export const PRESS_HOLD_MS = 110

/**
 * Rows and cards wait this long before pressing, so a scroll that starts on them
 * does not flash every row it passes.
 */
export const PRESS_DELAY_MS = 45

/** Movement past this (px) is a scroll or a drag, not a press. */
export const PRESS_SLOP_PX = 10

/** How long the release transition runs (the CSS says 180ms; this outlives it). */
export const PRESS_RELEASE_MS = 200

/**
 * Keys, ticks, text buttons, icons, tabs, the FAB, pills and fields press the
 * moment they are touched. Everything else (cards, buttons, rows, week days)
 * waits `PRESS_DELAY_MS`: those are the surfaces a scroll or a swipe starts on.
 */
const INSTANT: ReadonlySet<PressVariant> = new Set<PressVariant>([
  "key",
  "tick",
  "text",
  "icon",
  "tab",
  "fab",
  "pill",
  "field",
])

export function pressDelayFor(variant: PressVariant): number {
  return INSTANT.has(variant) ? 0 : PRESS_DELAY_MS
}

/** The class that marks an element as pressable in the given way. */
export function pressClass(variant: PressVariant): string {
  return `press-${variant}`
}

/** Every pressable class, as one selector for `Element.closest`. */
export const PRESS_SELECTOR = [
  ...PRESS_VARIANTS.map((v) => `.${pressClass(v)}`),
  `.${PRESS_ROW_PART}`,
].join(",")

/** Which variant a class list names, or null. The first match wins. */
export function variantOf(classList: Iterable<string>): PressVariant | null {
  for (const c of classList) {
    if (!c.startsWith("press-")) continue
    const v = c.slice(6)
    if ((PRESS_VARIANTS as readonly string[]).includes(v)) return v as PressVariant
  }
  return null
}

/**
 * How long to keep the pressed state on after release: whatever is left of the
 * minimum hold. `appliedAt` is when the state went on (same clock as `now`).
 */
export function releaseDelay(appliedAt: number, now: number): number {
  return Math.max(0, PRESS_HOLD_MS - (now - appliedAt))
}

/** True once a pointer has moved far enough that this is not a press. */
export function movedPastSlop(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > PRESS_SLOP_PX
}
