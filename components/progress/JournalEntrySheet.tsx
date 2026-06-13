"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, NotebookPen, Pencil, Tags, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSheetDrag } from "@/components/home/useSheetDrag";
import { MarkerDialer } from "@/components/progress/MarkerDialer";
import {
  formatJournalDate,
  type JournalEntry,
  type MarkerCatalogueItem,
} from "@/lib/progress/journal";
import { deleteJournalEntry, saveJournalEntry } from "@/app/(app)/progress/actions";

type Mode = "write" | "markers" | "edit";

function markersOf(entry: JournalEntry | null) {
  return entry ? entry.markers.map((m) => ({ markerId: m.markerId, tierValue: m.tierValue })) : [];
}

/**
 * The journal editor (Step 5). One sheet, three entry points that all write to the
 * day's single row:
 * - "write"   → free-text body + an optional "add markers" dialer (touches body).
 * - "markers" → just the dialer, no body (leaves an existing body untouched).
 * - "edit"    → an existing day's body + markers, with Delete (touches body).
 *
 * Picking a date that already has an entry preloads it (one row per day), so the
 * two quick paths never clobber each other.
 */
export function JournalEntrySheet({
  open,
  onOpenChange,
  mode,
  catalogue,
  entries,
  todayKey,
  initialDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  catalogue: MarkerCatalogueItem[];
  entries: JournalEntry[];
  todayKey: string;
  initialDate: string;
}) {
  const router = useRouter();
  const { cardRef, handleProps, cardStyle } = useSheetDrag(() => onOpenChange(false), open);

  const bodyVisible = mode !== "markers";
  const [date, setDate] = useState(initialDate);
  const [body, setBody] = useState("");
  const [markers, setMarkers] = useState<{ markerId: string; tierValue: number }[]>([]);
  const [showDialer, setShowDialer] = useState(false);
  const [dialerAnim, setDialerAnim] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function preload(forDate: string) {
    const e = entries.find((x) => x.date === forDate) ?? null;
    setBody(e?.body ?? "");
    setMarkers(markersOf(e));
    setShowDialer(mode !== "write" || (e?.markers.length ?? 0) > 0);
  }

  // Reset on open from the initial date's entry (one-per-day preload).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDate(initialDate);
      preload(initialDate);
      setError(null);
      setConfirmingDelete(false);
      setDialerAnim(false);
    }
  }

  const entryForDate = entries.find((e) => e.date === date) ?? null;
  const canSave = (bodyVisible && body.trim().length > 0) || markers.length > 0;
  const title = mode === "edit" ? "Edit entry" : mode === "markers" ? "Log markers" : "Write";
  const Icon = mode === "markers" ? Tags : mode === "edit" ? Pencil : NotebookPen;

  function changeDate(next: string) {
    const d = next || todayKey;
    setDate(d);
    preload(d);
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    const res = await saveJournalEntry({ entryDate: date, touchBody: bodyVisible, body, markers });
    setBusy(false);
    if (res.ok) {
      onOpenChange(false);
      router.refresh();
    } else {
      setError(res.error ?? "Couldn't save. Try again.");
    }
  }

  async function handleDelete() {
    if (!entryForDate) return;
    setBusy(true);
    setError(null);
    const res = await deleteJournalEntry(entryForDate.id);
    setBusy(false);
    if (res.ok) {
      onOpenChange(false);
      router.refresh();
    } else {
      setError(res.error ?? "Couldn't delete. Try again.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 border-t-0 bg-transparent p-0 shadow-none"
      >
        <div
          ref={cardRef}
          style={cardStyle}
          className="flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl border-t border-border-default bg-bg-surface shadow-lg"
        >
          <div
            {...handleProps}
            className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          >
            <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
          </div>

          <SheetTitle className="sr-only">{title}</SheetTitle>
          <SheetDescription className="sr-only">
            Journal entry — a free-write note and/or dialed markers for the day.
          </SheetDescription>

          <div className="flex-1 overflow-y-auto px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-surface-raised text-text-muted">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <h2 className="font-display text-2xl font-medium text-foreground">{title}</h2>
              </div>
              {mode === "edit" && (
                <span className="font-mono text-sm text-text-muted">
                  {formatJournalDate(date)}
                </span>
              )}
            </div>

            {/* Date (new entries only — editing keeps the entry's day) */}
            {mode !== "edit" && (
              <label className="mt-4 block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
                  Date
                </span>
                <Input
                  type="date"
                  value={date}
                  max={todayKey}
                  onChange={(e) => changeDate(e.target.value)}
                  aria-label="Entry date"
                  className="h-12 rounded-xl border-border-default bg-bg-input px-3 font-mono text-sm [color-scheme:dark] dark:bg-bg-input"
                />
              </label>
            )}

            {/* Body */}
            {bodyVisible && (
              <label className="mt-4 block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
                  Note
                </span>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="How did today go? Training, sleep, how the protocol's treating you…"
                  rows={7}
                  className="min-h-[9.5rem] rounded-xl border-border-default bg-bg-input text-sm leading-relaxed dark:bg-bg-input"
                />
              </label>
            )}

            {/* Markers */}
            <div className="mt-5">
              {bodyVisible && mode === "write" && !showDialer ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowDialer(true);
                    setDialerAnim(true);
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border-default py-3 text-sm text-text-muted transition-colors hover:border-border-strong hover:text-foreground"
                >
                  <Tags className="h-4 w-4" aria-hidden />
                  Add markers
                </button>
              ) : (
                <div className={cn(dialerAnim && "animate-shortcut-in")}>
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">
                    Markers
                  </p>
                  <MarkerDialer
                    key={date}
                    catalogue={catalogue}
                    initial={entryForDate?.markers ?? []}
                    onChange={setMarkers}
                  />
                </div>
              )}
            </div>

            {error && <p className="mt-4 px-1 text-sm text-state-error">{error}</p>}
            <div className="h-2" />
          </div>

          {/* Action bar */}
          {confirmingDelete ? (
            <div className="shrink-0 border-t border-border-default px-6 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <p className="text-sm text-foreground">
                Delete this entry? This can&apos;t be undone.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={busy}
                  className="flex-1 rounded-lg border border-border-strong py-2.5 text-sm text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={busy}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent-destructive py-2.5 text-sm font-medium text-text-primary transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="flex shrink-0 gap-3 border-t border-border-default px-6 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              {entryForDate && (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  aria-label="Delete entry"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border-strong text-text-muted transition-colors hover:text-accent-destructive"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={busy || !canSave}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-primary py-3 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
