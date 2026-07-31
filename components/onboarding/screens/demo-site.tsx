"use client";

import { useState } from "react";

import {
  DEMO_RECENT_SITES,
  DEMO_SITES,
  pushRecentSite,
  type DemoView,
} from "@/lib/onboarding/demo";
import { DATA_MONO } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { FlowCta, StepFrame } from "../chrome";
import { Segmented } from "../controls";
import { useFlow } from "../flow-context";

/**
 * Screen 7 — Demo 3: Site (Spec 3-01 §9, §10, D-1).
 *
 * A RECORD, never instruction. The copy is explicit that the user sets the
 * rotation and Trackd only keeps it: no suggested next site, no ranking, no
 * warning, nothing that could read as telling anyone where or how to inject.
 *
 * D-1 default applied: a front/back toggle, so the glutes sit on a posterior
 * view instead of being pushed onto the front for tap-ability.
 *
 * The silhouette is a simple demo shape, NOT the app's real body map. The real
 * one is coordinate-bearing, sex-aware and reads a catalogue; borrowing it here
 * would drag a data dependency into a screen that must stay throwaway.
 */
export function DemoSiteScreen() {
  const { goNext } = useFlow();
  const [view, setView] = useState<DemoView>("front");
  const [selected, setSelected] = useState<string | null>(null);
  const [recent, setRecent] = useState<readonly string[]>(DEMO_RECENT_SITES);

  const onTap = (id: string, label: string) => {
    setSelected(id);
    setRecent((r) => pushRecentSite(r, label));
  };

  const visible = DEMO_SITES.filter((s) => s.view === view);
  const selectedLabel = DEMO_SITES.find((s) => s.id === selected)?.label ?? null;

  return (
    <StepFrame
      eyebrow="Demo · 3 / 4"
      title="Never lose your last site."
      sub="Tap where you pinned. Trackd keeps the record, you set the rotation."
      footer={<FlowCta onClick={goNext}>Continue</FlowCta>}
    >
      <div className="flex flex-1 flex-col gap-5">
        <Segmented
          label="Body view"
          value={view}
          onChange={(next) => setView(next)}
          options={[
            { value: "front", label: "Front" },
            { value: "back", label: "Back" },
          ]}
        />

        <div className="relative mx-auto aspect-[3/4] w-full max-w-[15rem] rounded-2xl bg-bg-surface">
          <svg viewBox="0 0 100 133" className="h-full w-full" aria-hidden>
            {/* A plain silhouette. Deliberately anatomical-neutral and drawn in
                one muted token so the markers are the only thing with weight. */}
            <g fill="var(--bg-surface-raised)">
              <circle cx="50" cy="15" r="9" />
              <rect x="38" y="25" width="24" height="34" rx="7" />
              <rect x="24" y="27" width="11" height="32" rx="5.5" />
              <rect x="65" y="27" width="11" height="32" rx="5.5" />
              <rect x="38" y="57" width="24" height="14" rx="5" />
              <rect x="39" y="69" width="10" height="42" rx="5" />
              <rect x="51" y="69" width="10" height="42" rx="5" />
            </g>
          </svg>

          {visible.map((site) => {
            const active = site.id === selected;
            return (
              <button
                key={site.id}
                type="button"
                onClick={() => onTap(site.id, site.label)}
                aria-label={`Record ${site.label}`}
                aria-pressed={active}
                data-site={site.id}
                className={cn(
                  "absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full",
                  "transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "motion-reduce:transition-none",
                  active
                    ? "bg-accent-amber"
                    : "border-[0.5px] border-border-strong bg-bg-input active:scale-90",
                )}
                style={{ left: `${site.x}%`, top: `${site.y}%` }}
              >
                {active ? (
                  <span
                    aria-hidden
                    className="animate-home-tick-ring pointer-events-none absolute h-7 w-7 rounded-full border border-accent-amber"
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* The log line. It states what was recorded and nothing else. */}
        <div className="rounded-2xl bg-bg-surface p-4" aria-live="polite">
          {selectedLabel ? (
            <p className={cn(DATA_MONO, "uppercase tracking-[0.08em] text-foreground")}>
              Logged: {selectedLabel} · rotation updated
            </p>
          ) : (
            <p className={cn(DATA_MONO, "uppercase tracking-[0.08em]")}>
              Last 3: {recent.join(" · ")}
            </p>
          )}
        </div>
      </div>
    </StepFrame>
  );
}
