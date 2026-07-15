"use client"

/**
 * The shared injection-site body map (Spec 19). Shows the front OR back anatomical
 * body — switched by a Front/Back pill toggle with a sliding transition. Built ONCE
 * here; rendered in three modes:
 *   - `select`  — taps toggle membership (amber = selected).
 *   - `pick`    — log flow: tap where you injected (amber = the chosen spot).
 *   - `recency` — read-only rotation view, amber shaded by `heat` (0–1).
 *
 * Both routes (IM + Sub-Q) render as clickable REGIONS — tap the muscle/area and the
 * whole region fills amber. MIRROR convention: image-left is the user's own left on
 * both views (screen-left = your left), so the region's site id already encodes the
 * correct side.
 *
 * Presentational + interactive only — no business logic. The parent supplies which
 * sites are relevant (route-filtered), which are active, and per-site heat. Styling
 * is token-only (no hardcoded hex, per ui-context).
 */
import { useState } from "react"

import { cn } from "@/lib/utils"
import type { InjectionSiteAspect, InjectionSiteRow } from "@/lib/db/types"
import { BodySilhouette } from "@/components/sites/BodySilhouette"
import {
  routeRegions,
  routeTransform,
  type BodyRegion,
} from "@/components/sites/bodyArtwork"

export type BodyMapMode = "select" | "pick" | "recency"

interface BodyMapProps {
  /** The catalogue sites to render (parent has already filtered by route). */
  sites: InjectionSiteRow[]
  mode: BodyMapMode
  /** `select`: the working-set ids. `pick`: a single-element array of the chosen id. */
  activeIds?: string[]
  /** Per-site amber intensity 0–1 (`recency`); 1 = injected today, 0 = unfilled. */
  heat?: Record<string, number>
  /** Tap/enter a site (`select` / `pick`). Omit for a read-only map. */
  onTapSite?: (siteId: string) => void
  /** Tag each region with `data-site-id` (+ hover-lit fill) so a parent can hit-test
   *  them on pointer-move for a "scrub" tooltip (`recency`, read-only). */
  inspectable?: boolean
  disabled?: boolean
}

const ASPECTS: { key: InjectionSiteAspect; label: string }[] = [
  { key: "anterior", label: "Front" },
  { key: "posterior", label: "Back" },
]

export function BodyMap({
  sites,
  mode,
  activeIds,
  heat,
  onTapSite,
  inspectable = false,
  disabled = false,
}: BodyMapProps) {
  const active = new Set(activeIds ?? [])
  const interactive = Boolean(onTapSite) && !disabled && mode !== "recency"
  // A map instance is single-route (the parent filters by route).
  const route = sites[0]?.route ?? "im"
  const sitesById = new Map(sites.map((s) => [s.id, s]))

  // Front / back share one view, switched by a pill toggle with a cross-FADE. Both
  // panels stay mounted (stacked); only the visible one is interactive.
  const [aspect, setAspect] = useState<InjectionSiteAspect>("anterior")

  return (
    <div>
      {/* Front / Back pills — the app's standard segmented-control pattern. */}
      <div className="mb-4 flex justify-center">
        <div
          className="inline-flex rounded-full border border-border-default bg-bg-input p-0.5 text-sm"
          role="group"
          aria-label="Body view"
        >
          {ASPECTS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setAspect(key)}
              aria-pressed={aspect === key}
              className={cn(
                "rounded-full px-5 py-1.5 font-medium transition-colors duration-200 ease-out",
                aspect === key
                  ? "bg-bg-surface-raised text-foreground"
                  : "text-text-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Crossfade: front + back stacked in one cell; the active one fades in. */}
      <div className="grid">
        {ASPECTS.map(({ key, label }) => {
          const isActive = key === aspect
          return (
            <div
              key={key}
              className={cn(
                "col-start-1 row-start-1 flex w-full flex-col items-center transition-opacity duration-300 ease-out motion-reduce:transition-none",
                isActive ? "opacity-100" : "pointer-events-none opacity-0",
              )}
              aria-hidden={!isActive}
            >
              <svg
                  viewBox="0 0 100 100"
                  className="w-full max-w-[360px] select-none"
                  role="group"
                  aria-label={`${label} view`}
                >
                  <BodySilhouette aspect={key} route={route} />
                  <g transform={routeTransform(route)}>
                    {routeRegions(route, key).map((r) => (
                      <RegionShape
                        key={r.siteId}
                        region={r}
                        site={sitesById.get(r.siteId)}
                        mode={mode}
                        active={active.has(r.siteId)}
                        heat={heat?.[r.siteId] ?? 0}
                        interactive={interactive && isActive}
                        onTap={onTapSite}
                        inspectable={inspectable && isActive}
                      />
                    ))}
                  </g>
                </svg>
              </div>
            )
          })}
      </div>
    </div>
  )
}

/** One selectable region: a lighter base shape + an amber overlay (opacity = 1 when
 *  active/picked, = heat in recency). Interactive only for sites in the shown set;
 *  in recency it's tagged for the parent's scrub tooltip and lit on hover. */
function RegionShape({
  region,
  site,
  mode,
  active,
  heat,
  interactive,
  onTap,
  inspectable,
}: {
  region: BodyRegion
  site?: InjectionSiteRow
  mode: BodyMapMode
  active: boolean
  heat: number
  interactive: boolean
  onTap?: (siteId: string) => void
  inspectable?: boolean
}) {
  const isInteractive = interactive && Boolean(site)
  const canInspect = Boolean(inspectable) && Boolean(site) && !isInteractive
  const amberOpacity =
    mode === "recency"
      ? heat > 0
        ? Math.max(0.14, Math.min(1, heat))
        : 0
      : active
        ? 1
        : 0

  return (
    <g
      data-site-id={canInspect ? site!.id : undefined}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={
        isInteractive ? `${site!.label}${active ? ", selected" : ""}` : undefined
      }
      aria-pressed={isInteractive && mode === "select" ? active : undefined}
      className={cn(
        "muscle-region",
        (isInteractive || canInspect) && "mr-interactive",
      )}
      onClick={isInteractive ? () => onTap?.(site!.id) : undefined}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onTap?.(site!.id)
              }
            }
          : undefined
      }
    >
      {site && <title>{site.label}</title>}
      <path d={region.d} className="mr-fill" />
      {amberOpacity > 0 && (
        <path
          d={region.d}
          pointerEvents="none"
          style={{ fill: "var(--accent-amber)", opacity: amberOpacity }}
        />
      )}
      {isInteractive && (
        <path d={region.d} className="mr-focus" pointerEvents="none" />
      )}
    </g>
  )
}
