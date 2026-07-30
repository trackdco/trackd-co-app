"use client"

import { useState } from "react"

import { cn } from "@/lib/utils"

import {
  CardInputs,
  GridInputs,
  KeypadInputs,
  SentenceInputs,
} from "./inputs"
import {
  FiguresStrip,
  MisuseNotice,
  PermanentDisclaimer,
  Readout,
  WorkingPanel,
  useCalcState,
} from "./shared"

type StyleId = "keypad" | "sentence" | "cards" | "grid"

const STYLES: { id: StyleId; label: string; note: string }[] = [
  {
    id: "keypad",
    label: "Keypad",
    note: "No iOS keyboard. One field active at a time, pad always in the same place, so nothing ever slides up over the barrel.",
  },
  {
    id: "sentence",
    label: "Sentence",
    note: "Reads as prose with the numbers underlined. Tap a unit word to flip it. Slowest to scan, hardest to get a unit wrong in.",
  },
  {
    id: "cards",
    label: "Cards",
    note: "One card per input, value as the display layer. Most consistent with every other card in the app, and the tallest.",
  },
  {
    id: "grid",
    label: "Grid",
    note: "Powder and BAC water paired (the two halves of the concentration), dose on its own. Tightest and most conventional.",
  },
]

/**
 * DEV-ONLY. Everything above the inputs is fixed: bare readout, barrel, figures
 * strip. Only the input section changes, so the comparison is like for like.
 */
export function Switcher() {
  const [style, setStyle] = useState<StyleId>("keypad")
  const s = useCalcState()
  const active = STYLES.find((v) => v.id === style) ?? STYLES[0]

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1 rounded-full border border-border-default bg-bg-input p-0.5">
        {STYLES.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={style === v.id}
            onClick={() => setStyle(v.id)}
            className={cn(
              "rounded-full py-1.5 text-[11px] font-medium transition-colors duration-300 ease-out",
              style === v.id
                ? "bg-bg-surface-raised text-foreground"
                : "text-text-muted",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
      <p className="px-1 text-xs leading-relaxed text-text-subtle">{active.note}</p>

      <Readout s={s} />

      <div className="space-y-3">
        <MisuseNotice s={s} />
        <FiguresStrip s={s} />

        {style === "keypad" ? <KeypadInputs s={s} /> : null}
        {style === "sentence" ? <SentenceInputs s={s} /> : null}
        {style === "cards" ? <CardInputs s={s} /> : null}
        {style === "grid" ? <GridInputs s={s} /> : null}

        <WorkingPanel s={s} />
        <PermanentDisclaimer />
      </div>
    </div>
  )
}
