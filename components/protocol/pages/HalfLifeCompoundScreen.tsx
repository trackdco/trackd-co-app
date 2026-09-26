"use client"

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react"

import { ThumbGroup } from "@/components/feel/SlidingThumb"
import { SolidIcon } from "@/components/feel/SolidIcon"
import { ListBlocks } from "@/components/feel/RouteSkeletons"
import { SkeletonGroup } from "@/components/feel/Skeleton"
import { CurveGuide } from "@/components/halflife/CurveGuide"
import {
  Sparkline,
  graphAhead,
  graphBack,
  levelWord,
  nextDoseWords,
  useHalfLifeModels,
  useMinuteNow,
} from "@/components/halflife/HalfLifeCards"
import { HalfLifeGraph, type GraphLine } from "@/components/halflife/HalfLifeGraph"
import { useCloudHydration } from "@/components/home/useCloudHydration"
import { CaretRight } from "@/components/icons"
import { Fold, SubpageShell } from "@/components/protocol/pages/Subpage"
import { blendFor } from "@/lib/compound-blends"
import { aboutFor } from "@/lib/halflife/about"
import { blendChoices, blendRunBasis, settleChoice, sharedUnit, type BlendChoice } from "@/lib/halflife/blendView"
import { dateKeyOfHours, runLengthDays, type HalfLifeSource } from "@/lib/halflife/compoundCurve"
import {
  clearsAfterH,
  curvePoints,
  doseRuns,
  formatAmount,
  formatClearsIn,
  formatHalfLife,
  formatPeak,
  formatUsual,
  halfGoneAtH,
  nowReading,
  peakCountdown,
  sumFigures,
  type Dose,
  type HalfLifeFigures,
  type NowFigures,
} from "@/lib/halflife/model"
import { getDoseLogsSnapshot, subscribeDoseLogs, type DayLogs } from "@/lib/home/doseLog"
import { getHydrationState, subscribeHydrationState, type HydrationState } from "@/lib/home/hydrationState"
import { getStackSnapshot, subscribeStack, type StackCompound } from "@/lib/home/stack"
import { shortDate } from "@/lib/protocol/cyclePage"
import { CARD_EYEBROW, CHIP_THUMB, PRESS, SEGMENTED_ITEM, SEGMENTED_TRACK } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

const EMPTY_STACK: StackCompound[] = []
const EMPTY_LOGS: DayLogs = {}

/** One line in view: the compound, or one part of a blend. */
interface ViewLine {
  /** Its exact catalogue name: a part's label on the rail, and its About. */
  name: string
  source: HalfLifeSource
  taken: readonly Dose[]
  toCome: readonly Dose[]
  unit: string
  hue: string
  dash?: string
  figures: HalfLifeFigures
}

/** What the page draws: a compound, the picked part of a blend, or the whole
 *  blend (its "All", W5). */
interface Focus {
  /** Every line the graph draws. */
  graph: GraphLine[]
  /** The isolated line, or null (a single compound, or a blend's All). */
  selected: number | null
  /** The lines in view: the compound, the picked part, or every part. */
  lines: ViewLine[]
  /** A blend's All: the figures are its parts together. */
  all: boolean
  /** Under All, the blend's parts with no half-life (KLOW's KPV): named, with
   *  no line and no tab. */
  undrawn: string[]
  /** Whose About shows, by catalogue name, and how it is titled. */
  aboutName: string
  aboutLabel: string
}

/**
 * A compound's half-life page (build-brief-final §3.11). The title carries its
 * curve mark; the "?" beside it opens "Reading the curve" (a drawn example and
 * a plain key, W2). The card leads with "In you now" ("Absorbing" right after
 * a dose, ruling 5) and "Next dose", then the graph (the fill under the line
 * so far and the likely range around it, told apart, W3; past solid, ahead
 * dashed, Now a thin line, dose ticks, the ½ line), then Level, Peaks in and
 * Half-life, and one centred line of what is usual for a dose. "About" says
 * what the compound is (W4). Past runs sit under it; each opens its own graph.
 *
 * A blend (W5): a rail of "All", the whole blend, then each part by its full
 * name. All draws every part's line and reads the parts together, a row each;
 * a part reads as a compound of its own. Past runs follow the choice.
 */
export function HalfLifeCompoundScreen({
  userId,
  compoundId,
  backHref = "/protocol/half-life",
  previewCompounds,
  previewLogs,
}: {
  userId: string
  compoundId: string
  backHref?: string
  previewCompounds?: StackCompound[]
  previewLogs?: DayLogs
}) {
  useCloudHydration(userId)
  const liveStack = useSyncExternalStore(
    subscribeStack,
    () => (userId === "anon" ? EMPTY_STACK : getStackSnapshot(userId, EMPTY_STACK)),
    () => EMPTY_STACK,
  )
  const liveLogs = useSyncExternalStore(subscribeDoseLogs, () => getDoseLogsSnapshot(userId), () => EMPTY_LOGS)
  const hydration = useSyncExternalStore<HydrationState>(
    subscribeHydrationState,
    () => getHydrationState(userId),
    () => "pending",
  )
  const compounds = previewCompounds ?? liveStack
  const logs = previewLogs ?? liveLogs
  const known = previewCompounds !== undefined || compounds.length > 0 || hydration !== "pending"
  const compound = compounds.find((c) => c.id === compoundId) ?? null
  const one = useMemo(() => (compound ? [compound] : []), [compound])
  const now = useMinuteNow()
  const { singles, blends, nowH } = useHalfLifeModels(one, logs, userId, now)
  const [choice, setChoice] = useState<BlendChoice>("all")
  const [guideOpen, setGuideOpen] = useState(false)

  const single = singles[0] ?? null
  const blend = blends[0] ?? null
  const title = compound ? (blend ? (blendFor(compound.name)?.label ?? compound.name) : compound.name) : "Half-life"

  // A blend's parts that draw a line, each with its figures, and the graph's
  // lines: one per part, in the same order, so a part's index is its line.
  const { parts, partGraph, undrawn } = useMemo(() => {
    if (!blend) return { parts: [] as ViewLine[], partGraph: [] as GraphLine[], undrawn: [] as string[] }
    const parts = blend.drawn.flatMap((l, k): ViewLine[] => {
      const figures = blend.figures[l.index]
      const g = blend.graph[k]
      if (!figures || !g) return []
      return [{ name: l.name, source: l.source, taken: l.taken, toCome: l.toCome, unit: l.unit, hue: g.hue, dash: g.dash, figures }]
    })
    const partGraph = parts.map((p): GraphLine => ({ source: p.source, taken: p.taken, toCome: p.toCome, hue: p.hue, dash: p.dash }))
    const undrawn = blend.all.filter((l) => l.source == null).map((l) => l.name)
    return { parts, partGraph, undrawn }
  }, [blend])
  const picked = settleChoice(choice, parts.length)

  const focus: Focus | null = useMemo(() => {
    if (single) {
      const line: ViewLine = {
        name: single.compound.name,
        source: single.line.source,
        taken: single.line.taken,
        toCome: single.line.toCome,
        unit: single.line.unit,
        hue: single.hue,
        figures: single.figures,
      }
      return { graph: single.graph, selected: null, lines: [line], all: false, undrawn: [], aboutName: line.name, aboutLabel: line.name }
    }
    if (!blend || parts.length === 0 || !compound) return null
    const graph = partGraph
    if (parts.length === 1) {
      return { graph, selected: null, lines: parts, all: false, undrawn: [], aboutName: compound.name, aboutLabel: title }
    }
    if (picked === "all") {
      return { graph, selected: null, lines: parts, all: true, undrawn, aboutName: compound.name, aboutLabel: title }
    }
    const p = parts[picked]
    return { graph, selected: picked, lines: [p], all: false, undrawn: [], aboutName: p.name, aboutLabel: p.name }
  }, [single, blend, parts, partGraph, undrawn, picked, compound, title])

  if (!known || !now) {
    return (
      <SubpageShell screen="protocol-half-life-compound" title={title} backHref={backHref} backLabel="Half-life">
        <SkeletonGroup label="Loading the curve" className="space-y-4">
          <ListBlocks cards={1} />
        </SkeletonGroup>
      </SubpageShell>
    )
  }
  if (!compound || !focus) {
    return (
      <SubpageShell screen="protocol-half-life-compound" title={title} backHref={backHref} backLabel="Half-life">
        <p className="px-1 text-sm text-text-muted">No half-life to draw for this compound.</p>
      </SubpageShell>
    )
  }

  // One window for the compound, the same under All and every part (its
  // slowest part's), so a switch isolates a line on the same axes and never
  // shifts the drawing under the reader.
  const slowest = Math.max(...focus.graph.map((l) => l.source.halfLifeH))
  const t0 = nowH - graphBack(slowest)
  const t1 = nowH + graphAhead(slowest)
  const view = focus.all ? blendView(focus) : lineView(focus, nowH)
  const about = aboutFor(focus.aboutName)
  const guideHue = focus.lines.length === 1 ? focus.lines[0].hue : undefined
  const choices = parts.length > 1 ? blendChoices(parts) : []

  return (
    <SubpageShell
      screen="protocol-half-life-compound"
      title={title}
      backHref={backHref}
      backLabel="Half-life"
      mark={<SolidIcon name="halfLife" size={20} hue={`var(--cat-${compound.category})`} />}
      help={{ label: "Reading the curve", onClick: () => setGuideOpen(true) }}
    >
      <section className="animate-home-up inst-card flex flex-col gap-3 p-4">
        {choices.length > 0 ? (
          // All, then each part in full (W5). Long names ("Levothyroxine
          // (T4)") take the room they need; where they cannot all fit the
          // rail scrolls sideways inside itself rather than cut a name. Its
          // 10px above and below hold each choice's 44pt reach (HIT_Y_25),
          // which a scroller would otherwise clip.
          <div className="-mx-1 -my-2.5 overflow-x-auto px-1 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ThumbGroup
              selection={picked}
              thumbClassName={CHIP_THUMB}
              role="group"
              aria-label={`${title} parts`}
              className={cn(SEGMENTED_TRACK, "w-max min-w-full")}
            >
              {choices.map((c) => {
                const on = picked === c.key
                return (
                  <button
                    key={String(c.key)}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setChoice(c.key)}
                    className={cn(SEGMENTED_ITEM, on ? "text-bg-base" : "text-text-muted")}
                  >
                    {c.label}
                  </button>
                )
              })}
            </ThumbGroup>
          </div>
        ) : null}

        <div className="flex items-end justify-between gap-3 px-0.5">
          {view.now ? <InYouNow figures={view.now.figures} unit={view.now.unit} /> : <div />}
          <NextOrClears nowH={nowH} nextDoseAtH={view.nextDoseAtH} clearsInH={view.clearsInH} />
        </div>

        {/* One graph for every choice: a switch fades the other lines back
            and the fill and range over to the picked one, never a redraw. */}
        <HalfLifeGraph
          lines={focus.graph}
          selected={focus.selected}
          t0={t0}
          t1={t1}
          nowH={nowH}
          unit={view.unit}
          drawKey={1}
          band
          halfAtH={view.halfAtH}
          doseTicks
        />

        {/* A switch lands the new rows with a 3px rise (`hl-swap`). */}
        <Rows key={focus.all ? "all" : focus.aboutName} rows={view.rows} className="animate-hl-swap" />

        {view.usual ? (
          <p className="px-2 text-center text-[12px] leading-snug text-balance text-text-muted">
            Usually peaks ~{view.usual.peaksAfter} after a dose and clears ~{view.usual.clearsAfter} after the last.
          </p>
        ) : null}
      </section>

      {about ? <AboutRow key={focus.aboutName} label={focus.aboutLabel} text={about} /> : null}

      <PastRuns key={String(picked)} focus={focus} nowH={nowH} />

      <CurveGuide open={guideOpen} onClose={() => setGuideOpen(false)} hue={guideHue} />
    </SubpageShell>
  )
}

/** A part's line in its row under All: its hue and its dash, as drawn. */
function LineSwatch({ hue, dash }: { hue: string; dash?: string }) {
  return (
    <svg width="14" height="6" viewBox="0 0 14 6" aria-hidden className="shrink-0">
      <path d="M1.5 3h11" stroke={hue} strokeWidth="2" strokeDasharray={dash} strokeLinecap="round" />
    </svg>
  )
}

/**
 * "In you now", or "Absorbing" right after a dose while nothing has reached
 * the blood yet (ruling 5). The word sits in the figure's own line, so the
 * card does not move, and rises in as it lands.
 */
function InYouNow({ figures, unit }: { figures: NowFigures; unit: string }) {
  const now = nowReading(figures)
  return (
    <div>
      <p className="text-[11.5px] text-text-muted">In you now</p>
      <p className="inst-figure font-mono text-[28px] leading-tight font-light text-foreground">
        {now.kind === "absorbing" ? (
          <span className="animate-hl-swap inline-block font-sans text-[20px]">Absorbing</span>
        ) : (
          <>
            {now.text}
            <span className="ml-1 font-sans text-[13px] text-text-muted">{unit}</span>
          </>
        )}
      </p>
    </div>
  )
}

/** "Next dose", or "Clears in" once nothing more is due. */
function NextOrClears({ nowH, nextDoseAtH, clearsInH }: { nowH: number; nextDoseAtH: number | null; clearsInH: number | null }) {
  const stopped = nextDoseAtH == null
  return (
    <div className="text-right">
      <p className="text-[11.5px] text-text-muted">{stopped ? "Clears in" : "Next dose"}</p>
      <p className="font-mono text-[20px] leading-tight font-light text-foreground">
        {stopped ? (clearsInH != null ? formatClearsIn(clearsInH) : "None") : nextDoseWords(nowH, nextDoseAtH)}
      </p>
    </div>
  )
}

function Rows({ rows, className }: { rows: [ReactNode, ReactNode, string][]; className?: string }) {
  return (
    <div className={cn("inst-rows px-3 py-0.5", className)}>
      {rows.map(([label, value, key]) => (
        <div key={key} className="flex items-baseline justify-between gap-3 py-[9px]">
          <span className="flex min-w-0 items-center gap-2 text-[13px] text-text-muted">{label}</span>
          <span className="shrink-0 font-mono text-[13.5px] text-foreground">{value}</span>
        </div>
      ))}
    </div>
  )
}

/** What the card reads for the choice in view. */
interface CardView {
  /** "In you now", or null where amounts do not add (parts in two units). */
  now: { figures: NowFigures; unit: string } | null
  nextDoseAtH: number | null
  clearsInH: number | null
  /** The unit the scrub reads in. */
  unit: string
  halfAtH: number | null
  rows: [ReactNode, ReactNode, string][]
  /** The centred line of what is usual for one dose. */
  usual: { peaksAfter: string; clearsAfter: string } | null
}

/** One compound, or one part of a blend: its own figures, ½ line and rows. */
function lineView(focus: Focus, nowH: number): CardView {
  const line = focus.lines[0]
  const hl = line.source.halfLifeH
  const route = line.source.route
  const all = [...line.taken, ...line.toCome]
  const peakWords = formatPeak(peakCountdown(all, nowH, hl, route))
  const f = line.figures
  return {
    now: { figures: f, unit: line.unit },
    nextDoseAtH: f.nextDoseAtH,
    clearsInH: f.clearsInH,
    unit: line.unit,
    halfAtH: halfGoneAtH(all, nowH, hl, route),
    rows: [
      ["Level", levelWord(f), "level"],
      ...(peakWords ? ([[peakWords.label, peakWords.value, "peak"]] as [ReactNode, ReactNode, string][]) : []),
      [
        "Half-life",
        <>
          {formatHalfLife(hl)}
          {line.source.estimated ? <span className="ml-1 font-sans text-[11.5px] text-text-muted">est.</span> : null}
        </>,
        "half-life",
      ],
    ],
    usual: formatUsual(hl, route),
  }
}

/**
 * A blend's All (W5): every part's line, what is in you from the parts
 * together (they share the blend's unit), and a row per part with its own
 * amount. Level, peak, the ½ line and the half-life belong to one compound:
 * its tab has them.
 */
function blendView(focus: Focus): CardView {
  const sum = sumFigures(focus.lines.map((l) => l.figures))
  const unit = sharedUnit(focus.lines.map((l) => l.unit))
  return {
    now: unit ? { figures: sum, unit } : null,
    nextDoseAtH: sum.nextDoseAtH,
    clearsInH: sum.clearsInH,
    unit: unit ?? "",
    halfAtH: null,
    rows: [
      ...focus.lines.map((l): [ReactNode, ReactNode, string] => {
        const now = nowReading(l.figures)
        return [
          <>
            <LineSwatch hue={l.hue} dash={l.dash} />
            <span className="truncate">{l.name}</span>
          </>,
          now.kind === "absorbing" ? <span className="font-sans">Absorbing</span> : `${now.text} ${l.unit}`,
          l.name,
        ]
      }),
      // The whole blend, so its parts with no half-life are named too.
      ...focus.undrawn.map((name): [ReactNode, ReactNode, string] => {
        const label = (
          <>
            <span aria-hidden className="w-3.5 shrink-0" />
            <span className="truncate">{name}</span>
          </>
        )
        const value = <span className="font-sans text-[12.5px] text-text-muted">No half-life data</span>
        return [label, value, name]
      }),
    ],
    usual: null,
  }
}

/**
 * "About <compound>" (Adrian's walk, W4): what the compound is, folded under
 * its name like a Past run (the approved mock's About row, `r6/proto8.js`).
 * Facts only (`lib/halflife/about`). A blend's part shows its own.
 */
function AboutRow({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="animate-home-up inst-card px-4" style={{ animationDelay: "40ms" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(PRESS.row, "flex w-full items-center gap-3 py-3 text-left")}
      >
        <span className="min-w-0 flex-1 truncate text-[13.5px] text-foreground">About {label}</span>
        <CaretRight className="cy-chev h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      </button>
      <Fold open={open} className="pb-3.5">
        <p className="text-[13.5px] leading-snug text-text-muted">{text}</p>
      </Fold>
    </div>
  )
}

/** "31 Aug" for an instant in hours. */
const dayOf = (h: number) => shortDate(dateKeyOfHours(h))

/**
 * Past runs (build-brief-final §3.11): each unbroken stretch of doses, newest
 * first, "This run" while it is going. A tap opens its own graph, from its
 * first dose until it cleared, with its length, doses and peak. It follows the
 * rail (W5): a part's own runs, or under All the blend's, every part's line in
 * its graph and each run drawn until the slowest part has cleared.
 */
function PastRuns({ focus, nowH }: { focus: Focus; nowH: number }) {
  const [openAt, setOpenAt] = useState<number | null>(null)
  const basis = useMemo(() => {
    if (focus.all) {
      return blendRunBasis(
        focus.lines.map((l) => ({ name: l.name, halfLifeH: l.source.halfLifeH, route: l.source.route, taken: l.taken })),
      )
    }
    const l = focus.lines[0]
    return { doses: l.taken, halfLifeH: l.source.halfLifeH, clearsAfterH: clearsAfterH(l.source.halfLifeH, l.source.route) }
  }, [focus])
  const runs = useMemo(() => (basis ? doseRuns(basis.doses, nowH, basis.halfLifeH).reverse() : []), [basis, nowH])
  if (!basis || runs.length === 0) return null
  const unit = sharedUnit(focus.lines.map((l) => l.unit)) ?? ""
  return (
    <div className="animate-home-up" style={{ animationDelay: "80ms" }}>
      <p className={cn(CARD_EYEBROW, "mb-2 px-1")}>Past runs</p>
      <div className="inst-card px-4 py-0.5">
        {runs.map((r, i) => {
          const open = openAt === r.fromH
          const r0 = r.fromH - Math.max(12, (r.toH - r.fromH) * 0.04)
          const r1 = r.current ? nowH : Math.min(nowH, r.toH + basis.clearsAfterH)
          const lines: GraphLine[] = focus.lines.map((l) => ({
            source: l.source,
            taken: l.taken.filter((d) => d.atH >= r.fromH && d.atH <= r.toH),
            toCome: [],
            hue: l.hue,
            dash: l.dash,
          }))
          const only = focus.all ? null : lines[0]
          const peak = only
            ? Math.max(0, ...curvePoints(only.taken, r0, r1, 200, only.source.halfLifeH, only.source.route).map((p) => p[1]))
            : null
          const days = runLengthDays(r.fromH, r.toH)
          return (
            <div key={r.fromH} className={cn(i > 0 && "hairline-t border-border-default")}>
              <button
                type="button"
                onClick={() => setOpenAt(open ? null : r.fromH)}
                aria-expanded={open}
                className={cn(PRESS.row, "flex w-full items-center gap-3 py-3 text-left")}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[13.5px] text-foreground">{r.current ? "This run" : "Ended"}</span>
                  <span className="font-mono text-[11px] text-text-muted">
                    {r.current ? `From ${dayOf(r.fromH)}` : `${dayOf(r.fromH)} to ${dayOf(r.toH)}`}
                  </span>
                </span>
                <Sparkline lines={lines} nowH={r1} width={80} height={22} />
                <CaretRight className="cy-chev h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              </button>
              <Fold open={open} className="space-y-2.5 pb-3.5">
                <HalfLifeGraph
                  lines={lines}
                  t0={r0}
                  t1={r1}
                  nowH={r1}
                  unit={unit}
                  drawKey={open ? 1 : null}
                  doseTicks
                  showNow={false}
                />
                <Rows
                  rows={[
                    ["Length", days === 1 ? "1 day" : `${days} days`, "length"],
                    ["Doses", String(r.count), "doses"],
                    ...(peak != null ? ([["Peak", `${formatAmount(peak)} ${unit}`, "peak"]] as [ReactNode, ReactNode, string][]) : []),
                  ]}
                />
              </Fold>
            </div>
          )
        })}
      </div>
    </div>
  )
}
