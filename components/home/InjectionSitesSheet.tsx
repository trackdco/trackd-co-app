"use client"

import { useMemo, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { CARD_EYEBROW, SEGMENTED_ITEM_LG, SEGMENTED_TRACK } from "@/lib/ui-presets"
import { ThumbGroup } from "@/components/feel/SlidingThumb"
import { BottomSheet } from "@/components/layout/BottomSheet"
import type {
  BodySex,
  InjectionSiteRoute,
  InjectionSiteRow,
} from "@/lib/db/types"
import { BodyMap } from "@/components/sites/BodyMap"
import { decayWindow, siteHeat } from "@/lib/home/siteRecency"
import { siteDisplayName } from "@/lib/home/siteCatalog"
import { rampFill } from "@/lib/sites/recencyRamp"

interface RecentSite {
  siteLabel: string | null
  route: InjectionSiteRoute
  /** The compound(s) logged at this site on its most recent day. */
  compounds: string[]
  daysAgo: number
}

interface InjectionSitesSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Full catalogue (both routes), already narrowed to `bodySex`'s sites. */
  catalogue: InjectionSiteRow[]
  /** Which figure the map draws (from the user's profile). */
  bodySex: BodySex
  /** Days since each site was last used (from the dose log). */
  daysSince: Record<string, number>
  /** Recently-used sites (newest first), each with the compound(s) put there. */
  recentSites: RecentSite[]
  /** The route to open on — the stack's majority route. Followed until the user
   *  picks a route themselves; their pick then holds for the session only. */
  defaultRoute: InjectionSiteRoute
  /** Show the one-time "front is mirrored" tip (first open only; parent decides). */
  showMirrorTip: boolean
}

const ROUTES: { key: InjectionSiteRoute; label: string }[] = [
  { key: "im", label: "Intramuscular" },
  { key: "subq", label: "Subcutaneous" },
]

function agoLabel(days: number): string {
  return days === 0 ? "today" : `${days}d ago`
}

/**
 * The injection-site map (Spec 19), opened from the Home glance card. A read-only
 * view of your rotation: the big body map shaded by how recently you used each site.
 * Hover / scrub over a muscle and a small tooltip FOLLOWS the pointer, telling you
 * its history ("Pinned 3d ago" / "No recent pins"). A minimalist "Last logged" card
 * lists your last few pins. You pick any site when you log a dose; this just reflects
 * that history. It REPORTS, it does not recommend.
 */
export function InjectionSitesSheet({
  open,
  onOpenChange,
  catalogue,
  bodySex,
  daysSince,
  recentSites,
  defaultRoute,
  showMirrorTip,
}: InjectionSitesSheetProps) {
  // Null = untouched, so the map tracks `defaultRoute` — which only settles once
  // the stack hydrates from localStorage, after the first render. Seeding
  // `useState` with it instead would freeze the pre-hydration guess.
  const [picked, setPicked] = useState<InjectionSiteRoute | null>(null)
  const route = picked ?? defaultRoute
  const [inspectedId, setInspectedId] = useState<string | null>(null)
  const [pointer, setPointer] = useState({ x: 0, y: 0 })
  const mapRef = useRef<HTMLDivElement>(null)

  const routeSites = useMemo(
    () => catalogue.filter((s) => s.route === route),
    [catalogue, route],
  )

  const heat = useMemo(() => {
    const heat: Record<string, number> = {}
    for (const s of routeSites) {
      const d = daysSince[s.id]
      if (d === undefined) continue
      heat[s.id] = siteHeat(d, route)
    }
    return heat
  }, [routeSites, daysSince, route])

  // The day chips: days since each site on this route, and the freshest one.
  const { routeHistory, freshestId } = useMemo(() => {
    const out: Record<string, number> = {}
    let best: { id: string; d: number } | null = null
    for (const s of routeSites) {
      const d = daysSince[s.id]
      if (d === undefined) continue
      out[s.id] = d
      if (!best || d < best.d) best = { id: s.id, d }
    }
    return { routeHistory: out, freshestId: best?.id ?? null }
  }, [routeSites, daysSince])

  // The most-recent muscles on this route, each with the compound(s) put there.
  const recentForRoute = recentSites.filter((s) => s.route === route)

  const inspected = inspectedId
    ? routeSites.find((s) => s.id === inspectedId)
    : undefined
  const inspectedDays = inspected ? daysSince[inspected.id] : undefined
  const inspectedPinned = inspectedDays !== undefined

  // Scrub: find the muscle under the pointer (works for mouse hover + touch drag)
  // and place the tooltip at the pointer, relative to the map box.
  function scrub(e: React.PointerEvent) {
    const wrap = mapRef.current
    if (!wrap) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const hit = el?.closest("[data-site-id]")
    const id = hit?.getAttribute("data-site-id") ?? null
    const rect = wrap.getBoundingClientRect()
    setPointer({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    setInspectedId(id)
  }
  function endScrub() {
    setInspectedId(null)
  }

  // Left-edge swipe-back: a drag that STARTS at the very left edge and moves
  // decisively right closes the sheet (like an OS back gesture). Detect-and-close,
  // no visual drag — so it can't get stuck part-way or fight the scroll / map scrub.
  const edgeRef = useRef<{ startX: number; startY: number } | null>(null)
  const EDGE_ZONE = 30 // px from the left edge a back-swipe may start in
  function onEdgePointerDown(e: React.PointerEvent) {
    edgeRef.current =
      e.clientX <= EDGE_ZONE ? { startX: e.clientX, startY: e.clientY } : null
  }
  function onEdgePointerMove(e: React.PointerEvent) {
    const d = edgeRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (dx > 70 && dx > Math.abs(dy) * 1.5) {
      edgeRef.current = null
      onOpenChange(false)
    } else if (Math.abs(dy) > 40) {
      edgeRef.current = null // it's a vertical move — leave it for scrolling
    }
  }
  function endEdge() {
    edgeRef.current = null
  }

  // The one sheet frame (consistency fix #1): the handle and a drag close it,
  // as do the dark above it and a swipe in from the left edge. No Done.
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Injection sites"
      description="Tap a muscle to see when you last pinned it. Recent pins are listed below."
      desktop="rail"
    >
      <div
        onPointerDown={onEdgePointerDown}
        onPointerMove={onEdgePointerMove}
        onPointerUp={endEdge}
        onPointerCancel={endEdge}
      >
        {/* The sections rise in as the sheet lands (feel pass §4). The keyed
            route crossfade below keeps its own fade, which overrides the rise. */}
        <div data-sheet-body className="flex flex-col gap-5 pt-1 pb-3">
          {/* Route toggle, on the shared sliding thumb (feel pass §6). */}
          <ThumbGroup
            selection={route}
            thumbClassName="inst-thumb"
            className={SEGMENTED_TRACK}
            role="group"
            aria-label="Route"
          >
            {ROUTES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => {
                  setPicked(r.key)
                  setInspectedId(null)
                }}
                aria-pressed={route === r.key}
                className={cn(SEGMENTED_ITEM_LG, "font-medium", route === r.key ? "text-bg-base" : "text-text-muted")}
              >
                {r.label}
              </button>
            ))}
          </ThumbGroup>

          {/* Body + recency; fades in when you switch IM ↔ Sub-Q. */}
          <div key={route} className="flex flex-col gap-5 duration-300 animate-in fade-in motion-reduce:animate-none">
            {/* Big body map + the scrub tooltip that follows the pointer. */}
            <div
              ref={mapRef}
              className="relative touch-none"
              onPointerMove={scrub}
              onPointerDown={scrub}
              onPointerUp={endScrub}
              onPointerLeave={endScrub}
              onPointerCancel={endScrub}
            >
              {/* The log sheet's map (build-brief-final §3.4): day chips in the
                  margins on 1px leaders, the freshest chip amber, the sites in
                  solid steps of the amber ramp. It reports; it never suggests. */}
              <BodyMap
                sites={routeSites}
                mode="recency"
                sex={bodySex}
                heat={heat}
                history={routeHistory}
                historyWindow={decayWindow(route)}
                dayChips
                freshestId={freshestId}
                inspectable
              />

              {inspected && (
                <div
                  className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-border-default bg-bg-surface-raised px-2.5 py-1.5 shadow-lg"
                  style={{ left: pointer.x, top: pointer.y - 12 }}
                >
                  <p className="whitespace-nowrap text-xs font-medium text-foreground">{siteDisplayName(inspected.label)}</p>
                  <p
                    className={cn(
                      "whitespace-nowrap text-[11px] tabular-nums",
                      inspectedPinned ? "text-accent-amber" : "text-text-muted",
                    )}
                  >
                    {inspectedPinned ? `Pinned ${agoLabel(inspectedDays!)}` : "No recent pins"}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-center">
              <RecencyLegend />
            </div>

            {/* Last logged — your most-recent muscles, each with the compound(s)
                you put there (two compounds in one area read together). */}
            <div className="rounded-xl bg-bg-input px-4 py-3.5">
              <h3 className={cn(CARD_EYEBROW, "mb-3")}>Last logged</h3>
              {recentForRoute.length > 0 ? (
                <ul className="flex flex-col gap-3.5">
                  {recentForRoute.slice(0, 4).map((s, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{
                          background: rampFill(Math.max(0.4, siteHeat(s.daysAgo, route))) ?? "var(--muscle-region)",
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate text-sm text-foreground">
                            {s.siteLabel ? siteDisplayName(s.siteLabel) : "No site"}
                          </span>
                          <span className="shrink-0 font-mono text-xs text-text-muted">{agoLabel(s.daysAgo)}</span>
                        </div>
                        <p className="truncate text-xs text-text-muted">{s.compounds.join(", ")}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-muted">Nothing logged yet. Pick any site when you log a dose.</p>
              )}
            </div>

            {/* ONE footnote (consistency fix #29): the ramp, and on the first
                open that the front is mirrored. It reports; it never advises. */}
            <p className="px-1 text-xs leading-relaxed text-text-muted">
              Brighter is more recent; a site fades to empty {decayWindow(route)} days after its last use.
              {showMirrorTip ? " The front view is mirrored, like a selfie." : null}
            </p>
          </div>
        </div>
      </div>
    </BottomSheet>
  )
}

/** The amber recency ramp key (token-based; opacity on --accent-amber). */
function RecencyLegend() {
  return (
    <div className="flex items-center gap-1.5">
      <span className={CARD_EYEBROW}>Recent</span>
      <span className="flex items-center gap-1" aria-hidden>
        {[1, 0.55, 0.25].map((o) => (
          <span
            key={o}
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: "var(--accent-amber)", opacity: o }}
          />
        ))}
        <span
          className="h-2.5 w-2.5 rounded-full border"
          style={{
            borderColor: "var(--border-strong)",
            background: "var(--bg-base)",
          }}
        />
      </span>
      <span className={CARD_EYEBROW}>Rested</span>
    </div>
  )
}
