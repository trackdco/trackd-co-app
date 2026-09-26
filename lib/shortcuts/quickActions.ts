/**
 * What the + decides, apart from the fan's geometry (`lib/shortcuts/fan.ts`).
 * Pure: no DOM, no React.
 */

/**
 * S3: THE + TAKES EVERY ACTIVATION ONCE.
 *
 * A finger or a mouse opens the fan on `pointerdown` (so a press can slide on
 * to an item), and the browser then sends a `click` for the same press. That
 * click is an echo and must not toggle the fan back. Every other click (Enter
 * or Space, a switch, a screen reader's activation, which can arrive with
 * `detail` 1 and no pointer at all) is the only thing that happened, so it
 * toggles.
 *
 * The old test was `e.detail !== 0`, which dropped exactly the assistive
 * activations that report a click count. Now the echo is recognised by time:
 * a click within this long of the press ending.
 */
export const POINTER_ECHO_MS = 700

export function isPointerEcho(clickAt: number, pointerEndedAt: number | null): boolean {
  if (pointerEndedAt == null) return false
  const since = clickAt - pointerEndedAt
  return since >= 0 && since < POINTER_ECHO_MS
}

/** How the fan was opened. */
export type FanOpener = "pointer" | "keyboard"

/** How it is being closed. */
export type FanClose = "escape" | "dismiss" | "pick"

/**
 * F12: whether focus goes back to the + as the fan closes.
 *
 * Only for a keyboard (or an assistive activation, which reaches the + the
 * same way): a finger never put focus there, and focusing it after a touch
 * leaves a ring on it that nothing asked for. Escape is a key, so it always
 * hands focus back. A pick hands focus to the flow it opens instead.
 */
export function focusBackToPlus(opener: FanOpener | null, closedBy: FanClose): boolean {
  if (closedBy === "escape") return true
  if (closedBy === "pick") return false
  return opener === "keyboard"
}

/** A path under the mock-data previews (`app/preview/*`), which have no session. */
export function isPreviewPath(pathname: string | null | undefined): boolean {
  return pathname === "/preview" || (pathname ?? "").startsWith("/preview/")
}

/**
 * W44: Weight logs the weight and opens the Weight page behind the pad, so the
 * new weigh-in lands on its graph and in its log. None when you are already
 * there, and none on a preview page (the Weight page is signed in).
 */
export function weightPageHref(pathname: string | null | undefined): string | null {
  if (pathname === "/weight" || isPreviewPath(pathname)) return null
  return "/weight"
}

export const JOURNAL_READ_FAILED = "Couldn’t open the journal. Try again."

/**
 * W11: what the + does with the journal read it asked for before opening the
 * writer.
 *
 * The writer preloads the day's entry from `entries` and saves the day's one
 * row, so it must never open on a read that failed: it would open empty, and
 * saving would write over a note already there. The previews have no session
 * and nothing to overwrite, so they open the writer empty to show the flow.
 */
export function journalOpen<E, O>(
  read: { ok: true; entries: E[]; options: O[] } | { ok: false },
  pathname: string | null | undefined,
): { kind: "open"; entries: E[]; options: O[] } | { kind: "refuse"; message: string } {
  if (read.ok) return { kind: "open", entries: read.entries, options: read.options }
  if (isPreviewPath(pathname)) return { kind: "open", entries: [], options: [] }
  return { kind: "refuse", message: JOURNAL_READ_FAILED }
}
