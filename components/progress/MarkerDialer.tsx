"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { useWriteAccess } from "@/components/billing/ReadOnlyGate";
import { AddBar } from "@/components/progress/markers/AddBar";
import { CreateMarkerCard } from "@/components/progress/markers/CreateMarkerCard";
import {
  CrossGlyph,
  PlusGlyph,
  RepeatGlyph,
  SearchGlyph,
  TickGlyph,
} from "@/components/progress/markers/glyphs";
import { MarkerRow } from "@/components/progress/markers/MarkerRow";
import {
  EASE,
  MARKERS_CSS,
  ghostOut,
  popChip,
  reducedMotion,
  useIsoLayoutEffect,
  useSideSwap,
} from "@/components/progress/markers/motion";
import {
  holdRemoval,
  noRemovedMarkers,
  removedMarkers,
  subscribeRemoved,
  undoRemoval,
} from "@/components/progress/markers/ownMarkers";
import type { EntryMarker, MarkerOption } from "@/lib/progress/journal";
import {
  addableMarkers,
  exactNameMatch,
  lastUsedToAdd,
  pickerSections,
  ratedInOrder,
  restoreRow,
  searchMarkers,
  searchPlaceholder,
  seedRows,
  titleCaseMarkerName,
  type RowRating,
} from "@/lib/progress/markerPick";
import { dismissToast, getToast, showToast } from "@/lib/toast";
import { CARD_EYEBROW, EDIT_TOGGLE, HIT_Y_30, HIT_Y_36, PRESS } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

const NO_IDS: string[] = [];

/** New rows arrive one after another: 60ms apart (markers8). */
const ROW_STAGGER_MS = 60;
/** A search shows at most this many chips (markers8). */
const MAX_HITS = 12;

/** A chip's reach: 3px round it, half the 6px gap, so neighbours never overlap. */
const CHIP_REACH = "relative before:absolute before:-inset-[3px] before:content-['']";
/** A quiet link's reach: 8px above and below, half the 16px to the row over it. */
const LINK_REACH = "relative before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']";

/**
 * THE MARKERS PANEL (Context/markers-spec.md; the final-check page's
 * `markers8.js`, `markers7.js`, `markers6.js` and `extra8.css`). Calm and
 * monochrome: the only thing that lights up is what you chose, and it goes
 * white.
 *
 * Before any are added: "Use my last" (with its count), the search, YOURS
 * (with Edit) and SUGGESTED as chips, and "Create your own". Tick as many as you
 * like: a ticked chip turns white and pops, and the white "Add N" rises in and
 * stays pinned in view. Add N adds them all as rows, which arrive one by one.
 *
 * The rows: the name and its level word, five steps (drag or tap; tap the
 * chosen step again to clear), and the x, which takes a row off with
 * "<Marker> removed" and Undo. Under them, "Add more markers" and "Use my last".
 *
 * Words, never numbers; no colour by polarity or severity. A marker this person
 * cannot add (`addable: false`) is absent from every add path, never greyed.
 *
 * The props stay as they were (HomeJournal and JournalEntrySheet render it);
 * `onRowsChange` and `onCreatingChange` are optional additions.
 */
export function MarkerDialer({
  options,
  initial,
  onChange,
  lastUsed = NO_IDS,
  onRowsChange,
  onCreatingChange,
}: {
  options: MarkerOption[];
  /** The markers on the entry to start from. A `tierValue` below 1 is a row
   *  that is on the entry but not rated yet. */
  initial: Pick<EntryMarker, "markerId" | "tierValue">[];
  /** The RATED markers, in row order, whenever a rating changes. */
  onChange: (markers: { markerId: string; tierValue: number }[]) => void;
  /** Marker ids on the previous journal entry, for "Use my last". Hidden when empty. */
  lastUsed?: string[];
  /** Every row on the entry, rated or not (`tierValue: 0` = not rated), whenever
   *  the rows change. Hand it back as `initial` to bring the rows back. */
  onRowsChange?: (rows: RowRating[]) => void;
  /** True while "Create your own" fills the panel (it has its own header row). */
  onCreatingChange?: (creating: boolean) => void;
}) {
  const router = useRouter();
  const { guard } = useWriteAccess();

  // Your own markers made here show at once, before the page's data catches up.
  const [made, setMade] = useState<MarkerOption[]>([]);
  // Your own markers removed (held for the Undo, being sent, or gone): ownMarkers.ts.
  const removed = useSyncExternalStore(subscribeRemoved, removedMarkers, noRemovedMarkers);

  /** Everything a row can show, including a removed marker still on this entry. */
  const allOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: MarkerOption[] = [];
    for (const o of [...options, ...made]) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      out.push(o);
    }
    return out;
  }, [options, made]);
  /** What can be offered: less your own markers being removed. */
  const pickable = useMemo(() => allOptions.filter((o) => !removed.has(o.id)), [allOptions, removed]);
  const byId = useMemo(() => new Map(allOptions.map((m) => [m.id, m])), [allOptions]);

  // The rows on the entry, in order, and their ratings.
  const [seed] = useState(() => seedRows(initial));
  const [order, setOrder] = useState<string[]>(seed.order);
  const [rated, setRated] = useState<Map<string, number>>(seed.rated);
  const orderRef = useRef(order);
  const ratedRef = useRef(rated);
  const onChangeRef = useRef(onChange);
  const onRowsChangeRef = useRef(onRowsChange);
  const onCreatingRef = useRef(onCreatingChange);
  useIsoLayoutEffect(() => {
    onChangeRef.current = onChange;
    onRowsChangeRef.current = onRowsChange;
    onCreatingRef.current = onCreatingChange;
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [editYours, setEditYours] = useState(false);
  const [creating, setCreating] = useState<{ name: string } | null>(null);
  /** Rows that arrived here, and their place in the one-by-one arrival (ms). */
  const [arrive, setArrive] = useState<Map<string, number>>(() => new Map());
  /** Bumps each time a row's word changes, so the word pops in. */
  const [bumps, setBumps] = useState<Record<string, number>>({});
  /** The Add bar's count, held while it leaves. */
  const [barCount, setBarCount] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const swap = useSideSwap(rootRef);
  const focusRowRef = useRef<string | null>(null);
  const flipFrom = useRef<Map<string, number> | null>(null);
  const mountedRef = useRef(false);
  /** "<Marker> removed" toasts for rows: their Undo only means something while this entry is open. */
  const rowToasts = useRef(new Set<number>());

  useEffect(() => {
    mountedRef.current = true;
    const toasts = rowToasts.current;
    return () => {
      mountedRef.current = false;
      // A row's Undo belongs to this entry's draft, which has gone with the
      // dialer (closed, saved, or another day): take it away. Removing one of
      // your OWN markers is not tied to the entry: its Undo stays, and nothing
      // is sent before the window passes (ownMarkers.ts; cold review B6).
      const t = getToast();
      if (t && toasts.has(t.id)) dismissToast();
    };
  }, []);

  // After "Add N" or "Use my last", focus lands on the first new row's steps.
  useEffect(() => {
    const id = focusRowRef.current;
    if (!id) return;
    focusRowRef.current = null;
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-marker-row="${CSS.escape(id)}"] [role="slider"]`)
      ?.focus({ preventScroll: true });
  });

  // The rows under a removed (or restored) row slide to their new place.
  useIsoLayoutEffect(() => {
    const from = flipFrom.current;
    flipFrom.current = null;
    if (!from || reducedMotion()) return;
    rootRef.current?.querySelectorAll<HTMLElement>("[data-marker-row]").forEach((el) => {
      const was = from.get(el.getAttribute("data-marker-row") ?? "");
      if (was === undefined) return;
      const d = was - el.getBoundingClientRect().top;
      if (Math.abs(d) < 0.5) return;
      el.animate([{ transform: `translateY(${d}px)` }, { transform: "none" }], { duration: 260, easing: EASE });
    });
  }, [order]);

  function captureRows() {
    const m = new Map<string, number>();
    rootRef.current?.querySelectorAll<HTMLElement>("[data-marker-row]").forEach((el) => {
      m.set(el.getAttribute("data-marker-row") ?? "", el.getBoundingClientRect().top);
    });
    flipFrom.current = m;
  }

  /** Set the rows and ratings, and tell the parent what changed. */
  function apply(nextOrder: string[], nextRated: Map<string, number>) {
    const before = ratedInOrder(orderRef.current, ratedRef.current);
    const rowsChanged =
      nextOrder.length !== orderRef.current.length || nextOrder.some((id, i) => id !== orderRef.current[i]);
    orderRef.current = nextOrder;
    ratedRef.current = nextRated;
    setOrder(nextOrder);
    setRated(nextRated);
    const after = ratedInOrder(nextOrder, nextRated);
    const ratingsChanged =
      before.length !== after.length ||
      before.some((m, i) => m.markerId !== after[i].markerId || m.tierValue !== after[i].tierValue);
    if (ratingsChanged) onChangeRef.current(after);
    if (rowsChanged || ratingsChanged) {
      onRowsChangeRef.current?.(nextOrder.map((markerId) => ({ markerId, tierValue: nextRated.get(markerId) ?? 0 })));
    }
  }

  function rate(id: string, value: number) {
    const next = new Map(ratedRef.current);
    if (value >= 1) next.set(id, value);
    else next.delete(id);
    if (next.get(id) === ratedRef.current.get(id)) return;
    apply(orderRef.current, next);
    setBumps((b) => ({ ...b, [id]: (b[id] ?? 0) + 1 }));
  }

  // ---- the picker's working set ---------------------------------------------
  const sections = useMemo(() => pickerSections(pickable, order), [pickable, order]);
  const remaining = sections.suggested.length + sections.yours.length + sections.all.length;
  const addableIds = useMemo(() => new Set(addableMarkers(pickable, order).map((m) => m.id)), [pickable, order]);
  const lastToAdd = useMemo(() => lastUsedToAdd(lastUsed, pickable, order), [lastUsed, pickable, order]);
  const q = query.trim();
  const results = useMemo(() => searchMarkers(pickable, order, q).slice(0, MAX_HITS), [pickable, order, q]);
  const pickedNow = picked.filter((id) => addableIds.has(id));
  const editingYours = editYours && sections.yours.length > 0;

  // The Add bar keeps its last count while it leaves.
  if (pickedNow.length > 0 && barCount !== pickedNow.length) setBarCount(pickedNow.length);
  const barMounted = pickedNow.length > 0 || barCount > 0;

  const rows = order.map((id) => byId.get(id)).filter((m): m is MarkerOption => m !== undefined);
  // Ticks not yet added keep the picker open.
  const showPicker = rows.length === 0 || pickerOpen || pickedNow.length > 0;

  // ---- actions ----------------------------------------------------------------
  function addRows(ids: string[]) {
    const cur = orderRef.current;
    const fresh = ids.filter((id, i) => !cur.includes(id) && ids.indexOf(id) === i);
    if (fresh.length === 0) return;
    setArrive((prev) => {
      const next = new Map(prev);
      fresh.forEach((id, i) => next.set(id, i * ROW_STAGGER_MS));
      return next;
    });
    focusRowRef.current = fresh[0];
    apply([...cur, ...fresh], ratedRef.current);
  }

  function resetPicker() {
    setPicked([]);
    setQuery("");
    setEditYours(false);
    setBarCount(0);
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

  function toggleChip(id: string, el: HTMLElement) {
    const on = picked.includes(id);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    if (!on) popChip(el);
  }

  /** The x on a row: off the entry at once, with Undo. No confirm. */
  function removeRow(id: string) {
    const name = byId.get(id)?.name ?? "Marker";
    const at = orderRef.current.indexOf(id);
    if (at < 0) return;
    const tier = ratedRef.current.get(id);
    const row = rootRef.current?.querySelector<HTMLElement>(`[data-marker-row="${CSS.escape(id)}"]`);
    if (row && rootRef.current) ghostOut(row, rootRef.current);
    captureRows();
    const nextRated = new Map(ratedRef.current);
    nextRated.delete(id);
    apply(
      orderRef.current.filter((x) => x !== id),
      nextRated,
    );
    showToast(`${name} removed`, {
      undo: () => {
        if (!mountedRef.current) return;
        captureRows();
        setArrive((prev) => new Map(prev).set(id, 0));
        const back = new Map(ratedRef.current);
        if (tier !== undefined && !back.has(id)) back.set(id, tier);
        apply(restoreRow(orderRef.current, id, at), back);
      },
    });
    const t = getToast();
    if (t) rowToasts.current.add(t.id);
  }

  /**
   * Yours, Edit, x: one of your own markers leaves the picker at once; the
   * server hears once the Undo window has passed. Its history is kept either way.
   */
  function removeYours(m: MarkerOption) {
    guard(() => {
      holdRemoval(m, () => router.refresh());
      setPicked((p) => p.filter((x) => x !== m.id));
      showToast(`${m.name} removed`, { undo: () => void undoRemoval(m.id) });
    });
  }

  function openCreate(name: string) {
    swap(1, () => {
      setCreating({ name });
      setEditYours(false);
      onCreatingRef.current?.(true);
    });
  }

  function closeCreate() {
    swap(-1, () => {
      setCreating(null);
      onCreatingRef.current?.(false);
    });
  }

  /** A new marker goes straight onto the entry as a row, and is under Yours from now on. */
  function onCreated(marker: MarkerOption) {
    setMade((prev) => (prev.some((o) => o.id === marker.id) ? prev : [...prev, marker]));
    swap(1, () => {
      setCreating(null);
      setQuery("");
      setEditYours(false);
      setPickerOpen(false);
      addRows([marker.id]);
      onCreatingRef.current?.(false);
    });
    showToast("Saved. It’s under Yours now.");
    router.refresh();
  }

  // ---- render -------------------------------------------------------------------
  const chip = (m: MarkerOption) => (
    <PickChip key={m.id} label={m.name} on={picked.includes(m.id)} onToggle={(el) => toggleChip(m.id, el)} />
  );

  const onEntryNamed = q && results.length === 0 ? rows.find((m) => m.name.toLowerCase() === q.toLowerCase()) : undefined;

  const picker = (
    <div data-marker-picker>
      <label className={cn(HIT_Y_36, "md-search mt-2.5 flex items-center gap-2 rounded-xl bg-bg-input px-[11px] text-text-muted")}>
        <SearchGlyph />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder(remaining)}
          aria-label="Search markers"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="relative z-[1] min-w-0 flex-1 border-0 bg-transparent py-[9px] text-[12.5px] text-foreground outline-none placeholder:text-text-muted"
        />
      </label>

      {q ? (
        <>
          {results.length > 0 ? <div className="mt-2 flex flex-wrap gap-1.5">{results.map(chip)}</div> : null}
          {onEntryNamed ? (
            <p className="mt-2 text-[12px] text-text-muted">{onEntryNamed.name} is already on this entry.</p>
          ) : null}
          {!exactNameMatch(pickable, q) ? (
            <CreateButton onClick={() => openCreate(q)}>Create “{titleCaseMarkerName(q)}”</CreateButton>
          ) : null}
        </>
      ) : (
        <>
          {sections.yours.length > 0 ? (
            <>
              <div className="mt-3 flex items-center justify-between gap-2">
                <h3 className={CARD_EYEBROW}>Yours</h3>
                <button
                  type="button"
                  onClick={() => setEditYours((v) => !v)}
                  aria-pressed={editingYours}
                  className={EDIT_TOGGLE}
                >
                  {editingYours ? "Done" : "Edit"}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {editingYours
                  ? sections.yours.map((m) => <RemoveChip key={m.id} label={m.name} onRemove={() => removeYours(m)} />)
                  : sections.yours.map(chip)}
              </div>
            </>
          ) : null}
          {sections.suggested.length > 0 ? (
            <>
              <h3 className={cn(CARD_EYEBROW, "mt-3")}>Suggested</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">{sections.suggested.map(chip)}</div>
            </>
          ) : null}
          {remaining === 0 ? <p className="mt-3 text-[12px] text-text-muted">Every marker is on this entry.</p> : null}
          <CreateButton onClick={() => openCreate("")}>Create your own</CreateButton>
        </>
      )}

      {barMounted ? (
        <AddBar
          count={pickedNow.length > 0 ? pickedNow.length : barCount}
          visible={pickedNow.length > 0}
          onAdd={addPicked}
          onLeft={() => setBarCount(0)}
        />
      ) : null}
    </div>
  );

  return (
    <div ref={rootRef} data-marker-dialer className="relative">
      <style href="trakabl-markers-panel" precedence="default">
        {MARKERS_CSS}
      </style>

      {creating ? (
        <CreateMarkerCard
          initialName={creating.name}
          options={pickable}
          onCancel={closeCreate}
          onCreated={onCreated}
        />
      ) : rows.length === 0 ? (
        <div className="flex flex-col gap-0.5">
          {lastToAdd.length > 0 ? (
            <button
              type="button"
              onClick={addLast}
              className={cn(
                PRESS.button,
                HIT_Y_36,
                "inst-ghost flex w-full items-center justify-center gap-[7px] p-[9px] text-[12px] text-foreground",
              )}
            >
              <RepeatGlyph />
              Use my last
              <span className="font-mono text-[10.5px] text-text-muted">{lastToAdd.length}</span>
            </button>
          ) : null}
          {picker}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((m) => (
            <MarkerRow
              key={m.id}
              marker={m}
              value={rated.get(m.id) ?? 0}
              bump={bumps[m.id] ?? 0}
              arriveDelay={arrive.get(m.id)}
              onRate={(v) => rate(m.id, v)}
              onRemove={() => removeRow(m.id)}
            />
          ))}
          <div className="flex flex-wrap gap-x-3.5">
            <LinkButton onClick={togglePicker} expanded={showPicker}>
              <PlusGlyph />
              Add more markers
            </LinkButton>
            {lastToAdd.length > 0 ? (
              <LinkButton onClick={addLast}>
                <RepeatGlyph />
                Use my last
              </LinkButton>
            ) : null}
          </div>
          {showPicker ? <div className="-mt-2.5">{picker}</div> : null}
        </div>
      )}
    </div>
  );
}

/** A quiet text link under the rows: muted, 11.5px. */
function LinkButton({ onClick, expanded, children }: { onClick: () => void; expanded?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={cn(
        PRESS.text,
        LINK_REACH,
        "flex items-center gap-[5px] text-[11.5px] text-text-muted transition-colors hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * A marker you can tick: raised grey (the Instrument ghost), radius 8, a thin +
 * before its name. Ticked, it is the lit white key with dark text and a small
 * tick, and it pops. The weight never changes, so a tick never reflows the chips.
 */
function PickChip({ label, on, onToggle }: { label: string; on: boolean; onToggle: (el: HTMLElement) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={(e: MouseEvent<HTMLButtonElement>) => onToggle(e.currentTarget)}
      className={cn(
        PRESS.pill,
        CHIP_REACH,
        "md-chip inline-flex max-w-full items-center gap-1.5 px-[9px] py-[5px] text-[11px] leading-[1.35]",
        on ? "inst-thumb text-bg-base" : "inst-ghost text-foreground",
      )}
    >
      {on ? <TickGlyph /> : <PlusGlyph />}
      <span className="truncate">{label}</span>
    </button>
  );
}

/** One of your own markers while Yours is being edited: outlined, with an x. */
function RemoveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove ${label}`}
      data-editing="true"
      className={cn(
        PRESS.pill,
        CHIP_REACH,
        "md-chip inst-ghost inline-flex max-w-full items-center gap-1 px-[9px] py-[5px] text-[11px] leading-[1.35] text-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      <span className="ml-0.5 flex text-text-muted">
        <CrossGlyph size={9} />
      </span>
    </button>
  );
}

/** "Create your own", or "Create “…”" from a search: a small outlined button. */
function CreateButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        PRESS.pill,
        HIT_Y_30,
        "mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-md px-[11px] py-1.5 text-[11.5px] text-foreground shadow-[inset_0_0_0_1px_var(--border-strong)]",
      )}
    >
      <PlusGlyph />
      <span className="truncate">{children}</span>
    </button>
  );
}
