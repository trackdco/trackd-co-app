"use client"

import { useId, useMemo, useState } from "react"
import { CaretDown, Warning } from "@/components/icons"

import { cn } from "@/lib/utils"
import {
  CARD_EYEBROW,
  COLUMN_EYEBROW,
  COLUMN_VALUE,
  DATA_MONO,
  METRIC_VALUE,
  UNIT_SUFFIX,
} from "@/lib/ui-presets"
import { Input } from "@/components/ui/input"
import {
  computeRecon,
  sanitizeAmount,
  trim,
  type MgUnit,
} from "@/lib/calculator/recon"
import {
  DEFAULT_SYRINGE_SIZE,
  MIN_READABLE_UNITS,
  SYRINGE_SIZES,
  fillFraction,
  misuseKind,
  syringeSize,
  type SyringeSizeId,
} from "@/lib/calculator/syringe"

import { FirstRunDisclaimer } from "./FirstRunDisclaimer"
import { SyringeGraphic } from "./SyringeGraphic"

/**
 * PERMANENT disclaimer. Legal copy: do not reword without asking Adrian first
 * (spec 07, Out of Scope). Shown on every visit, and NOT replaced by the
 * first-run modal.
 */
const DISCLAIMER =
  "This is a calculator, not a dosing instruction. It does only arithmetic on " +
  "the numbers you enter and may be wrong. Re-check every figure and confirm it " +
  "against your physical product before drawing or injecting anything. Do not " +
  "rely on this output alone."

/** The app-wide "no value" placeholder (Profile, Weight, the day sheet). */
const NO_VALUE = "—"

/** Field label, matching `AddStockSheet`'s so the two input surfaces read alike. */
const FIELD_LABEL =
  "block text-xs font-medium uppercase tracking-[0.14em] text-text-muted"

/**
 * Reconstitution calculator, rebuilt for spec 07.
 *
 * The arithmetic did not change and must not: it lives in `lib/calculator/recon`
 * with its outputs pinned to the pre-rebuild figures by `recon.test.ts`. This
 * file is presentation only.
 *
 * The page reads top to bottom as one answer: the number, the syringe that shows
 * you what the number looks like, the three figures behind it, then the inputs
 * that produced them and the working if you want it. The syringe is the point.
 * A number in a text field is easy to misread; a barrel filled to a fifth is not.
 *
 * Stateless by design (spec 07, Out of Scope): no presets, no saved calculations,
 * no history, and nothing here reads or writes a compound. It owns only its own
 * inputs, so a frame never has to thread state through it. The one thing that
 * persists is the first-run modal's per-device dismissal.
 */
export function ReconCalculator() {
  const [powder, setPowder] = useState("")
  const [powderUnit, setPowderUnit] = useState<MgUnit>("mg")
  const [bac, setBac] = useState("")
  const [dose, setDose] = useState("")
  const [doseUnit, setDoseUnit] = useState<MgUnit>("mg")
  const [sizeId, setSizeId] = useState<SyringeSizeId>(DEFAULT_SYRINGE_SIZE)
  const [workingOpen, setWorkingOpen] = useState(false)
  // The panel's id is generated, not a literal: nothing guarantees one
  // calculator per page, and a duplicated `aria-controls` target points half the
  // toggles at the wrong panel.
  const workingId = useId()

  const result = useMemo(
    () => computeRecon({ powder, powderUnit, bac, dose, doseUnit }),
    [powder, powderUnit, bac, dose, doseUnit],
  )

  const size = syringeSize(sizeId)
  const units = result?.unitsPerDose ?? null
  const fill = fillFraction(units, size)
  const misuse = misuseKind(units, size)

  const dirty =
    powder !== "" ||
    bac !== "" ||
    dose !== "" ||
    powderUnit !== "mg" ||
    doseUnit !== "mg" ||
    sizeId !== DEFAULT_SYRINGE_SIZE ||
    workingOpen

  function reset() {
    setPowder("")
    setPowderUnit("mg")
    setBac("")
    setDose("")
    setDoseUnit("mg")
    setSizeId(DEFAULT_SYRINGE_SIZE)
    // Closing it here is what animates the panel shut — the grid-rows
    // transition runs off this flag (spec 07, step 8).
    setWorkingOpen(false)
  }

  return (
    <div className="space-y-5">
      <FirstRunDisclaimer />

      {/* ---- The reading: figure, syringe, and any misuse warning ---- */}
      <section className="rounded-2xl bg-bg-surface p-5">
        <p className={CARD_EYEBROW}>Draw</p>

        <div className="mt-2 flex min-h-[42px] items-baseline gap-2">
          {units != null ? (
            <>
              <span className={METRIC_VALUE}>{trim(units, 1)}</span>
              <span className={UNIT_SUFFIX}>units</span>
            </>
          ) : (
            <p className="text-sm leading-relaxed text-text-muted">
              {result == null
                ? "Enter the powder and BAC water to see the concentration."
                : "Add a dose to see the units to draw."}
            </p>
          )}
        </div>

        {/* The barrel is drawn at every state, empty included: an empty syringe
            is the honest picture of "nothing entered yet", and keeping it
            mounted is what lets the fill animate in rather than appear.
            Drawn wider than the card's padding on purpose: the printed numbers
            scale with the SVG, and inside `p-5` on a 320px phone they fall to
            about 6px. The syringe has 4 units of clearance at the needle and 8
            at the thumb rest, so it still sits inside the card's edges. */}
        <div className="-mx-3 mt-4">
          <SyringeGraphic
            size={size}
            fill={fill}
            label={
              units != null
                ? `${trim(units, 1)} units drawn on a ${size.label} syringe`
                : `An empty ${size.label} syringe`
            }
          />
        </div>

        <p className={cn(DATA_MONO, "mt-2")}>
          {size.label} barrel · {size.units} units
        </p>

        {/* The warning treatment, but WITHOUT the outline the permanent
            disclaimer carries. Identical chrome would make the transient "you
            typed something wrong" read as the standing legal box the user has
            already learned to skip, and a borderless tint is what in-card
            structure is supposed to look like anyway (ui-context → cards are
            borderless). `role="alert"` because it appears in response to typing
            and is the only safety signal on the screen. */}
        {misuse ? (
          <div
            role="alert"
            className="mt-4 flex gap-3 rounded-xl bg-accent-amber/15 p-3"
          >
            <Warning
              className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber"
              aria-hidden
            />
            <p className="text-sm leading-relaxed text-accent-amber">
              {misuseCopy(misuse, units, size.label, sizeId)}
            </p>
          </div>
        ) : null}
      </section>

      {/* ---- The three figures behind it ---- */}
      <div className="grid grid-cols-3 items-stretch gap-2">
        <ResultCard
          label="Concentration"
          value={result ? trim(result.concentration, 3) : NO_VALUE}
          unit="mg/mL"
        />
        <ResultCard
          label="mL per dose"
          value={
            result?.mlPerDose != null ? trim(result.mlPerDose, 3) : NO_VALUE
          }
          unit="mL"
        />
        {/* "U", not "U-100": this line is the figure's unit, the way its two
            siblings read mg/mL and mL. U-100 is the barrel standard, and the
            caption under the graphic already carries it. */}
        <ResultCard
          label="Insulin units"
          value={units != null ? trim(units, 1) : NO_VALUE}
          unit="U"
          accent
        />
      </div>

      {/* ---- Inputs ---- */}
      <section className="rounded-2xl bg-bg-surface p-5">
        <p className={CARD_EYEBROW}>Inputs</p>

        <div className="mt-4 space-y-4">
          <div>
            <span className={FIELD_LABEL}>Syringe size</span>
            {/* Same segmented-pill control as the Consistency range selector,
                rather than a second way of choosing one of a few options. */}
            <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-full border border-border-default bg-bg-input p-0.5">
              {SYRINGE_SIZES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={sizeId === s.id}
                  onClick={() => setSizeId(s.id)}
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
          </div>

          <NumberField
            label="Total powder in the vial"
            value={powder}
            onChange={(v) => setPowder(sanitizeAmount(v))}
            placeholder="e.g. 5"
            unit={powderUnit}
            onUnitChange={setPowderUnit}
          />

          <label className="block">
            <span className={FIELD_LABEL}>BAC water added</span>
            <div className="relative mt-1.5">
              <Input
                inputMode="decimal"
                value={bac}
                onChange={(e) => setBac(sanitizeAmount(e.target.value))}
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
            label="Dose amount"
            value={dose}
            onChange={(v) => setDose(sanitizeAmount(v))}
            placeholder="e.g. 250"
            unit={doseUnit}
            onUnitChange={setDoseUnit}
          />
        </div>

        <button
          type="button"
          onClick={reset}
          disabled={!dirty}
          className="mt-5 w-full rounded-xl border border-border-strong py-3 text-sm font-medium text-text-muted transition-colors hover:text-text-primary disabled:pointer-events-none disabled:opacity-40"
        >
          Reset
        </button>
      </section>

      {/* ---- The working, collapsed by default ---- */}
      <section className="overflow-hidden rounded-2xl bg-bg-surface">
        <button
          type="button"
          onClick={() => setWorkingOpen((o) => !o)}
          aria-expanded={workingOpen}
          aria-controls={workingId}
          className="flex w-full items-center justify-between gap-3 p-5 text-left"
        >
          <span className={CARD_EYEBROW}>View calculations</span>
          <CaretDown
            aria-hidden
            className={cn(
              "h-4 w-4 shrink-0 text-text-subtle transition-transform duration-300 ease-out motion-reduce:transition-none",
              !workingOpen && "-rotate-90",
            )}
          />
        </button>

        {/* Kept MOUNTED so it animates both ways — the grid-rows 0fr↔1fr
            transition is the house expand idiom (week strip, stack rows). */}
        <div
          id={workingId}
          className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
          style={{ gridTemplateRows: workingOpen ? "1fr" : "0fr" }}
        >
          {/* `inert` while collapsed: `overflow-hidden` hides the working
              visually but would leave it focusable and announced. */}
          <div className="overflow-hidden" inert={!workingOpen}>
            <div className="px-5 pb-5">
              {result ? (
                <div className="space-y-1.5 font-mono text-xs leading-relaxed text-text-muted">
                  <p>concentration = powder ÷ BAC water</p>
                  <p>
                    = {trim(result.powderMg, 3)} mg ÷ {bac || NO_VALUE} mL ={" "}
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
                      <p className="pt-1.5">insulin units = volume × 100</p>
                      <p>
                        = {trim(result.mlPerDose, 3)} mL × 100 ={" "}
                        <span className="text-foreground">
                          {trim(result.unitsPerDose ?? 0, 1)} units
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

      {/* ---- Permanent disclaimer. Legal copy, unchanged. ---- */}
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

/**
 * Both conditions say the same thing: re-check the figures. Neither blocks, and
 * neither judges the dose — they judge whether the number can be drawn off the
 * barrel that is selected.
 */
function misuseCopy(
  kind: "under" | "over",
  units: number | null,
  sizeLabel: string,
  sizeId: SyringeSizeId,
): string {
  if (kind === "under") {
    return `That is under ${MIN_READABLE_UNITS} units, too little to read off a syringe accurately. Check the figures you entered.`
  }
  const drawn = units != null ? `${trim(units, 1)} units` : "That"
  // No larger barrel exists past 1 mL, so do not offer one.
  const larger = sizeId === "1" ? "" : ", or pick a larger syringe"
  return `${drawn} will not fit a ${sizeLabel} syringe. Check the figures you entered${larger}.`
}

/**
 * One of the three figures behind the result. Insulin units carries the amber
 * accent because it is the number the user acts on (spec 07); the other two stay
 * white, so the row keeps a single amber beat.
 */
function ResultCard({
  label,
  value,
  unit,
  accent,
}: {
  label: string
  value: string
  unit: string
  accent?: boolean
}) {
  return (
    // `flex-col` + `mt-auto` on the unit so the three unit lines still rail
    // together when one figure is long enough to wrap onto a second line.
    <div className="flex flex-col rounded-2xl bg-bg-surface px-2 py-3 text-center">
      <p className={COLUMN_EYEBROW}>{label}</p>
      <p
        className={cn(
          COLUMN_VALUE,
          "mt-1.5",
          accent ? "text-accent-amber" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-auto text-[11px] text-text-muted">{unit}</p>
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
      <span className={FIELD_LABEL}>{label}</span>
      <div className="mt-1.5 flex gap-2">
        <Input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          // The wrapping <label> also contains the mg/mcg buttons, so the field
          // names itself. Just the label: appending "amount" made "Dose amount"
          // announce as "Dose amount amount".
          aria-label={label}
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
