"use client"

import { SyringeGraphic } from "@/components/calculator/SyringeGraphic"
import { cn } from "@/lib/utils"
import { DATA_MONO, METRIC_VALUE, UNIT_SUFFIX } from "@/lib/ui-presets"

import {
  BarrelCaption,
  FiguresStrip,
  InputCard,
  MisuseNotice,
  PermanentDisclaimer,
  WorkingPanel,
  trim,
  useCalcState,
  type CalcState,
} from "./shared"

/**
 * DEV-ONLY layout alternatives for spec 07. See `shared.tsx` for why these exist.
 * Both variants below run the same maths and the same barrel as the shipped
 * screen; only the layout differs.
 */

/** The reading: the figure and the syringe, sized for whatever frame holds it. */
function Reading({ s, compact }: { s: CalcState; compact?: boolean }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        {s.units != null ? (
          <p className="flex items-baseline gap-2">
            <span className={METRIC_VALUE}>{trim(s.units, 1)}</span>
            <span className={UNIT_SUFFIX}>units</span>
          </p>
        ) : (
          <p className="text-sm text-text-muted">
            {s.result == null ? "Enter powder and BAC water" : "Add a dose"}
          </p>
        )}
        <span className={DATA_MONO}>{s.size.label}</span>
      </div>
      <div className={cn("-mx-2", compact ? "mt-2" : "mt-3")}>
        <SyringeGraphic
          size={s.size}
          fill={s.fill}
          label={
            s.units != null
              ? `${trim(s.units, 1)} units drawn on a ${s.size.label} syringe`
              : `An empty ${s.size.label} syringe`
          }
        />
      </div>
    </>
  )
}

/**
 * VARIANT A — "Compact".
 *
 * The shipped page's order, tightened until the whole input sheet clears the
 * fold on a 390x844 phone. Two moves do most of it: the three result cards
 * collapse into one hairline-divided strip, and the three boxed form inputs
 * become list rows, which is both smaller and the app's own documented row
 * pattern rather than a web form.
 */
export function CompactCalculator() {
  const s = useCalcState()
  return (
    <div className="space-y-3">
      <section className="rounded-2xl bg-bg-surface px-5 pt-4 pb-3">
        <Reading s={s} compact />
        <div className="mt-1">
          <BarrelCaption s={s} />
        </div>
      </section>
      <MisuseNotice s={s} />
      <FiguresStrip s={s} />
      <InputCard s={s} />
      <div className="space-y-3 pt-2">
        <WorkingPanel s={s} />
        <PermanentDisclaimer />
      </div>
    </div>
  )
}

/**
 * VARIANT B — "Focus".
 *
 * The readout is PINNED. It leaves its card, becomes a translucent bar at the
 * top of the scroll area, and the inputs sit directly under it, so the barrel is
 * still on screen while you type and stays there as you scroll to the working.
 * That is the most app-like of the three and the least like a document.
 *
 * It does invert spec 07's stated page order (inputs move above the three
 * figures), which is Adrian's call to make, not mine.
 */
export function FocusCalculator() {
  const s = useCalcState()
  return (
    <div>
      <div className="sticky top-0 z-10 -mx-5 bg-bg-base/85 px-5 pt-1 pb-3 backdrop-blur">
        <Reading s={s} compact />
      </div>
      <div className="space-y-3 pt-3">
        <MisuseNotice s={s} />
        <InputCard s={s} />
        <FiguresStrip s={s} />
        <WorkingPanel s={s} />
        <PermanentDisclaimer />
      </div>
    </div>
  )
}
