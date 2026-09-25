"use client"

import { useState } from "react"

import { BottomSheet } from "@/components/layout/BottomSheet"
import {
  CARD_EYEBROW,
  FIELD_LABEL,
  INNER_RADIUS,
  PRESS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from "@/lib/ui-presets"
import { NumberPad, PadInput, type PadField } from "@/components/feel/NumberPad"
import { usePadSession } from "@/components/feel/usePadSession"
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
/** A group's heading in the sheet ("Pattern", "End", "Colour"): the eyebrow
 *  (consistency fix #14). A field's own label is `FIELD_LABEL` (fix #19). */
const GROUP = CARD_EYEBROW

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
  // THE ONE SHEET FRAME (consistency fix #1). The form owns the frame, so its
  // pinned footer can read the form. Each open starts a fresh form on the rule
  // it opened with, held while the sheet slides away.
  const [session, setSession] = useState(open ? 1 : 0)
  const [opened, setOpened] = useState({ compoundName, cycle, vialTracked })
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setSession((n) => n + 1)
      setOpened({ compoundName, cycle, vialTracked })
    }
  }
  if (session === 0) return null
  return (
    <CycleRuleForm
      key={session}
      open={open}
      onOpenChange={onOpenChange}
      compoundName={opened.compoundName}
      cycle={opened.cycle}
      vialTracked={opened.vialTracked}
      onSave={onSave}
    />
  )
}

function CycleRuleForm({
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
  vialTracked: boolean
  onSave: (cycle: CycleRule | null) => void
}) {
  const onClose = () => onOpenChange(false)
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

  // The three lengths on one Trakabl pad (feel pass §3). Whole days, three
  // digits at most.
  const pad = usePadSession()
  const digits = (raw: string) => raw.replace(/\D/g, "").slice(0, 3)

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
  // The fallback is the first OFFERABLE end, not a hardcoded "never": since
  // "never" stopped being offered for a continuous pattern, hardcoding it here
  // would have quietly saved the one combination we just removed.
  const effectiveEndType = offerable.includes(endType) ? endType : offerable[0]

  const valid =
    // A cleared date input yields "", which `dayNumber` can't parse — the cycle
    // would then be OFF on every date and the compound would vanish from the log,
    // the week strip and the calendar with nothing to explain it.
    /^\d{4}-\d{2}-\d{2}$/.test(anchor) &&
    (effectiveEndType !== "onDate" ||
      // AFTER the anchor, not merely a well-formed date. Saving an end date
      // before the start ended the cycle the instant it was written: the card
      // read "Ended", the schedule grid flipped every day to nothing-due, and
      // the compound vanished from Today's Log with no warning and no way back
      // except finding the cycle and removing it. The add form's own copy of
      // this field already had `min={cycle.anchor}`; the two entry points that
      // write the same rule were not validating it the same way.
      (/^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate >= anchor)) &&
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
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={cycle ? "Edit cycle" : "Add cycle"}
      description={compoundName}
      desktop="rail"
      // Cancel and Save, like every other sheet (consistency fix #6). A cycle
      // ends from its row on the Cycles page, which asks first.
      footer={
        <>
          <button type="button" onClick={onClose} className={cn(SECONDARY_BUTTON, "flex-1")}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!valid} className={cn(PRIMARY_BUTTON, "flex-1")}>
            Save
          </button>
        </>
      }
    >
      <p className="mb-4 truncate text-sm text-text-muted">{compoundName}</p>
      {/* The sections rise in as the sheet lands (feel pass §4). */}
      <div data-sheet-body className="space-y-5 pb-2">
        {/* Pattern */}
        <div className="space-y-3">
          <p className={GROUP}>Pattern</p>
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
              <label className="block">
                <span className={FIELD_LABEL}>Days on</span>
                <PadInput {...pad.bind("onDays")} value={onDays} label="Days on" unit="days" className="h-11 w-full" />
              </label>
              <label className="block">
                <span className={FIELD_LABEL}>Days off</span>
                <PadInput {...pad.bind("offDays")} value={offDays} label="Days off" unit="days" className="h-11 w-full" />
              </label>
            </div>
          )}
        </div>

        {/* Start */}
        <label className="block">
          <span className={FIELD_LABEL}>Starts</span>
          <input
            type="date"
            className={FIELD}
            value={anchor}
            onChange={(e) => setAnchor(e.target.value)}
          />
        </label>

        {/* End condition */}
        <div className="space-y-2">
          <p className={GROUP}>End</p>
          <div className="inst-rows">
            {offerable.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setEndType(t)}
                className={cn(PRESS.row, "flex w-full items-center gap-3 px-4 py-3 text-left")}
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
              /* The picker cannot offer a date the rule would reject. */
              min={anchor}
              aria-label="Cycle end date"
              onChange={(e) => setEndDate(e.target.value)}
            />
          )}
          {effectiveEndType === "afterRounds" && (
            <label className="block">
              <span className={FIELD_LABEL}>Rounds</span>
              <PadInput {...pad.bind("rounds")} value={rounds} label="Rounds" className="h-11 w-full" />
              <span className="mt-1 block text-xs text-text-muted">
                One round is {repeats ? `${pattern.type === "onOff" ? pattern.onDays : 0} on plus ${pattern.type === "onOff" ? pattern.offDays : 0} off` : "one on and off period"}.
              </span>
            </label>
          )}
        </div>

        {/* Colour */}
        <div className="space-y-2">
          <p className={GROUP}>Colour</p>
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
                  PRESS.tick,
                  "h-9 w-9 rounded-full transition",
                  colour === c && "ring-2 ring-accent-primary ring-offset-2 ring-offset-bg-surface"
                )}
              />
            ))}
          </div>
        </div>

        <NumberPad
          {...pad.padProps(
            [
              ...(repeats
                ? ([
                    { id: "onDays", label: "Days on", short: "On", unit: "days", value: onDays, onChange: setOnDays, decimal: false, sanitize: digits },
                    { id: "offDays", label: "Days off", short: "Off", unit: "days", value: offDays, onChange: setOffDays, decimal: false, sanitize: digits },
                  ] satisfies PadField[])
                : []),
              ...(effectiveEndType === "afterRounds"
                ? ([
                    { id: "rounds", label: "Rounds", short: "Rounds", value: rounds, onChange: setRounds, decimal: false, sanitize: digits },
                  ] satisfies PadField[])
                : []),
            ],
          )}
          label="Cycle lengths"
        />
      </div>
    </BottomSheet>
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
        PRESS.card,
        INNER_RADIUS,
        "px-3 py-3 text-left transition",
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
      <span className="mt-0.5 block text-xs text-text-muted">{hint}</span>
    </button>
  )
}
