"use client"

import { cn } from "@/lib/utils"
import { CARD_EYEBROW } from "@/lib/ui-presets"
import {
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
  type CompoundCategory,
} from "@/lib/compound-categories"
import { isDueOnFor, type StackCompound } from "@/lib/home/stack"
import type { DayLogs } from "@/lib/home/doseLog"
import { toDateKey } from "@/lib/home/mockHomeData"

/**
 * Rows before the list starts scrolling with a sticky day header.
 *
 * Eight rows plus the header and the key is roughly half a phone viewport; past
 * that it pushes the Cycles section off-screen and the page stops reading as one
 * scroll.
 */
export const SCHEDULE_SCROLL_AFTER_ROWS = 8

const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"]

/** What a single day/compound mark is showing. */
type CellState = "none" | "due" | "logged" | "missed"

/**
 * The week at a glance: one row per compound, seven marks across, grouped by
 * category.
 *
 * Deliberately **not a table** (Adrian's call) — a grid of cells read as a
 * spreadsheet. These are the same status DOTS the week strip already uses, so
 * the section reads as part of the app rather than a data export.
 *
 * **Display only.** The page has no selected date, so a tap here would have to
 * assume today — exactly the bug Spec 01 exists to remove.
 *
 * A due dose becomes MISSED only at the end of its scheduled day, so today's
 * outstanding doses read as due right up until midnight.
 */
export function ScheduleGrid({
  compounds,
  logs,
  todayKey,
  weekDays,
}: {
  compounds: StackCompound[]
  logs: DayLogs
  todayKey: string
  /** The seven dates of the week being shown, Monday first. */
  weekDays: Date[]
}) {
  const groups = groupByCategory(compounds)
  const scrolls = compounds.length > SCHEDULE_SCROLL_AFTER_ROWS

  if (compounds.length === 0) return null

  return (
    <section className="rounded-2xl bg-bg-surface p-5">
      <h2 className={CARD_EYEBROW}>Schedule</h2>

      {/* Day header — aligned to the same 7-column track the rows use. */}
      <div className="mt-4 flex items-center gap-3">
        <span className="w-[38%] shrink-0" />
        <div className="grid flex-1 grid-cols-7 gap-1">
          {weekDays.map((d, i) => (
            <span
              key={d.toISOString()}
              className={cn(
                "text-center text-[10px] font-medium uppercase tracking-wide",
                toDateKey(d) === todayKey ? "text-text-muted" : "text-text-subtle"
              )}
            >
              {DAY_INITIALS[i]}
            </span>
          ))}
        </div>
      </div>

      <div className={cn("mt-2", scrolls && "max-h-64 overflow-y-auto")}>
        {groups.map((g) => {
          const meta =
            CATEGORY_META[g.cat as CompoundCategory] ?? FALLBACK_CATEGORY_META
          return (
            <div key={g.cat} className="mt-3 first:mt-0">
              <span
                className={cn(
                  "block px-0.5 pb-1 text-[10px] font-medium uppercase tracking-[0.14em]",
                  meta.tint
                )}
              >
                {meta.label}
              </span>
              {g.compounds.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-1.5">
                  <span className="w-[38%] shrink-0 truncate text-xs text-text-muted">
                    {c.name}
                  </span>
                  <div className="grid flex-1 grid-cols-7 gap-1">
                    {weekDays.map((d) => (
                      <Mark
                        key={d.toISOString()}
                        state={cellState(c, d, logs, todayKey)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <Key />
    </section>
  )
}

/** Logged is a filled white dot, due a hollow ring, missed a fainter ring, and a
 *  day with nothing due is a bare tick of a dot so the row still reads as seven. */
function Mark({ state }: { state: CellState }) {
  return (
    <span className="flex h-5 items-center justify-center" aria-hidden>
      <span
        className={cn(
          "rounded-full",
          state === "logged" && "h-2.5 w-2.5 bg-accent-primary",
          state === "due" && "h-2.5 w-2.5 border border-text-muted",
          // Missed is hollow with a thin border — never a slash.
          state === "missed" && "h-2.5 w-2.5 border border-border-strong",
          state === "none" && "h-1 w-1 bg-border-default"
        )}
      />
    </span>
  )
}

/** The key, following the injection-site rotation key's pattern. */
function Key() {
  const items: { state: CellState; label: string }[] = [
    { state: "logged", label: "Logged" },
    { state: "due", label: "Due" },
    { state: "missed", label: "Missed" },
    { state: "none", label: "Nothing due" },
  ]
  return (
    <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 hairline-t pt-3">
      {items.map((i) => (
        <li key={i.state} className="flex items-center gap-1.5">
          <Mark state={i.state} />
          <span className="text-[10px] text-text-muted">{i.label}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * A mark's state, judged by the rule in force ON THAT DAY (`isDueOnFor`), so a
 * schedule changed since does not restate the past.
 */
function cellState(
  c: StackCompound,
  date: Date,
  logs: DayLogs,
  todayKey: string
): CellState {
  const key = toDateKey(date)
  if (!isDueOnFor(c, date)) return "none"
  if (logs[key]?.[c.id]) return "logged"
  return key < todayKey ? "missed" : "due"
}

interface Group {
  cat: string
  compounds: StackCompound[]
}

const CATEGORY_ORDER = Object.keys(CATEGORY_META) as CompoundCategory[]

function groupByCategory(items: StackCompound[]): Group[] {
  const byCat = new Map<string, StackCompound[]>()
  for (const c of items) {
    const arr = byCat.get(c.category)
    if (arr) arr.push(c)
    else byCat.set(c.category, [c])
  }
  const rank = (c: string) => {
    const i = CATEGORY_ORDER.indexOf(c as CompoundCategory)
    return i < 0 ? CATEGORY_ORDER.length : i
  }
  return [...byCat.keys()]
    .sort((a, b) => rank(a) - rank(b))
    .map((cat) => ({
      cat,
      compounds: [...byCat.get(cat)!].sort((a, b) => a.name.localeCompare(b.name)),
    }))
}
