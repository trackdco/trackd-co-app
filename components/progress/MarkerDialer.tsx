"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { EntryMarker, MarkerCatalogueItem } from "@/lib/progress/journal";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * A marker's word values as a single-select scale with a sliding amber thumb —
 * the amber highlight glides from the old pick to the new one. Amber marks the
 * CURRENT SELECTION (an active-state accent, uniform for any word picked), never a
 * verdict on the value. The thumb is positioned by measuring the chosen pill, so
 * variable-width words line up exactly.
 */
function WordScale({
  words,
  selectedIndex,
  onPick,
}: {
  words: string[];
  /** 0-based index of the chosen word, or null. */
  selectedIndex: number | null;
  /** Reports the 1-based tier value. */
  onPick: (tierValue: number) => void;
}) {
  const pillRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const firstRef = useRef(true);

  useIsoLayoutEffect(() => {
    const thumb = thumbRef.current;
    if (!thumb) return;
    if (selectedIndex == null) {
      thumb.style.opacity = "0";
      firstRef.current = true; // re-select without sliding from the old spot
      return;
    }
    const el = pillRefs.current[selectedIndex];
    if (!el) return;
    const place = () => {
      thumb.style.opacity = "1";
      thumb.style.left = `${el.offsetLeft}px`;
      thumb.style.width = `${el.offsetWidth}px`;
    };
    if (firstRef.current) {
      const prev = thumb.style.transition;
      thumb.style.transition = "none";
      place();
      requestAnimationFrame(() => {
        if (thumbRef.current) thumbRef.current.style.transition = prev;
      });
      firstRef.current = false;
    } else {
      place();
    }
  }, [selectedIndex, words]);

  return (
    <div className="relative flex gap-1.5 overflow-x-auto pb-px">
      <span
        ref={thumbRef}
        aria-hidden
        style={{ left: 0, width: 0 }}
        className="pointer-events-none absolute top-0 bottom-0 rounded-full bg-accent-amber opacity-0 transition-[left,width,opacity] duration-300 ease-out"
      />
      {words.map((w, i) => {
        const sel = selectedIndex === i;
        return (
          <button
            key={w}
            ref={(el) => {
              pillRefs.current[i] = el;
            }}
            type="button"
            onClick={() => onPick(i + 1)}
            aria-pressed={sel}
            className={cn(
              "relative z-10 shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors duration-300 active:scale-95",
              sel
                ? "border-transparent font-medium text-bg-base"
                : "border-border-default text-text-muted hover:text-foreground",
            )}
          >
            {w}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The marker dialer (Step 5, revised). Nothing is forced or pre-listed — you add
 * the markers you care about from a single "Add marker" dropdown (every marker,
 * common ones first), so the sheet never overloads. Each added marker becomes a
 * compact card where you pick ONE word value. Words, never numbers; single-select
 * (tap the chosen word again to clear). Presented NEUTRALLY — no colour by
 * polarity/severity, no amber: markers are categorical, never a verdict. Users
 * can't create markers; this only switches on existing catalogue ones.
 */
export function MarkerDialer({
  catalogue,
  initial,
  onChange,
}: {
  catalogue: MarkerCatalogueItem[];
  initial: EntryMarker[];
  onChange: (markers: { markerId: string; tierValue: number }[]) => void;
}) {
  const byId = useMemo(
    () => new Map(catalogue.map((m) => [m.id, m])),
    [catalogue],
  );
  const presets = useMemo(
    () => catalogue.filter((m) => m.isDefault).sort((a, b) => a.name.localeCompare(b.name)),
    [catalogue],
  );
  const optional = useMemo(
    () => catalogue.filter((m) => !m.isDefault).sort((a, b) => a.name.localeCompare(b.name)),
    [catalogue],
  );

  // The markers currently shown, in the order added.
  const [order, setOrder] = useState<string[]>(() => initial.map((m) => m.markerId));
  const [selected, setSelected] = useState<Map<string, number>>(
    () => new Map(initial.map((m) => [m.markerId, m.tierValue])),
  );
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");

  function emit(next: Map<string, number>) {
    onChange([...next.entries()].map(([markerId, tierValue]) => ({ markerId, tierValue })));
  }

  function pick(markerId: string, tierValue: number) {
    const next = new Map(selected);
    if (next.get(markerId) === tierValue) next.delete(markerId);
    else next.set(markerId, tierValue);
    setSelected(next);
    emit(next);
  }

  function addMarker(id: string) {
    setOrder((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function removeMarker(id: string) {
    setOrder((prev) => prev.filter((x) => x !== id));
    if (selected.has(id)) {
      const next = new Map(selected);
      next.delete(id);
      setSelected(next);
      emit(next);
    }
  }

  const shownSet = new Set(order);
  const q = query.trim().toLowerCase();
  const match = (m: MarkerCatalogueItem) =>
    !shownSet.has(m.id) && (q === "" || m.name.toLowerCase().includes(q));
  const addablePresets = presets.filter(match);
  const addableOptional = optional.filter(match);
  const nothingLeft =
    presets.filter((m) => !shownSet.has(m.id)).length === 0 &&
    optional.filter((m) => !shownSet.has(m.id)).length === 0;

  function toggleAdd() {
    setAddOpen((o) => !o);
    setQuery("");
  }

  return (
    <div className="space-y-3">
      {order.map((id) => {
        const m = byId.get(id);
        if (!m) return null;
        const chosen = selected.get(id);
        return (
          <div key={id} className="animate-shortcut-in rounded-xl bg-bg-surface-raised p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{m.name}</span>
              <button
                type="button"
                onClick={() => removeMarker(id)}
                aria-label={`Remove ${m.name}`}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-subtle transition-colors hover:text-text-muted"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            <div className="mt-2.5">
              <WordScale
                words={m.tierLabels}
                selectedIndex={chosen ? chosen - 1 : null}
                onPick={(tv) => pick(id, tv)}
              />
            </div>
          </div>
        );
      })}

      {/* Add marker — a single dropdown over every marker, common ones first. */}
      {!nothingLeft && (
        <div>
          <button
            type="button"
            onClick={toggleAdd}
            aria-expanded={addOpen}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-dashed border-border-strong bg-bg-input/40 px-4 py-3 text-sm text-text-muted transition-colors hover:bg-bg-input/70 hover:text-foreground"
          >
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" aria-hidden />
              {order.length === 0 ? "Add a marker to track" : "Add another marker"}
            </span>
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", addOpen && "rotate-180")}
              aria-hidden
            />
          </button>

          {addOpen && (
            <div className="animate-shortcut-in mt-2 rounded-xl border border-border-default bg-bg-surface-raised p-2">
              {/* Search — every marker is one tap away, without overload. */}
              <div className="relative mb-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted"
                  aria-hidden
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search markers"
                  aria-label="Search markers"
                  className="h-10 w-full rounded-lg border border-border-default bg-bg-input pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-text-muted focus-visible:border-border-strong"
                />
              </div>

              <div className="max-h-56 overflow-y-auto">
                {addablePresets.length > 0 && (
                  <>
                    <p className="px-2 pt-1 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-text-subtle">
                      Common
                    </p>
                    <div className="flex flex-wrap gap-1.5 px-1 pb-2">
                      {addablePresets.map((m) => (
                        <AddChip key={m.id} label={m.name} onClick={() => addMarker(m.id)} />
                      ))}
                    </div>
                  </>
                )}
                {addableOptional.length > 0 && (
                  <>
                    <p className="px-2 pt-1 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-text-subtle">
                      More
                    </p>
                    <div className="flex flex-wrap gap-1.5 px-1 pb-1">
                      {addableOptional.map((m) => (
                        <AddChip key={m.id} label={m.name} onClick={() => addMarker(m.id)} />
                      ))}
                    </div>
                  </>
                )}
                {addablePresets.length === 0 && addableOptional.length === 0 && (
                  <p className="px-2 py-3 text-sm text-text-muted">
                    No marker matches “{query.trim()}”.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-border-default px-3 py-1.5 text-sm text-text-muted transition-colors hover:border-border-strong hover:text-foreground"
    >
      {label}
    </button>
  );
}
