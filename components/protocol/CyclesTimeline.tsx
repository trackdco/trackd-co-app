"use client"

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"

import { ThumbGroup } from "@/components/feel/SlidingThumb"
import { SolidIcon } from "@/components/feel/SolidIcon"
import { Fold } from "@/components/protocol/pages/Subpage"
import { PRESS_DELAY_MS } from "@/lib/feel/press"
import { curveLines, hoursAt, hoursOf } from "@/lib/halflife/compoundCurve"
import { amountAt } from "@/lib/halflife/model"
import type { DayLogs } from "@/lib/home/doseLog"
import type { StackCompound } from "@/lib/home/stack"
import { cyclePatternText } from "@/lib/protocol/cyclePage"
import type { CycleRule } from "@/lib/protocol/cycleRule"
import {
  HOLD_TO_SCRUB_MS,
  LANES_MAX,
  OTHER_GROUP,
  PAUSED_GROUP,
  SCRUB_IDLE,
  SMOOTH_AFTER_DAYS,
  TIMELINE_ZOOMS,
  cycleTypeGroups,
  earliestOffset,
  hoursIntoDay,
  isScrubRelease,
  nowWords,
  offsetKey,
  onDaysIn,
  onRuns,
  pausedToday,
  rangeEndLabel,
  scrubAt,
  scrubDate,
  scrubStep,
  scrubWords,
  timelineRange,
  turnRow,
  type CycleTypeGroup,
  type ScrubGesture,
  type ScrubInput,
  type TimelineZoom,
} from "@/lib/protocol/cycleTimeline"
import { CATEGORY_GLYPH } from "@/lib/solidGlyphs"
import { CARD_EYEBROW, SEGMENTED_ITEM, SEGMENTED_TRACK } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

export interface TimelineCycle {
  compound: StackCompound
  rule: CycleRule
  /** The cycle's colour, as a CSS value. */
  colour: string
  /** Is its compound paused today? Left out, it is read from the compound's
   *  pauses by the same test the list uses (`pausedToday`). */
  paused?: boolean
}

/** A cycle and its place in `cycles` (its row of `days`). */
type Entry = { c: TimelineCycle; i: number }

/** Text the Today line and the scrub line pass BEHIND: the card's own surface
 *  under the words, so a line never strikes through a name. */
const KNOCK = "relative z-[1] bg-bg-surface"

/** The Today line and its label (W29): they fade in and slide right into
 *  place as Cycles opens (the schedule's own 26px slide, on the settle curve),
 *  and glide to their new place when the range changes. Two properties, so the
 *  entrance (`transform`) and the place (`translate`) never fight. Reduced
 *  motion: a short fade in, and the range change snaps. */
const TODAY_MOVE =
  "[transition:translate_420ms_var(--hl-ease),opacity_150ms_ease-out] " +
  "animate-[schedule-back-far_600ms_var(--hl-settle)_280ms_backwards] " +
  "motion-reduce:[transition:opacity_150ms_ease-out] motion-reduce:animate-[toast-fade_200ms_ease-out_200ms_backwards]"

/** A held lane grows a little while it scrubs (W48) and shrinks back on
 *  release, along the same curve. A finger resting on it starts the growth
 *  over the hold, so the scrub is hinted before it lands and a tap still dips
 *  under the finger. Reduced motion: it stays as drawn. */
const GROW = "transition-[scale] duration-300 ease-[var(--hl-ease)] motion-reduce:transition-none"
/** How far along a lane is: resting under a finger, or scrubbing. */
type Growth = "press" | "scrub" | null
/** The bar's and the curve's growth for each. The press eases in over the
 *  rest of the hold, so it runs straight on into the scrub's. */
const GROWTH_BAR: Record<"press" | "scrub", string> = {
  press: "scale-y-115 duration-[240ms] ease-out motion-reduce:scale-y-100",
  scrub: "scale-y-150 motion-reduce:scale-y-100",
}
const GROWTH_CURVE: Record<"press" | "scrub", string> = {
  press: "scale-y-105 duration-[240ms] ease-out motion-reduce:scale-y-100",
  scrub: "scale-y-120 motion-reduce:scale-y-100",
}

/**
 * THE TIMELINE (build-brief-final §3.10; renamed from "Live timeline"). Cycles
 * only: a lane per cycle with its curve under it, over 1M / 3M / 1Y / All, a
 * cell a day up to 60 days and smooth bars past that, and the Today line. A
 * lane opens onto where the cycle is, when it next turns, and its pattern.
 *
 * The lanes sit under their type's title (W31), in the list card's own groups
 * (`cycleTypeGroups`, cold review D6): the same types in the same order, and a
 * compound paused today under Paused, last, never in its type. Each lane keeps
 * its cycle's colour. Past four cycles each type is one bar (darker where more
 * of its cycles are on that day) that opens onto a thin bar per cycle, so 12 or
 * 50 cycles still fit on a phone. The list above carries the counts; the
 * Timeline names the types only.
 *
 * Press and hold a lane to scrub (W35, W48): it grows a little, a line follows
 * the finger, and the row above reads how far that is from now ("In 3 days",
 * "In 5 hours", "4 days ago") and its date. A plain tap still opens the lane.
 */
export function CyclesTimeline({
  cycles,
  logs,
  todayKey,
}: {
  cycles: TimelineCycle[]
  logs: DayLogs
  todayKey: string
}) {
  const [zoom, setZoom] = useState<TimelineZoom>("3m")
  const [openLane, setOpenLane] = useState<string | null>(null)
  const earliest = useMemo(() => earliestOffset(cycles.map((c) => c.rule), todayKey), [cycles, todayKey])
  const [from, to] = timelineRange(zoom, earliest)
  const span = to - from
  const smooth = span > SMOOTH_AFTER_DAYS
  const days = useMemo(
    () => cycles.map((c) => onDaysIn(c.rule, c.compound.pauses, todayKey, [from, to])),
    [cycles, todayKey, from, to],
  )
  const todayPct = ((0 - from) / span) * 100
  const grouped = cycles.length > LANES_MAX

  const groups = useMemo(
    () =>
      cycleTypeGroups<Entry>(
        cycles.map((c, i) => ({ c, i })),
        (e) => e.c.compound.category,
        (e) => e.c.paused ?? pausedToday(e.c.compound.pauses, todayKey),
      ),
    [cycles, todayKey],
  )

  const { held, pressed, lanesRef, lineRef, tipRef, wordsRef, dateRef, justScrubbed, handlers } = useLaneScrub(
    [from, to],
    todayKey,
  )
  const toggle = (id: string) => {
    if (justScrubbed()) return
    setOpenLane((o) => (o === id ? null : id))
  }
  /** The lane under the finger, and the ones that step back while it scrubs. */
  const laneState = (id: string) => ({
    grow: (held === id ? "scrub" : pressed === id ? "press" : null) as Growth,
    dim: held !== null && held !== id,
  })

  return (
    <section className="animate-home-up inst-card px-4 pt-3.5 pb-4" style={{ animationDelay: "60ms" }}>
      <div className="flex items-center justify-between gap-3">
        <p className={CARD_EYEBROW}>Timeline</p>
        <ThumbGroup
          selection={zoom}
          thumbClassName="inst-thumb"
          role="group"
          aria-label="Range"
          className={cn(SEGMENTED_TRACK, "gap-0.5")}
        >
          {TIMELINE_ZOOMS.map((z) => (
            <button
              key={z.key}
              type="button"
              aria-pressed={zoom === z.key}
              onClick={() => setZoom(z.key)}
              className={cn(
                SEGMENTED_ITEM,
                // 44 wide as well as 44 tall (cold review D8): the preset
                // reaches 44 above and below; side by side, a chip's width is
                // its reach.
                "min-w-11 font-mono",
                zoom === z.key ? "text-bg-base" : "text-text-muted",
              )}
            >
              {z.label}
            </button>
          ))}
        </ThumbGroup>
      </div>

      <div
        className="relative mt-3 mb-2 h-3 font-mono text-[10px] text-text-muted"
        style={{ containerType: "inline-size" }}
      >
        <span className={cn("absolute left-0 transition-opacity duration-150", held && "opacity-0")}>
          {rangeEndLabel(todayKey, from, span)}
        </span>
        <span
          className={cn(TODAY_MOVE, "absolute top-0 left-0", held && "opacity-0")}
          style={{ translate: `${todayPct}cqw 0` }}
        >
          <span className="block -translate-x-1/2 text-foreground">Today</span>
        </span>
        <span className={cn("absolute right-0 transition-opacity duration-150", held && "opacity-0")}>
          {rangeEndLabel(todayKey, to - 1, span)}
        </span>
        {/* The scrub's reading: how far from now, then the date. Filled while
            the finger moves, without a render (`useLaneScrub`). */}
        <span
          ref={tipRef}
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-[5px] left-0 z-10 flex items-baseline rounded-lg bg-bg-surface-raised px-2 py-1 whitespace-nowrap shadow-[0_6px_16px_-8px_rgb(0_0_0)] transition-opacity duration-150",
            held ? "opacity-100" : "opacity-0",
          )}
        >
          <span ref={wordsRef} className="font-sans text-[11px] text-foreground" />
          <span ref={dateRef} className="ml-1.5 font-mono text-[10.5px] text-text-muted" />
        </span>
      </div>

      <div
        ref={lanesRef}
        className={cn(
          "relative flex touch-pan-y flex-col select-none [-webkit-touch-callout:none]",
          grouped ? "gap-0" : "gap-4",
        )}
        style={{ containerType: "inline-size" }}
        {...handlers}
      >
        {grouped
          ? groups.map((g) => {
              const id = `g:${g.key}`
              const open = openLane === id
              const idx = g.items.map((e) => e.i)
              const counts = Array.from({ length: span }, (_, d) => idx.filter((i) => days[i][d]).length)
              const head = laneState(id)
              return (
                <div key={g.key}>
                  <button
                    type="button"
                    data-lane={id}
                    onClick={() => toggle(id)}
                    aria-expanded={open}
                    className={cn(
                      "block w-full py-2 text-left transition-opacity duration-200",
                      head.dim && "opacity-50",
                    )}
                  >
                    <TypeTitle group={g} className="mb-1.5" />
                    <Bar
                      on={counts.map((n) => n > 0)}
                      weight={counts.map((n) => n / idx.length)}
                      hue={groupHue(g)}
                      smooth={smooth}
                      height={8}
                      grow={head.grow}
                    />
                  </button>
                  <Fold open={open}>
                    {/* Full width, the name above: every bar lines up with Today. */}
                    <div className="flex flex-col gap-2 pt-0.5 pb-2">
                      {g.items.map(({ c, i }) => {
                        const sub = laneState(`c:${c.compound.id}`)
                        return (
                          <div
                            key={c.compound.id}
                            data-lane={`c:${c.compound.id}`}
                            className={cn("transition-opacity duration-200", sub.dim && "opacity-50")}
                          >
                            <span className={cn(KNOCK, "mb-0.5 block w-fit max-w-full truncate pr-1 text-[11px] text-text-muted")}>
                              {c.compound.name}
                            </span>
                            <Bar on={days[i]} hue={c.colour} smooth={smooth} height={4} grow={sub.grow} />
                          </div>
                        )
                      })}
                    </div>
                  </Fold>
                </div>
              )
            })
          : groups.map((g) => (
              <div key={g.key} className="flex flex-col gap-3">
                <TypeTitle group={g} className="-mb-1" />
                {g.items.map(({ c, i }) => {
                  const id = `l:${c.compound.id}`
                  const open = openLane === id
                  const lane = laneState(id)
                  const now = nowWords(c.rule, c.compound.pauses, todayKey)
                  const turn = turnRow(c.rule, c.compound.pauses, todayKey)
                  const rows: [string, string][] = [
                    ["Now", now],
                    ...(turn ? [[turn.label, turn.date] as [string, string]] : []),
                    ["Pattern", cyclePatternText(c.rule.pattern)],
                  ]
                  return (
                    <div key={c.compound.id}>
                      <button
                        type="button"
                        data-lane={id}
                        onClick={() => toggle(id)}
                        aria-expanded={open}
                        className={cn(
                          "block w-full text-left transition-opacity duration-200",
                          lane.dim && "opacity-50",
                        )}
                      >
                        <span className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
                          <span className={cn(KNOCK, "truncate pr-1 text-foreground")}>{c.compound.name}</span>
                          {/* Open, the rows below say it (the approved mock). */}
                          <span
                            className={cn(
                              KNOCK,
                              "shrink-0 pl-1 font-mono text-[11px] text-text-muted transition-opacity duration-200",
                              open && "opacity-0",
                            )}
                          >
                            {now}
                          </span>
                        </span>
                        <Bar on={days[i]} hue={c.colour} smooth={smooth} height={7} grow={lane.grow} />
                        <LaneCurve
                          compound={c.compound}
                          logs={logs}
                          todayKey={todayKey}
                          from={from}
                          to={to}
                          hue={c.colour}
                          tall={open}
                          grow={lane.grow}
                        />
                      </button>
                      {/* The card's surface under the fold from its first pixel, so
                          the Today line never shows through the rows while they
                          fade in (W33): it stops at the lane. */}
                      <div className="relative z-[1] bg-bg-surface">
                        <Fold open={open}>
                          <div className="inst-rows mt-2.5">
                            {rows.map(([label, value]) => (
                              <div key={label} className="flex items-center justify-between gap-3 px-3 py-2 text-[12px]">
                                <span className="text-text-muted">{label}</span>
                                <span className="font-mono text-[12px] text-foreground">{value}</span>
                              </div>
                            ))}
                          </div>
                        </Fold>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
        <i
          aria-hidden
          className={cn(TODAY_MOVE, "pointer-events-none absolute -top-1 bottom-0 left-0 w-[1.5px] rounded-[1px] bg-foreground")}
          style={{ translate: `calc(${todayPct}cqw - 0.75px) 0` }}
        />
        {/* The scrub line: placed by `useLaneScrub` as the finger moves. */}
        <i
          ref={lineRef}
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-1 bottom-0 left-0 w-px bg-foreground transition-opacity duration-150",
            held ? "opacity-35" : "opacity-0",
          )}
        />
      </div>
    </section>
  )
}

/** A type's title over its lanes (W31): its mark and its name, as the Half-life
 *  list titles its types. Paused takes the list's pause mark. */
function TypeTitle({ group, className }: { group: CycleTypeGroup<Entry>; className?: string }) {
  return (
    <span className={cn(CARD_EYEBROW, KNOCK, "flex w-fit items-center gap-1.5 pr-1.5", className)}>
      {group.key === PAUSED_GROUP ? (
        <SolidIcon name="pause" size={12} tone="off" />
      ) : group.key === OTHER_GROUP || !group.category ? (
        <SolidIcon name="all" size={12} tone="off" />
      ) : (
        <SolidIcon name={CATEGORY_GLYPH[group.category] ?? "catPeptide"} size={12} hue={`var(--cat-${group.category})`} />
      )}
      {group.label}
    </span>
  )
}

/** A grouped type's bar colour: its type's, or muted for Paused and Other. */
function groupHue(group: CycleTypeGroup<Entry>): string {
  return group.category ? `var(--cat-${group.category})` : "var(--text-muted)"
}

/**
 * PRESS, HOLD AND SCRUB (W35, W48). A finger that rests on a lane for
 * `HOLD_TO_SCRUB_MS` without moving starts a scrub: that lane grows, the others
 * step back, a line follows the finger and the row above the lanes reads the
 * moment under it. Moving first is a scroll (the page keeps it: `pan-y`); a
 * quick release is a tap, which opens the lane. Once scrubbing, the page does
 * not scroll under the finger, and the click that ends it opens nothing. The
 * rules are `scrubStep` (pure, tested); this hook only carries them out.
 *
 * The finger's place never goes through React: the line and the reading are
 * written once a frame, so 50 lanes do not re-render on every move. React only
 * hears when a scrub starts and ends.
 */
function useLaneScrub(range: [number, number], todayKey: string) {
  const lanesRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const wordsRef = useRef<HTMLSpanElement>(null)
  const dateRef = useRef<HTMLSpanElement>(null)
  const [held, setHeld] = useState<string | null>(null)
  const [pressed, setPressed] = useState<string | null>(null)
  const gesture = useRef<ScrubGesture>(SCRUB_IDLE)
  const timer = useRef(0)
  const pressTimer = useRef(0)
  const frame = useRef(0)

  const draw = (clientX: number) => {
    const box = lanesRef.current?.getBoundingClientRect()
    if (!box || box.width <= 0) return
    const frac = Math.min(1, Math.max(0, (clientX - box.left) / box.width))
    const at = scrubAt(frac, range)
    const x = frac * box.width
    if (lineRef.current) lineRef.current.style.translate = `${x.toFixed(1)}px 0`
    if (wordsRef.current) wordsRef.current.textContent = scrubWords(at.hours, hoursIntoDay(new Date()), at.day)
    if (dateRef.current) dateRef.current.textContent = scrubDate(todayKey, at.day)
    const tip = tipRef.current
    if (tip) {
      const w = tip.offsetWidth
      const left = Math.min(Math.max(0, x - w / 2), Math.max(0, box.width - w))
      tip.style.translate = `${left.toFixed(1)}px 0`
    }
  }

  /** Draw where the finger is, once a frame. */
  const place = () => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const g = gesture.current
      if (g.phase === "scrubbing") draw(g.x)
    })
  }

  const step = (input: ScrubInput) => {
    const prev = gesture.current
    const next = scrubStep(prev, input)
    if (next === prev) return
    gesture.current = next
    if (next.phase === "pressing" && prev.phase === "idle") {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => step({ type: "hold" }), HOLD_TO_SCRUB_MS)
      // Rows wait this long before they press, so a scroll that starts on a
      // lane does not flash it (lib/feel/press).
      window.clearTimeout(pressTimer.current)
      pressTimer.current = window.setTimeout(() => setPressed(next.lane), PRESS_DELAY_MS)
    } else if (next.phase === "scrubbing") {
      if (prev.phase === "pressing") {
        window.clearTimeout(pressTimer.current)
        setPressed(null)
        // Mouse moves outside the lanes keep reaching them (a touch is
        // captured already, by what it landed on).
        try {
          lanesRef.current?.setPointerCapture(next.pointerId)
        } catch {
          // The pointer has gone: its release ends the scrub.
        }
        setHeld(next.lane)
      }
      place()
    } else if (next.phase === "idle") {
      window.clearTimeout(timer.current)
      window.clearTimeout(pressTimer.current)
      setPressed(null)
      if (prev.phase === "scrubbing") setHeld(null)
    }
  }

  const pointer = (e: ReactPointerEvent<HTMLDivElement>) => ({ pointerId: e.pointerId, x: e.clientX, y: e.clientY })

  // Once scrubbing, the finger moves the line, not the page. Non-passive, so
  // Safari lets it stop the scroll; before the hold it lets everything by.
  useEffect(() => {
    const el = lanesRef.current
    if (!el) return
    const stop = (e: TouchEvent) => {
      if (gesture.current.phase === "scrubbing") e.preventDefault()
    }
    el.addEventListener("touchmove", stop, { passive: false })
    return () => el.removeEventListener("touchmove", stop)
  }, [])

  // Leaving mid-hold: no timer or frame fires into an unmounted page.
  useEffect(() => {
    const t = timer
    const pt = pressTimer
    const f = frame
    return () => {
      window.clearTimeout(t.current)
      window.clearTimeout(pt.current)
      cancelAnimationFrame(f.current)
    }
  }, [])

  return {
    held,
    /** The lane a finger rests on, before the hold lands. */
    pressed,
    lanesRef,
    lineRef,
    tipRef,
    wordsRef,
    dateRef,
    /** True for the click a scrub's release makes: it is not a tap. */
    justScrubbed: () => isScrubRelease(gesture.current, performance.now()),
    handlers: {
      onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
        const lane = (e.target as Element).closest<HTMLElement>("[data-lane]")
        step({
          type: "down",
          lane: lane && e.currentTarget.contains(lane) ? (lane.dataset.lane ?? null) : null,
          primary: e.pointerType !== "mouse" || e.button === 0,
          ...pointer(e),
        })
      },
      onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => step({ type: "move", ...pointer(e) }),
      onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => step({ type: "end", pointerId: e.pointerId, at: performance.now() }),
      onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) =>
        step({ type: "end", pointerId: e.pointerId, at: performance.now() }),
      onLostPointerCapture: (e: ReactPointerEvent<HTMLDivElement>) =>
        step({ type: "lost", pointerId: e.pointerId, own: e.target === e.currentTarget, at: performance.now() }),
      onPointerLeave: (e: ReactPointerEvent<HTMLDivElement>) =>
        step({ type: "leave", pointerId: e.pointerId, at: performance.now() }),
      onContextMenu: (e: ReactMouseEvent<HTMLDivElement>) => {
        if (gesture.current.phase !== "idle") e.preventDefault()
      },
    },
  }
}

/** One lane's bar: a cell a day, or smooth runs on a long range. `weight`
 *  (0..1) deepens a grouped cell by how many of its cycles are on. `grow`: the
 *  lane is held for a scrub (W48). */
function Bar({
  on,
  weight,
  hue,
  smooth,
  height,
  grow = null,
}: {
  on: boolean[]
  weight?: number[]
  hue: string
  smooth: boolean
  height: number
  grow?: Growth
}) {
  const style = { "--hue": hue, height } as CSSProperties
  const growth = cn(GROW, grow && GROWTH_BAR[grow])
  if (smooth) {
    const n = on.length
    return (
      <span aria-hidden className={cn("cy-track block", growth)} style={style}>
        {onRuns(on).map(([a, b]) => (
          <i key={a} style={{ left: `${(a / n) * 100}%`, width: `${Math.max(0.6, ((b - a) / n) * 100)}%` }} />
        ))}
      </span>
    )
  }
  return (
    <span aria-hidden className={cn("cy-cells", growth)} style={{ ...style, gap: on.length > 40 ? 0 : 1 }}>
      {on.map((v, d) => (
        <i
          key={d}
          data-on={v ? "true" : "false"}
          style={v && weight ? { opacity: 0.35 + 0.65 * (weight[d] ?? 1) } : undefined}
        />
      ))}
    </span>
  )
}

/** The compound's level across the range, under its lane: taken doses solid,
 *  the ones to come dashed. None for a compound with no half-life.
 *
 *  Each point is the AVERAGE level over its slice of the range, not the level
 *  at an instant: at a month or more, a daily peptide's every spike would draw
 *  a comb. Averaged, a compound that clears between doses reads as the steady
 *  level it keeps, and a weekly one keeps its rise and fall. */
function LaneCurve({
  compound,
  logs,
  todayKey,
  from,
  to,
  hue,
  tall,
  grow = null,
}: {
  compound: StackCompound
  logs: DayLogs
  todayKey: string
  from: number
  to: number
  hue: string
  tall: boolean
  /** The lane is pressed or held for a scrub: the curve grows a little, downwards. */
  grow?: Growth
}) {
  const gid = useId().replace(/:/g, "")
  const path = useMemo(() => {
    const t0 = hoursAt(offsetKey(todayKey, from), "00:00")
    const t1 = hoursAt(offsetKey(todayKey, to), "00:00")
    const now = new Date()
    const line = curveLines(compound, logs, now, t1).find((l) => l.source)
    if (!line?.source) return null
    const doses = [...line.taken, ...line.toCome]
    if (doses.length === 0) return null
    // A slice is at least a day, so a daily dose averages to its level.
    const B = Math.min(150, to - from)
    const step = (t1 - t0) / B
    const pts: [number, number][] = []
    for (let i = 0; i <= B; i++) {
      const t = t0 + step * i
      let sum = 0
      for (let k = 0; k < 8; k++) sum += amountAt(doses, t - step / 2 + (step * k) / 7, line.source.halfLifeH, line.source.route)
      pts.push([t, sum / 8])
    }
    const max = Math.max(...pts.map((p) => p[1]))
    if (!(max > 0)) return null
    const W = 300
    const H = 100
    const X = (t: number) => ((t - t0) / (t1 - t0)) * W
    const Y = (v: number) => H - (v / (max * 1.12)) * H
    const nowH = hoursOf(now)
    const past = pts.filter((p) => p[0] <= nowH)
    const ahead = pts.filter((p) => p[0] >= nowH)
    const d = (ps: typeof pts) => (ps.length ? "M" + ps.map((p) => `${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join("L") : "")
    const area = past.length ? `${d(past)}L${X(past[past.length - 1][0]).toFixed(1)} ${H}L${X(past[0][0]).toFixed(1)} ${H}Z` : ""
    return { past: d(past), ahead: d(ahead), area }
  }, [compound, logs, todayKey, from, to])
  if (!path) return null
  return (
    <svg
      viewBox="0 0 300 100"
      preserveAspectRatio="none"
      aria-hidden
      className={cn(
        "mt-1 block w-full origin-top transition-[height,scale] duration-300 motion-reduce:transition-none",
        grow && GROWTH_CURVE[grow],
      )}
      style={{ height: tall ? 44 : 24 }}
    >
      <defs>
        <linearGradient id={`lc${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={hue} stopOpacity="0.32" />
          <stop offset="1" stopColor={hue} stopOpacity="0" />
        </linearGradient>
      </defs>
      {path.area ? <path d={path.area} fill={`url(#lc${gid})`} /> : null}
      <path d={path.past} fill="none" stroke={hue} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <path
        d={path.ahead}
        fill="none"
        stroke={hue}
        strokeWidth={1.4}
        strokeDasharray="3 3"
        opacity={0.85}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
