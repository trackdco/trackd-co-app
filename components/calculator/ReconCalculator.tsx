"use client"

import { useId, useMemo, useState, useSyncExternalStore } from "react"
import { CaretDown, Warning } from "@/components/icons"

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
  trim,
  type MgUnit,
} from "@/lib/calculator/recon"
import {
  DEFAULT_SYRINGE_SIZE,
  MIN_READABLE_UNITS,
  fillFraction,
  misuseKind,
  syringeSize,
  type SyringeSizeId,
} from "@/lib/calculator/syringe"
import {
  loadSyringeChoice,
  recordSyringeChoice,
  subscribeSyringeChoice,
} from "@/lib/calculator/syringeChoice"

import { CalculatorInputs } from "./CalculatorInputs"
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

/**
 * The dose field starts in mcg while the powder field starts in mg. That looks
 * inconsistent and is not: vials are LABELLED in mg (5 mg, 10 mg, 2 mg
 * semaglutide) and doses are WRITTEN in mcg (250 mcg, 500 mcg), so each field
 * opens on the unit its own figure normally arrives in.
 */
const DEFAULT_DOSE_UNIT: MgUnit = "mcg"

/**
 * Reconstitution calculator (spec 07).
 *
 * The arithmetic did not change in the rebuild and must not: it lives in
 * `lib/calculator/recon` with its outputs pinned to the pre-rebuild figures by
 * `recon.test.ts`. This file is presentation and state only.
 *
 * The page reads top to bottom as one answer: which syringe, then the number,
 * then the syringe showing you what that number looks like, then the three
 * figures behind it, then the inputs, then the working. The syringe is the
 * point. A number in a text field is easy to misread; a barrel filled to a fifth
 * is not.
 *
 * The barrel size is PICKED ONCE AND STICKS (Adrian, 2026-07-30): it opens on
 * `DEFAULT_SYRINGE_SIZE`, and whatever the user picks is theirs until they pick
 * again, across visits. Reset leaves it alone, because it is a standing fact
 * about their equipment rather than part of a calculation. An earlier build made
 * it a blocking gate; that was dropped once it was clear the UNITS figure is the
 * same on every barrel, so the size only moves the fill proportion in the
 * picture and the over-capacity threshold.
 *
 * The chosen size lives in component state AND in localStorage, and the state is
 * what renders. Reading back from storage to learn what was just tapped would
 * mean a full quota (this app fills localStorage with the device stack and dose
 * log) leaves the pills doing nothing at all.
 *
 * Otherwise stateless (spec 07, Out of Scope): no presets, no saved
 * calculations, no history, and nothing here reads or writes a compound.
 */
export function ReconCalculator() {
  const [powder, setPowder] = useState("")
  const [powderUnit, setPowderUnit] = useState<MgUnit>("mg")
  const [bac, setBac] = useState("")
  const [dose, setDose] = useState("")
  const [doseUnit, setDoseUnit] = useState<MgUnit>(DEFAULT_DOSE_UNIT)
  const [workingOpen, setWorkingOpen] = useState(false)
  const workingId = useId()

  // Read the remembered choice through the store rather than an effect: the
  // server has no localStorage, so the server snapshot is "nothing remembered"
  // and the hydration render agrees with it, with no set-state-in-effect.
  const remembered = useSyncExternalStore(
    subscribeSyringeChoice,
    loadSyringeChoice,
    () => null,
  )
  // This session's explicit pick wins over both, so the pills respond instantly
  // even if the write that should have remembered it was refused.
  const [picked, setPicked] = useState<SyringeSizeId | null>(null)
  const sizeId = picked ?? remembered ?? DEFAULT_SYRINGE_SIZE
  const size = syringeSize(sizeId)

  function chooseSize(id: SyringeSizeId) {
    setPicked(id)
    recordSyringeChoice(id)
  }

  const computed = useMemo(
    () => computeRecon({ powder, powderUnit, bac, dose, doseUnit }),
    [powder, powderUnit, bac, dose, doseUnit],
  )

  const result = computed
  const units = result?.unitsPerDose ?? null
  const fill = fillFraction(units, size)
  const misuse = misuseKind(units, size)

  const resettable =
    powder !== "" ||
    bac !== "" ||
    dose !== "" ||
    powderUnit !== "mg" ||
    doseUnit !== DEFAULT_DOSE_UNIT ||
    workingOpen

  function reset() {
    setPowder("")
    setPowderUnit("mg")
    setBac("")
    setDose("")
    setDoseUnit(DEFAULT_DOSE_UNIT)
    // Closing it here is what animates the panel shut (spec 07, step 8).
    setWorkingOpen(false)
    // The syringe is deliberately NOT cleared: it is a standing preference, not
    // an input to this calculation, and it sticks until the user picks another.
  }

  return (
    <div className="space-y-4">
      <FirstRunDisclaimer />

      {/* ---- The reading. Bare, outside any card, so the syringe is the screen
              rather than a thing on the screen. Not sticky: it scrolls away with
              the page (Adrian, 2026-07-30). ---- */}
      <section>
        <div className="flex items-baseline justify-between gap-3">
          {units != null ? (
            <p className="flex items-baseline gap-2">
              <span className={METRIC_VALUE}>{trim(units, 1)}</span>
              <span className={UNIT_SUFFIX}>units</span>
            </p>
          ) : (
            <p className="text-sm text-text-muted">
              {result == null ? "Enter powder and BAC water" : "Add a dose"}
            </p>
          )}
          <span className={DATA_MONO}>{size.label}</span>
        </div>
        <div className="-mx-2 mt-2">
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
      </section>

      {/* Sits directly under the barrel it is about, and only when it fires. */}
      {misuse ? (
        <div role="alert" className="flex gap-3 rounded-xl bg-accent-amber/15 p-3">
          <Warning
            className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber"
            aria-hidden
          />
          <p className="text-sm leading-relaxed text-accent-amber">
            {misuse === "under"
              ? `That is under ${MIN_READABLE_UNITS} units, too little to read off a syringe accurately. Check the figures you entered.`
              : `${units != null ? `${trim(units, 1)} units` : "That"} will not fit a ${size.label} syringe. Check the figures you entered${sizeId === "1" ? "" : ", or pick a larger syringe"}.`}
          </p>
        </div>
      ) : null}

      {/* ---- The three figures behind it ---- */}
      <section className="grid grid-cols-3 divide-x divide-border-default rounded-2xl bg-bg-surface py-3">
        <Figure
          label="Concentration"
          value={result ? trim(result.concentration, 3) : NO_VALUE}
          unit="mg/mL"
        />
        <Figure
          label="Per dose"
          value={
            result?.mlPerDose != null ? trim(result.mlPerDose, 3) : NO_VALUE
          }
          unit="mL"
        />
        <Figure
          label="Insulin"
          value={units != null ? trim(units, 1) : NO_VALUE}
          unit="U"
          accent
        />
      </section>

      {/* ---- Inputs ---- */}
      <CalculatorInputs
        sizeId={sizeId}
        onSizeChange={chooseSize}
        powder={powder}
        onPowderChange={(v) => setPowder(sanitizeAmount(v))}
        powderUnit={powderUnit}
        onPowderUnitChange={setPowderUnit}
        bac={bac}
        onBacChange={(v) => setBac(sanitizeAmount(v))}
        dose={dose}
        onDoseChange={(v) => setDose(sanitizeAmount(v))}
        doseUnit={doseUnit}
        onDoseUnitChange={setDoseUnit}
        onReset={reset}
        resettable={resettable}
      />

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
                      <p className="pt-1.5">
                        insulin units = volume × 100 (U-100 barrel)
                      </p>
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
 * One of the three figures. Insulin units carries the amber accent because it is
 * the number the user acts on (spec 07); the other two stay white, so the row
 * keeps a single amber beat.
 */
function Figure({
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
    <div className="px-2 text-center">
      <p className={COLUMN_EYEBROW}>{label}</p>
      <p className="mt-1 font-mono text-base tabular-nums [overflow-wrap:anywhere]">
        <span className={accent ? "text-accent-amber" : "text-foreground"}>
          {value}
        </span>{" "}
        <span className="text-[11px] text-text-muted">{unit}</span>
      </p>
    </div>
  )
}
