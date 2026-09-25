"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleNotch, ImageSquare, Tag, Trash, X } from "@/components/icons";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BottomSheet } from "@/components/layout/BottomSheet";
import { ConfirmDialog } from "@/components/feel/ConfirmDialog";
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
 *
 * The one sheet frame (`BottomSheet`, consistency fix #1): a handle to drag
 * down, the title, a footer of Delete + Save. A photo opens in the photo
 * viewer, the same one Progress uses, rather than an overlay of its own. The
 * delete asks through the one confirm (fix #5), and an entry with no photos
 * can be brought back from the toast's Undo.
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
  /** Each thumbnail, so the viewer grows out of the one tapped and back into it. */
  const thumbRefs = useRef(new Map<string, HTMLElement>());

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
  const hasPhotos = keptAttachments.length > 0 || pendingAdds.length > 0;
  const canSave =
    (bodyVisible && body.trim().length > 0) || markers.length > 0 || hasPhotos;
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
    // An empty change event is the picker mid-wheel, not a new date. iOS fires
    // one while the wheels are still moving, and coercing it to today did THREE
    // destructive things here at once: it moved the entry to today, it deleted
    // photos already uploaded in this session from the journal bucket
    // (rollbackPending), and it overwrote the note being typed (preload). The
    // other four date fields were fixed in ed3eed5; this one was missed, and it
    // is the only one of the five with side effects. Hold the last good date.
    if (!next) return;
    void rollbackPending();
    setRemovedIds([]);
    setDate(next);
    preload(next);
  }

  // Any close that ISN'T a successful save rolls back unsaved uploads (no orphans).
  function handleOpenChange(next: boolean) {
    if (!next && !savedRef.current) void rollbackPending();
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
      setAttachError(err instanceof Error ? err.message : "Couldn’t add that photo.");
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
      showToast("Saved");
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

  const photoCount = keptAttachments.length + pendingAdds.length;

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
          <>
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
              disabled={busy || !canSave}
              className={cn(PRIMARY_BUTTON, "flex-1")}
            >
              {busy ? <CircleNotch className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              {busy ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        {/* The fields rise in as the sheet lands (feel pass §4). */}
        <div data-sheet-body>
          {/* Date (new entries only — editing keeps the entry's day) */}
          {mode !== "edit" && (
            <label className="mt-1 block">
              <span className={FIELD_LABEL}>Date</span>
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
              <span className={FIELD_LABEL}>Note</span>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Training, sleep, how the protocol’s treating you"
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
                className={cn(SECONDARY_BUTTON, "w-full")}
              >
                <Tag className="h-4 w-4" aria-hidden />
                Add markers
              </button>
            ) : (
              <div className={cn(dialerAnim && "animate-shortcut-in")}>
                <p className={cn(FIELD_LABEL, "mb-2")}>Markers</p>
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
              A thumbnail opens the photo viewer; each has a remove ×. */}
          <div className="mt-5">
            {photoCount > 0 && (
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
                "flex min-h-11 items-center gap-1.5 px-1 text-xs text-text-muted transition-colors hover:text-foreground disabled:opacity-50",
              )}
            >
              {uploading ? (
                <CircleNotch className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <ImageSquare className="h-3.5 w-3.5" aria-hidden />
              )}
              {uploading ? "Adding…" : photoCount > 0 ? "Add another photo" : "Add a photo"}
            </button>
            {attachError && (
              <p className="mt-1 px-1 text-xs text-state-error">{attachError}</p>
            )}
          </div>

          {error && <p className="mt-4 px-1 text-sm text-state-error">{error}</p>}
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
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover object-top" />
        )}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove photo"
        className={cn(
          PRESS.icon,
          "absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border-strong bg-bg-surface text-text-muted transition-colors hover:text-foreground before:absolute before:-inset-2.5 before:content-['']",
        )}
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}
