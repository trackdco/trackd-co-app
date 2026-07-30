"use client"

import { useId } from "react"

import { cn } from "@/lib/utils"
import { CARD_EYEBROW } from "@/lib/ui-presets"
import { equivalentAmount, type MgUnit } from "@/lib/calculator/recon"
import { SYRINGE_SIZES, type SyringeSizeId } from "@/lib/calculator/syringe"

/** Field label. Matches `AddStockSheet`'s, so the two input surfaces read alike. */
const FIELD_LABEL =
  "block text-[10px] font-sans uppercase tracking-[0.14em] text-text-muted"

/**
 * The mg/mcg switch. Deliberately prominent for its size: which unit is selected
 * is the single most consequential thing on this card, because the two differ by
 * 1000x and a wrong tap is the most common error people make here.
 */
function UnitToggle({
  unit,
  onChange,
  label,
}: {
  unit: MgUnit
  onChange: (u: MgUnit) => void
  label: string
}) {
  return (
    <div
      role="group"
      aria-label={`${label} unit`}
      className="inline-flex shrink-0 rounded-lg bg-bg-input p-0.5 text-[11px]"
    >
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
 * One field.
 *
 * The unit control sits on the LABEL row, not inside the field. It used to live
 * inside, which looked tidier and was wrong: paired in a two-column grid, the
 * `shrink-0` toggle left the powder input 9px wide at a 320px viewport, so a
 * typed "12.5" displayed as "1" — a plausible-looking wrong number on a screen
 * whose entire argument is that you can see what you entered. On the label row
 * it competes with a 10px eyebrow instead of with the figure.
 *
 * A static unit (mL) sits in the same right-hand slot as the toggle, so the two
 * columns of a paired row keep identical label heights and their inputs line up.
 * It is NOT folded into the label text: the label is `uppercase`, which would
 * render "mL" as "ML", and a unit's casing is not cosmetic.
 */
function Field({
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
  const hintId = useId()
  const hint = unit ? equivalentAmount(value, unit) : null

  return (
    <div className="min-w-0">
      {/* Fixed height, sized to the toggle, so a paired row's two label rows
          match and the inputs beneath them rail. */}
      <div className="flex h-7 items-center justify-between gap-2">
        <label htmlFor={id} className={FIELD_LABEL}>
          {label}
        </label>
        {unit && onUnitChange ? (
          <UnitToggle unit={unit} onChange={onUnitChange} label={label} />
        ) : staticUnit ? (
          <span className="shrink-0 text-[11px] text-text-muted">
            {staticUnit}
          </span>
        ) : null}
      </div>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-describedby={hint ? hintId : undefined}
        className="mt-1.5 h-11 w-full min-w-0 rounded-xl bg-bg-input px-3 font-mono text-base tabular-nums text-foreground outline-none placeholder:text-text-subtle"
      />
      {/* Height reserved on the two-unit fields so a row never jumps as you
          type. The mL field has no second unit, so it reserves nothing. */}
      {unit ? (
        <p id={hintId} className="mt-1 h-4 text-[11px] text-text-subtle">
          {hint ? `= ${hint}` : ""}
        </p>
      ) : null}
    </div>
  )
}

/**
 * The barrel picker. The choice sticks across visits, so this is a standing
 * preference, not a per-calculation input (see `lib/calculator/syringeChoice`).
 */
export function SyringePills({
  sizeId,
  onChange,
}: {
  sizeId: SyringeSizeId
  onChange: (id: SyringeSizeId) => void
}) {
  return (
    <div
      role="group"
      aria-label="Syringe size"
      className="grid grid-cols-3 gap-1 rounded-full border border-border-default bg-bg-input p-0.5"
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
 * The input sheet (spec 07, chosen layout: Adrian, 2026-07-30).
 *
 * Powder and BAC water pair on one row because they are the two halves of a
 * single question (the concentration); the dose stands alone because it is a
 * different one. The syringe pills lead the sheet, and Reset does not touch
 * them: the barrel is a standing preference that sticks until changed.
 */
export function CalculatorInputs({
  sizeId,
  onSizeChange,
  powder,
  onPowderChange,
  powderUnit,
  onPowderUnitChange,
  bac,
  onBacChange,
  dose,
  onDoseChange,
  doseUnit,
  onDoseUnitChange,
  onReset,
  resettable,
}: {
  sizeId: SyringeSizeId
  onSizeChange: (id: SyringeSizeId) => void
  powder: string
  onPowderChange: (v: string) => void
  powderUnit: MgUnit
  onPowderUnitChange: (u: MgUnit) => void
  bac: string
  onBacChange: (v: string) => void
  dose: string
  onDoseChange: (v: string) => void
  doseUnit: MgUnit
  onDoseUnitChange: (u: MgUnit) => void
  onReset: () => void
  resettable: boolean
}) {
  return (
    // Heading above the surface at `px-1`, matching Protocol's `CompoundsRow` /
    // `ScheduleGrid`, so the calculator's sections read like the rest of the app.
    <section className="space-y-3">
      <h2 className={cn(CARD_EYEBROW, "px-1")}>Inputs</h2>
      <div className="space-y-4 rounded-2xl bg-bg-surface p-5">
        <div>
          <span className={FIELD_LABEL}>Syringe</span>
          <div className="mt-1.5">
            <SyringePills sizeId={sizeId} onChange={onSizeChange} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Powder"
            value={powder}
            onChange={onPowderChange}
            placeholder="5"
            unit={powderUnit}
            onUnitChange={onPowderUnitChange}
          />
          <Field
            label="BAC water"
            value={bac}
            onChange={onBacChange}
            placeholder="2"
            staticUnit="mL"
          />
        </div>

        <Field
          label="Dose"
          value={dose}
          onChange={onDoseChange}
          placeholder="250"
          unit={doseUnit}
          onUnitChange={onDoseUnitChange}
        />

        <button
          type="button"
          onClick={onReset}
          disabled={!resettable}
          className="w-full rounded-xl border border-border-strong py-3 text-sm font-medium text-text-muted transition-colors hover:text-text-primary disabled:pointer-events-none disabled:opacity-40"
        >
          Reset
        </button>
      </div>
    </section>
  )
}
