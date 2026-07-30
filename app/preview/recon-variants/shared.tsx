"use client"

import { useId, useMemo, useState } from "react"
import { CaretDown, Warning } from "@/components/icons"

import { cn } from "@/lib/utils"
import { CARD_EYEBROW, COLUMN_EYEBROW, DATA_MONO } from "@/lib/ui-presets"
import {
  computeRecon,
  sanitizeAmount,
  toMg,
  trim,
  type MgUnit,
  type ReconResult,
} from "@/lib/calculator/recon"
import {
  MIN_READABLE_UNITS,
  SYRINGE_SIZES,
  fillFraction,
  misuseKind,
  syringeSize,
  type MisuseKind,
  type SyringeSize,
  type SyringeSizeId,
} from "@/lib/calculator/syringe"

/**
 * DEV-ONLY. Shared pieces for the spec 07 layout alternatives at
 * `/preview/recon-variants`. Nothing here is imported by the shipped calculator
 * — the point is to try layouts on a real phone WITHOUT touching what is already
 * reviewed and committed. Delete this folder once a direction is picked.
 *
 * Every variant runs the identical maths (`lib/calculator/recon`) and the
 * identical barrel (`lib/calculator/syringe`), so what is being compared is
 * layout and chrome, nothing else.
 */

const NO_VALUE = "—"

/**
 * Two defaults differ from the shipped calculator, both from the 2026-07-30
 * research rather than taste:
 *
 * - Dose starts in **mcg**. Vials are labelled in mg (5mg, 10mg, 2mg semaglutide)
 *   but doses are overwhelmingly written in mcg (250mcg, 500mcg), and the mg/mcg
 *   mix-up is documented as the single most common dosing error in this space.
 * - The barrel starts at **0.5 mL**, the size the equipment guides call the best
 *   all-round default for subcutaneous peptide injection. The shipped calculator
 *   starts at 1 mL, which was picked only because it cannot raise an
 *   over-capacity warning.
 */
const DEFAULT_DOSE_UNIT: MgUnit = "mcg"
const DEFAULT_SIZE: SyringeSizeId = "0.5"

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
  sizeId: SyringeSizeId
  setSizeId: (id: SyringeSizeId) => void
  workingOpen: boolean
  setWorkingOpen: (v: boolean | ((o: boolean) => boolean)) => void
  result: ReconResult | null
  size: SyringeSize
  units: number | null
  fill: number
  misuse: MisuseKind
  dirty: boolean
  reset: () => void
}

/** One state hook every variant shares, so they cannot drift in behaviour. */
export function useCalcState(): CalcState {
  const [powder, setPowder] = useState("")
  const [powderUnit, setPowderUnit] = useState<MgUnit>("mg")
  const [bac, setBac] = useState("")
  const [dose, setDose] = useState("")
  const [doseUnit, setDoseUnit] = useState<MgUnit>(DEFAULT_DOSE_UNIT)
  const [sizeId, setSizeId] = useState<SyringeSizeId>(DEFAULT_SIZE)
  const [workingOpen, setWorkingOpen] = useState(false)

  const result = useMemo(
    () => computeRecon({ powder, powderUnit, bac, dose, doseUnit }),
    [powder, powderUnit, bac, dose, doseUnit],
  )
  const size = syringeSize(sizeId)
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
    setSizeId,
    workingOpen,
    setWorkingOpen,
    result,
    size,
    units,
    fill: fillFraction(units, size),
    misuse: misuseKind(units, size),
    dirty:
      powder !== "" ||
      bac !== "" ||
      dose !== "" ||
      powderUnit !== "mg" ||
      doseUnit !== DEFAULT_DOSE_UNIT ||
      sizeId !== DEFAULT_SIZE ||
      workingOpen,
    reset: () => {
      setPowder("")
      setPowderUnit("mg")
      setBac("")
      setDose("")
      setDoseUnit(DEFAULT_DOSE_UNIT)
      setSizeId(DEFAULT_SIZE)
      setWorkingOpen(false)
    },
  }
}

/**
 * The other half of the mg/mcg fix: show the figure in the OTHER unit, live,
 * right under the one being typed. "250 mcg" reading "0.25 mg" beneath it makes
 * a 1000x slip visible at the moment it is made, which a default cannot do.
 */
export function equivalentHint(value: string, unit: MgUnit): string | null {
  const n = parseFloat(value)
  if (!Number.isFinite(n) || n <= 0) return null
  const mg = toMg(n, unit)
  return unit === "mcg" ? `${trim(mg, 4)} mg` : `${trim(mg * 1000, 1)} mcg`
}

/* ------------------------------------------------------------------ inputs */

export function UnitToggle({
  unit,
  onChange,
}: {
  unit: MgUnit
  onChange: (u: MgUnit) => void
}) {
  return (
    <div className="inline-flex shrink-0 rounded-lg bg-bg-input p-0.5 text-[11px]">
      {(["mg", "mcg"] as const).map((u) => (
        <button
          key={u}
          type="button"
          aria-pressed={unit === u}
          onClick={() => onChange(u)}
          className={cn(
            "rounded-md px-2 py-1 font-medium transition-colors",
            unit === u
              ? "bg-bg-surface-raised text-foreground"
              : "text-text-subtle",
          )}
        >
          {u}
        </button>
      ))}
    </div>
  )
}

/**
 * A field as a LIST ROW, not a boxed form input: label left, figure right-railed
 * in mono, hairline between rows. This is the app's documented list-row pattern
 * (`ui-context.md` → Layout Patterns) and it is most of what makes the compact
 * variants read as an app rather than a web form. Three stacked bordered boxes
 * is the single most form-like thing on the shipped screen.
 */
export function InputRow({
  label,
  value,
  onChange,
  placeholder,
  unit,
  onUnitChange,
  staticUnit,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  unit?: MgUnit
  onUnitChange?: (u: MgUnit) => void
  staticUnit?: string
}) {
  const id = useId()
  const hint = unit ? equivalentHint(value, unit) : null

  return (
    <div className="py-1">
      <div className="flex items-center gap-3 py-2.5">
        <label htmlFor={id} className="min-w-0 flex-1 text-sm text-text-muted">
          {label}
        </label>
        <input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-[4.5rem] min-w-0 bg-transparent text-right font-mono text-base text-foreground outline-none placeholder:text-text-subtle"
        />
        {unit && onUnitChange ? (
          <UnitToggle unit={unit} onChange={onUnitChange} />
        ) : (
          <span className="w-[3.25rem] shrink-0 text-sm text-text-muted">
            {staticUnit}
          </span>
        )}
      </div>
      {/* The live conversion, on the rows that HAVE two units. Height is reserved
          so the row never jumps as you type, but only where a hint can appear:
          reserving it on the mL row just leaves a hole. */}
      {unit ? (
        <p className="h-4 pr-[3.25rem] text-right text-[11px] text-text-subtle">
          {hint ? `= ${hint}` : ""}
        </p>
      ) : null}
    </div>
  )
}

export function SyringePills({
  sizeId,
  onChange,
}: {
  sizeId: SyringeSizeId
  onChange: (id: SyringeSizeId) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-full border border-border-default bg-bg-input p-0.5">
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

export function InputCard({ s }: { s: CalcState }) {
  return (
    <section className="rounded-2xl bg-bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <p className={CARD_EYEBROW}>Inputs</p>
        <button
          type="button"
          onClick={s.reset}
          disabled={!s.dirty}
          className="text-xs font-medium text-text-muted transition-colors hover:text-text-primary disabled:opacity-30"
        >
          Reset
        </button>
      </div>

      <div className="mt-3">
        <SyringePills sizeId={s.sizeId} onChange={s.setSizeId} />
      </div>

      <div className="mt-1 divide-y divide-border-default">
        <InputRow
          label="Powder in vial"
          value={s.powder}
          onChange={s.setPowder}
          placeholder="5"
          unit={s.powderUnit}
          onUnitChange={s.setPowderUnit}
        />
        <InputRow
          label="BAC water added"
          value={s.bac}
          onChange={s.setBac}
          placeholder="2"
          staticUnit="mL"
        />
        <InputRow
          label="Dose"
          value={s.dose}
          onChange={s.setDose}
          placeholder="250"
          unit={s.doseUnit}
          onUnitChange={s.setDoseUnit}
        />
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ output */

/** The three figures as ONE hairline-divided strip rather than three cards. */
export function FiguresStrip({ s }: { s: CalcState }) {
  const cells: Array<{ label: string; value: string; unit: string; accent?: boolean }> = [
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
  if (!s.misuse) return null
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

export function BarrelCaption({ s }: { s: CalcState }) {
  return (
    <p className={cn(DATA_MONO, "text-center")}>
      {s.size.label} barrel · {s.size.units} units
    </p>
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
                Enter the powder and BAC water to see the working.
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

export { NO_VALUE, trim }
