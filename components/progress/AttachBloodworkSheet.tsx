"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ImageSquare, CircleNotch, X } from "@/components/icons";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useSheetDrag } from "@/components/home/useSheetDrag";
import { SHEET_TITLE } from "@/lib/ui-presets";
import { createClient } from "@/lib/supabase/client";
import { addBloodworkPhoto } from "@/app/(app)/progress/actions";

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
  const { cardRef, handleProps, cardStyle } = useSheetDrag(() => onOpenChange(false), open);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [drawnOn, setDrawnOn] = useState(todayKey);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form whenever the sheet closes.
  if (
    !open &&
    (file !== null || error !== null || drawnOn !== todayKey || note !== "")
  ) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setDrawnOn(todayKey);
    setNote("");
    setError(null);
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
      setError("That image is over 10 MB — choose a smaller one.");
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

          <SheetTitle className="sr-only">Attach bloodwork</SheetTitle>
          <SheetDescription className="sr-only">
            Attach a screenshot or photo of your blood work and date it.
          </SheetDescription>

          <div className="flex-1 overflow-y-auto px-6">
            <h2 className={SHEET_TITLE}>
              Attach bloodwork
            </h2>

            {/* Image picker / preview */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-4 flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-border-strong bg-bg-input/40 py-8 text-center transition-colors hover:bg-bg-input/70"
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
                    Tap to choose a screenshot or photo
                  </span>
                </>
              )}
            </button>
            {previewUrl && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mt-2 text-xs text-text-muted transition-colors hover:text-foreground"
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
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
                Note <span className="normal-case text-text-subtle">(optional)</span>
              </span>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything worth remembering about this panel…"
                rows={3}
                maxLength={2000}
                className="rounded-xl border-border-default bg-bg-input text-sm dark:bg-bg-input"
              />
            </label>

            {/* Draw date */}
            <label className="mt-5 block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
                Date drawn
              </span>
              <Input
                type="date"
                value={drawnOn}
                max={todayKey}
                onChange={(e) => setDrawnOn(e.target.value || todayKey)}
                aria-label="Date drawn"
                className="h-12 rounded-xl border-border-default bg-bg-input px-3 font-mono text-sm [color-scheme:dark] dark:bg-bg-input"
              />
              <span className="mt-1 block text-xs text-text-subtle">
                Logging an old panel? Set the date it was drawn so it slots into your
                history.
              </span>
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
              {busy ? (
                <CircleNotch className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Check className="h-4 w-4" aria-hidden />
              )}
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
