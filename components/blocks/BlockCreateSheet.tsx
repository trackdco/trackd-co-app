"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, CircleNotch } from "@/components/icons"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { BottomSheet } from "@/components/layout/BottomSheet"
import { DateField } from "@/components/feel/DateField"
import {
  CHIP_THUMB,
  FIELD_LABEL,
  INLINE_NOTE,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SEGMENTED_ITEM_LG,
  SEGMENTED_TRACK,
} from "@/lib/ui-presets"
import { showToast } from "@/lib/toast"
import { blockErrorText } from "@/lib/blocks/errorText"
import { NumberPad, PadInput } from "@/components/feel/NumberPad"
import { ThumbGroup } from "@/components/feel/SlidingThumb"
import { formatWeight, sanitizeWeightInput } from "@/lib/weight"
import { startBlockAction } from "@/app/(app)/blocks/actions"
import { unitToKg, type WeightUnit } from "@/lib/weight"
import { localToday, lockedDirection } from "@/lib/blocks/block"
import type { BlockTarget, BlockTargetVariable } from "@/lib/blocks/block"

const NAME_MAX = 60 // matches the CHECK on blocks.name

const FIELD =
  "h-12 rounded-xl border-border-default bg-bg-input px-3 text-sm dark:bg-bg-input"

/**
 * Start a block (Adrian, 2026-07-30).
 *
 * A block always has a NAME and a START. **The end date and the target are
 * independent and both optional** — that is the settled shape and it is what
 * makes the feature fit real training: a cut has both, a comp prep has a hard
 * date and often no weight target, and an off-season has neither and is still
 * worth having because the retrospective is the point. Forcing a target onto an
 * off-season would only make people invent a number they do not believe.
 *
 * Starting a block CLOSES whatever was live (one at a time, enforced by a
 * partial unique index in the schema). The sheet says so before it happens
 * rather than after, because closing a sixteen-week prep is not something to
 * discover from a changed banner.
 *
 * The dates are the app's one date field (`DateField`, W32: the native inputs
 * ran off the screen in their half columns). A weight target's direction is
 * decided by the numbers once there is a weigh-in to compare with (W41,
 * `lockedDirection`): below it is Lose and Gain cannot be picked, above it the
 * reverse, and the last weigh-in is shown so the lock says why. Start block is
 * never dead: with no name it says so and takes you to the field.
 *
 * The one sheet frame (`BottomSheet`, consistency fix #1) with Cancel and
 * Start block (fix #2); every label is `FIELD_LABEL` (fix #19); the two
 * choices are the segmented control (fix #20); the closing line is an
 * `INLINE_NOTE` (fix #27), and the start is confirmed by the toast.
 */
export function BlockCreateSheet({
  open,
  onOpenChange,
  todayKey,
  liveBlockName,
  currentWeightKg,
  unit = "kg",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  todayKey: string
  /** The live block's name, when one is running and is about to be closed. */
  liveBlockName?: string | null
  /** The latest weigh-in: decides which way a weight target can point. */
  currentWeightKg?: number | null
  /** The unit the target is TYPED in. Storage stays kg; converted on save. */
  unit?: WeightUnit
}) {
  const router = useRouter()

  const [name, setName] = useState("")
  const [startedOn, setStartedOn] = useState(todayKey)
  const [endsOn, setEndsOn] = useState("")
  const [targetKind, setTargetKind] = useState<BlockTargetVariable | "none">("none")
  const [targetValue, setTargetValue] = useState("")
  // The user's own pick, used only while the numbers do not decide it (no
  // weigh-in yet, or the target equals it).
  const [direction, setDirection] = useState<"up" | "down">("down")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Set by a Start with no name, so the field says what is missing. */
  const [nameMissing, setNameMissing] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  // Reset when the sheet closes, so the next open is a fresh form rather than
  // the last abandoned one. Adjust-during-render rather than an effect: an
  // effect would paint the stale form for a frame first.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setName("")
      setStartedOn(todayKey)
      setEndsOn("")
      setTargetKind("none")
      setTargetValue("")
      setDirection("down")
      setBusy(false)
      setError(null)
      setNameMissing(false)
    }
  }

  const trimmedName = name.trim()
  const numericTarget = Number(targetValue)
  // The typed weight in KILOGRAMS. Everything downstream — the direction
  // below, and the value that is stored — works in kg, because that is the
  // unit `blocks`/`block_targets` and every weigh-in are held in. A
  // consistency target is a percentage and is never converted.
  const targetKg = targetKind === "weight" ? unitToKg(numericTarget, unit) : numericTarget
  const targetFilled = targetKind !== "none" && targetValue.trim() !== ""
  // Consistency is a percentage, so it has a real ceiling. The input carried a
  // `max` that nothing read, which let "90% consistency" become a 500 kg weight
  // target in two taps once the value survived a kind change.
  const targetTooHigh =
    targetFilled && targetKind === "consistency" && numericTarget > 100
  const targetValid =
    !targetFilled ||
    (Number.isFinite(numericTarget) && numericTarget > 0 && !targetTooHigh)
  // W41: the way a weight target points, when the numbers decide it.
  const locked =
    targetKind === "weight" && targetFilled && targetValid
      ? lockedDirection(targetKg, currentWeightKg)
      : null
  // What shows AND what is stored: consistency only ever goes up.
  const shownDirection: "up" | "down" =
    targetKind === "consistency" ? "up" : (locked ?? direction)
  // A start date in the future has no honest meaning here and, worse, cannot be
  // closed: `blocks_closed_after_start` rejects it and only one block may be
  // active, so the account is locked out of Blocks until the date arrives.
  const startNotFuture = startedOn <= todayKey
  const datesValid = endsOn === "" || endsOn >= startedOn
  const canSave =
    trimmedName.length > 0 &&
    startedOn !== "" &&
    startNotFuture &&
    datesValid &&
    targetValid

  function pickTarget(kind: BlockTargetVariable | "none") {
    if (kind !== targetKind) {
      // Kilograms and percent are not the same number. Carrying the value across
      // turned a 90% consistency target into a 90 kg weight target, or a 500%
      // one into 500 kg.
      setTargetValue("")
      setDirection("down")
    }
    setTargetKind(kind)
  }

  // The target is typed on the Trakabl pad (feel pass §3).
  const [padOpen, setPadOpen] = useState(false)
  const targetRef = useRef<HTMLButtonElement>(null)

  async function save() {
    if (busy) return
    // Never a dead button: a missing name is said, and the field takes focus.
    if (trimmedName.length === 0) {
      setNameMissing(true)
      nameRef.current?.focus()
      return
    }
    // Every other reason is already on screen under the fields.
    if (!canSave) return
    setBusy(true)
    setError(null)
    // `targetFilled` already narrows `targetKind` away from "none".
    const targets: BlockTarget[] = targetFilled
      ? [{ variable: targetKind, value: targetKg, direction: shownDirection }]
      : []
    const res = await startBlockAction({
      name: trimmedName,
      startedOn,
      endsOn: endsOn === "" ? null : endsOn,
      targets,
      // Read HERE, in the browser, so it is the user's local date rather than
      // the server's UTC one.
      todayKey: localToday(),
    })
    if (!res.ok) {
      setError(blockErrorText(res.error, "start"))
      setBusy(false)
      return
    }
    setBusy(false)
    onOpenChange(false)
    router.refresh()
    showToast(`${trimmedName} started`)
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="New block"
      description="Name a stretch of training, set when it starts, and optionally when it ends and what you are aiming at."
      footer={
        <>
          <button type="button" onClick={() => onOpenChange(false)} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className={cn(PRIMARY_BUTTON, "flex-1")}
          >
            {busy ? (
              <CircleNotch className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Check className="h-4 w-4" aria-hidden />
            )}
            {busy ? "Starting…" : "Start block"}
          </button>
        </>
      }
    >
      {/* The fields rise in as the sheet lands (feel pass §4). */}
      <div data-sheet-body>
        <label className="mt-1 block">
          <span className={FIELD_LABEL}>Name</span>
          <Input
            ref={nameRef}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (nameMissing) setNameMissing(false)
            }}
            maxLength={NAME_MAX}
            placeholder="First bodybuilding prep"
            aria-label="Block name"
            aria-invalid={nameMissing ? true : undefined}
            className={FIELD}
          />
          {nameMissing && (
            <span className="mt-1.5 block px-1 text-sm text-state-error">Give the block a name.</span>
          )}
        </label>

        {/* Two dates side by side, each held to its half (`min-w-0`): the
            field never grows past its column, and a long date steps its type
            down rather than running off the screen (W32). */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className={FIELD_LABEL}>Starts</span>
            <DateField
              label="Start date"
              value={startedOn}
              // Only a real day comes back (no Clear): the start is required.
              onChange={(key) => {
                if (key) setStartedOn(key)
              }}
              max={todayKey}
              todayKey={todayKey}
              className="h-12"
            />
          </label>
          <label className="block min-w-0">
            <span className={FIELD_LABEL}>Ends (optional)</span>
            <DateField
              label="End date"
              value={endsOn}
              onChange={setEndsOn}
              min={startedOn}
              clearable
              placeholder="None"
              todayKey={todayKey}
              className="h-12"
            />
          </label>
        </div>
        <p className="mt-1.5 text-xs text-text-muted">
          Leave the end open if there isn’t one.
        </p>

        {/* Target — optional, and never a biomarker. A target turns a reading
            into a pass or a fail, which is exactly what the
            categorical-never-evaluative invariant exists to prevent, so the
            only things offerable here are facts about the user's own
            behaviour. */}
        <div className="mt-6">
          <span className={FIELD_LABEL}>Target (optional)</span>
          {/* The selection is a sliding thumb (feel pass §6), so the
              selected box carries no border or fill of its own. */}
          <ThumbGroup
            selection={targetKind}
            thumbClassName={CHIP_THUMB}
            role="group"
            aria-label="Target"
            className={SEGMENTED_TRACK}
          >
            {(
              [
                { id: "none", label: "None" },
                { id: "weight", label: "Weight" },
                { id: "consistency", label: "Consistency" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => pickTarget(opt.id)}
                aria-pressed={targetKind === opt.id}
                className={cn(
                  SEGMENTED_ITEM_LG,
                  targetKind === opt.id
                    ? "font-medium text-bg-base"
                    : "text-text-muted hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </ThumbGroup>

          {targetKind !== "none" && (
            <div className="mt-3 flex items-end gap-3">
              <label className="block min-w-0 flex-1">
                <span className={FIELD_LABEL}>
                  {targetKind === "weight"
                    ? `Target weight (${unit})`
                    : "Target (%)"}
                </span>
                <PadInput
                  value={targetValue}
                  label={
                    targetKind === "weight"
                      ? `Target weight in ${unit === "lbs" ? "pounds" : "kilograms"}`
                      : "Target percent"
                  }
                  unit={targetKind === "weight" ? unit : "%"}
                  active={padOpen}
                  onOpen={() => setPadOpen(true)}
                  inputRef={targetRef}
                  className="h-12 w-full text-sm"
                />
                <NumberPad
                  active={padOpen ? 0 : null}
                  fields={[
                    {
                      id: "target",
                      label: targetKind === "weight" ? "Target weight" : "Target",
                      unit: targetKind === "weight" ? unit : "%",
                      value: targetValue,
                      onChange: setTargetValue,
                      // A weight takes decimals; a percentage is whole, and
                      // three digits covers 100.
                      decimal: targetKind === "weight",
                      sanitize:
                        targetKind === "weight"
                          ? sanitizeWeightInput
                          : (raw) => raw.replace(/\D/g, "").slice(0, 3),
                    },
                  ]}
                  onActiveChange={() => {}}
                  onClose={() => setPadOpen(false)}
                  anchorRef={targetRef}
                  returnFocusRef={targetRef}
                  label="Target"
                />
              </label>

              {/* Only weight can go either way, so only weight is asked. Once
                  a weigh-in decides it (W41), the other way cannot be picked. */}
              {targetKind === "weight" && (
                <ThumbGroup
                  selection={shownDirection}
                  thumbClassName={CHIP_THUMB}
                  role="group"
                  aria-label="Direction"
                  className={cn(SEGMENTED_TRACK, "shrink-0")}
                >
                  {(
                    [
                      { id: "down", label: "Lose" },
                      { id: "up", label: "Gain" },
                    ] as const
                  ).map((opt) => {
                    const blocked = locked !== null && locked !== opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setDirection(opt.id)}
                        disabled={blocked}
                        aria-pressed={shownDirection === opt.id}
                        className={cn(
                          SEGMENTED_ITEM_LG,
                          "min-h-10 disabled:pointer-events-none disabled:opacity-60",
                          shownDirection === opt.id
                            ? "font-medium text-bg-base"
                            : "text-text-muted hover:text-foreground",
                        )}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </ThumbGroup>
              )}
            </div>
          )}
          {/* Why one way is locked: the weigh-in it is measured against. */}
          {targetKind === "weight" && currentWeightKg != null && (
            <p className="mt-1.5 text-xs text-text-muted">
              Last weigh-in {formatWeight(currentWeightKg, unit)} {unit}
            </p>
          )}
        </div>

        {liveBlockName && (
          <p className={cn(INLINE_NOTE, "mt-5 block")}>
            Starting this closes{" "}
            <span className="text-foreground">{liveBlockName}</span>. It keeps
            everything it recorded.
          </p>
        )}

        {!startNotFuture && (
          <p className="mt-3 px-1 text-sm text-state-error">
            A block starts today or earlier. Set the end date to plan ahead.
          </p>
        )}
        {!datesValid && (
          <p className="mt-3 px-1 text-sm text-state-error">
            The end date is before the start date.
          </p>
        )}
        {targetTooHigh ? (
          <p className="mt-3 px-1 text-sm text-state-error">
            Consistency tops out at 100%.
          </p>
        ) : !targetValid ? (
          <p className="mt-3 px-1 text-sm text-state-error">
            Give the target a number above zero, or set it to None.
          </p>
        ) : null}
        {error && <p className="mt-3 px-1 text-sm text-state-error">{error}</p>}
      </div>
    </BottomSheet>
  )
}
