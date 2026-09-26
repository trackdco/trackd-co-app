"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, type CSSProperties } from "react"

import { Container } from "@/components/containers"
import { CloseArrow } from "@/components/feel/CloseArrow"
import { TypeRail } from "@/components/feel/TypeRail"
import { cn } from "@/lib/utils"
import { CARD_EYEBROW, FIGURE, INNER_RADIUS, PRESS, TILE_LABEL } from "@/lib/ui-presets"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { CATEGORY_META, type CompoundCategory } from "@/lib/compound-categories"
import type { DayLogs } from "@/lib/home/doseLog"
import type { StackCompound } from "@/lib/home/stack"
import { formatPercent, halfGoneAtH, heldScroll, nowReading } from "@/lib/halflife/model"

import { HalfLifeGraph } from "./HalfLifeGraph"
import { RollNumber } from "./RollNumber"
import {
  FigureRows,
  Sparkline,
  graphAhead,
  graphBack,
  useHalfLifeModels,
  useMinuteNow,
} from "./HalfLifeCards"

/** The card grows to full width over this long, and the rail is held on it. */
const GROW_MS = 460
/** Reduced motion: how long the rail fades in after a card jumps to centre. */
const REDUCED_FADE_MS = 160
/** A scroll that has settled this long while a card is open picks its card. */
const SETTLE_MS = 140

const CATEGORY_ORDER = Object.keys(CATEGORY_META) as CompoundCategory[]

/** A compound's own Half-life page. Stable, so the prefetch runs once per open. */
const halfLifePage = (id: string) => `/protocol/half-life/${encodeURIComponent(id)}`

function Chevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
      <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Home's half-life glance (build-brief-final §3.3). A type chip rail (All is
 * four squares) over swipe cards, each giving Circulating and Of last dose left
 * over a sparkline, with a small down chevron so it reads as openable.
 *
 * Tapping ANY card centres it and opens it: the card grows to full width (the
 * rail is held on it every frame, so it never drifts) and the graph grows out
 * of it, lined up exactly because it is inside it. Swiping while open switches
 * compound; the close arrow (the one `CloseArrow`, consistency fix #11) closes
 * it and it shrinks back. The open card adds the graph (a circled "?" in its
 * own corner for "Reading the curve", W1; the likely range around the line as
 * every graph draws it, W51; the ½ line; the dose ticks) and the rows, and
 * does not repeat the two figures.
 *
 * After a dose is tracked nothing scrolls: the figures ROLL from their old
 * value if the card is on screen, else update quietly. Right after a dose,
 * while nothing has reached the blood yet, Circulating reads "Absorbing" in
 * place of 0.00 (ruling 5, `nowReading`).
 *
 * Single compounds only: a blend has one curve per part, and two figures on a
 * card cannot say which part they are.
 *
 * OPEN, the name and the two figures at the top are the way to the compound's
 * own Half-life page (Adrian, 26 Sep: "if I want to know more I'd do that"); a
 * small arrow fades in beside the name to say so. Shut, they open the card as
 * before, and the rows below (Level, Half-life and the rest) never navigate.
 */
export function HalfLifeGlance({
  compounds,
  logs,
  userId,
  pageHref = halfLifePage,
}: {
  compounds: readonly StackCompound[]
  logs: DayLogs
  userId: string
  /** Where an open card's name and figures lead. */
  pageHref?: (compoundId: string) => string
}) {
  const router = useRouter()
  const now = useMinuteNow()
  const { singles, nowH } = useHalfLifeModels(compounds, logs, userId, now)
  const [cat, setCat] = useState<string>("all")
  const [openId, setOpenId] = useState<string | null>(null)
  const [draws, setDraws] = useState(0)
  const swipeRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef(new Map<string, HTMLDivElement>())
  const pinning = useRef(false)
  const settleTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(settleTimer.current), [])
  // The open card's page is fetched while you read the card, so the tap lands
  // at once and the page's own entrance is the transition.
  useEffect(() => {
    if (openId) router.prefetch(pageHref(openId))
  }, [openId, pageHref, router])

  const cats = CATEGORY_ORDER.filter((c) => singles.some((m) => m.compound.category === c))
  const shown = cat === "all" || !cats.includes(cat as CompoundCategory) ? singles : singles.filter((m) => m.compound.category === cat)

  /** Where the rail's scroll puts `card` in the middle. */
  const centreLeft = (card: HTMLElement) => {
    const sw = swipeRef.current
    return sw ? card.offsetLeft - (sw.clientWidth - card.offsetWidth) / 2 : 0
  }
  /**
   * The open graph's height at the card's FULL width, set before it opens so
   * the frame grows straight to it while the card widens (measuring mid-grow
   * would catch the narrow width). The graph's SVG is 270 × 106 in its inset:
   * 10px over it (the "?" sits in that corner, over the graph, W1), 6px at the
   * foot, 10px each side, inside a card with 14px each side.
   */
  const setOpenHeight = (id: string) => {
    const sw = swipeRef.current
    const card = cardRefs.current.get(id)
    if (!sw || !card) return
    const cardW = sw.clientWidth - 40
    const svgW = cardW - 28 - 20
    card.style.setProperty("--open-h", `${Math.round(10 + (svgW * 106) / 270 + 6)}px`)
  }
  /** Reduced motion: a card that jumps into place does so behind a short fade
   *  (build-brief-final §3.16), never a slide. */
  const fadeRail = (sw: HTMLElement) => {
    sw.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: REDUCED_FADE_MS, easing: "ease-out" })
  }
  /**
   * Hold the rail on `id` every frame while the widths change. A side card
   * does not jump: its offset from the centre eases to nothing over the grow
   * (`heldScroll`), so it slides in as it widens (cold review F7). The centre
   * card is already there, so it simply stays held.
   */
  const pin = (id: string, ms: number) => {
    const sw = swipeRef.current
    const card = cardRefs.current.get(id)
    if (!sw || !card) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const offset = sw.scrollLeft - centreLeft(card)
    if (reduce && Math.abs(offset) > 1) fadeRail(sw)
    const from = reduce ? 0 : offset
    pinning.current = true
    sw.style.scrollSnapType = "none"
    let t0 = -1
    const step = (t: number) => {
      if (t0 < 0) t0 = t
      const c = cardRefs.current.get(id)
      if (c) sw.scrollLeft = heldScroll(centreLeft(c), from, t - t0, GROW_MS)
      if (t - t0 < ms) requestAnimationFrame(step)
      else {
        sw.style.scrollSnapType = ""
        pinning.current = false
      }
    }
    requestAnimationFrame(step)
  }

  const close = () => {
    const was = openId
    setOpenId(null)
    if (was) pin(was, GROW_MS + 60)
  }
  // Any card: centre it and open it (a side card too, round three).
  const tap = (id: string) => {
    if (openId === id) return
    setDraws((n) => n + 1)
    setOpenHeight(id)
    if (openId) {
      // Already open: a tap on another card switches to it.
      setOpenId(id)
      const card = cardRefs.current.get(id)
      const sw = swipeRef.current
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      if (card && sw) {
        if (reduce) fadeRail(sw)
        sw.scrollTo({ left: centreLeft(card), behavior: reduce ? "auto" : "smooth" })
      }
      return
    }
    setOpenId(id)
    pin(id, GROW_MS + 60)
  }
  // Swiping while open switches compound, once the swipe has settled.
  const onScroll = () => {
    if (!openId || pinning.current) return
    window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      const sw = swipeRef.current
      if (!sw || pinning.current) return
      const mid = sw.scrollLeft + sw.clientWidth / 2
      let best: string | null = null
      let bd = Infinity
      for (const [id, el] of cardRefs.current) {
        const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid)
        if (d < bd) {
          bd = d
          best = id
        }
      }
      if (best && best !== openId) {
        setOpenHeight(best)
        setOpenId(best)
        setDraws((n) => n + 1)
      }
    }, SETTLE_MS)
  }

  if (singles.length === 0) return null

  return (
    <section className="flow-card inst-card px-5 pt-5 pb-4" aria-label="Half-life">
      <h2 className={CARD_EYEBROW}>Half-life</h2>
      <TypeRail
        categories={cats}
        value={cat}
        onChange={(k) => {
          setCat(k)
          setOpenId(null)
          swipeRef.current?.scrollTo({ left: 0 })
        }}
        className="mt-3"
      />
      <div
        ref={swipeRef}
        onScroll={onScroll}
        data-open={openId ? "true" : "false"}
        className="hl-swipe -mx-5 mt-3 flex items-start gap-2.5 overflow-x-auto px-5"
      >
        {shown.map((m) => {
          const isOpen = openId === m.compound.id
          const hl = m.line.source.halfLifeH
          const line = m.graph[0]
          const taken = line?.taken.length ?? 0
          const half = line ? halfGoneAtH([...line.taken, ...line.toCome], nowH, hl, m.line.source.route) : null
          const now = nowReading(m.figures)
          return (
            <div
              key={m.compound.id}
              ref={(el) => {
                if (el) cardRefs.current.set(m.compound.id, el)
                else cardRefs.current.delete(m.compound.id)
              }}
              data-open={isOpen ? "true" : "false"}
              className={cn(INNER_RADIUS, "hl-glance-card group/hl relative flex flex-col gap-2.5 px-3.5 py-[13px]")}
              style={{ "--hue": m.hue } as CSSProperties}
            >
              <button
                type="button"
                onClick={() => (isOpen ? router.push(pageHref(m.compound.id)) : tap(m.compound.id))}
                aria-expanded={isOpen ? undefined : false}
                aria-label={isOpen ? `Open ${m.compound.name}'s half-life page` : `${m.compound.name}, half-life`}
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
                  {/* Open: a small arrow fades in after the name, once the card
                      has grown, to say the name leads to its page. */}
                  <span
                    aria-hidden
                    className="-ml-1 flex shrink-0 -rotate-90 text-text-muted opacity-0 transition-opacity duration-200 group-data-[open=true]/hl:opacity-100 group-data-[open=true]/hl:delay-300 motion-reduce:transition-none"
                  >
                    <Chevron />
                  </span>
                </span>
                <span className="grid grid-cols-2 gap-2">
                  <span className="flex flex-col">
                    <span className={cn(FIGURE, "text-[30px] leading-none font-light text-foreground")}>
                      {now.kind === "absorbing" ? (
                        // Ruling 5: the word in the figure's own line box, so
                        // the card does not move; it rises in as it lands.
                        <span className="animate-hl-swap inline-block align-bottom font-sans text-[18px] leading-[30px]">
                          Absorbing
                        </span>
                      ) : (
                        <>
                          <RollNumber text={now.text} rollKey={taken} />
                          <span className="ml-[3px] font-sans text-[13px] text-text-muted">{m.line.unit}</span>
                        </>
                      )}
                    </span>
                    <span className={cn(TILE_LABEL, "mt-1.5")}>Circulating</span>
                  </span>
                  {m.figures.lastDoseLeft == null ? null : (
                    <span className="flex flex-col">
                      <span className={cn(FIGURE, "text-[30px] leading-none font-light text-foreground")}>
                        <RollNumber text={formatPercent(m.figures.lastDoseLeft)} rollKey={taken} />
                        <span className="ml-[3px] font-sans text-[13px] text-text-muted">%</span>
                      </span>
                      <span className={cn(TILE_LABEL, "mt-1.5")}>Of last dose left</span>
                    </span>
                  )}
                </span>
              </button>

              {/* Closed: a small down chevron says it opens. */}
              <span aria-hidden className="hl-glance-chev pointer-events-none absolute top-4 right-3.5 text-text-muted">
                <Chevron />
              </span>

              <div className="hl-glance-graph relative overflow-hidden" onClick={isOpen ? undefined : () => tap(m.compound.id)}>
                <Sparkline
                  lines={m.graph}
                  nowH={nowH}
                  width={260}
                  height={40}
                  stroke={1.8}
                  className="hl-glance-spark absolute inset-0 h-10 w-full"
                />
                <div className="hl-glance-full" aria-hidden={!isOpen}>
                  {isOpen ? (
                    <HalfLifeGraph
                      lines={m.graph}
                      t0={nowH - graphBack(hl)}
                      t1={nowH + graphAhead(hl)}
                      nowH={nowH}
                      unit={m.line.unit}
                      drawKey={draws}
                      halfAtH={half}
                      doseTicks
                      band
                      keyed
                    />
                  ) : null}
                </div>
              </div>

              <div className="hl-glance-more" aria-hidden={!isOpen}>
                <div>
                  <FigureRows source={m.line.source} figures={m.figures} />
                </div>
              </div>

              {/* The one close arrow: it waits turned and faded while the card
                  is shut and spins in as it opens (`.close-arrow`). */}
              <CloseArrow
                onClick={close}
                label={`Close ${m.compound.name}`}
                shown={isOpen}
                className="absolute top-2.5 right-2.5"
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}
