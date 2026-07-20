"use client";

import { useState } from "react";
import { Plus, MagnifyingGlass } from "@/components/icons";

import { PoseIcon } from "@/components/progress/PoseIcon";
import { searchPoses } from "@/lib/progress/photos";

/**
 * Searchable pose picker (Spec 09 addendum). Start typing and the standard poses
 * autocomplete ("side ch" → Side chest) — each with its illustration — so names
 * stay consistent and comparable. If nothing matches, you can still add your typed
 * name as a custom pose. `exclude` hides poses already chosen.
 */
export function PosePicker({
  exclude = [],
  onPick,
}: {
  exclude?: string[];
  onPick: (pose: string) => void;
}) {
  const [query, setQuery] = useState("");
  const results = searchPoses(query, exclude);
  const q = query.trim();
  const exactMatch =
    q !== "" && results.some((p) => p.label.toLowerCase() === q.toLowerCase());

  return (
    <div className="rounded-xl border border-border-default bg-bg-surface-raised p-2">
      <div className="relative">
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
        {results.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p.id)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-bg-input/60"
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
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-bg-input/60"
          >
            <span className="flex h-7 w-5 shrink-0 items-center justify-center text-text-muted">
              <Plus className="h-4 w-4" aria-hidden />
            </span>
            <span className="text-sm text-foreground">
              Add “{q}” <span className="text-text-subtle">· custom</span>
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
