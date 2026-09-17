"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import { CalculatorInputs } from "@/components/calculator/CalculatorInputs";
import { SyringeGraphic } from "@/components/calculator/SyringeGraphic";
import { Warning } from "@/components/icons";
import { CALCULATOR_DISCLAIMER, misuseCopy } from "@/lib/calculator/copy";
import {
  computeRecon,
  formatConcentration,
  sanitizeAmount,
  trim,
  type MgUnit,
} from "@/lib/calculator/recon";
import {
  DEFAULT_SYRINGE_SIZE,
  fillFraction,
  misuseKind,
  syringeSize,
  type SyringeSizeId,
} from "@/lib/calculator/syringe";
import {
  loadSyringeChoice,
  recordSyringeChoice,
  subscribeSyringeChoice,
} from "@/lib/calculator/syringeChoice";
import { CARD_EYEBROW } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

const NO_VALUE = "—";

/**
 * THE FREE RECONSTITUTION CALCULATOR, FOR PEOPLE WITHOUT AN ACCOUNT
 * (Adrian, 2026-09-17).
 *
 * The same calculator as the app's, laid out for a public page: he wants to
 * link someone on Reddit who is stuck on the maths straight to a tool, without
 * sending them into the app.
 *
 * ## What is shared with the app, and why that matters
 *
 * Everything that can be wrong is shared: the arithmetic (`lib/calculator/recon`,
 * pinned by `recon.test.ts`), the barrel scale and misuse thresholds
 * (`lib/calculator/syringe`), the syringe drawing (`SyringeGraphic`), the input
 * sheet with its unit pills and live mg/mcg conversion (`CalculatorInputs`),
 * the remembered barrel size, and the legal disclaimer and warning copy
 * (`lib/calculator/copy`). This file is layout only, so the two calculators
 * cannot drift into giving different answers.
 *
 * ## What is different
 *
 * - **Laptop:** inputs on the left, the answer on the right, side by side.
 * - **The answer is the display layer:** a large mono figure over a large
 *   syringe.
 * - **The working is always shown**, not tucked behind a toggle. On a public
 *   page the working is the reassurance.
 * - **No first-run modal.** A stranger arriving from a link is met with the
 *   tool, and the permanent disclaimer stands on the page instead: under the
 *   answer on a laptop, after the working on a phone.
 *   ⚠️ That is a deliberate difference from the app; Adrian to confirm.
 *
 * Stateless beyond the barrel size, exactly like the app: nothing typed here is
 * stored or sent anywhere.
 */
export function PublicCalculator() {
  const [powder, setPowder] = useState("");
  const [powderUnit, setPowderUnit] = useState<MgUnit>("mg");
  const [bac, setBac] = useState("");
  const [dose, setDose] = useState("");
  const [doseUnit, setDoseUnit] = useState<MgUnit>("mcg");

  const remembered = useSyncExternalStore(subscribeSyringeChoice, loadSyringeChoice, () => null);
  const [picked, setPicked] = useState<SyringeSizeId | null>(null);
  const sizeId = picked ?? remembered ?? DEFAULT_SYRINGE_SIZE;
  const size = syringeSize(sizeId);

  const result = useMemo(
    () => computeRecon({ powder, powderUnit, bac, dose, doseUnit }),
    [powder, powderUnit, bac, dose, doseUnit],
  );
  const units = result?.unitsPerDose ?? null;
  const fill = fillFraction(units, size);
  const misuse = misuseKind(units, size);

  // Hold the last warning through the collapse, as the app does, so the panel
  // never shrinks as an empty amber stripe.
  const nextCopy = misuse ? misuseCopy(misuse, units, size.label, sizeId) : null;
  const [warning, setWarning] = useState<string | null>(nextCopy);
  if (nextCopy && nextCopy !== warning) setWarning(nextCopy);

  const resettable =
    powder !== "" || bac !== "" || dose !== "" || powderUnit !== "mg" || doseUnit !== "mcg";

  const reset = () => {
    setPowder("");
    setPowderUnit("mg");
    setBac("");
    setDose("");
    setDoseUnit("mcg");
  };

  return (
    // Phone: answer, inputs and working, then the disclaimer. Laptop: inputs
    // and working on the left; the answer with the disclaimer under it on the
    // right. Placed on the grid rather than reordered, so the reading order
    // on a phone is the visual order.
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-6 lg:gap-y-4">
      <section
        aria-labelledby="calc-draw"
        className="lp-panel rounded-[2rem] p-6 md:p-8 lg:col-start-2 lg:row-start-1"
      >
        <h2 id="calc-draw" className={CARD_EYEBROW}>
          Draw
        </h2>
        <p className="mt-3 flex min-h-[4.5rem] items-baseline gap-3 md:min-h-[5.5rem]" aria-live="polite">
          {units != null ? (
            <>
              <span className="font-mono text-[3.75rem] font-light leading-none tracking-[-0.04em] tabular-nums text-foreground md:text-[4.75rem]">
                {trim(units, 1)}
              </span>
              <span className="text-base text-text-secondary">units on a {size.label} syringe</span>
            </>
          ) : (
            <span className="self-center text-sm text-text-secondary">
              Enter the powder, the water and your dose.
            </span>
          )}
        </p>

        <div className="-mx-2 mt-4 md:mx-0">
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

        <div
          className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
          style={{ gridTemplateRows: misuse ? "1fr" : "0fr" }}
        >
          <div className="min-h-0 overflow-hidden">
            <div role="status" className="mt-5 flex items-start gap-3 rounded-2xl bg-accent-amber/15 p-4">
              <Warning className="mt-[3px] h-4 w-4 shrink-0 text-accent-amber" aria-hidden />
              <p className="text-pretty text-sm leading-relaxed text-accent-amber">{warning}</p>
            </div>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-3 divide-x-[0.5px] divide-border-default rounded-2xl bg-bg-base/60 py-4">
          <Figure label="Concentration" value={result ? formatConcentration(result.concentration) : NO_VALUE} unit="mg/mL" />
          <Figure label="Per dose" value={result?.mlPerDose != null ? trim(result.mlPerDose, 3) : NO_VALUE} unit="mL" />
          <Figure label="Insulin" value={units != null ? trim(units, 1) : NO_VALUE} unit="U" accent />
        </dl>
      </section>

      <div className="space-y-4 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:space-y-6">
        <CalculatorInputs
          sizeId={sizeId}
          onSizeChange={(id) => {
            setPicked(id);
            recordSyringeChoice(id);
          }}
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

        <section aria-labelledby="calc-working" className="lp-panel rounded-[2rem] p-6">
          <h2 id="calc-working" className={CARD_EYEBROW}>
            The working
          </h2>
          <div className="mt-4 space-y-3 font-mono text-[13px] leading-relaxed text-text-secondary">
            <Step
              rule="concentration = powder ÷ water"
              line={
                result
                  ? `${trim(result.powderMg, 3)} mg ÷ ${bac} mL = `
                  : `${NO_VALUE} mg ÷ ${NO_VALUE} mL = `
              }
              answer={result ? `${formatConcentration(result.concentration)} mg/mL` : NO_VALUE}
            />
            <Step
              rule="volume = dose ÷ concentration"
              line={
                result?.doseMg != null && result.mlPerDose != null
                  ? `${trim(result.doseMg, 3)} mg ÷ ${formatConcentration(result.concentration)} mg/mL = `
                  : `${NO_VALUE} mg ÷ ${NO_VALUE} mg/mL = `
              }
              answer={result?.mlPerDose != null ? `${trim(result.mlPerDose, 3)} mL` : NO_VALUE}
            />
            <Step
              rule="units = volume × 100 (U-100 syringe)"
              line={
                result?.mlPerDose != null
                  ? `${trim(result.mlPerDose, 3)} mL × 100 = `
                  : `${NO_VALUE} mL × 100 = `
              }
              answer={units != null ? `${trim(units, 1)} units` : NO_VALUE}
            />
          </div>
        </section>
      </div>

      {/* The standing disclaimer. Legal copy, unchanged. */}
      <div className="flex items-start gap-3 self-start rounded-2xl bg-accent-amber/15 p-5 lg:col-start-2 lg:row-start-2">
        <Warning className="mt-[3px] h-4 w-4 shrink-0 text-accent-amber" aria-hidden />
        <p className="text-pretty text-sm leading-relaxed text-accent-amber">{CALCULATOR_DISCLAIMER}</p>
      </div>
    </div>
  );
}

function Step({ rule, line, answer }: { rule: string; line: string; answer: string }) {
  return (
    <div>
      <p className="text-text-secondary">{rule}</p>
      <p>
        {line}
        <span className="text-foreground">{answer}</span>
      </p>
    </div>
  );
}

function Figure({ label, value, unit, accent }: { label: string; value: string; unit: string; accent?: boolean }) {
  return (
    <div className="px-2 text-center">
      <dt className="text-[9px] uppercase tracking-[0.12em] text-text-secondary min-[400px]:text-[10px]">{label}</dt>
      <dd className="mt-1.5 font-mono text-lg tabular-nums [overflow-wrap:anywhere] md:text-xl">
        <span className={cn(accent ? "text-accent-amber" : "text-foreground")}>{value}</span>{" "}
        <span className="text-[11px] text-text-secondary">{unit}</span>
      </dd>
    </div>
  );
}
