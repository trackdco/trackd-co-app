"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, CircleNotch, X } from "@/components/icons"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useSheetDrag } from "@/components/home/useSheetDrag"
import { SHEET_TITLE } from "@/lib/ui-presets"
import { startBlockAction } from "@/app/(app)/blocks/actions"
import { localToday } from "@/lib/blocks/block"
import type { BlockTarget, BlockTargetVariable } from "@/lib/blocks/block"

const NAME_MAX = 60 // matches the CHECK on blocks.name

const FIELD_LABEL =
  "mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted"
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
 */
export function BlockCreateSheet({
  open,
  onOpenChange,
  todayKey,
  liveBlockName,
  currentWeightKg,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  todayKey: string
  /** The live block's name, when one is running and is about to be closed. */
  liveBlockName?: string | null
  /** The latest weigh-in, used only to pre-select the target's direction. */
  currentWeightKg?: number | null
}) {
  const router = useRouter()
  const { cardRef, handleProps, cardStyle } = useSheetDrag(() => onOpenChange(false), open)

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
      setDirection(numericTarget < currentWeightKg ? "down" : "up")
    }
  }

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
      setDirection(n < currentWeightKg ? "down" : "up")
    }
  }

  async function save() {
    if (!canSave || busy) return
    setBusy(true)
    setError(null)
    // `targetFilled` already narrows `targetKind` away from "none".
    const targets: BlockTarget[] = targetFilled
      ? [{ variable: targetKind, value: numericTarget, direction }]
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
      setError(res.error)
      setBusy(false)
      return
    }
    setBusy(false)
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 border-t-0 bg-transparent p-0 shadow-none"
      >
        <div
          ref={cardRef}
          style={cardStyle}
          className="flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl border-t border-border-default bg-bg-surface shadow-lg"
        >
          <div
            {...handleProps}
            className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          >
            <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
          </div>

          <SheetTitle className="sr-only">New block</SheetTitle>
          <SheetDescription className="sr-only">
            Name a stretch of training, set when it starts, and optionally when it
            ends and what you are aiming at.
          </SheetDescription>

          <div className="flex-1 overflow-y-auto px-6">
            <h2 className={SHEET_TITLE}>New block</h2>

            <label className="mt-5 block">
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
                  onChange={(e) => setStartedOn(e.target.value || todayKey)}
                  aria-label="Start date"
                  className={DATE_FIELD}
                />
              </label>
              <label className="block">
                <span className={FIELD_LABEL}>
                  Ends <span className="normal-case text-text-subtle">(optional)</span>
                </span>
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
            <p className="mt-1.5 text-xs text-text-subtle">
              Leave the end open if you do not have one. An off-season does not
              need a deadline.
            </p>

            {/* Target — optional, and never a biomarker. A target turns a reading
                into a pass or a fail, which is exactly what the
                categorical-never-evaluative invariant exists to prevent, so the
                only things offerable here are facts about the user's own
                behaviour. */}
            <div className="mt-6">
              <span className={FIELD_LABEL}>
                Target <span className="normal-case text-text-subtle">(optional)</span>
              </span>
              <div className="flex gap-2">
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
                      "flex-1 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                      targetKind === opt.id
                        ? "border-accent-primary bg-accent-primary/10 text-foreground"
                        : "border-border-default text-text-muted hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {targetKind !== "none" && (
                <div className="mt-3 flex items-end gap-3">
                  <label className="block flex-1">
                    <span className={FIELD_LABEL}>
                      {targetKind === "weight" ? "Target weight (kg)" : "Target (%)"}
                    </span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={targetValue}
                      onChange={(e) => onTargetValueChange(e.target.value)}
                      min={0}
                      max={targetKind === "consistency" ? 100 : undefined}
                      step={targetKind === "weight" ? "0.1" : "1"}
                      placeholder={targetKind === "weight" ? "84" : "90"}
                      aria-label={
                        targetKind === "weight" ? "Target weight in kilograms" : "Target percent"
                      }
                      className={cn(FIELD, "font-mono")}
                    />
                  </label>

                  {/* Only weight can go either way, so only weight is asked. */}
                  {targetKind === "weight" && (
                    <div className="flex shrink-0 gap-2">
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
                            "h-12 rounded-xl border px-3 text-sm transition-colors",
                            direction === opt.id
                              ? "border-accent-primary bg-accent-primary/10 text-foreground"
                              : "border-border-default text-text-muted hover:text-foreground",
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {liveBlockName && (
              <p className="mt-5 rounded-xl border border-border-default bg-bg-surface-raised px-3 py-2.5 text-xs text-text-muted">
                Starting this closes{" "}
                <span className="text-foreground">{liveBlockName}</span>. One block
                runs at a time, and the closed one keeps everything it recorded.
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

          <div className="flex shrink-0 gap-3 hairline-t px-6 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex items-center justify-center gap-2 rounded-xl border border-border-strong px-4 py-3 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
            >
              <X className="h-4 w-4" aria-hidden />
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!canSave || busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-primary py-3 text-sm font-medium text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
            >
              {busy ? (
                <CircleNotch className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Check className="h-4 w-4" aria-hidden />
              )}
              {busy ? "Starting…" : "Start block"}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
