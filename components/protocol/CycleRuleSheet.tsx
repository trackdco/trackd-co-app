"use client"

import { useEffect, useRef, useState } from "react"

import { BottomSheet } from "@/components/layout/BottomSheet"
import { DateField, type DateFieldHandle } from "@/components/feel/DateField"
import { NumberPad, PadInput, type PadField } from "@/components/feel/NumberPad"
import { ThumbGroup } from "@/components/feel/SlidingThumb"
import { usePadSession } from "@/components/feel/usePadSession"
import { toDateKey } from "@/lib/home/mockHomeData"
import {
  CARD_EYEBROW,
  CHIP_THUMB,
  FIELD_LABEL,
  INLINE_NOTE,
  PRESS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SEGMENTED_ITEM_LG,
  SEGMENTED_TRACK,
} from "@/lib/ui-presets"
import { cn } from "@/lib/utils"
import {
  CYCLE_COLOURS,
  CYCLE_COLOUR_LABELS,
  cycleColourVar,
  type CycleEnd,
  type CycleRule,
} from "@/lib/protocol/cycleRule"
import {
  cycleDraftIssue,
  cycleFromDraft,
  draftEndType,
  draftEnds,
  draftFromCycle,
  patternMeaning,
  roundWords,
  type CycleDraft,
  type CycleField,
  type CycleIssue,
} from "@/lib/protocol/cycleForm"

/** A group's heading in the sheet ("Pattern", "End", "Colour"): the eyebrow
 *  (consistency fix #14). A field's own label is `FIELD_LABEL` (fix #19). */
const GROUP = CARD_EYEBROW

const END_LABELS: Record<CycleEnd["type"], string> = {
  never: "No end",
  onDate: "On a date",
  afterRounds: "After rounds",
  whenVialEmpty: "Vial runs out",
}

/** How long a refused field shakes. Matches `.field-shake` in `globals.css`. */
const SHAKE_MS = 320

/**
 * Create or edit a compound's cycle: Protocol → Cycles saves it straight
 * through `setCompoundCycle` (Spec 06). The sheet itself persists nothing.
 *
 * Cycles are never named (a cycle is just its compound), so there is no name
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
  /** Whether this compound's stock is tracked: gates the vial end condition. */
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

/**
 * The form. SAVE IS NEVER DEAD (W47, Adrian 2026-09-26: "Cycles will not save
 * a cycle"): it stays live, and a Save that is missing something shakes that
 * field, says what it needs under it, and takes you there: the calendar opens
 * on a missing or impossible date, the pad on an empty number. The checks are
 * `cycleDraftIssue` (`lib/protocol/cycleForm.ts`), first field first.
 *
 * Continuous stays (W28, my call): it is the one way to run a compound every
 * scheduled day for a set stretch that then ends by itself and moves to Ended
 * (a twelve-week run, say). The line under the switch says what each pattern
 * means. It is offered with one end, a date, because a continuous cycle with
 * no end is no cycle at all (`availableCycleEnds`).
 *
 * Every date is the app's DateField (W32): the width of its column, never off
 * the screen edge, opening the app's own calendar.
 */
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
  // The device's today, read once for this open (never the server's, which is UTC).
  const [today] = useState(() => toDateKey(new Date()))
  const [draft, setDraft] = useState<CycleDraft>(() => draftFromCycle(cycle, today))
  const set = (patch: Partial<CycleDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const opts = { vialTracked }
  const offered = draftEnds(draft, opts)
  const endType = draftEndType(draft, opts)
  const issue = cycleDraftIssue(draft, opts)

  // What a refused Save says stays up, and follows the form, until it is
  // fixed: the line under the field goes the moment the field is right.
  const [tried, setTried] = useState(false)
  // Fixed: the form goes quiet again until the next Save.
  if (tried && !issue) setTried(false)
  const shown = tried ? issue : null
  const [shake, setShake] = useState<CycleField | null>(null)
  const shakeTimer = useRef<number | undefined>(undefined)
  const openTimer = useRef<number | undefined>(undefined)
  const startRef = useRef<DateFieldHandle>(null)
  const endRef = useRef<DateFieldHandle>(null)
  useEffect(
    () => () => {
      window.clearTimeout(shakeTimer.current)
      window.clearTimeout(openTimer.current)
    },
    [],
  )

  // The three lengths on one Trakabl pad (feel pass §3). Whole days, three
  // digits at most.
  const pad = usePadSession()
  const digits = (raw: string) => raw.replace(/\D/g, "").slice(0, 3)

  /** A refused Save: shake the field, then take the user to it. Cleared a
   *  frame apart, so a second refusal shakes it again. */
  function refuse(field: CycleField) {
    window.clearTimeout(shakeTimer.current)
    window.clearTimeout(openTimer.current)
    setShake(null)
    requestAnimationFrame(() => {
      setShake(field)
      shakeTimer.current = window.setTimeout(() => setShake(null), SHAKE_MS)
    })
    if (field === "anchor" || field === "endDate") {
      pad.close()
      const target = field === "anchor" ? startRef : endRef
      // The shake and the line read first; then the calendar opens on the date.
      openTimer.current = window.setTimeout(() => target.current?.open(), SHAKE_MS)
    } else {
      pad.open(field)
    }
  }

  function save() {
    if (issue) {
      setTried(true)
      refuse(issue.field)
      return
    }
    const rule = cycleFromDraft(draft, opts)
    if (!rule) return
    onSave(rule)
    onClose()
  }

  const fieldCls = (field: CycleField) => cn("h-11 w-full", shake === field && "field-shake")
  const wrong = (field: CycleField) => shown?.field === field
  const rounds = roundWords(draft)

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={cycle ? "Edit cycle" : "New cycle"}
      description={compoundName}
      desktop="rail"
      // Cancel and Save, like every other sheet (consistency fix #6). A cycle
      // ends from its row on the Cycles page, which asks first. Save is never
      // disabled: a refused Save says why (W47).
      footer={
        <>
          <button type="button" onClick={onClose} className={cn(SECONDARY_BUTTON, "flex-1")}>
            Cancel
          </button>
          <button type="button" onClick={save} className={cn(PRIMARY_BUTTON, "flex-1")}>
            Save
          </button>
        </>
      }
    >
      <p className="mb-4 truncate text-sm text-text-muted">{compoundName}</p>
      {/* The sections rise in as the sheet lands (feel pass §4). */}
      <div data-sheet-body className="space-y-5 pb-2">
        {/* Pattern */}
        <div className="space-y-2">
          <p className={GROUP}>Pattern</p>
          <ThumbGroup
            selection={draft.repeats}
            thumbClassName={CHIP_THUMB}
            role="group"
            aria-label="Pattern"
            className={SEGMENTED_TRACK}
          >
            {(
              [
                { repeats: true, label: "On / off" },
                { repeats: false, label: "Continuous" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => set({ repeats: opt.repeats })}
                aria-pressed={draft.repeats === opt.repeats}
                className={cn(
                  SEGMENTED_ITEM_LG,
                  draft.repeats === opt.repeats ? "font-medium text-bg-base" : "text-text-muted hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </ThumbGroup>
          {/* What the chosen pattern means, in one line (W28). */}
          <p key={String(draft.repeats)} className={cn(INLINE_NOTE, "animate-hl-swap")}>
            {patternMeaning(draft.repeats)}
          </p>
          {draft.repeats && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="min-w-0">
                <label className="block">
                  <span className={FIELD_LABEL}>Days on</span>
                  <PadInput
                    {...pad.bind("onDays")}
                    value={draft.onDays}
                    label="Days on"
                    unit="days"
                    invalid={wrong("onDays")}
                    className={fieldCls("onDays")}
                  />
                </label>
                <Reason issue={shown} field="onDays" />
              </div>
              <div className="min-w-0">
                <label className="block">
                  <span className={FIELD_LABEL}>Days off</span>
                  <PadInput
                    {...pad.bind("offDays")}
                    value={draft.offDays}
                    label="Days off"
                    unit="days"
                    invalid={wrong("offDays")}
                    className={fieldCls("offDays")}
                  />
                </label>
                <Reason issue={shown} field="offDays" />
              </div>
            </div>
          )}
        </div>

        {/* Start */}
        <div>
          <label className="block">
            <span className={FIELD_LABEL}>Starts</span>
            <DateField
              ref={startRef}
              label="Start date"
              value={draft.anchor}
              onChange={(key) => set({ anchor: key })}
              todayKey={today}
              invalid={wrong("anchor") || undefined}
              className={cn(shake === "anchor" && "field-shake")}
            />
          </label>
          <Reason issue={shown} field="anchor" />
        </div>

        {/* End condition */}
        <div className="space-y-2">
          <p className={GROUP}>End</p>
          {offered.length > 1 ? (
            <ThumbGroup
              selection={endType}
              thumbClassName={CHIP_THUMB}
              role="group"
              aria-label="End"
              className={SEGMENTED_TRACK}
            >
              {offered.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set({ endType: t })}
                  aria-pressed={endType === t}
                  className={cn(
                    SEGMENTED_ITEM_LG,
                    "min-w-0 px-2",
                    endType === t ? "font-medium text-bg-base" : "text-text-muted hover:text-foreground",
                  )}
                >
                  {END_LABELS[t]}
                </button>
              ))}
            </ThumbGroup>
          ) : null}
          {endType === "onDate" && (
            <div className={cn(offered.length > 1 && "animate-hl-swap")}>
              <label className="block">
                {/* The end date is the last day ON: the cycle ends the day after
                    (`hasEndedBy`). */}
                <span className={FIELD_LABEL}>Last day</span>
                <DateField
                  ref={endRef}
                  label="Last day"
                  value={draft.endDate}
                  onChange={(key) => set({ endDate: key })}
                  /* The calendar cannot offer a day the rule would reject. */
                  min={/^\d{4}-\d{2}-\d{2}$/.test(draft.anchor) ? draft.anchor : null}
                  todayKey={today}
                  invalid={wrong("endDate") || undefined}
                  className={cn(shake === "endDate" && "field-shake")}
                />
              </label>
              <Reason issue={shown} field="endDate" />
            </div>
          )}
          {endType === "afterRounds" && (
            <div className="animate-hl-swap">
              <label className="block">
                <span className={FIELD_LABEL}>Rounds</span>
                <PadInput
                  {...pad.bind("rounds")}
                  value={draft.rounds}
                  label="Rounds"
                  invalid={wrong("rounds")}
                  className={fieldCls("rounds")}
                />
              </label>
              {rounds ? <p className="mt-1.5 text-xs text-text-muted">{rounds}</p> : null}
              <Reason issue={shown} field="rounds" />
            </div>
          )}
        </div>

        {/* Colour: where the cycle shows in its own colour (the Timeline and
            the calendar). Rounded squares, like every other swatch. */}
        <div className="space-y-2">
          <p className={GROUP}>Colour</p>
          <div className="grid grid-cols-6 place-items-center gap-2">
            {CYCLE_COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={CYCLE_COLOUR_LABELS[c]}
                aria-pressed={draft.colour === c}
                onClick={() => set({ colour: c })}
                style={{ background: cycleColourVar(c) }}
                className={cn(
                  PRESS.tick,
                  "h-9 w-9 rounded-lg transition-shadow",
                  draft.colour === c && "ring-2 ring-foreground ring-offset-2 ring-offset-bg-surface",
                )}
              />
            ))}
          </div>
        </div>

        <NumberPad
          {...pad.padProps([
            ...(draft.repeats
              ? ([
                  { id: "onDays", label: "Days on", short: "On", unit: "days", value: draft.onDays, onChange: (v) => set({ onDays: v }), decimal: false, sanitize: digits },
                  { id: "offDays", label: "Days off", short: "Off", unit: "days", value: draft.offDays, onChange: (v) => set({ offDays: v }), decimal: false, sanitize: digits },
                ] satisfies PadField[])
              : []),
            ...(endType === "afterRounds"
              ? ([
                  { id: "rounds", label: "Rounds", short: "Rounds", value: draft.rounds, onChange: (v) => set({ rounds: v }), decimal: false, sanitize: digits },
                ] satisfies PadField[])
              : []),
          ])}
          label="Cycle lengths"
        />
      </div>
    </BottomSheet>
  )
}

/** What a refused Save needs from this field, under it, until it is right. */
function Reason({ issue, field }: { issue: CycleIssue | null; field: CycleField }) {
  if (!issue || issue.field !== field) return null
  return (
    <p role="alert" className="animate-hl-swap mt-1.5 text-xs text-state-error">
      {issue.reason}
    </p>
  )
}
