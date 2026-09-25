"use client"

import { memo, useState } from "react"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { useSheetDrag } from "@/components/home/useSheetDrag"
import { AnimatedContainer } from "@/components/containers"
import { NumberPad, PadInput, type PadField } from "@/components/feel/NumberPad"
import { usePadSession } from "@/components/feel/usePadSession"
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
import {
  MIX_PROMPT,
  mixDrawLine,
  mixFillLevel,
  parseAmount,
  shownUnit,
} from "@/lib/protocol/mixDraw"
import { showToast } from "@/lib/toast"
import { PRESS, PRIMARY_BUTTON, SHEET_TITLE, STOCK_FIELD_LABEL } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

/** How long the vial takes to fill. Slower than a level quietly correcting
 *  (`FILL_EASE_MS`), because here the filling IS the picture of the mix. */
const FILL_MS = 600

const READ_ONLY = "Trakabl is read only until you subscribe."

/**
 * MIX A VIAL (build-brief-final §3.12), opened from "Mix one" on a dry spare.
 *
 * The vial starts dry and fills once the powder and the water are in; one line
 * under it reports the draw for the user's OWN planned dose ("Draw N units for
 * X mg"), and "Mix" starts the vial. Nothing here recommends a dose.
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
  const { cardRef, handleProps, cardStyle } = useSheetDrag(() => onOpenChange(false), open)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-desktop="rail"
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

          {/* Remounts on every open (the sheet's content unmounts when it
              closes), so each mix starts from a dry vial and fresh fields. */}
          <MixBody
            key={spare.id}
            compound={compound}
            spare={spare}
            lastWaterMl={lastWaterMl}
            todayKey={todayKey}
            onMixed={onMixed}
            onClose={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
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

  // A reconstituted vial's powder is stored in its base unit, mg or IU.
  const powderUnit = spare.totalAmountUnit ?? spare.baseUnit
  const powderShown = shownUnit(powderUnit)
  const powderNum = parseAmount(powder)
  const waterNum = parseAmount(water)
  const ready = powderNum != null && waterNum != null
  const line = mixDrawLine({
    powder: powderNum,
    powderUnit,
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

  async function mix() {
    if (powderNum == null || waterNum == null || busy) return
    setBusy(true)
    setError(null)
    try {
      // What was typed is what the vial holds. Saved while the vial is still
      // an unmixed spare, so the row keeps the unmixed shape its CHECK allows.
      const stored = spare.totalAmount
      const powderChanged = stored == null || Math.abs(stored - powderNum) > 1e-9
      if (powderChanged) {
        const saved = await updateStockItem(spare.id, unmixedRow(spare, powderNum))
        if (!saved.ok) {
          setError(saved.refusal === "read-only" ? READ_ONLY : "Couldn’t mix this vial. Try again.")
          return
        }
      }
      const mixed = await mixStockItem(spare.id, waterNum, todayKey)
      if (!mixed.ok) {
        setError(mixed.refusal === "read-only" ? READ_ONLY : "Couldn’t mix this vial. Try again.")
        return
      }
      onClose()
      const restorePowder = powderChanged && stored != null ? stored : null
      showToast("Mixed. Now in use.", {
        undo: () => void undoMix(spare, todayKey, restorePowder, onMixed),
      })
      onMixed?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 px-5">
        <SheetTitle className={SHEET_TITLE}>Mix a vial</SheetTitle>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            PRESS.text,
            "-mr-2 flex min-h-11 shrink-0 items-center rounded-md px-2 text-sm text-text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          Cancel
        </button>
      </div>
      <SheetDescription className="shrink-0 px-5 text-sm text-text-muted">
        {compound.name}
      </SheetDescription>

      {/* The sections rise in as the sheet lands (feel pass §4). */}
      <div
        data-sheet-body
        className="flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <MixVial
          name={compound.name}
          category={compound.category}
          inventoryType={spare.inventoryType}
          fill={shownFill}
        />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block min-w-0">
            <span className={STOCK_FIELD_LABEL}>Powder</span>
            <PadInput
              {...pad.bind("powder")}
              value={powder}
              label="Powder"
              unit={powderShown}
              suffix={<FieldUnit unit={powderShown} />}
              className="h-11 w-full"
            />
          </label>
          <label className="block min-w-0">
            <span className={STOCK_FIELD_LABEL}>Water</span>
            <PadInput
              {...pad.bind("water")}
              value={water}
              label="Water"
              unit="mL"
              suffix={<FieldUnit unit="mL" />}
              className="h-11 w-full"
            />
          </label>
        </div>

        {/* Reports the arithmetic of the user's own planned dose. */}
        <p aria-live="polite" className="mt-4 min-h-5 text-center text-sm leading-5">
          {line.kind === "draw" ? (
            <span className="text-foreground">
              Draw{" "}
              <span className="font-medium">
                <span className="font-mono tabular-nums">{line.units}</span> {line.noun}
              </span>{" "}
              for <span className="font-mono tabular-nums">{line.dose}</span>
            </span>
          ) : line.kind === "prompt" ? (
            <span className="text-text-muted">{MIX_PROMPT}</span>
          ) : null}
        </p>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => guard(() => void mix())}
            disabled={!ready || busy}
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
 * The vial, drawn with the approved container (set B, `components/containers`).
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
      <AnimatedContainer
        name={name}
        category={category}
        inventoryType={inventoryType}
        fill={fill}
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

/** The spare as an UNMIXED row with `powder` as its amount: no water, no mix
 *  date. `updateStockItem` writes every type column, so all are given. */
function unmixedRow(
  spare: StockItem,
  powder: number,
): Omit<StockInsert, "id" | "protocol_compound_id"> {
  return {
    inventory_type: "reconstituted",
    base_unit: spare.baseUnit as DoseUnit,
    total_amount: powder,
    total_amount_unit: (spare.totalAmountUnit ?? spare.baseUnit) as DoseUnit,
    bac_water_ml: null,
    reconstituted_on: null,
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
  const undone = await unmixStockItem(spare.id, todayKey)
  if (undone.ok && restorePowder != null) {
    await updateStockItem(spare.id, unmixedRow(spare, restorePowder))
  }
  if (!undone.ok) showToast("Couldn’t undo the mix.")
  onMixed?.()
}
