"use client"

import { useState } from "react"

import { PopDialog } from "@/components/feel/PopDialog"
import { cn } from "@/lib/utils"
import { PRESS, PRIMARY_BUTTON } from "@/lib/ui-presets"

export type ExplainerTopic = "stacks" | "cycles" | "half-life"

/**
 * THE EXPLAINERS (build-brief-final §3.8): a small "?" beside a page's title
 * opens a pop-up with a picture and two or three lines. Facts only, no advice
 * (Apple 1.4.2). The words are the brief's; the stack and cycle pictures are
 * round four's (`tileHelp9`), the half-life one draws the same curve the
 * graphs do.
 */
const COPY: Record<ExplainerTopic, { title: string; lines: string[] }> = {
  stacks: {
    title: "What is a stack?",
    lines: [
      "A stack is compounds you take together, at the same time.",
      "Tick the stack once and every compound in it is logged.",
    ],
  },
  cycles: {
    title: "What is a cycle?",
    lines: [
      "A cycle gives a compound days on and days off.",
      "On off days it isn’t due, and the cycle shows where you are.",
    ],
  },
  "half-life": {
    title: "What is a half-life?",
    lines: [
      "A half-life is how long your body takes to clear half of what it has absorbed.",
      "Each compound has its own: some clear in hours, others over days, depending on how the body breaks it down and how slowly it is released.",
      "Trakabl uses it to estimate how much is in you now and when a dose has cleared. These curves are estimates from your doses and your schedule.",
    ],
  },
}

function StacksPicture() {
  const hue = "var(--blend-1)"
  return (
    <svg viewBox="0 0 220 86" width="100%" aria-hidden>
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${34 + i * 34} 12)`}>
          <rect x="4" y="0" width="12" height="6" rx="2" style={{ fill: "var(--glyph-off-bottom)" }} />
          <rect x="2" y="6" width="16" height="36" rx="4" style={{ fill: "color-mix(in srgb, var(--text-primary) 6%, transparent)", stroke: "var(--text-subtle)" }} />
          <rect x="4" y="22" width="12" height="18" rx="2.5" style={{ fill: hue }} />
        </g>
      ))}
      <path d="M44 64h68M44 58v6M78 58v6M112 58v6" style={{ stroke: "var(--text-muted)" }} strokeWidth="1.2" fill="none" />
      <path d="M122 64h30" style={{ stroke: "var(--text-muted)" }} strokeWidth="1.2" />
      <path d="M150 60.5l6 3.5-6 3.5Z" style={{ fill: "var(--text-muted)" }} />
      <circle cx="178" cy="64" r="13" style={{ fill: "var(--tick-logged)" }} />
      <path d="M172 64.5l4 4 8-9" fill="none" style={{ stroke: "var(--bg-base)" }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CyclesPicture() {
  const hue = "var(--blend-3)"
  const days = [1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0]
  const todayX = 12 + 3 * 14 + 5.5
  return (
    <svg viewBox="0 0 220 86" width="100%" aria-hidden>
      {days.map((on, i) => (
        <rect
          key={i}
          x={12 + i * 14}
          y="24"
          width="11"
          height="26"
          rx="3"
          style={on ? { fill: hue, opacity: i < 3 ? 0.55 : 1 } : { fill: "none", stroke: "var(--text-subtle)" }}
        />
      ))}
      <path d={`M${todayX} 16v42`} style={{ stroke: "var(--text-primary)" }} strokeWidth="1.2" />
      <text x={todayX} y="11" textAnchor="middle" className="font-mono" fontSize="9" style={{ fill: "var(--text-muted)" }}>TODAY</text>
      <text x="46" y="72" textAnchor="middle" className="font-mono" fontSize="9" style={{ fill: "var(--text-muted)" }}>5 ON</text>
      <text x="96" y="72" textAnchor="middle" className="font-mono" fontSize="9" style={{ fill: "var(--text-muted)" }}>2 OFF</text>
    </svg>
  )
}

function HalfLifePicture() {
  const hue = "var(--chart-line)"
  // A dose rises fast and clears at a half-life: the dashed ½ line where half is gone.
  const pts: string[] = []
  for (let i = 0; i <= 60; i++) {
    const t = i / 60
    const x = 20 + t * 180
    const rise = 1 - Math.exp(-t * 40)
    const v = rise * Math.pow(0.5, t / 0.32)
    pts.push(`${i ? "L" : "M"}${x.toFixed(1)} ${(66 - v * 50).toFixed(1)}`)
  }
  const hx = 20 + 0.345 * 180
  return (
    <svg viewBox="0 0 220 86" width="100%" aria-hidden>
      <path d="M20 66h180" style={{ stroke: "var(--border-strong)" }} strokeWidth="1" />
      <path d={pts.join("")} fill="none" style={{ stroke: hue }} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M${hx.toFixed(1)} 14V66`} style={{ stroke: "var(--text-primary)" }} strokeOpacity="0.8" strokeDasharray="2 3" />
      <text x={(hx + 5).toFixed(1)} y="24" className="font-mono" fontSize="10" style={{ fill: "var(--text-muted)" }}>½</text>
      <rect x="19" y="68" width="2" height="7" rx="1" style={{ fill: "var(--text-primary)" }} />
      <text x="20" y="84" textAnchor="middle" className="font-mono" fontSize="9" style={{ fill: "var(--text-muted)" }}>DOSE</text>
    </svg>
  )
}

const PICTURE: Record<ExplainerTopic, () => React.ReactElement> = {
  stacks: StacksPicture,
  cycles: CyclesPicture,
  "half-life": HalfLifePicture,
}

/** The small circled "?" that sits beside a page title, and its pop-up. */
export function ExplainerButton({ topic, className }: { topic: ExplainerTopic; className?: string }) {
  const [open, setOpen] = useState(false)
  const { title, lines } = COPY[topic]
  const Picture = PICTURE[topic]
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={title}
        className={cn(
          PRESS.icon,
          "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[12px] font-medium text-text-muted shadow-[inset_0_0_0_1.2px_var(--text-muted)] transition-colors hover:text-foreground",
          className,
        )}
      >
        ?
      </button>
      <PopDialog open={open} onClose={() => setOpen(false)} title={title}>
        <div className="mt-3 inst-inset px-2 py-3">
          <Picture />
        </div>
        <div className="mt-3 space-y-2">
          {lines.map((l) => (
            <p key={l} className="text-[13.5px] leading-snug text-text-muted">
              {l}
            </p>
          ))}
        </div>
        <button type="button" onClick={() => setOpen(false)} className={cn(PRIMARY_BUTTON, "mt-4 w-full py-2.5")}>
          Got it
        </button>
      </PopDialog>
    </>
  )
}
