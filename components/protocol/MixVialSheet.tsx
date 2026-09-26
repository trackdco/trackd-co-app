"use client"

import { memo, useRef, useState } from "react"

import { BottomSheet } from "@/components/layout/BottomSheet"
import { StockContainer } from "@/components/protocol/stock/StockContainer"
import { NumberPad, PadInput, type PadField } from "@/components/feel/NumberPad"
import { usePadSession } from "@/components/feel/usePadSession"
import { ThumbGroup } from "@/components/feel/SlidingThumb"
import { useWriteAccess } from "@/components/billing/ReadOnlyGate"
import {
  mixStockItem,
  unmixStockItem,
  updateStockItem,
  type StockInsert,
  type StockItem,
} from "@/lib/db/inventory"
import type { DoseUnit } from "@/lib/db/types"
import type { StackCompound } from "@/lib/home/stack"
import { sanitizeAmount, trim } from "@/lib/calculator/recon"
import { formatDoseAmount } from "@/lib/format/dose"
import {
  MIX_PROMPTS,
  mixDrawLine,
  mixFillLevel,
  mixVial,
  parseAmount,
  shownUnit,
  undoMixVial,
} from "@/lib/protocol/mixDraw"
import { mixPowderEntry, powderAmountInBase, type PowderUnit } from "@/lib/protocol/stockUnits"
import { spareMixFields } from "@/lib/protocol/stockRequired"
import { showToast } from "@/lib/toast"
import { CHIP, CHIP_OFF, FIELD_LABEL, PRESS, PRIMARY_BUTTON, SHEET_TITLE } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

/** How long the vial takes to fill. Slower than a level quietly correcting
 *  (`FILL_EASE_MS`), because here the filling IS the picture of the mix. */
const FILL_MS = 600

const READ_ONLY = "Trakabl is read only until you subscribe."

/** How long a refused field shakes. Matches `.field-shake` in `globals.css`. */
const SHAKE_MS = 320

/** A unit pill ON over the white sliding thumb, as on Add stock. */
const PILL_ON = "border-transparent font-medium text-bg-base"

/**
 * MIX A VIAL (build-brief-final §3.12), opened from "Mix one" on a dry spare.
 *
 * The vial starts with its powder (ruling 4) and fills once the powder and the
 * water are in, the powder dissolving as it does; one line under it reports the
 * draw for the user's OWN planned dose ("Draw N units for X mg"), and "Mix"
 * starts the vial. Nothing here recommends a dose. Until both amounts are in,
 * the line names what is missing as an amount to type (`MIX_PROMPTS`).
 *
 * Somatropin's box prints mg while its vial is stored in IU, so the powder may
 * be typed in either, as on Add, and is converted to the stored unit before the
 * draw is worked out and before it is saved (cold review B3).
 *
 * The powder starts EMPTY, not at the amount stored when the vial was added:
 * Adrian, final check round one, "the powder amount shouldn't be pre set …
 * should be able to type in the input fields". What is typed is what the vial
 * holds, so a powder that differs from the stored one is saved before the mix;
 * otherwise the draw shown here and the stock maths afterwards would disagree.
 * The water starts at what was used last time (`mixWaterDefault`).
 */
export function MixVialSheet({
  open,
  onOpenChange,
  compound,
  spare,
  lastWaterMl,
  todayKey,
  onMixed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  compound: StackCompound
  /** The dry spare being mixed (`acquired_on` NULL, `reconstituted`). */
  spare: StockItem
  /** Where the water starts: `mixWaterDefault(items)`. */
  lastWaterMl: number
  /** The DEVICE's today, `YYYY-MM-DD`: the mix date and the start. */
  todayKey: string
  /** After a mix, and again after its Undo, so the caller can re-read stock. */
  onMixed?: () => void
}) {
  const onClose = () => onOpenChange(false)
  // Every open is a fresh mix: the sheet stays mounted while it slides away,
  // so the body is keyed on the open as well as the spare.
  const [session, setSession] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSession((n) => n + 1)
  }
  // THE ONE SHEET FRAME (consistency fix #1), with its Cancel / Title bar: the
  // title and the compound on the left, "Cancel" at top right (brief §3.12).
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Mix a vial"
      description={compound.name}
      desktop="rail"
      header={
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p aria-hidden className={SHEET_TITLE}>Mix a vial</p>
            <p className="truncate text-sm text-text-muted">{compound.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              PRESS.text,
              "-mt-2 -mr-2 flex min-h-11 shrink-0 items-center rounded-md px-2 text-sm text-text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            Cancel
          </button>
        </div>
      }
    >
      {/* Remounts for each open and each spare, so each mix starts from a dry
          vial and fresh fields. */}
      <MixBody
        key={`${spare.id}:${session}`}
        compound={compound}
        spare={spare}
        lastWaterMl={lastWaterMl}
        todayKey={todayKey}
        onMixed={onMixed}
        onClose={onClose}
      />
    </BottomSheet>
  )
}

function MixBody({
  compound,
  spare,
  lastWaterMl,
  todayKey,
  onMixed,
  onClose,
}: {
  compound: StackCompound
  spare: StockItem
  lastWaterMl: number
  todayKey: string
  onMixed?: () => void
  onClose: () => void
}) {
  const { guard } = useWriteAccess()
  const [powder, setPowder] = useState("")
  const [water, setWater] = useState(() =>
    Number.isFinite(lastWaterMl) && lastWaterMl > 0 ? trim(lastWaterMl, 3) : "",
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** The field a refused "Mix" is shaking, if any. */
  const [shakeId, setShakeId] = useState<"powder" | "water" | null>(null)
  const shakeTimer = useRef<number | undefined>(undefined)

  // A reconstituted vial's powder is STORED in its base unit, mg or IU; it may
  // be TYPED in the unit on the box (Somatropin: mg), as on Add (B3).
  const entry = mixPowderEntry(compound.name, spare.totalAmountUnit ?? spare.baseUnit)
  const [entryPick, setEntryPick] = useState<PowderUnit>(entry.initial)
  const entryUnit = entry.units.includes(entryPick) ? entryPick : entry.base
  const powderShown = shownUnit(entryUnit)
  const powderTyped = parseAmount(powder)
  /** The typed powder in the STORED unit: what the draw reads and what is saved. */
  const powderNum = powderTyped == null ? null : powderAmountInBase(powderTyped, entryUnit, entry.base)
  const waterNum = parseAmount(water)
  const line = mixDrawLine({
    powder: powderNum,
    powderUnit: entry.base,
    waterMl: waterNum,
    dose: compound.dose,
    doseUnit: compound.unit,
  })

  const pad = usePadSession()
  const padFields: PadField[] = [
    { id: "powder", label: "Powder", short: "Powder", unit: powderShown, value: powder, onChange: setPowder, sanitize: sanitizeAmount },
    { id: "water", label: "Water", short: "Water", unit: "mL", value: water, onChange: setWater, sanitize: sanitizeAmount },
  ]

  /**
   * The level the vial SHOWS. The pad covers the sheet while it is open, so a
   * level that moved under it would finish filling before anyone could see it.
   * It is held while the pad is up and let go when the pad closes, so the fill
   * plays in view. Adjusted during render, not in an effect, which would paint
   * a frame at the old level first.
   */
  const targetFill = mixFillLevel(powderNum, waterNum)
  const [shownFill, setShownFill] = useState(targetFill)
  if (pad.activeId === null && shownFill !== targetFill) setShownFill(targetFill)

  /** A refused "Mix": shake the empty field and open the pad on it, as Add
   *  stock does. Cleared first, a frame apart, so a second refusal shakes it
   *  again. "Mix" is never dead without the screen saying why (Adrian). */
  function refuse(id: "powder" | "water") {
    window.clearTimeout(shakeTimer.current)
    setShakeId(null)
    requestAnimationFrame(() => {
      setShakeId(id)
      shakeTimer.current = window.setTimeout(() => setShakeId(null), SHAKE_MS)
    })
    pad.open(id)
  }

  async function mix() {
    if (busy) return
    if (powderNum == null) return refuse("powder")
    if (waterNum == null) return refuse("water")
    const typed = powderNum
    const waterMl = waterNum
    setBusy(true)
    setError(null)
    try {
      // What was typed is what the vial holds: saved first, while the vial is
      // still a spare, then the water and the start. A mix that fails after
      // the powder landed puts the powder back (cold review S6).
      const done = await mixVial({
        stored: spare.totalAmount,
        typed,
        savePowder: (amount) => updateStockItem(spare.id, spareRow(spare, amount)),
        mix: () => mixStockItem(spare.id, waterMl, todayKey),
      })
      if (!done.ok) {
        setError(done.refusal === "read-only" ? READ_ONLY : "Couldn’t mix this vial. Try again.")
        // A powder that could not be put back is on the row now: re-read, so
        // the screen behind shows what the vial holds.
        if (!done.restored) onMixed?.()
        return
      }
      onClose()
      const restorePowder = done.restorePowder
      showToast("Mixed. Now in use.", {
        undo: () => void undoMix(spare, todayKey, restorePowder, onMixed),
      })
      onMixed?.()
    } finally {
      setBusy(false)
    }
  }

  // The SAME pill as Add stock's unit choice: the white thumb is the selection.
  const pill = (active: boolean) => cn(CHIP, "duration-300", active ? PILL_ON : CHIP_OFF)
  const twoUnits = entry.units.length > 1
  const converted = entryUnit !== entry.base

  return (
    <>
      {/* The sections rise in as the sheet lands (feel pass §4). */}
      <div data-sheet-body>
        <MixVial
          name={compound.name}
          category={compound.category}
          inventoryType={spare.inventoryType}
          fill={shownFill}
        />

        {/* One unit: the two fields side by side. Two (Somatropin, sold in mg
            and stored in IU): the powder takes the row with its choice beside
            it, as on Add stock, and the water sits under it. */}
        <div className={cn("mt-3 gap-2", twoUnits ? "space-y-3" : "grid grid-cols-2")}>
          <label className="block min-w-0">
            <span className={FIELD_LABEL}>Powder</span>
            <span className="flex items-center gap-2">
              <PadInput
                {...pad.bind("powder")}
                value={powder}
                label="Powder"
                unit={powderShown}
                suffix={<FieldUnit unit={powderShown} />}
                className={cn("h-11 w-full", shakeId === "powder" && "field-shake")}
              />
              {twoUnits ? (
                <ThumbGroup
                  selection={entryUnit}
                  thumbClassName="inst-thumb"
                  role="group"
                  aria-label="Powder unit"
                  className="flex shrink-0 gap-1"
                >
                  {entry.units.map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setEntryPick(u)}
                      aria-pressed={entryUnit === u}
                      className={pill(entryUnit === u)}
                    >
                      {shownUnit(u)}
                    </button>
                  ))}
                </ThumbGroup>
              ) : null}
            </span>
            {/* The conversion, as it happens: what the vial is stored as. */}
            {converted && powderNum != null ? (
              <span className="mt-1 block text-xs text-text-muted">
                = <span className="font-mono">{formatDoseAmount(powderNum)}</span> {shownUnit(entry.base)}
              </span>
            ) : null}
          </label>
          <label className="block min-w-0">
            <span className={FIELD_LABEL}>Water</span>
            <PadInput
              {...pad.bind("water")}
              value={water}
              label="Water"
              unit="mL"
              suffix={<FieldUnit unit="mL" />}
              className={cn("h-11 w-full", shakeId === "water" && "field-shake")}
            />
          </label>
        </div>

        {/* Reports the arithmetic of the user's own planned dose. The figure is
            Mono and its unit Sans, one ordinary space apart (F14). */}
        <p aria-live="polite" className="mt-4 min-h-5 text-center text-sm leading-5">
          {line.kind === "draw" ? (
            <span className="text-foreground">
              Draw{" "}
              <span className="font-medium">
                <span className="font-mono tabular-nums">{line.units}</span> {line.noun}
              </span>{" "}
              for <span className="font-mono tabular-nums">{line.doseAmount}</span> {line.doseUnit}
            </span>
          ) : line.kind === "prompt" ? (
            <span className="text-text-muted">{MIX_PROMPTS[line.missing]}</span>
          ) : null}
        </p>

        <div className="mt-4">
          {/* Never disabled for a missing amount: a tap shakes that field and
              opens the pad on it, and the line above already names it. */}
          <button
            type="button"
            onClick={() => guard(() => void mix())}
            disabled={busy}
            className={cn(PRIMARY_BUTTON, "w-full")}
          >
            {busy ? "Mixing…" : "Mix"}
          </button>
          {error && (
            <p role="alert" className="mt-2 text-center text-sm text-state-error">
              {error}
            </p>
          )}
        </div>
      </div>

      <NumberPad {...pad.padProps(padFields)} label="Powder and water" />
    </>
  )
}

/**
 * The vial, drawn with the approved container (set B, `components/containers`),
 * holding its powder while it is dry (`StockContainer`): the powder dissolves
 * as the water rises, and comes back if the level drains.
 *
 * Its level eases through `AnimatedContainer`, the container's own fill
 * animation, and it is memoised on its four props: the animation's frames
 * re-render this drawing and nothing else, so the fields are never re-rendered
 * by it. `.mix-vial` switches off the liquid's CSS `y`/`height` transition
 * (`globals.css`), which would otherwise lag behind the eased value. Easing the
 * number rather than the SVG geometry is what makes it run in every browser.
 */
const MixVial = memo(function MixVial({
  name,
  category,
  inventoryType,
  fill,
}: {
  name: string
  category: string
  inventoryType: string
  fill: number
}) {
  return (
    <div className="mix-vial mt-2 flex justify-center">
      <StockContainer
        animate
        name={name}
        category={category}
        inventoryType={inventoryType}
        fill={fill}
        powder={fill <= 0}
        size={150}
        durationMs={FILL_MS}
      />
    </div>
  )
})

/** The unit inside a number field, muted. It is all an empty field shows. */
function FieldUnit({ unit }: { unit: string }) {
  return <span className="shrink-0 font-sans text-sm text-text-muted">{unit}</span>
}

/** The spare as a SPARE row with `powder` as its amount: its water and mix
 *  date as they are (none, for a dry vial: `spareMixFields`), so the row keeps
 *  the shape its CHECK already accepted. `updateStockItem` writes every type
 *  column, so all are given. */
function spareRow(
  spare: StockItem,
  powder: number,
): Omit<StockInsert, "id" | "protocol_compound_id"> {
  return {
    inventory_type: "reconstituted",
    base_unit: spare.baseUnit as DoseUnit,
    total_amount: powder,
    total_amount_unit: (spare.totalAmountUnit ?? spare.baseUnit) as DoseUnit,
    ...spareMixFields(spare),
    prior_used_base: spare.priorUsedBase,
  }
}

/**
 * The toast's Undo. Outlives the sheet (it has closed by then), so it touches
 * no component state: back to a dry spare, the powder back to what it was when
 * a different amount was typed, then the caller re-reads.
 */
async function undoMix(
  spare: StockItem,
  todayKey: string,
  restorePowder: number | null,
  onMixed?: () => void,
) {
  const undone = await undoMixVial({
    restorePowder,
    unmix: () => unmixStockItem(spare.id, todayKey),
    // Back to the spare as it was before the mix: dry, with its own powder.
    savePowder: (amount) =>
      updateStockItem(spare.id, { ...spareRow(spare, amount), bac_water_ml: null, reconstituted_on: null }),
  })
  if (!undone.ok) showToast("Couldn’t undo. Try again.")
  onMixed?.()
}
