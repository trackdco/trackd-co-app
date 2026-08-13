import type { CSSProperties, ReactNode } from "react"

import { CaretDown, CaretUp } from "@/components/icons"
import { CARD_EYEBROW, METRIC_VALUE, UNIT_SUFFIX } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

/**
 * The GLASS CONSOLE card system for the founder dashboard.
 *
 * SERVER COMPONENTS, all of them — no `"use client"` anywhere in this file.
 * Every one is pure presentation over data the page already holds, so none of
 * it needs to reach the browser. (`components/admin/ui.tsx` makes the same
 * choice for the same reason; this is the layered-glass sibling of that file,
 * not a replacement for it.)
 *
 * THE DIRECTION (Adrian, 2026-08-13): translucent panels floating over a faint
 * engineering grid and a few soft radial washes, with fewer things on screen and
 * more room around each. The paint lives in `app/globals.css` under "THE GLASS
 * CONSOLE" — `.glass-panel`, `.glass-inset`, `.glass-divide`, and the
 * `--admin-glass-*` tokens. Read that block before changing anything here; the
 * reasoning for the alphas, the fallback and the stacking context is all there.
 *
 * TWO RULES THIS FILE EXISTS TO ENFORCE:
 *
 *  1. **No `--text-subtle` on glass.** It measures ~1.9:1 on the opaque surface
 *     already, and translucency only takes contrast away. `--text-muted` is the
 *     floor for anything small. That is why every label here is `CARD_EYEBROW`
 *     (muted) and never `METRIC_LABEL` (subtle).
 *  2. **`null` prints an em dash, never "0".** A measurement that was not taken
 *     and a measurement of zero are different facts and only one of them is
 *     "0" (ui-context.md → Admin). The em dash is the ONE sanctioned use of the
 *     character — the app-wide ban on it is a ban in prose.
 */

/* -------------------------------------------------------------- stagger --- */

/**
 * The inline style that puts a panel at position `index` in the arrival stagger.
 *
 * A CUSTOM PROPERTY, deliberately: `.animate-admin-rise` reads
 * `animation-delay: var(--admin-delay)`, so the only thing inline is a number.
 * An inline `animation` shorthand would outrank the `prefers-reduced-motion`
 * block in `globals.css` and could never be switched off (ui-context.md →
 * Motion names this trap by name).
 *
 * The cast is the standard React one: `CSSProperties` has no index signature
 * for custom properties, but the runtime has always accepted them.
 */
export function riseStyle(index: number, step = 60): CSSProperties {
  return { "--admin-delay": `${Math.max(0, index) * step}ms` } as CSSProperties
}

/** Shared by every export: whether to animate in, and where in the stagger. */
interface Arrival {
  /** Position in the arrival stagger. Omit for "arrives first". */
  index?: number
  /** Milliseconds between one panel and the next. */
  step?: number
  /** Set false for a panel that is swapped in AFTER first paint. */
  rise?: boolean
}

function arrival({ index = 0, step = 60, rise = true }: Arrival) {
  return rise
    ? { className: "animate-admin-rise", style: riseStyle(index, step) }
    : { className: undefined, style: undefined }
}

/* ---------------------------------------------------------------- panel --- */

/**
 * The base glass card. Everything else in this file is one of these with a
 * layout inside it.
 *
 * `title` renders as an eyebrow, not a heading — the inversion (small titles,
 * large values) is the identity and /admin keeps it (ui-context.md → Admin,
 * "What is deliberately kept").
 */
export function GlassPanel({
  id,
  title,
  hint,
  action,
  children,
  padded = true,
  className,
  index,
  step,
  rise,
}: Arrival & {
  /** Anchor for a section nav to jump to. */
  id?: string
  title?: string
  hint?: string
  /** A control that belongs to this panel — a range switch, a link out. */
  action?: ReactNode
  children: ReactNode
  /** Set false when the content manages its own padding (a full-bleed group). */
  padded?: boolean
  className?: string
}) {
  const enter = arrival({ index, step, rise })
  const head = title || hint || action

  return (
    <section
      id={id}
      className={cn(
        "glass-panel scroll-mt-24",
        padded && "p-7",
        enter.className,
        className
      )}
      style={enter.style}
    >
      {head && (
        <div className={cn("mb-5", !padded && "px-7 pt-7")}>
          <div className="flex items-baseline justify-between gap-4">
            {title && <h2 className={CARD_EYEBROW}>{title}</h2>}
            {action}
          </div>
          {/* `--text-muted`, not `--text-subtle`: see the contrast rule above. */}
          {hint && <p className="mt-2 text-xs leading-relaxed text-text-muted">{hint}</p>}
        </div>
      )}
      {children}
    </section>
  )
}

/**
 * A responsive grid of panels. Two on a tablet, up to four on a monitor —
 * /admin is a desktop surface, so the wide breakpoints are the real ones.
 */
export function GlassGrid({
  children,
  cols = 4,
  className,
}: {
  children: ReactNode
  cols?: 2 | 3 | 4
  className?: string
}) {
  const wide =
    cols === 2
      ? "sm:grid-cols-2"
      : cols === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : "sm:grid-cols-2 xl:grid-cols-4"
  // gap-5, not the app's gap-3: "fewer things, more room" is the whole brief,
  // and glass panels need air between them or the blurs read as one sheet.
  return <div className={cn("grid grid-cols-1 gap-5", wide, className)}>{children}</div>
}

/* ----------------------------------------------------------------- stat --- */

export interface GlassStatProps extends Arrival {
  label: string
  /** `null` is "not measured" and prints an em dash. It is never "0". */
  value: number | string | null
  /** Demoted inline beside the value (`92`▸`%`). Suppressed when value is null. */
  suffix?: string
  /** The change, already formatted ("+12%", "3 fewer"). `null` prints nothing. */
  delta?: string | null
  /**
   * Whether the metric MOVED, and which way. Separate from `tone` on purpose —
   * the same split `Stat` in `ui.tsx` makes, and for the same reason: an upward
   * caret on "Unprocessed webhooks: 0" says something false. A metric with a
   * direction gets a caret; a metric merely in a good or bad STATE gets a word.
   * Either way colour is never the only signal (ui-context.md → Admin).
   */
  direction?: "up" | "down"
  /** Directional colour is for BUSINESS metrics only — never a health value. */
  tone?: "neutral" | "positive" | "negative"
  hint?: string
  /** Slot for a `<Sparkline />`. Sits under the figure, full width. */
  spark?: ReactNode
  className?: string
}

/**
 * A metric tile on glass: eyebrow label, big value, optional delta, optional
 * sparkline.
 *
 * The figure carries `.animate-admin-value` on the SAME `--admin-delay` as its
 * panel, so the number lands a beat after the panel it sits in rather than
 * arriving with it — which is what makes the stagger read as a dashboard
 * assembling itself instead of a page fading in.
 */
export function GlassStat({
  label,
  value,
  suffix,
  delta,
  direction,
  tone = "neutral",
  hint,
  spark,
  className,
  index,
  step,
  rise,
}: GlassStatProps) {
  const enter = arrival({ index, step, rise })

  const toneClass =
    tone === "positive"
      ? "text-admin-positive"
      : tone === "negative"
        ? "text-admin-negative"
        : "text-foreground"

  const display =
    value === null
      ? "—"
      : typeof value === "number"
        ? value.toLocaleString()
        : value

  const Arrow = direction === "up" ? CaretUp : direction === "down" ? CaretDown : null
  const statusWord =
    Arrow || tone === "neutral" ? null : tone === "positive" ? "Clear" : "Check this"

  return (
    <div
      className={cn(
        "glass-panel flex flex-col justify-between gap-5 p-7",
        enter.className,
        className
      )}
      style={enter.style}
    >
      <div>
        <p className={CARD_EYEBROW}>{label}</p>
        <p
          className={cn(
            METRIC_VALUE,
            "animate-admin-value mt-3 text-[34px] leading-none",
            // A tile that has NOT been measured stays neutral. Colouring an em
            // dash red would be an evaluation of a number nobody has.
            value === null ? "text-text-muted" : toneClass
          )}
        >
          {display}
          {suffix && value !== null && <span className={UNIT_SUFFIX}>{suffix}</span>}
        </p>
        {(delta || statusWord) && (
          <p className="mt-3 flex items-center gap-1.5 text-xs">
            {Arrow && (
              <Arrow className={cn("size-3.5 shrink-0", toneClass)} weight="bold" aria-hidden />
            )}
            {statusWord && <span className={toneClass}>{statusWord}</span>}
            {delta && <span className={cn(Arrow ? toneClass : "text-text-muted")}>{delta}</span>}
          </p>
        )}
        {hint && <p className="mt-2 text-xs leading-relaxed text-text-muted">{hint}</p>}
      </div>
      {spark && <div>{spark}</div>}
    </div>
  )
}

/* ---------------------------------------------------------------- group --- */

/**
 * An iOS-Settings-style grouped list: an optional section eyebrow OUTSIDE the
 * card, then hairline-separated rows inside it.
 *
 * Two forms, and which one you want depends on where it sits:
 *  - default — the group IS the glass panel. Use it at the top level of a page.
 *  - `inset` — the group is a well INSIDE a `GlassPanel`. A second full glass
 *    panel nested in the first would stack two blurs and read as a box in a
 *    box, which the app's "no borders-in-borders" rule exists to prevent.
 *
 * Children are `GlassRow`s. Anything else works too — the separator rule is on
 * the container, so it applies to whatever is in it.
 */
export function GlassGroup({
  label,
  hint,
  children,
  inset = false,
  className,
  index,
  step,
  rise,
}: Arrival & {
  label?: string
  hint?: string
  children: ReactNode
  inset?: boolean
  className?: string
}) {
  const enter = arrival({ index, step, rise })

  return (
    <section className={cn(enter.className, className)} style={enter.style}>
      {(label || hint) && (
        <div className="mb-3 px-1">
          {label && <h2 className={CARD_EYEBROW}>{label}</h2>}
          {hint && <p className="mt-2 text-xs leading-relaxed text-text-muted">{hint}</p>}
        </div>
      )}
      <div
        className={cn(
          "glass-divide overflow-hidden",
          inset ? "glass-inset" : "glass-panel"
        )}
      >
        {children}
      </div>
    </section>
  )
}

/**
 * One row of a `GlassGroup` — label on the left, figure on the right.
 *
 * `py-4 px-6` rather than the app's `py-3`: this is the "more room" direction,
 * and a 48px-tall row is also what makes a long list scannable on a monitor
 * from a metre away.
 */
export function GlassRow({
  label,
  value,
  hint,
  leading,
  trailing,
  muted = false,
  className,
}: {
  label: ReactNode
  /** Right-aligned figure. Mono + tabular, so figures rail vertically. */
  value?: ReactNode
  hint?: string
  /** An icon or dot before the label. */
  leading?: ReactNode
  /** Anything after the figure — a caret, a link, a badge. */
  trailing?: ReactNode
  /** For a row that is context rather than content. */
  muted?: boolean
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-4 px-6 py-4", className)}>
      {leading && <span className="shrink-0">{leading}</span>}
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm", muted ? "text-text-muted" : "text-foreground")}>
          {label}
        </p>
        {hint && <p className="mt-1 truncate text-xs text-text-muted">{hint}</p>}
      </div>
      {value !== undefined && (
        <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
          {value}
        </span>
      )}
      {trailing && <span className="shrink-0">{trailing}</span>}
    </div>
  )
}

/**
 * What a panel says when it has nothing to say. Never a zero pretending to be a
 * measurement, and never a blank panel (ui-context.md → States).
 */
export function GlassEmpty({ children }: { children: ReactNode }) {
  return <p className="px-6 py-5 text-sm text-text-muted">{children}</p>
}
