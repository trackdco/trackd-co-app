"use client"

import { useState, useSyncExternalStore } from "react"
import { Check } from "lucide-react"

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
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
  type CompoundCategory,
} from "@/lib/compound-categories"
import { CARD_TITLE } from "@/lib/ui-presets"
import { LogDoseSheet } from "@/components/home/LogDoseSheet"
import {
  formatTimeLabel,
  getStackSnapshot,
  isDueOn,
  subscribeStack,
  type StackCompound,
} from "@/lib/home/stack"
import {
  getDoseLogsSnapshot,
  logDose,
  subscribeDoseLogs,
  unlogDose,
  type DayLogs,
} from "@/lib/home/doseLog"
import { dateKeyToDate, toDateKey, type DoseLog } from "@/lib/home/mockHomeData"

// Stable references for useSyncExternalStore's server snapshot.
const EMPTY_STACK: StackCompound[] = []
const EMPTY_LOGS: DayLogs = {}

function fmtDose(d: number): string {
  return Number.isInteger(d) ? String(d) : d.toFixed(2).replace(/0$/, "")
}

// Stable category display order (the order they're declared in the meta) — the
// same grouping the dashboard's Today's Log uses.
const CATEGORY_ORDER = Object.keys(CATEGORY_META) as CompoundCategory[]

interface DoseGroup {
  cat: string
  label: string
  dot: string
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
    .sort((a, b) => rank(a) - rank(b))
    .map((cat) => {
      const meta = CATEGORY_META[cat as CompoundCategory] ?? FALLBACK_CATEGORY_META
      return {
        cat,
        label: meta.label,
        dot: meta.dot,
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
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
          <SheetTitle className={CARD_TITLE}>
            What would you like to track?
          </SheetTitle>
        </SheetHeader>
        <SheetDescription className="sr-only">
          Tap a compound to log it, or tap a logged tick to undo it.
        </SheetDescription>
        {open && (
          <QuickTrackBody userId={userId} onClose={() => onOpenChange(false)} />
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
  onClose,
}: {
  userId: string
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
  const todayDate = dateKeyToDate(todayKey)
  const todayLogs = logs[todayKey] ?? {}

  // Today's list: due compounds, plus anything already logged today (kept even if
  // since archived). Same selection rule as the dashboard's Today's Log.
  const dueCompounds = stack.filter((c) =>
    todayLogs[c.id] ? true : !c.archived && isDueOn(c.schedule, todayDate)
  )

  const [logTarget, setLogTarget] = useState<LogTarget | null>(null)

  // Days since each site was last used — the Log sheet's "last used here" rest hint.
  // INCLUDES today's OTHER doses (so a site another compound already used today reads
  // "used today"; you can still log two compounds into one muscle — this just tells
  // you), but leaves out the dose being logged right now (the active compound's own
  // log) so it never counts itself. Same computation as the dashboard.
  const activeLogCompoundId = logTarget?.compound.id
  const todayN = Math.floor(todayDate.getTime() / 86_400_000)
  const siteLastUsedDays: Record<string, number> = {}
  for (const [key, dayLogObj] of Object.entries(logs)) {
    if (key > todayKey) continue
    const ago = todayN - Math.floor(dateKeyToDate(key).getTime() / 86_400_000)
    if (ago < 0) continue
    for (const [compoundId, dayLog] of Object.entries(dayLogObj)) {
      if (key === todayKey && compoundId === activeLogCompoundId) continue
      const sid = dayLog.siteId
      if (sid && (siteLastUsedDays[sid] === undefined || ago < siteLastUsedDays[sid])) {
        siteLastUsedDays[sid] = ago
      }
    }
  }

  function openLog(c: StackCompound) {
    setLogTarget({ compound: c, existing: todayLogs[c.id] ?? null })
  }

  // Commit a dose (fresh or edited) — the exact same handler the dashboard uses.
  function handleTracked(compoundId: string, log: DoseLog) {
    logDose(userId, todayKey, compoundId, log)
  }
  function handleRemove(compoundId: string) {
    unlogDose(userId, todayKey, compoundId)
  }

  return (
    <>
      <div className="px-4">
        {dueCompounds.length === 0 ? (
          <p className="rounded-2xl bg-bg-surface-raised px-4 py-8 text-center text-sm text-text-muted">
            Nothing scheduled for today.
          </p>
        ) : (
          // Grouped by category, like the dashboard's Today's Log: each category is
          // a slim divider (dot · label · "N due"/"Logged"), not a container.
          <div>
            {groupByCategory(dueCompounds).map((group) => {
              const pending = group.items.filter((c) => !todayLogs[c.id]).length
              return (
                <div key={group.cat} className="mt-3 first:mt-1">
                  <div className="flex items-center gap-2 px-1 pb-1">
                    <span
                      aria-hidden
                      className={cn("h-1.5 w-1.5 shrink-0 rounded-full", group.dot)}
                    />
                    <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
                      {group.label}
                    </span>
                    <span aria-hidden className="h-px flex-1 bg-border-default" />
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
                        log={todayLogs[c.id] ?? null}
                        onOpen={() => openLog(c)}
                        onUnlog={() => handleRemove(c.id)}
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
        siteLastUsedDays={siteLastUsedDays}
        onOpenChange={(open) => {
          if (!open) setLogTarget(null)
        }}
        onTracked={handleTracked}
        onRemove={handleRemove}
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
            ? "border-accent-amber bg-accent-amber text-bg-base"
            : "border-border-strong text-transparent hover:border-text-primary"
        )}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      </button>

      {/* Name + specs — tap to open the Log sheet (edit if already logged), so you
          can confirm or change the amount. */}
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium text-foreground">
          {compound.name}
        </span>
        <span className="mt-0.5 block truncate font-mono text-xs tabular-nums text-text-muted">
          {log
            ? `${log.amount}${compound.unit}`
            : `${fmtDose(compound.dose)}${compound.unit}`}{" "}
          · {formatTimeLabel(log?.time24 ?? compound.schedule.timeOfDay)}
        </span>
      </button>
    </li>
  )
}
