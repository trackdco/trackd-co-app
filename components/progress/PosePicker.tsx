"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { Plus, MagnifyingGlass } from "@/components/icons";

import { PoseIcon } from "@/components/progress/PoseIcon";
import { searchPoses } from "@/lib/progress/photos";
import { PRESS } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

/**
 * Searchable pose picker (Spec 09 addendum). Start typing and the standard poses
 * autocomplete ("side ch" → Side chest) — each with its illustration — so names
 * stay consistent and comparable. If nothing matches, you can still add your typed
 * name as a custom pose. `exclude` hides poses already chosen.
 *
 * `bare` drops its own box, for a picker that opens inside a card of its own
 * (the add sheet's "Add pose" card, W40). There its search and rows rise in
 * one after another as the card opens: they carry `.animate-dropup-item`,
 * which plays only inside an open `[data-dropup-open="true"]` and not at all
 * with reduced motion (globals.css).
 */
export function PosePicker({
  exclude = [],
  onPick,
  bare = false,
}: {
  exclude?: string[];
  onPick: (pose: string) => void;
  /** No box of its own: it sits inside a card that is its frame. */
  bare?: boolean;
}) {
  const [query, setQuery] = useState("");
  const results = searchPoses(query, exclude);
  const q = query.trim();
  const exactMatch =
    q !== "" && results.some((p) => p.label.toLowerCase() === q.toLowerCase());

  return (
    <div className={bare ? undefined : "rounded-xl border border-border-default bg-bg-surface-raised p-2"}>
      <div className="animate-dropup-item relative" style={rise(0)}>
        <MagnifyingGlass
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted"
          aria-hidden
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search poses (e.g. side chest)"
          aria-label="Search poses"
          className="h-10 w-full rounded-lg border border-border-default bg-bg-input pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-text-muted focus-visible:border-border-strong"
        />
      </div>

      <div className="mt-1">
        {results.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p.id)}
            style={rise(i + 1)}
            className={cn(PRESS.row, "animate-dropup-item flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-bg-input/60")}
          >
            <PoseIcon shape={p.shape} className="h-7 w-5 shrink-0 text-text-muted" />
            <span className="text-sm text-foreground">{p.label}</span>
          </button>
        ))}

        {/* Custom fallback — add the typed name if it isn't a catalogue pose. */}
        {q !== "" && !exactMatch && (
          <button
            type="button"
            onClick={() => onPick(q)}
            className={cn(PRESS.row, "flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-bg-input/60")}
          >
            <span className="flex h-7 w-5 shrink-0 items-center justify-center text-text-muted">
              <Plus className="h-4 w-4" aria-hidden />
            </span>
            <span className="text-sm text-foreground">
              Add “{q}” <span className="text-text-muted">· custom</span>
            </span>
          </button>
        )}

        {results.length === 0 && q === "" && (
          <p className="px-2 py-3 text-sm text-text-muted">No more poses to add.</p>
        )}
      </div>
    </div>
  );
}

/**
 * The stagger for the n-th thing to rise in: about 42ms apart (the drop-up's
 * 26ms unit, times 1.6), the first six only, so a long list is not still
 * arriving after the card has opened.
 */
function rise(n: number): CSSProperties {
  return { "--dropup-i": Math.min(n, 6) * 1.6 } as CSSProperties;
}
