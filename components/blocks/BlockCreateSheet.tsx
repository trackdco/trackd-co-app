"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, CircleNotch } from "@/components/icons"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { BottomSheet } from "@/components/layout/BottomSheet"
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
import { sanitizeWeightInput } from "@/lib/weight"
import { startBlockAction } from "@/app/(app)/blocks/actions"
import { unitToKg, type WeightUnit } from "@/lib/weight"
import { localToday } from "@/lib/blocks/block"
import type { BlockTarget, BlockTargetVariable } from "@/lib/blocks/block"

const NAME_MAX = 60 // matches the CHECK on blocks.name

const FIELD =
  "h-12 rounded-xl border-border-default bg-bg-input px-3 text-sm dark:bg-bg-input"
const DATE_FIELD = cn(FIELD, "font-mono [color-scheme:dark]")

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
  /** The latest weigh-in, used only to pre-select the target's direction. */
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
  const [direction, setDirection] = useState<"up" | "down">("down")
  // Set once the user picks Lose/Gain themselves. After that the number stops
  // moving it: `direction` is the one field the design says must be STORED
  // rather than inferred, and re-deriving it on every keystroke silently undid
  // the choice the moment they adjusted a decimal.
  const [directionTouched, setDirectionTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      setDirectionTouched(false)
      // Pre-select from where they are now. STORED rather than re-derived, so
      // crossing the target later never flips the meaning of the block.
      setDirection("down")
      setBusy(false)
      setError(null)
    }
  }

  const trimmedName = name.trim()
  const numericTarget = Number(targetValue)
  // The typed weight in KILOGRAMS. Everything downstream — the direction
  // inference below, and the value that is stored — works in kg, because that
  // is the unit `blocks`/`block_targets` and every weigh-in are held in. A
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
    const changed = kind !== targetKind
    if (changed) {
      // Kilograms and percent are not the same number. Carrying the value across
      // turned a 90% consistency target into a 90 kg weight target, or a 500%
      // one into 500 kg.
      setTargetValue("")
      setDirectionTouched(false)
    }
    setTargetKind(kind)
    if (kind === "consistency") {
      // There is no such thing as targeting LOWER consistency, so the control
      // that would ask is not shown and the direction is simply up.
      setDirection("up")
      return
    }
    // Infer the direction from the number only when there is a number that is
    // STAYING, and only while the user has not chosen a direction themselves.
    // Neither guard was here: re-tapping the already-selected "Weight" chip fell
    // straight through and overwrote an explicit Lose or Gain, and switching TO
    // weight inferred a direction from the value it was in the middle of
    // clearing.
    if (
      kind === "weight" &&
      !changed &&
      !directionTouched &&
      currentWeightKg != null &&
      targetValue !== ""
    ) {
      setDirection(targetKg < currentWeightKg ? "down" : "up")
    }
  }

  // The target is typed on the Trakabl pad (feel pass §3).
  const [padOpen, setPadOpen] = useState(false)
  const targetRef = useRef<HTMLButtonElement>(null)

  function onTargetValueChange(next: string) {
    setTargetValue(next)
    const n = Number(next)
    // Follow the number while they type, so the common case needs no second
    // tap. They can still override it, and whatever is showing is what gets
    // stored.
    if (
      !directionTouched &&
      targetKind === "weight" &&
      currentWeightKg != null &&
      Number.isFinite(n) &&
      n > 0
    ) {
      setDirection(unitToKg(n, unit) < currentWeightKg ? "down" : "up")
    }
  }

  async function save() {
    if (!canSave || busy) return
    setBusy(true)
    setError(null)
    // `targetFilled` already narrows `targetKind` away from "none".
    const targets: BlockTarget[] = targetFilled
      ? [{ variable: targetKind, value: targetKg, direction }]
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
            disabled={!canSave || busy}
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX}
            placeholder="First bodybuilding prep"
            aria-label="Block name"
            className={FIELD}
          />
        </label>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className="block">
            <span className={FIELD_LABEL}>Starts</span>
            <Input
              type="date"
              value={startedOn}
              max={todayKey}
              onChange={(e) => {
                // An EMPTY change event is not "today". iOS fires one while the
                // picker wheels are still moving, and coercing it to today snapped
                // the field back mid-pick — so a back-dated entry saved silently
                // under today's date. Keep the last good value; the field is
                // required, so there is nothing it should clear to.
                if (e.target.value) setStartedOn(e.target.value)
              }}
              aria-label="Start date"
              className={DATE_FIELD}
            />
          </label>
          <label className="block">
            <span className={FIELD_LABEL}>Ends (optional)</span>
            <Input
              type="date"
              value={endsOn}
              min={startedOn}
              onChange={(e) => setEndsOn(e.target.value)}
              aria-label="End date"
              className={DATE_FIELD}
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
              <label className="block flex-1">
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
                      onChange: onTargetValueChange,
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

              {/* Only weight can go either way, so only weight is asked. */}
              {targetKind === "weight" && (
                <ThumbGroup
                  selection={direction}
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
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setDirection(opt.id)
                        setDirectionTouched(true)
                      }}
                      aria-pressed={direction === opt.id}
                      className={cn(
                        SEGMENTED_ITEM_LG,
                        "min-h-10",
                        direction === opt.id
                          ? "font-medium text-bg-base"
                          : "text-text-muted hover:text-foreground",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </ThumbGroup>
              )}
            </div>
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
