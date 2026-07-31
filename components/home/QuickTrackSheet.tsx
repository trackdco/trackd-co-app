"use client"

import { useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { Check } from "@/components/icons"

import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  CATEGORY_DISPLAY_ORDER,
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
  type CompoundCategory,
} from "@/lib/compound-categories"
import { SHEET_TITLE } from "@/lib/ui-presets"
import { CategoryIcon } from "@/components/compounds/CategoryIcon"
import { LogDoseSheet } from "@/components/home/LogDoseSheet"
import type { BodySex } from "@/lib/db/types"
import {
  formatTimeLabel,
  getStackSnapshot,
  isDueOnFor,
  subscribeStack,
  type StackCompound,
} from "@/lib/home/stack"
import {
  getDoseLogsSnapshot,
  commitDoseOn,
  subscribeDoseLogs,
  unlogDose,
  type DayLogs,
} from "@/lib/home/doseLog"
import { dateKeyToDate, toDateKey, type DoseLog } from "@/lib/home/mockHomeData"
import {
  getSelectedDayOrToday,
  subscribeSelectedDay,
} from "@/lib/home/selectedDay"

// Stable references for useSyncExternalStore's server snapshot.
const EMPTY_STACK: StackCompound[] = []
const EMPTY_LOGS: DayLogs = {}

function fmtDose(d: number): string {
  return Number.isInteger(d) ? String(d) : d.toFixed(2).replace(/0$/, "")
}

// Stable category display order (the order they're declared in the meta) — the
// same grouping the dashboard's Today's Log uses.
// The order is deliberate and shared, NOT the object's key order — see
// `CATEGORY_DISPLAY_ORDER`. Sorting by key order put orals and SARMs above
// peptides and supplements above stimulants, which nobody chose.
const CATEGORY_ORDER = CATEGORY_DISPLAY_ORDER

interface DoseGroup {
  cat: string
  label: string
  items: StackCompound[]
}

/** Group the day's compounds by category (A6) — categories in their declared
 *  order (unknowns last); within each, sorted by scheduled time. */
function groupByCategory(items: StackCompound[]): DoseGroup[] {
  const byCat = new Map<string, StackCompound[]>()
  for (const c of items) {
    const arr = byCat.get(c.category)
    if (arr) arr.push(c)
    else byCat.set(c.category, [c])
  }
  const rank = (cat: string) => {
    const i = CATEGORY_ORDER.indexOf(cat as CompoundCategory)
    return i < 0 ? CATEGORY_ORDER.length : i
  }
  return [...byCat.keys()]
    // The name tiebreak is not cosmetic. Every UNRECOGNISED category ties at
    // rank = CATEGORY_ORDER.length, and without it the order falls through to
    // Map insertion order, i.e. whatever order the compounds happened to
    // arrive. Two of the five grouping sites already sorted by name, so the
    // same two compounds sat in one order here and the opposite order under a
    // photo. Ranked first, named second, everywhere.
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((cat) => {
      const meta = CATEGORY_META[cat as CompoundCategory] ?? FALLBACK_CATEGORY_META
      return {
        cat,
        label: meta.label,
        items: [...byCat.get(cat)!].sort((x, y) =>
          x.schedule.timeOfDay.localeCompare(y.schedule.timeOfDay)
        ),
      }
    })
}

/**
 * The "What would you like to track?" quick-log popup the plus-menu "Log a dose"
 * opens — the same logging flow as the dashboard's Today's Log, in place. Each due
 * compound is a tick-off row: tapping an empty tick (or the name) opens the SAME
 * Log sheet as the home screen (confirm/edit the amount, time and site → Track),
 * and tapping a filled tick un-logs it (the tick goes blank), exactly like the
 * dashboard.
 */
export function QuickTrackSheet({
  open,
  onOpenChange,
  userId,
  bodySex,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  /** Which figure the log-dose body map draws (from the user's profile). */
  bodySex: BodySex
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // No auto-focus — this sheet is tap-only, so don't raise the keypad.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl border-border-default bg-bg-surface"
      >
        <SheetHeader>
          <SheetTitle className={SHEET_TITLE}>
            What would you like to track?
          </SheetTitle>
        </SheetHeader>
        <SheetDescription className="sr-only">
          Tap a compound to log it, or tap a logged tick to undo it.
        </SheetDescription>
        {open && (
          <QuickTrackBody
            userId={userId}
            bodySex={bodySex}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

interface LogTarget {
  compound: StackCompound
  existing: DoseLog | null
}

function QuickTrackBody({
  userId,
  bodySex,
  onClose,
}: {
  userId: string
  bodySex: BodySex
  onClose: () => void
}) {
  const stack = useSyncExternalStore(
    subscribeStack,
    () => getStackSnapshot(userId, EMPTY_STACK),
    () => EMPTY_STACK
  )
  const logs = useSyncExternalStore(
    subscribeDoseLogs,
    () => getDoseLogsSnapshot(userId),
    () => EMPTY_LOGS
  )

  // "Today" captured once from the device clock when the sheet opens.
  const [todayKey] = useState(() => toDateKey(new Date()))

  // The day this sheet WRITES to. The FAB is rendered by the (app) shell, so it
  // has no date context of its own — but the dashboard's week strip publishes
  // the day it is parked on, and a dose must land on the day the user is looking
  // at, not on today (Spec 01 → "the logging action uses the passed date; it must
  // never fall back to 'now' when a date was supplied"). With no screen owning a
  // selection (any tab other than the dashboard) this resolves to today, which is
  // the correct default — not a fallback that overrides a supplied day.
  const targetKey = useSyncExternalStore(
    subscribeSelectedDay,
    () => getSelectedDayOrToday(todayKey),
    () => todayKey
  )
  const targetDate = dateKeyToDate(targetKey)
  const targetLogs = logs[targetKey] ?? {}

  // The day's list: due compounds, plus anything already logged that day (kept
  // even if since archived). Same selection rule as the dashboard's Today's Log.
  const dueCompounds = stack.filter((c) =>
    targetLogs[c.id] ? true : !c.archived && isDueOnFor(c, targetDate)
  )

  const [logTarget, setLogTarget] = useState<LogTarget | null>(null)

  // Days since each site was last used — the Log sheet's "last used here" rest hint.
  // INCLUDES today's OTHER doses (so a site another compound already used today reads
  // "used today"; you can still log two compounds into one muscle — this just tells
  // you), but leaves out the dose being logged right now (the active compound's own
  // log) so it never counts itself. Same computation as the dashboard.
  const activeLogCompoundId = logTarget?.compound.id
  const targetN = Math.floor(targetDate.getTime() / 86_400_000)
  const siteLastUsedDays: Record<string, number> = {}
  for (const [key, dayLogObj] of Object.entries(logs)) {
    if (key > targetKey) continue
    const ago = targetN - Math.floor(dateKeyToDate(key).getTime() / 86_400_000)
    if (ago < 0) continue
    for (const [compoundId, dayLog] of Object.entries(dayLogObj)) {
      if (key === targetKey && compoundId === activeLogCompoundId) continue
      const sid = dayLog.siteId
      if (sid && (siteLastUsedDays[sid] === undefined || ago < siteLastUsedDays[sid])) {
        siteLastUsedDays[sid] = ago
      }
    }
  }

  function openLog(c: StackCompound) {
    setLogTarget({ compound: c, existing: targetLogs[c.id] ?? null })
  }

  // Commit a dose (fresh or edited) — the exact same handler the dashboard uses,
  // writing to the day the user is parked on rather than to the clock.
  //
  // FOUR parameters, not two. It took two, and TypeScript accepts that (a
  // shorter function is assignable to a longer signature), so the day the user
  // had just edited in the Date row was dropped on the floor: the sheet showed
  // the new date, the tick fired normally, and the dose landed on the day the
  // sheet was opened on. On the fastest logging path in the app.
  function handleTracked(
    compoundId: string,
    log: DoseLog,
    landsOn: string,
    openedOn: string
  ) {
    commitDoseOn(userId, compoundId, log, landsOn, openedOn)
  }
  /** The day the SHEET is showing, not this screen's live target — see Home. */
  function handleRemove(compoundId: string, dateKey: string) {
    unlogDose(userId, dateKey, compoundId)
  }

  return (
    <>
      <div className="px-4">
        {dueCompounds.length === 0 ? (
          // A dead end on a cold start: the user came here to log a dose and the
          // only control was "Done". Empty copy states the fact AND the next
          // action (ui-context.md → Voice), so the way forward is on the screen
          // rather than back out through the menu they just used.
          <div className="rounded-2xl bg-bg-surface-raised px-4 py-8 text-center">
            <p className="text-sm text-text-muted">Nothing scheduled for today.</p>
            <Link
              href="/protocol"
              className="mt-2 inline-block text-sm text-foreground underline decoration-dotted underline-offset-4"
            >
              Add a compound
            </Link>
          </div>
        ) : (
          // Grouped by category, like the dashboard's Today's Log: each category is
          // a slim divider (dot · label · "N due"/"Logged"), not a container.
          <div>
            {groupByCategory(dueCompounds).map((group) => {
              const pending = group.items.filter((c) => !targetLogs[c.id]).length
              return (
                <div key={group.cat} className="mt-3 first:mt-1">
                  <div className="flex items-center gap-2 px-1 pb-1">
                    <CategoryIcon category={group.cat} className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
                      {group.label}
                    </span>
                    <span aria-hidden className="h-[0.5px] flex-1 bg-border-default" />
                    {pending > 0 ? (
                      <span className="font-mono text-[11px] tabular-nums text-accent-amber">
                        {pending} due
                      </span>
                    ) : (
                      <span className="text-[11px] text-text-subtle">Logged</span>
                    )}
                  </div>
                  <ul className="px-1">
                    {group.items.map((c) => (
                      <QuickRow
                        key={c.id}
                        compound={c}
                        log={targetLogs[c.id] ?? null}
                        onOpen={() => openLog(c)}
                        /* From the ROW — this sheet's own target day. */
                        onUnlog={() => handleRemove(c.id, targetKey)}
                      />
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <SheetFooter>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-bg-surface-raised"
        >
          Done
        </button>
      </SheetFooter>

      {/* The SAME Log sheet as the dashboard — opens over this popup; on Track it
          closes back here with the row now ticked. */}
      <LogDoseSheet
        open={logTarget !== null}
        compound={logTarget?.compound ?? null}
        existing={logTarget?.existing ?? null}
        // The + menu has no day context of its own, so it adopts the day the
        // dashboard's week strip is parked on (today everywhere else). The sheet
        // compares the two itself to decide the default time and to show its
        // "Logging to {date}" notice, so a back-dated write is always named.
        dateKey={targetKey}
        todayKey={todayKey}
        siteLastUsedDays={siteLastUsedDays}
        bodySex={bodySex}
        onOpenChange={(open) => {
          if (!open) setLogTarget(null)
        }}
        onTracked={handleTracked}
        onRemove={handleRemove}
        hasLogOn={(day) => Boolean(logs[day]?.[logTarget?.compound.id ?? ""])}
      />
    </>
  )
}

function QuickRow({
  compound,
  log,
  onOpen,
  onUnlog,
}: {
  compound: StackCompound
  log: DoseLog | null
  onOpen: () => void
  onUnlog: () => void
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 py-2 transition-opacity duration-200",
        log && "opacity-60"
      )}
    >
      {/* Pure toggle, like the dashboard: empty → open the Log sheet to confirm the
          dose; filled → tap to un-log (the tick goes blank). */}
      <button
        type="button"
        onClick={() => (log ? onUnlog() : onOpen())}
        aria-label={log ? `Untick ${compound.name}` : `Log ${compound.name}`}
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ease-out active:scale-90",
          log
            ? "border-accent-primary bg-accent-primary text-bg-base"
            : "border-border-strong text-transparent hover:border-text-primary"
        )}
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
      </button>

      {/* Name + specs — tap to open the Log sheet (edit if already logged), so you
          can confirm or change the amount. */}
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium text-foreground">
          {compound.name}
        </span>
        {/* A LOGGED dose renders the unit it was recorded in, not the compound's
            current one (Spec 01): switching a compound mg→mcg must not restate a
            past dose as a thousandth of what was taken. `log.unit` is absent only
            on records written before it was stamped, which fall back. */}
        <span className="mt-0.5 block truncate font-mono text-xs tabular-nums text-text-muted">
          {log
            ? `${log.amount}${log.unit ?? compound.unit}`
            : `${fmtDose(compound.dose)}${compound.unit}`}{" "}
          · {formatTimeLabel(log?.time24 ?? compound.schedule.timeOfDay)}
        </span>
      </button>
    </li>
  )
}
