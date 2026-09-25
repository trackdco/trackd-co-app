"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ImageSquare, CircleNotch } from "@/components/icons";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BottomSheet } from "@/components/layout/BottomSheet";
import {
  FIELD_LABEL,
  INSET,
  PRESS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from "@/lib/ui-presets";
import { cn } from "@/lib/utils";
import { showToast } from "@/lib/toast";
import { createClient } from "@/lib/supabase/client";
import { addBloodworkPhoto } from "@/app/(app)/progress/actions";
import {
  PhotoAdjustSheet,
  type PhotoAdjustResult,
} from "@/components/media/PhotoAdjustSheet";
import { DOCUMENT_ASPECT, type Framing } from "@/lib/media/framing";

const MAX_BYTES = 10 * 1024 * 1024; // bucket cap

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
};

/** A non-guessable id for the storage folder (crypto.randomUUID, with a fallback
 *  for the plain-http LAN context used during on-phone QA). */
function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/**
 * Attach a bloodwork photo (Step 4, revised). Pick a screenshot/photo, set the
 * draw date (defaults to today; back-date an old panel so it slots into history),
 * save. The image uploads client-side straight to the private `bloodwork` bucket
 * (the avatar pattern — the bytes never touch the Next server); a server action
 * records the lab-panel row. Display is via short-lived signed URLs.
 *
 * The one sheet frame (`BottomSheet`, consistency fix #1) with a footer of
 * Cancel and Save (fix #2); the save is confirmed by the toast (fix #27).
 */
export function AttachBloodworkSheet({
  open,
  onOpenChange,
  userId,
  todayKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  todayKey: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [drawnOn, setDrawnOn] = useState(todayKey);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The image being framed, plus the untouched original + its framing so the
  // attached report can be re-framed without re-picking (in-session only —
  // storage stays adjusted-only).
  const [adjusting, setAdjusting] = useState<{
    file: File;
    framing?: Framing;
  } | null>(null);
  const [original, setOriginal] = useState<File | null>(null);
  const [framing, setFraming] = useState<Framing | undefined>(undefined);

  // Reset the form whenever the sheet closes. `adjusting` is part of the guard,
  // not just the body: a photo picked but not yet confirmed leaves `file` null,
  // so without it the condition reads as "nothing to reset" and the adjust step
  // would still be pending the next time the sheet opens.
  if (
    !open &&
    (file !== null ||
      error !== null ||
      adjusting !== null ||
      drawnOn !== todayKey ||
      note !== "")
  ) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setDrawnOn(todayKey);
    setNote("");
    setError(null);
    setOriginal(null);
    setFraming(undefined);
    setAdjusting(null);
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Choose an image (a screenshot or photo).");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("That image is over 10 MB. Choose a smaller one.");
      return;
    }
    setError(null);
    setAdjusting({ file: f, framing: undefined });
  }

  /** Re-open the adjust step on the ORIGINAL, with its framing intact. */
  function readjust() {
    if (!original) return;
    setAdjusting({ file: original, framing });
  }

  function onAdjusted(result: PhotoAdjustResult) {
    setAdjusting(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(result.file);
    setPreviewUrl(URL.createObjectURL(result.file));
    setOriginal(result.original);
    setFraming(result.framing);
  }

  async function handleSave() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const ext = EXT[file.type] ?? "img";
    const path = `${userId}/${randomId()}/report.${ext}`;
    try {
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from("bloodwork")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);

      const res = await addBloodworkPhoto(drawnOn, path, note);
      if (!res.ok) {
        await supabase.storage.from("bloodwork").remove([path]);
        throw new Error(res.error ?? "Couldn’t save. Try again.");
      }
      onOpenChange(false);
      router.refresh();
      showToast("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title="Attach bloodwork"
        description="Attach a screenshot or photo of your bloodwork and date it."
        desktop="rail"
        footer={
          <>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={SECONDARY_BUTTON}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy || !file}
              className={cn(PRIMARY_BUTTON, "flex-1")}
            >
              {busy ? (
                <CircleNotch className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Check className="h-4 w-4" aria-hidden />
              )}
              {busy ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        {/* The fields rise in as the sheet lands (feel pass §4). */}
        <div data-sheet-body>
          {/* Image picker / preview: a well to drop the report into. */}
          <button
            type="button"
            // Once chosen, tapping the preview RE-FRAMES it (Spec 05); the link
            // below still swaps the image entirely.
            onClick={() => (previewUrl ? readjust() : fileRef.current?.click())}
            className={cn(
              PRESS.card,
              INSET,
              "flex w-full flex-col items-center justify-center gap-2 overflow-hidden py-8 text-center",
            )}
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Selected bloodwork"
                className="max-h-72 w-full object-contain"
              />
            ) : (
              <>
                <ImageSquare className="h-7 w-7 text-text-muted" aria-hidden />
                <span className="text-sm text-text-muted">
                  Choose a screenshot or photo
                </span>
              </>
            )}
          </button>
          {previewUrl && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={cn(
                PRESS.text,
                "flex min-h-11 items-center text-xs text-text-muted transition-colors hover:text-foreground",
              )}
            >
              Choose a different image
            </button>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/heic"
            onChange={pickFile}
            className="hidden"
          />

          {/* Optional note */}
          <label className="mt-5 block">
            <span className={FIELD_LABEL}>Note (optional)</span>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything to remember?"
              rows={3}
              maxLength={2000}
              className="rounded-xl border-border-default bg-bg-input text-sm dark:bg-bg-input"
            />
          </label>

          {/* Draw date */}
          <label className="mt-5 block">
            <span className={FIELD_LABEL}>Date drawn</span>
            <Input
              type="date"
              value={drawnOn}
              max={todayKey}
              onChange={(e) => {
                // An EMPTY change event is not "today". iOS fires one while the
                // picker wheels are still moving, and coercing it to today snapped
                // the field back mid-pick — so a back-dated entry saved silently
                // under today's date. Keep the last good value; the field is
                // required, so there is nothing it should clear to.
                if (e.target.value) setDrawnOn(e.target.value)
              }}
              aria-label="Date drawn"
              className="h-12 rounded-xl border-border-default bg-bg-input px-3 font-mono text-sm [color-scheme:dark] dark:bg-bg-input"
            />
          </label>

          {error && <p className="mt-3 px-1 text-sm text-state-error">{error}</p>}
        </div>
      </BottomSheet>

      {/* Adjust. A lab report is a DOCUMENT, so the frame is the tallest ratio the
          app uses and the step opens fully zoomed out — the user can pan to the
          part that matters, and nothing is cropped unless they choose to. */}
      <PhotoAdjustSheet
        open={adjusting !== null}
        file={adjusting?.file ?? null}
        aspect={DOCUMENT_ASPECT}
        initialFraming={adjusting?.framing}
        onCancel={() => setAdjusting(null)}
        onConfirm={onAdjusted}
      />
    </>
  );
}
