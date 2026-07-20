"use client"

import { useMemo, useState } from "react"
import { Warning } from "@/components/icons"

import { cn } from "@/lib/utils"
import { CARD_EYEBROW } from "@/lib/ui-presets"
import { Input } from "@/components/ui/input"

const DISCLAIMER =
  "This is a calculator, not a dosing instruction. It does only arithmetic on " +
  "the numbers you enter and may be wrong. Re-check every figure and confirm it " +
  "against your physical product before drawing or injecting anything. Do not " +
  "rely on this output alone."

type MgUnit = "mg" | "mcg"

/** Digits + a single decimal point, ≤6 whole digits + ≤3 decimals. */
function sanitize(raw: string): string {
  let v = raw.replace(/[^0-9.]/g, "")
  const dot = v.indexOf(".")
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "")
  const [int = "", dec] = v.split(".")
  const clampedInt = int.slice(0, 6)
  return v.includes(".") ? `${clampedInt}.${(dec ?? "").slice(0, 3)}` : clampedInt
}

const toMg = (value: number, unit: MgUnit) => (unit === "mcg" ? value / 1000 : value)

/** Trim trailing zeros after fixing to `dp` places. */
function trim(n: number, dp: number): string {
  return String(Number(n.toFixed(dp)))
}

/**
 * Reconstitution calculator (Context/Feature Specs/08 → A8). Surfaces the four
 * required figures — powder mg, BAC water mL, the resulting concentration, and mL
 * per target dose — plus insulin units (1 mL = 100 U) as a draw aid. The maths
 * are identical to `v_inventory_math`: concentration = powder ÷ BAC water,
 * mL/dose = dose ÷ concentration (rounded the same way the view rounds). Inputs
 * accept mg or mcg; everything is computed in mg. Information, never advice — the
 * medical-disclaimer line is always shown.
 *
 * Frame-agnostic by design (Spec 20): this is the calculator itself — fields,
 * maths, result, working, disclaimer — and nothing about where it sits. The
 * standalone `/calculator` page (the centre nav slot) is its one entry point;
 * the Home glance card + its bottom-sheet frame were removed once the nav slot
 * landed, since they only duplicated it. It owns only its own inputs — no props,
 * no data access — so a frame never has to thread state through it.
 */
export function ReconCalculator() {
  const [powder, setPowder] = useState("")
  const [powderUnit, setPowderUnit] = useState<MgUnit>("mg")
  const [bac, setBac] = useState("")
  const [dose, setDose] = useState("")
  const [doseUnit, setDoseUnit] = useState<MgUnit>("mg")

  const result = useMemo(() => {
    const powderMg = toMg(parseFloat(powder), powderUnit)
    const bacMl = parseFloat(bac)
    const doseMg = toMg(parseFloat(dose), doseUnit)
    if (!Number.isFinite(powderMg) || powderMg <= 0) return null
    if (!Number.isFinite(bacMl) || bacMl <= 0) return null
    // concentration: round(powder / bac, 3) — matches the view's reconstituted case.
    const concentration = Math.round((powderMg / bacMl) * 1000) / 1000
    let mlPerDose: number | null = null
    let unitsPerDose: number | null = null
    if (Number.isFinite(doseMg) && doseMg > 0 && concentration > 0) {
      mlPerDose = Math.round((doseMg / concentration) * 1000) / 1000
      unitsPerDose = Math.round(mlPerDose * 100 * 10) / 10
    }
    return {
      concentration,
      mlPerDose,
      unitsPerDose,
      // Echoed back (in mg) for the step-by-step working below.
      powderMg,
      doseMg: Number.isFinite(doseMg) && doseMg > 0 ? doseMg : null,
    }
  }, [powder, powderUnit, bac, dose, doseUnit])

  return (
    <div className="space-y-5">
      {/* Inputs */}
      <NumberField
        label="Powder in vial"
        value={powder}
        onChange={(v) => setPowder(sanitize(v))}
        placeholder="e.g. 5"
        unit={powderUnit}
        onUnitChange={setPowderUnit}
      />
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
          BAC water added
        </span>
        <div className="relative">
          <Input
            inputMode="decimal"
            value={bac}
            onChange={(e) => setBac(sanitize(e.target.value))}
            placeholder="e.g. 2"
            aria-label="BAC water in millilitres"
            className="h-12 rounded-xl border-border-default bg-bg-input pr-12 font-mono text-base dark:bg-bg-input"
          />
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-text-muted">
            mL
          </span>
        </div>
      </label>
      <NumberField
        label="Target dose"
        value={dose}
        onChange={(v) => setDose(sanitize(v))}
        placeholder="e.g. 250"
        unit={doseUnit}
        onUnitChange={setDoseUnit}
      />

      {/* Results */}
      <div className="rounded-2xl bg-bg-surface-raised p-4">
        <p className={CARD_EYEBROW}>Result</p>
        {result ? (
          <div className="mt-3 space-y-3">
            <ResultRow
              label="Concentration"
              value={`${trim(result.concentration, 3)} mg/mL`}
              emphasis
            />
            <ResultRow
              label="mL per dose"
              value={
                result.mlPerDose != null
                  ? `${trim(result.mlPerDose, 3)} mL`
                  : "—"
              }
              emphasis
            />
            <ResultRow
              label="Insulin units (U-100)"
              value={
                result.unitsPerDose != null
                  ? `${trim(result.unitsPerDose, 1)} U`
                  : "—"
              }
            />
          </div>
        ) : (
          <p className="mt-2 text-sm text-text-muted">
            Enter the powder amount and BAC water to see the concentration.
          </p>
        )}
      </div>

      {/* The working behind the figures — shown step by step so it can be
          re-checked by hand (Spec 12, Step 4). Display only; same maths. */}
      {result ? (
        <div className="rounded-2xl bg-bg-surface p-4">
          <p className={CARD_EYEBROW}>Working</p>
          <div className="mt-2 space-y-1.5 font-mono text-xs leading-relaxed text-text-muted">
            <p>concentration = powder ÷ BAC water</p>
            <p>
              = {trim(result.powderMg, 3)} mg ÷ {bac || "—"} mL ={" "}
              <span className="text-foreground">
                {trim(result.concentration, 3)} mg/mL
              </span>
            </p>
            {result.doseMg != null && result.mlPerDose != null ? (
              <>
                <p className="pt-1.5">volume to draw = dose ÷ concentration</p>
                <p>
                  = {trim(result.doseMg, 3)} mg ÷{" "}
                  {trim(result.concentration, 3)} mg/mL ={" "}
                  <span className="text-foreground">
                    {trim(result.mlPerDose, 3)} mL
                  </span>
                </p>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Always-on disclaimer (information, not advice). */}
      <div className="flex gap-3 rounded-xl border border-accent-amber/40 bg-accent-amber/10 p-3">
        <Warning
          className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber"
          aria-hidden
        />
        <p className="text-sm leading-relaxed text-accent-amber">{DISCLAIMER}</p>
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  unit,
  onUnitChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  unit: MgUnit
  onUnitChange: (u: MgUnit) => void
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <div className="flex gap-2">
        <Input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={`${label} amount`}
          className="h-12 min-w-0 flex-1 rounded-xl border-border-default bg-bg-input font-mono text-base dark:bg-bg-input"
        />
        <div className="inline-flex shrink-0 rounded-xl border border-border-default bg-bg-input p-0.5 text-xs">
          {(["mg", "mcg"] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => onUnitChange(u)}
              aria-pressed={unit === u}
              className={cn(
                "rounded-lg px-3 font-medium transition-colors",
                unit === u
                  ? "bg-bg-surface-raised text-foreground"
                  : "text-text-muted",
              )}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
    </label>
  )
}

function ResultRow({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-text-muted">{label}</span>
      <span
        className={cn(
          "font-mono tabular-nums",
          emphasis
            ? "text-lg text-foreground"
            : "text-sm text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  )
}
