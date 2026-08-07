"use client"

import { useEffect, useState } from "react"

import { AddStockSheet } from "@/components/protocol/AddStockSheet"
import { StockAddedCard } from "@/components/protocol/StockAddedCard"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Container } from "@/components/containers"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { saveStack, type StackCompound } from "@/lib/home/stack"
import { CARD_EYEBROW, DATA_MONO, PAGE_TITLE } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

/**
 * A throwaway user id, so this harness cannot touch a real signed-in user's
 * device store. Everything it writes lives under this key alone.
 */
const PREVIEW_USER = "preview-stock"

/** One per container form, plus a part-used vial — the case that proves the
 *  card lands on the REAL level rather than always filling to the brim. */
const MOMENTS: Omit<
  React.ComponentProps<typeof StockAddedCard>,
  "onDone"
>[] = [
  {
    compoundName: "Testosterone Enanthate",
    category: "anabolic",
    inventoryType: "preconcentrated",
    fill: 1,
    amountLabel: "10 mL",
  },
  {
    compoundName: "BPC-157",
    category: "peptide",
    inventoryType: "reconstituted",
    fill: 0.5,
    amountLabel: "2 mL",
  },
  {
    compoundName: "NAC",
    category: "supplement",
    inventoryType: "oral_solid",
    fill: 1,
    amountLabel: "120 capsules",
  },
  {
    compoundName: "Creatine Monohydrate",
    category: "supplement",
    inventoryType: "bulk_powder",
    fill: 0.85,
    amountLabel: "300 g",
  },
]

/**
 * Four compounds chosen to hit all four inventory forms and, between them, every
 * behaviour Spec w2b-13 Steps 1-4 changed.
 *
 * `inventoryForm` is what `supabase/protocol/023` stores. It is set explicitly
 * here because that is the whole point of the step: the sheet opens on the
 * compound's OWN form rather than on whatever `TYPES` happens to list first.
 */
const SEED: StackCompound[] = [
  {
    id: "prev-bpc",
    name: "BPC-157",
    category: "peptide",
    method: "subq",
    dose: 250,
    unit: "mcg",
    schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-08-01" },
    rotationSites: [],
    rotationIndex: 0,
    inventoryForm: "reconstituted",
  },
  {
    id: "prev-test",
    name: "Testosterone Enanthate",
    category: "anabolic",
    method: "im",
    dose: 125,
    unit: "mg",
    schedule: { cadence: { type: "everyNDays", n: 3 }, timeOfDay: "09:00", startDate: "2026-08-01" },
    rotationSites: [],
    rotationIndex: 0,
    inventoryForm: "preconcentrated",
  },
  {
    id: "prev-vitd",
    name: "Vitamin D3",
    category: "supplement",
    method: "po",
    dose: 5000,
    unit: "iu",
    schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-08-01" },
    rotationSites: [],
    rotationIndex: 0,
    inventoryForm: "oral_solid",
  },
  {
    id: "prev-creatine",
    name: "Creatine Monohydrate",
    category: "supplement",
    method: "po",
    dose: 5,
    unit: "g",
    schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-08-01" },
    rotationSites: [],
    rotationIndex: 0,
    inventoryForm: "bulk_powder",
  },
]

const WHAT_TO_LOOK_FOR: { compound: string; expect: string }[] = [
  {
    compound: "Creatine Monohydrate",
    expect:
      "Opens on Powder. Asks for a tub weight in grams and an optional serving size. Never mentions BAC water.",
  },
  {
    compound: "Vitamin D3",
    expect:
      "Opens on Oral. Strength is optional and carries an mg / iu toggle, so a 5000 iu tablet can be entered at all.",
  },
  {
    compound: "BPC-157",
    expect: "Opens on Reconstituted — powder and BAC water, exactly as before.",
  },
  {
    compound: "Testosterone Enanthate",
    expect: "Opens on Pre-mixed — volume and mg/mL, exactly as before.",
  },
]

/**
 * Review harness for the add-stock sheet (Spec w2b-13, Steps 1-4). Seeds a
 * throwaway device stack so the sheet can be opened WITHOUT signing in.
 *
 * **Saving will fail here, on purpose.** There is no session, and migrations
 * `014`/`016` are not applied — so `bulk_powder` is not yet a value the database
 * accepts. This harness is for looking at the FORM: which one opens, what it
 * asks for, and what it no longer asks for.
 */
export function StockPreview() {
  const [open, setOpen] = useState(false)
  const [moment, setMoment] = useState<(typeof MOMENTS)[number] | null>(null)
  // Seeding the device store is a write to an EXTERNAL system, which is what an
  // effect is for. It deliberately sets no state: the sheet reads the store
  // through `useSyncExternalStore`, so the seed reaches it without a re-render
  // of this component, and a `ready` flag here would only add a cascading one.
  useEffect(() => {
    saveStack(PREVIEW_USER, SEED)
  }, [])

  return (
    <main className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-24">
      <header className="space-y-1">
        <h1 className={PAGE_TITLE}>Add stock</h1>
        <p className="text-sm text-text-muted">
          Review harness for the four inventory forms. Not a shipping screen.
        </p>
      </header>

      <section className="space-y-3 rounded-2xl bg-bg-surface p-5">
        <h2 className={CARD_EYEBROW}>The seeded compounds</h2>
        <div className="divide-y divide-border-default">
          {SEED.map((c) => (
            <div key={c.id} className="flex items-center gap-4 py-3">
              <Container
                name={c.name}
                inventoryType={inventoryTypeForCompound(c.name, c.method, c.inventoryForm)}
                category={c.category}
                size={44}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{c.name}</p>
                <p className={`${DATA_MONO} truncate`}>{c.inventoryForm}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl bg-bg-surface p-5">
        <h2 className={CARD_EYEBROW}>What to look for</h2>
        <ul className="space-y-2.5">
          {WHAT_TO_LOOK_FOR.map((row) => (
            <li key={row.compound} className="text-sm leading-relaxed text-text-muted">
              <span className="text-foreground">{row.compound}</span> — {row.expect}
            </li>
          ))}
        </ul>
        <p className="text-xs text-text-subtle">
          Switch compound with the picker at the top of the sheet. Saving fails
          here: there is no session, and the migrations are not applied.
        </p>
      </section>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl bg-accent-primary px-4 py-3 text-sm font-medium text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        Open the add-stock sheet
      </button>

      {/* THE MOMENT AFTER A SAVE, on its own.

          It cannot be reached through the sheet above — saving needs a session
          and applied migrations, neither of which a preview has — so the one
          thing worth watching would otherwise be the one thing invisible here
          (Adrian, 2026-08-07). Each button mounts the real card, in the real
          sheet, with the fill it would land on. */}
      <section className="space-y-3 rounded-2xl bg-bg-surface p-5">
        <h2 className={CARD_EYEBROW}>The moment after a save</h2>
        <p className="text-sm text-text-muted">
          The container fills from empty to what was entered, holds half a
          second, then the sheet leaves. Tapping it closes it straight away.
        </p>
        <div className="grid grid-cols-1 gap-2">
          {MOMENTS.map((m) => (
            <button
              key={m.compoundName}
              type="button"
              onClick={() => setMoment(m)}
              className="rounded-xl bg-bg-surface-raised px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-bg-input"
            >
              {m.compoundName}
              <span className={cn(DATA_MONO, "ml-2")}>
                {m.amountLabel} · {Math.round(m.fill * 100)}%
              </span>
            </button>
          ))}
        </div>
      </section>

      <Sheet open={moment !== null} onOpenChange={(o) => !o && setMoment(null)}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl border-border-default bg-bg-surface"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Stock added</SheetTitle>
          </SheetHeader>
          {moment && (
            <StockAddedCard {...moment} onDone={() => setMoment(null)} />
          )}
        </SheetContent>
      </Sheet>

      <AddStockSheet
        open={open}
        onOpenChange={setOpen}
        userId={PREVIEW_USER}
        onAdded={() => setOpen(false)}
      />
    </main>
  )
}
