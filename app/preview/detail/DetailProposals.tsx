"use client"

import { useState } from "react"

import { Container } from "@/components/containers"
import {
  CalendarDot,
  Package,
  Pause,
  PencilSimple,
  Prohibit,
  Trash,
} from "@/components/icons"
import { cn } from "@/lib/utils"
import { CARD_EYEBROW, DATA_MONO, METRIC_LABEL } from "@/lib/ui-presets"

/**
 * DESIGN HARNESS for the compound detail sheet (Spec w2b-13, Step 7).
 *
 * Six layouts of the same sheet, static. Nothing here writes.
 *
 * TWO THINGS ARE SETTLED and apply to all six (Adrian, 2026-08-07):
 *  - **Alter dose and Schedule are ONE button.** They already opened the same
 *    form; two rows for one destination was the tell that the list had been
 *    written from the code rather than from the task.
 *  - **Add stock and Correct remaining are likewise one**, worded "Stock".
 *
 * All six obey `ui-context.md`: borderless, hairlines rather than nested boxes,
 * eyebrow labels, terse copy, no em dashes.
 */

const COMPOUND = {
  name: "Testosterone E",
  category: "anabolic",
  dose: "250 mg",
  cadence: "Every 3 days",
  time: "8:00 am",
  started: "Sat 1 Feb",
  next: "Tue 12, Fri 15, Mon 18",
  remaining: "8 mL",
  fill: 0.42,
}

function Art({ size = 72 }: { size?: number }) {
  return (
    <Container
      name={COMPOUND.name}
      inventoryType="preconcentrated"
      category={COMPOUND.category}
      fill={COMPOUND.fill}
      size={size}
    />
  )
}

/** The header every proposal shares, so only the ACTIONS differ between them. */
function Head({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-4">
      <Art size={compact ? 52 : 72} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className={CARD_EYEBROW}>Anabolics · IM</p>
        <p className="text-lg leading-tight font-medium text-foreground">
          {COMPOUND.name}
        </p>
        <p className="font-mono text-sm tabular-nums text-text-muted">
          {COMPOUND.dose}
          <span className="text-text-subtle"> · {COMPOUND.remaining} left</span>
        </p>
      </div>
    </div>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5 overflow-hidden rounded-3xl bg-bg-surface px-6 pt-3 pb-6">
      <span
        aria-hidden
        className="mx-auto block h-1 w-9 rounded-full bg-border-strong"
      />
      {children}
    </div>
  )
}

/** A plain hairline action row, optionally stating its current value. */
function RowAction({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value?: string
}) {
  return (
    <button
      type="button"
      className="hairline-t flex min-h-12 w-full items-center gap-3 border-border-default text-left text-foreground"
    >
      <span className="shrink-0 text-text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      {value && <span className={cn(DATA_MONO, "shrink-0")}>{value}</span>}
    </button>
  )
}

function DeleteRow() {
  return (
    <button
      type="button"
      className="hairline-t flex w-full items-center gap-3 border-border-default pt-3 text-left text-sm text-text-muted"
    >
      <Trash className="h-4 w-4 shrink-0" aria-hidden />
      Delete {COMPOUND.name}
    </button>
  )
}

/** The read-out block, shared by the proposals that lead with it. */
function Readout() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: "Dose", value: COMPOUND.dose },
        { label: "Every", value: "3 days" },
        { label: "At", value: COMPOUND.time },
      ].map((s) => (
        <div key={s.label}>
          <p className={METRIC_LABEL}>{s.label}</p>
          <p className="mt-1 font-mono text-sm tabular-nums text-foreground">
            {s.value}
          </p>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------- 1 · equal rows */

function P1() {
  return (
    <Frame>
      <Head />
      <Readout />
      <div>
        <RowAction icon={<PencilSimple className="h-4 w-4" />} label="Log this dose" />
        <RowAction icon={<Prohibit className="h-4 w-4" />} label="Skip this dose" />
        <RowAction
          icon={<CalendarDot className="h-4 w-4" />}
          label="Edit dose & schedule"
          value={COMPOUND.cadence}
        />
        <RowAction icon={<Pause className="h-4 w-4" />} label="Pause" />
        <RowAction
          icon={<Package className="h-4 w-4" />}
          label="Stock"
          value={COMPOUND.remaining}
        />
      </div>
      <DeleteRow />
    </Frame>
  )
}

/* ------------------------------------------------ 2 · one filled button */

function P2() {
  return (
    <Frame>
      <Head />
      <Readout />
      <button
        type="button"
        className="w-full rounded-xl bg-accent-primary py-3 text-sm font-medium text-bg-base"
      >
        Log this dose
      </button>
      <div>
        <RowAction icon={<Prohibit className="h-4 w-4" />} label="Skip this dose" />
        <RowAction
          icon={<CalendarDot className="h-4 w-4" />}
          label="Edit dose & schedule"
          value={COMPOUND.cadence}
        />
        <RowAction icon={<Pause className="h-4 w-4" />} label="Pause" />
        <RowAction
          icon={<Package className="h-4 w-4" />}
          label="Stock"
          value={COMPOUND.remaining}
        />
      </div>
      <DeleteRow />
    </Frame>
  )
}

/* -------------------------------------------------------- 3 · tile grid */

const TILES = [
  { icon: <PencilSimple className="h-5 w-5" />, label: "Log" },
  { icon: <Prohibit className="h-5 w-5" />, label: "Skip" },
  { icon: <Pause className="h-5 w-5" />, label: "Pause" },
  { icon: <CalendarDot className="h-5 w-5" />, label: "Edit" },
]

function P3() {
  return (
    <Frame>
      <Head />
      <div className="grid grid-cols-4 gap-2">
        {TILES.map((t) => (
          <button
            key={t.label}
            type="button"
            className="flex flex-col items-center gap-1.5 rounded-xl bg-bg-surface-raised py-3 text-text-muted"
          >
            {t.icon}
            <span className="text-[11px] text-foreground">{t.label}</span>
          </button>
        ))}
      </div>
      <div>
        <RowAction
          icon={<Package className="h-4 w-4" />}
          label="Stock"
          value={COMPOUND.remaining}
        />
        <RowAction
          icon={<CalendarDot className="h-4 w-4" />}
          label="Next"
          value="Tue 12"
        />
      </div>
      <DeleteRow />
    </Frame>
  )
}

/* ------------------------------------------------ 4 · readout leads, actions last */

function P4() {
  return (
    <Frame>
      <Head />
      <div>
        {[
          { label: "Schedule", value: `${COMPOUND.cadence} · ${COMPOUND.time}` },
          { label: "Started", value: COMPOUND.started },
          { label: "Next", value: COMPOUND.next },
          { label: "Stock", value: `${COMPOUND.remaining} left` },
        ].map((r) => (
          <div
            key={r.label}
            className="hairline-t flex min-h-11 items-center justify-between gap-3 border-border-default"
          >
            <span className="text-sm text-text-muted">{r.label}</span>
            <span className={cn(DATA_MONO, "text-foreground")}>{r.value}</span>
          </div>
        ))}
      </div>
      {/* Actions as one quiet row of text buttons: the sheet is a READOUT first
          and a menu second. */}
      <div className="flex flex-wrap gap-2">
        {["Log", "Skip", "Edit", "Pause", "Stock"].map((a) => (
          <button
            key={a}
            type="button"
            className="rounded-full bg-bg-surface-raised px-3.5 py-2 text-sm text-foreground"
          >
            {a}
          </button>
        ))}
      </div>
      <DeleteRow />
    </Frame>
  )
}

/* ---------------------------------------------------- 5 · two tiers, outlined */

function P5() {
  return (
    <Frame>
      <Head />
      <Readout />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="rounded-xl border border-border-strong py-3 text-sm font-medium text-foreground"
        >
          Log this dose
        </button>
        <button
          type="button"
          className="rounded-xl border border-border-strong py-3 text-sm font-medium text-foreground"
        >
          Skip
        </button>
      </div>
      <div>
        <RowAction
          icon={<CalendarDot className="h-4 w-4" />}
          label="Edit dose & schedule"
          value={COMPOUND.cadence}
        />
        <RowAction icon={<Pause className="h-4 w-4" />} label="Pause" />
        <RowAction
          icon={<Package className="h-4 w-4" />}
          label="Stock"
          value={COMPOUND.remaining}
        />
      </div>
      <DeleteRow />
    </Frame>
  )
}

/* -------------------------------------- 6 · art on the left, everything railed */

function P6() {
  return (
    <Frame>
      {/* The container gets its own column and the whole sheet rails off it, so
          the artwork is doing structural work rather than sitting on top. */}
      <div className="flex gap-5">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <Art size={84} />
          <span className={cn(DATA_MONO, "text-center")}>
            {COMPOUND.remaining}
            <br />
            left
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className={CARD_EYEBROW}>Anabolics · IM</p>
          <p className="mt-0.5 text-lg leading-tight font-medium text-foreground">
            {COMPOUND.name}
          </p>
          <p className="mt-0.5 font-mono text-sm tabular-nums text-text-muted">
            {COMPOUND.dose} · {COMPOUND.cadence}
          </p>
          <div className="mt-3">
            <RowAction icon={<PencilSimple className="h-4 w-4" />} label="Log" />
            <RowAction icon={<Prohibit className="h-4 w-4" />} label="Skip" />
          </div>
        </div>
      </div>
      <div>
        <RowAction
          icon={<CalendarDot className="h-4 w-4" />}
          label="Edit dose & schedule"
          value={COMPOUND.cadence}
        />
        <RowAction icon={<Pause className="h-4 w-4" />} label="Pause" />
        <RowAction
          icon={<Package className="h-4 w-4" />}
          label="Stock"
          value={COMPOUND.remaining}
        />
      </div>
      <DeleteRow />
    </Frame>
  )
}

const PROPOSALS = [
  { key: "1", title: "1 · Equal rows, no favourite", node: <P1 /> },
  { key: "2", title: "2 · One filled button, rest quiet", node: <P2 /> },
  { key: "3", title: "3 · Tiles on top, rows below", node: <P3 /> },
  { key: "4", title: "4 · A readout first, actions last", node: <P4 /> },
  { key: "5", title: "5 · Two outlined, then rows", node: <P5 /> },
  { key: "6", title: "6 · Art as a column, everything rails off it", node: <P6 /> },
]

export function DetailProposals() {
  const [only, setOnly] = useState<string | null>(null)
  const shown = only ? PROPOSALS.filter((p) => p.key === only) : PROPOSALS

  return (
    <main className="mx-auto w-full max-w-md space-y-6 px-5 pt-4 pb-16">
      <header className="space-y-1">
        <h1 className="text-[2rem] leading-[1.1] font-light tracking-[-0.02em] text-foreground">
          Compound sheet
        </h1>
        <p className="text-sm text-text-muted">
          Six layouts, static. Alter dose and Schedule are one button in all of
          them, and so are Add stock and Correct remaining.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOnly(null)}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm",
            only === null
              ? "bg-accent-primary text-bg-base"
              : "bg-bg-surface-raised text-text-muted"
          )}
        >
          All
        </button>
        {PROPOSALS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setOnly(p.key)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm",
              only === p.key
                ? "bg-accent-primary text-bg-base"
                : "bg-bg-surface-raised text-text-muted"
            )}
          >
            {p.key}
          </button>
        ))}
      </div>

      {shown.map((p) => (
        <section key={p.key} className="space-y-2">
          <h2 className={CARD_EYEBROW}>{p.title}</h2>
          {p.node}
        </section>
      ))}
    </main>
  )
}
