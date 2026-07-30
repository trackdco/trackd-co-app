"use client"

import { useState } from "react"
import { Backspace } from "@/components/icons"

import { cn } from "@/lib/utils"
import { CARD_EYEBROW } from "@/lib/ui-presets"
import type { MgUnit } from "@/lib/calculator/recon"

import {
  ResetRow,
  SyringePills,
  equivalentHint,
  sanitizeAmount,
  type CalcState,
} from "./shared"

/**
 * DEV-ONLY. The four input treatments Adrian is choosing between. Everything
 * above them (readout, barrel, figures strip) is identical in all four, so what
 * is being compared is only this section.
 *
 * All four share: the mg/mcg toggle on the two amount fields, the live
 * conversion under them, and the syringe pills (which are also the gate's
 * control, repeated here so the choice stays changeable after it is made).
 */

const FIELD_LABEL =
  "block text-[10px] font-sans uppercase tracking-[0.14em] text-text-muted"

function UnitToggle({
  unit,
  onChange,
  size = "sm",
}: {
  unit: MgUnit
  onChange: (u: MgUnit) => void
  size?: "sm" | "md"
}) {
  return (
    <div
      className={cn(
        "inline-flex shrink-0 rounded-lg bg-bg-input p-0.5",
        size === "md" ? "text-xs" : "text-[11px]",
      )}
    >
      {(["mg", "mcg"] as const).map((u) => (
        <button
          key={u}
          type="button"
          aria-pressed={unit === u}
          onClick={() => onChange(u)}
          className={cn(
            "rounded-md font-medium transition-colors",
            size === "md" ? "px-2.5 py-1.5" : "px-2 py-1",
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
 * The barrel pills, so the choice stays changeable after the gate is passed.
 * Renders NOTHING while the gate is still up: the gate puts the same picker at
 * the top of the screen, and two copies of one control on one screen is sloppy.
 */
function SizeRow({ s }: { s: CalcState }) {
  if (s.sizeId == null) return null
  return (
    <div>
      <span className={FIELD_LABEL}>Syringe</span>
      <div className="mt-1.5">
        <SyringePills sizeId={s.sizeId} onChange={s.setSizeId} />
      </div>
    </div>
  )
}

/* ============================================================ A — Keypad */

type FieldId = "powder" | "bac" | "dose"

/**
 * A — BUILT-IN KEYPAD. No iOS keyboard: one field is active, shown large, and
 * the pad is always in the same place. Nothing ever slides up over the barrel,
 * which is the one thing on the screen you want to keep watching while you type.
 */
export function KeypadInputs({ s }: { s: CalcState }) {
  const [active, setActive] = useState<FieldId>("powder")

  const FIELDS: {
    id: FieldId
    label: string
    /** Short form for the tab, which is a third of the width. */
    tab: string
    value: string
    placeholder: string
    set: (v: string) => void
    unit?: MgUnit
    setUnit?: (u: MgUnit) => void
    staticUnit?: string
  }[] = [
    {
      id: "powder",
      label: "Powder in vial",
      tab: "Powder",
      value: s.powder,
      placeholder: "5",
      set: s.setPowder,
      unit: s.powderUnit,
      setUnit: s.setPowderUnit,
    },
    {
      id: "bac",
      label: "BAC water",
      tab: "BAC water",
      value: s.bac,
      placeholder: "2",
      set: s.setBac,
      staticUnit: "mL",
    },
    {
      id: "dose",
      label: "Dose",
      tab: "Dose",
      value: s.dose,
      placeholder: "250",
      set: s.setDose,
      unit: s.doseUnit,
      setUnit: s.setDoseUnit,
    },
  ]

  const field = FIELDS.find((f) => f.id === active) ?? FIELDS[0]
  const hint = field.unit ? equivalentHint(field.value, field.unit) : null

  function press(key: string) {
    if (key === "del") field.set(field.value.slice(0, -1))
    else field.set(sanitizeAmount(field.value + key))
  }

  return (
    <section className="space-y-4 rounded-2xl bg-bg-surface p-5">
      <SizeRow s={s} />

      {/* The three fields as tabs: each shows its own value, so nothing is
          hidden just because it is not the one being typed. */}
      <div className="grid grid-cols-3 gap-1">
        {FIELDS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={active === f.id}
            onClick={() => setActive(f.id)}
            className={cn(
              "rounded-xl px-2 py-2 text-left transition-colors",
              active === f.id ? "bg-bg-surface-raised" : "bg-transparent",
            )}
          >
            <span className="block truncate text-[10px] tracking-[0.1em] text-text-subtle uppercase">
              {f.tab}
            </span>
            <span
              className={cn(
                "mt-0.5 block truncate font-mono text-sm tabular-nums",
                f.value ? "text-foreground" : "text-text-subtle",
              )}
            >
              {f.value || f.placeholder}
            </span>
          </button>
        ))}
      </div>

      {/* The active field, large. */}
      <div className="flex items-end justify-between gap-3 border-b border-border-default pb-3">
        <div className="min-w-0">
          <span className={FIELD_LABEL}>{field.label}</span>
          <p className="mt-1 truncate font-mono text-[32px] leading-none font-light tabular-nums text-foreground">
            {field.value || (
              <span className="text-text-subtle">{field.placeholder}</span>
            )}
          </p>
          <p className="mt-1 h-4 text-[11px] text-text-subtle">
            {hint ? `= ${hint}` : ""}
          </p>
        </div>
        {field.unit && field.setUnit ? (
          <UnitToggle unit={field.unit} onChange={field.setUnit} size="md" />
        ) : (
          <span className="pb-1 text-sm text-text-muted">{field.staticUnit}</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className="rounded-xl bg-bg-input py-3.5 font-mono text-lg text-foreground transition-transform active:scale-[0.96]"
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          onClick={() => press("del")}
          aria-label="Delete last digit"
          className="flex items-center justify-center rounded-xl bg-bg-input py-3.5 text-text-muted transition-transform active:scale-[0.96]"
        >
          <Backspace className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <ResetRow s={s} />
    </section>
  )
}

/* ========================================================== B — Sentence */

/** An inline value in the sentence: underlined, tappable, sized to its content. */
function InlineValue({
  value,
  onChange,
  placeholder,
  ariaLabel,
  width = "w-14",
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  ariaLabel: string
  width?: string
}) {
  return (
    <input
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={cn(
        width,
        "mx-0.5 border-b border-border-strong bg-transparent pb-0.5 text-center font-mono text-base text-foreground outline-none transition-colors placeholder:text-text-subtle focus:border-accent-amber",
      )}
    />
  )
}

/** A tap-to-flip unit, inline in the prose. A two-segment pill would break the
 *  line; a single word that swaps reads as part of the sentence. */
function InlineUnit({
  unit,
  onChange,
  label,
}: {
  unit: MgUnit
  onChange: (u: MgUnit) => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(unit === "mg" ? "mcg" : "mg")}
      aria-label={`${label}, currently ${unit}. Tap to switch.`}
      className="mx-0.5 rounded-md bg-bg-input px-2 py-0.5 font-mono text-sm text-foreground transition-colors hover:bg-bg-surface-raised"
    >
      {unit}
    </button>
  )
}

/**
 * B — FILL IN THE BLANK. The inputs read as a sentence. Slowest to scan but the
 * hardest to get a unit wrong in, because you are reading back what you are
 * claiming rather than filling boxes.
 */
export function SentenceInputs({ s }: { s: CalcState }) {
  const doseHint = equivalentHint(s.dose, s.doseUnit)
  const powderHint = equivalentHint(s.powder, s.powderUnit)

  return (
    <section className="space-y-5 rounded-2xl bg-bg-surface p-5">
      <SizeRow s={s} />

      <p className="text-base leading-[2.4] text-text-muted">
        I dissolved
        <InlineValue
          value={s.powder}
          onChange={s.setPowder}
          placeholder="5"
          ariaLabel="Powder in vial"
        />
        <InlineUnit
          unit={s.powderUnit}
          onChange={s.setPowderUnit}
          label="Powder unit"
        />
        of powder in
        <InlineValue
          value={s.bac}
          onChange={s.setBac}
          placeholder="2"
          ariaLabel="BAC water added, in millilitres"
        />
        <span className="mx-0.5 font-mono text-sm text-text-muted">mL</span>
        of BAC water.
      </p>
      {powderHint ? (
        <p className="-mt-3 text-[11px] text-text-subtle">
          powder = {powderHint}
        </p>
      ) : null}

      <p className="text-base leading-[2.4] text-text-muted">
        My dose is
        <InlineValue
          value={s.dose}
          onChange={s.setDose}
          placeholder="250"
          ariaLabel="Dose"
          width="w-16"
        />
        <InlineUnit unit={s.doseUnit} onChange={s.setDoseUnit} label="Dose unit" />
      </p>
      {doseHint ? (
        <p className="-mt-3 text-[11px] text-text-subtle">dose = {doseHint}</p>
      ) : null}

      <ResetRow s={s} />
    </section>
  )
}

/* ====================================================== C — One card each */

function InputCardField({
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
  const hint = unit ? equivalentHint(value, unit) : null
  return (
    <label className="block rounded-2xl bg-bg-surface p-4">
      <span className={FIELD_LABEL}>{label}</span>
      <span className="mt-1.5 flex items-center gap-3">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className="min-w-0 flex-1 bg-transparent font-mono text-2xl font-light tabular-nums text-foreground outline-none placeholder:text-text-subtle"
        />
        {unit && onUnitChange ? (
          <UnitToggle unit={unit} onChange={onUnitChange} size="md" />
        ) : (
          <span className="text-sm text-text-muted">{staticUnit}</span>
        )}
      </span>
      {unit ? (
        <span className="mt-1 block h-4 text-[11px] text-text-subtle">
          {hint ? `= ${hint}` : ""}
        </span>
      ) : null}
    </label>
  )
}

/**
 * C — ONE CARD PER INPUT. The house identity applied to inputs: small eyebrow
 * label, the VALUE as the display layer. Most consistent with every other card
 * in the app, and the most vertical space of the four.
 */
export function CardInputs({ s }: { s: CalcState }) {
  return (
    <div className="space-y-2.5">
      <div className="rounded-2xl bg-bg-surface p-4">
        <SizeRow s={s} />
      </div>
      <InputCardField
        label="Powder in vial"
        value={s.powder}
        onChange={s.setPowder}
        placeholder="5"
        unit={s.powderUnit}
        onUnitChange={s.setPowderUnit}
      />
      <InputCardField
        label="BAC water added"
        value={s.bac}
        onChange={s.setBac}
        placeholder="2"
        staticUnit="mL"
      />
      <InputCardField
        label="Dose"
        value={s.dose}
        onChange={s.setDose}
        placeholder="250"
        unit={s.doseUnit}
        onUnitChange={s.setDoseUnit}
      />
      <ResetRow s={s} />
    </div>
  )
}

/* ========================================================== D — Two-up grid */

function GridField({
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
  const hint = unit ? equivalentHint(value, unit) : null
  return (
    <label className="block min-w-0">
      <span className={FIELD_LABEL}>{label}</span>
      <span className="mt-1.5 flex h-11 items-center gap-1.5 rounded-xl bg-bg-input px-3">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className="min-w-0 flex-1 bg-transparent font-mono text-base tabular-nums text-foreground outline-none placeholder:text-text-subtle"
        />
        {unit && onUnitChange ? (
          <UnitToggle unit={unit} onChange={onUnitChange} />
        ) : (
          <span className="text-sm text-text-muted">{staticUnit}</span>
        )}
      </span>
      <span className="mt-1 block h-4 text-[11px] text-text-subtle">
        {hint ? `= ${hint}` : ""}
      </span>
    </label>
  )
}

/**
 * D — TWO-UP GRID. Powder and BAC water pair on one row because they are the
 * two halves of the concentration; the dose stands alone because it is a
 * different question. Tightest of the four, and the most conventional.
 */
export function GridInputs({ s }: { s: CalcState }) {
  return (
    <section className="space-y-4 rounded-2xl bg-bg-surface p-5">
      <SizeRow s={s} />
      <div className="grid grid-cols-2 gap-3">
        <GridField
          label="Powder"
          value={s.powder}
          onChange={s.setPowder}
          placeholder="5"
          unit={s.powderUnit}
          onUnitChange={s.setPowderUnit}
        />
        <GridField
          label="BAC water"
          value={s.bac}
          onChange={s.setBac}
          placeholder="2"
          staticUnit="mL"
        />
      </div>
      <GridField
        label="Dose"
        value={s.dose}
        onChange={s.setDose}
        placeholder="250"
        unit={s.doseUnit}
        onUnitChange={s.setDoseUnit}
      />
      <ResetRow s={s} />
    </section>
  )
}

export { CARD_EYEBROW }
