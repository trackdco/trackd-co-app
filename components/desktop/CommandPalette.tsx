"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import {
  Calculator,
  CalendarDots,
  ChartLine,
  ClipboardText,
  CreditCard,
  Bell,
  ImageSquare,
  MagnifyingGlass,
  NotePencil,
  Scales,
  SquaresFour,
  Syringe,
  User,
  type Icon,
} from "@/components/icons"
import { requestProgressAction, type ProgressAction } from "@/lib/progress/progressAction"
import { CARD_EYEBROW } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

interface Command {
  id: string
  label: string
  group: "Go to" | "Do"
  icon: Icon
  href: string
  /** Fired just before navigating, for the screens that open a flow on arrival. */
  signal?: ProgressAction
  /** Extra words that should match this command without being printed. */
  keywords?: string
}

/**
 * Everything the palette can reach.
 *
 * Deliberately only NAVIGATION and "open this flow" signals. Nothing in this
 * list writes a dose, a weight or an entry: a command palette is a place people
 * type fast and press Enter on whatever is highlighted, which is the wrong
 * gesture to attach a medical log to. Each "Do" entry lands the user on the
 * screen with the real sheet open, where the normal confirm still applies.
 */
const COMMANDS: Command[] = [
  { id: "dashboard", label: "Dashboard", group: "Go to", icon: SquaresFour, href: "/dashboard", keywords: "home today log" },
  { id: "protocol", label: "Protocol", group: "Go to", icon: Syringe, href: "/protocol", keywords: "compounds schedule stacks cycles stock" },
  { id: "calculator", label: "Reconstitution calculator", group: "Go to", icon: Calculator, href: "/calculator", keywords: "recon bac water peptide" },
  { id: "progress", label: "Progress", group: "Go to", icon: ChartLine, href: "/progress", keywords: "weight photos journal bloods" },
  { id: "calendar", label: "Calendar", group: "Go to", icon: CalendarDots, href: "/calendar", keywords: "month days" },
  { id: "weight", label: "Weight", group: "Go to", icon: Scales, href: "/weight", keywords: "bodyweight kg lbs graph" },
  { id: "blocks", label: "Blocks", group: "Go to", icon: ChartLine, href: "/blocks", keywords: "prep cut bulk phase" },
  { id: "profile", label: "Profile", group: "Go to", icon: User, href: "/profile", keywords: "account settings sign out" },
  { id: "notifications", label: "Notifications", group: "Go to", icon: Bell, href: "/notifications", keywords: "reminders push alerts" },
  { id: "billing", label: "Billing", group: "Go to", icon: CreditCard, href: "/billing", keywords: "subscription plan card invoice" },

  { id: "journal", label: "Write a journal entry", group: "Do", icon: NotePencil, href: "/progress", signal: "journal-write", keywords: "note markers mood energy sleep" },
  { id: "bloods", label: "Add bloodwork", group: "Do", icon: ClipboardText, href: "/progress", signal: "bloodwork-gallery", keywords: "labs panel biomarker upload" },
  { id: "photos", label: "Add a progress photo", group: "Do", icon: ImageSquare, href: "/progress", signal: "photos-gallery", keywords: "picture pose front back" },
]

function score(command: Command, query: string): number {
  if (!query) return 1
  const q = query.toLowerCase()
  const label = command.label.toLowerCase()
  if (label.startsWith(q)) return 3
  if (label.includes(q)) return 2
  if (command.keywords?.toLowerCase().includes(q)) return 1
  return 0
}

/**
 * ⌘K — search and jump.
 *
 * Hand-rolled rather than pulled from a library: the whole thing is a filtered
 * list with arrow keys, and a dependency for that would be more code shipped to
 * every user than the feature is.
 *
 * Modality is honoured rather than asserted: focus enters the field on open,
 * Escape and a click on the backdrop both close, and focus returns to whatever
 * had it before. `role="dialog"` with `aria-modal` sits on the panel, and the
 * listbox pattern (`role="listbox"` / `option` / `aria-activedescendant`) is what
 * tells a screen reader that the arrow keys are moving a selection rather than a
 * caret.
 */
export function CommandPalette({
  onOpenChange,
}: {
  /** Mounted only while open — see the effect below for why that matters. */
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)

  const results = useMemo(() => {
    return COMMANDS.map((c) => ({ c, s: score(c, query) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.c)
  }, [query])

  /**
   * The highlight is CLAMPED AT USE, not corrected in an effect.
   *
   * Typing narrows the list, so a highlight sitting at index 6 can end up past
   * the end of a two-result list, and Enter then does nothing. The obvious fix
   * is an effect that pulls `active` back into range whenever the length
   * changes; that is a setState in an effect body, it costs a second render
   * pass on every keystroke, and `react-hooks/set-state-in-effect` rejects it.
   * Deriving the value instead is both correct and free: `active` stays whatever
   * the arrow keys set, and what the list actually uses is always in range.
   */
  const activeIndex = results.length === 0 ? 0 : Math.min(active, results.length - 1)

  /**
   * ONE effect, and it does what an effect is for: synchronising with the DOM,
   * an external system.
   *
   * There is no "reset on open" effect because there is nothing to reset. The
   * parent mounts this component when the palette opens and unmounts it when it
   * closes (see `DesktopKeyboard`), so every open starts with fresh state by
   * construction. Rendering `null` while closed, as the first version did, keeps
   * the component mounted and its stale query alive, which is exactly why it
   * then needed an effect to clear it.
   */
  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    return () => {
      cancelAnimationFrame(raf)
      // Focus goes back where it came from. That is the difference between
      // dismissing a palette and losing your place on the page.
      restoreRef.current?.focus?.()
      restoreRef.current = null
    }
  }, [])

  function run(command: Command) {
    onOpenChange(false)
    if (command.signal) requestProgressAction(command.signal)
    router.push(command.href)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault()
      onOpenChange(false)
      return
    }
    // Both step from the CLAMPED index, not the raw one. After a filter has
    // narrowed the list, `active` can sit past the end; stepping from there
    // would jump somewhere arbitrary instead of moving one row from the
    // highlight the user can actually see.
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (results.length > 0) setActive((activeIndex + 1) % results.length)
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      if (results.length > 0) setActive((activeIndex - 1 + results.length) % results.length)
      return
    }
    if (e.key === "Enter") {
      e.preventDefault()
      const command = results[activeIndex]
      if (command) run(command)
    }
  }

  let lastGroup = ""

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-overlay-backdrop px-6 pt-[14vh]"
      onMouseDown={(e) => {
        // Only a click on the backdrop itself, never one that started inside the
        // panel and finished out here (a text selection dragged past the edge).
        if (e.target === e.currentTarget) onOpenChange(false)
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search and jump to"
        onKeyDown={onKeyDown}
        className="w-full max-w-[34rem] overflow-hidden rounded-3xl bg-bg-surface shadow-lg"
        style={{ boxShadow: "0 40px 80px -28px var(--overlay-backdrop)" }}
      >
        <div className="flex items-center gap-3 px-5 py-4">
          <MagnifyingGlass className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            placeholder="Search screens and actions"
            aria-label="Search screens and actions"
            aria-controls="command-results"
            aria-activedescendant={
              results[activeIndex] ? `command-${results[activeIndex].id}` : undefined
            }
            className="w-full bg-transparent text-[0.9375rem] text-foreground placeholder:text-text-subtle focus:outline-none"
          />
          <kbd className="rounded border border-border-default px-1.5 py-0.5 font-mono text-[0.625rem] text-text-subtle">
            esc
          </kbd>
        </div>

        <div className="hairline-t" />

        <ul
          id="command-results"
          role="listbox"
          aria-label="Results"
          className="max-h-[46vh] overflow-y-auto py-2"
        >
          {results.length === 0 ? (
            <li className="px-5 py-6 text-sm text-text-muted">
              Nothing matches that. Try a screen name, or a compound.
            </li>
          ) : (
            results.map((command, i) => {
              const header = command.group !== lastGroup ? command.group : null
              lastGroup = command.group
              const Ico = command.icon
              const isActive = i === activeIndex
              return (
                <li key={command.id}>
                  {header ? (
                    <p className={cn(CARD_EYEBROW, "px-5 pt-3 pb-1.5")}>{header}</p>
                  ) : null}
                  <div
                    id={`command-${command.id}`}
                    role="option"
                    aria-selected={isActive}
                    tabIndex={-1}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => run(command)}
                    className={cn(
                      "mx-2 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                      isActive ? "bg-bg-surface-raised text-foreground" : "text-text-muted",
                    )}
                  >
                    <Ico className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
                    <span className="flex-1 truncate">{command.label}</span>
                    {isActive ? (
                      <kbd className="rounded border border-border-default px-1.5 py-0.5 font-mono text-[0.625rem] text-text-subtle">
                        return
                      </kbd>
                    ) : null}
                  </div>
                </li>
              )
            })
          )}
        </ul>
      </div>
    </div>
  )
}
