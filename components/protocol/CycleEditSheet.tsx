"use client"

import { useState } from "react"

import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { SHEET_TITLE } from "@/lib/ui-presets"
import { ensureActiveCycle, updateCycle } from "@/lib/db/cycles"
import { cycleTotalWeeks, endDateFromLength, todayKey } from "@/lib/protocol/cycle"
import type { Cycle } from "@/lib/db/types"

const FIELD =
  "h-11 w-full min-w-0 rounded-xl border border-border-default bg-bg-input px-3 text-base text-foreground shadow-xs outline-none transition-colors [color-scheme:dark] focus-visible:border-accent-amber"
const LABEL = "text-xs font-medium uppercase tracking-[0.14em] text-text-muted"

/**
 * Cycle builder — name, start date, and length (weeks) for the active cycle
 * (Protocol Cutover, Step 4). Writes to `cycles` via `lib/db/*` (creating the
 * active "Current" cycle first if none exists). `ended_on` is derived from the
 * length. A bottom sheet with Save / Cancel (no drag-dismiss — like the
 * full-screen add sheet, to avoid losing a half-filled form).
 *
 * The form is a child mounted only while open + keyed by cycle id, so it seeds
 * from props via `useState` initializers (no setState-in-effect / cascading render).
 */
export function CycleEditSheet({
  open,
  onOpenChange,
  cycle,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  cycle: Cycle | null
  onSaved: (cycle: Cycle) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // Don't auto-focus the Name field on open — keeps the keypad from popping
        // up over the form before the user taps a field.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="rounded-t-3xl border-border-default bg-bg-surface"
      >
        <SheetHeader>
          <SheetTitle className={SHEET_TITLE}>Edit cycle</SheetTitle>
        </SheetHeader>
        {open && (
          <CycleEditForm
            key={cycle?.id ?? "new"}
            cycle={cycle}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function CycleEditForm({
  cycle,
  onClose,
  onSaved,
}: {
  cycle: Cycle | null
  onClose: () => void
  onSaved: (cycle: Cycle) => void
}) {
  const [name, setName] = useState(cycle?.name ?? "Current")
  const [startDate, setStartDate] = useState(cycle?.started_on ?? todayKey())
  const initWeeks = cycle ? cycleTotalWeeks(cycle) : null
  const [lengthWeeks, setLengthWeeks] = useState(initWeeks ? String(initWeeks) : "")
  const [description, setDescription] = useState(cycle?.notes ?? "")
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const target = cycle ?? (await ensureActiveCycle())
      if (!target) return // offline / signed out — best-effort
      const n = Number(lengthWeeks)
      const ended = startDate && n > 0 ? endDateFromLength(startDate, n) : null
      const updated = await updateCycle(target.id, {
        name: name.trim() || "Current",
        started_on: startDate || null,
        ended_on: ended,
        notes: description.trim() || null,
      })
      if (!updated) return // keep the sheet open so edits aren't silently dropped
      onSaved(updated)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="space-y-4 px-4">
        <label className="block space-y-1.5">
          <span className={LABEL}>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="e.g. Summer Cut 2026"
            className={FIELD}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className={LABEL}>Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="block space-y-1.5">
            <span className={LABEL}>Length (wks)</span>
            <input
              value={lengthWeeks}
              onChange={(e) => setLengthWeeks(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
              inputMode="numeric"
              placeholder="optional"
              className={FIELD}
            />
          </label>
        </div>
        <p className="px-1 text-xs text-text-subtle">
          Length drives the “Week X of N” marker. Leave blank for an open-ended cycle.
        </p>

        <label className="block space-y-1.5">
          <span className={LABEL}>Description — optional</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 500))}
            rows={2}
            placeholder="e.g. 12-week cut into the June show — what this cycle is about"
            className="w-full min-w-0 resize-none rounded-xl border border-border-default bg-bg-input px-3 py-2.5 text-base text-foreground shadow-xs outline-none transition-colors focus-visible:border-accent-amber"
          />
        </label>
      </div>

      <SheetFooter className="flex-row gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-bg-surface-raised"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex-1 rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </SheetFooter>
    </>
  )
}
