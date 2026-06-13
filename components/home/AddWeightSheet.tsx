"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Camera, Check, Plus, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { PoseIcon } from "@/components/progress/PoseIcon"
import { PosePicker } from "@/components/progress/PosePicker"
import { createClient } from "@/lib/supabase/client"
import { logWeight } from "@/app/(app)/weight/actions"
import { addProgressPhoto } from "@/app/(app)/progress/actions"
import { toDateKey } from "@/lib/home/mockHomeData"
import { DEFAULT_POSES, poseLabel, poseShape } from "@/lib/progress/photos"
import {
  formatWeight,
  sanitizeWeightInput,
  unitToKg,
  type WeightUnit,
} from "@/lib/weight"

// Release the handle past this fraction of the sheet height → dismiss.
const DISMISS_THRESHOLD = 0.3
// How long the green success state lingers before auto-dismissing.
const SUCCESS_MS = 1100

const MAX_BYTES = 10 * 1024 * 1024
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
}

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`
}

interface AddWeightSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The user's display weight unit (kg/lbs). Storage is always kilograms. */
  unit: WeightUnit
  /** Scopes the progress-photo uploads to the signed-in user. */
  userId: string
}

interface Attachment {
  pose: string
  file: File
  previewUrl: string
}

/**
 * The quick "log today's weight" bottom sheet — opened from the + menu's Weight
 * tile. Logs one entry for TODAY to `weight_logs`, and — right there — lets you
 * attach progress photos for the three default poses (or your own), so a weight
 * + photo session is one action without visiting the Progress section. Each photo
 * saves to `progress_photos` dated today, so it's linked to this weight and lands
 * under the right pose automatically.
 */
export function AddWeightSheet({ open, onOpenChange, unit, userId }: AddWeightSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 border-t-0 bg-transparent p-0 shadow-none"
      >
        <AddWeightBody unit={unit} userId={userId} onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  )
}

function AddWeightBody({
  unit,
  userId,
  onClose,
}: {
  unit: WeightUnit
  userId: string
  onClose: () => void
}) {
  const router = useRouter()
  const cardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startY: number; height: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingPose = useRef<string | null>(null)
  const [offsetY, setOffsetY] = useState(0)
  const [dragging, setDragging] = useState(false)

  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  // Progress photos attached to this session, keyed by pose.
  const [attachments, setAttachments] = useState<Record<string, Attachment>>({})
  const [extraPoses, setExtraPoses] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

  // Auto-close after the success tick. The log is already committed server-side.
  useEffect(() => {
    if (!saved) return
    const t = setTimeout(onClose, SUCCESS_MS)
    return () => clearTimeout(t)
  }, [saved, onClose])

  // Revoke object URLs on unmount.
  useEffect(() => {
    return () => {
      for (const a of Object.values(attachments)) URL.revokeObjectURL(a.previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pickFor(pose: string) {
    pendingPose.current = pose
    fileRef.current?.click()
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ""
    const pose = pendingPose.current
    pendingPose.current = null
    if (!f || !pose) return
    if (!f.type.startsWith("image/")) {
      setError("Choose an image for the photo.")
      return
    }
    if (f.size > MAX_BYTES) {
      setError("That photo is over 10 MB.")
      return
    }
    setError(null)
    setAttachments((prev) => {
      if (prev[pose]) URL.revokeObjectURL(prev[pose].previewUrl)
      return { ...prev, [pose]: { pose, file: f, previewUrl: URL.createObjectURL(f) } }
    })
  }

  function removeAttachment(pose: string) {
    setAttachments((prev) => {
      const next = { ...prev }
      if (next[pose]) URL.revokeObjectURL(next[pose].previewUrl)
      delete next[pose]
      return next
    })
  }

  function addPose(p: string) {
    setExtraPoses((prev) => (prev.includes(p) ? prev : [...prev, p]))
    setPickerOpen(false)
  }

  function submit() {
    if (pending || saved) return
    const num = Number(value)
    if (!value || !Number.isFinite(num)) {
      setError("Enter your weight.")
      return
    }
    const kg = unitToKg(num, unit)
    if (kg < 30 || kg > 300) {
      setError(
        `Enter a weight between ${formatWeight(30, unit)} and ${formatWeight(300, unit)} ${unit}.`,
      )
      return
    }
    setError(null)
    const loggedFor = toDateKey(new Date())
    startTransition(async () => {
      const res = await logWeight(kg, loggedFor)
      if (!res.ok) {
        setError(res.error ?? "Couldn't save. Try again.")
        return
      }
      // Upload any attached progress photos — best-effort; the weight is logged.
      const atts = Object.values(attachments)
      if (atts.length > 0) {
        const supabase = createClient()
        for (const a of atts) {
          const ext = EXT[a.file.type] ?? "img"
          const path = `${userId}/${randomId()}/photo.${ext}`
          const up = await supabase.storage
            .from("progress-photos")
            .upload(path, a.file, { contentType: a.file.type, upsert: false })
          if (!up.error) await addProgressPhoto(a.pose, loggedFor, path)
        }
      }
      router.refresh()
      setSaved(true)
    })
  }

  /* --------------------------------------------------------- drag-to-dismiss */

  function handlePointerDown(e: React.PointerEvent) {
    const height = cardRef.current?.getBoundingClientRect().height ?? 0
    dragRef.current = { startY: e.clientY, height }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    setOffsetY(Math.max(0, Math.min(e.clientY - drag.startY, drag.height)))
  }

  function handlePointerUp() {
    const drag = dragRef.current
    dragRef.current = null
    setDragging(false)
    if (drag && offsetY > drag.height * DISMISS_THRESHOLD) {
      setOffsetY(0)
      onClose()
    } else {
      setOffsetY(0)
    }
  }

  const slots = [
    ...DEFAULT_POSES.map((p) => ({ pose: p.id, label: p.label, shape: p.shape })),
    ...extraPoses.map((c) => ({ pose: c, label: poseLabel(c), shape: poseShape(c) })),
  ]

  return (
    <div
      ref={cardRef}
      style={{
        transform: `translateY(${offsetY}px)`,
        transition: dragging ? "none" : "transform 250ms ease-out",
      }}
      className="relative flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl border-t border-border-default bg-bg-surface shadow-lg"
    >
      {/* Grab handle — drag down to dismiss. */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
      >
        <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
      </div>

      <SheetTitle className="px-6 text-base font-semibold text-foreground">
        Log weight
      </SheetTitle>
      <SheetDescription className="sr-only">
        Enter today&apos;s bodyweight and optionally attach progress photos.
      </SheetDescription>

      <div className="flex-1 overflow-y-auto px-6 pt-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
            Today&apos;s weight
          </span>
          <div className="relative">
            <Input
              autoFocus
              inputMode="decimal"
              value={value}
              onChange={(e) => {
                setValue(sanitizeWeightInput(e.target.value))
                if (error) setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder="0"
              aria-label={`Weight in ${unit}`}
              className="h-12 rounded-xl border-border-default bg-bg-input pr-14 font-mono text-base dark:bg-bg-input"
            />
            <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-text-muted">
              {unit}
            </span>
          </div>
        </label>

        {/* Progress photos — attach right here; saved to today, linked to this weight. */}
        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Add a progress photo
          </p>
          <p className="mt-0.5 text-xs text-text-subtle">
            Optional — lands under the right pose, dated today.
          </p>

          <div className="mt-3 flex flex-wrap gap-3">
            {slots.map((slot) => {
              const att = attachments[slot.pose]
              return (
                <div key={slot.pose} className="animate-shortcut-in flex w-[4.5rem] flex-col items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => (att ? removeAttachment(slot.pose) : pickFor(slot.pose))}
                    aria-label={att ? `Remove ${slot.label} photo` : `Add ${slot.label} photo`}
                    className={cn(
                      "relative flex h-[4.5rem] w-[4.5rem] items-center justify-center overflow-hidden rounded-full border transition-colors",
                      att
                        ? "border-accent-amber/50"
                        : "border-dashed border-border-strong bg-bg-input/40 text-text-muted hover:bg-bg-input/70",
                    )}
                  >
                    {att ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={att.previewUrl} alt="" className="h-full w-full object-cover object-top" />
                        <span className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-bg-base/80 text-text-primary">
                          <X className="h-3 w-3" aria-hidden />
                        </span>
                      </>
                    ) : slot.shape ? (
                      <PoseIcon shape={slot.shape} className="h-9 w-7" />
                    ) : (
                      <Camera className="h-6 w-6" aria-hidden />
                    )}
                  </button>
                  <span className="text-center text-[11px] leading-tight text-text-muted">
                    {slot.label}
                  </span>
                </div>
              )
            })}

            {/* Add a custom pose. */}
            <div className="flex w-[4.5rem] flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPickerOpen((o) => !o)}
                aria-label="Add a pose"
                aria-expanded={pickerOpen}
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
              <PosePicker
                exclude={[...DEFAULT_POSES.map((p) => p.id), ...extraPoses]}
                onPick={addPose}
              />
            </div>
          )}
        </div>

        {error && <p className="mt-3 px-1 text-xs text-state-error">{error}</p>}

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/heic"
          onChange={onFile}
          className="hidden"
        />

        <div className="h-3" />
      </div>

      {/* Action bar. */}
      <div className="flex shrink-0 gap-3 border-t border-border-default px-6 py-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <SheetClose className="flex-1 rounded-xl border border-border-strong py-3 text-sm font-medium text-text-muted transition-colors hover:text-text-primary">
          Cancel
        </SheetClose>
        <button
          type="button"
          onClick={submit}
          disabled={pending || saved}
          className="flex-[1.6] rounded-xl bg-accent-primary py-3 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Log weight"}
        </button>
      </div>

      {/* Full-bleed success state — UI feedback only (sanctioned green). */}
      {saved && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Weight logged"
          className="animate-shortcut-fade absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-t-3xl bg-accent-green text-bg-base"
        >
          <span className="relative flex h-16 w-16 items-center justify-center">
            <span
              aria-hidden
              className="animate-home-tick-ring absolute inset-0 rounded-full border-2 border-bg-base/40"
            />
            <span className="animate-home-tick-pop flex h-16 w-16 items-center justify-center rounded-full bg-bg-base/15">
              <Check className="h-9 w-9" strokeWidth={2.5} aria-hidden />
            </span>
          </span>
          <span className="animate-shortcut-fade text-base font-semibold">Logged</span>
        </button>
      )}
    </div>
  )
}
