"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  CaretLeft,
  CircleNotch,
  ClockCounterClockwise,
  MagnifyingGlass,
  Plus,
  X,
} from "@/components/icons";

import { cn } from "@/lib/utils";
import {
  CARD_EYEBROW,
  EDIT_TOGGLE,
  GHOST_BUTTON,
  PRESS,
  PRIMARY_BUTTON,
  ROWS,
} from "@/lib/ui-presets";
import { dismissToast, getToast, showToast, TOAST_MS } from "@/lib/toast";
import {
  customMarkerUserMarkerId,
  type EntryMarker,
  type MarkerOption,
} from "@/lib/progress/journal";
import {
  OWN_WORD_SLOTS,
  READY_SCALES,
  addableMarkers,
  asksBetterEnd,
  exactNameMatch,
  lastUsedToAdd,
  markerNamed,
  pickerSections,
  polarityFor,
  scaleWords,
  searchMarkers,
  searchPlaceholder,
  titleCaseMarkerName,
  type BetterEnd,
  type ScaleKey,
} from "@/lib/progress/markerPick";
import {
  createCustomMarker,
  removeCustomMarker,
} from "@/app/(app)/progress/actions";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const NO_IDS: string[] = [];

/** New rows arrive one after another (build-brief-final §3.5): 60ms apart, 320ms each. */
const ROW_STAGGER_MS = 60;

/**
 * The dialer's own motion. Hoisted into <head> once by React (`href` dedupes it).
 * Rows rise 6px as they fade in; under reduced motion they only fade.
 */
const MOTION_CSS = `
@keyframes md-rise { from { opacity: 0; transform: translateY(6px); } }
@keyframes md-fade { from { opacity: 0; } }
@keyframes md-word { from { opacity: 0.3; transform: translateY(4px); } }
@keyframes md-from-right { from { opacity: 0; transform: translateX(14px); } }
@keyframes md-from-left { from { opacity: 0; transform: translateX(-14px); } }
.md-row-in { animation: md-rise 320ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.md-bar-in { animation: md-rise 260ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.md-word-in { animation: md-word 200ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.md-swap-fwd { animation: md-from-right 240ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.md-swap-back { animation: md-from-left 240ms cubic-bezier(0.22, 1, 0.36, 1) both; }
@media (prefers-reduced-motion: reduce) {
  .md-row-in, .md-bar-in, .md-swap-fwd, .md-swap-back { animation: md-fade 200ms ease-out both; }
  .md-word-in { animation: none; }
}
`;

/**
 * A marker's word values as a single-select scale with a sliding WHITE thumb —
 * the highlight glides from the old pick to the new one. White marks the CURRENT
 * SELECTION (the active-state accent for a control, per ui-context — never amber,
 * which is reserved for the due/live beat, and never a verdict on the value). The
 * thumb is positioned by measuring the chosen pill, so variable-width words line up
 * exactly.
 *
 * Tap a word, or drag along the words (build-brief-final §3.5): a sideways drag
 * walks the thumb word to word; a vertical one still scrolls the page. When the
 * words overflow, the chosen word and its neighbours are kept in view, so a drag
 * can reach every word.
 */
function WordScale({
  words,
  selectedIndex,
  onPick,
}: {
  words: string[];
  /** 0-based index of the chosen word, or null. */
  selectedIndex: number | null;
  /** Reports the 1-based tier value, and whether a tap or a drag chose it. */
  onPick: (tierValue: number, how: "tap" | "drag") => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const pillRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const firstRef = useRef(true);
  const revealedRef = useRef(false);
  const dragRef = useRef<{
    id: number;
    x: number;
    y: number;
    engaged: boolean;
    last: number | null;
  } | null>(null);
  const swallowClickUntil = useRef(0);

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

  // Keep the chosen word and its neighbours in view when the words overflow.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || selectedIndex == null) return;
    const instant = !revealedRef.current;
    revealedRef.current = true;
    if (rail.scrollWidth <= rail.clientWidth + 1) return;
    const pills = pillRefs.current;
    const sel = pills[selectedIndex];
    const lo = pills[Math.max(0, selectedIndex - 1)];
    const hi = pills[Math.min(words.length - 1, selectedIndex + 1)];
    if (!sel || !lo || !hi) return;
    let start = lo.offsetLeft;
    let end = hi.offsetLeft + hi.offsetWidth;
    if (end - start > rail.clientWidth) {
      start = sel.offsetLeft;
      end = sel.offsetLeft + sel.offsetWidth;
    }
    let left = rail.scrollLeft;
    if (start < left) left = start;
    else if (end > left + rail.clientWidth) left = end - rail.clientWidth;
    if (left === rail.scrollLeft) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollTo({ left, behavior: instant || reduce ? "auto" : "smooth" });
  }, [selectedIndex, words]);

  /** The word under (or nearest to) a pointer's x. */
  function indexAt(clientX: number): number {
    let best = -1;
    let bestGap = Infinity;
    pillRefs.current.forEach((el, i) => {
      if (!el || i >= words.length) return;
      const r = el.getBoundingClientRect();
      const gap = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    });
    return best;
  }

  function endDrag() {
    if (dragRef.current?.engaged) swallowClickUntil.current = performance.now() + 350;
    dragRef.current = null;
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    if (e.pointerType === "mouse" && (e.buttons & 1) === 0) {
      dragRef.current = null;
      return;
    }
    if (!d.engaged) {
      const dx = Math.abs(e.clientX - d.x);
      const dy = Math.abs(e.clientY - d.y);
      if (dy > 10 && dy > dx) {
        dragRef.current = null; // a scroll, not a drag
        return;
      }
      if (dx < 6 || dx < dy) return;
      d.engaged = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // The pointer is already gone; the drag simply ends with it.
      }
    }
    const i = indexAt(e.clientX);
    if (i >= 0 && i !== d.last) {
      d.last = i;
      onPick(i + 1, "drag");
    }
  }

  return (
    <div
      ref={railRef}
      className="relative flex touch-pan-y gap-1.5 overflow-x-auto pb-px"
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        dragRef.current = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          engaged: false,
          last: selectedIndex,
        };
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={(e) => {
        // Capture moving from a pill to the rail bubbles here too: only the rail losing it ends a drag.
        if (e.target === e.currentTarget) endDrag();
      }}
      onClickCapture={(e) => {
        // The click that ends a drag is not a tap: it must not clear the word.
        if (performance.now() < swallowClickUntil.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <span
        ref={thumbRef}
        aria-hidden
        style={{ left: 0, width: 0 }}
        className="pointer-events-none absolute top-0 bottom-0 rounded-full bg-accent-primary opacity-0 transition-[left,width,opacity] duration-300 ease-out"
      />
      {words.map((w, i) => {
        const sel = selectedIndex === i;
        return (
          <button
            key={`${w}-${i}`}
            ref={(el) => {
              pillRefs.current[i] = el;
            }}
            type="button"
            onClick={() => onPick(i + 1, "tap")}
            aria-pressed={sel}
            className={cn(
              PRESS.pill,
              "relative z-10 shrink-0 rounded-lg border px-3 py-1.5 text-sm transition-colors duration-300",
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
 * THE MARKER DIALER (build-brief-final §3.5). The markers on the entry are rows:
 * the name, the chosen word ("Not rated" until you pick one), the word scale to
 * rate on, and a faint × that takes it off the entry (with Undo, no confirm).
 * Below them, "Add more markers" opens the picker and "Use my last" brings back
 * the previous entry's markers.
 *
 * The picker: search, then Suggested (the same for everyone), Yours (your own
 * markers, with Edit to remove one) and All. Tick as many as you like; a ticked
 * chip turns white and the picker stays open; "Add N" adds them all as rows,
 * which arrive one after another. "Create your own" sits at its foot, and a new
 * marker lands ticked under Yours.
 *
 * Words, never numbers; single-select (tap the chosen word again to clear).
 * Presented NEUTRALLY: no colour by polarity or severity, no amber as a verdict.
 * A marker this person cannot add (`addable: false`) is absent from every add
 * path, never greyed.
 */
export function MarkerDialer({
  options,
  initial,
  onChange,
  lastUsed = NO_IDS,
}: {
  options: MarkerOption[];
  initial: EntryMarker[];
  onChange: (markers: { markerId: string; tierValue: number }[]) => void;
  /** Marker ids on the previous journal entry, for "Use my last". Hidden when empty. */
  lastUsed?: string[];
}) {
  const router = useRouter();

  // Custom markers created this session appear immediately (before the server
  // round-trip refreshes `options`); removed ones hide immediately.
  const [extra, setExtra] = useState<MarkerOption[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());

  const allOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: MarkerOption[] = [];
    for (const o of [...options, ...extra]) {
      if (removedIds.has(o.id) || seen.has(o.id)) continue;
      seen.add(o.id);
      out.push(o);
    }
    return out;
  }, [options, extra, removedIds]);

  const byId = useMemo(
    () => new Map(allOptions.map((m) => [m.id, m])),
    [allOptions],
  );

  // The markers on the entry, in the order added, and their chosen words.
  const [order, setOrder] = useState<string[]>(() => initial.map((m) => m.markerId));
  const [selected, setSelected] = useState<Map<string, number>>(
    () => new Map(initial.map((m) => [m.markerId, m.tierValue])),
  );
  // The latest ratings for handlers that run later (a drag, an Undo).
  const selectedRef = useRef(selected);
  const onChangeRef = useRef(onChange);
  useIsoLayoutEffect(() => {
    onChangeRef.current = onChange;
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [editYours, setEditYours] = useState(false);
  const [creating, setCreating] = useState<{ name: string } | null>(null);
  const [swap, setSwap] = useState<"fwd" | "back" | null>(null);
  /** Rows that arrived in this session, and their stagger delay (ms). */
  const [arrive, setArrive] = useState<Map<string, number>>(() => new Map());
  /** Bumps each time a row's word changes, so the word eases in. */
  const [bumps, setBumps] = useState<Record<string, number>>({});

  const rootRef = useRef<HTMLDivElement>(null);
  const focusRowRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  /** Custom markers removed under Yours, held for the Undo window before the server hears. */
  const pendingRemovals = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Toasts this dialer raised, so closing it can take its Undo away with it. */
  const ourToasts = useRef(new Set<number>());

  useEffect(() => {
    mountedRef.current = true;
    const pending = pendingRemovals.current;
    const toasts = ourToasts.current;
    return () => {
      mountedRef.current = false;
      // An Undo for a dialer that has gone would do nothing: take it away.
      const t = getToast();
      if (t && toasts.has(t.id)) dismissToast();
      // A removal still in its Undo window goes through now.
      if (pending.size > 0) {
        const ids = [...pending.keys()];
        pending.forEach((timer) => clearTimeout(timer));
        pending.clear();
        void Promise.all(
          ids.map((id) => removeCustomMarker(customMarkerUserMarkerId(id))),
        ).then(() => router.refresh());
      }
    };
  }, [router]);

  // After "Add N" or "Use my last", focus lands on the first new row.
  useEffect(() => {
    const id = focusRowRef.current;
    if (!id) return;
    focusRowRef.current = null;
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-marker-row="${CSS.escape(id)}"] [aria-pressed]`)
      ?.focus();
  });

  function commit(next: Map<string, number>) {
    selectedRef.current = next;
    setSelected(next);
    onChangeRef.current(
      [...next.entries()].map(([markerId, tierValue]) => ({ markerId, tierValue })),
    );
  }

  function toastWithUndo(text: string, undo: () => void) {
    showToast(text, { undo });
    const t = getToast();
    if (t) ourToasts.current.add(t.id);
  }

  function pick(markerId: string, tierValue: number, how: "tap" | "drag") {
    const cur = selectedRef.current;
    const next = new Map(cur);
    if (cur.get(markerId) === tierValue) {
      if (how === "drag") return;
      next.delete(markerId);
    } else {
      next.set(markerId, tierValue);
    }
    commit(next);
    setBumps((b) => ({ ...b, [markerId]: (b[markerId] ?? 0) + 1 }));
  }

  // ---- the picker's working set -------------------------------------------
  const sections = useMemo(() => pickerSections(allOptions, order), [allOptions, order]);
  const remaining = sections.suggested.length + sections.yours.length + sections.all.length;
  const addableIds = useMemo(
    () => new Set(addableMarkers(allOptions, order).map((m) => m.id)),
    [allOptions, order],
  );
  const lastToAdd = useMemo(
    () => lastUsedToAdd(lastUsed, allOptions, order),
    [lastUsed, allOptions, order],
  );
  const q = query.trim();
  const results = useMemo(() => searchMarkers(allOptions, order, q), [allOptions, order, q]);
  const pickedNow = picked.filter((id) => addableIds.has(id));
  const editingYours = editYours && sections.yours.length > 0;

  const rows = order
    .map((id) => byId.get(id))
    .filter((m): m is MarkerOption => m !== undefined);
  // Ticks not yet added keep the picker open (an Undo can bring a row back mid-pick).
  const showPicker = rows.length === 0 || pickerOpen || pickedNow.length > 0;

  // ---- actions --------------------------------------------------------------
  function addRows(ids: string[]) {
    const fresh = ids.filter((id) => !order.includes(id));
    if (fresh.length === 0) return;
    setOrder((prev) => [...prev, ...fresh.filter((id) => !prev.includes(id))]);
    setArrive((prev) => {
      const next = new Map(prev);
      fresh.forEach((id, i) => next.set(id, i * ROW_STAGGER_MS));
      return next;
    });
    focusRowRef.current = fresh[0];
  }

  function resetPicker() {
    setPicked([]);
    setQuery("");
    setEditYours(false);
    setSwap(null);
  }

  function togglePicker() {
    setPickerOpen(!showPicker);
    resetPicker();
  }

  function addPicked() {
    addRows(pickedNow);
    setPickerOpen(false);
    resetPicker();
  }

  function addLast() {
    addRows(lastToAdd);
    setPickerOpen(false);
    resetPicker();
  }

  function toggleChip(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  /** × on a row: off the entry at once, with Undo. No confirm. */
  function removeRow(id: string) {
    const name = byId.get(id)?.name ?? "Marker";
    const at = order.indexOf(id);
    const tier = selectedRef.current.get(id);
    setOrder((prev) => prev.filter((x) => x !== id));
    if (tier !== undefined) {
      const next = new Map(selectedRef.current);
      next.delete(id);
      commit(next);
    }
    toastWithUndo(`${name} removed`, () => {
      if (!mountedRef.current) return;
      setOrder((prev) =>
        prev.includes(id) ? prev : [...prev.slice(0, at), id, ...prev.slice(at)],
      );
      setArrive((prev) => new Map(prev).set(id, 0));
      if (tier !== undefined && !selectedRef.current.has(id)) {
        const next = new Map(selectedRef.current);
        next.set(id, tier);
        commit(next);
      }
    });
  }

  function unhide(id: string) {
    setRemovedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  /**
   * Soft-remove one of your own markers (Yours → Edit → ×). It hides at once and
   * the server hears only once the Undo window has passed, since a removal
   * cannot be taken back once it is sent. History is kept either way.
   */
  function removeYours(m: MarkerOption) {
    setRemovedIds((prev) => new Set(prev).add(m.id));
    setPicked((p) => p.filter((x) => x !== m.id));
    const timer = setTimeout(() => void commitRemoval(m), TOAST_MS.undo + 150);
    pendingRemovals.current.set(m.id, timer);
    toastWithUndo(`${m.name} removed`, () => {
      const t = pendingRemovals.current.get(m.id);
      if (t === undefined) return;
      clearTimeout(t);
      pendingRemovals.current.delete(m.id);
      if (mountedRef.current) unhide(m.id);
    });
  }

  async function commitRemoval(m: MarkerOption) {
    if (!pendingRemovals.current.delete(m.id)) return;
    const res = await removeCustomMarker(customMarkerUserMarkerId(m.id));
    if (!res.ok) {
      // The server still has it: show it again so the picker matches reality.
      if (mountedRef.current) unhide(m.id);
      showToast(`Couldn’t remove ${m.name}`);
      return;
    }
    router.refresh();
  }

  function openCreate(name: string) {
    setCreating({ name });
    setSwap("fwd");
    setEditYours(false);
  }

  function closeCreate() {
    setCreating(null);
    setSwap("back");
  }

  /** A new marker lands ticked under Yours, with the picker open. */
  function onCreated(marker: MarkerOption) {
    setExtra((prev) => [...prev, marker]);
    setPicked((p) => (p.includes(marker.id) ? p : [...p, marker.id]));
    setCreating(null);
    setSwap("back");
    setQuery("");
    setEditYours(false);
    setPickerOpen(true);
    router.refresh();
  }

  // ---- render ---------------------------------------------------------------
  const motion = (
    <style href="trakabl-marker-dialer-motion" precedence="default">
      {MOTION_CSS}
    </style>
  );

  if (creating) {
    return (
      <div ref={rootRef}>
        {motion}
        <div className="md-swap-fwd">
          <CreateMarkerCard
            initialName={creating.name}
            options={allOptions}
            onCancel={closeCreate}
            onCreated={onCreated}
          />
        </div>
      </div>
    );
  }

  const chip = (m: MarkerOption) => (
    <PickChip
      key={m.id}
      label={m.name}
      on={picked.includes(m.id)}
      onClick={() => toggleChip(m.id)}
    />
  );

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      {motion}

      {rows.length > 0 && (
        <div className={ROWS}>
          {rows.map((m) => {
            const id = m.id;
            const chosen = selected.get(id);
            const word = chosen ? m.tierLabels[chosen - 1] : undefined;
            const delay = arrive.get(id);
            const bump = bumps[id] ?? 0;
            return (
              <div
                key={id}
                data-marker-row={id}
                className={cn("px-3.5 pt-2.5 pb-3", delay !== undefined && "md-row-in")}
                style={delay ? { animationDelay: `${delay}ms` } : undefined}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                    {m.name}
                    {m.kind === "custom" && (
                      <span className="ml-1.5 text-[11px] text-text-muted">Yours</span>
                    )}
                  </span>
                  <span
                    key={bump}
                    className={cn(
                      "shrink-0 text-[13px]",
                      word ? "text-foreground" : "text-text-muted",
                      bump > 0 && "md-word-in",
                    )}
                  >
                    {word ?? "Not rated"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(id)}
                    aria-label={`Remove ${m.name}`}
                    className={cn(
                      PRESS.icon,
                      "-my-2 -mr-2.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:text-foreground",
                    )}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
                <div className="mt-2">
                  <WordScale
                    words={m.tierLabels}
                    selectedIndex={chosen ? chosen - 1 : null}
                    onPick={(tv, how) => pick(id, tv, how)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rows.length > 0 && (
        <div className="-my-1 flex flex-wrap items-center gap-x-5">
          <LinkButton onClick={togglePicker} expanded={showPicker}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add more markers
          </LinkButton>
          {lastToAdd.length > 0 && (
            <LinkButton onClick={addLast}>
              <ClockCounterClockwise className="h-3.5 w-3.5" aria-hidden />
              Use my last
            </LinkButton>
          )}
        </div>
      )}

      {showPicker && (
        <div className={cn(swap === "back" && "md-swap-back")}>
          {rows.length === 0 && lastToAdd.length > 0 && (
            <button
              type="button"
              onClick={addLast}
              className={cn(GHOST_BUTTON, "mb-3 w-full py-2.5 text-[13px]")}
            >
              <ClockCounterClockwise className="h-4 w-4" aria-hidden />
              Use my last
              <span className="font-mono text-[11px] text-text-muted">{lastToAdd.length}</span>
            </button>
          )}

          <div className="relative">
            <MagnifyingGlass
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder(remaining)}
              aria-label="Search markers"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="inset-focus h-11 w-full rounded-xl bg-bg-input pr-10 pl-9 text-[13px] text-foreground outline-none placeholder:text-text-muted"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className={cn(
                  PRESS.icon,
                  "absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-text-muted hover:text-foreground",
                )}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>

          {q ? (
            <div className="mt-3">
              {results.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">{results.map(chip)}</div>
              ) : (
                <p className="text-[13px] text-text-muted">No marker matches “{q}”.</p>
              )}
              {!exactNameMatch(allOptions, q) && (
                <CreateButton onClick={() => openCreate(q)}>
                  Create “{titleCaseMarkerName(q)}”
                </CreateButton>
              )}
            </div>
          ) : (
            <div className="mt-3.5">
              <div className="space-y-4">
                {sections.suggested.length > 0 && (
                  <PickSection title="Suggested">{sections.suggested.map(chip)}</PickSection>
                )}
                {sections.yours.length > 0 && (
                  <PickSection
                    title="Yours"
                    action={
                      <button
                        type="button"
                        onClick={() => setEditYours((v) => !v)}
                        aria-pressed={editingYours}
                        className={EDIT_TOGGLE}
                      >
                        {editingYours ? "Done" : "Edit"}
                      </button>
                    }
                  >
                    {editingYours
                      ? sections.yours.map((m) => (
                          <RemoveChip key={m.id} label={m.name} onClick={() => removeYours(m)} />
                        ))
                      : sections.yours.map(chip)}
                  </PickSection>
                )}
                {sections.all.length > 0 && (
                  <PickSection title="All">{sections.all.map(chip)}</PickSection>
                )}
                {remaining === 0 && (
                  <p className="text-[13px] text-text-muted">Every marker is on the entry.</p>
                )}
              </div>
              <CreateButton onClick={() => openCreate("")}>Create your own</CreateButton>
            </div>
          )}

          {pickedNow.length > 0 && (
            <div className="md-bar-in sticky bottom-2 z-10 mt-4">
              <button type="button" onClick={addPicked} className={cn(PRIMARY_BUTTON, "w-full")}>
                Add {pickedNow.length}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A quiet text link under the rows ("Add more markers", "Use my last"). */
function LinkButton({
  onClick,
  expanded,
  children,
}: {
  onClick: () => void;
  expanded?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={cn(
        PRESS.text,
        "flex min-h-11 items-center gap-1.5 text-[13px] text-text-muted transition-colors hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** A picker section: its eyebrow (and an action at right), then its chips. */
function PickSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex min-h-5 items-center justify-between gap-2">
        <h3 className={CARD_EYEBROW}>{title}</h3>
        {action}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
    </section>
  );
}

/** A plus before an unticked chip; a tick (drawn in) before a ticked one. Same size, so ticking never reflows the chips. */
function ChipGlyph({ on }: { on: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      aria-hidden
      className={cn("shrink-0", on && "tick-draw")}
    >
      {on ? (
        <path
          d="M2.5 6.3l2.4 2.4 4.6-5"
          pathLength={1}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M6 2.5v7M2.5 6h7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** A marker you can tick. Ticked, it turns white (the Instrument thumb look). */
function PickChip({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        PRESS.pill,
        "inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors duration-200",
        on
          ? "bg-text-primary text-bg-base"
          : "bg-bg-surface-raised text-text-muted hover:text-foreground",
      )}
    >
      <ChipGlyph on={on} />
      {label}
    </button>
  );
}

/** One of your own markers while Yours is being edited: tap to remove it. */
function RemoveChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Remove ${label}`}
      className={cn(
        PRESS.pill,
        "inline-flex min-h-9 items-center gap-1.5 rounded-md bg-bg-surface-raised px-2.5 text-[13px] text-text-muted shadow-[inset_0_0_0_1px_var(--border-strong)] transition-colors hover:text-foreground",
      )}
    >
      {label}
      <X className="h-3 w-3" aria-hidden />
    </button>
  );
}

/** The picker's foot: "Create your own", or "Create “…”" from a search. */
function CreateButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        PRESS.pill,
        "mt-4 inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-md px-3 text-[13px] text-foreground shadow-[inset_0_0_0_1px_var(--border-strong)]",
      )}
    >
      <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{children}</span>
    </button>
  );
}

/** A single choice in the create card (its steps, which end is better). */
function OptionCard({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        PRESS.card,
        "block w-full rounded-xl bg-bg-surface-raised px-3 py-2.5 text-left text-[13px] text-foreground transition-shadow duration-200",
        on && "shadow-[inset_0_0_0_1.5px_var(--text-primary)]",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Create your own marker (build-brief-final §3.5): name it, pick its steps
 * (ready-made or your own words), and, only for Level and your own words, say
 * which end is better. The name is title-cased. Which end is better orients
 * future charts only: it is NEVER rendered as a good/bad colour (architecture
 * Invariant 3).
 */
function CreateMarkerCard({
  initialName,
  options,
  onCancel,
  onCreated,
}: {
  initialName: string;
  options: MarkerOption[];
  onCancel: () => void;
  onCreated: (marker: MarkerOption) => void;
}) {
  const nameId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<0 | 1 | -1>(0);
  const [name, setName] = useState(initialName);
  const [scale, setScale] = useState<ScaleKey>("severity");
  const [own, setOwn] = useState<string[]>(() => Array<string>(OWN_WORD_SLOTS).fill(""));
  const [better, setBetter] = useState<BetterEnd | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const asks = asksBetterEnd(scale);
  const steps = asks ? 3 : 2;
  const words = scaleWords(scale, own);
  const lo = words[0] ?? "Low";
  const hi = words[words.length - 1] ?? "High";

  useEffect(() => {
    if (step === 0) nameRef.current?.focus({ preventScroll: true });
  }, [step]);

  function go(to: number) {
    setError(null);
    setDir(to > step ? 1 : -1);
    setStep(to);
  }

  function back() {
    if (step === 0) onCancel();
    else go(step - 1);
  }

  function chooseScale(next: ScaleKey) {
    setScale(next);
    setBetter(null);
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await createCustomMarker({
      name: titleCaseMarkerName(name),
      labels: words,
      polarity: polarityFor(scale, better ?? "neither"),
    });
    setBusy(false);
    if (res.ok && res.marker) onCreated(res.marker);
    else setError(res.error ?? "Couldn’t save that marker.");
  }

  function primary() {
    if (busy) return;
    if (step === 0) {
      const n = titleCaseMarkerName(name);
      if (!n) {
        setError("Give it a name.");
        nameRef.current?.focus();
        return;
      }
      const taken = markerNamed(options, n);
      if (taken) {
        setError(`${taken.name} is already a marker.`);
        return;
      }
      go(1);
      return;
    }
    if (step === 1) {
      if (scale === "own" && words.length < 2) {
        setError("Add at least two words.");
        return;
      }
      if (asks) {
        go(2);
        return;
      }
    }
    if (step === 2 && better === null) return;
    void save();
  }

  const last = step === steps - 1;

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={back}
          className={cn(
            PRESS.text,
            "-my-2 flex min-h-11 w-16 items-center gap-1 text-[13px] text-text-muted transition-colors hover:text-foreground",
          )}
        >
          {step === 0 ? (
            "Cancel"
          ) : (
            <>
              <CaretLeft className="h-3.5 w-3.5" aria-hidden />
              Back
            </>
          )}
        </button>
        <span className="text-[13px] text-foreground">New marker</span>
        <span className="w-16" aria-hidden />
      </div>

      <div className="mt-2 flex gap-1.5" aria-hidden>
        {Array.from({ length: steps }, (_, i) => (
          <i
            key={i}
            className={cn(
              "block h-[3px] flex-1 rounded-full transition-colors duration-300",
              i <= step ? "bg-text-primary" : "bg-bg-surface-raised",
            )}
          />
        ))}
      </div>

      <form
        key={step}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          primary();
        }}
        className={cn("mt-4", dir === 1 && "md-swap-fwd", dir === -1 && "md-swap-back")}
      >
        {step === 0 && (
          <>
            <label htmlFor={nameId} className="block text-[15px] font-light text-foreground">
              Name it
            </label>
            <input
              id={nameId}
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Neck pain"
              maxLength={40}
              autoComplete="off"
              enterKeyHint="next"
              className="inset-focus mt-2.5 h-11 w-full rounded-xl bg-bg-input px-3 text-[13.5px] text-foreground outline-none placeholder:text-text-muted"
            />
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-[15px] font-light text-foreground">Pick its steps</p>
            <div role="radiogroup" aria-label="Steps" className="mt-2.5 flex flex-col gap-1.5">
              {READY_SCALES.map((s) => (
                <OptionCard key={s.key} on={scale === s.key} onClick={() => chooseScale(s.key)}>
                  {s.words.join(" · ")}
                </OptionCard>
              ))}
              <OptionCard on={scale === "own"} onClick={() => chooseScale("own")}>
                Your own words
              </OptionCard>
            </div>
            {scale === "own" && (
              <div className="mt-3">
                <p className="mb-1.5 text-[12px] text-text-muted">Low to high</p>
                <div className="grid grid-cols-5 gap-1">
                  {own.map((w, i) => (
                    <input
                      key={i}
                      value={w}
                      onChange={(e) =>
                        setOwn((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                      }
                      placeholder={String(i + 1)}
                      aria-label={`Word ${i + 1}, low to high`}
                      maxLength={24}
                      autoComplete="off"
                      className="inset-focus h-10 min-w-0 rounded-lg bg-bg-input px-1 text-center text-[12px] text-foreground outline-none placeholder:text-text-muted"
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-[15px] font-light text-foreground">Which end is better?</p>
            <div
              role="radiogroup"
              aria-label="Which end is better"
              className="mt-2.5 flex flex-col gap-1.5"
            >
              <OptionCard on={better === "low"} onClick={() => setBetter("low")}>
                “{lo}” is better
              </OptionCard>
              <OptionCard on={better === "high"} onClick={() => setBetter("high")}>
                “{hi}” is better
              </OptionCard>
              <OptionCard on={better === "neither"} onClick={() => setBetter("neither")}>
                Neither
              </OptionCard>
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="mt-2.5 text-[12.5px] text-state-error">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || (step === 2 && better === null)}
          className={cn(PRIMARY_BUTTON, "mt-4 w-full")}
        >
          {busy && <CircleNotch className="h-4 w-4 animate-spin" aria-hidden />}
          {busy ? "Saving…" : last ? "Save marker" : "Next"}
        </button>
      </form>
    </div>
  );
}
