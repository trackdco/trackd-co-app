"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Loader2, Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSheetDrag } from "@/components/home/useSheetDrag";
import { PoseIcon } from "@/components/progress/PoseIcon";
import { PosePicker } from "@/components/progress/PosePicker";
import { createClient } from "@/lib/supabase/client";
import { addProgressPhotos } from "@/app/(app)/progress/actions";
import { DEFAULT_POSES, poseLabel, poseShape } from "@/lib/progress/photos";

const MAX_BYTES = 10 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
};

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

interface Attachment {
  pose: string;
  file: File;
  previewUrl: string;
}

/**
 * Add a progress-photo SESSION (Spec 09 addendum). A tile per pose — Front / Side
 * / Back relaxed up front (+ more from the catalogue or custom) — each opens the
 * camera / photo library; fill any or all, add an optional note about the
 * physique, and submit them together. Photos upload client-side to the private
 * `progress-photos` bucket; one server action records all the rows for the date.
 */
export function AddProgressPhotoSheet({
  open,
  onOpenChange,
  userId,
  todayKey,
  customPoses,
  initialDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  todayKey: string;
  customPoses: string[];
  initialDate?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingPose = useRef<string | null>(null);
  const { cardRef, handleProps, cardStyle } = useSheetDrag(() => onOpenChange(false), open);

  const [attachments, setAttachments] = useState<Record<string, Attachment>>({});
  const [extraPoses, setExtraPoses] = useState<string[]>(customPoses);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [drawnOn, setDrawnOn] = useState(initialDate ?? todayKey);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      for (const a of Object.values(attachments)) URL.revokeObjectURL(a.previewUrl);
      setAttachments({});
      setExtraPoses(customPoses);
      setPickerOpen(false);
      setDrawnOn(initialDate ?? todayKey);
      setNote("");
      setError(null);
    }
  }

  const slots = [
    ...DEFAULT_POSES.map((p) => p.id),
    ...extraPoses,
  ];

  function pickFor(pose: string) {
    pendingPose.current = pose;
    fileRef.current?.click();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    const pose = pendingPose.current;
    pendingPose.current = null;
    if (!f || !pose) return;
    if (!f.type.startsWith("image/")) {
      setError("Choose an image (a photo).");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("That photo is over 10 MB.");
      return;
    }
    setError(null);
    setAttachments((prev) => {
      if (prev[pose]) URL.revokeObjectURL(prev[pose].previewUrl);
      return { ...prev, [pose]: { pose, file: f, previewUrl: URL.createObjectURL(f) } };
    });
  }

  function removeAttachment(pose: string) {
    setAttachments((prev) => {
      const next = { ...prev };
      if (next[pose]) URL.revokeObjectURL(next[pose].previewUrl);
      delete next[pose];
      return next;
    });
  }

  function addPose(p: string) {
    setExtraPoses((prev) => (prev.includes(p) ? prev : [...prev, p]));
    setPickerOpen(false);
  }

  async function handleSave() {
    const atts = Object.values(attachments);
    if (atts.length === 0) {
      setError("Add at least one photo.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const uploaded: string[] = [];
    try {
      const items: { pose: string; storagePath: string }[] = [];
      for (const a of atts) {
        const ext = EXT[a.file.type] ?? "img";
        const path = `${userId}/${randomId()}/photo.${ext}`;
        const up = await supabase.storage
          .from("progress-photos")
          .upload(path, a.file, { contentType: a.file.type, upsert: false });
        if (up.error) throw new Error(up.error.message);
        uploaded.push(path);
        items.push({ pose: a.pose, storagePath: path });
      }
      const res = await addProgressPhotos(drawnOn, note, items);
      if (!res.ok) throw new Error(res.error ?? "Couldn't save. Try again.");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      if (uploaded.length) await supabase.storage.from("progress-photos").remove(uploaded);
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const count = Object.keys(attachments).length;

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

          <SheetTitle className="sr-only">Add progress photos</SheetTitle>
          <SheetDescription className="sr-only">
            Add a photo for each pose and submit them together.
          </SheetDescription>

          <div className="flex-1 overflow-y-auto px-6">
            <h2 className="font-display text-2xl font-medium text-foreground">Add photos</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Tap a pose to take or choose a photo — fill any or all, then submit.
            </p>

            {/* Pose circles — tap to take or choose a photo for each. Compact so
                the sheet stays short instead of scrolling. */}
            <div className="mt-4 flex flex-wrap gap-3">
              {slots.map((pose) => {
                const att = attachments[pose];
                const shape = poseShape(pose);
                return (
                  <div
                    key={pose}
                    className="animate-shortcut-in flex w-[4.5rem] flex-col items-center gap-1.5"
                  >
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => pickFor(pose)}
                        aria-label={`${att ? "Replace" : "Add"} ${poseLabel(pose)} photo`}
                        className={cn(
                          "flex h-[4.5rem] w-[4.5rem] items-center justify-center overflow-hidden rounded-full border transition-colors",
                          att
                            ? "border-accent-amber/50"
                            : "border-dashed border-border-strong bg-bg-input/40 text-text-muted hover:bg-bg-input/70",
                        )}
                      >
                        {att ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={att.previewUrl} alt="" className="h-full w-full object-cover object-top" />
                        ) : shape ? (
                          <PoseIcon shape={shape} className="h-9 w-7" />
                        ) : (
                          <Camera className="h-6 w-6" aria-hidden />
                        )}
                      </button>
                      {att && (
                        <button
                          type="button"
                          onClick={() => removeAttachment(pose)}
                          aria-label={`Remove ${poseLabel(pose)} photo`}
                          className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-bg-base/80 text-text-primary"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      )}
                    </div>
                    <span className="text-center text-[11px] leading-tight text-text-muted">
                      {poseLabel(pose)}
                    </span>
                  </div>
                );
              })}

              {/* Add a pose. */}
              <div className="flex w-[4.5rem] flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPickerOpen((o) => !o)}
                  aria-expanded={pickerOpen}
                  aria-label="Add a pose"
                  className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border border-border-default bg-bg-surface-raised text-text-muted transition-colors hover:text-foreground"
                >
                  <Plus className="h-6 w-6" aria-hidden />
                </button>
                <span className="text-center text-[11px] leading-tight text-text-muted">
                  Add pose
                </span>
              </div>
            </div>

            {pickerOpen && (
              <div className="animate-shortcut-in mt-3">
                <PosePicker exclude={slots} onPick={addPose} />
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/heic"
              onChange={onFile}
              className="hidden"
            />

            {/* Date */}
            <label className="mt-5 block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
                Date
              </span>
              <Input
                type="date"
                value={drawnOn}
                max={todayKey}
                onChange={(e) => setDrawnOn(e.target.value || todayKey)}
                aria-label="Date taken"
                className="h-12 rounded-xl border-border-default bg-bg-input px-3 font-mono text-sm [color-scheme:dark] dark:bg-bg-input"
              />
            </label>

            {/* Notes */}
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
                Notes <span className="normal-case text-text-subtle">(optional)</span>
              </span>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="How the physique's looking — conditioning, pumps, anything worth noting…"
                rows={3}
                maxLength={2000}
                className="rounded-xl border-border-default bg-bg-input text-sm dark:bg-bg-input"
              />
            </label>

            {error && <p className="mt-3 px-1 text-sm text-state-error">{error}</p>}
            <div className="h-2" />
          </div>

          {/* Action bar */}
          <div className="flex shrink-0 gap-3 border-t border-border-default px-6 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex items-center justify-center gap-2 rounded-xl border border-border-strong px-4 py-3 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
            >
              <X className="h-4 w-4" aria-hidden />
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy || count === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-primary py-3 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              {busy ? "Saving…" : count > 1 ? `Save ${count} photos` : "Save"}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
