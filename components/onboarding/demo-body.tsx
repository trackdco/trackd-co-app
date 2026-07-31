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
 * authenticated user (RLS), and this whole flow is anonymous. The labels for
 * the handful of sites the demo offers are therefore written down here rather
 * than fetched, which keeps the demo genuinely throwaway and needs no grant.
 *
 * Sex-aware: it draws the body matching what the user chose at housekeeping,
 * defaulting to male like the rest of the app does for a profile with no sex.
 *
 * Mirror-front convention, same as the real map: image-left is the "-l" site on
 * both views, so what you tap is what you would call it.
 */

/** The sites the demo makes tappable, and what to call them. */
const DEMO_LABELS: Record<string, string> = {
  "im-delt-l": "L delt",
  "im-delt-r": "R delt",
  "im-quad-front-l": "L quad",
  "im-quad-front-r": "R quad",
  "im-vglute-l": "L ventroglute",
  "im-vglute-r": "R ventroglute",
  "im-glute-l": "L glute",
  "im-glute-r": "R glute",
  "im-lat-l": "L lat",
  "im-lat-r": "R lat",
};

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

        {/* The regions. Only the ones the demo names are interactive; the rest
            are drawn a step lighter so the body still reads as a whole body. */}
        <g transform={transform}>
          {regions.map((region) => {
            const label = DEMO_LABELS[region.siteId];
            const active = selected === region.siteId;

            if (!label) {
              return (
                <path
                  key={region.siteId}
                  d={region.d}
                  style={{ fill: "var(--bg-surface-raised)" }}
                  stroke="none"
                  aria-hidden
                />
              );
            }

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
