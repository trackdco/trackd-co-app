"use client"

import { useRef, useState } from "react"
import { ChevronRight, GripVertical, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface ShortcutItemProps {
  title: string
  subtitle: string
  icon: LucideIcon
  onPress: () => void
  /**
   * Reorder mode: show a grip handle instead of the chevron and make the card
   * inert (no navigation — the menu drives the drag). Default appearance and
   * behaviour are unchanged when false.
   */
  reordering?: boolean
}

// Shared card surface — identical in both modes so the default look never shifts.
// `group` lets the icon tile + chevron warm to amber together on hover.
const CARD =
  "group flex w-full items-center gap-4 rounded-2xl border border-border-default bg-bg-surface-raised px-4 py-3.5 text-left"

type Ripple = { id: number; x: number; y: number; size: number }

/**
 * A single full-width action card in the Shortcuts menu.
 *
 * Anatomy (Obsidian tokens only — no new colours/fonts): a squircle icon tile
 * (hairline border, near-black raised fill) → strong-weight title → one-line
 * muted subtitle → trailing chevron. Each card is its own raised surface with a
 * hairline border and comfortable padding — the per-card surface + larger touch
 * target is what makes the menu read app-like rather than minimalist.
 *
 * On tap it plays a soft amber "light-up" ripple from the touch point. No business
 * logic lives here; the menu owns what `onPress` does and (in reorder mode) the drag.
 */
export function ShortcutItem({
  title,
  subtitle,
  icon: Icon,
  onPress,
  reordering = false,
}: ShortcutItemProps) {
  const [ripples, setRipples] = useState<Ripple[]>([])
  const rippleSeq = useRef(0)

  function spawnRipple(e: React.PointerEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    // Diameter that reaches the farthest corner from the touch point, so the glow
    // fills the whole card no matter where it's tapped.
    const size =
      2 *
      Math.max(
        Math.hypot(x, y),
        Math.hypot(rect.width - x, y),
        Math.hypot(x, rect.height - y),
        Math.hypot(rect.width - x, rect.height - y)
      )
    setRipples((cur) => [...cur, { id: rippleSeq.current++, x, y, size }])
  }

  const content = (
    <>
      {/* Icon tile — squircle, hairline border, near-black raised fill, amber icon
          (the sanctioned sparing use of amber; warms its border on hover). */}
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border-default bg-bg-input text-accent-amber transition-colors group-hover:border-accent-amber/30">
        <Icon className="h-5 w-5" aria-hidden />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold text-foreground">
          {title}
        </span>
        <span className="block truncate text-sm text-text-muted">{subtitle}</span>
      </span>

      {reordering ? (
        // Amber grip = active/editing state. Fades in when edit mode is entered.
        <GripVertical
          className="animate-shortcut-fade h-5 w-5 shrink-0 text-accent-amber"
          aria-hidden
        />
      ) : (
        <ChevronRight
          className="animate-shortcut-fade h-5 w-5 shrink-0 text-text-muted transition-colors group-hover:text-accent-amber"
          aria-hidden
        />
      )}
    </>
  )

  // Reorder mode: a non-interactive surface the menu drags. `touch-none` keeps a
  // drag from scrolling the list; `onPress` is intentionally not wired.
  if (reordering) {
    return (
      <div
        className={cn(CARD, "cursor-grab touch-none select-none active:cursor-grabbing")}
      >
        {content}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onPress}
      onPointerDown={spawnRipple}
      className={cn(
        CARD,
        "relative overflow-hidden transition-colors duration-200 ease-out hover:border-border-strong hover:bg-bg-input active:bg-bg-input"
      )}
    >
      {content}

      {/* Tap "light-up" — a soft amber glow expanding from the touch point. */}
      {ripples.map((r) => (
        <span
          key={r.id}
          aria-hidden
          onAnimationEnd={() =>
            setRipples((cur) => cur.filter((x) => x.id !== r.id))
          }
          style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
          className="animate-shortcut-ripple pointer-events-none absolute rounded-full bg-accent-amber/20"
        />
      ))}
    </button>
  )
}
