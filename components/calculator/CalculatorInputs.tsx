"use client"

import { useId } from "react"

import { ArrowsLeftRight } from "@/components/icons"

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
 * tablet thing").
 *
 * It is a single tap-to-flip chip, not a two-segment pill. The pill was tried
 * both ways and neither worked here: inside a half-width field it left the input
 * 9px wide at 320px, and outside on the label row it read as a stray control
 * floating above the box it governs. One chip is half the width, so it fits
 * inside the field even in a paired column.
 *
 * The cost of a flip control is that you cannot see the alternative, which
 * matters more than usual when the two units differ by 1000x. Three things pay
 * that back: the `ArrowsLeftRight` glyph says it changes, the accessible name
 * spells out both states, and the live conversion under the field always shows
 * the figure in the OTHER unit, so the alternative is on screen regardless.
 */
function UnitChip({
  unit,
  onChange,
  label,
}: {
  unit: MgUnit
  onChange: (u: MgUnit) => void
  label: string
}) {
  const next: MgUnit = unit === "mg" ? "mcg" : "mg"
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      aria-label={`${label} unit: ${unit}. Switch to ${next}.`}
      className="flex shrink-0 items-center gap-1 rounded-lg bg-bg-surface-raised px-2 py-1 text-[11px] font-medium text-foreground transition-transform active:scale-95"
    >
      {unit}
      <ArrowsLeftRight className="h-3 w-3 text-text-subtle" aria-hidden />
    </button>
  )
}

/**
 * One field.
 *
 * The unit sits inside the field, at its right edge: the flip chip where there
 * are two units, plain text where there is only one (mL). Watch the width when
 * changing this — a two-segment pill here left the powder input 9px wide at a
 * 320px viewport, so a typed "12.5" rendered as "1", which is a plausible-
 * looking wrong number on a screen whose whole argument is that you can see what
 * you entered. `unitWidth` below is what keeps that honest.
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
          <UnitChip unit={unit} onChange={onUnitChange} label={label} />
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
