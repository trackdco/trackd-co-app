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
 * The mg/mcg switch, sitting INSIDE the field's own surface at its right edge
 * (Adrian, 2026-07-30: "drop the button down into it so it's part of the little
 * tablet thing", and "I should be able to still see both measurements").
 *
 * So: a two-segment pill, not a tap-to-flip chip. Seeing BOTH units at once is
 * the point when the two differ by 1000x — a flip control hides the alternative
 * behind a tap, and the alternative is exactly the thing a user needs to notice
 * they picked wrong.
 *
 * Sized tightly on purpose. A full-size pill in here left the powder input 9px
 * wide at a 320px viewport, so a typed "12.5" rendered as "1". This one is
 * 10px text on 1.5-unit padding, and the paired row unpairs below 360px, which
 * together keep the number legible on the narrowest phone in use.
 */
function UnitPill({
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
      className="flex shrink-0 rounded-lg bg-bg-surface-raised p-0.5 text-[10px] leading-none"
    >
      {(["mg", "mcg"] as const).map((u) => (
        <button
          key={u}
          type="button"
          aria-pressed={unit === u}
          onClick={() => onChange(u)}
          className={cn(
            "rounded-[5px] px-1.5 py-1.5 font-medium transition-colors",
            unit === u
              ? "bg-bg-input text-foreground"
              : "text-text-subtle hover:text-text-muted",
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
 * The unit sits inside the field, at its right edge: the two-segment pill where
 * there are two units, plain text where there is only one (mL). Watch the width
 * when changing this — a full-size pill here left the powder input 9px wide at a
 * 320px viewport, so a typed "12.5" rendered as "1", which is a plausible-
 * looking wrong number on a screen whose whole argument is that you can see what
 * you entered.
 *
 * The unit is NOT folded into the label text: the label is `uppercase`, which
 * would render "mL" as "ML", and a unit's casing is not cosmetic.
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
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      {/* The field is the surface; the input and the unit share it. */}
      <div className="mt-1.5 flex h-11 items-center gap-1.5 rounded-xl bg-bg-input pr-1.5 pl-3">
        <input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-describedby={hint ? hintId : undefined}
          className="w-full min-w-0 flex-1 bg-transparent font-mono text-base tabular-nums text-foreground outline-none placeholder:text-text-subtle"
        />
        {unit && onUnitChange ? (
          <UnitPill unit={unit} onChange={onUnitChange} label={label} />
        ) : (
          <span className="shrink-0 pr-1.5 text-[11px] text-text-muted">
            {staticUnit}
          </span>
        )}
      </div>
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

        {/* Paired above 360px, stacked below it: two columns and an in-field
            unit pill cannot both fit on the narrowest phones still in use. */}
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
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
