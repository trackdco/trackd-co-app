"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"

import { MagnifyingGlass } from "@/components/icons"
import { cn } from "@/lib/utils"

/**
 * ⌘K on the founder dashboard.
 *
 * THE ONLY CLIENT COMPONENT in the glass set, and it earns it: a global key
 * listener, a modal, and focus management are all browser, all the way down.
 *
 * ── WHY A NATIVE `<dialog>` AND NOT A DIV ────────────────────────────────────
 *
 * `showModal()` gives us, from the platform, three things a hand-rolled overlay
 * has to reimplement and usually gets subtly wrong:
 *
 *  1. **A real focus trap.** Tab and Shift+Tab cannot leave a modal dialog. No
 *     querying for focusable descendants, no sentinel nodes, no bug where a
 *     newly rendered row escapes a trap that cached its list.
 *  2. **Inert background.** Everything behind it stops being clickable and stops
 *     being reachable by assistive tech — not merely covered by a scrim.
 *  3. **Focus restore**, and the top layer, so it paints above any stacking
 *     context on the page without a z-index arms race.
 *
 * Focus restore is ALSO done explicitly below rather than left to the platform.
 * It is a hard requirement, the browsers that implement it disagree about
 * whether it survives the element being re-rendered, and it costs one ref.
 *
 * ── THE LIST IS A COMBOBOX, NOT A MENU OF BUTTONS ────────────────────────────
 *
 * Focus stays in the input the whole time and the options are pointed at with
 * `aria-activedescendant`. That is the WAI-ARIA pattern for this control, and it
 * is the only one where typing and navigating can happen in the same breath: a
 * list of real `<button>`s would move focus out of the field on the first
 * ArrowDown and the next keystroke would go nowhere.
 */

export interface CommandItem {
  id: string
  label: string
  /** Right-aligned context: a section name, a count, a shortcut. */
  hint?: string
  action: () => void
}

/** Inputs swallow the digit shortcuts; a dashboard is allowed to have a form on it. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

export function CommandPalette({
  items,
  tabs = [],
  placeholder = "Search the dashboard",
  showTrigger = true,
  className,
}: {
  items: CommandItem[]
  /**
   * Reachable by pressing 1-5 WITH THE PALETTE CLOSED. Only the first five are
   * bound; a sixth tab would need a key nobody would guess.
   *
   * Kept separate from `items` so the two lists can differ. An `items` entry
   * whose `id` matches a tab is annotated with its digit, so putting the tabs in
   * both lists is how the shortcut teaches itself.
   */
  tabs?: CommandItem[]
  placeholder?: string
  /** The visible affordance. A shortcut with nothing on screen is a secret. */
  showTrigger?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)

  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  const listId = useId()
  const optionId = (index: number) => `${listId}-option-${index}`

  const bound = tabs.slice(0, 5)
  const digitOf = new Map(bound.map((tab, i) => [tab.id, i + 1]))

  const needle = query.trim().toLowerCase()
  const filtered = needle
    ? items.filter((item) =>
        `${item.label} ${item.hint ?? ""}`.toLowerCase().includes(needle)
      )
    : items

  /**
   * The selection is CLAMPED HERE, during render, rather than corrected in an
   * effect. Typing can shorten the list under a selection that was valid a
   * keystroke ago; fixing that in an effect means one frame pointing at a row
   * that is not there, and `setState` in an effect body is rejected outright by
   * this project's React Compiler lint rules.
   */
  const activeIndex = filtered.length === 0 ? -1 : Math.min(active, filtered.length - 1)

  /** Ask for the dialog to close. The teardown happens in `onClosed`. */
  const close = useCallback(() => setOpen(false), [])

  /**
   * The dialog's own `close` event, and THE ONLY PLACE FOCUS IS RESTORED.
   *
   * It has to be here rather than alongside `setOpen(false)`, and the reason is
   * a real bug that was in the first cut of this file: while a modal dialog is
   * open the browser will not let focus land outside it, so restoring from the
   * request-to-close path put focus nowhere. The `close` event fires after the
   * dialog has actually left the top layer, which is the first moment the
   * element behind it can take focus again.
   *
   * Every close route funnels through here — Escape, ⌘K again, a click on a
   * row, the trigger. There is no second path to forget.
   */
  const onClosed = useCallback(() => {
    setOpen(false)
    setQuery("")
    setActive(0)
    const restore = restoreRef.current
    restoreRef.current = null
    if (restore && document.contains(restore)) restore.focus()
  }, [])

  const run = useCallback(
    (item: CommandItem) => {
      // Ask to close FIRST: an action that navigates would otherwise leave a
      // modal dialog in the top layer over the page it just moved to.
      close()
      item.action()
    },
    [close]
  )

  // Drive the platform dialog from React state, never the other way around.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) {
        restoreRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null
        dialog.showModal()
      }
      inputRef.current?.focus()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [open])

  /**
   * ⌘K / Ctrl+K anywhere, and 1-5 while the palette is closed.
   *
   * ATTACHED ONCE, and reading its inputs through a ref. `tabs` is all but
   * certain to arrive as an inline array literal, so a dependency array would
   * tear the listener down and rebuild it on every render of the page — and a
   * bare `useEffect` with no array would do the same thing while looking like an
   * oversight. The ref is the honest version of "this listener never needs to
   * change".
   */
  const latest = useRef({ open, bound })
  useEffect(() => {
    latest.current = { open, bound }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === "k") {
        // Chrome's own address-bar focus is on ⌘K. Ours wins on this page.
        event.preventDefault()
        setOpen((was) => !was)
        return
      }
      const { open: isOpen, bound: current } = latest.current
      if (isOpen || mod || event.altKey || event.shiftKey) return
      if (isEditable(event.target)) return
      const digit = Number(event.key)
      if (!Number.isInteger(digit) || digit < 1 || digit > current.length) return
      event.preventDefault()
      current[digit - 1].action()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  /**
   * Keep the pointed-at row in view.
   *
   * `block: "nearest"` and no `behavior` on purpose: the default is an instant
   * jump, so there is nothing here for `prefers-reduced-motion` to disable. A
   * smooth scroll would also lag behind a held-down arrow key.
   */
  useEffect(() => {
    if (!open || activeIndex < 0) return
    const row = listRef.current?.children[activeIndex]
    if (row instanceof HTMLElement) row.scrollIntoView({ block: "nearest" })
  }, [open, activeIndex])

  const move = (delta: number) => {
    if (filtered.length === 0) return
    setActive((filtered.length + activeIndex + delta) % filtered.length)
  }

  return (
    <>
      {showTrigger && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Command palette (⌘K or Ctrl K)"
          className={cn(
            "glass-pill flex items-center gap-2.5 px-4 py-2 text-sm text-text-muted",
            "transition-colors hover:text-foreground focus-visible:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            className
          )}
        >
          <MagnifyingGlass className="size-4 shrink-0" aria-hidden />
          <span>Search</span>
          <kbd className="font-mono text-[11px] tracking-[0.08em] text-text-muted">⌘K</kbd>
        </button>
      )}

      {/* `mt-[12vh] mb-auto` overrides the centring a modal dialog gets from its
          default `margin: auto`, so the palette sits under the top edge where a
          command bar belongs. The dialog itself is a transparent frame; the
          glass panel inside it is the surface. */}
      <dialog
        ref={dialogRef}
        onClose={onClosed}
        aria-label="Command palette"
        className={cn(
          "admin-palette mx-auto mt-[12vh] mb-auto w-[min(34rem,calc(100vw-2rem))]",
          "max-w-none border-0 bg-transparent p-0 text-foreground outline-none"
        )}
      >
        <div className="glass-panel-raised animate-admin-palette-in overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4">
            <MagnifyingGlass className="size-4 shrink-0 text-text-muted" aria-hidden />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
              value={query}
              placeholder={placeholder}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setQuery(event.target.value)
                // A new query is a new list. Pointing at row 7 of the old one
                // would be arbitrary.
                setActive(0)
              }}
              onKeyDown={(event) => {
                switch (event.key) {
                  case "ArrowDown":
                    event.preventDefault()
                    move(1)
                    break
                  case "ArrowUp":
                    event.preventDefault()
                    move(-1)
                    break
                  case "Home":
                    event.preventDefault()
                    setActive(0)
                    break
                  case "End":
                    event.preventDefault()
                    setActive(Math.max(0, filtered.length - 1))
                    break
                  case "Enter": {
                    event.preventDefault()
                    const item = filtered[activeIndex]
                    if (item) run(item)
                    break
                  }
                  default:
                    break
                }
              }}
              className="w-full bg-transparent text-base text-foreground placeholder:text-text-muted focus:outline-none"
            />
          </div>

          <div className="glass-divide">
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label="Results"
              className="max-h-[min(24rem,52vh)] overflow-y-auto py-2"
            >
              {filtered.length === 0 && (
                <li className="px-5 py-4 text-sm text-text-muted">Nothing matches that.</li>
              )}
              {filtered.map((item, index) => {
                const digit = digitOf.get(item.id)
                const selected = index === activeIndex
                return (
                  // No key handler on the option, and that is the pattern rather
                  // than an omission: the combobox above owns every key, and an
                  // option here is POINTED AT, never focused. The click is for a
                  // mouse; a keyboard never reaches this element.
                  <li
                    key={item.id}
                    id={optionId(index)}
                    role="option"
                    aria-selected={selected}
                    onClick={() => run(item)}
                    onMouseEnter={() => setActive(index)}
                    className={cn(
                      "flex cursor-pointer items-center gap-4 px-5 py-3",
                      selected ? "glass-row-on text-foreground" : "text-text-muted"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                    {item.hint && (
                      <span className="shrink-0 text-xs text-text-muted">{item.hint}</span>
                    )}
                    {digit && (
                      <kbd className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] text-text-muted ring-1 ring-[var(--admin-glass-line)] ring-inset">
                        {digit}
                      </kbd>
                    )}
                  </li>
                )
              })}
            </ul>

            {/* `--text-muted`, never `--text-subtle` — small type on glass. */}
            <p className="flex flex-wrap gap-x-4 gap-y-1 px-5 py-3 text-[11px] text-text-muted">
              <span>↑↓ move</span>
              <span>↵ open</span>
              <span>esc close</span>
              {bound.length === 1 && <span>1 jumps to a tab</span>}
              {bound.length > 1 && <span>1-{bound.length} jump to a tab</span>}
            </p>
          </div>
        </div>
      </dialog>
    </>
  )
}
