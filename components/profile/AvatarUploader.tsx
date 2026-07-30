"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CircleNotch, Trash } from "@/components/icons";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { clearAvatar, setAvatarPath } from "@/app/(app)/profile/actions";
import { PhotoAdjustSheet } from "@/components/media/PhotoAdjustSheet";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { AVATAR_ASPECT } from "@/lib/media/framing";

interface AvatarUploaderProps {
  /** Code-point-safe initials, shown when there's no photo. */
  initials: string;
  /** A short-lived signed URL for the current avatar, or null. */
  signedUrl: string | null;
  userId: string;
}

const TARGET = 256; // output square, px
const MAX_SOURCE = 4096; // guard against absurd source images

/**
 * Read a file into an <img>, centre-crop to a square, resize to TARGET, and
 * return a webp Blob. All client-side (canvas) — no dependency, and the heavy
 * source never leaves the device (only the small square does).
 */
async function cropResizeToWebp(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Could not read that image."));
      i.src = url;
    });
    const w = Math.min(img.naturalWidth, MAX_SOURCE);
    const h = Math.min(img.naturalHeight, MAX_SOURCE);
    const side = Math.min(w, h);
    const sx = (w - side) / 2;
    const sy = (h - side) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = TARGET;
    canvas.height = TARGET;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't process that image.");
    ctx.drawImage(img, sx, sy, side, side, 0, 0, TARGET, TARGET);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/webp", 0.9),
    );
    if (!blob) throw new Error("Couldn't process that image.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The Profile avatar — set, change, or remove your photo (B3; enlarged and
 * simplified by spec 09 · part two).
 *
 * **Tapping the avatar is the whole control.** The "Change photo" and "Remove"
 * text links beneath it are gone: they were two more things to read on a screen
 * that is mostly reading, and the avatar itself was already the obvious target.
 *
 * With NO photo the tap opens the file picker directly, which is the spec's
 * wording and the only sensible behaviour when there is nothing to remove. With
 * a photo it opens a two-choice sheet, because "removing a photo moves inside
 * that flow" and this is the flow — there is nowhere else left for Remove to
 * live. Judgement call, flagged for Adrian.
 *
 * The chosen image is framed (Spec 05, square), cropped/resized in the browser,
 * uploaded to the private `avatars` bucket at `<uid>/avatar.webp`, and its path
 * recorded on the profile. Display is via a short-lived signed URL. Falls back
 * to initials when there is no photo.
 */
export function AvatarUploader({
  initials,
  signedUrl,
  userId,
}: AvatarUploaderProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The photo being framed before upload. Null = no adjust step open. There's no
  // re-adjust here: an avatar is one slot that's replaced outright, and the
  // original isn't kept (storage is adjusted-only).
  const [adjusting, setAdjusting] = useState<File | null>(null);
  /** The change-or-remove sheet. Only ever opened when a photo exists. */
  const [choosing, setChoosing] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    setError(null);
    // Frame it first (Spec 05). The avatar renders as a circle, so the frame is
    // square — a centre crop used to decide what was in it, and a head off to one
    // side of a photo simply lost.
    setAdjusting(file);
  }

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const blob = await cropResizeToWebp(file);
      const path = `${userId}/avatar.webp`;
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/webp" });
      if (upErr) throw new Error(upErr.message);
      const res = await setAvatarPath(path);
      if (!res.ok) throw new Error(res.error ?? "Couldn't save your photo.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update your photo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    const res = await clearAvatar();
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(res.error ?? "Couldn't remove your photo.");
  }

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => (signedUrl ? setChoosing(true) : fileRef.current?.click())}
        disabled={busy}
        aria-label={signedUrl ? "Change or remove your profile photo" : "Add a profile photo"}
        className="group relative h-28 w-28 overflow-hidden rounded-full border border-border-strong bg-bg-surface-raised outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
      >
        {signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={signedUrl}
            alt="Your profile photo"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-4xl font-light text-foreground">
            {initials}
          </span>
        )}

        {/* Edit affordance — a camera badge, or a spinner while busy. It is
            always visible without a photo: an empty circle of initials does not
            otherwise say "tap me", and the text links that used to say so are
            gone. */}
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center transition-colors",
            signedUrl ? "bg-bg-base/0 group-hover:bg-bg-base/40" : "bg-bg-base/0",
          )}
        >
          {busy ? (
            <CircleNotch className="h-6 w-6 animate-spin text-text-primary" aria-hidden />
          ) : (
            <Camera
              className={cn(
                "h-6 w-6 text-text-primary transition-opacity",
                signedUrl ? "opacity-0 group-hover:opacity-100" : "opacity-60",
              )}
              aria-hidden
            />
          )}
        </span>
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFile}
        className="hidden"
      />

      {/* Square frame — the avatar renders as a circle. The adjusted result is
          already 1:1, so `cropResizeToWebp` below only resizes and re-encodes it. */}
      <PhotoAdjustSheet
        open={adjusting !== null}
        file={adjusting}
        aspect={AVATAR_ASPECT}
        onCancel={() => setAdjusting(null)}
        onConfirm={(result) => {
          setAdjusting(null);
          void upload(result.file);
        }}
      />

      {/* Change or remove — only reachable when there IS a photo, so it never
          offers to remove nothing. */}
      <Sheet open={choosing} onOpenChange={setChoosing}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="gap-0 rounded-t-3xl p-0"
        >
          <SheetTitle className="sr-only">Profile photo</SheetTitle>
          <SheetDescription className="sr-only">
            Choose a new profile photo, or remove the current one.
          </SheetDescription>
          <div className="flex flex-col p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <button
              type="button"
              onClick={() => {
                setChoosing(false);
                fileRef.current?.click();
              }}
              className="flex items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm text-foreground transition-colors hover:bg-bg-surface-raised"
            >
              <Camera className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              Choose a new photo
            </button>
            <button
              type="button"
              onClick={() => {
                setChoosing(false);
                void handleRemove();
              }}
              className="flex items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-medium text-accent-destructive transition-colors hover:bg-accent-destructive/10"
            >
              <Trash className="h-4 w-4 shrink-0" aria-hidden />
              Remove photo
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {error && <p className="mt-2 text-xs text-state-error">{error}</p>}
    </div>
  );
}
