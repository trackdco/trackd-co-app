"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react"
import { useRouter } from "next/navigation"

import { cn } from "@/lib/utils"
import { getDoseLogsSnapshot, subscribeDoseLogs } from "@/lib/home/doseLog"
import { hasAnyLog } from "@/lib/home/firstRun"
import { PRESS } from "@/lib/ui-presets"
import { FAN_RADIUS, fanHit, fanOffset } from "@/lib/shortcuts/fan"
import { SolidIcon } from "@/components/feel/SolidIcon"
import { AddToStackMenu } from "@/components/navigation/add-to-stack-menu"
import { AddStockSheet } from "@/components/protocol/AddStockSheet"
import { LogWeightPad } from "@/components/weight/LogWeightPad"
import { PLUS_ITEMS, type ShortcutItem } from "@/components/shortcuts/shortcutItems"
import { useWriteAccess } from "@/components/billing/ReadOnlyGate"
import { requestProgressAction } from "@/lib/progress/progressAction"
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

/** The fan folds back in this long; the items stay mounted until it has. */
const EXIT_MS = 220
/** A flow opens once the fan has mostly gone, so the two never overlap. */
const PICK_DELAY_MS = 200
/** A press that travels further than this is a slide, not a tap. */
const SLIDE_PX = 10

/** D3: nav height + the iOS home indicator + a spacing step. */
const FAB_BOTTOM = "calc(4rem + env(safe-area-inset-bottom) + 1rem)"
const FAB = 56
const ITEM = 48

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * THE + (build-brief-final §3.6): a circle at bottom right. Press, slide onto an
 * item, lift to open it; or tap the + and tap an item. Four rounded squares fan
 * out on a 132px arc (30ms apart, on the spring cubic-bezier(.34,1.4,.64,1)):
 * Weight, Journal, Add compound, Add stock. The item under the finger lights
 * white and gives a small wiggle; the others dim. The + turns into an ×, and a
 * scrim dims the page. It hides under sheets and while a dose row is open;
 * toasts sit above it.
 *
 * Modal while open (scrim, locked scroll, Escape, Tab kept inside), with one
 * layer holding both the items and the +, so the control that closes the fan is
 * inside the dialog it closes. Rendered once by the (app) shell.
 */
export function QuickActionsFab({ userId, unit, lastWeightKg = null }: QuickActionsFabProps) {
  const router = useRouter()
  const { canWrite, guard } = useWriteAccess()
  const fabRef = useRef<HTMLButtonElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const press = useRef<{ x: number; y: number; moved: boolean; was: boolean } | null>(null)

  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [hot, setHot] = useState<number | null>(null)

  const loggedEver = useSyncExternalStore(
    subscribeDoseLogs,
    () => hasAnyLog(getDoseLogsSnapshot(userId)),
    () => true,
  )
  const [addOpen, setAddOpen] = useState(false)
  const [stockOpen, setStockOpen] = useState(false)
  const [weightOpen, setWeightOpen] = useState(false)

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    setHot(null)
    if (restoreFocus) fabRef.current?.focus()
    if (prefersReducedMotion()) return
    setClosing(true)
    if (exitTimer.current) clearTimeout(exitTimer.current)
    exitTimer.current = setTimeout(() => setClosing(false), EXIT_MS)
  }, [])

  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current)
    },
    [],
  )

  // Escape closes, Tab stays inside the fan, and the page holds still.
  useEffect(() => {
    if (!open) return
    const focusables = () => [
      ...Array.from(layerRef.current?.querySelectorAll<HTMLElement>("[data-fan-item]") ?? []),
      ...(fabRef.current ? [fabRef.current] : []),
    ]
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close()
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
  }, [open, close])

  /**
   * ⚠️ THE READ-ONLY GATE'S CHOKEPOINT for the fan: every item starts a WRITE
   * (a weigh-in, a journal entry, a compound, stock), so the guard stops each
   * one BEFORE its sheet opens. Focus goes to the + first, so a refusal's
   * pop-up has a live control to hand focus back to.
   */
  function pick(item: ShortcutItem) {
    close(false)
    if (!canWrite) fabRef.current?.focus()
    const run = () =>
      guard(() => {
        switch (item.id) {
          case "weight":
            setWeightOpen(true)
            break
          case "journal":
            requestProgressAction("journal-compose")
            router.push("/progress")
            break
          case "add-compound":
            setAddOpen(true)
            break
          case "add-stock":
            setStockOpen(true)
            break
        }
      })
    if (prefersReducedMotion()) run()
    else window.setTimeout(run, PICK_DELAY_MS)
  }

  /** Light the item under the finger: white, a small wiggle; the rest dim. */
  const light = (i: number | null) => {
    if (i === hot) return
    setHot(i)
    if (i == null || prefersReducedMotion()) return
    const svg = layerRef.current?.querySelector<SVGElement>(`[data-fan-item="${i}"] svg`)
    svg?.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.25) rotate(-8deg)" }, { transform: "scale(1)" }],
      { duration: 380, easing: "cubic-bezier(.34,1.5,.64,1)" },
    )
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

  // FIRST RUN (build-brief-final §3.1): the + stays hidden until the first dose
  // is logged, so a new account has one thing to do. Read live from the log.
  if (!loggedEver) return null

  return (
    <>
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

      {/* `shortcuts-layer` is how a sheet, an open dose row or an in-place edit
          stands the + down (globals.css). Click-through, so the scrim beneath
          still takes a tap. */}
      <div
        ref={layerRef}
        data-quick-actions
        className="shortcuts-layer pointer-events-none fixed inset-0 z-[46]"
        {...(open ? { role: "dialog", "aria-modal": true, "aria-label": "Quick actions" } : {})}
      >
        {mounted
          ? PLUS_ITEMS.map((item, i) => {
              const { x, y } = fanOffset(i)
              const cx = x / FAN_RADIUS
              const cy = y / FAN_RADIUS
              // The one straight up has its label above; the rest to the left.
              const up = Math.abs(cx) <= 0.3
              const on = hot === i
              return (
                <button
                  key={item.id}
                  type="button"
                  data-fan-item={i}
                  tabIndex={open ? 0 : -1}
                  onClick={() => open && pick(item)}
                  aria-label={item.label}
                  className="fan-item pointer-events-auto absolute"
                  data-open={open ? "true" : "false"}
                  data-hot={on ? "true" : hot != null ? "dim" : "false"}
                  style={
                    {
                      right: 20 + FAB / 2 - ITEM / 2,
                      bottom: `calc(${FAB_BOTTOM} + ${FAB / 2 - ITEM / 2}px)`,
                      width: ITEM,
                      height: ITEM,
                      "--x": `${x}px`,
                      "--y": `${y}px`,
                      "--i": i,
                      "--i-rev": PLUS_ITEMS.length - 1 - i,
                    } as CSSProperties
                  }
                >
                  <span className="fan-square flex h-full w-full items-center justify-center">
                    <SolidIcon name={item.glyph} size={20} {...(on ? { hue: "var(--bg-base)" } : {})} />
                  </span>
                  <span
                    aria-hidden
                    className="fan-label absolute text-[12px] whitespace-nowrap text-foreground"
                    style={{
                      left: up ? ITEM : ITEM / 2 + cx * 36,
                      top: ITEM / 2 + cy * 33,
                      transform: "translate(-100%, -50%)",
                    }}
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
            if (!open) setOpen(true)
          }}
          onPointerMove={(e) => {
            const p = press.current
            if (!p) return
            if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLIDE_PX) p.moved = true
            if (p.moved) light(hitAt(e.clientX, e.clientY))
          }}
          onPointerUp={(e) => {
            const p = press.current
            press.current = null
            if (!p) return
            if (p.moved) {
              const i = hitAt(e.clientX, e.clientY)
              if (i != null) pick(PLUS_ITEMS[i])
              else close()
              return
            }
            if (p.was) close()
          }}
          onPointerCancel={() => {
            press.current = null
            light(null)
          }}
          // A keyboard press has no pointer: Enter and Space toggle here.
          onClick={(e) => {
            if (e.detail !== 0) return
            if (open) {
              close()
              return
            }
            setOpen(true)
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

      <AddToStackMenu open={addOpen} onOpenChange={setAddOpen} userId={userId} />
      {/* Add stock with no compound picked: the sheet asks which. */}
      <AddStockSheet open={stockOpen} onOpenChange={setStockOpen} userId={userId} onAdded={() => {}} />
      <LogWeightPad
        open={weightOpen}
        onOpenChange={setWeightOpen}
        unit={unit}
        lastKg={lastWeightKg}
        returnFocusRef={fabRef}
      />
    </>
  )
}
