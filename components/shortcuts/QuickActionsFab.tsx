"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react"
import { usePathname, useRouter } from "next/navigation"

import { cn } from "@/lib/utils"
import { getDoseLogsSnapshot, subscribeDoseLogs } from "@/lib/home/doseLog"
import { hasAnyLog } from "@/lib/home/firstRun"
import { getStackSnapshot, type StackCompound } from "@/lib/home/stack"
import { toDateKey } from "@/lib/home/mockHomeData"
import { PRESS } from "@/lib/ui-presets"
import { FAN_HOT_SCALE, FAN_ITEM, fanHit, fanItemState, fanLabelPlace, fanOffset } from "@/lib/shortcuts/fan"
import {
  focusBackToPlus,
  isPointerEcho,
  journalOpen,
  weightPageHref,
  type FanClose,
  type FanOpener,
} from "@/lib/shortcuts/quickActions"
import { stockPickRows, stockPickStep } from "@/lib/shortcuts/stockPick"
import { showToast } from "@/lib/toast"
import type { JournalEntry, MarkerOption } from "@/lib/progress/journal"
import { readJournalForHome } from "@/app/(app)/progress/actions"
import { AddToStackMenu } from "@/components/navigation/add-to-stack-menu"
import { AddStockSheet } from "@/components/protocol/AddStockSheet"
import { JournalEntrySheet } from "@/components/progress/JournalEntrySheet"
import { LogWeightPad } from "@/components/weight/LogWeightPad"
import { FanGlyph } from "@/components/shortcuts/FanGlyph"
import { StockCompoundPicker } from "@/components/shortcuts/StockCompoundPicker"
import { PLUS_ITEMS, type ShortcutItem } from "@/components/shortcuts/shortcutItems"
import { useWriteAccess } from "@/components/billing/ReadOnlyGate"
import type { WeightUnit } from "@/lib/weight"
import type { BodySex } from "@/lib/db/types"

interface QuickActionsFabProps {
  /** Forwarded to the Add-to-Stack and Add stock flows. */
  userId: string
  /** The user's weight unit — the Weight item's pad uses it. */
  unit: WeightUnit
  /** Kept for the shell's call; the fan has no dose flow of its own. */
  bodySex?: BodySex
  /** The latest weigh-in (kg), which the Weight pad opens on. */
  lastWeightKg?: number | null
}

type JournalRead = Awaited<ReturnType<typeof readJournalForHome>>

const EMPTY_STACK: StackCompound[] = []
/** The fan folds back in this long; the items stay mounted until it has. */
const EXIT_MS = 220
/** A flow opens once the fan has mostly gone, so the two never overlap. */
const PICK_DELAY_MS = 200
/** A tapped item holds white this long before the fan folds (W45; the final check's 120). */
const TAP_HOLD_MS = 120
/** A pop-up leaves in 170ms (`PopDialog`); what it hands on to opens after. */
const POP_EXIT_MS = 190
/** A press that travels further than this is a slide, not a tap. */
const SLIDE_PX = 10

/** D3: nav height + the iOS home indicator + a spacing step. */
const FAB_BOTTOM = "calc(4rem + env(safe-area-inset-bottom) + 1rem)"
const FAB = 56
/** The spring the fan uses (`.fan-square`), for the marks' own small moves. */
const SPRING = "cubic-bezier(.34,1.5,.64,1)"

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * THE + (build-brief-final §3.6): a circle at bottom right. Press, slide onto an
 * item, lift to open it; or tap the + and tap an item. Four rounded squares fan
 * out on a 132px arc (30ms apart, on the spring cubic-bezier(.34,1.4,.64,1)):
 * Weight, Journal, Add compound, Add stock. The + turns into an ×, and a scrim
 * dims the page.
 *
 * W45: the item under the finger turns white, its mark inverted, with a small
 * wiggle, and the others dim; lifting there picks it, with a press. A tapped
 * item turns white and wiggles the same way, holds a beat, then the fan folds
 * with the picked one still white. Each label sits on a soft dark backing, so
 * it reads over whatever the page has under it (D27).
 *
 * What each item opens:
 * - Weight: the pad, with the Weight page opening behind it, so the weigh-in
 *   lands on its graph and in its log (W44).
 * - Journal: the full-page writer (`JournalEntrySheet`, Save pinned at the
 *   foot), wherever you are, on today (W11). It opens once the journal is read,
 *   never on a failed read (it would save over the day's note). The read starts
 *   the moment Journal is lit, pressed or focused, so it is usually back by the
 *   time the fan has folded.
 * - Add compound: the add flow.
 * - Add stock: "Which compound?", then that compound's Add stock (W43); with one
 *   compound it goes straight there.
 *
 * On EVERY page (ruling 1: the pushed Protocol pages keep it too). It steps
 * aside under a sheet, while a dose row or an in-place edit is open (the
 * `shortcuts-layer` rules in globals.css), and until the first dose is logged.
 *
 * Modal while open (scrim, locked scroll, Escape, Tab kept inside), with one
 * layer holding both the items and the +, so the control that closes the fan is
 * inside the dialog it closes. Focus goes back to the + only when a keyboard
 * opened it (F12). A press opens it on the way down and the click that follows
 * is its echo; any other click (a key, a switch, a screen reader) toggles it
 * (S3). Rendered once by the (app) shell.
 */
export function QuickActionsFab({ userId, unit, lastWeightKg = null }: QuickActionsFabProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { canWrite, guard } = useWriteAccess()
  const fabRef = useRef<HTMLButtonElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const press = useRef<{ x: number; y: number; moved: boolean; was: boolean } | null>(null)
  /** When the last press on the + ended: the click after it is its echo (S3). */
  const pointerEndedAt = useRef<number | null>(null)
  /** How the fan was opened: focus goes back to the + only after a keyboard (F12). */
  const opener = useRef<FanOpener | null>(null)
  /** An item has been chosen this time the fan is open: the rest are ignored. */
  const picking = useRef(false)
  /** The lit item, as the handlers see it between renders. */
  const hotRef = useRef<number | null>(null)
  /** Bumped by every pick and every open, so a journal read that lands late opens nothing. */
  const ticket = useRef(0)
  const journalRead = useRef<Promise<JournalRead> | null>(null)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Where focus goes when the Weight pad closes: the + after a keyboard, else nowhere. */
  const padReturn = useRef<HTMLElement | null>(null)

  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [hot, setHot] = useState<number | null>(null)

  const loggedEver = useSyncExternalStore(
    subscribeDoseLogs,
    () => hasAnyLog(getDoseLogsSnapshot(userId)),
    () => true,
  )
  const [addOpen, setAddOpen] = useState(false)
  const [weightOpen, setWeightOpen] = useState(false)
  const [stockPickOpen, setStockPickOpen] = useState(false)
  /** The compound whose Add stock is open (its CLIENT stack id). */
  const [stockFor, setStockFor] = useState<string | null>(null)
  const [writerOpen, setWriterOpen] = useState(false)
  const [writer, setWriter] = useState<{ entries: JournalEntry[]; options: MarkerOption[]; todayKey: string }>(
    () => ({ entries: [], options: [], todayKey: toDateKey(new Date()) }),
  )

  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t)
      fn()
    }, ms)
    timers.current.add(t)
  }, [])

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      pending.clear()
      if (exitTimer.current) clearTimeout(exitTimer.current)
    }
  }, [])

  const setLit = useCallback((i: number | null) => {
    hotRef.current = i
    setHot(i)
  }, [])

  /** Fold the fan. A pick keeps its item white on the way; anything else unlights at once. */
  const fold = useCallback(
    (closedBy: FanClose) => {
      setOpen(false)
      if (closedBy !== "pick") setLit(null)
      if (focusBackToPlus(opener.current, closedBy)) fabRef.current?.focus()
      if (exitTimer.current) clearTimeout(exitTimer.current)
      if (prefersReducedMotion()) {
        setClosing(false)
        setLit(null)
        return
      }
      setClosing(true)
      exitTimer.current = setTimeout(() => {
        setClosing(false)
        setLit(null)
      }, EXIT_MS)
    },
    [setLit],
  )

  const openFan = (by: FanOpener) => {
    opener.current = by
    picking.current = false
    ticket.current += 1
    journalRead.current = null
    if (exitTimer.current) clearTimeout(exitTimer.current)
    setClosing(false)
    setLit(null)
    setOpen(true)
  }

  // Escape closes, Tab stays inside the fan, and the page holds still.
  useEffect(() => {
    if (!open) return
    const focusables = () => [
      ...Array.from(layerRef.current?.querySelectorAll<HTMLElement>("[data-fan-item]") ?? []),
      ...(fabRef.current ? [fabRef.current] : []),
    ]
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        fold("escape")
        return
      }
      if (e.key !== "Tab") return
      const nodes = focusables()
      if (nodes.length === 0) return
      const i = nodes.indexOf(document.activeElement as HTMLElement)
      if (i === -1) {
        e.preventDefault()
        nodes[0].focus()
      } else if (e.shiftKey && i === 0) {
        e.preventDefault()
        nodes[nodes.length - 1].focus()
      } else if (!e.shiftKey && i === nodes.length - 1) {
        e.preventDefault()
        nodes[0].focus()
      }
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [open, fold])

  /** The journal, read once per open of the fan, as soon as Journal is in reach. */
  const readJournal = () => {
    journalRead.current ??= readJournalForHome().catch((): JournalRead => ({ ok: false }))
    return journalRead.current
  }

  async function openWriter(mine: number) {
    const read = await readJournal()
    // The fan was opened again, or something else was picked, while it read.
    if (mine !== ticket.current) return
    const plan = journalOpen(read, pathname)
    if (plan.kind === "refuse") {
      showToast(plan.message)
      return
    }
    const today = toDateKey(new Date())
    setWriter({ entries: plan.entries, options: plan.options, todayKey: today })
    setWriterOpen(true)
  }

  function startFlow(item: ShortcutItem, mine: number) {
    switch (item.id) {
      case "weight": {
        const href = weightPageHref(pathname)
        if (href) router.push(href)
        setWeightOpen(true)
        break
      }
      case "journal":
        void openWriter(mine)
        break
      case "add-compound":
        setAddOpen(true)
        break
      case "add-stock": {
        const rows = stockPickRows(getStackSnapshot(userId, EMPTY_STACK), toDateKey(new Date()), null)
        const step = stockPickStep(rows)
        if (step.kind === "one") setStockFor(step.id)
        else setStockPickOpen(true)
        break
      }
    }
  }

  /**
   * ⚠️ THE READ-ONLY GATE'S CHOKEPOINT for the fan: every item starts a WRITE
   * (a weigh-in, a journal entry, a compound, stock), so the guard stops each
   * one BEFORE its flow opens. After a keyboard, focus goes to the + first, so
   * a refusal's pop-up has a live control to hand focus back to.
   */
  function pick(item: ShortcutItem) {
    fold("pick")
    const keyboard = opener.current === "keyboard"
    if (!canWrite && keyboard) fabRef.current?.focus()
    padReturn.current = keyboard ? fabRef.current : null
    ticket.current += 1
    const mine = ticket.current
    // Opening the fan again before the flow is due calls the flow off.
    const run = () => {
      if (mine === ticket.current) guard(() => startFlow(item, mine))
    }
    if (prefersReducedMotion()) run()
    else later(run, PICK_DELAY_MS)
  }

  /** The mark of item `i`, and its square. */
  const partOf = (i: number, sel: string) =>
    layerRef.current?.querySelector<HTMLElement>(`[data-fan-item="${i}"] ${sel}`) ?? null

  /** Light the item under the finger: white, its mark wiggles; the rest dim. */
  const light = (i: number | null) => {
    if (i === hotRef.current) return
    setLit(i)
    if (i == null) return
    if (PLUS_ITEMS[i].id === "journal") void readJournal()
    if (prefersReducedMotion()) return
    partOf(i, "[data-fan-glyph]")?.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.25) rotate(-8deg)" }, { transform: "scale(1)" }],
      { duration: 380, easing: SPRING },
    )
  }

  /**
   * Choose item `i`. A tap lights it (if the press has not already), holds it
   * white a beat, then folds; a slide ends with a press on the lit square and
   * folds at once.
   */
  function choose(i: number, how: "tap" | "slide") {
    if (picking.current || !open) return
    picking.current = true
    light(i)
    const reduce = prefersReducedMotion()
    if (how === "slide" && !reduce) {
      partOf(i, ".fan-square")?.animate(
        [
          { transform: `scale(${FAN_HOT_SCALE})` },
          { transform: "scale(1.02)" },
          { transform: `scale(${FAN_HOT_SCALE})` },
        ],
        { duration: 180, easing: SPRING },
      )
    }
    const item = PLUS_ITEMS[i]
    if (how === "tap" && !reduce) later(() => pick(item), TAP_HOLD_MS)
    else pick(item)
  }

  /** The item a finger at (x, y) is on: the one under it, else by angle. */
  const hitAt = (x: number, y: number): number | null => {
    const under = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-fan-item]")
    if (under && layerRef.current?.contains(under)) return Number(under.dataset.fanItem)
    const f = fabRef.current?.getBoundingClientRect()
    if (!f) return null
    return fanHit(x - (f.left + f.width / 2), y - (f.top + f.height / 2))
  }

  const mounted = open || closing

  const flows = (
    <>
      <AddToStackMenu open={addOpen} onOpenChange={setAddOpen} userId={userId} />
      <StockCompoundPicker
        open={stockPickOpen}
        onClose={() => setStockPickOpen(false)}
        userId={userId}
        onPick={(id) => {
          setStockPickOpen(false)
          later(() => setStockFor(id), POP_EXIT_MS)
        }}
        onAddCompound={() => {
          setStockPickOpen(false)
          later(() => setAddOpen(true), POP_EXIT_MS)
        }}
      />
      {/* That compound's Add stock, as Protocol opens it from its card. */}
      <AddStockSheet
        open={stockFor !== null}
        onOpenChange={(o) => {
          if (!o) setStockFor(null)
        }}
        userId={userId}
        refillFor={null}
        preselectFor={stockFor}
        refillType={null}
        editItem={null}
        replaceItemId={null}
        onAdded={() => setStockFor(null)}
      />
      <LogWeightPad
        open={weightOpen}
        onOpenChange={setWeightOpen}
        unit={unit}
        lastKg={lastWeightKg}
        returnFocusRef={padReturn}
      />
      <JournalEntrySheet
        open={writerOpen}
        onOpenChange={setWriterOpen}
        mode="write"
        options={writer.options}
        entries={writer.entries}
        userId={userId}
        todayKey={writer.todayKey}
        initialDate={writer.todayKey}
      />
    </>
  )

  // FIRST RUN (build-brief-final §3.1): the + stays hidden until the first dose
  // is logged, so a new account has one thing to do. Read live from the log.
  if (!loggedEver) return null

  return (
    <>
      {mounted ? (
        <div
          aria-hidden
          onClick={() => fold("dismiss")}
          className={cn(
            "fixed inset-0 z-[45] bg-overlay-backdrop",
            open ? "animate-quick-scrim-in" : "animate-quick-scrim-out",
            !open && "pointer-events-none",
          )}
        />
      ) : null}

      {/* `shortcuts-layer` is how a sheet, an open dose row or an in-place edit
          stands the + down (globals.css). Click-through, so the scrim beneath
          still takes a tap. No selection or callout, so a long press stays a
          press on iOS. */}
      <div
        ref={layerRef}
        data-quick-actions
        className="shortcuts-layer pointer-events-none fixed inset-0 z-[46] select-none [-webkit-touch-callout:none]"
        {...(open ? { role: "dialog", "aria-modal": true, "aria-label": "Quick actions" } : {})}
      >
        {mounted
          ? PLUS_ITEMS.map((item, i) => {
              const { x, y } = fanOffset(i)
              const label = fanLabelPlace(i)
              const on = hot === i
              return (
                <button
                  key={item.id}
                  type="button"
                  data-fan-item={i}
                  tabIndex={open ? 0 : -1}
                  onPointerDown={(e) => {
                    if (e.button !== 0 || !open || picking.current) return
                    light(i)
                  }}
                  onPointerLeave={(e) => {
                    // A mouse dragged off before letting go; a finger leaves only after lifting.
                    if (e.pointerType === "mouse" && e.buttons !== 0 && !picking.current && hotRef.current === i) {
                      light(null)
                    }
                  }}
                  onPointerCancel={() => {
                    if (!picking.current) light(null)
                  }}
                  onFocus={() => {
                    if (item.id === "journal") void readJournal()
                  }}
                  onClick={() => choose(i, "tap")}
                  onContextMenu={(e) => e.preventDefault()}
                  aria-label={item.label}
                  className="fan-item pointer-events-auto absolute"
                  data-open={open ? "true" : "false"}
                  data-hot={fanItemState(i, hot, open)}
                  style={
                    {
                      right: 20 + FAB / 2 - FAN_ITEM / 2,
                      bottom: `calc(${FAB_BOTTOM} + ${FAB / 2 - FAN_ITEM / 2}px)`,
                      width: FAN_ITEM,
                      height: FAN_ITEM,
                      "--x": `${x}px`,
                      "--y": `${y}px`,
                      "--i": i,
                      "--i-rev": PLUS_ITEMS.length - 1 - i,
                    } as CSSProperties
                  }
                >
                  <span className="fan-square flex h-full w-full items-center justify-center">
                    <FanGlyph name={item.glyph} hot={on} />
                  </span>
                  {/* D27: a soft dark backing, so the label reads over any page. */}
                  <span
                    aria-hidden
                    className="fan-label absolute rounded-sm bg-bg-surface/85 px-[7px] py-[3px] text-[12px] leading-4 whitespace-nowrap text-foreground"
                    style={label}
                  >
                    {item.label}
                  </span>
                </button>
              )
            })
          : null}

        {/* The +: a circle, and the × that closes the fan. */}
        <button
          ref={fabRef}
          type="button"
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
            press.current = { x: e.clientX, y: e.clientY, moved: false, was: open }
            if (!open) openFan("pointer")
          }}
          onPointerMove={(e) => {
            const p = press.current
            if (!p) return
            if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLIDE_PX) p.moved = true
            if (p.moved && !picking.current) light(hitAt(e.clientX, e.clientY))
          }}
          onPointerUp={(e) => {
            pointerEndedAt.current = performance.now()
            const p = press.current
            press.current = null
            if (!p) return
            if (p.moved) {
              const i = hitAt(e.clientX, e.clientY)
              if (i != null) choose(i, "slide")
              else fold("dismiss")
              return
            }
            if (p.was) fold("dismiss")
          }}
          onPointerCancel={() => {
            pointerEndedAt.current = performance.now()
            press.current = null
            if (!picking.current) light(null)
          }}
          onContextMenu={(e) => e.preventDefault()}
          // Everything that is not a press's own echo: Enter, Space, a switch or
          // a screen reader's activation. It toggles, and focus goes in.
          onClick={() => {
            if (isPointerEcho(performance.now(), pointerEndedAt.current)) return
            if (open) {
              fold("dismiss")
              return
            }
            openFan("keyboard")
            requestAnimationFrame(() => layerRef.current?.querySelector<HTMLElement>("[data-fan-item]")?.focus())
          }}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={open ? "Close quick actions" : "Open quick actions"}
          className={cn(
            PRESS.fab,
            "pointer-events-auto absolute right-5 flex h-14 w-14 touch-none items-center justify-center rounded-full bg-accent-primary text-bg-base shadow-lg",
          )}
          style={{ bottom: FAB_BOTTOM }}
        >
          <span aria-hidden className="fan-cross relative block h-4 w-4" data-open={open ? "true" : "false"}>
            <i />
            <i />
          </span>
        </button>
      </div>

      {flows}
    </>
  )
}
