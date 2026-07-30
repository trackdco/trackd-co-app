"use client"

import { useId, useMemo, useState, useSyncExternalStore } from "react"
import { CaretDown, Warning } from "@/components/icons"

import { SyringeGraphic } from "@/components/calculator/SyringeGraphic"
import { cn } from "@/lib/utils"
import {
  CARD_EYEBROW,
  COLUMN_EYEBROW,
  DATA_MONO,
  METRIC_VALUE,
  UNIT_SUFFIX,
} from "@/lib/ui-presets"
import {
  computeRecon,
  sanitizeAmount,
  toMg,
  trim,
  type MgUnit,
  type ReconResult,
} from "@/lib/calculator/recon"
import {
  AXIS_Y,
  BARREL_H,
  BARREL_R,
  BARREL_W,
  BARREL_X,
  BARREL_Y,
  MIN_READABLE_UNITS,
  SYRINGE_SIZES,
  VIEW_H,
  VIEW_W,
  fillFraction,
  misuseKind,
  syringeSize,
  type MisuseKind,
  type SyringeSize,
  type SyringeSizeId,
} from "@/lib/calculator/syringe"

/**
 * DEV-ONLY. Shared pieces for the spec 07 layout exploration at
 * `/preview/recon-variants`. Nothing here is imported by the shipped calculator.
 * Delete the folder once a direction is picked.
 *
 * Settled by Adrian, 2026-07-30, and built in below:
 *  - The readout and the syringe sit BARE, outside any card.
 *  - Concentration / per dose / insulin sit directly under the syringe.
 *  - The syringe size is a HARD GATE. Nothing calculates until one is chosen.
 *  - The choice is remembered on the device, so the gate only bites once.
 *
 * The gate exists because the FIGURE is barrel-independent but the PICTURE is
 * not: 10 units is 10 units on any syringe, but it is a third of a 0.3 mL barrel
 * and a fifth of a 0.5 mL one. Someone matching the fill they can see rather
 * than reading the number would draw the wrong amount, and the whole argument
 * for the graphic is that people read the picture.
 */

const NO_VALUE = "—"

/**
 * Vials are labelled in mg but doses are written in mcg, and the 1000x slip
 * between them is the most common error in this space, so the two amount fields
 * deliberately start in DIFFERENT units.
 */
const DEFAULT_DOSE_UNIT: MgUnit = "mcg"

/* ---------------------------------------------------- remembered barrel size */

const SIZE_KEY = "trackd.calculator.syringeSize"
const SIZE_EVENT = "trackd:calculator-syringe-size-changed"

function isSizeId(v: string | null): v is SyringeSizeId {
  return SYRINGE_SIZES.some((s) => s.id === v)
}

function getStoredSize(): SyringeSizeId | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(SIZE_KEY)
    return isSizeId(raw) ? raw : null
  } catch {
    return null
  }
}

function writeStoredSize(id: SyringeSizeId | null): void {
  try {
    if (id) window.localStorage.setItem(SIZE_KEY, id)
    else window.localStorage.removeItem(SIZE_KEY)
  } catch {
    /* storage off — the gate just asks again next visit */
  }
  window.dispatchEvent(new CustomEvent(SIZE_EVENT))
}

function subscribeSize(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(SIZE_EVENT, cb)
  window.addEventListener("storage", cb)
  return () => {
    window.removeEventListener(SIZE_EVENT, cb)
    window.removeEventListener("storage", cb)
  }
}

/* ------------------------------------------------------------------- state */

export interface CalcState {
  powder: string
  setPowder: (v: string) => void
  powderUnit: MgUnit
  setPowderUnit: (u: MgUnit) => void
  bac: string
  setBac: (v: string) => void
  dose: string
  setDose: (v: string) => void
  doseUnit: MgUnit
  setDoseUnit: (u: MgUnit) => void
  /** `null` until the user has chosen. The gate. */
  sizeId: SyringeSizeId | null
  setSizeId: (id: SyringeSizeId) => void
  size: SyringeSize | null
  workingOpen: boolean
  setWorkingOpen: (v: boolean | ((o: boolean) => boolean)) => void
  result: ReconResult | null
  units: number | null
  fill: number
  misuse: MisuseKind
  dirty: boolean
  reset: () => void
}

export function useCalcState(): CalcState {
  const [powder, setPowder] = useState("")
  const [powderUnit, setPowderUnit] = useState<MgUnit>("mg")
  const [bac, setBac] = useState("")
  const [dose, setDose] = useState("")
  const [doseUnit, setDoseUnit] = useState<MgUnit>(DEFAULT_DOSE_UNIT)
  const [workingOpen, setWorkingOpen] = useState(false)

  // Read through the store rather than an effect: the server has no
  // localStorage, so the server snapshot is "unchosen" and hydration agrees.
  const sizeId = useSyncExternalStore(subscribeSize, getStoredSize, () => null)
  const size = sizeId ? syringeSize(sizeId) : null

  const raw = useMemo(
    () => computeRecon({ powder, powderUnit, bac, dose, doseUnit }),
    [powder, powderUnit, bac, dose, doseUnit],
  )

  // THE GATE. Everything downstream of the barrel choice stays null until one is
  // made, so no figure can be read off a barrel the user never confirmed.
  const result = size ? raw : null
  const units = result?.unitsPerDose ?? null

  return {
    powder,
    setPowder: (v) => setPowder(sanitizeAmount(v)),
    powderUnit,
    setPowderUnit,
    bac,
    setBac: (v) => setBac(sanitizeAmount(v)),
    dose,
    setDose: (v) => setDose(sanitizeAmount(v)),
    doseUnit,
    setDoseUnit,
    sizeId,
    setSizeId: writeStoredSize,
    size,
    workingOpen,
    setWorkingOpen,
    result,
    units,
    fill: size ? fillFraction(units, size) : 0,
    misuse: size ? misuseKind(units, size) : null,
    dirty:
      powder !== "" ||
      bac !== "" ||
      dose !== "" ||
      powderUnit !== "mg" ||
      doseUnit !== DEFAULT_DOSE_UNIT ||
      sizeId !== null ||
      workingOpen,
    reset: () => {
      setPowder("")
      setPowderUnit("mg")
      setBac("")
      setDose("")
      setDoseUnit(DEFAULT_DOSE_UNIT)
      setWorkingOpen(false)
      // Clears the remembered barrel too, so Reset is also how you re-choose.
      writeStoredSize(null)
    },
  }
}

/** The figure in the other unit, live, so a 1000x slip is visible as it is made. */
export function equivalentHint(value: string, unit: MgUnit): string | null {
  const n = parseFloat(value)
  if (!Number.isFinite(n) || n <= 0) return null
  const mg = toMg(n, unit)
  return unit === "mcg" ? `${trim(mg, 4)} mg` : `${trim(mg * 1000, 1)} mcg`
}

/* ------------------------------------------------------------ the gate + top */

/**
 * The syringe as a GHOST, awaiting a size. Same silhouette as the real one so it
 * reads as a syringe rather than an empty box, but the barrel is dashed and
 * carries no ticks and no numbers: a printed scale here would be the scale of a
 * syringe the user has not said they are holding, which is the exact thing the
 * gate exists to prevent.
 */
function EmptyBarrel() {
  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full" aria-hidden>
      <g opacity={0.45} fill="var(--border-strong)">
        <path
          d={`M4 ${AXIS_Y + 1} L10 ${AXIS_Y - 1} L46 ${AXIS_Y - 1} L46 ${AXIS_Y + 1} Z`}
        />
        <path
          d={`M46 ${AXIS_Y - 4} L62 ${AXIS_Y - 9} L62 ${AXIS_Y + 9} L46 ${AXIS_Y + 4} Z`}
        />
        <rect
          x={BARREL_X + BARREL_W}
          y={AXIS_Y - 22}
          width={6}
          height={44}
          rx={1.5}
        />
        <rect x={BARREL_X + BARREL_W + 6} y={AXIS_Y - 3} width={32} height={6} />
        <rect
          x={BARREL_X + BARREL_W + 38}
          y={AXIS_Y - 16}
          width={8}
          height={32}
          rx={2}
        />
      </g>
      <rect
        x={BARREL_X}
        y={BARREL_Y}
        width={BARREL_W}
        height={BARREL_H}
        rx={BARREL_R}
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth={1}
        strokeDasharray="5 4"
      />
    </svg>
  )
}

export function SyringePills({
  sizeId,
  onChange,
  emphasis,
}: {
  sizeId: SyringeSizeId | null
  onChange: (id: SyringeSizeId) => void
  emphasis?: boolean
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-1 rounded-full border p-0.5",
        emphasis
          ? "border-accent-amber/50 bg-bg-input"
          : "border-border-default bg-bg-input",
      )}
    >
      {SYRINGE_SIZES.map((s) => (
        <button
          key={s.id}
          type="button"
          aria-pressed={sizeId === s.id}
          onClick={() => onChange(s.id)}
          className={cn(
            "rounded-full py-1.5 text-xs font-medium transition-colors duration-300 ease-out",
            sizeId === s.id
              ? "bg-bg-surface-raised text-foreground"
              : "text-text-muted",
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}

/**
 * The readout and the barrel, bare (Adrian: "I like the focus, how it's outside
 * of a card"). Sticky, so the barrel stays on screen once the working panel is
 * open and the page is long enough to scroll.
 */
export function Readout({ s }: { s: CalcState }) {
  // Pulled into a local so TypeScript narrows it inside the branch below.
  const size = s.size
  return (
    <div className="sticky top-0 z-10 -mx-5 bg-bg-base/85 px-5 pt-1 pb-3 backdrop-blur">
      {size == null ? (
        <>
          <p className="text-sm text-text-muted">
            Which syringe are you using?
          </p>
          <div className="mt-2">
            <SyringePills sizeId={null} onChange={s.setSizeId} emphasis />
          </div>
          <div className="-mx-2 mt-2">
            <EmptyBarrel />
          </div>
          <p className="text-center text-xs text-text-subtle">
            The size printed on the barrel you are holding.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3">
            {s.units != null ? (
              <p className="flex items-baseline gap-2">
                <span className={METRIC_VALUE}>{trim(s.units, 1)}</span>
                <span className={UNIT_SUFFIX}>units</span>
              </p>
            ) : (
              <p className="text-sm text-text-muted">
                {s.result == null ? "Enter powder and BAC water" : "Add a dose"}
              </p>
            )}
            <span className={DATA_MONO}>{size.label}</span>
          </div>
          <div className="-mx-2 mt-2">
            <SyringeGraphic
              size={size}
              fill={s.fill}
              label={
                s.units != null
                  ? `${trim(s.units, 1)} units drawn on a ${size.label} syringe`
                  : `An empty ${size.label} syringe`
              }
            />
          </div>
        </>
      )}
    </div>
  )
}

/* ----------------------------------------------------------------- outputs */

export function FiguresStrip({ s }: { s: CalcState }) {
  const cells = [
    {
      label: "Concentration",
      value: s.result ? trim(s.result.concentration, 3) : NO_VALUE,
      unit: "mg/mL",
    },
    {
      label: "Per dose",
      value: s.result?.mlPerDose != null ? trim(s.result.mlPerDose, 3) : NO_VALUE,
      unit: "mL",
    },
    {
      label: "Insulin",
      value: s.units != null ? trim(s.units, 1) : NO_VALUE,
      unit: "U",
      accent: true,
    },
  ]
  return (
    <section className="grid grid-cols-3 divide-x divide-border-default rounded-2xl bg-bg-surface py-3">
      {cells.map((c) => (
        <div key={c.label} className="px-2 text-center">
          <p className={COLUMN_EYEBROW}>{c.label}</p>
          <p className="mt-1 font-mono text-base tabular-nums [overflow-wrap:anywhere]">
            <span className={c.accent ? "text-accent-amber" : "text-foreground"}>
              {c.value}
            </span>{" "}
            <span className="text-[11px] text-text-muted">{c.unit}</span>
          </p>
        </div>
      ))}
    </section>
  )
}

export function MisuseNotice({ s }: { s: CalcState }) {
  if (!s.misuse || !s.size) return null
  const copy =
    s.misuse === "under"
      ? `That is under ${MIN_READABLE_UNITS} units, too little to read off a syringe accurately. Check the figures you entered.`
      : `${s.units != null ? `${trim(s.units, 1)} units` : "That"} will not fit a ${s.size.label} syringe. Check the figures you entered${s.sizeId === "1" ? "" : ", or pick a larger syringe"}.`
  return (
    <div role="alert" className="flex gap-3 rounded-xl bg-accent-amber/15 p-3">
      <Warning className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber" aria-hidden />
      <p className="text-sm leading-relaxed text-accent-amber">{copy}</p>
    </div>
  )
}

export function WorkingPanel({ s }: { s: CalcState }) {
  const id = useId()
  const r = s.result
  return (
    <section className="overflow-hidden rounded-2xl bg-bg-surface">
      <button
        type="button"
        onClick={() => s.setWorkingOpen((o) => !o)}
        aria-expanded={s.workingOpen}
        aria-controls={id}
        className="flex w-full items-center justify-between gap-3 p-5 text-left"
      >
        <span className={CARD_EYEBROW}>View calculations</span>
        <CaretDown
          aria-hidden
          className={cn(
            "h-4 w-4 shrink-0 text-text-subtle transition-transform duration-300 ease-out motion-reduce:transition-none",
            !s.workingOpen && "-rotate-90",
          )}
        />
      </button>
      <div
        id={id}
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: s.workingOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden" inert={!s.workingOpen}>
          <div className="px-5 pb-5">
            {r ? (
              <div className="space-y-1.5 font-mono text-xs leading-relaxed text-text-muted">
                <p>concentration = powder ÷ BAC water</p>
                <p>
                  = {trim(r.powderMg, 3)} mg ÷ {s.bac || NO_VALUE} mL ={" "}
                  <span className="text-foreground">
                    {trim(r.concentration, 3)} mg/mL
                  </span>
                </p>
                {r.doseMg != null && r.mlPerDose != null ? (
                  <>
                    <p className="pt-1.5">volume to draw = dose ÷ concentration</p>
                    <p>
                      = {trim(r.doseMg, 3)} mg ÷ {trim(r.concentration, 3)} mg/mL ={" "}
                      <span className="text-foreground">
                        {trim(r.mlPerDose, 3)} mL
                      </span>
                    </p>
                    <p className="pt-1.5">insulin units = volume × 100</p>
                    <p>
                      = {trim(r.mlPerDose, 3)} mL × 100 ={" "}
                      <span className="text-foreground">
                        {trim(r.unitsPerDose ?? 0, 1)} units
                      </span>
                    </p>
                  </>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-text-muted">
                {s.size == null
                  ? "Choose your syringe to see the working."
                  : "Enter the powder and BAC water to see the working."}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/** Legal copy, byte-identical to the shipped one. */
export function PermanentDisclaimer() {
  return (
    <div className="flex gap-3 rounded-xl border border-accent-amber/40 bg-accent-amber/10 p-3">
      <Warning className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber" aria-hidden />
      <p className="text-sm leading-relaxed text-accent-amber">
        This is a calculator, not a dosing instruction. It does only arithmetic on
        the numbers you enter and may be wrong. Re-check every figure and confirm
        it against your physical product before drawing or injecting anything. Do
        not rely on this output alone.
      </p>
    </div>
  )
}

export function ResetRow({ s }: { s: CalcState }) {
  return (
    <button
      type="button"
      onClick={s.reset}
      disabled={!s.dirty}
      className="w-full rounded-xl border border-border-strong py-3 text-sm font-medium text-text-muted transition-colors hover:text-text-primary disabled:pointer-events-none disabled:opacity-40"
    >
      Reset
    </button>
  )
}

export { CARD_EYEBROW, NO_VALUE, sanitizeAmount, trim }
