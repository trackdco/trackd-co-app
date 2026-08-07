"use client"

import { useMemo, useState } from "react"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Container } from "@/components/containers"
import { Input } from "@/components/ui/input"
import { MagnifyingGlass } from "@/components/icons"
import { cn } from "@/lib/utils"
import { DATA_MONO, SHEET_TITLE } from "@/lib/ui-presets"
import { COMPOUNDS } from "@/lib/compounds-catalogue"
import { routesOf } from "@/lib/compound-categories"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { newId } from "@/lib/home/id"
import {
  ONE_OFF_UNITS,
  type OneOffLog,
  type OneOffUnit,
} from "@/lib/home/oneOffLogs"

/** What the picker offers: the bundled catalogue plus the user's own compounds. */
export interface OneOffChoice {
  name: string
  category: string
  method: string
  defaultUnit: string
}

const FIELD =
  "h-11 w-full min-w-0 rounded-xl border border-border-default bg-bg-input px-3 text-base text-foreground shadow-xs outline-none transition-colors [color-scheme:dark] focus-visible:border-border-strong"
const LABEL = "text-xs font-medium uppercase tracking-[0.14em] text-text-muted"

/**
 * Log something you took once, off-plan (Spec w2b-13, Step 8).
 *
 * **You pick from the catalogue** (Adrian, 2026-08-07, over the spec's free-text
 * label). That is what lets a one-off appear in HISTORY properly — the calendar
 * and a block's look-back can draw the right container and name it correctly —
 * while still counting toward nothing, because the reference is to the read-only
 * catalogue and never to a protocol row. Your own "Make your own" compounds are
 * in the list too, so anything genuinely off-catalogue is one custom compound
 * away rather than impossible.
 *
 * It touches NO stock, NO schedule and NO adherence. Not by filters: by having
 * no protocol row to be attached to in the first place.
 */
export function OneOffSheet({
  open,
  onOpenChange,
  todayKey,
  /** The day it lands on. The calendar passes the day being viewed; the FAB
   *  passes today. */
  dateKey,
  customCompounds,
  recents,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  todayKey: string
  dateKey: string
  /** The user's own compounds, so the picker is not limited to the bundle. */
  customCompounds?: OneOffChoice[]
  /** Distinct things logged lately, offered as chips — what makes the second
   *  time two taps. */
  recents?: OneOffLog[]
  onSave: (log: OneOffLog) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl border-border-default bg-bg-surface"
      >
        <SheetHeader>
          <SheetTitle className={SHEET_TITLE}>Log something else</SheetTitle>
        </SheetHeader>
        {open && (
          <OneOffBody
            key={dateKey}
            todayKey={todayKey}
            dateKey={dateKey}
            customCompounds={customCompounds ?? []}
            recents={recents ?? []}
            onSave={onSave}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function OneOffBody({
  todayKey,
  dateKey,
  customCompounds,
  recents,
  onSave,
  onClose,
}: {
  todayKey: string
  dateKey: string
  customCompounds: OneOffChoice[]
  recents: OneOffLog[]
  onSave: (log: OneOffLog) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const [picked, setPicked] = useState<OneOffChoice | null>(null)
  const [amount, setAmount] = useState("")
  const [unit, setUnit] = useState<OneOffUnit>("mg")
  const [time24, setTime24] = useState(() =>
    dateKey === todayKey
      ? new Date().toTimeString().slice(0, 5)
      : ""
  )
  const [note, setNote] = useState("")

  /** The user's own compounds FIRST, then the bundle — yours are the ones you
   *  are most likely to be reaching for. */
  const all: OneOffChoice[] = useMemo(
    () => [
      ...customCompounds,
      ...COMPOUNDS.map((c) => ({
        name: c.name,
        category: c.category as string,
        method: routesOf(c)[0]?.route ?? "po",
        defaultUnit: c.defaultUnit || "mg",
      })),
    ],
    [customCompounds]
  )

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return all.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8)
  }, [all, query])

  function choose(c: OneOffChoice) {
    setPicked(c)
    setQuery("")
    // Pre-fill the unit from the compound's own default, so the common case is
    // already right and the picker is a correction rather than a step.
    if ((ONE_OFF_UNITS as readonly string[]).includes(c.defaultUnit)) {
      setUnit(c.defaultUnit as OneOffUnit)
    }
  }

  const pill = (active: boolean) =>
    cn(
      "rounded-full px-3 py-1.5 text-sm transition-colors",
      active
        ? "bg-accent-primary text-bg-base"
        : "bg-bg-surface-raised text-text-muted hover:text-foreground"
    )

  return (
    <div className="space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
      {picked ? (
        <div className="flex items-center gap-3">
          <Container
            name={picked.name}
            inventoryType={inventoryTypeForCompound(picked.name, picked.method)}
            category={picked.category}
            size={44}
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {picked.name}
            </p>
            <p className={DATA_MONO}>
              {dateKey === todayKey ? "Today" : dateKey}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="shrink-0 text-xs font-medium text-text-muted hover:text-foreground"
          >
            Change
          </button>
        </div>
      ) : (
        <>
          {/* Recents first: the second time you log the same thing should be two
              taps, and this is the whole reason a one-off can stay frictionless
              while still being picked from a list. */}
          {recents.length > 0 && (
            <div className="space-y-2">
              <span className={LABEL}>Recent</span>
              <div className="flex flex-wrap gap-2">
                {recents.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() =>
                      choose({
                        name: r.compoundName ?? r.label,
                        category: r.category ?? "supplement",
                        method: r.method ?? "po",
                        defaultUnit: r.unit ?? "mg",
                      })
                    }
                    className={pill(false)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="block space-y-1.5">
            <span className={LABEL}>What did you take?</span>
            <div className="relative">
              <MagnifyingGlass
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-subtle"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your compounds"
                className={cn(FIELD, "pl-9")}
              />
            </div>
          </label>

          {results.length > 0 && (
            <div className="overflow-hidden rounded-2xl bg-bg-surface-raised">
              {results.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => choose(c)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-bg-input/50"
                >
                  <Container
                    name={c.name}
                    inventoryType={inventoryTypeForCompound(c.name, c.method)}
                    category={c.category}
                    size={28}
                    className="shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {c.name}
                  </span>
                </button>
              ))}
            </div>
          )}

          {query.trim() !== "" && results.length === 0 && (
            <p className="rounded-2xl bg-bg-surface-raised px-4 py-5 text-center text-sm text-text-muted">
              Nothing by that name. Make it a compound first, then log it here.
            </p>
          )}
        </>
      )}

      {picked && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className={LABEL}>How much</span>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                placeholder="Optional"
                className={FIELD}
              />
            </label>
            <label className="block space-y-1.5">
              <span className={LABEL}>Time</span>
              <Input
                type="time"
                value={time24}
                onChange={(e) => setTime24(e.target.value)}
                className={cn(FIELD, "font-mono")}
              />
            </label>
          </div>

          <div className="space-y-2">
            <span className={LABEL}>Unit</span>
            <div className="flex flex-wrap gap-2">
              {ONE_OFF_UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={pill(unit === u)}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className={LABEL}>Note</span>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
              className={FIELD}
            />
          </label>

          <p className="text-xs leading-relaxed text-text-subtle">
            This is recorded on its own. It does not affect your stock, your
            schedule or your consistency.
          </p>

          <button
            type="button"
            onClick={() => {
              onSave({
                // RANDOM, and generated once here rather than per push attempt —
                // see `OneOffLog.id`. Two of the same thing on the same day must
                // both survive.
                id: newId(),
                label: picked.name,
                compoundName: picked.name,
                category: picked.category,
                method: picked.method,
                ...(amount.trim() ? { amount: amount.trim() } : {}),
                unit,
                loggedFor: dateKey,
                time24,
                ...(note.trim() ? { note: note.trim() } : {}),
              })
              onClose()
            }}
            className="w-full rounded-xl bg-accent-primary px-4 py-3 text-sm font-medium text-bg-base transition-opacity hover:opacity-90"
          >
            Log it
          </button>
        </>
      )}
    </div>
  )
}
