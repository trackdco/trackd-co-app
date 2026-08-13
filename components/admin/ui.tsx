import type { ReactNode } from "react"

import { CaretDown, CaretUp } from "@/components/icons"
import { CARD_EYEBROW, METRIC_VALUE, UNIT_SUFFIX } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

/**
 * Layout primitives for the founder dashboard.
 *
 * SERVER COMPONENTS on purpose — every one of these is pure presentation over
 * data the page already has, so none of it needs to reach the browser. The only
 * client component on /admin is the auto-refresh ticker, which genuinely needs a
 * timer (and the pre-existing feedback list, which needs a click).
 *
 * Admin-scoped styling rules live in `ui-context.md` → Admin. The short version:
 * the app's surfaces, radii, eyebrows and mono figures are kept; a categorical
 * series palette, horizontal ranked bars and directional colour on BUSINESS
 * metrics are permitted here and nowhere else.
 */

/** A titled band of the page, with an anchor the section nav can jump to. */
export function Section({
  id,
  title,
  hint,
  action,
  children,
}: {
  id: string
  title: string
  hint?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={CARD_EYEBROW}>{title}</h2>
        {action}
      </div>
      {hint && <p className="mt-1.5 text-xs text-text-subtle">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** The standard borderless card. Hairlines live inside it, never around it. */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-2xl bg-bg-surface p-5 ${className}`}>{children}</div>
  )
}

/** A responsive grid of stat tiles. */
export function StatGrid({
  children,
  cols = 4,
}: {
  children: ReactNode
  cols?: 2 | 3 | 4
}) {
  const wide =
    cols === 2 ? "sm:grid-cols-2" : cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"
  return <div className={`grid grid-cols-2 gap-3 ${wide}`}>{children}</div>
}

/**
 * A metric tile.
 *
 * Reads correctly at zero: `value` of `null` prints an em dash rather than "0",
 * because a measurement that was not taken and a measurement of zero are
 * different facts and only one of them is "0" (`ui-context.md` → Admin).
 */
export function Stat({
  label,
  value,
  suffix,
  hint,
  spark,
  tone = "neutral",
  direction,
}: {
  label: string
  value: number | string | null
  suffix?: string
  hint?: string
  spark?: ReactNode
  /** Directional colour is for BUSINESS metrics only — never a health value. */
  tone?: "neutral" | "positive" | "negative"
  /**
   * Whether this metric MOVED, and which way. Separate from `tone` on purpose.
   *
   * "Unprocessed webhooks: 0" is good news, so it is toned positive — but it has
   * not gone up, and drawing a rising arrow on it says something false. Only a
   * metric that genuinely has a direction passes this; the rest get a status
   * word instead, so colour is still never the only signal.
   */
  direction?: "up" | "down"
}) {
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

  /**
   * Colour is NEVER the only signal (`ui-context.md` → Admin).
   *
   * A metric that moved gets an arrow. A metric that is simply in a good or bad
   * STATE gets a word. Either way a reader who cannot distinguish red from green
   * gets the same meaning the colour carries.
   */
  const Arrow = direction === "up" ? CaretUp : direction === "down" ? CaretDown : null
  const statusWord =
    Arrow || tone === "neutral" ? null : tone === "positive" ? "Clear" : "Check this"

  return (
    <div className="flex flex-col justify-between rounded-2xl bg-bg-surface p-4">
      {/* CARD_EYEBROW, not METRIC_LABEL: this is a standalone tile's only
          title, and the dimmer variant measures 1.92:1 on this surface. */}
      <p className={CARD_EYEBROW}>{label}</p>
      <p className={cn(METRIC_VALUE, "mt-1 flex items-center gap-1.5 leading-none", toneClass)}>
        {Arrow && <Arrow className="size-4 shrink-0" weight="bold" aria-hidden />}
        <span>
          {display}
          {suffix && value !== null && <span className={UNIT_SUFFIX}>{suffix}</span>}
        </span>
      </p>
      {(hint || statusWord) && (
        <p className="mt-2 text-[11px] leading-snug text-text-muted">
          {statusWord && <span className={toneClass}>{statusWord}</span>}
          {statusWord && hint ? " · " : ""}
          {hint}
        </p>
      )}
      {spark && <div className="mt-3">{spark}</div>}
    </div>
  )
}

/** A row of label → figure, the dashboard's densest unit. */
export function KeyRow({
  label,
  value,
  muted = false,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className={`truncate text-sm ${muted ? "text-text-muted" : "text-foreground"}`}>
        {label}
      </span>
      <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
        {value}
      </span>
    </div>
  )
}

/** What a section says when it has nothing to say. Never a zero pretending. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-text-muted">{children}</p>
}

/** A small explanatory line under a section title. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-2 px-1 text-xs text-text-subtle">{children}</p>
}
