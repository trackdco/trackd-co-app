"use client";

import { useCallback, useState } from "react";

import { siteHeat } from "@/lib/home/siteRecency";

import {
  routeBasePaths,
  routeRegions,
  routeTransform,
} from "@/components/sites/bodyArtwork";
import type { DemoView } from "@/lib/onboarding/demo";
import { cn } from "@/lib/utils";

import { useFlow } from "./flow-context";

/**
 * The demo's injection-site map, drawn with THE REAL ARTWORK.
 *
 * It renders Angus's actual hand-authored body and its actual region paths, so
 * the demo and the app cannot look like two different products. What it does
 * NOT do is read the database: `injection_sites` is readable only by an
 * authenticated user (RLS), and this whole flow is anonymous. Labels are
 * DERIVED from the region ids instead of fetched, which keeps the demo
 * throwaway and needs no grant.
 *
 * Sex-aware, defaulting to male like the rest of the app. Mirror-front
 * convention: image-left is the "-l" site on both views.
 *
 * ## It opens with history already on it
 *
 * Adrian's note (2026-08-01): an empty body that asks to be tapped demonstrates
 * nothing. It arrives with sites ALREADY SHADED by how recently they were used
 * and a small card against each saying when, so the point of the feature is
 * visible before the user does anything at all.
 *
 * The shading is the app's own idiom: `--accent-amber` at reducing strength as
 * a site rests (`lib/home/siteRecency.ts`). It encodes recency, a fact about
 * the user's own logging, not a health reading, and every marked site carries
 * its day count in words so the colour reads as heat rather than as a warning.
 * Nothing here suggests where to go next.
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

/** "im-quad-front-l" -> "L quad". */
export function siteLabel(siteId: string): string {
  const withoutRoute = siteId.replace(/^(im|subq)-/, "");
  const match = /^(.*)-([lr])$/.exec(withoutRoute);
  if (!match) return withoutRoute.replace(/-/g, " ");
  const [, muscle, side] = match;
  const name = MUSCLE_LABELS[muscle] ?? muscle.replace(/-/g, " ");
  return `${side.toUpperCase()} ${name}`;
}

/**
 * The seeded history: one recent site and two rested ones per view, which is
 * what Adrian asked for and also roughly what a real rotation looks like.
 */
const HISTORY: Record<DemoView, Record<string, number>> = {
  front: {
    "im-delt-l": 2,
    "im-quad-front-r": 6,
    "im-vglute-l": 9,
  },
  back: {
    // NOT `im-delt-*`: the back artwork has no delt region (it has traps,
    // lats, triceps, glutes and calves), so a delt seeded here shaded nothing
    // and its chip never mounted — silently, because the anchor lookup just
    // returns nothing.
    "im-glute-r": 3,
    "im-trap-r": 7,
    "im-lat-l": 11,
  },
};

/**
 * The app's OWN decay, not a second one. `siteHeat` is what the real rotation
 * view uses and it fades to nothing at the end of the window (IM: 7 days), so
 * a rested site reads as rested here exactly as it does in the app. The
 * hand-rolled staircase this replaces never reached zero, which meant a
 * nine-day-old site glowed in the demo and would have been blank in the app.
 */
function recencyMix(days: number): number {
  return Math.round(siteHeat(days, "im") * 100);
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
  const history = HISTORY[view];

  /**
   * Where each shaded region sits, as a percentage of the box, so a label can
   * be pinned beside it. Measured from the DOM because the artwork is a
   * transformed path and there is no other honest way to find its middle.
   *
   * Done in a ref CALLBACK rather than an effect: it runs after layout, it is a
   * callback rather than an effect body (so it does not trip the
   * setState-in-effect rule), and the `key` on the svg means a view swap
   * remounts and re-measures.
   */
  const [anchors, setAnchors] = useState<Record<string, { x: number; y: number }>>({});

  const measure = useCallback(
    (svg: SVGSVGElement | null) => {
      if (!svg) return;
      const box = svg.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const next: Record<string, { x: number; y: number }> = {};
      for (const id of Object.keys(HISTORY[view])) {
        const el = svg.querySelector<SVGPathElement>(`[data-site="${id}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        next[id] = {
          x: ((r.left + r.width / 2 - box.left) / box.width) * 100,
          y: ((r.top + r.height / 2 - box.top) / box.height) * 100,
        };
      }
      setAnchors(next);
    },
    [view],
  );

  /** The freshest site is the one worth naming in full. */
  const freshest = Object.entries(history).sort((a, b) => a[1] - b[1])[0]?.[0];

  return (
    <div className="relative mx-auto w-full max-w-[19rem]">
      <svg
        key={view}
        ref={measure}
        viewBox="0 0 100 100"
        className="h-auto w-full"
        role="group"
        aria-label={`Injection sites, ${view} view`}
      >
        <g aria-hidden="true">
          <g transform={transform} style={{ fill: "var(--bg-input)" }} stroke="none">
            {basePaths.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        </g>

        <g transform={transform}>
          {regions.map((region) => {
            const label = siteLabel(region.siteId);
            const days = history[region.siteId];
            const active = selected === region.siteId;

            const fill = active
              ? "var(--accent-amber)"
              : days !== undefined
                ? `color-mix(in srgb, var(--accent-amber) ${recencyMix(days)}%, var(--bg-surface-raised))`
                : "var(--bg-surface-raised)";

            return (
              <path
                key={region.siteId}
                d={region.d}
                role="button"
                tabIndex={0}
                aria-label={
                  days !== undefined
                    ? `${label}, last logged ${days} days ago`
                    : `Record ${label}`
                }
                aria-pressed={active}
                data-site={region.siteId}
                onClick={() => onTap(region.siteId, label)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onTap(region.siteId, label);
                  }
                }}
                // An SVG path cannot take a Tailwind ring, so the focus state
                // is a real outline. `outline-none` with nothing in its place
                // left a keyboard user tabbing blind through fourteen regions.
                className="cursor-pointer transition-[fill] duration-[var(--motion-base)] ease-[var(--motion-ease)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary motion-reduce:transition-none"
                style={{ fill }}
              />
            );
          })}
        </g>
      </svg>

      {/* Day counts pinned to the sites they belong to. Factual and small:
          they say WHEN, never where to go next. */}
      {Object.entries(history).map(([id, days]) => {
        const at = anchors[id];
        if (!at) return null;
        const isFreshest = freshest === id;
        return (
          <span
            key={id}
            aria-hidden
            className={cn(
              "animate-flow-in pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-2 py-1",
              "font-mono text-[9px] tabular-nums tracking-[0.06em]",
              isFreshest
                ? "flow-card bg-bg-surface text-accent-amber"
                : "bg-bg-surface/85 text-text-muted backdrop-blur-sm",
            )}
            style={{ left: `${at.x}%`, top: `${at.y}%` }}
          >
            {isFreshest ? `${siteLabel(id)} · ${days}d ago` : `${days}d`}
          </span>
        );
      })}
    </div>
  );
}
