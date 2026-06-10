"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { clearAvatar, setAvatarPath } from "@/app/(app)/profile/actions";

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
 * The Profile avatar — set, change, or remove your photo (B3). Tapping the
 * avatar opens the file picker; the chosen image is cropped/resized in the
 * browser, uploaded to the private `avatars` bucket at `<uid>/avatar.webp`, and
 * its path recorded on the profile. The image displays via a short-lived signed
 * URL (the bucket is private). Falls back to initials when there's no photo.
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

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
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
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        aria-label={signedUrl ? "Change profile photo" : "Add a profile photo"}
        className="group relative h-[4.5rem] w-[4.5rem] overflow-hidden rounded-full border border-border-strong bg-bg-surface-raised outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
      >
        {signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={signedUrl}
            alt="Your profile photo"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-display text-2xl text-foreground">
            {initials}
          </span>
        )}

        {/* Edit affordance — a small camera badge, or a spinner while busy. */}
        <span className="absolute inset-0 flex items-center justify-center bg-bg-base/0 transition-colors group-hover:bg-bg-base/40">
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-text-primary" aria-hidden />
          ) : (
            <Camera
              className="h-5 w-5 text-text-primary opacity-0 transition-opacity group-hover:opacity-100"
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

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="rounded-md px-1 text-xs text-text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {signedUrl ? "Change photo" : "Add photo"}
        </button>
        {signedUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md px-1 text-xs text-text-muted outline-none transition-colors hover:text-accent-destructive focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" aria-hidden />
            Remove
          </button>
        )}
      </div>

      {error && <p className="mt-1 text-xs text-state-error">{error}</p>}
    </div>
  );
}
