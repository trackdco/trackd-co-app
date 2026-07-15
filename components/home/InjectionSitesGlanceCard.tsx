"use client"

import { useState } from "react"
import { Syringe } from "lucide-react"

import { cn } from "@/lib/utils"
import { CARD_ICON_BADGE, CARD_TITLE } from "@/lib/ui-presets"
import type { InjectionSiteAspect, InjectionSiteRoute } from "@/lib/db/types"
import { siteHeat } from "@/lib/home/siteRecency"
import { BodySilhouette } from "@/components/sites/BodySilhouette"
import { routeRegions, routeTransform } from "@/components/sites/bodyArtwork"

interface RecentSite {
  siteLabel: string | null
  route: InjectionSiteRoute
  /** The compound(s) logged at this site on its most recent day. */
  compounds: string[]
  daysAgo: number
}

interface InjectionSitesGlanceCardProps {
  /** Days since each site was last used (from the dose log). */
  daysSince: Record<string, number>
  /** Recently-used sites (newest first), each with the compound(s) put there. */
  recentSites: RecentSite[]
  /** Tap → the injection-site map (sheet). */
  onOpen: () => void
}

const ROUTES: { key: InjectionSiteRoute; label: string }[] = [
  { key: "im", label: "IM" },
  { key: "subq", label: "Sub-Q" },
]

/**
 * Home glance card — your injection map at a glance, mirroring the Weight card's
 * shape (icon + title + a segmented toggle). The toggle switches between
 * **Intramuscular** and **Sub-Q**; a mini front + back body shades where you've been
 * injecting by recency (brighter = more recent), fading to empty past the decay
 * window (the same ramp as the full map). Below, "Last logged" lists your most-recent
 * **muscles**, each with the compound(s) you put there — so two compounds in one area
 * read together. There's no pre-set list — you pick any site (on the compound's route)
 * when you log a dose; this just reflects your history. Tap opens the fuller map.
 * Display only.
 */
export function InjectionSitesGlanceCard({
  daysSince,
  recentSites,
  onOpen,
}: InjectionSitesGlanceCardProps) {
  const [route, setRoute] = useState<InjectionSiteRoute>("im")

  // The most-recently-used sites on this route, each with the compound(s) put there.
  const sitesForRoute = recentSites.filter((s) => s.route === route).slice(0, 3)

  return (
    <div className="rounded-2xl border border-border-default bg-bg-surface">
      {/* Header — label + the IM / Sub-Q toggle. */}
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-1.5">
        <div className="flex min-w-0 items-center gap-3.5">
          <span aria-hidden className={CARD_ICON_BADGE}>
            <Syringe className="h-5 w-5" />
          </span>
          <p className={`${CARD_TITLE} truncate`}>Injection sites</p>
        </div>

        <div className="inline-flex shrink-0 rounded-full border border-border-default bg-bg-input p-0.5 text-[11px]">
          {ROUTES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRoute(r.key)}
              aria-pressed={route === r.key}
              className={cn(
                "rounded-full px-2.5 py-1 font-medium transition-colors duration-300 ease-out",
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

      {/* Content — the big front + back bodies + a small "last logged" strip; the
          whole thing taps into the map. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open injection sites"
        className="w-full rounded-b-2xl px-5 pb-5 pt-3 text-left transition-colors hover:bg-bg-surface-raised/30"
      >
        {/* Keyed by route so switching IM ↔ Sub-Q fades the body in. */}
        <div
          key={route}
          className="flex w-full flex-col items-center gap-4 duration-300 animate-in fade-in motion-reduce:animate-none"
        >
          <SitePreview route={route} daysSince={daysSince} />

          <div className="w-full border-t border-border-default pt-3.5">
            <p className="mb-2.5 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-text-muted">
              Last logged
            </p>
            {sitesForRoute.length > 0 ? (
              <ul className="flex flex-col gap-2.5">
                {sitesForRoute.map((s, i) => (
                  <li key={i} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm text-foreground">
                        {s.siteLabel ?? "No site"}
                      </span>
                      <span className="shrink-0 font-mono text-[0.7rem] text-text-muted">
                        {s.daysAgo === 0 ? "today" : `${s.daysAgo}d`}
                      </span>
                    </div>
                    <p className="truncate text-[0.7rem] text-text-muted">
                      {s.compounds.join(", ")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-text-muted">
                No {route === "im" ? "IM" : "sub-Q"} doses logged yet.
              </p>
            )}
          </div>
        </div>
      </button>
    </div>
  )
}

const ASPECTS: InjectionSiteAspect[] = ["anterior", "posterior"]

/** Mini front + back bodies showing where you've pinned, shaded by recency (brighter
 *  = more recent, fading to empty past the decay window — the same ramp as the full
 *  map). Every region is drawn so the body reads; used ones lit amber. Read-only. */
function SitePreview({
  route,
  daysSince,
}: {
  route: InjectionSiteRoute
  daysSince: Record<string, number>
}) {
  const heatFor = (siteId: string) => {
    const d = daysSince[siteId]
    if (d === undefined) return 0
    const h = siteHeat(d, route)
    // Same visibility floor the sheet's body map uses (recency mode), so the card
    // and the full map read identically — both fade to empty past the decay window.
    return h > 0 ? Math.max(0.14, h) : 0
  }

  return (
    <span className="flex w-full items-center justify-center gap-5" aria-hidden>
      {ASPECTS.map((aspect) => (
        <svg
          key={aspect}
          viewBox="22 1 56 98"
          className="min-w-0 max-w-[10rem] flex-1"
          preserveAspectRatio="xMidYMid meet"
        >
          <BodySilhouette aspect={aspect} route={route} />
          <g transform={routeTransform(route)}>
            {routeRegions(route, aspect).map((r) => {
              const o = heatFor(r.siteId)
              return (
                <g key={r.siteId}>
                  <path d={r.d} style={{ fill: "var(--muscle-region)" }} />
                  {o > 0 && (
                    <path
                      d={r.d}
                      style={{ fill: "var(--accent-amber)", opacity: o }}
                    />
                  )}
                </g>
              )
            })}
          </g>
        </svg>
      ))}
    </span>
  )
}
