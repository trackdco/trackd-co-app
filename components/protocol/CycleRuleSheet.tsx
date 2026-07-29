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
import { cn } from "@/lib/utils"
import {
  CYCLE_COLOURS,
  CYCLE_COLOUR_LABELS,
  DEFAULT_CYCLE_COLOUR,
  availableCycleEnds,
  cycleColourVar,
  type CycleColour,
  type CycleEnd,
  type CyclePattern,
  type CycleRule,
} from "@/lib/protocol/cycleRule"

const FIELD =
  "h-11 w-full min-w-0 rounded-xl border border-border-default bg-bg-input px-3 text-base text-foreground shadow-xs outline-none transition-colors [color-scheme:dark] focus-visible:border-border-strong"
const LABEL = "text-xs font-medium uppercase tracking-[0.14em] text-text-muted"

const END_LABELS: Record<CycleEnd["type"], string> = {
  never: "No end",
  onDate: "Ends on a date",
  afterRounds: "Ends after rounds",
  whenVialEmpty: "Ends when the vial runs out",
}

function todayKey(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * Create or edit a compound's cycle — **the one implementation both entry points
 * use** (Spec 06). Protocol → Cycles saves it straight through
 * `setCompoundCycle`; the add-compound form holds the returned rule in its own
 * state until the compound exists, then writes it the same way. The sheet itself
 * persists nothing, which is exactly what lets one form serve both.
 *
 * Cycles are never named — a cycle is just its compound — so there is no name
 * field here by design.
 */
export function CycleRuleSheet({
  open,
  onOpenChange,
  compoundName,
  cycle,
  vialTracked,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  compoundName: string
  cycle: CycleRule | null
  /** Whether this compound's stock is tracked — gates the vial end condition. */
  vialTracked: boolean
  /** `null` removes the cycle; the compound then runs on its schedule alone. */
  onSave: (cycle: CycleRule | null) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl border-border-default bg-bg-surface"
      >
        <SheetHeader>
          <SheetTitle className={SHEET_TITLE}>
            {cycle ? "Edit cycle" : "Add cycle"}
          </SheetTitle>
          <p className="text-sm text-text-muted">{compoundName}</p>
        </SheetHeader>
        {open && (
          <CycleRuleForm
            key={cycle ? "edit" : "new"}
            cycle={cycle}
            vialTracked={vialTracked}
            onClose={() => onOpenChange(false)}
            onSave={onSave}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function CycleRuleForm({
  cycle,
  vialTracked,
  onClose,
  onSave,
}: {
  cycle: CycleRule | null
  vialTracked: boolean
  onClose: () => void
  onSave: (cycle: CycleRule | null) => void
}) {
  const initOnOff = cycle?.pattern.type === "onOff" ? cycle.pattern : null
  const [repeats, setRepeats] = useState(initOnOff !== null)
  const [onDays, setOnDays] = useState(String(initOnOff?.onDays ?? 7))
  const [offDays, setOffDays] = useState(String(initOnOff?.offDays ?? 7))
  const [endType, setEndType] = useState<CycleEnd["type"]>(cycle?.end.type ?? "never")
  const [endDate, setEndDate] = useState(
    cycle?.end.type === "onDate" ? cycle.end.date : ""
  )
  const [rounds, setRounds] = useState(
    cycle?.end.type === "afterRounds" ? String(cycle.end.rounds) : "4"
  )
  const [colour, setColour] = useState<CycleColour>(cycle?.colour ?? DEFAULT_CYCLE_COLOUR)
  const [anchor, setAnchor] = useState(cycle?.anchor ?? todayKey())

  const pattern: CyclePattern = repeats
    ? {
        type: "onOff",
        onDays: Math.max(1, Number(onDays) || 0),
        offDays: Math.max(0, Number(offDays) || 0),
      }
    : { type: "continuous" }

  const offerable = availableCycleEnds(pattern, { vialTracked })
  // Turning off the repeat takes "after rounds" with it — a round needs an
  // off-period to exist — so fall back rather than saving an impossible rule.
  const effectiveEndType = offerable.includes(endType) ? endType : "never"

  const valid =
    // A cleared date input yields "", which `dayNumber` can't parse — the cycle
    // would then be OFF on every date and the compound would vanish from the log,
    // the week strip and the calendar with nothing to explain it.
    /^\d{4}-\d{2}-\d{2}$/.test(anchor) &&
    (effectiveEndType !== "onDate" || /^\d{4}-\d{2}-\d{2}$/.test(endDate)) &&
    (effectiveEndType !== "afterRounds" || Number(rounds) > 0) &&
    (!repeats || Number(onDays) > 0)

  function buildEnd(): CycleEnd {
    switch (effectiveEndType) {
      case "onDate":
        return { type: "onDate", date: endDate }
      case "afterRounds":
        return { type: "afterRounds", rounds: Math.max(1, Number(rounds) || 1) }
      case "whenVialEmpty":
        return { type: "whenVialEmpty" }
      default:
        return { type: "never" }
    }
  }

  function save() {
    if (!valid) return
    onSave({ pattern, end: buildEnd(), colour, anchor })
    onClose()
  }

  return (
    <div className="space-y-5 px-4 pb-2">
      {/* Pattern */}
      <div className="space-y-3">
        <p className={LABEL}>Pattern</p>
        <div className="grid grid-cols-2 gap-2">
          <PatternOption
            label="Continuous"
            hint="Runs every scheduled day"
            selected={!repeats}
            onSelect={() => setRepeats(false)}
          />
          <PatternOption
            label="On / off"
            hint="Alternates, repeating"
            selected={repeats}
            onSelect={() => setRepeats(true)}
          />
        </div>
        {repeats && (
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className={LABEL}>Days on</span>
              <input
                className={FIELD}
                inputMode="numeric"
                value={onDays}
                onChange={(e) => setOnDays(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            <label className="space-y-1">
              <span className={LABEL}>Days off</span>
              <input
                className={FIELD}
                inputMode="numeric"
                value={offDays}
                onChange={(e) => setOffDays(e.target.value.replace(/\D/g, ""))}
              />
            </label>
          </div>
        )}
      </div>

      {/* Start */}
      <label className="space-y-1 block">
        <span className={LABEL}>Starts</span>
        <input
          type="date"
          className={FIELD}
          value={anchor}
          onChange={(e) => setAnchor(e.target.value)}
        />
      </label>

      {/* End condition */}
      <div className="space-y-2">
        <p className={LABEL}>End</p>
        <div className="divide-y divide-border-default rounded-2xl bg-bg-surface-raised">
          {offerable.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setEndType(t)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:scale-[0.98]"
            >
              <span
                className={cn(
                  "h-4 w-4 shrink-0 rounded-full border",
                  effectiveEndType === t
                    ? "border-accent-primary bg-accent-primary"
                    : "border-border-strong"
                )}
              />
              <span className="text-sm text-foreground">{END_LABELS[t]}</span>
            </button>
          ))}
        </div>
        {effectiveEndType === "onDate" && (
          <input
            type="date"
            className={FIELD}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        )}
        {effectiveEndType === "afterRounds" && (
          <label className="space-y-1 block">
            <span className={LABEL}>Rounds</span>
            <input
              className={FIELD}
              inputMode="numeric"
              value={rounds}
              onChange={(e) => setRounds(e.target.value.replace(/\D/g, ""))}
            />
            <span className="text-xs text-text-muted">
              One round is {repeats ? `${pattern.type === "onOff" ? pattern.onDays : 0} on plus ${pattern.type === "onOff" ? pattern.offDays : 0} off` : "one on and off period"}.
            </span>
          </label>
        )}
      </div>

      {/* Colour */}
      <div className="space-y-2">
        <p className={LABEL}>Colour</p>
        <div className="flex flex-wrap gap-2">
          {CYCLE_COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={CYCLE_COLOUR_LABELS[c]}
              aria-pressed={colour === c}
              onClick={() => setColour(c)}
              style={{ background: cycleColourVar(c) }}
              className={cn(
                "h-9 w-9 rounded-full transition active:scale-[0.94]",
                colour === c && "ring-2 ring-accent-primary ring-offset-2 ring-offset-bg-surface"
              )}
            />
          ))}
        </div>
      </div>

      <SheetFooter className="flex-row gap-2 px-0">
        {cycle && (
          <button
            type="button"
            onClick={() => {
              onSave(null)
              onClose()
            }}
            className="h-11 flex-1 rounded-xl border border-border-default text-sm text-text-muted transition active:scale-[0.98]"
          >
            Remove
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!valid}
          className="h-11 flex-1 rounded-xl bg-accent-primary text-sm font-medium text-bg-base transition active:scale-[0.98] disabled:opacity-40"
        >
          Save
        </button>
      </SheetFooter>
    </div>
  )
}

function PatternOption({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string
  hint: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "rounded-2xl px-3 py-3 text-left transition active:scale-[0.98]",
        selected ? "bg-bg-input" : "bg-bg-surface-raised"
      )}
    >
      <span
        className={cn(
          "block text-sm",
          selected ? "text-foreground" : "text-text-muted"
        )}
      >
        {label}
      </span>
      <span className="mt-0.5 block text-xs text-text-subtle">{hint}</span>
    </button>
  )
}
