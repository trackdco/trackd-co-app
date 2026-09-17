"use client"

import { useId, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { CaretDown, Warning } from "@/components/icons"

import { cn } from "@/lib/utils"
import {
  CARD_EYEBROW,
  COLUMN_EYEBROW,
  METRIC_VALUE,
  UNIT_SUFFIX,
} from "@/lib/ui-presets"
import {
  computeRecon,
  formatConcentration,
  sanitizeAmount,
  trim,
  type MgUnit,
} from "@/lib/calculator/recon"
import { CALCULATOR_DISCLAIMER, misuseCopy } from "@/lib/calculator/copy"
import {
  DEFAULT_SYRINGE_SIZE,
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

import { NumberPad, type PadField } from "@/components/feel/NumberPad"

import { CalculatorInputs } from "./CalculatorInputs"
import { FirstRunDisclaimer } from "./FirstRunDisclaimer"
import { SyringeGraphic } from "./SyringeGraphic"

/** The app-wide "no value" placeholder (Profile, Weight, the day sheet). */
const NO_VALUE = "—"

/**
 * The two amber panels: the transient misuse warning and the standing legal
 * disclaimer. Both lost their border (Adrian, 2026-07-30 — it was the only
 * bordered surface in an app whose cards separate by surface alone), and a
 * tinted panel with no outline needs more room than a boxed one or the copy
 * reads as loose text on a stain rather than as a panel.
 *
 * `p-4` rather than `p-3`; the icon optically centred on the first line's cap
 * height rather than nudged with `mt-0.5`; and `text-pretty` so a four-line
 * paragraph does not end on a one-word line.
 */
const AMBER_PANEL = "flex items-start gap-3 rounded-2xl bg-accent-amber/15 p-4"
const AMBER_PANEL_ICON = "mt-[3px] h-4 w-4 shrink-0 text-accent-amber"
const AMBER_PANEL_TEXT =
  "text-sm leading-relaxed text-pretty text-accent-amber"

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
  // and the hydration render agrees with it, with no set-state-in-effect and no
  // hydration warning. It does NOT avoid a flash: a device that remembers a
  // non-default barrel paints the DEFAULT one for roughly 250ms before the
  // store is read (measured in dev). Nothing can be misread in that window (the fill is 0 until
  // figures are entered), and the alternative is not rendering the screen at
  // all until the client catches up.
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
  // Hold the last warning text through the collapse. The panel is always
  // mounted so it can animate, but the copy is derived — so on the frame the
  // user CORRECTS the figure, the text emptied while the panel was still 51px
  // tall, leaving a wordless amber stripe for about 183ms. That fires on the
  // most common transition on this screen: fixing the thing the warning asked
  // you to fix. Adjust-state-during-render, not an effect, which would paint
  // the empty frame first.
  const nextCopy = misuse ? misuseCopy(misuse, units, size.label, sizeId) : null
  const [warning, setWarning] = useState<string | null>(nextCopy)
  if (nextCopy && nextCopy !== warning) setWarning(nextCopy)

  const resettable =
    powder !== "" ||
    bac !== "" ||
    dose !== "" ||
    powderUnit !== "mg" ||
    doseUnit !== DEFAULT_DOSE_UNIT ||
    workingOpen

  /**
   * THE COMPACT PAD (feel pass §3). The three fields ride in the pad as chips,
   * the active field's mg/mcg toggle sits in its bottom row, and there is no
   * scrim: the point is to watch the syringe fill as you type.
   */
  const FIELD_ORDER = ["powder", "bac", "dose"] as const
  const [padIndex, setPadIndex] = useState<number | null>(null)
  const drawRef = useRef<HTMLElement>(null)
  const fieldRefs = {
    powder: useRef<HTMLButtonElement>(null),
    bac: useRef<HTMLButtonElement>(null),
    dose: useRef<HTMLButtonElement>(null),
  }
  const padFields: PadField[] = [
    {
      id: "powder",
      label: "Powder",
      short: "Powder",
      unit: powderUnit,
      value: powder,
      onChange: (v) => setPowder(sanitizeAmount(v)),
      sanitize: sanitizeAmount,
      unitOptions: {
        options: ["mg", "mcg"],
        value: powderUnit,
        onChange: (u) => setPowderUnit(u as MgUnit),
      },
    },
    {
      id: "bac",
      label: "BAC water",
      short: "Water",
      unit: "mL",
      value: bac,
      onChange: (v) => setBac(sanitizeAmount(v)),
      sanitize: sanitizeAmount,
    },
    {
      id: "dose",
      label: "Dose",
      short: "Dose",
      unit: doseUnit,
      value: dose,
      onChange: (v) => setDose(sanitizeAmount(v)),
      sanitize: sanitizeAmount,
      unitOptions: {
        options: ["mg", "mcg"],
        value: doseUnit,
        onChange: (u) => setDoseUnit(u as MgUnit),
      },
    },
  ]
  const activeField = padIndex === null ? null : FIELD_ORDER[padIndex]
  const padOpen = padIndex !== null
  // The field the pad was last on, for focus to go back to once it has closed
  // (by then `activeField` is already null).
  const lastFieldRef = useRef<(typeof FIELD_ORDER)[number] | null>(null)
  const setPadField = (index: number | null) => {
    if (index !== null) lastFieldRef.current = FIELD_ORDER[index]
    setPadIndex(index)
  }

  function openPad(field: (typeof FIELD_ORDER)[number]) {
    setPadField(FIELD_ORDER.indexOf(field))
    if (padOpen) return
    // Bring the Draw section to the top, under the compact title bar, where
    // it pins: the figure and the syringe stay in view with the results
    // card under them while the pad covers the inputs.
    const draw = drawRef.current
    if (!draw) return
    const bar = document.querySelector<HTMLElement>("[data-page-scroll-bar]")
    let top = bar ? bar.getBoundingClientRect().height : 0
    // On a short phone the pinned section tucks its "Draw" heading under the
    // bar (see `.calc-draw-pinned`), so it scrolls that much further.
    if (window.matchMedia("(max-height: 650px)").matches) {
      const h2 = draw.querySelector("h2")
      if (h2) top -= h2.offsetHeight + parseFloat(getComputedStyle(h2).marginBottom || "0")
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    window.scrollTo({
      top: Math.max(0, draw.getBoundingClientRect().top + window.scrollY - top),
      behavior: reduce ? "auto" : "smooth",
    })
  }

  function reset() {
    setPadField(null)
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
    <div data-calc-grid className="space-y-5">
      <FirstRunDisclaimer />

      {/* ---- The reading. Bare, outside any card, so the syringe is the screen
              rather than a thing on the screen.

              PINNED ONLY WHILE THE PAD IS OPEN (feel pass §3, approved round
              4). It was made sticky-while-typing once before (2026-07-31) and
              reversed the same day, because iOS resized the visual viewport for
              its keyboard and the pinned section covered the field being typed
              in. The Trackd pad has no system keyboard and never resizes
              anything: it covers the inputs, and the pinned draw figure and
              syringe are exactly what you want to watch while it does. Closed,
              the section scrolls with the page as before.

              Section heading ABOVE the content at `px-1`, which is Protocol's
              idiom (`CompoundsRow`, `ScheduleGrid`) and what makes a standalone
              tab screen read as one page rather than a stack of boxes. ---- */}
      <section
        ref={drawRef}
        data-area="calc-draw"
        className={cn(
          "animate-home-up space-y-3 pb-3",
          padOpen && "calc-draw-pinned",
        )}
        style={{ animationDelay: "0ms" }}
      >
        <h2 className={cn(CARD_EYEBROW, "px-1")}>Draw</h2>
        {/* Height reserved so the syringe does not jump when the figure
            arrives. Nothing stands in for the figure when there is none:
            the empty barrel below already says "nothing entered yet", and the
            selected size is printed on that barrel's own scale (Adrian,
            2026-07-30). */}
        <div className="flex h-[34px] items-baseline gap-2">
          {units != null ? (
            <>
              <span className={METRIC_VALUE}>{trim(units, 1)}</span>
              <span className={UNIT_SUFFIX}>units</span>
            </>
          ) : null}
          {/* While the pad is open the full warning below is folded away, so
              the results card stays in view above the pad; this line carries
              it instead. The full panel (a status region) is what is
              announced, so this copy is hidden from assistive tech. */}
          {padOpen && misuse ? (
            <span
              aria-hidden
              className="ml-auto flex min-w-0 items-center gap-1.5 self-center text-xs text-accent-amber"
            >
              <Warning className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {misuse === "under"
                  ? `Under ${MIN_READABLE_UNITS} units, too little to read`
                  : `Will not fit a ${size.label} syringe`}
              </span>
            </span>
          ) : null}
        </div>
        <div className="-mx-2">
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
      {/* Kept MOUNTED and expanded with the house grid-rows idiom rather than
          inserted: appearing outright shoved the input sheet down 112px between
          two keystrokes, which on a phone can drop the field you are typing in
          behind the keyboard. `role="status"` not `alert`: the text carries the
          live figure and changes on every digit, and an assertive region
          re-announces the whole sentence each time. */}
      {/* Folded, it takes NO room: `-mt-5` cancels the gap above it and its
          own gap below stands, so Draw and the figures sit one gap apart
          rather than two. Open, the gap comes back inside (`calc-warning-gap`).
          That spare 20px is what keeps the figures above the pad on an SE. */}
      <div
        data-area="calc-warning"
        className="animate-home-up -mt-5 grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: misuse && !padOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="calc-warning-gap">
            <div role="status" className={AMBER_PANEL}>
              <Warning className={AMBER_PANEL_ICON} aria-hidden />
              <p className={AMBER_PANEL_TEXT}>{warning}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ---- The three figures behind it. No heading of its own: the columns
              are labelled, and it belongs to "Draw" above. ---- */}
      <section
        data-area="calc-figures"
        className="animate-home-up grid grid-cols-3 divide-x divide-border-default rounded-2xl bg-bg-surface py-3"
        style={{ animationDelay: "55ms" }}
      >
        <Figure
          label="Concentration"
          value={result ? formatConcentration(result.concentration) : NO_VALUE}
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
      <div data-area="calc-inputs" className="animate-home-up" style={{ animationDelay: "110ms" }}>
        <CalculatorInputs
          sizeId={sizeId}
          onSizeChange={chooseSize}
          powder={powder}
          powderUnit={powderUnit}
          onPowderUnitChange={setPowderUnit}
          bac={bac}
          dose={dose}
          doseUnit={doseUnit}
          onDoseUnitChange={setDoseUnit}
          onReset={reset}
          resettable={resettable}
          activeField={activeField}
          onOpenField={openPad}
          fieldRefs={fieldRefs}
        />
      </div>

      <NumberPad
        active={padIndex}
        fields={padFields}
        onActiveChange={setPadField}
        onClose={() => setPadField(null)}
        variant="compact"
        scrim={false}
        returnFocus={() => (lastFieldRef.current ? fieldRefs[lastFieldRef.current].current : null)}
        label="Calculator inputs"
      />

      {/* ---- The working, collapsed by default ---- */}
      <section
        data-area="calc-working"
        className="animate-home-up overflow-hidden rounded-2xl bg-bg-surface"
        style={{ animationDelay: "165ms" }}
      >
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
                      {formatConcentration(result.concentration)} mg/mL
                    </span>
                  </p>
                  {result.doseMg != null && result.mlPerDose != null ? (
                    <>
                      <p className="pt-1.5">volume to draw = dose ÷ concentration</p>
                      <p>
                        = {trim(result.doseMg, 3)} mg ÷{" "}
                        {formatConcentration(result.concentration)} mg/mL ={" "}
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

      {/* ---- Permanent disclaimer. Legal copy, unchanged; it now lives in
              `lib/calculator/copy.ts` so the public calculator quotes the same
              words. ---- */}
      <div
        data-area="calc-legal"
        className={cn("animate-home-up", AMBER_PANEL)}
        style={{ animationDelay: "220ms" }}
      >
        <Warning className={AMBER_PANEL_ICON} aria-hidden />
        <p className={AMBER_PANEL_TEXT}>{CALCULATOR_DISCLAIMER}</p>
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
      {/* One notch smaller below 360px: "CONCENTRATION" is the longest label
          in the app and still overruns a third of a 320px phone at 9px. */}
      <p className={cn(COLUMN_EYEBROW, "text-[8px] min-[360px]:text-[9px]")}>
        {label}
      </p>
      <p className="mt-1 font-mono text-base tabular-nums [overflow-wrap:anywhere]">
        <span className={accent ? "text-accent-amber" : "text-foreground"}>
          {value}
        </span>{" "}
        <span className="text-[11px] text-text-muted">{unit}</span>
      </p>
    </div>
  )
}
