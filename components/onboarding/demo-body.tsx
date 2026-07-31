"use client";

import {
  routeBasePaths,
  routeRegions,
  routeTransform,
} from "@/components/sites/bodyArtwork";
import type { DemoView } from "@/lib/onboarding/demo";
import { cn } from "@/lib/utils";

import { useFlow } from "./flow-context";

/**
 * The demo's injection-site map, drawn with THE REAL ARTWORK (Adrian,
 * 2026-07-31: "we just want it to look the same").
 *
 * It renders Angus's actual hand-authored body and its actual region paths, so
 * the demo and the app cannot look like two different products. What it does
 * NOT do is read the database: `injection_sites` is readable only by an
 * authenticated user (RLS), and this whole flow is anonymous. Labels are
 * DERIVED from the region ids instead of fetched, which keeps the demo
 * genuinely throwaway and needs no grant.
 *
 * Sex-aware: it draws the body matching what the user chose at housekeeping,
 * defaulting to male like the rest of the app does for a profile with no sex.
 *
 * Mirror-front convention, same as the real map: image-left is the "-l" site on
 * both views, so what you tap is what you would call it.
 */

/**
 * Every region on the body is tappable. It used to be a list of ten named ones
 * and the rest were inert paths, which meant Adrian tapped a muscle and nothing
 * happened, with no way to tell which ones were live. A map you cannot tap all
 * of is a broken map.
 *
 * The label is derived from the site id, so a new region in the artwork gets a
 * sensible name without this file being touched.
 */
const MUSCLE_LABELS: Record<string, string> = {
  bicep: "bicep",
  calf: "calf",
  delt: "delt",
  glute: "glute",
  lat: "lat",
  pec: "pec",
  "quad-front": "quad",
  "quad-out": "outer quad",
  trap: "trap",
  tricep: "tricep",
  vglute: "ventroglute",
};

/** "im-quad-front-l" -> "L quad". Mirror convention: image-left is the L site. */
export function siteLabel(siteId: string): string {
  const withoutRoute = siteId.replace(/^(im|subq)-/, "");
  const match = /^(.*)-([lr])$/.exec(withoutRoute);
  if (!match) return withoutRoute.replace(/-/g, " ");
  const [, muscle, side] = match;
  const name = MUSCLE_LABELS[muscle] ?? muscle.replace(/-/g, " ");
  return `${side.toUpperCase()} ${name}`;
}

export function DemoBody({
  view,
  selected,
  onTap,
}: {
  view: DemoView;
  selected: string | null;
  onTap: (siteId: string, label: string) => void;
}) {
  const { session } = useFlow();
  const sex = session.sex === "female" ? "female" : "male";
  const aspect = view === "front" ? "anterior" : "posterior";

  const basePaths = routeBasePaths("im", aspect, sex);
  const regions = routeRegions("im", aspect, sex);
  const transform = routeTransform("im", sex);

  return (
    <div className="mx-auto w-full max-w-[15rem]">
      <svg
        viewBox="0 0 100 100"
        className="h-auto w-full"
        role="group"
        aria-label={`Injection sites, ${view} view`}
      >
        {/* The base body, exactly as BodySilhouette draws it. */}
        <g aria-hidden="true">
          <g transform={transform} style={{ fill: "var(--bg-input)" }} stroke="none">
            {basePaths.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        </g>

        {/* The regions. All of them interactive: see the note above. */}
        <g transform={transform}>
          {regions.map((region) => {
            const label = siteLabel(region.siteId);
            const active = selected === region.siteId;

            return (
              <path
                key={region.siteId}
                d={region.d}
                role="button"
                tabIndex={0}
                aria-label={`Record ${label}`}
                aria-pressed={active}
                data-site={region.siteId}
                onClick={() => onTap(region.siteId, label)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onTap(region.siteId, label);
                  }
                }}
                className={cn(
                  "cursor-pointer outline-none",
                  "transition-[fill] duration-[var(--motion-base)] ease-[var(--motion-ease)]",
                  "motion-reduce:transition-none",
                )}
                style={{
                  // Amber marks the one live thing: the site just recorded.
                  fill: active
                    ? "var(--accent-amber)"
                    : "var(--bg-surface-raised)",
                }}
              />
            );
          })}
        </g>

      </svg>
    </div>
  );
}
