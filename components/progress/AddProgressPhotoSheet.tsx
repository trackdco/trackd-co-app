"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ImagePlus, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSheetDrag } from "@/components/home/useSheetDrag";
import { PoseIcon } from "@/components/progress/PoseIcon";
import { PosePicker } from "@/components/progress/PosePicker";
import { createClient } from "@/lib/supabase/client";
import { addProgressPhoto } from "@/app/(app)/progress/actions";
import {
  DEFAULT_POSES,
  isDefaultPose,
  poseLabel,
  type Pose,
} from "@/lib/progress/photos";

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

/**
 * Add a progress photo (Spec 09 addendum). Three default poses up front; "Add
 * more poses" reveals your own custom poses + a field to create one. Choose the
 * photo, set the date, save — the image uploads client-side to the private
 * `progress-photos` bucket, a server action records the row.
 */
export function AddProgressPhotoSheet({
  open,
  onOpenChange,
  userId,
  todayKey,
  customPoses,
  initialPose,
  initialDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  todayKey: string;
  /** The user's existing custom poses, for quick re-selection. */
  customPoses: string[];
  initialPose?: string;
  initialDate?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const { cardRef, handleProps, cardStyle } = useSheetDrag(() => onOpenChange(false), open);

  const [pose, setPose] = useState(initialPose ?? "front-relaxed");
  const [moreOpen, setMoreOpen] = useState(false);
  const [extras, setExtras] = useState<string[]>(customPoses);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [drawnOn, setDrawnOn] = useState(initialDate ?? todayKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isExtraSelected = !isDefaultPose(pose);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const startPose = initialPose ?? "front-relaxed";
      setPose(startPose);
      setExtras(customPoses);
      setMoreOpen(!DEFAULT_POSES.some((p) => p.id === startPose));
      setFile(null);
      setPreviewUrl(null);
      setDrawnOn(initialDate ?? todayKey);
      setError(null);
    }
  }

  function pickExtra(p: string) {
    setPose(p);
    if (!isDefaultPose(p) && !extras.includes(p)) {
      setExtras((prev) => [...prev, p]);
    }
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Choose an image (a photo).");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("That image is over 10 MB.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setError(null);
  }

  async function handleSave() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const ext = EXT[file.type] ?? "img";
    const path = `${userId}/${randomId()}/photo.${ext}`;
    try {
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from("progress-photos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);
      const res = await addProgressPhoto(pose, drawnOn, path);
      if (!res.ok) {
        await supabase.storage.from("progress-photos").remove([path]);
        throw new Error(res.error ?? "Couldn't save. Try again.");
      }
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
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

          <SheetTitle className="sr-only">Add progress photo</SheetTitle>
          <SheetDescription className="sr-only">
            Pick a pose, choose a photo, and date it.
          </SheetDescription>

          <div className="flex-1 overflow-y-auto px-6">
            <h2 className="font-display text-2xl font-medium text-foreground">Add photo</h2>

            {/* Pose */}
            <p className="mt-4 text-xs font-medium uppercase tracking-wider text-text-muted">
              Pose
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {DEFAULT_POSES.map((p) => (
                <PoseButton key={p.id} pose={p} selected={pose === p.id} onClick={() => setPose(p.id)} />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
              className="mt-2 flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-foreground"
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", moreOpen && "rotate-180")} aria-hidden />
              Add more poses
            </button>
            {moreOpen && (
              <div className="animate-shortcut-in mt-2 space-y-2">
                {extras.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {extras.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setPose(c)}
                        aria-pressed={pose === c}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-sm transition-colors",
                          pose === c
                            ? "border-accent-amber/50 bg-accent-amber/10 text-foreground"
                            : "border-border-default text-text-muted hover:text-foreground",
                        )}
                      >
                        {poseLabel(c)}
                      </button>
                    ))}
                  </div>
                )}
                <PosePicker
                  exclude={[...DEFAULT_POSES.map((p) => p.id), ...extras]}
                  onPick={pickExtra}
                />
                {isExtraSelected && (
                  <p className="px-1 text-xs text-text-subtle">
                    Selected: <span className="text-text-muted">{poseLabel(pose)}</span>
                  </p>
                )}
              </div>
            )}

            {/* Photo */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-5 flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-border-strong bg-bg-input/40 py-8 text-center transition-colors hover:bg-bg-input/70"
            >
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Selected" className="max-h-80 w-full object-contain" />
              ) : (
                <>
                  <ImagePlus className="h-7 w-7 text-text-muted" aria-hidden />
                  <span className="text-sm text-text-muted">Tap to choose a photo</span>
                </>
              )}
            </button>
            {previewUrl && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mt-2 text-xs text-text-muted transition-colors hover:text-foreground"
              >
                Choose a different photo
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/heic"
              onChange={pickFile}
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

            {error && <p className="mt-3 px-1 text-sm text-state-error">{error}</p>}
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
              disabled={busy || !file}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-primary py-3 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PoseButton({
  pose,
  selected,
  onClick,
}: {
  pose: Pose;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-colors",
        selected ? "border-accent-amber/50 bg-accent-amber/10" : "border-border-default hover:border-border-strong",
      )}
    >
      <PoseIcon
        shape={pose.shape}
        className={cn("h-11 w-8", selected ? "text-accent-amber" : "text-text-muted")}
      />
      <span
        className={cn(
          "text-center text-[11px] font-medium leading-tight",
          selected ? "text-foreground" : "text-text-muted",
        )}
      >
        {pose.label}
      </span>
    </button>
  );
}
