"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleNotch, ImageSquare, Tag, Trash, X } from "@/components/icons";

import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { BottomSheet } from "@/components/layout/BottomSheet";
import { ConfirmDialog } from "@/components/feel/ConfirmDialog";
import { DateField } from "@/components/feel/DateField";
import { JournalPhoto } from "@/components/progress/JournalPhoto";
import { MarkerDialer } from "@/components/progress/MarkerDialer";
import { ProgressPhotoViewer } from "@/components/progress/ProgressPhotoViewer";
import {
  PhotoAdjustSheet,
  type PhotoAdjustResult,
} from "@/components/media/PhotoAdjustSheet";
import { DOCUMENT_ASPECT } from "@/lib/media/framing";
import {
  FIELD_LABEL,
  PRESS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SHEET_TITLE,
} from "@/lib/ui-presets";
import { dayShort } from "@/lib/format/date";
import { showToast } from "@/lib/toast";
import { createClient } from "@/lib/supabase/client";
import {
  attachmentsAsPhotos,
  entryRestoreInput,
  type JournalEntry,
  type JournalRestoreInput,
  type MarkerOption,
} from "@/lib/progress/journal";
import {
  journalSaveBlock,
  mergeRatedIntoRows,
  ratedRows,
  rowsFromEntry,
  uploadLands,
  type DraftRow,
} from "@/lib/progress/journalDraft";
import type { ProgressPhoto } from "@/lib/progress/photos";
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

export interface JournalEntrySheetProps {
  /** Shown or not. The sheet resets to `initialDate`'s entry each time it opens. */
  open: boolean;
  /** Every close: Save, Delete, the handle, a tap outside, Escape. */
  onOpenChange: (open: boolean) => void;
  /** "write": the note, an optional "Add markers", photos, a date.
   *  "markers": the dialer and photos, no note (an existing note is left as it is).
   *  "edit": an existing day's note, markers and photos, with Delete; no date. */
  mode: Mode;
  /** The markers the dialer offers: `readJournal(...).options` (or `readJournalForHome`). */
  options: MarkerOption[];
  /** Every entry: `readJournal(...).entries`. The day picked starts from its
   *  entry, so an entry written here never writes over one it has not shown. */
  entries: JournalEntry[];
  /** The signed-in user's id: the first folder of an uploaded photo's path. */
  userId: string;
  /** Today on this device ("YYYY-MM-DD"): the last day the date can take. */
  todayKey: string;
  /** The day it opens on (usually today). */
  initialDate: string;
  /**
   * Called after a successful save with the day saved, INSTEAD of the "Saved"
   * toast: a caller with a journal on screen confirms in place, with a small
   * tick (W10). Left out (the + from any page), the sheet shows the toast.
   */
  onSaved?: (date: string) => void;
}

/**
 * THE FULL-PAGE JOURNAL WRITER (Step 5; photos, Spec 22 · 3). One sheet, three
 * entry points that all write to the day's single row (see `mode`).
 *
 * It works on its own from anywhere (W11): the + renders it with a journal read
 * (`readJournalForHome`) on any page, and Progress renders it from its journal
 * section. Everything it needs comes in through its props; it reads nothing
 * itself, and after a save it refreshes the route (`router.refresh()`), which
 * keeps the scroll where it is.
 *
 * Props, in short: `open` / `onOpenChange`, `mode`, `options` and `entries`
 * (the journal read), `userId`, `todayKey` (the device's today), `initialDate`,
 * and optional `onSaved(date)` (see above).
 *
 * The one sheet frame (`BottomSheet`, consistency fix #1): a handle to drag
 * down, the title, and the footer of Delete + Save pinned at the bottom (Adrian
 * likes it pinned). Save is never dead without a reason: while it cannot save
 * it is dimmed, and a tap says why above it (ruling 10). The date is the shared
 * `DateField` (W12, W32), which opens the app's calendar; nothing in the sheet
 * is wider than the screen (W12: at 375 and 390 it scrolled sideways), and
 * anything that would be is clipped at the sheet's edge rather than scrolled.
 *
 * Photos are a QUIET affordance: a small icon, not a CTA. New photos upload
 * straight to the private `journal` bucket and are recorded when the entry
 * saves; unsaved uploads are rolled back on close. An upload still in flight
 * when the day changes or the sheet closes belongs to the draft it started in
 * and is taken back out (cold review S8). Each photo fades down into place once
 * it has loaded (W9). A photo opens in the photo viewer Progress uses. The
 * delete asks through the one confirm (fix #5), and an entry with no photos can
 * be brought back from the toast's Undo.
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
  onSaved,
}: JournalEntrySheetProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const bodyVisible = mode !== "markers";
  const [date, setDate] = useState(initialDate);
  const [body, setBody] = useState("");
  /** Every marker row on the draft, rated or not (`tierValue` 0 = not rated). */
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [showDialer, setShowDialer] = useState(false);
  const [dialerAnim, setDialerAnim] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Save was tapped while it could not save: the reason shows. */
  const [asked, setAsked] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Attachments: photos removed from the existing entry, and new uploads (with a
  // local object-URL preview) not yet committed.
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [pendingAdds, setPendingAdds] = useState<{ path: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  /** The photo open in the viewer. */
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);
  // Photos waiting to be framed, in pick order — the head is the one on screen.
  // Multi-select is supported here, so the adjust step is a queue rather than a
  // single file.
  const [adjustQueue, setAdjustQueue] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const savedRef = useRef(false);
  // Every path uploaded this session; rollback/commit consult it so an upload still
  // in flight when the sheet closes is never orphaned (it's tracked before setState).
  const uploadedRef = useRef<string[]>([]);
  /** The draft's ticket (S8): bumped when the day changes, and on each open and close. */
  const ticketRef = useRef(0);
  /** Each thumbnail, so the viewer grows out of the one tapped and back into it. */
  const thumbRefs = useRef(new Map<string, HTMLElement>());

  // Reset the commit/rollback bookkeeping refs on each open (ref writes belong in an
  // effect, not render).
  useEffect(() => {
    if (open) {
      savedRef.current = false;
      uploadedRef.current = [];
      ticketRef.current += 1;
    }
  }, [open]);

  function preload(forDate: string) {
    const e = entries.find((x) => x.date === forDate) ?? null;
    setBody(e?.body ?? "");
    setRows(rowsFromEntry(e));
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
      setAsked(false);
      setAttachError(null);
      setConfirmingDelete(false);
      setDialerAnim(false);
      setRemovedIds([]);
      setPendingAdds([]);
      setViewing(null);
      // A queue left over from a sheet closed mid-adjust would otherwise reopen
      // the adjust step on the previous session's photos.
      setAdjustQueue([]);
    }
  }

  const entryForDate = entries.find((e) => e.date === date) ?? null;
  const keptAttachments = (entryForDate?.attachments ?? []).filter(
    (a) => !removedIds.includes(a.id),
  );
  const photoCount = keptAttachments.length + pendingAdds.length;
  const reason = journalSaveBlock({
    read: "ready",
    uploading,
    body,
    rows,
    photoCount,
    noteShown: bodyVisible,
  });
  const title = mode === "edit" ? "Edit entry" : mode === "markers" ? "Log markers" : "Write";
  // What the viewer swipes through: the photos kept on the entry, then the new ones.
  const viewPhotos = attachmentsAsPhotos(
    [...keptAttachments, ...pendingAdds.map((a) => ({ id: a.path, url: a.url }))],
    date,
  );

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
    // An empty change is never a new date (the field only hands one back from
    // Clear, which this field does not offer). A date change with side effects
    // (the photos uploaded this session leave the bucket, the day's own entry
    // loads) must never run on a non-date.
    if (!next || next === date) return;
    void rollbackPending();
    ticketRef.current += 1;
    setRemovedIds([]);
    setAsked(false);
    setDate(next);
    preload(next);
  }

  // Any close that ISN'T a successful save rolls back unsaved uploads (no orphans).
  function handleOpenChange(next: boolean) {
    if (!next && !savedRef.current) void rollbackPending();
    if (!next) ticketRef.current += 1;
    onOpenChange(next);
  }

  /**
   * Queue the picked photos for the adjust step (Spec 05). They're framed one at
   * a time, in order, and each uploads as it's confirmed — nothing reaches the
   * bucket unadjusted.
   */
  function queueForAdjust(files: FileList | null) {
    if (!files || files.length === 0) return;
    setAttachError(null);
    const valid: File[] = [];
    for (const file of Array.from(files)) {
      if (!EXT[file.type]) {
        setAttachError("Photos only: JPG, PNG, WebP or HEIC.");
        continue;
      }
      if (file.size > MAX_BYTES) {
        setAttachError("Each photo must be under 10 MB.");
        continue;
      }
      valid.push(file);
    }
    if (valid.length > 0) setAdjustQueue(valid);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    // S8: these photos belong to the draft (the day) they were started in.
    const mine = ticketRef.current;
    setAttachError(null);
    setUploading(true);
    const added: { path: string; url: string }[] = [];
    try {
      for (const file of files) {
        const ext = EXT[file.type];
        if (!ext) throw new Error("Photos only: JPG, PNG, WebP or HEIC.");
        if (file.size > MAX_BYTES) throw new Error("Each photo must be under 10 MB.");
        const path = `${userId}/${randomId()}/photo.${ext}`;
        const up = await supabase.storage
          .from("journal")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (up.error) throw new Error(up.error.message);
        if (uploadLands(mine, ticketRef.current) === "discard") {
          // The day changed, or the sheet closed, while it uploaded: it is not
          // this draft's photo. Take it back out rather than attach it.
          await supabase.storage.from("journal").remove([path]);
          continue;
        }
        // Track the path the instant it lands (before setState), so rollback covers
        // it even if the sheet closes / date changes mid-batch.
        uploadedRef.current.push(path);
        added.push({ path, url: URL.createObjectURL(file) });
      }
      if (uploadLands(mine, ticketRef.current) === "discard") {
        // The rollback that came with the change already took these out.
        added.forEach((a) => URL.revokeObjectURL(a.url));
        return;
      }
      setPendingAdds((prev) => [...prev, ...added]);
    } catch (err) {
      if (added.length > 0) {
        const failed = added.map((a) => a.path);
        await supabase.storage.from("journal").remove(failed);
        uploadedRef.current = uploadedRef.current.filter((p) => !failed.includes(p));
      }
      added.forEach((a) => URL.revokeObjectURL(a.url));
      if (mine === ticketRef.current) {
        setAttachError(err instanceof Error ? err.message : "Couldn’t add that photo.");
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /** One framed photo confirmed: upload it and move to the next in the queue. */
  function onAdjusted(result: PhotoAdjustResult) {
    setAdjustQueue((prev) => prev.slice(1));
    void uploadFiles([result.file]);
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
    if (busy) return;
    if (reason) {
      setAsked(true);
      return;
    }
    setBusy(true);
    setError(null);
    setAsked(false);
    const res = await saveJournalEntry({
      entryDate: date,
      touchBody: bodyVisible,
      body,
      markers: ratedRows(rows),
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
      // A journal on screen confirms in place (W10); elsewhere, the toast.
      if (onSaved) onSaved(date);
      else showToast("Saved");
    } else {
      setError(res.error ?? "Couldn’t save. Try again.");
    }
  }

  /** The toast's Undo: the day's note and markers, written back. */
  async function undoDelete(input: JournalRestoreInput) {
    const res = await saveJournalEntry(input);
    if (!res.ok) {
      showToast("Couldn’t undo. Try again.");
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    const target = entryForDate;
    if (!target) return;
    setBusy(true);
    setError(null);
    const res = await deleteJournalEntry(target.id);
    setBusy(false);
    if (res.ok) {
      savedRef.current = true;
      // Photos added in this session were never on the entry: take them back
      // out of the bucket rather than leave them there.
      void rollbackPending();
      onOpenChange(false);
      router.refresh();
      const restore = entryRestoreInput(target);
      showToast("Entry deleted", restore ? { undo: () => void undoDelete(restore) } : {});
    } else {
      setError(res.error ?? "Couldn’t delete. Try again.");
    }
  }

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={handleOpenChange}
        title={title}
        desktop="rail"
        header={
          <div className="flex items-center justify-between gap-3">
            <span aria-hidden className={SHEET_TITLE}>
              {title}
            </span>
            {mode === "edit" && (
              <span className="font-mono text-sm text-text-muted">{dayShort(date)}</span>
            )}
          </div>
        }
        footer={
          <div className="flex w-full min-w-0 flex-col gap-2">
            {error ? (
              <p className="px-1 text-sm text-state-error">{error}</p>
            ) : asked && reason ? (
              <p role="status" className="px-1 text-[12.5px] text-text-muted">
                {reason}
              </p>
            ) : null}
            <div className="flex min-w-0 gap-2">
              {entryForDate && (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={busy}
                  aria-label="Delete entry"
                  className={cn(SECONDARY_BUTTON, "w-11 shrink-0 px-0 text-text-muted")}
                >
                  <Trash className="h-4 w-4" aria-hidden />
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={busy}
                aria-disabled={reason !== null ? true : undefined}
                className={cn(PRIMARY_BUTTON, "min-w-0 flex-1 aria-disabled:opacity-50")}
              >
                {busy ? <CircleNotch className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        }
      >
        {/* The fields rise in as the sheet lands (feel pass §4). The body
            reaches to the sheet's edges and clips there, sideways only, so
            nothing can make the sheet scroll sideways (W12) while focus rings
            and hit areas keep the 20px margin. */}
        <div data-sheet-body className="-mx-5 min-w-0 overflow-x-clip px-5">
          {/* Date (new entries only — editing keeps the entry's day) */}
          {mode !== "edit" && (
            <label className="mt-1 block min-w-0">
              <span className={FIELD_LABEL}>Date</span>
              <DateField
                label="Entry date"
                value={date}
                onChange={changeDate}
                max={todayKey}
                todayKey={todayKey}
                className="h-12"
              />
            </label>
          )}

          {/* Body */}
          {bodyVisible && (
            <label className="mt-4 block min-w-0">
              <span className={FIELD_LABEL}>Note</span>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Training, sleep, how the protocol’s treating you"
                rows={7}
                className="min-h-[9.5rem] w-full min-w-0 rounded-xl border-border-default bg-bg-input text-sm leading-relaxed dark:bg-bg-input"
              />
            </label>
          )}

          {/* Markers */}
          <div className="mt-5 min-w-0">
            {bodyVisible && mode === "write" && !showDialer ? (
              <button
                type="button"
                onClick={() => {
                  setShowDialer(true);
                  setDialerAnim(true);
                }}
                className={cn(SECONDARY_BUTTON, "w-full min-w-0")}
              >
                <Tag className="h-4 w-4" aria-hidden />
                Add markers
              </button>
            ) : (
              <div className={cn("min-w-0", dialerAnim && "animate-shortcut-in")}>
                <p className={cn(FIELD_LABEL, "mb-2")}>Markers</p>
                <MarkerDialer
                  key={date}
                  options={options}
                  initial={entryForDate?.markers ?? []}
                  onChange={(rated) => setRows((prev) => mergeRatedIntoRows(prev, rated))}
                  onRowsChange={(all) => setRows(all.map((r) => ({ markerId: r.markerId, tierValue: r.tierValue })))}
                />
              </div>
            )}
          </div>

          {/* Photos — a QUIET affordance (Spec 22 · 3): a small icon, not a CTA.
              A thumbnail opens the photo viewer; each has a remove ×. */}
          <div className="mt-5 min-w-0">
            {(photoCount > 0 || uploading) && (
              <div className="mb-2 flex flex-wrap gap-2">
                {keptAttachments.map((a) => (
                  <Thumb
                    key={a.id}
                    url={a.url}
                    thumbRef={(el) => setThumb(thumbRefs.current, a.id, el)}
                    onView={() => a.url && setViewing(viewPhotos.find((p) => p.id === a.id) ?? null)}
                    onRemove={() => removeExisting(a.id)}
                  />
                ))}
                {pendingAdds.map((a) => (
                  <Thumb
                    key={a.path}
                    url={a.url}
                    thumbRef={(el) => setThumb(thumbRefs.current, a.path, el)}
                    onView={() => setViewing(viewPhotos.find((p) => p.id === a.path) ?? null)}
                    onRemove={() => removePending(a.path)}
                  />
                ))}
                {/* The one on its way: a grey place it will fade into (W9). */}
                {uploading ? <span aria-hidden className="sk block h-16 w-12 rounded-lg bg-bg-surface-raised" /> : null}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              multiple
              className="hidden"
              onChange={(e) => queueForAdjust(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className={cn(
                PRESS.text,
                "flex min-h-11 max-w-full items-center gap-1.5 px-1 text-xs text-text-muted transition-colors hover:text-foreground disabled:opacity-50",
              )}
            >
              {uploading ? (
                <CircleNotch className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
              ) : (
                <ImageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              {uploading ? "Adding…" : photoCount > 0 ? "Add another photo" : "Add a photo"}
            </button>
            {attachError && (
              <p className="mt-1 px-1 text-xs text-state-error">{attachError}</p>
            )}
          </div>

          <div className="h-2" />
        </div>

        {/* Inside the sheet, so the confirm is pressable over it. */}
        <ConfirmDialog
          open={confirmingDelete}
          onClose={() => setConfirmingDelete(false)}
          title="Delete this entry?"
          line={entryForDate?.attachments.length ? "Its photos go for good." : undefined}
          confirmLabel="Delete entry"
          onConfirm={() => void handleDelete()}
        />

        <ProgressPhotoViewer
          open={viewing !== null}
          onOpenChange={(o) => {
            if (!o) setViewing(null);
          }}
          photo={viewing}
          photos={viewPhotos}
          originFor={(p) => thumbRefs.current.get(p.id) ?? null}
          label={(p) => `Journal · ${dayShort(p.date)}`}
          canDelete={false}
          unit="kg"
          onDeleted={() => setViewing(null)}
        />
      </BottomSheet>

      {/* Adjust — one photo at a time, in pick order. Journal photos are usually
          screenshots or snaps of something, so they take the document ratio and
          open fully zoomed out; Cancel abandons the rest of the batch. */}
      <PhotoAdjustSheet
        open={adjustQueue.length > 0}
        file={adjustQueue[0] ?? null}
        aspect={DOCUMENT_ASPECT}
        onCancel={() => setAdjustQueue([])}
        onConfirm={onAdjusted}
      />
    </>
  );
}

/** Keeps a thumbnail's element by id (and forgets it when it goes). */
function setThumb(map: Map<string, HTMLElement>, id: string, el: HTMLElement | null) {
  if (el) map.set(id, el);
  else map.delete(id);
}

function Thumb({
  url,
  thumbRef,
  onView,
  onRemove,
}: {
  url: string | null;
  thumbRef: (el: HTMLElement | null) => void;
  onView: () => void;
  onRemove: () => void;
}) {
  return (
    <span className="relative">
      <button
        ref={thumbRef}
        type="button"
        onClick={onView}
        className={cn(
          PRESS.card,
          "block h-16 w-12 overflow-hidden rounded-lg border border-border-default bg-bg-surface-raised",
        )}
        aria-label="View photo"
      >
        {/* It fades down into place once it has loaded (W9). */}
        {url && <JournalPhoto src={url} className="h-full w-full object-cover object-top" />}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove photo"
        className={cn(
          PRESS.icon,
          "absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-md border border-border-strong bg-bg-surface text-text-muted transition-colors hover:text-foreground before:absolute before:-inset-2.5 before:content-['']",
        )}
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}
