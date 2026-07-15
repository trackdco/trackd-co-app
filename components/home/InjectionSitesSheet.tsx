"use client"

import { useMemo, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import type { InjectionSiteRoute, InjectionSiteRow } from "@/lib/db/types"
import { BodyMap } from "@/components/sites/BodyMap"
import { decayWindow, siteHeat } from "@/lib/home/siteRecency"

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
  /** Full catalogue (both routes). */
  catalogue: InjectionSiteRow[]
  /** Days since each site was last used (from the dose log). */
  daysSince: Record<string, number>
  /** Recently-used sites (newest first), each with the compound(s) put there. */
  recentSites: RecentSite[]
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
  daysSince,
  recentSites,
  showMirrorTip,
}: InjectionSitesSheetProps) {
  const [route, setRoute] = useState<InjectionSiteRoute>("im")
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="h-[94dvh] gap-0 border-t-0 bg-transparent p-0 shadow-none"
      >
        <div className="flex h-full flex-col overflow-hidden rounded-t-3xl border-t border-border-default bg-bg-surface shadow-lg">
          <div className="flex h-11 shrink-0 items-center justify-center">
            <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
          </div>

          <SheetTitle className="shrink-0 px-6 text-lg font-semibold text-foreground">
            Injection sites
          </SheetTitle>
          <SheetDescription className="sr-only">
            Your injection rotation on a body map. Hover a muscle to see when you
            last pinned it; recent pins are listed below.
          </SheetDescription>

          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 pb-10 pt-4">
            {/* Route toggle */}
            <div className="flex justify-center">
              <div
                className="inline-flex rounded-full border border-border-default bg-bg-input p-0.5 text-sm"
                role="group"
                aria-label="Route"
              >
                {ROUTES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => {
                      setRoute(r.key)
                      setInspectedId(null)
                    }}
                    aria-pressed={route === r.key}
                    className={cn(
                      "rounded-full px-5 py-1.5 font-medium transition-colors duration-200 ease-out",
                      route === r.key
                        ? "bg-bg-surface-raised text-foreground"
                        : "text-text-muted",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Body + recency; fades in when you switch IM ↔ Sub-Q. */}
            <div
              key={route}
              className="flex flex-col gap-5 duration-300 animate-in fade-in motion-reduce:animate-none"
            >
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
              <BodyMap sites={routeSites} mode="recency" heat={heat} inspectable />

              {inspected && (
                <div
                  className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-xl border border-border-strong bg-bg-surface-raised px-3 py-1.5 shadow-lg"
                  style={{ left: pointer.x, top: pointer.y - 12 }}
                >
                  <p className="whitespace-nowrap text-xs font-semibold text-foreground">
                    {inspected.label}
                  </p>
                  <p
                    className={cn(
                      "whitespace-nowrap text-[0.7rem]",
                      inspectedPinned ? "text-accent-amber" : "text-text-muted",
                    )}
                  >
                    {inspectedPinned
                      ? `Pinned ${agoLabel(inspectedDays!)}`
                      : "No recent pins"}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-center">
              <RecencyLegend />
            </div>

            {/* Last logged — your most-recent muscles, each with the compound(s) you
                put there (two compounds in one area read together). */}
            <div className="rounded-2xl border border-border-default bg-bg-input px-4 py-3.5">
              <h3 className="mb-3 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-text-muted">
                Last logged
              </h3>
              {recentForRoute.length > 0 ? (
                <ul className="flex flex-col gap-3.5">
                  {recentForRoute.slice(0, 4).map((s, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{
                          background: "var(--accent-amber)",
                          opacity: Math.max(0.4, siteHeat(s.daysAgo, route)),
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate text-sm text-foreground">
                            {s.siteLabel ?? "No site"}
                          </span>
                          <span className="shrink-0 font-mono text-xs text-text-muted">
                            {agoLabel(s.daysAgo)}
                          </span>
                        </div>
                        <p className="truncate text-xs text-text-muted">
                          {s.compounds.join(", ")}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-muted">
                  Nothing logged yet — pick any site when you log a dose.
                </p>
              )}
            </div>

            <p className="px-1 text-xs leading-relaxed text-text-subtle">
              Brighter is more recent; a site fades to empty {decayWindow(route)}{" "}
              days after its last use. Your call where to inject next.
            </p>
            </div>

            {showMirrorTip && (
              <p className="px-1 text-center text-[0.65rem] leading-relaxed text-text-subtle">
                The front view is mirrored (like a selfie) — your left is on the
                left.
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** The amber recency ramp key (token-based; opacity on --accent-amber). */
function RecencyLegend() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[0.65rem] uppercase tracking-[0.1em] text-text-muted">
        Recent
      </span>
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
      <span className="text-[0.65rem] uppercase tracking-[0.1em] text-text-muted">
        Rested
      </span>
    </div>
  )
}
