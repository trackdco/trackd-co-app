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
import { dateKeyOfHours, type HalfLifeSource } from "@/lib/halflife/compoundCurve"
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
  peakCountdown,
  type Dose,
  type HalfLifeFigures,
} from "@/lib/halflife/model"
import { getDoseLogsSnapshot, subscribeDoseLogs, type DayLogs } from "@/lib/home/doseLog"
import { getHydrationState, subscribeHydrationState, type HydrationState } from "@/lib/home/hydrationState"
import { getStackSnapshot, subscribeStack, type StackCompound } from "@/lib/home/stack"
import { shortDate } from "@/lib/protocol/cyclePage"
import { CARD_EYEBROW, PRESS } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

const EMPTY_STACK: StackCompound[] = []
const EMPTY_LOGS: DayLogs = {}

/** What the page draws for one line: a compound, or the picked part of a blend. */
interface Focus {
  graph: GraphLine[]
  selected: number | null
  source: HalfLifeSource
  taken: readonly Dose[]
  toCome: readonly Dose[]
  unit: string
  hue: string
  figures: HalfLifeFigures
}

/**
 * A compound's half-life page (build-brief-final §3.11). The title carries its
 * curve mark; the "?" beside it opens "Reading the curve". The card leads with
 * "In you now" and "Next dose", then the graph (the likely range shaded in
 * place of the fill, past solid, ahead dashed, Now a thin line, dose ticks, the
 * ½ line), then Level, Peaks in and Half-life, and one centred line of what is
 * usual for a dose. Past runs sit under it; each opens its own graph.
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
  const [part, setPart] = useState(0)
  const [guideOpen, setGuideOpen] = useState(false)

  const single = singles[0] ?? null
  const blend = blends[0] ?? null
  const focus: Focus | null = useMemo(() => {
    if (single) {
      return {
        graph: single.graph,
        selected: null,
        source: single.line.source,
        taken: single.line.taken,
        toCome: single.line.toCome,
        unit: single.line.unit,
        hue: single.hue,
        figures: single.figures,
      }
    }
    if (blend) {
      const k = Math.min(part, blend.drawn.length - 1)
      const line = blend.drawn[k]
      const figures = blend.figures[line.index]
      if (!figures) return null
      return {
        graph: blend.graph,
        selected: blend.drawn.length > 1 ? k : null,
        source: line.source,
        taken: line.taken,
        toCome: line.toCome,
        unit: line.unit,
        hue: blend.graph[k]?.hue ?? blend.hue,
        figures,
      }
    }
    return null
  }, [single, blend, part])

  const title = compound ? (blend ? (blendFor(compound.name)?.label ?? compound.name) : compound.name) : "Half-life"

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

  const hl = focus.source.halfLifeH
  const route = focus.source.route
  const t0 = nowH - graphBack(hl)
  const t1 = nowH + graphAhead(hl)
  const all = [...focus.taken, ...focus.toCome]
  const halfAtH = halfGoneAtH(all, nowH, hl, route)
  const peak = peakCountdown(all, nowH, hl, route)
  const peakWords = formatPeak(peak)
  const usual = formatUsual(hl, route)
  const f = focus.figures
  const stopped = f.nextDoseInH == null

  const rows: [string, ReactNode][] = [
    ["Level", levelWord(f)],
    ...(peakWords ? ([[peakWords.label, peakWords.value]] as [string, ReactNode][]) : []),
    [
      "Half-life",
      <>
        {formatHalfLife(hl)}
        {focus.source.estimated ? <span className="ml-1 font-sans text-[11.5px] text-text-muted">est.</span> : null}
      </>,
    ],
  ]

  return (
    <SubpageShell
      screen="protocol-half-life-compound"
      title={title}
      backHref={backHref}
      backLabel="Half-life"
      mark={<SolidIcon name="halfLife" size={20} hue={`var(--cat-${compound.category})`} />}
      help={{ label: "Reading the curve", onClick: () => setGuideOpen(true) }}
    >
      <section className="animate-home-up inst-card space-y-3 p-4">
        {blend && blend.drawn.length > 1 ? (
          <ThumbGroup
            selection={part}
            thumbClassName="inst-thumb"
            role="group"
            aria-label={`${title} parts`}
            className="flex inst-rail p-[3px]"
          >
            {blend.drawn.map((l, k) => (
              <button
                key={l.name}
                type="button"
                aria-pressed={part === k}
                onClick={() => setPart(k)}
                className={cn(
                  PRESS.pill,
                  "flex-1 rounded-sm px-1 py-1.5 text-[11.5px] transition-colors duration-300",
                  part === k ? "text-bg-base" : "text-text-muted",
                )}
              >
                {l.label}
              </button>
            ))}
          </ThumbGroup>
        ) : null}

        <div className="flex items-end justify-between gap-3 px-0.5">
          <div>
            <p className="text-[11.5px] text-text-muted">In you now</p>
            <p className="inst-figure font-mono text-[28px] leading-tight font-light text-foreground">
              {formatAmount(f.circulating)}
              <span className="ml-1 font-sans text-[13px] text-text-muted">{focus.unit}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11.5px] text-text-muted">{stopped ? "Clears in" : "Next dose"}</p>
            <p className="font-mono text-[20px] leading-tight font-light text-foreground">
              {stopped ? (f.clearsInH != null ? formatClearsIn(f.clearsInH) : "None") : nextDoseWords(f.nextDoseInH!)}
            </p>
          </div>
        </div>

        <HalfLifeGraph
          lines={focus.graph}
          selected={focus.selected}
          t0={t0}
          t1={t1}
          nowH={nowH}
          unit={focus.unit}
          drawKey={1}
          band
          halfAtH={halfAtH}
          doseTicks
        />

        <div className="inst-rows px-3 py-0.5">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between py-[9px]">
              <span className="text-[13px] text-text-muted">{label}</span>
              <span className="font-mono text-[13.5px] text-foreground">{value}</span>
            </div>
          ))}
        </div>

        <p className="px-2 text-center text-[12px] leading-snug text-balance text-text-muted">
          Usually peaks ~{usual.peaksAfter} after a dose and clears ~{usual.clearsAfter} after the last.
        </p>
      </section>

      <PastRuns focus={focus} nowH={nowH} />

      <CurveGuide
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        lines={focus.selected == null ? focus.graph : [focus.graph[focus.selected]]}
        t0={t0}
        t1={t1}
        nowH={nowH}
        unit={focus.unit}
        halfAtH={halfAtH}
        peakAtH={peak.kind === "ahead" || peak.kind === "next" ? peak.atH : null}
      />
    </SubpageShell>
  )
}

/** "31 Aug" for an instant in hours. */
const dayOf = (h: number) => shortDate(dateKeyOfHours(h))

/**
 * Past runs (build-brief-final §3.11): each unbroken stretch of doses, newest
 * first, "This run" while it is going. A tap opens its own graph, from its
 * first dose until it cleared, with its length, doses and peak.
 */
function PastRuns({ focus, nowH }: { focus: Focus; nowH: number }) {
  const [openAt, setOpenAt] = useState<number | null>(null)
  const hl = focus.source.halfLifeH
  const route = focus.source.route
  const runs = useMemo(() => doseRuns(focus.taken, nowH, hl).reverse(), [focus.taken, nowH, hl])
  if (runs.length === 0) return null
  return (
    <div className="animate-home-up" style={{ animationDelay: "80ms" }}>
      <p className={cn(CARD_EYEBROW, "mb-2 px-1")}>Past runs</p>
      <div className="inst-card px-4 py-0.5">
        {runs.map((r, i) => {
          const open = openAt === r.fromH
          const doses = focus.taken.filter((d) => d.atH >= r.fromH && d.atH <= r.toH)
          const r0 = r.fromH - Math.max(12, (r.toH - r.fromH) * 0.04)
          const r1 = r.current ? nowH : Math.min(nowH, r.toH + clearsAfterH(hl, route))
          const line: GraphLine[] = [{ source: focus.source, taken: doses, toCome: [], hue: focus.hue }]
          const peak = Math.max(0, ...curvePoints(doses, r0, r1, 200, hl, route).map((p) => p[1]))
          const days = Math.max(1, Math.round((r.toH - r.fromH) / 24) + 1)
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
                <Sparkline lines={line} nowH={r1} width={80} height={22} />
                <CaretRight className="cy-chev h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              </button>
              <Fold open={open} className="space-y-2.5 pb-3.5">
                <HalfLifeGraph
                  lines={line}
                  t0={r0}
                  t1={r1}
                  nowH={r1}
                  unit={focus.unit}
                  drawKey={open ? 1 : null}
                  doseTicks
                  showNow={false}
                />
                <div className="inst-rows px-3 py-0.5">
                  {[
                    ["Length", days === 1 ? "1 day" : `${days} days`],
                    ["Doses", String(r.count)],
                    ["Peak", `${formatAmount(peak)} ${focus.unit}`],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between py-[9px]">
                      <span className="text-[13px] text-text-muted">{label}</span>
                      <span className="font-mono text-[13.5px] text-foreground">{value}</span>
                    </div>
                  ))}
                </div>
              </Fold>
            </div>
          )
        })}
      </div>
    </div>
  )
}
