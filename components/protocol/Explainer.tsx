"use client"

import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type RefObject } from "react"

import { Vial } from "@/components/containers"
import { PopDialog } from "@/components/feel/PopDialog"
import { SolidIcon } from "@/components/feel/SolidIcon"
import {
  EXPLAINER_COPY,
  PICTURE_PLAYS,
  PICTURE_PLAY_START_MS,
  PICTURE_STAGGER_MS,
  cycleDays,
  halfLifePicture,
  shareLabel,
  type ExplainerTopic,
  type PicturePlay,
} from "@/lib/explainers"
import { cn } from "@/lib/utils"
import { PRESS, PRIMARY_BUTTON } from "@/lib/ui-presets"

export type { ExplainerTopic } from "@/lib/explainers"

/**
 * THE EXPLAINERS (build-brief-final §3.8): a small "?" opens a pop-up with a
 * picture and a few lines. Facts only, no advice (Apple 1.4.2). The words and
 * the pictures' maths are `lib/explainers.ts`.
 *
 * THE PICTURES are drawn in the Solid look (W26): every mark falls from a
 * lighter top to its colour, the vials are the app's own (`Vial`), the ticks
 * are Home's log tick, and each picture plays once as the pop-up lands (W27:
 * they explain by moving, then hold still).
 */

/* ------------------------------------------------------------------ drawing */

/** A picture's frame: one viewBox for all three, so they sit alike. */
const VIEW_W = 240
const VIEW_H = 96

/** A Solid fall for a colour: 30% toward white at the top (as `SolidIcon`). */
function Fall({ id, hue }: { id: string; hue: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style={{ stopColor: `color-mix(in srgb, ${hue} 70%, white)` }} />
      <stop offset="1" style={{ stopColor: hue }} />
    </linearGradient>
  )
}

/** Scale and turn about a part's own centre, not the picture's corner. */
const OWN_CENTRE: CSSProperties = { transformBox: "fill-box", transformOrigin: "center" }

/** Marks a part to play (`PICTURE_PLAYS`), `at` ms after the picture starts. */
function play(kind: PicturePlay, at: number) {
  return { "data-play": kind, "data-at": String(at) }
}

/**
 * Plays the picture once, as the pop-up lands. Keyframes are numbers only;
 * `fill: "backwards"` holds each part at its start until its turn, and a
 * cancel on unmount leaves nothing half-way. Reduced motion: no play at all.
 */
function usePlayOnce(ref: RefObject<SVGSVGElement | null>) {
  useLayoutEffect(() => {
    const svg = ref.current
    if (!svg || typeof svg.animate !== "function") return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const running = Array.from(svg.querySelectorAll<SVGElement>("[data-play]")).map((el) => {
      const p = PICTURE_PLAYS[el.dataset.play as PicturePlay] ?? PICTURE_PLAYS.fade
      return el.animate(p.keyframes as unknown as Keyframe[], {
        duration: p.duration,
        easing: p.easing,
        delay: PICTURE_PLAY_START_MS + Number(el.dataset.at ?? 0),
        fill: "backwards",
      })
    })
    return () => running.forEach((a) => a.cancel())
  }, [ref])
}

/** Home's log tick, logged: the warm grey disc and its dark check, filling
 *  the white due ring under it. */
function LoggedTick({ cx, cy, r, at }: { cx: number; cy: number; r: number; at: number }) {
  const k = r / 11
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r - 0.8}
        fill="none"
        style={{ stroke: "var(--text-primary)" }}
        strokeWidth={1.6 * Math.max(k, 0.75)}
      />
      <g {...play("lift", at)} style={OWN_CENTRE}>
        <circle cx={cx} cy={cy} r={r} style={{ fill: "var(--tick-logged)" }} />
        <path
          d={`M${cx - 5 * k} ${cy + 0.4 * k}l${3.6 * k} ${3.6 * k} ${6.8 * k} ${-7.4 * k}`}
          fill="none"
          style={{ stroke: "var(--bg-base)" }}
          strokeWidth={2.2 * Math.max(k, 0.8)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </g>
  )
}

/** One of the app's own vials, placed in the picture (its svg nests). */
function PictureVial({ x, y, hue, size, fill }: { x: number; y: number; hue: string; size: number; fill: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <Vial colour={hue} size={size} fill={fill} />
    </g>
  )
}

/* ----------------------------------------------------------------- pictures */

/** A vial's height in the stack picture. */
const STACK_VIAL = 34
const STACK_VIAL_W = (STACK_VIAL * 60) / 96

/** Three compounds in one stack row; one tick, and each of them is logged. */
function StacksPicture() {
  const ref = useRef<SVGSVGElement>(null)
  usePlayOnce(ref)
  const hue = "var(--blend-1)"
  // The stack's row, as Home draws it: its vials, then its one tick.
  const row = { x: 10, y: 22, w: 112, h: 52 }
  const rowVials = [18, 34, 50]
  // Its compounds, each logged by that one tick.
  const each = [156, 181, 206]
  return (
    <svg ref={ref} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" aria-hidden className="block">
      <rect
        x={row.x}
        y={row.y}
        width={row.w}
        height={row.h}
        rx="12"
        style={{ fill: "var(--bg-surface-raised)", stroke: "rgb(0 0 0 / 0.5)" }}
        strokeWidth="1"
      />
      <path
        d={`M${row.x + 12} ${row.y + 0.9}H${row.x + row.w - 12}`}
        style={{ stroke: "color-mix(in srgb, var(--text-primary) 9%, transparent)" }}
        strokeWidth="1"
        strokeLinecap="round"
      />
      {rowVials.map((x) => (
        <PictureVial key={x} x={x} y={row.y + (row.h - STACK_VIAL) / 2} hue={hue} size={STACK_VIAL} fill={0.7} />
      ))}
      <LoggedTick cx={row.x + row.w - 22} cy={row.y + row.h / 2} r={11} at={0} />

      <path
        d="M131 48h17M143.5 43.5l4.5 4.5-4.5 4.5"
        fill="none"
        style={{ stroke: "var(--text-muted)" }}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...play("fade", 160)}
      />

      {each.map((x, i) => (
        <g key={x}>
          <PictureVial x={x} y={20} hue={hue} size={STACK_VIAL} fill={0.7} />
          <LoggedTick cx={x + STACK_VIAL_W / 2} cy={67} r={7} at={300 + i * PICTURE_STAGGER_MS} />
        </g>
      ))}
    </svg>
  )
}

/** Five days on, two off, again; today's line; and the loop it repeats on. */
function CyclesPicture() {
  const ref = useRef<SVGSVGElement>(null)
  usePlayOnce(ref)
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const hue = "var(--blend-3)"
  const days = cycleDays(5, 2, 14)
  const x0 = 13
  const pitch = 14
  const cellW = 11
  const today = 3
  const todayX = x0 + today * pitch + cellW / 2
  const span = (from: number, to: number) => [x0 + from * pitch, x0 + to * pitch + cellW] as const
  const brackets = [
    { at: span(0, 4), label: "5 ON" },
    { at: span(5, 6), label: "2 OFF" },
  ]
  return (
    <svg ref={ref} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" aria-hidden className="block">
      <defs>
        <Fall id={`${id}on`} hue={hue} />
      </defs>
      {days.map((on, i) => (
        <rect
          key={i}
          x={x0 + i * pitch}
          y="30"
          width={cellW}
          height="28"
          rx="3.5"
          // Days gone by sit a step down through FILL opacity: the rise plays
          // the element's own opacity, which then rests at 1 without a flash.
          style={
            on
              ? { fill: `url(#${id}on)`, fillOpacity: i < today ? 0.55 : 1 }
              : { fill: "rgb(0 0 0 / 0.35)", stroke: "var(--border-strong)" }
          }
          strokeWidth={on ? undefined : 1}
          {...play("rise", i * 40)}
        />
      ))}
      <g {...play("turn", 14 * 40)} style={OWN_CENTRE}>
        <g transform="translate(212 34)">
          <SolidIcon name="tileCycles" size={20} tone="off" />
        </g>
      </g>

      <g {...play("slide", 380)}>
        <path d={`M${todayX} 22V62`} style={{ stroke: "var(--text-primary)" }} strokeWidth="1.3" strokeLinecap="round" />
        <text
          x={todayX}
          y="15"
          textAnchor="middle"
          className="font-mono"
          fontSize="9"
          style={{ fill: "var(--text-muted)" }}
        >
          TODAY
        </text>
      </g>

      {brackets.map((b, i) => (
        <g key={b.label} {...play("fade", 620 + i * PICTURE_STAGGER_MS)}>
          <path
            d={`M${b.at[0] + 1} 64v3.5H${b.at[1] - 1}V64`}
            fill="none"
            style={{ stroke: "var(--text-muted)" }}
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <text
            x={(b.at[0] + b.at[1]) / 2}
            y="80"
            textAnchor="middle"
            className="font-mono"
            fontSize="9"
            style={{ fill: "var(--text-muted)" }}
          >
            {b.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

/** A dose rises, then halves every half-life: ½ left after one, ¼ after two. */
function HalfLifePicture() {
  const ref = useRef<SVGSVGElement>(null)
  usePlayOnce(ref)
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const hue = "var(--chart-line)"
  const baseY = 68
  const { line, area, marks } = halfLifePicture({
    doseX: 22,
    peakX: 30,
    endX: 226,
    baseY,
    peakY: 14,
    halfW: 58,
    marks: 2,
  })
  const from = [30, ...marks.map((m) => m.x)]
  return (
    <svg ref={ref} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" aria-hidden className="block">
      <defs>
        <Fall id={`${id}dot`} hue={hue} />
        {/* The graph's own soft fill under the curve. */}
        <linearGradient id={`${id}area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: hue, stopOpacity: 0.3 }} />
          <stop offset="1" style={{ stopColor: hue, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={`M14 ${baseY}H226`} style={{ stroke: "var(--border-strong)" }} strokeWidth="1" />
      <path d={area} style={{ fill: `url(#${id}area)` }} />
      <path
        d={line}
        fill="none"
        style={{ stroke: hue }}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* The dose, marked under the axis as the graphs mark it. */}
      <rect x="21" y={baseY + 3} width="2" height="7" rx="1" style={{ fill: "var(--text-primary)" }} />

      {marks.map((m, i) => (
        <g key={m.x} {...play("rise", 80 + i * 120)}>
          <path d={`M${m.x} ${baseY}V${m.y + 5}`} style={{ stroke: "var(--text-muted)" }} strokeWidth="1" strokeDasharray="2 3" />
          <circle
            cx={m.x}
            cy={m.y}
            r="3.6"
            style={{ fill: `url(#${id}dot)`, stroke: "var(--bg-inset)" }}
            strokeWidth="1.5"
          />
          <text
            x={m.x}
            y={m.y - 9}
            textAnchor="middle"
            className="font-mono"
            fontSize="13"
            style={{ fill: "var(--text-primary)" }}
          >
            {shareLabel(m.left)}
          </text>
        </g>
      ))}

      {/* Each half-life, along the axis. */}
      {marks.map((m, i) => (
        <g key={`b${m.x}`} {...play("fade", 380 + i * 120)}>
          <path
            d={`M${from[i] + 1.5} ${baseY + 5}v3H${m.x - 1.5}v-3`}
            fill="none"
            style={{ stroke: "var(--text-muted)" }}
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <text
            x={(from[i] + m.x) / 2}
            y={baseY + 20}
            textAnchor="middle"
            className="font-mono"
            fontSize="8.5"
            style={{ fill: "var(--text-muted)" }}
          >
            HALF-LIFE
          </text>
        </g>
      ))}
    </svg>
  )
}

const PICTURE: Record<ExplainerTopic, () => ReactElement> = {
  stacks: StacksPicture,
  cycles: CyclesPicture,
  "half-life": HalfLifePicture,
}

/** An explainer's picture on its own (it plays once when it mounts). */
export function ExplainerPicture({ topic }: { topic: ExplainerTopic }) {
  const Picture = PICTURE[topic]
  return <Picture />
}

/* -------------------------------------------------------------------- the ? */

/**
 * The "?" (W25): a small INDENTED key, 20px, cut into whatever it sits on
 * (the inset surface), with a quiet muted "?". Smaller and calmer than the old
 * 26px ring: beside a page title it reads as a footnote to the title, and on
 * Protocol's buttons as a small key set into the button. Its own `::after`
 * reaches 12px out on every side, so it is pressed at 44 wherever it is put
 * (cold review D8); a caller's `HIT_*` (on `::before`) can only add to that.
 */
export const EXPLAINER_KEY =
  "inst-inset relative flex h-5 w-5 shrink-0 items-center justify-center text-[11px] leading-none font-medium text-text-muted transition-colors hover:text-foreground after:absolute after:-inset-3 after:content-['']"

/** The inset surface's own radius is 12 (unlayered, so a utility cannot beat
 *  it); at 20px the key keeps a rounded square's corner: the shape scale's 9
 *  at 30px (the close arrow), at 20. */
export const EXPLAINER_KEY_SHAPE: CSSProperties = { borderRadius: 6 }

/** The small "?" key and its pop-up. */
export function ExplainerButton({ topic, className }: { topic: ExplainerTopic; className?: string }) {
  const [open, setOpen] = useState(false)
  const { title, lines } = EXPLAINER_COPY[topic]
  const Picture = PICTURE[topic]
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(PRESS.icon, EXPLAINER_KEY, className)}
        style={EXPLAINER_KEY_SHAPE}
      >
        ?
      </button>
      <PopDialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        // On a small phone the words and Got it scroll inside the card rather
        // than run off the screen.
        className="max-h-[calc(100dvh-48px)] overflow-y-auto"
      >
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
