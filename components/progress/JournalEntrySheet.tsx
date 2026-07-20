"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CircleNotch,
  ImageSquare,
  Tag,
  Trash,
  X,
} from "@/components/icons";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSheetDrag } from "@/components/home/useSheetDrag";
import { MarkerDialer } from "@/components/progress/MarkerDialer";
import { SHEET_TITLE } from "@/lib/ui-presets";
import { createClient } from "@/lib/supabase/client";
import {
  formatJournalDate,
  type JournalEntry,
  type MarkerOption,
} from "@/lib/progress/journal";
import { deleteJournalEntry, saveJournalEntry } from "@/app/(app)/progress/actions";

type Mode = "write" | "markers" | "edit";

// Photo attachments (Spec 22 · 3) — mirror the progress-photo upload guards.
const MAX_BYTES = 10 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};
function randomId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

function markersOf(entry: JournalEntry | null) {
  return entry ? entry.markers.map((m) => ({ markerId: m.markerId, tierValue: m.tierValue })) : [];
}

/**
 * The journal editor (Step 5; photo attachments added by Spec 22 · 3). One sheet,
 * three entry points that all write to the day's single row:
 * - "write"   → free-text body + an optional "add markers" dialer (touches body).
 * - "markers" → just the dialer, no body (leaves an existing body untouched).
 * - "edit"    → an existing day's body + markers, with Delete (touches body).
 *
 * Photos are a QUIET affordance: a small icon, not a CTA. New photos upload straight
 * to the private `journal` bucket (bytes off the Next server) and are recorded when
 * the entry saves; unsaved uploads are rolled back on close.
 */
export function JournalEntrySheet({
  open,
  onOpenChange,
  mode,
  options,
  entries,
  userId,
  todayKey,
  initialDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  options: MarkerOption[];
  entries: JournalEntry[];
  userId: string;
  todayKey: string;
  initialDate: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const bodyVisible = mode !== "markers";
  const [date, setDate] = useState(initialDate);
  const [body, setBody] = useState("");
  const [markers, setMarkers] = useState<{ markerId: string; tierValue: number }[]>([]);
  const [showDialer, setShowDialer] = useState(false);
  const [dialerAnim, setDialerAnim] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Attachments: photos removed from the existing entry, and new uploads (with a
  // local object-URL preview) not yet committed.
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [pendingAdds, setPendingAdds] = useState<{ path: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const savedRef = useRef(false);
  // Every path uploaded this session; rollback/commit consult it so an upload still
  // in flight when the sheet closes is never orphaned (it's tracked before setState).
  const uploadedRef = useRef<string[]>([]);

  // The photo viewer is a lightweight overlay (not a nested Radix dialog, which would
  // fight the open Sheet's focus trap), so wire Escape-to-close by hand; the close
  // button autofocuses for initial keyboard focus.
  useEffect(() => {
    if (!viewingUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewingUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewingUrl]);

  // Reset the commit/rollback bookkeeping refs on each open (ref writes belong in an
  // effect, not render).
  useEffect(() => {
    if (open) {
      savedRef.current = false;
      uploadedRef.current = [];
    }
  }, [open]);

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
      setAttachError(null);
      setConfirmingDelete(false);
      setDialerAnim(false);
      setRemovedIds([]);
      setPendingAdds([]);
      setViewingUrl(null);
    }
  }

  const entryForDate = entries.find((e) => e.date === date) ?? null;
  const keptAttachments = (entryForDate?.attachments ?? []).filter(
    (a) => !removedIds.includes(a.id),
  );
  const hasPhotos = keptAttachments.length > 0 || pendingAdds.length > 0;
  const canSave =
    (bodyVisible && body.trim().length > 0) || markers.length > 0 || hasPhotos;
  const title = mode === "edit" ? "Edit entry" : mode === "markers" ? "Log markers" : "Write";

  async function rollbackPending() {
    // uploadedRef is a superset of pendingAdds — it includes any upload that finished
    // mid-batch but hadn't hit state yet, so nothing is left orphaned in the bucket.
    const paths = uploadedRef.current;
    uploadedRef.current = [];
    pendingAdds.forEach((a) => URL.revokeObjectURL(a.url));
    setPendingAdds([]);
    if (paths.length > 0) await supabase.storage.from("journal").remove(paths);
  }

  function changeDate(next: string) {
    const d = next || todayKey;
    void rollbackPending();
    setRemovedIds([]);
    setDate(d);
    preload(d);
  }

  // Any close that ISN'T a successful save rolls back unsaved uploads (no orphans).
  function handleOpenChange(next: boolean) {
    if (!next && !savedRef.current) void rollbackPending();
    onOpenChange(next);
  }

  const { cardRef, handleProps, cardStyle } = useSheetDrag(
    () => handleOpenChange(false),
    open,
  );

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setAttachError(null);
    setUploading(true);
    const added: { path: string; url: string }[] = [];
    try {
      for (const file of Array.from(files)) {
        const ext = EXT[file.type];
        if (!ext) throw new Error("Photos only — JPG, PNG, WebP or HEIC.");
        if (file.size > MAX_BYTES) throw new Error("Each photo must be under 10 MB.");
        const path = `${userId}/${randomId()}/photo.${ext}`;
        const up = await supabase.storage
          .from("journal")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (up.error) throw new Error(up.error.message);
        // Track the path the instant it lands (before setState), so rollback covers
        // it even if the sheet closes / date changes mid-batch.
        uploadedRef.current.push(path);
        added.push({ path, url: URL.createObjectURL(file) });
      }
      setPendingAdds((prev) => [...prev, ...added]);
    } catch (err) {
      if (added.length > 0) {
        const failed = added.map((a) => a.path);
        await supabase.storage.from("journal").remove(failed);
        uploadedRef.current = uploadedRef.current.filter((p) => !failed.includes(p));
      }
      added.forEach((a) => URL.revokeObjectURL(a.url));
      setAttachError(err instanceof Error ? err.message : "Couldn't add that photo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeExisting(id: string) {
    setRemovedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }
  async function removePending(path: string) {
    const item = pendingAdds.find((a) => a.path === path);
    setPendingAdds((prev) => prev.filter((a) => a.path !== path));
    uploadedRef.current = uploadedRef.current.filter((p) => p !== path);
    if (item) URL.revokeObjectURL(item.url);
    await supabase.storage.from("journal").remove([path]);
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    const res = await saveJournalEntry({
      entryDate: date,
      touchBody: bodyVisible,
      body,
      markers,
      attachmentsAdd: pendingAdds.map((a) => a.path),
      attachmentsRemove: removedIds,
    });
    setBusy(false);
    if (res.ok) {
      savedRef.current = true;
      uploadedRef.current = [];
      pendingAdds.forEach((a) => URL.revokeObjectURL(a.url));
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
      savedRef.current = true;
      onOpenChange(false);
      router.refresh();
    } else {
      setError(res.error ?? "Couldn't delete. Try again.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
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
            Journal entry — a free-write note and/or dialed markers for the day, with optional photos.
          </SheetDescription>

          <div className="flex-1 overflow-y-auto px-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className={SHEET_TITLE}>{title}</h2>
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
                  <Tag className="h-4 w-4" aria-hidden />
                  Add markers
                </button>
              ) : (
                <div className={cn(dialerAnim && "animate-shortcut-in")}>
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">
                    Markers
                  </p>
                  <MarkerDialer
                    key={date}
                    options={options}
                    initial={entryForDate?.markers ?? []}
                    onChange={setMarkers}
                  />
                </div>
              )}
            </div>

            {/* Photos — a QUIET affordance (Spec 22 · 3): a small icon, not a CTA.
                Thumbnails tap through to a full-screen view; each has a remove ×. */}
            <div className="mt-5">
              {(keptAttachments.length > 0 || pendingAdds.length > 0) && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {keptAttachments.map((a) => (
                    <Thumb
                      key={a.id}
                      url={a.url}
                      onView={() => a.url && setViewingUrl(a.url)}
                      onRemove={() => removeExisting(a.id)}
                    />
                  ))}
                  {pendingAdds.map((a) => (
                    <Thumb
                      key={a.path}
                      url={a.url}
                      onView={() => setViewingUrl(a.url)}
                      onRemove={() => removePending(a.path)}
                    />
                  ))}
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                multiple
                className="hidden"
                onChange={(e) => uploadFiles(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs text-text-muted transition-colors hover:text-foreground disabled:opacity-50"
              >
                {uploading ? (
                  <CircleNotch className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <ImageSquare className="h-3.5 w-3.5" aria-hidden />
                )}
                {uploading ? "Adding…" : keptAttachments.length + pendingAdds.length > 0 ? "Add another photo" : "Add a photo"}
              </button>
              {attachError && (
                <p className="mt-1 px-1 text-xs text-state-error">{attachError}</p>
              )}
            </div>

            {error && <p className="mt-4 px-1 text-sm text-state-error">{error}</p>}
            <div className="h-2" />
          </div>

          {/* Action bar */}
          {confirmingDelete ? (
            <div className="shrink-0 hairline-t px-6 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
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
                  {busy ? <CircleNotch className="h-4 w-4 animate-spin" aria-hidden /> : <Trash className="h-4 w-4" aria-hidden />}
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="flex shrink-0 gap-3 hairline-t px-6 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              {entryForDate && (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  aria-label="Delete entry"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border-strong text-text-muted transition-colors hover:text-accent-destructive"
                >
                  <Trash className="h-4 w-4" aria-hidden />
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={busy || !canSave}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-primary py-3 text-sm font-medium text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
              >
                {busy ? <CircleNotch className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>
      </SheetContent>

      {viewingUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setViewingUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={viewingUrl}
            alt="Journal attachment"
            className="max-h-full max-w-full rounded-lg object-contain"
          />
          <button
            type="button"
            autoFocus
            onClick={() => setViewingUrl(null)}
            aria-label="Close photo"
            className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      )}
    </Sheet>
  );
}

function Thumb({
  url,
  onView,
  onRemove,
}: {
  url: string | null;
  onView: () => void;
  onRemove: () => void;
}) {
  return (
    <span className="relative">
      <button
        type="button"
        onClick={onView}
        className="block h-16 w-12 overflow-hidden rounded-lg border border-border-default bg-bg-surface-raised"
        aria-label="View photo"
      >
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover object-top" />
        )}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove photo"
        className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border-strong bg-bg-surface text-text-muted transition-colors hover:text-foreground"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}
