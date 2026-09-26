"use client"

import Link from "next/link"
import { useMemo, useSyncExternalStore } from "react"

import { Container } from "@/components/containers"
import { ListBlocks } from "@/components/feel/RouteSkeletons"
import { SkeletonGroup } from "@/components/feel/Skeleton"
import { SolidIcon } from "@/components/feel/SolidIcon"
import { Sparkline, useHalfLifeModels, useMinuteNow } from "@/components/halflife/HalfLifeCards"
import type { GraphLine } from "@/components/halflife/HalfLifeGraph"
import { useCloudHydration } from "@/components/home/useCloudHydration"
import { SubpageShell } from "@/components/protocol/pages/Subpage"
import { blendFor } from "@/lib/compound-blends"
import { CATEGORY_DISPLAY_ORDER, CATEGORY_META } from "@/lib/compound-categories"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { listRowFigure } from "@/lib/halflife/model"
import { getDoseLogsSnapshot, subscribeDoseLogs, type DayLogs } from "@/lib/home/doseLog"
import { getHydrationState, subscribeHydrationState, type HydrationState } from "@/lib/home/hydrationState"
import { toDateKey } from "@/lib/home/mockHomeData"
import { getStackSnapshot, isRunning, subscribeStack, type StackCompound } from "@/lib/home/stack"
import { CATEGORY_GLYPH, type GlyphName } from "@/lib/solidGlyphs"
import { CARD_EYEBROW, PRESS } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

const EMPTY_STACK: StackCompound[] = []
const EMPTY_LOGS: DayLogs = {}

interface RowModel {
  compound: StackCompound
  name: string
  graph: GraphLine[]
  figure: string
  /** A dose has been taken: until then there is no curve, so no line. */
  line: boolean
}

/**
 * Protocol → Half-life (build-brief-final §3.11): "Half-life ?" (the "?" says
 * what a half-life is; the page has no intro). The compounds you run, grouped
 * by type, blends as their own group. A row: the name, what is circulating (or
 * "Cleared"), and its sparkline; a tap opens the compound's own page. A
 * compound with no half-life (Vitamin D3) is not listed.
 */
export function HalfLifeScreen({
  userId,
  backHref,
  hrefBase = "/protocol/half-life",
  previewCompounds,
  previewLogs,
}: {
  userId: string
  backHref?: string
  hrefBase?: string
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
  const todayKey = toDateKey(new Date())
  const active = useMemo(() => compounds.filter((c) => isRunning(c, todayKey)), [compounds, todayKey])
  const now = useMinuteNow()
  const { singles, blends, nowH } = useHalfLifeModels(active, logs, userId, now)

  const groups = useMemo(() => {
    const out: { key: string; label: string; glyph: GlyphName; hue: string; rows: RowModel[] }[] = []
    for (const k of CATEGORY_DISPLAY_ORDER) {
      const rows = singles
        .filter((m) => m.compound.category === k)
        .map((m) => ({
          compound: m.compound,
          name: m.compound.name,
          graph: m.graph,
          ...listRowFigure(m.figures, m.line.unit),
        }))
      if (rows.length) {
        out.push({ key: k, label: CATEGORY_META[k].label, glyph: CATEGORY_GLYPH[k] ?? "catPeptide", hue: `var(--cat-${k})`, rows })
      }
    }
    if (blends.length) {
      out.push({
        key: "blends",
        label: "Blends",
        glyph: "catBlend",
        hue: "var(--blend-1)",
        rows: blends.map((b) => {
          const i = b.drawn[0]?.index ?? 0
          return {
            compound: b.compound,
            name: blendFor(b.compound.name)?.label ?? b.compound.name,
            graph: b.graph,
            ...listRowFigure(b.figures[i] ?? null, b.all[i]?.unit ?? b.compound.unit),
          }
        }),
      })
    }
    return out
  }, [singles, blends])

  return (
    <SubpageShell screen="protocol-half-life" title="Half-life" backHref={backHref} explainer="half-life">
      {!known || !now ? (
        <SkeletonGroup label="Loading your half-lives" className="space-y-4">
          <ListBlocks cards={1} />
        </SkeletonGroup>
      ) : groups.length === 0 ? (
        <p className="animate-home-up px-1 text-sm text-text-muted">
          {active.length === 0 ? "Add a compound on Protocol first." : "None of your compounds has a half-life to draw."}
        </p>
      ) : (
        groups.map((g, gi) => (
          <div key={g.key} className="animate-home-up" style={{ animationDelay: `${Math.min(gi, 5) * 50}ms` }}>
            <p className={cn(CARD_EYEBROW, "mb-2 flex items-center gap-1.5 px-1")}>
              <SolidIcon name={g.glyph} size={13} hue={g.hue} />
              {g.label}
            </p>
            <div className="inst-card px-4 py-1">
              {g.rows.map((r, i) => (
                <Link
                  key={r.compound.id}
                  href={`${hrefBase}/${encodeURIComponent(r.compound.id)}`}
                  className={cn(PRESS.row, "block py-3", i > 0 && "hairline-t border-border-default")}
                >
                  <span className={cn("flex items-center gap-2", r.line && "mb-1.5")}>
                    <Container
                      name={r.compound.name}
                      inventoryType={inventoryTypeForCompound(r.compound.name, r.compound.method, r.compound.inventoryForm)}
                      category={r.compound.category}
                      fill={0.6}
                      size={18}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-foreground">{r.name}</span>
                    <span className="shrink-0 font-mono text-[11.5px] text-text-muted">{r.figure}</span>
                  </span>
                  {/* No line before the first dose: a flat one says nothing (D28). */}
                  {r.line ? <Sparkline lines={r.graph} nowH={nowH} width={300} height={24} className="w-full" /> : null}
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </SubpageShell>
  )
}
