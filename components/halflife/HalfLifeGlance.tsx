"use client"

import { useRef, useState, type CSSProperties } from "react"

import { Container } from "@/components/containers"
import { cn } from "@/lib/utils"
import { CARD_EYEBROW, PRESS } from "@/lib/ui-presets"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import type { DayLogs } from "@/lib/home/doseLog"
import type { StackCompound } from "@/lib/home/stack"
import { formatAmount, formatPercent } from "@/lib/halflife/model"

import { HalfLifeGraph } from "./HalfLifeGraph"
import {
  FigureRows,
  Sparkline,
  UpArrowIcon,
  graphAhead,
  graphBack,
  useHalfLifeModels,
  useMinuteNow,
} from "./HalfLifeCards"

/** A card whose centre is further than this from the middle has been swiped
 *  away, and an open one closes. */
const SWIPED_AWAY_PX = 90
/** What the tab bar and the + leave free at the bottom of the screen. */
const BOTTOM_CLEAR_PX = 96

/**
 * Home's half-life glance (H5, Adrian 2026-09-24): a card per compound that
 * you swipe through, each giving Circulating and Of last dose left over a
 * sparkline, with a pager of short bars.
 *
 * Tapping a half-hidden card scrolls it to the centre. Tapping the card
 * NEAREST the centre opens it in place (a card is never exactly centred, so an
 * exact test left the first and last dead): the sparkline grows into the
 * graph, the rows slide in, the up arrow spins in, and the page scrolls the
 * card into view. The figures are not repeated.
 *
 * Single compounds only: a blend has one curve per part, and two figures on a
 * card cannot say which part they are. Blends are on Protocol's Blends card.
 */
export function HalfLifeGlance({
  compounds,
  logs,
  userId,
}: {
  compounds: readonly StackCompound[]
  logs: DayLogs
  userId: string
}) {
  const now = useMinuteNow()
  const { singles, nowH } = useHalfLifeModels(compounds, logs, userId, now)
  const [openId, setOpenId] = useState<string | null>(null)
  const [draws, setDraws] = useState(0)
  const [page, setPage] = useState(0)
  const swipeRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef(new Map<string, HTMLDivElement>())
  const fullRefs = useRef(new Map<string, HTMLDivElement>())

  const centreOf = (el: Element) => {
    const r = el.getBoundingClientRect()
    return r.left + r.width / 2
  }
  const middle = () => {
    const sw = swipeRef.current
    return sw ? centreOf(sw) : 0
  }

  const tap = (id: string) => {
    const sw = swipeRef.current
    const card = cardRefs.current.get(id)
    if (!sw || !card) return
    const mid = middle()
    const nearest = [...cardRefs.current.values()].reduce((a, b) =>
      Math.abs(centreOf(b) - mid) < Math.abs(centreOf(a) - mid) ? b : a,
    )
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (card !== nearest) {
      sw.scrollBy({ left: centreOf(card) - mid, behavior: reduce ? "auto" : "smooth" })
      return
    }
    if (openId === id) {
      setOpenId(null)
      return
    }
    // The graph's own height, so the frame grows to exactly it.
    const full = fullRefs.current.get(id)
    if (full) card.style.setProperty("--open-h", `${full.offsetHeight}px`)
    setOpenId(id)
    setDraws((n) => n + 1)
    // The card grows below the fold on Home: bring it into view once it has.
    window.setTimeout(() => {
      const r = card.getBoundingClientRect()
      const over = r.bottom - (window.innerHeight - BOTTOM_CLEAR_PX)
      if (over > 0) window.scrollBy({ top: over, behavior: reduce ? "auto" : "smooth" })
    }, 520)
  }

  const onScroll = () => {
    const sw = swipeRef.current
    if (!sw || singles.length === 0) return
    setPage(Math.round(sw.scrollLeft / (sw.scrollWidth / singles.length)))
    if (openId) {
      const card = cardRefs.current.get(openId)
      if (card && Math.abs(centreOf(card) - middle()) > SWIPED_AWAY_PX) setOpenId(null)
    }
  }

  if (singles.length === 0) return null

  return (
    <section className="flow-card rounded-2xl bg-bg-surface px-5 pt-5 pb-4" aria-label="Half-life">
      <h2 className={CARD_EYEBROW}>Half-life</h2>
      <div
        ref={swipeRef}
        onScroll={onScroll}
        className="hl-swipe -mx-5 mt-3 flex items-start gap-2.5 overflow-x-auto px-5"
      >
        {singles.map((m) => {
          const open = openId === m.compound.id
          const hl = m.line.source.halfLifeH
          return (
            <div
              key={m.compound.id}
              ref={(el) => {
                if (el) cardRefs.current.set(m.compound.id, el)
                else cardRefs.current.delete(m.compound.id)
              }}
              data-open={open ? "true" : "false"}
              className="hl-glance-card relative flex flex-col gap-2.5 rounded-[14px] px-3.5 py-[13px]"
              style={{ "--hue": m.hue } as CSSProperties}
            >
              <button
                type="button"
                onClick={() => tap(m.compound.id)}
                aria-expanded={open}
                aria-label={`${m.compound.name}, half-life`}
                className={cn(PRESS.card, "flex flex-col gap-2.5 text-left")}
              >
                <span className="flex items-center gap-2.5 pr-8 text-sm text-foreground">
                  <span className="flex h-6 w-[15px] shrink-0 items-end justify-center">
                    <Container
                      name={m.compound.name}
                      inventoryType={inventoryTypeForCompound(m.compound.name, m.compound.method, m.compound.inventoryForm)}
                      category={m.compound.category}
                      size={24}
                      className="h-full w-full"
                    />
                  </span>
                  <span className="truncate">{m.compound.name}</span>
                </span>
                <span className="grid grid-cols-2 gap-2">
                  <span className="flex flex-col">
                    <span className="font-mono text-[30px] leading-none font-light tracking-[-0.03em] text-foreground">
                      {formatAmount(m.figures.circulating)}
                      <span className="ml-[3px] font-sans text-[13px] text-text-muted">{m.line.unit}</span>
                    </span>
                    <span className="mt-1.5 text-[11.5px] text-text-muted">Circulating</span>
                  </span>
                  <span className="flex flex-col">
                    <span className="font-mono text-[30px] leading-none font-light tracking-[-0.03em] text-foreground">
                      {m.figures.lastDoseLeft == null ? "—" : formatPercent(m.figures.lastDoseLeft)}
                      {m.figures.lastDoseLeft == null ? null : (
                        <span className="ml-[3px] font-sans text-[13px] text-text-muted">%</span>
                      )}
                    </span>
                    <span className="mt-1.5 text-[11.5px] text-text-muted">Of last dose left</span>
                  </span>
                </span>
              </button>

              <div
                className="hl-glance-graph relative overflow-hidden"
                onClick={open ? undefined : () => tap(m.compound.id)}
              >
                <Sparkline
                  lines={m.graph}
                  nowH={nowH}
                  width={260}
                  height={40}
                  stroke={1.8}
                  className="hl-glance-spark absolute inset-0 h-10 w-full"
                />
                <div
                  ref={(el) => {
                    if (el) fullRefs.current.set(m.compound.id, el)
                    else fullRefs.current.delete(m.compound.id)
                  }}
                  className="hl-glance-full absolute inset-x-0 top-0"
                  aria-hidden={!open}
                >
                  <HalfLifeGraph
                    lines={m.graph}
                    t0={nowH - graphBack(hl)}
                    t1={nowH + graphAhead(hl)}
                    nowH={nowH}
                    unit={m.line.unit}
                    drawKey={open ? draws : null}
                  />
                </div>
              </div>

              <div className="hl-glance-more" aria-hidden={!open}>
                <div>
                  <FigureRows source={m.line.source} figures={m.figures} />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpenId(null)}
                aria-label="Close"
                tabIndex={open ? 0 : -1}
                className={cn(
                  PRESS.icon,
                  "hl-glance-up absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full text-foreground",
                )}
              >
                <UpArrowIcon />
              </button>
            </div>
          )
        })}
      </div>
      {singles.length > 1 ? (
        <div className="mt-2.5 flex justify-center gap-[5px]" aria-hidden>
          {singles.map((m, i) => (
            <i key={m.compound.id} className="hl-pager-bar block h-[3px] rounded-sm" data-on={i === page ? "true" : "false"} />
          ))}
        </div>
      ) : null}
    </section>
  )
}
