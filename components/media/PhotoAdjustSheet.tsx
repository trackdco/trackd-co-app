"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  clampFraming,
  cropRect,
  DEFAULT_FRAMING,
  maxOffset,
  outputSize,
  scaleAbout,
  type Framing,
  type Size,
} from "@/lib/media/framing"

/** Long-edge cap on the saved image — big enough to stay sharp on a phone, small
 *  enough that a 48MP original doesn't become a 20MB upload. */
const MAX_OUTPUT_EDGE = 1600
const OUTPUT_TYPE = "image/jpeg"
const OUTPUT_QUALITY = 0.9

export interface PhotoAdjustResult {
  /** The adjusted image, ready to upload. */
  file: File
  /** The framing that produced it, so re-opening this slot resumes where the
   *  user left off instead of starting over. */
  framing: Framing
  /** The untouched original, kept in memory ONLY for re-adjustment within the
   *  session. Never uploaded — storage is adjusted-only (Adrian's call). */
  original: File
}

interface PhotoAdjustSheetProps {
  open: boolean
  /** The chosen photo. Null closes the sheet. */
  file: File | null
  /** Frame aspect as width / height (3/4 for progress photos, 1 for the avatar). */
  aspect: number
  /** Re-opening a slot: the framing it was last confirmed with. */
  initialFraming?: Framing
  onCancel: () => void
  onConfirm: (result: PhotoAdjustResult) => void
}

/**
 * The photo adjust step (Spec 05) — the one implementation every photo entry
 * point uses, differing only in the aspect ratio passed in.
 *
 * Pinch to zoom, drag to reposition, inside a frame that never moves. The image
 * cannot be zoomed out past covering the frame, so there is no letterboxing to
 * design around. No rotation, no filters, no free crop: the point is that
 * successive shots line up, not that photos get edited.
 *
 * Degrades honestly: if the browser can't decode the file (HEIC outside Safari
 * is the real case), the sheet says so and Confirm passes the ORIGINAL through
 * untouched rather than blocking an upload the user came here to make.
 */
export function PhotoAdjustSheet({
  open,
  file,
  aspect,
  initialFraming,
  onCancel,
  onConfirm,
}: PhotoAdjustSheetProps) {
  return (
    <Sheet open={open && file !== null} onOpenChange={(o) => !o && onCancel()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="h-[92dvh] gap-0 border-t-0 bg-transparent p-0 shadow-none"
      >
        {file ? (
          <AdjustBody
            key={`${file.name}:${file.size}:${file.lastModified}`}
            file={file}
            aspect={aspect}
            initialFraming={initialFraming}
            onCancel={onCancel}
            onConfirm={onConfirm}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function AdjustBody({
  file,
  aspect,
  initialFraming,
  onCancel,
  onConfirm,
}: {
  file: File
  aspect: number
  initialFraming?: Framing
  onCancel: () => void
  onConfirm: (result: PhotoAdjustResult) => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [image, setImage] = useState<Size | null>(null)
  const [decodeFailed, setDecodeFailed] = useState(false)
  const [frame, setFrame] = useState<Size>({ width: 0, height: 0 })
  const [rawFraming, setFraming] = useState<Framing>(
    initialFraming ?? DEFAULT_FRAMING
  )
  const [busy, setBusy] = useState(false)

  // One object URL per file (the body is keyed by file, so a lazy initialiser is
  // exactly once), revoked on unmount — a leaked blob URL pins the whole decoded
  // image in memory, and these are phone photos.
  const [objectUrl] = useState(() => URL.createObjectURL(file))
  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl])

  // Measure the frame — every clamp is in frame pixels, so nothing can be
  // computed until it has a size.
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setFrame({ width: r.width, height: r.height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // DERIVED, not stored: a framing restored from an earlier session was legal
  // against THAT frame size, and the frame here depends on the viewport. Clamping
  // on render means there is no moment — not even one paint — where the image
  // fails to cover the frame, which storing-then-correcting could not promise.
  const framing =
    image && frame.width > 0 ? clampFraming(rawFraming, image, frame) : rawFraming

  /* ------------------------------------------------------------- gestures */

  // Active pointers, so one finger drags and two pinch — tracked here rather than
  // via touch events so it works identically with a mouse.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{
    distance: number
    scale: number
    framing: Framing
  } | null>(null)

  const ready = image !== null && frame.width > 0 && !decodeFailed

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!ready) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    gesture.current = null
  }, [ready])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!ready || !image) return
      const pts = pointers.current
      if (!pts.has(e.pointerId)) return
      const prev = pts.get(e.pointerId)!
      const next = { x: e.clientX, y: e.clientY }
      pts.set(e.pointerId, next)

      if (pts.size === 1) {
        setFraming((f) =>
          clampFraming(
            {
              ...f,
              offsetX: f.offsetX + (next.x - prev.x),
              offsetY: f.offsetY + (next.y - prev.y),
            },
            image,
            frame
          )
        )
        return
      }

      if (pts.size >= 2) {
        const [a, b] = [...pts.values()]
        const distance = Math.hypot(a.x - b.x, a.y - b.y)
        const rect = frameRef.current?.getBoundingClientRect()
        if (!rect || distance === 0) return
        // Pinch midpoint, relative to the frame's centre — the point we hold still.
        const focal = {
          x: (a.x + b.x) / 2 - (rect.left + rect.width / 2),
          y: (a.y + b.y) / 2 - (rect.top + rect.height / 2),
        }
        if (!gesture.current) {
          gesture.current = { distance, scale: framing.scale, framing }
          return
        }
        const g = gesture.current
        setFraming(
          scaleAbout(
            g.framing,
            (g.scale * distance) / g.distance,
            focal,
            image,
            frame
          )
        )
      }
    },
    [ready, image, frame, framing]
  )

  const endPointer = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) gesture.current = null
  }, [])

  // Trackpad / wheel zoom, so the step is usable on the dev preview too.
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!ready || !image) return
      const rect = frameRef.current?.getBoundingClientRect()
      if (!rect) return
      const focal = {
        x: e.clientX - (rect.left + rect.width / 2),
        y: e.clientY - (rect.top + rect.height / 2),
      }
      setFraming((f) =>
        scaleAbout(f, f.scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08), focal, image, frame)
      )
    },
    [ready, image, frame]
  )

  /* -------------------------------------------------------------- confirm */

  async function handleConfirm() {
    // Undecodable (HEIC outside Safari): pass the original through rather than
    // trapping the user in a step they can't complete.
    //
    // `frame.width` is in the guard for a reason: confirming before the
    // ResizeObserver has measured makes `coverScale` zero, which propagates NaN
    // through the crop into `canvas.width` — and a NaN width silently becomes a
    // 0×0 canvas, so `toBlob` can hand back a BLANK image that we'd then upload
    // as the user's photo. Falling back to the original is the only safe answer.
    if (!image || decodeFailed || !objectUrl || frame.width <= 0 || frame.height <= 0) {
      onConfirm({ file, framing, original: file })
      return
    }
    setBusy(true)
    try {
      const crop = cropRect(framing, image, frame)
      const out = outputSize(crop, MAX_OUTPUT_EDGE)
      // Belt and braces on the same failure mode: never hand the canvas a
      // non-finite size, because it coerces to 0 and encodes a blank image
      // instead of throwing.
      if (!Number.isFinite(out.width) || !Number.isFinite(out.height)) {
        throw new Error("bad output size")
      }
      const canvas = document.createElement("canvas")
      canvas.width = out.width
      canvas.height = out.height
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("no 2d context")
      const bitmap = new Image()
      bitmap.src = objectUrl
      await bitmap.decode()
      ctx.drawImage(
        bitmap,
        crop.sx,
        crop.sy,
        crop.sWidth,
        crop.sHeight,
        0,
        0,
        out.width,
        out.height
      )
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, OUTPUT_TYPE, OUTPUT_QUALITY)
      )
      if (!blob) throw new Error("encode failed")
      const name = file.name.replace(/\.[^.]+$/, "") + ".jpg"
      onConfirm({
        file: new File([blob], name, { type: OUTPUT_TYPE }),
        framing,
        original: file,
      })
    } catch {
      // Anything unexpected in the canvas path: the photo still matters more than
      // the framing, so save what they chose.
      onConfirm({ file, framing, original: file })
    } finally {
      setBusy(false)
    }
  }

  // The rendered image is sized to COVER the frame at scale 1, then transformed —
  // so the CSS below and `cropRect` describe the same region by construction.
  const cover =
    image && frame.width > 0
      ? Math.max(frame.width / image.width, frame.height / image.height)
      : 1
  const limits = image ? maxOffset(image, frame, framing.scale) : { x: 0, y: 0 }
  const canPan = limits.x > 0.5 || limits.y > 0.5

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-t-3xl hairline-t bg-bg-surface shadow-lg">
      {/* Header */}
      <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4 pt-4 pb-3">
        <button
          type="button"
          onClick={onCancel}
          className="justify-self-start text-base text-text-muted transition-colors hover:text-text-primary"
        >
          Cancel
        </button>
        <SheetTitle className="justify-self-center text-base font-medium text-foreground">
          Adjust
        </SheetTitle>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className="justify-self-end text-base font-medium text-foreground transition-colors hover:opacity-80 disabled:text-text-subtle"
        >
          {busy ? "Saving…" : "Done"}
        </button>
      </div>
      <SheetDescription className="sr-only">
        Pinch to zoom and drag to reposition the photo inside the frame.
      </SheetDescription>

      <div className="flex flex-1 flex-col justify-center px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        {/* The frame. Fixed ratio, never moves — only the image inside it does. */}
        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onWheel={onWheel}
          style={{ aspectRatio: String(aspect) }}
          className={cn(
            "relative w-full touch-none overflow-hidden rounded-2xl bg-bg-surface-raised select-none",
            canPan ? "cursor-grab active:cursor-grabbing" : "cursor-default"
          )}
        >
          {objectUrl && !decodeFailed && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={objectUrl}
              alt=""
              draggable={false}
              onLoad={(e) => {
                const el = e.currentTarget
                setImage({ width: el.naturalWidth, height: el.naturalHeight })
              }}
              onError={() => setDecodeFailed(true)}
              style={
                image
                  ? {
                      width: image.width * cover,
                      height: image.height * cover,
                      transform: `translate(-50%, -50%) translate(${framing.offsetX}px, ${framing.offsetY}px) scale(${framing.scale})`,
                    }
                  : { opacity: 0 }
              }
              className="absolute top-1/2 left-1/2 max-w-none origin-center"
            />
          )}

          {/* Rule-of-thirds guides (Adrian's pick) — hairlines at 25% opacity on the
              white accent, so they read as alignment marks over any photo without
              becoming decoration. Purely visual: never captured in the output. */}
          {ready && (
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <span className="absolute top-0 bottom-0 left-1/3 w-px bg-accent-primary/25" />
              <span className="absolute top-0 bottom-0 left-2/3 w-px bg-accent-primary/25" />
              <span className="absolute top-1/3 right-0 left-0 h-px bg-accent-primary/25" />
              <span className="absolute top-2/3 right-0 left-0 h-px bg-accent-primary/25" />
            </div>
          )}

          {decodeFailed && (
            <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-text-muted">
              This photo can&apos;t be previewed on this device. Done will save it
              as it is.
            </p>
          )}
        </div>

        <p className="mt-3 px-1 text-center text-xs text-text-subtle">
          {decodeFailed
            ? "Saved without adjusting."
            : "Pinch to zoom, drag to reposition."}
        </p>
      </div>
    </div>
  )
}
