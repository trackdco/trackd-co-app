"use client"

import { useId, type RefObject } from "react"

import { padFieldKeyDown } from "@/components/feel/NumberPad"
import { useFitText } from "@/components/feel/useFitText"
import { ThumbGroup } from "@/components/feel/SlidingThumb"
import { cn } from "@/lib/utils"
import { CARD_EYEBROW, PRESS } from "@/lib/ui-presets"
import { equivalentAmount, type MgUnit } from "@/lib/calculator/recon"
import { SYRINGE_SIZES, type SyringeSizeId } from "@/lib/calculator/syringe"

/** Field label. Matches `AddStockSheet`'s, so the two input surfaces read alike. */
const FIELD_LABEL =
  "block text-[10px] font-sans uppercase tracking-[0.14em] text-text-muted"

/**
 * The shared field focus (build-brief-final §3.5, `.inset-focus` in
 * globals.css): an inset 1.2px muted ring INSIDE the field. Here the field is a
 * box around its value button and its unit, so the box takes the ring while
 * the value button has keyboard focus, rather than the button drawing a 2px
 * amber ring round only its own part (cold review D31).
 */
const FIELD_FOCUS =
  "has-[[data-pad-field]:focus-visible]:inset-ring-[1.2px] has-[[data-pad-field]:focus-visible]:inset-ring-text-muted"

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
    <ThumbGroup
      selection={unit}
      thumbClassName="inst-thumb"
      role="group"
      aria-label={`${label} unit`}
      className="flex shrink-0 gap-0.5 inst-rail p-1 text-[11px] leading-none"
    >
      {(["mg", "mcg"] as const).map((u) => (
        <button
          key={u}
          type="button"
          aria-pressed={unit === u}
          onClick={() => onChange(u)}
          className={cn(
            // min-w/min-h 24px: WCAG 2.5.8 (AA) target size. These were 22.8 x
            // 22 and touching, and the spacing exception does not apply when the
            // 24px circles intersect. This is the control that guards the 1000x
            // mg/mcg slip the whole screen is built around, so it is the last
            // one that should be hard to hit.
            // 28px tall and at least 28 wide, with a gap between them. WCAG
            // 2.5.8 asks for 24; these were 22.8 x 22 and touching, on the one
            // control that guards the 1000x mg/mcg slip.
            PRESS.pill,
            "min-h-7 min-w-7 rounded-md px-1.5 font-medium transition-colors duration-300",
            // The sliding thumb is the selection (feel pass §6).
            unit === u ? "text-bg-base" : "text-text-muted hover:text-text-primary",
          )}
        >
          {u}
        </button>
      ))}
    </ThumbGroup>
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
  unit,
  onUnitChange,
  staticUnit,
  active,
  onOpen,
  fieldRef,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  unit?: MgUnit
  onUnitChange?: (u: MgUnit) => void
  staticUnit?: string
  /** This field is being typed on the pad. */
  active: boolean
  /** Open the pad on this field. */
  onOpen: () => void
  fieldRef?: RefObject<HTMLButtonElement | null>
  /**
   * PUBLIC PAGES ONLY (the landing page's free calculator and the features
   * widget): a plain input with the system keyboard, which is what those pages
   * shipped and what someone who has never seen Trakabl expects on a web page.
   * The pad is the app's rule (feel pass §3), and the app passes no `onChange`.
   */
  onChange?: (v: string) => void
  placeholder?: string
}) {
  const id = useId()
  const hintId = useId()
  const hint = unit ? equivalentAmount(value, unit) : null
  const unitWord = unit ?? staticUnit
  // A long figure shrinks to fit; never clipped, never an ellipsis.
  const fitRef = useFitText<HTMLSpanElement>(value)

  const plain = onChange !== undefined

  return (
    <div className="min-w-0">
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
        {/* The two-unit fields announce their unit through the pill's labelled
            group; this one has no control, so without this its "mL" is a loose
            text node that assistive tech never ties to the field. */}
        {staticUnit ? (
          // `normal-case`: this span sits inside the `uppercase` label, which
          // was announcing "BAC WATER IN ML" — the very casing bug the comment
          // above says a unit must not suffer.
          <span className="sr-only normal-case"> in {staticUnit}</span>
        ) : null}
      </label>
      {/* The field is the surface; the input and the unit share it. Its
          muted words (the unit, a placeholder, the pill's unpicked side) take
          `--text-on-input` through the `.bg-bg-input` scope in globals.css,
          5:1 on this surface (D16; pinned in lib/feel/sharedUiCss.test.ts). */}
      {/* `pl-2.5` + `gap-1` rather than the roomier defaults: the paired
          columns are tightest at 360-390px, where the pill and the number are
          competing for about 110px of field. */}
      {/* The value is typed on the Trakabl pad (feel pass §3): a button, so
          nothing summons the system keypad, with the white ring and a caret
          while it is the field being edited. No placeholder figure: an empty
          field is empty. */}
      {plain ? (
        <div className="mt-1.5 flex h-11 items-center gap-1 rounded-xl bg-bg-input pr-1 pl-2.5">
          <input
            id={id}
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            aria-describedby={hint ? hintId : undefined}
            className="w-full min-w-0 flex-1 bg-transparent font-mono text-base tabular-nums text-foreground outline-none placeholder:text-text-muted"
          />
          {unit && onUnitChange ? (
            <UnitPill unit={unit} onChange={onUnitChange} label={label} />
          ) : (
            <span className="shrink-0 pr-1.5 text-[11px] text-text-muted">{staticUnit}</span>
          )}
        </div>
      ) : (
      <div
        className={cn(
          "mt-1.5 flex h-11 items-center gap-1 rounded-xl border border-transparent bg-bg-input pr-1 transition-[border-color,box-shadow] duration-200",
          FIELD_FOCUS,
          active && "border-text-primary ring-1 ring-text-primary",
        )}
      >
        <button
          id={id}
          ref={fieldRef}
          type="button"
          onClick={onOpen}
          onKeyDown={(e) => padFieldKeyDown(e, onOpen, active)}
          data-pad-field
          aria-label={`${label}, ${value ? `${value}${unitWord ? ` ${unitWord}` : ""}` : "empty"}`}
          aria-describedby={hint ? hintId : undefined}
          className={cn(
            PRESS.field,
            "flex h-full w-full min-w-0 flex-1 items-center overflow-hidden rounded-xl pl-2.5 pr-1.5 text-left font-mono text-base tabular-nums text-foreground outline-none",
          )}
        >
          <span ref={fitRef} className="pad-value min-w-0 whitespace-nowrap">
            {value}
            {active ? <span aria-hidden className="pad-caret" /> : null}
          </span>
        </button>
        {unit && onUnitChange ? (
          <UnitPill unit={unit} onChange={onUnitChange} label={label} />
        ) : (
          <span className="shrink-0 pr-1.5 text-[11px] text-text-muted">
            {staticUnit}
          </span>
        )}
      </div>
      )}
      {/* Height reserved on the two-unit fields so a row never jumps as you
          type. The mL field has no second unit, so it reserves nothing. */}
      {unit ? (
        <p id={hintId} className="mt-1 h-4 text-[11px] text-text-muted">
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
    <ThumbGroup
      selection={sizeId}
      thumbClassName="inst-thumb"
      role="group"
      aria-label="Syringe size"
      className="grid grid-cols-3 gap-1 inst-rail p-0.5"
    >
      {SYRINGE_SIZES.map((s) => (
        <button
          key={s.id}
          type="button"
          aria-pressed={sizeId === s.id}
          onClick={() => onChange(s.id)}
          className={cn(
            PRESS.pill,
            "rounded-sm py-1.5 text-xs font-medium transition-colors duration-300 ease-out",
            sizeId === s.id ? "text-bg-base" : "text-text-muted",
          )}
        >
          {s.label}
        </button>
      ))}
    </ThumbGroup>
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
  powderUnit,
  onPowderUnitChange,
  bac,
  dose,
  doseUnit,
  onDoseUnitChange,
  onReset,
  resettable,
  activeField = null,
  onOpenField,
  fieldRefs,
  onPowderChange,
  onBacChange,
  onDoseChange,
}: {
  sizeId: SyringeSizeId
  onSizeChange: (id: SyringeSizeId) => void
  /** The three values. They are typed on the pad, which the calculator owns. */
  powder: string
  powderUnit: MgUnit
  onPowderUnitChange: (u: MgUnit) => void
  bac: string
  dose: string
  doseUnit: MgUnit
  onDoseUnitChange: (u: MgUnit) => void
  onReset: () => void
  resettable: boolean
  /** Which field the pad is on, or null. The app passes this and opens the pad. */
  activeField?: "powder" | "bac" | "dose" | null
  onOpenField?: (field: "powder" | "bac" | "dose") => void
  fieldRefs?: Record<"powder" | "bac" | "dose", RefObject<HTMLButtonElement | null>>
  /**
   * The public pages pass these INSTEAD of `onOpenField`, and get plain inputs
   * (see `Field`): the landing page's free calculator and the features widget.
   */
  onPowderChange?: (v: string) => void
  onBacChange?: (v: string) => void
  onDoseChange?: (v: string) => void
}) {
  const open = (field: "powder" | "bac" | "dose") => () => onOpenField?.(field)
  return (
    // Heading above the surface at `px-1`, matching Protocol's `CompoundsRow` /
    // `ScheduleGrid`, so the calculator's sections read like the rest of the app.
    <section className="space-y-3">
      <h2 className={cn(CARD_EYEBROW, "px-1")}>Inputs</h2>
      <div className="flow-card space-y-4 inst-card p-5">
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
            unit={powderUnit}
            onUnitChange={onPowderUnitChange}
            active={activeField === "powder"}
            onOpen={open("powder")}
            fieldRef={fieldRefs?.powder}
            onChange={onPowderChange}
            placeholder={onPowderChange ? "5" : undefined}
          />
          <Field
            label="BAC water"
            value={bac}
            staticUnit="mL"
            active={activeField === "bac"}
            onOpen={open("bac")}
            onChange={onBacChange}
            placeholder={onBacChange ? "2" : undefined}
            fieldRef={fieldRefs?.bac}
          />
        </div>

        <Field
          label="Dose"
          value={dose}
          unit={doseUnit}
          onUnitChange={onDoseUnitChange}
          active={activeField === "dose"}
          onOpen={open("dose")}
          onChange={onDoseChange}
          placeholder={onDoseChange ? "250" : undefined}
          fieldRef={fieldRefs?.dose}
        />

        <button
          type="button"
          onClick={onReset}
          disabled={!resettable}
          className={cn(PRESS.button, "w-full rounded-xl border border-border-strong py-3 text-sm font-medium text-text-muted transition-colors hover:text-text-primary disabled:pointer-events-none disabled:opacity-40")}
        >
          Reset
        </button>
      </div>
    </section>
  )
}
