"use client"

import { useState } from "react"
import { Check } from "lucide-react"

import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"

type SaveResult = { ok: boolean; error?: string }

interface LogWeightSheetProps {
  open: boolean
  unit: string
  /** Prefill with the latest known weight so a small tweak is one tap. */
  defaultValue: string
  onOpenChange: (open: boolean) => void
  /** Persists the weight (server action) — resolves ok/error. */
  onSave: (weightKg: number) => Promise<SaveResult>
}

/**
 * Log today's bodyweight. Saves through a server action into `body_metrics`
 * (one row per day, RLS-scoped) and on success shows a brief green tick before
 * closing; the chart then refreshes to include it. Only works signed-in — in a
 * no-auth context (the dev preview) the action returns a "not signed in" error,
 * surfaced inline.
 */
export function LogWeightSheet({
  open,
  unit,
  defaultValue,
  onOpenChange,
  onSave,
}: LogWeightSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 rounded-t-3xl border-t border-border-default bg-bg-surface p-0 shadow-lg"
      >
        <LogWeightBody
          unit={unit}
          defaultValue={defaultValue}
          onClose={() => onOpenChange(false)}
          onSave={onSave}
        />
      </SheetContent>
    </Sheet>
  )
}

function LogWeightBody({
  unit,
  defaultValue,
  onClose,
  onSave,
}: {
  unit: string
  defaultValue: string
  onClose: () => void
  onSave: (weightKg: number) => Promise<SaveResult>
}) {
  const [value, setValue] = useState(defaultValue)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    const kg = parseFloat(value)
    if (!Number.isFinite(kg)) {
      setError("Enter your weight.")
      return
    }
    setSaving(true)
    setError(null)
    const res = await onSave(kg)
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      window.setTimeout(onClose, 1100)
    } else {
      setError(res.error ?? "Couldn't save. Try again.")
    }
  }

  return (
    <div className="relative flex flex-col">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 pt-4 pb-3">
        <SheetClose className="justify-self-start text-base text-text-muted transition-colors hover:text-text-primary">
          Cancel
        </SheetClose>
        <SheetTitle className="justify-self-center text-base font-semibold text-foreground">
          Log weight
        </SheetTitle>
        <span aria-hidden className="justify-self-end" />
      </div>

      <SheetDescription className="sr-only">
        Enter today&apos;s bodyweight to save it to your history.
      </SheetDescription>

      <div className="px-6 pt-2 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
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
                setError(null)
                setValue(e.target.value)
              }}
              aria-label={`Weight in ${unit}`}
              aria-invalid={error ? true : undefined}
              className="h-12 rounded-xl border-border-default bg-bg-input pr-14 font-mono text-base dark:bg-bg-input"
            />
            <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-text-muted">
              {unit}
            </span>
          </div>
          {error && (
            <p className="mt-1.5 px-1 text-sm text-state-error">{error}</p>
          )}
        </label>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-6 w-full rounded-xl bg-accent-primary py-3 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Success state — UI feedback only (sanctioned green). */}
      {saved && (
        <div
          aria-label="Weight saved"
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
          <span className="animate-shortcut-fade text-base font-semibold">Saved</span>
        </div>
      )}
    </div>
  )
}
