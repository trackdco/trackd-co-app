"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { logWeight } from "@/app/(app)/weight/actions"
import { toDateKey } from "@/lib/home/mockHomeData"
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

interface AddWeightSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The user's display weight unit (kg/lbs). Storage is always kilograms. */
  unit: WeightUnit
}

/**
 * The quick "log today's weight" bottom sheet — opened from the + menu's Weight
 * tile. A single weight field (in the user's unit) writes one entry for TODAY to
 * `weight_logs` via the shared `logWeight` action (re-logging the day UPSERTs).
 * Back-dating, the graph, and history live in the full Weight view (tap the home
 * Weight card). The body remounts each open (Radix presence), so the field is
 * always fresh; the success tick rides the close animation out.
 */
export function AddWeightSheet({ open, onOpenChange, unit }: AddWeightSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 border-t-0 bg-transparent p-0 shadow-none"
      >
        <AddWeightBody unit={unit} onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  )
}

function AddWeightBody({
  unit,
  onClose,
}: {
  unit: WeightUnit
  onClose: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startY: number; height: number } | null>(null)
  const [offsetY, setOffsetY] = useState(0)
  const [dragging, setDragging] = useState(false)

  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  // Auto-close after the success tick. The log is already committed server-side,
  // so dismissing the tick can never undo it.
  useEffect(() => {
    if (!saved) return
    const t = setTimeout(onClose, SUCCESS_MS)
    return () => clearTimeout(t)
  }, [saved, onClose])

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
        `Enter a weight between ${formatWeight(30, unit)} and ${formatWeight(
          300,
          unit
        )} ${unit}.`
      )
      return
    }
    setError(null)
    // "today" from the DEVICE clock (local) — never a server UTC date — so the
    // entry lands on the user's actual day.
    const loggedFor = toDateKey(new Date())
    startTransition(async () => {
      const res = await logWeight(kg, loggedFor)
      if (res.ok) setSaved(true)
      else setError(res.error ?? "Couldn't save. Try again.")
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

  return (
    <div
      ref={cardRef}
      style={{
        transform: `translateY(${offsetY}px)`,
        transition: dragging ? "none" : "transform 250ms ease-out",
      }}
      className="relative flex flex-col overflow-hidden rounded-t-3xl border-t border-border-default bg-bg-surface shadow-lg"
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
        Enter today&apos;s bodyweight to add it to your log.
      </SheetDescription>

      <div className="px-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
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

        {error && <p className="mt-2 px-1 text-xs text-state-error">{error}</p>}

        <p className="mt-2 px-1 text-xs text-text-subtle">
          Adds to today&apos;s log. To back-date or see your graph, open Weight
          from the home screen.
        </p>

        <div className="mt-6 flex gap-3">
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
      </div>

      {/* Full-bleed success state — UI feedback only (sanctioned green). The log
          is already committed; tapping just dismisses (it can't undo anything). */}
      {saved && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Weight logged"
          className={cn(
            "animate-shortcut-fade absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-t-3xl bg-accent-green text-bg-base"
          )}
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
          <span className="animate-shortcut-fade text-base font-semibold">
            Logged
          </span>
        </button>
      )}
    </div>
  )
}
