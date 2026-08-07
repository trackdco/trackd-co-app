"use client"

import { useState } from "react"

import { PauseSheet } from "@/components/home/PauseSheet"
import { Pause } from "@/components/icons"
import { cn } from "@/lib/utils"
import { CARD_EYEBROW, DATA_MONO } from "@/lib/ui-presets"
import { formatDateKeyShort, type StackCompound } from "@/lib/home/stack"
import { resumeLabel } from "@/lib/home/pauses"
import { toDateKey } from "@/lib/home/mockHomeData"

/**
 * Review harness for the Pause sheet as BUILT (Spec w2b-13, Step 6).
 *
 * It renders the real `PauseSheet`, not a mock-up, so what is judged here is
 * what ships. The four competing layouts this page used to show are in git
 * history; Adrian chose the ledger (proposal B) with the compound's container in
 * the header, 2026-08-07.
 *
 * Nothing WRITES: the seeded compounds live under a throwaway user id and the
 * callbacks only log to the panel at the bottom.
 */

const shift = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return toDateKey(d)
}

const base = (
  id: string,
  name: string,
  category: StackCompound["category"],
  method: StackCompound["method"],
  dose: number,
  unit: string
): StackCompound => ({
  id,
  name,
  category,
  method,
  dose,
  unit,
  schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-01-01" },
  rotationSites: [],
  rotationIndex: 0,
})

/** One per container form, so the header artwork can be checked on all three. */
const VIAL = base("p-test", "Testosterone E", "anabolic", "im", 250, "mg")
const BOTTLE: StackCompound = {
  ...base("p-nac", "NAC", "supplement", "po", 600, "mg"),
  inventoryForm: "oral_solid",
}
const TUB: StackCompound = {
  ...base("p-creatine", "Creatine Monohydrate", "supplement", "po", 5, "g"),
  inventoryForm: "bulk_powder",
}
/** Already paused, so the sheet's OTHER branch can be seen. */
const PAUSED: StackCompound = {
  ...base("p-bpc", "BPC-157", "peptide", "subq", 250, "mcg"),
  inventoryForm: "reconstituted",
  pauses: [{ id: "pp", startedOn: shift(-3), endsOn: shift(10) }],
}
/** In a stack, so the whole-stack row appears. */
const STACK_MATES = [
  base("p-tb", "TB-500", "peptide", "subq", 2, "mg"),
  base("p-ipa", "Ipamorelin", "peptide", "subq", 200, "mcg"),
]

/**
 * A paused compound whose STACK MATES are paused too, on deliberately DIFFERENT
 * stretches — one sharing its group, one paused separately and indefinitely.
 *
 * This is the only fixture that reaches the resume branch's whole-stack row:
 * that row needs at least one mate paused right now, and `PAUSED` above has no
 * mates at all, so the section could not be previewed (Adrian, 2026-08-07).
 * The mismatched dates are the point — the rule is that anyone paused NOW can be
 * resumed together, whatever pause they happen to be on.
 */
const PAUSED_STACK: StackCompound = {
  ...base("p-tren", "Trenbolone A", "anabolic", "im", 100, "mg"),
  pauses: [{ id: "ps1", startedOn: shift(-5), endsOn: shift(9), groupId: "g1" }],
}
const PAUSED_MATES: StackCompound[] = [
  {
    ...base("p-mast", "Masteron E", "anabolic", "im", 200, "mg"),
    // Same action, same group — resumes alongside by default.
    pauses: [{ id: "ps2", startedOn: shift(-5), endsOn: shift(9), groupId: "g1" }],
  },
  {
    ...base("p-anas", "Anastrozole", "ancillary", "po", 0.5, "mg"),
    inventoryForm: "oral_solid",
    // Paused SEPARATELY and indefinitely. Still tickable.
    pauses: [{ id: "ps3", startedOn: shift(-12), endsOn: null }],
  },
  {
    ...base("p-hcg", "HCG", "peptide", "subq", 500, "iu"),
    inventoryForm: "reconstituted",
    // NOT paused — must not appear in the resume list at all.
  },
]

const OPENERS: { compound: StackCompound; note: string; mates?: StackCompound[] }[] = [
  { compound: VIAL, note: "A vial. In a stack, so the whole-stack row shows.", mates: STACK_MATES },
  { compound: BOTTLE, note: "A bottle. No stack, so no whole-stack row." },
  { compound: TUB, note: "A tub." },
  { compound: PAUSED, note: "ALREADY paused. Opens on the edit/resume branch." },
  {
    compound: PAUSED_STACK,
    note: "Paused, in a stack with 2 of 3 mates also paused on different stretches. Shows 'Resume the whole stack'.",
    mates: PAUSED_MATES,
  },
]

/** The paused row exactly as the dashboard renders it. */
function PausedRow({ compound }: { compound: StackCompound }) {
  const today = toDateKey(new Date())
  return (
    <div className="flex items-center gap-3 py-2 opacity-50">
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-muted"
      >
        <Pause className="h-3 w-3" weight="fill" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {compound.name}
      </span>
      <span className={cn(DATA_MONO, "shrink-0")}>
        {resumeLabel(compound.pauses, today, formatDateKeyShort) ?? "Indefinite"}
      </span>
    </div>
  )
}

/** Same row at several distances out, to check the date/countdown crossover. */
const CROSSOVER: { label: string; days: number | null }[] = [
  { label: "Back in 30 days", days: 30 },
  { label: "Back in 8 days", days: 8 },
  { label: "Back in 7 days", days: 7 },
  { label: "Back in 2 days", days: 2 },
  { label: "Back tomorrow", days: 1 },
  { label: "Indefinite", days: null },
]

export function PauseProposals() {
  const [target, setTarget] = useState<StackCompound | null>(null)
  const [mates, setMates] = useState<StackCompound[]>([])
  const [log, setLog] = useState<string[]>([])
  const today = toDateKey(new Date())

  return (
    <main className="mx-auto w-full max-w-md space-y-6 px-5 pt-4 pb-16">
      <header className="space-y-1">
        <h1 className="text-[2rem] leading-[1.1] font-light tracking-[-0.02em] text-foreground">
          Pause
        </h1>
        <p className="text-sm text-text-muted">
          The real sheet, not a mock-up. Nothing here writes anything.
        </p>
      </header>

      <section className="space-y-3 rounded-2xl bg-bg-surface p-5">
        <h2 className={CARD_EYEBROW}>Open the sheet</h2>
        <div className="space-y-2">
          {OPENERS.map((o) => (
            <button
              key={o.compound.id}
              type="button"
              onClick={() => {
                setTarget(o.compound)
                setMates(o.mates ?? [])
              }}
              className="w-full rounded-xl bg-bg-surface-raised px-4 py-3 text-left"
            >
              <span className="block text-sm font-medium text-foreground">
                {o.compound.name}
              </span>
              <span className="mt-0.5 block text-xs text-text-muted">{o.note}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl bg-bg-surface p-5">
        <h2 className={CARD_EYEBROW}>The paused row · date to countdown</h2>
        {/* The crossover is a week: a date while the return is far off, a
            countdown once it is close. */}
        {CROSSOVER.map((c) => (
          <PausedRow
            key={c.label}
            compound={{
              ...BOTTLE,
              name: c.label,
              pauses: [
                {
                  id: `x-${c.days}`,
                  startedOn: shift(-1),
                  endsOn: c.days === null ? null : shift(c.days - 1),
                },
              ],
            }}
          />
        ))}
      </section>

      {log.length > 0 && (
        <section className="space-y-2 rounded-2xl bg-bg-surface p-5">
          <h2 className={CARD_EYEBROW}>What it would have written</h2>
          {log.map((l, i) => (
            <p key={i} className={DATA_MONO}>
              {l}
            </p>
          ))}
        </section>
      )}

      <PauseSheet
        open={target !== null}
        onOpenChange={(o) => {
          if (!o) setTarget(null)
        }}
        compound={target}
        todayKey={today}
        stackMembers={mates}
        onPause={(ids, range) =>
          setLog((p) => [
            `pause ${ids.length} · ${range.startedOn} → ${range.endsOn ?? "indefinite"}`,
            ...p,
          ])
        }
        onResume={(c, on) => setLog((p) => [`resume ${c.name} on ${on}`, ...p])}
      />
    </main>
  )
}
