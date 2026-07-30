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
 * Rows before the grid starts scrolling with a sticky day header.
 *
 * Eight rows plus the header and the key is roughly half a phone viewport; past
 * that the grid pushes the Cycles section off-screen entirely and the page stops
 * reading as one scroll.
 */
export const SCHEDULE_SCROLL_AFTER_ROWS = 8

const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"]

/** What a single day/compound cell is showing. */
type CellState = "none" | "due" | "logged" | "missed"

/**
 * The week at a glance: days across, compounds down, grouped by category.
 *
 * **Display only** — the whole page is for viewing and editing, and logging
 * needs a selected date, which Protocol does not have. Tapping a cell here would
 * have to assume today, which is exactly the bug Spec 01 exists to remove.
 *
 * A due dose becomes MISSED at the end of its scheduled day, so today's
 * outstanding doses read as due (not missed) right up until midnight.
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
  const rowCount = compounds.length
  const scrolls = rowCount > SCHEDULE_SCROLL_AFTER_ROWS

  if (rowCount === 0) return null

  return (
    <section className="rounded-2xl bg-bg-surface p-5">
      <h2 className={CARD_EYEBROW}>Schedule</h2>

      <div
        className={cn(
          "mt-4",
          // Past the threshold the grid scrolls inside itself with the day header
          // pinned, rather than growing without bound and pushing Cycles away.
          scrolls && "max-h-[19rem] overflow-y-auto"
        )}
      >
        <table className="w-full border-separate border-spacing-0">
          <thead className={cn(scrolls && "sticky top-0 z-10 bg-bg-surface")}>
            <tr>
              <th className="w-[42%]" />
              {weekDays.map((d, i) => (
                <th
                  key={d.toISOString()}
                  scope="col"
                  className="pb-2 text-center text-[10px] font-medium uppercase tracking-wide text-text-subtle"
                >
                  {DAY_INITIALS[i]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <CategoryRows
                key={g.cat}
                group={g}
                weekDays={weekDays}
                logs={logs}
                todayKey={todayKey}
              />
            ))}
          </tbody>
        </table>
      </div>

      <Key />
    </section>
  )
}

function CategoryRows({
  group,
  weekDays,
  logs,
  todayKey,
}: {
  group: Group
  weekDays: Date[]
  logs: DayLogs
  todayKey: string
}) {
  const meta = CATEGORY_META[group.cat as CompoundCategory] ?? FALLBACK_CATEGORY_META
  return (
    <>
      <tr>
        {/* The category label, in that category's own colour — a divider between
            groups rather than a nested box. */}
        <td colSpan={8} className="pt-3 pb-1">
          <span
            className={cn(
              "text-[10px] font-medium uppercase tracking-[0.14em]",
              meta.tint
            )}
          >
            {meta.label}
          </span>
        </td>
      </tr>
      {group.compounds.map((c) => (
        <tr key={c.id}>
          <td className="py-1 pr-2">
            <span className="block truncate text-xs text-text-muted">{c.name}</span>
          </td>
          {weekDays.map((d) => (
            <td key={d.toISOString()} className="px-0.5 py-1">
              <Cell state={cellState(c, d, logs, todayKey)} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

function Cell({ state }: { state: CellState }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mx-auto block h-4 w-full max-w-6 rounded-[3px]",
        state === "none" && "bg-bg-base",
        state === "due" && "bg-border-strong",
        state === "logged" && "bg-accent-primary",
        // Hollow with a thin border — deliberately NOT a diagonal slash.
        state === "missed" && "border border-border-strong"
      )}
    />
  )
}

/** The key, mirroring the injection-site rotation key: swatch + label, inline. */
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
          <span
            aria-hidden
            className={cn(
              "h-2.5 w-2.5 rounded-[2px]",
              i.state === "none" && "bg-bg-base",
              i.state === "due" && "bg-border-strong",
              i.state === "logged" && "bg-accent-primary",
              i.state === "missed" && "border border-border-strong"
            )}
          />
          <span className="text-[10px] text-text-muted">{i.label}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * A cell's state, judged by the rule in force ON THAT DAY (`isDueOnFor`), so a
 * schedule changed since does not restate the past.
 *
 * A due-but-unlogged day only becomes MISSED once the day is over — today's
 * outstanding doses are still due, not failures.
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
