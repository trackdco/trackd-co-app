"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { cn } from "@/lib/utils"
import { QUICK_ACTION_BADGE } from "@/lib/ui-presets"
import { AddToStackMenu } from "@/components/navigation/add-to-stack-menu"
import { AddWeightSheet } from "@/components/home/AddWeightSheet"
import { QuickTrackSheet } from "@/components/home/QuickTrackSheet"
import { FeedbackSheet } from "@/components/feedback/FeedbackSheet"
import {
  FEEDBACK_ACTION,
  QUICK_ACTIONS,
  type ShortcutItem,
} from "@/components/shortcuts/shortcutItems"
import { requestProgressAction } from "@/lib/progress/progressAction"
import type { WeightUnit } from "@/lib/weight"
import type { BodySex } from "@/lib/db/types"

interface QuickActionsFabProps {
  /** Forwarded to the Add-to-Stack flow (scopes the user's custom compounds). */
  userId: string
  /** The user's weight unit — the Weight action's quick-log popup uses it. */
  unit: WeightUnit
  /** Forwarded to the quick log-dose flow's body map (which figure to draw). */
  bodySex: BodySex
}

/** Keep in step with `--motion-fast` — the JS unmount must outlast the CSS exit. */
const EXIT_MS = 180

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * The quick-actions FAB and its pop-up menu (Spec 20). Pinned bottom-right above
 * the bottom nav and fixed while the page scrolls, it holds every action the old
 * bottom-nav plus opened — minus the calculator, which now has the centre nav
 * slot to itself (D6).
 *
 * Tapping it rotates the plus into an X, dims the page behind a scrim (the nav
 * included), and rises a card of icon-over-label tiles above the button. Tapping
 * the X or the scrim retraces that in reverse. Hand-rolled rather than wrapped in
 * a Radix dialog (D8: plain `useState`) precisely because the FAB must stay live
 * while the menu is open — it is the close button — and a modal dialog makes
 * everything outside its own content inert.
 *
 * Rendered once by the (app) shell, so it appears on exactly the screens that
 * show the bottom nav.
 */
export function QuickActionsFab({ userId, unit, bodySex }: QuickActionsFabProps) {
  const router = useRouter()
  const fabRef = useRef<HTMLButtonElement>(null)
  const firstActionRef = useRef<HTMLButtonElement>(null)
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [open, setOpen] = useState(false)
  // Keeps the card mounted while the exit animation plays; `open` alone would
  // rip it off screen instantly.
  const [closing, setClosing] = useState(false)

  // Which child flow is open (only one at a time).
  const [quickTrackOpen, setQuickTrackOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [weightOpen, setWeightOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  /**
   * `restoreFocus` is the difference between a dismissal and an action: a
   * dismissal owes the user their focus back on the FAB (D7), while an action is
   * about to hand focus to the flow it opens — pulling it back to the FAB first
   * would only fight that.
   */
  const close = useCallback(
    (restoreFocus = true) => {
      setOpen(false)
      if (restoreFocus) fabRef.current?.focus()
      if (prefersReducedMotion()) return
      setClosing(true)
      if (exitTimer.current) clearTimeout(exitTimer.current)
      exitTimer.current = setTimeout(() => setClosing(false), EXIT_MS)
    },
    [],
  )

  useEffect(() => () => {
    if (exitTimer.current) clearTimeout(exitTimer.current)
  }, [])

  // Escape closes (hardware keyboards), and the body stays put while open — a
  // scrolling page under a fixed menu reads as broken. Both unwind on close.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [open, close])

  // Focus moves into the menu on open (D7).
  useEffect(() => {
    if (open) firstActionRef.current?.focus()
  }, [open])

  function handlePress(item: ShortcutItem) {
    close(false)
    switch (item.action) {
      case "route":
        if (item.href) router.push(item.href)
        break
      case "quick-track":
        // The quick "What would you like to track?" popup — log today's doses
        // in place instead of routing to the dashboard.
        setQuickTrackOpen(true)
        break
      case "add-stack":
        setAddOpen(true)
        break
      case "weight":
        setWeightOpen(true)
        break
      case "journal":
        // Open the real journal compose on the Progress screen (Write / Markers).
        requestProgressAction("journal-compose")
        router.push("/progress")
        break
      case "bloodwork":
        // Open the real bloodwork gallery on the Progress screen (view + add).
        requestProgressAction("bloodwork-gallery")
        router.push("/progress")
        break
      case "feedback":
        // The beta "Beta notes & feedback" sheet — send a note to the founders.
        setFeedbackOpen(true)
        break
    }
  }

  const mounted = open || closing

  return (
    <>
      {/* Scrim — dims the whole viewport, the bottom nav included (D1). */}
      {mounted ? (
        <div
          aria-hidden
          onClick={() => close()}
          className={cn(
            "fixed inset-0 z-[45] bg-overlay-backdrop",
            open ? "animate-quick-scrim-in" : "animate-quick-scrim-out",
            !open && "pointer-events-none",
          )}
        />
      ) : null}

      {/* The action card — anchored above the FAB, inset from both edges. */}
      {mounted ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Quick actions"
          className={cn(
            "fixed inset-x-5 z-[46] mx-auto max-w-md rounded-3xl border border-border-default bg-bg-surface-raised p-5 shadow-lg",
            open ? "animate-quick-menu-in" : "animate-quick-menu-out",
            !open && "pointer-events-none",
          )}
          style={{
            // Clears the FAB (3.5rem) and its own gap, on top of the FAB's own
            // offset: nav height + safe area + spacing.
            bottom:
              "calc(4rem + env(safe-area-inset-bottom) + 1rem + 3.5rem + 0.75rem)",
          }}
        >
          <div className="grid grid-cols-3 gap-3">
            {QUICK_ACTIONS.map((item, i) => (
              <ActionTile
                key={item.id}
                ref={i === 0 ? firstActionRef : undefined}
                item={item}
                onPress={() => handlePress(item)}
              />
            ))}
          </div>

          {/* Beta feedback — a full-width white row below the grid, set apart
              from the six core actions (beta-only). */}
          <FeedbackRow
            item={FEEDBACK_ACTION}
            onPress={() => handlePress(FEEDBACK_ACTION)}
          />
        </div>
      ) : null}

      {/* The FAB — stays above the scrim, and is the X that closes the menu. */}
      <button
        ref={fabRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={open ? "Close quick actions" : "Open quick actions"}
        className="fixed right-5 z-[46] flex h-14 w-14 items-center justify-center rounded-full bg-accent-primary text-bg-base shadow-lg transition-transform active:scale-95"
        style={{ bottom: "calc(4rem + env(safe-area-inset-bottom) + 1rem)" }}
      >
        <Plus
          className={cn(
            "h-6 w-6 transition-transform duration-[var(--motion-fast)] ease-motion",
            open && "rotate-45",
          )}
          strokeWidth={2.5}
          aria-hidden
        />
      </button>

      {/* "Log a dose" → the quick-track popup (tick today's doses → confirm). */}
      <QuickTrackSheet
        open={quickTrackOpen}
        onOpenChange={setQuickTrackOpen}
        userId={userId}
        bodySex={bodySex}
      />

      {/* "Add a compound" → the existing, unchanged Add-to-Stack flow. */}
      <AddToStackMenu open={addOpen} onOpenChange={setAddOpen} userId={userId} />

      {/* "Weight" → quick log of today's bodyweight + optional progress photos. */}
      <AddWeightSheet
        open={weightOpen}
        onOpenChange={setWeightOpen}
        unit={unit}
        userId={userId}
      />

      {/* "Beta notes & feedback" → send a note straight to the founders. */}
      <FeedbackSheet
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        userId={userId}
      />
    </>
  )
}

/**
 * The beta "Beta notes & feedback" row — full-width under the grid, in the house
 * amber-tint idiom (the `CARD_ICON_BADGE` surface, widened into a row): a soft
 * warm-grey panel with an amber icon and a muted label. The shape still sets the
 * temporary beta tool apart from the six core tiles, but it is deliberately
 * QUIETER than they are — it was white first and pulled the eye straight past
 * the actual actions, which is backwards for a beta afterthought.
 */
function FeedbackRow({
  item,
  onPress,
}: {
  item: ShortcutItem
  onPress: () => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={onPress}
      className="mt-3 flex min-h-11 w-full items-center justify-center gap-2.5 rounded-2xl border border-accent-amber/25 bg-accent-amber/10 px-4 py-3 transition-colors duration-[var(--motion-base)] ease-motion hover:border-accent-amber/40 hover:bg-accent-amber/15"
    >
      <Icon className="h-4 w-4 shrink-0 text-accent-amber" aria-hidden />
      <span className="text-sm font-medium text-text-muted">{item.title}</span>
    </button>
  )
}

/** One tile: a circular icon badge with its label centred beneath (D1, D2). */
function ActionTile({
  ref,
  item,
  onPress,
}: {
  ref?: React.Ref<HTMLButtonElement>
  item: ShortcutItem
  onPress: () => void
}) {
  const Icon = item.icon
  return (
    <button
      ref={ref}
      type="button"
      onClick={onPress}
      className="flex min-h-11 flex-col items-center justify-start gap-2 rounded-2xl p-1 text-center transition-colors duration-[var(--motion-base)] ease-motion hover:bg-bg-input active:bg-bg-input"
    >
      <span className={QUICK_ACTION_BADGE}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-xs leading-tight font-medium text-text-muted">
        {item.shortLabel ?? item.title}
      </span>
    </button>
  )
}
