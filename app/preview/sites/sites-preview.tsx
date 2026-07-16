"use client"

import { useState } from "react"

import { cn } from "@/lib/utils"
import { BodyMap } from "@/components/sites/BodyMap"
import { IM_SITES, SUBQ_SITES, sitesForSex } from "@/lib/home/siteCatalog"
import type {
  BodySex,
  InjectionSiteRoute,
  InjectionSiteRow,
} from "@/lib/db/types"

/**
 * The real `BodyMap`, driven by the real catalogue ids — just with the DB read
 * swapped for the static list, so it renders with no session. `aspect`/`x`/`y`/
 * `side` are placeholders: `BodyMap` only reads a site's `id`, `label` and
 * `route` (regions come from the artwork, not the coordinates).
 */
function rows(route: InjectionSiteRoute): InjectionSiteRow[] {
  const defs = route === "im" ? IM_SITES : SUBQ_SITES
  return defs.map((d, i) => ({
    id: d.id,
    label: d.label,
    route,
    side: d.id.endsWith("-l") ? "left" : d.id.endsWith("-r") ? "right" : "n_a",
    aspect: "anterior",
    x: 0,
    y: 0,
    sort_order: i,
  }))
}

const SEXES: BodySex[] = ["male", "female"]
const ROUTES: { key: InjectionSiteRoute; label: string }[] = [
  { key: "im", label: "Intramuscular" },
  { key: "subq", label: "Subcutaneous" },
]

export function SitesPreview() {
  const [route, setRoute] = useState<InjectionSiteRoute>("im")
  const [picked, setPicked] = useState<Record<BodySex, string | null>>({
    male: null,
    female: null,
  })

  return (
    <div className="w-full">
      {/* Route toggle — the app's standard segmented control. */}
      <div className="mb-6 flex justify-center">
        <div
          className="inline-flex rounded-full border border-border-default bg-bg-input p-0.5 text-sm"
          role="group"
          aria-label="Route"
        >
          {ROUTES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRoute(r.key)}
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

      <div className="grid gap-8 md:grid-cols-2">
        {SEXES.map((sex) => {
          const sites = sitesForSex(rows(route), sex)
          const chosen = picked[sex]
          return (
            <section
              key={sex}
              className="rounded-2xl border border-border-default bg-bg-surface p-4"
            >
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-display text-lg capitalize text-foreground">
                  {sex}
                </h2>
                <p className="text-[11px] text-text-subtle">
                  {sites.length} sites
                </p>
              </div>

              <BodyMap
                sites={sites}
                mode="pick"
                sex={sex}
                activeIds={chosen ? [chosen] : []}
                onTapSite={(id) => setPicked((p) => ({ ...p, [sex]: id }))}
              />

              {/* The pick is kept per-sex across route switches, so an IM pick is
                  still there when you switch back — but it has no label on the
                  OTHER route's catalogue, so fall back to the prompt. */}
              <p className="mt-3 min-h-[1.25rem] text-center text-sm text-text-muted">
                {(chosen && sites.find((s) => s.id === chosen)?.label) ||
                  "Tap a muscle — the label should match YOUR side."}
              </p>
            </section>
          )
        })}
      </div>
    </div>
  )
}
