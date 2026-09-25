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
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react"

import { ThumbGroup } from "@/components/feel/SlidingThumb"
import { SEGMENTED_ITEM, SEGMENTED_ITEM_LG, SEGMENTED_TRACK } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"
import { rampFill } from "@/lib/sites/recencyRamp"
import type {
  BodySex,
  InjectionSiteAspect,
  InjectionSiteRow,
} from "@/lib/db/types"
import { BodySilhouette } from "@/components/sites/BodySilhouette"
import {
  regionNeedsHalo,
  routeRegions,
  routeTransform,
  type BodyRegion,
} from "@/components/sites/bodyArtwork"

export type BodyMapMode = "select" | "pick" | "recency"

interface BodyMapProps {
  /** The catalogue sites to render (parent has already filtered by route + sex). */
  sites: InjectionSiteRow[]
  mode: BodyMapMode
  /** Which figure to draw. Defaults to male (the body for a profile with no sex). */
  sex?: BodySex
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
  /**
   * `pick` only (feel pass §5): days since each site was last used. The picked
   * site is the only full amber; history sits one shade down, with one extra,
   * faintest shade: `1 - (d + 1) / (historyWindow + 1)` for `d < historyWindow`.
   */
  history?: Record<string, number>
  /** How many days a site stays shaded (Sub-Q 5, IM 7). */
  historyWindow?: number
  /** Day counts in the margins, each with a hairline back to its site. */
  dayChips?: boolean
  /** The site used most recently of all: the one chip that reads amber. */
  freshestId?: string | null
  /** Arrive in sequence once a sheet has landed: body, then sites, then chips. */
  arrive?: boolean
  /** The log sheet draws the map on the raised surface, which needs its own paint. */
  tone?: "default" | "raised" | "lifted"
  /** Controlled Front / Back, for a parent that draws the switch itself (the
   *  dose row's Site panel puts it in its header row, beside the arrow). */
  aspect?: InjectionSiteAspect
  onAspectChange?: (aspect: InjectionSiteAspect) => void
  /** The parent draws the Front / Back switch; the map draws none of its own. */
  hideSwitch?: boolean
}

const ASPECTS: { key: InjectionSiteAspect; label: string }[] = [
  { key: "anterior", label: "Front" },
  { key: "posterior", label: "Back" },
]

export function BodyMap({
  sites,
  mode,
  sex = "male",
  activeIds,
  heat,
  onTapSite,
  inspectable = false,
  disabled = false,
  history,
  historyWindow = 0,
  dayChips = false,
  freshestId = null,
  arrive = false,
  tone = "default",
  aspect: aspectProp,
  onAspectChange,
  hideSwitch = false,
}: BodyMapProps) {
  const active = new Set(activeIds ?? [])
  const interactive = Boolean(onTapSite) && !disabled && mode !== "recency"
  // A map instance is single-route (the parent filters by route).
  const route = sites[0]?.route ?? "im"
  const sitesById = new Map(sites.map((s) => [s.id, s]))

  // Front / back share one view, switched by a pill toggle with a cross-FADE. Both
  // panels stay mounted (stacked); only the visible one is interactive.
  const [ownAspect, setOwnAspect] = useState<InjectionSiteAspect>("anterior")
  const aspect = aspectProp ?? ownAspect
  // The chips wait for the arrival only the first time; a flip shows them at once.
  const [flippedHere, setFlipped] = useState(false)
  const [firstAspect] = useState(aspect)
  const flipped = flippedHere || aspect !== firstAspect
  const setAspect = (next: InjectionSiteAspect) => {
    if (onAspectChange) onAspectChange(next)
    else setOwnAspect(next)
  }

  /** Shaded history in the picker (feel pass §5). */
  const historyHeat = (siteId: string): number => {
    const d = history?.[siteId]
    if (d == null || d < 0 || d >= historyWindow) return 0
    return 1 - (d + 1) / (historyWindow + 1)
  }

  return (
    <div
      className={cn(
        arrive && "body-map-arrive",
        tone === "raised" && "body-map-raised",
        tone === "lifted" && "body-map-lifted",
      )}
    >
      {/* Front / Back pills on the shared sliding thumb (feel pass §6). Only the
          pill slides; the bodies keep their crossfade. */}
      {hideSwitch ? null : (
        <div className="mb-4 flex justify-center">
          <BodyAspectSwitch
            aspect={aspect}
            onChange={(key) => {
              if (key !== aspect) setFlipped(true)
              setAspect(key)
            }}
          />
        </div>
      )}

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
              <PanelBox
                key={key}
                chips={
                  dayChips && isActive && history
                    ? { history, historyWindow, freshestId, flipped }
                    : null
                }
              >
                {(svgRef) => (
                  <svg
                    ref={svgRef}
                    viewBox="0 0 100 100"
                    className="block w-full select-none"
                    role="group"
                    aria-label={`${label} view`}
                  >
                    <BodySilhouette aspect={key} route={route} sex={sex} />
                    <g transform={routeTransform(route, sex)}>
                      {routeRegions(route, key, sex).map((r, i) => (
                        <RegionShape
                          key={r.siteId}
                          region={r}
                          site={sitesById.get(r.siteId)}
                          mode={mode}
                          active={active.has(r.siteId)}
                          heat={
                            mode === "pick" || history ? historyHeat(r.siteId) : (heat?.[r.siteId] ?? 0)
                          }
                          interactive={interactive && isActive}
                          onTap={onTapSite}
                          inspectable={inspectable && isActive}
                          order={i}
                        />
                      ))}
                    </g>
                  </svg>
                )}
              </PanelBox>
              </div>
            )
          })}
      </div>
    </div>
  )
}

/**
 * Front / Back on the Instrument rail. Exported so a parent can put it in its own
 * header row (the dose row's Site panel), where the map then draws none.
 */
export function BodyAspectSwitch({
  aspect,
  onChange,
  small = false,
}: {
  aspect: InjectionSiteAspect
  onChange: (aspect: InjectionSiteAspect) => void
  small?: boolean
}) {
  return (
    <ThumbGroup
      selection={aspect}
      thumbClassName="inst-thumb"
      // The segmented rail (consistency fix #20): the card-header size in the
      // dose row's panel, the sheet size on its own.
      className={cn(SEGMENTED_TRACK, "inline-flex")}
      role="group"
      aria-label="Body view"
    >
      {ASPECTS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={aspect === key}
          className={cn(
            small ? SEGMENTED_ITEM : SEGMENTED_ITEM_LG,
            aspect === key ? "text-bg-base" : "text-text-muted",
          )}
        >
          {label}
        </button>
      ))}
    </ThumbGroup>
  )
}

/** One selectable region: a lighter base shape + an amber overlay (amber when
 *  active/picked, a solid ramp step by heat for history). Interactive only for sites in the shown set;
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
  order = 0,
}: {
  region: BodyRegion
  site?: InjectionSiteRow
  mode: BodyMapMode
  active: boolean
  heat: number
  interactive: boolean
  onTap?: (siteId: string) => void
  inspectable?: boolean
  /** Its place in the arrival stagger. */
  order?: number
}) {
  const isInteractive = interactive && Boolean(site)
  const canInspect = Boolean(inspectable) && Boolean(site) && !isInteractive
  // A picked site is amber; history is a SOLID step of the recency ramp
  // (build-brief-final §2.5), never amber at an opacity over the grey.
  const amberFill = active && mode !== "recency"
    ? "var(--accent-amber)"
    : mode === "recency" || mode === "pick"
      ? rampFill(heat)
      : null

  return (
    <g
      data-site-id={canInspect ? site!.id : undefined}
      data-region={region.siteId}
      style={{ "--rd": order } as CSSProperties}
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
      {/* Native tooltip only when NOT the scrub target — otherwise the browser's
          default title tooltip fights the parent's pointer-following tooltip. */}
      {site && !canInspect && <title>{site.label}</title>}
      {/* `site-hit` carries the transparent stroke that makes a region tappable
          at its own visual centre — without it the two triceps on the back view
          cannot be hit where the user aims, on either body. Applied only where
          the region sweep says it is needed, because the halo is symmetric and a
          blanket one lets a big region swallow a narrow neighbour's centre (the
          quads, measured). See `globals.css` and `regionNeedsHalo`. It sits on
          the FILL path, which is the one that takes the tap. */}
      <path
        d={region.d}
        className={cn("mr-fill", regionNeedsHalo(region.siteId) && "site-hit")}
      />
      {amberFill && (
        <path d={region.d} pointerEvents="none" style={{ fill: amberFill }} />
      )}
      {isInteractive && (
        <path d={region.d} className="mr-focus" pointerEvents="none" />
      )}
    </g>
  )
}

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

interface ChipSpec {
  history: Record<string, number>
  historyWindow: number
  freshestId: string | null
  flipped: boolean
}

interface ChipLayout {
  id: string
  days: number
  /** The site's centre, % of the box. */
  x: number
  y: number
  /** The chip's centre line, % of the box (spread so chips never touch). */
  cy: number
  left: boolean
}

/** "Today" / "1 day" / "N days". */
function dayWords(d: number): string {
  return d === 0 ? "Today" : d === 1 ? "1 day" : `${d} days`
}

/**
 * The box one body is drawn in. It is exactly the svg's box, so a site's
 * position measured against the svg is the same percentage here, and the
 * chips (absolute, in the margins) need no second measurement.
 */
function PanelBox({
  chips,
  children,
}: {
  chips: ChipSpec | null
  children: (svgRef: RefObject<SVGSVGElement | null>) => React.ReactNode
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  return (
    <div className="relative w-full max-w-[360px]">
      {children(svgRef)}
      {chips ? <DayChips svgRef={svgRef} spec={chips} /> : null}
    </div>
  )
}

/**
 * DAY COUNTS IN THE MARGINS (feel pass §5), the way onboarding's demo body
 * does it: a chip on the side its site is on (mirror-front, so x < 50% is the
 * left), level with the site's centre, and a hairline back to that centre.
 * No dot at the end. Only the most recent site of all reads amber. Chips on one
 * side stay at least 9% apart.
 */
function DayChips({
  svgRef,
  spec,
}: {
  svgRef: RefObject<SVGSVGElement | null>
  spec: ChipSpec
}) {
  const [layout, setLayout] = useState<ChipLayout[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)
  const leadersRef = useRef<SVGSVGElement>(null)
  // The parent rebuilds `history` on every render (the sheet ticks each
  // second), so the measurement keys on its CONTENT, not its identity.
  const { historyWindow } = spec
  const shaded = Object.entries(spec.history)
    .filter(([, d]) => d >= 0 && d < historyWindow)
    .sort(([a], [b]) => (a < b ? -1 : 1))
  const shadedKey = shaded.map(([id, d]) => `${id}:${d}`).join(",")

  // Measure the shaded regions whenever the box is laid out or resized. In a
  // ResizeObserver callback (which reports once on observe), not the effect body.
  useIsoLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg || typeof ResizeObserver === "undefined") return
    const days = new Map(
      shadedKey ? shadedKey.split(",").map((e) => [e.split(":")[0], Number(e.split(":")[1])]) : [],
    )
    let last = ""
    const measure = () => {
      const box = svg.getBoundingClientRect()
      if (!box.width || !box.height) return
      const items: ChipLayout[] = []
      svg.querySelectorAll<SVGGElement>("[data-region]").forEach((g) => {
        const id = g.dataset.region!
        const d = days.get(id)
        if (d == null) return
        const r = g.getBoundingClientRect()
        const x = ((r.left + r.width / 2 - box.left) / box.width) * 100
        const y = ((r.top + r.height / 2 - box.top) / box.height) * 100
        items.push({ id, days: d, x, y, cy: y, left: x < 50 })
      })
      for (const side of [true, false]) {
        let prev = -Infinity
        items
          .filter((it) => it.left === side)
          .sort((a, b) => a.y - b.y)
          .forEach((it) => {
            it.cy = Math.max(it.y, prev + 9)
            prev = it.cy
          })
      }
      const sig = items.map((it) => `${it.id}:${it.x.toFixed(1)}:${it.cy.toFixed(1)}`).join("|")
      if (sig === last) return
      last = sig
      setLayout(items)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(svg)
    return () => ro.disconnect()
  }, [svgRef, shadedKey])

  // The leaders run from each chip's inner edge to its site. Written straight
  // onto the paths (React renders them without a `d`), so there is no second
  // render to wait for.
  useIsoLayoutEffect(() => {
    const wrap = wrapRef.current
    const leaders = leadersRef.current
    if (!wrap || !leaders) return
    const box = wrap.getBoundingClientRect()
    if (!box.width || !box.height) return
    for (const it of layout) {
      const chip = wrap.querySelector<HTMLElement>(`[data-chip="${it.id}"]`)
      const path = leaders.querySelector<SVGPathElement>(`[data-leader="${it.id}"]`)
      if (!chip || !path) continue
      const c = chip.getBoundingClientRect()
      const x1 = it.left
        ? ((c.right - box.left) / box.width) * 100 + 1
        : ((c.left - box.left) / box.width) * 100 - 1
      path.setAttribute("d", `M${x1.toFixed(2)} ${it.cy.toFixed(2)} L${it.x.toFixed(2)} ${it.y.toFixed(2)}`)
    }
  }, [layout])

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className={cn("day-chips pointer-events-none absolute inset-0", spec.flipped && "day-chips-flip")}
    >
      <svg
        ref={leadersRef}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        {layout.map((it) => (
          <path
            key={it.id}
            data-leader={it.id}
            fill="none"
            stroke="var(--border-strong)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {layout.map((it) => (
        <span
          key={it.id}
          data-chip={it.id}
          className={cn(
            "absolute -translate-y-1/2 whitespace-nowrap rounded-lg bg-bg-surface px-[7px] py-[3px] font-mono text-[10px] tracking-[0.04em]",
            it.left ? "left-0" : "right-0",
            it.id === spec.freshestId ? "text-accent-amber" : "text-text-muted",
          )}
          style={{ top: `${it.cy}%` }}
        >
          {dayWords(it.days)}
        </span>
      ))}
    </div>
  )
}
