/**
 * THE RULES FOR THINGS THAT SIT OVER THE APP: the pop-up, the first-dose card
 * and the bottom toast (build-brief-final §3.1, §3.16; cold review B9, B10, B36).
 *
 * Four questions, answered here as pure data so they can be tested:
 *
 * 1. **Where does it render?** A Radix sheet is modal: it hides everything
 *    outside itself from screen readers (`hideOthers`), traps Tab inside itself
 *    and takes pointer events off the page. So anything that must be reachable
 *    while a sheet is up (a toast's Undo, a pop-up's buttons) renders INSIDE the
 *    top open sheet's content, the way the number pad does. A sheet that is
 *    closing (`data-state="closed"`, still on screen for its exit) no longer
 *    counts: what it held goes back to the page.
 * 2. **Where does Tab go?** A pop-up with `aria-modal` keeps Tab inside itself,
 *    wrapping at either end, or a keyboard walks the page behind the scrim. A
 *    layer inside a sheet from another React tree wraps at the sheet's edges
 *    itself, since the sheet's own trap cannot hear it.
 * 3. **What does a sheet leave alone?** A tap on such a layer is not a tap
 *    outside the sheet, and the layer still covers the window when the sheet
 *    is a transformed desktop dialog.
 * 4. **Where does focus go when its control hides?** Back to what opened it.
 *
 * No React, no DOM: the components read these (`components/feel/PopDialog.tsx`,
 * `components/feel/Toast.tsx`, `components/home/FirstDoseModal.tsx`,
 * `components/layout/BottomSheet.tsx`, `components/feel/CloseArrow.tsx`).
 */

/** Every sheet's content element (the protected `components/ui/sheet.tsx`). */
export const SHEET_CONTENT = '[data-slot="sheet-content"]'

/** What Tab can land on inside a pop-up. */
export const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * The sheet content something should render inside: the LAST open one in
 * document order (a sheet opened from a sheet portals after it, so it is on
 * top), or null when no sheet is open.
 *
 * `landed` (optional) says whether a sheet has finished rising. The top sheet
 * does not count until it has: while it slides, anything fixed inside it
 * would slide with it (a transformed ancestor holds its fixed children), so a
 * toast already on screen would drop away and ride back up. It stays where it
 * is for those 320ms and moves in once the sheet is still.
 */
export function topOpenSheet<T extends { getAttribute(name: string): string | null }>(
  sheets: ArrayLike<T>,
  landed: (sheet: T) => boolean = () => true,
): T | null {
  for (let i = sheets.length - 1; i >= 0; i--) {
    const s = sheets[i]
    if (s.getAttribute("data-state") === "closed") continue
    return landed(s) ? s : null
  }
  return null
}

/**
 * Where Tab (or Shift+Tab) goes inside a pop-up of `count` focusable things,
 * from the one at `current` (-1 when focus is not on any of them). It wraps at
 * both ends. -1 means "nothing to land on: hold focus on the card itself".
 */
export function trapTab(count: number, current: number, backwards: boolean): number {
  if (count <= 0) return -1
  if (current < 0 || current >= count) return backwards ? count - 1 : 0
  return (current + (backwards ? count - 1 : 1)) % count
}

/**
 * WHAT A SHEET MUST NOT TAKE AS A TAP OUTSIDE ITSELF. A layer that renders into
 * a sheet from somewhere else in the app (the bottom toast, the first-dose
 * card) sits in the sheet's DOM but outside its React tree, and Radix judges
 * "outside" by the React tree: a tap on the toast's Undo or on the card's Done
 * would close the sheet under it. Every sheet frame exempts these
 * (`components/layout/BottomSheet.tsx`'s `onInteractOutside`); a sheet built on
 * the primitive directly should too.
 */
export const OVER_SHEET = "[data-toast], [data-over-sheet]"

/** Whether a tap's target is on one of those layers (`OVER_SHEET`). */
export function isOverSheet(target: { closest?: (selector: string) => unknown } | null | undefined): boolean {
  return Boolean(target?.closest?.(OVER_SHEET))
}

/**
 * Tab at the EDGE of a sheet's Tab order, from a layer the sheet's own trap
 * cannot hear (cold review B10 round two). Radix wraps Tab from the sheet's
 * last control to its first in a React key handler, so it never runs for the
 * toast's Undo, which lives in the sheet's DOM from another React tree: Tab
 * from Undo would fall out of the sheet and be pulled straight back. This
 * says where it wraps to: the first control from the last going forward, the
 * last from the first going back. Anywhere else, null: the browser's own order
 * inside the sheet is right.
 */
export function tabWrap(count: number, current: number, backwards: boolean): number | null {
  if (count <= 0 || current < 0 || current >= count) return null
  if (!backwards && current === count - 1) return 0
  if (backwards && current === 0) return count - 1
  return null
}

/**
 * Where focus goes when the control holding it steps out of reach: a close
 * arrow hiding as its panel shuts (cold review S4). Back to `opener`, the
 * control focus was on when the arrow opened (a journal tile, the card that
 * opened, the down arrow it stood in for), while that can still take focus;
 * else a control in the arrow's own spot (`near`: its twin); else the first
 * control after the arrow that can (the journal's "How did today go?", drawn
 * afresh as the journal shuts), else the last before it. Null when nothing
 * can. `after` and `before` are in document order.
 */
export function focusHandoff<T>(
  opener: T | null,
  usable: (el: T) => boolean,
  after: readonly T[],
  before: readonly T[],
  near: readonly T[] = [],
): T | null {
  if (opener && usable(opener)) return opener
  const twin = near.find(usable)
  if (twin) return twin
  const next = after.find(usable)
  if (next) return next
  for (let i = before.length - 1; i >= 0; i--) if (usable(before[i])) return before[i]
  return null
}

/** A box on screen, in CSS pixels from the window's top left. */
export interface ScreenBox {
  left: number
  top: number
  width: number
  height: number
}

/**
 * THE WINDOW, SEEN FROM INSIDE A SHEET (cold review B10 round two). Something
 * `position: fixed` inside a sheet is placed against the window only while the
 * sheet has no transform. Desktop's centred dialog is placed with
 * `translate: -50% -50%` (`app/desktop.css`), which makes the dialog the box a
 * fixed child is placed against: a toast inside it sat 9.25rem above the
 * dialog's foot, as wide as the dialog. So a layer rendered into a sheet sits
 * in a frame that covers the window again.
 *
 * `box` is where a `fixed; inset: 0` probe inside the sheet lands, `win`
 * where the same probe lands on <body> (the window as fixed things see it,
 * scrollbar and phone toolbars included). The same box: nothing holds the
 * sheet's fixed children, and the frame is left alone (null), exactly as on
 * <body>. Otherwise the frame's `left`/`top` (against `box`) and size put it
 * back over `win`.
 */
export function windowFrame(box: ScreenBox, win: ScreenBox): ScreenBox | null {
  const same = (a: number, b: number) => Math.abs(a - b) < 0.5
  if (same(box.left, win.left) && same(box.top, win.top) && same(box.width, win.width) && same(box.height, win.height)) {
    return null
  }
  const z = (n: number) => (Object.is(n, -0) ? 0 : n)
  return { left: z(win.left - box.left), top: z(win.top - box.top), width: win.width, height: win.height }
}
