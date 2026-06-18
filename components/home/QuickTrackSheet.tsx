"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
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
} from "@/lib/compound-categories"
import {
  advanceRotation,
  formatTimeLabel,
  getStackSnapshot,
  isDueOn,
  isInjectable,
  loadStack,
  nextSiteId,
  subscribeStack,
  upsertStack,
  type StackCompound,
} from "@/lib/home/stack"
import {
  getDoseLogsSnapshot,
  logDose,
  subscribeDoseLogs,
  type DayLogs,
} from "@/lib/home/doseLog"
import { siteLabel } from "@/lib/home/siteCatalog"
import { listStock, type StockItem } from "@/lib/db/inventory"
import { toDateKey, type DoseLog } from "@/lib/home/mockHomeData"

// Stable references for useSyncExternalStore's server snapshot.
const EMPTY_STACK: StackCompound[] = []
const EMPTY_LOGS: DayLogs = {}
// How long the "Tracked" confirmation lingers before auto-closing.
const SUCCESS_MS = 1300

function fmtDose(d: number): string {
  return Number.isInteger(d) ? String(d) : d.toFixed(2).replace(/0$/, "")
}
function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`
}

/**
 * The "What would you like to track?" quick-log popup the plus-menu "Log a dose"
 * opens — a fast, in-place alternative to going to the dashboard. It lists the
 * day's due compounds; the user ticks the ones they took and confirms, and each
 * is logged with its own defaults (preset dose, the current time, its next
 * rotation site, and its most-recent compatible vial). Already-logged doses show
 * as "Logged" and aren't re-logged. Fine-grained edits (a different dose, time or
 * site) still live in the dashboard's Log sheet — this is the ease-of-use path.
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
          <SheetTitle className="font-display text-xl text-foreground">
            What would you like to track?
          </SheetTitle>
        </SheetHeader>
        <SheetDescription className="sr-only">
          Tick the compounds you took today, then confirm to log them.
        </SheetDescription>
        {open && (
          <QuickTrackBody userId={userId} onClose={() => onOpenChange(false)} />
        )}
      </SheetContent>
    </Sheet>
  )
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

  // "Today" is captured once from the device clock when the sheet opens.
  const [today] = useState(() => new Date())
  const todayKey = toDateKey(today)
  const todayLogs = logs[todayKey] ?? {}

  const due = stack.filter((c) => !c.archived && isDueOn(c.schedule, today))
  const pending = due.filter((c) => !todayLogs[c.id])

  // Vials on hand, so a quick log can default to the right vial (most-recent
  // compatible) and decrement its "stock left" — the same default the detailed
  // Log sheet uses. Best-effort; an empty list just logs without a vial link.
  const [stock, setStock] = useState<StockItem[]>([])
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const all = await listStock()
        if (!cancelled) setStock(all)
      } catch {
        if (!cancelled) setStock([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  // Most-recent family-compatible vial for a compound (listStock is newest-first).
  function vialFor(c: StackCompound): string | null {
    const v = stock.find(
      (s) =>
        s.protocolCompoundId === c.id &&
        ((s.baseUnit === "mg" && (c.unit === "mg" || c.unit === "mcg")) ||
          (s.baseUnit === "iu" && c.unit === "iu"))
    )
    return v?.id ?? null
  }

  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [tracked, setTracked] = useState(false)
  const [loggedCount, setLoggedCount] = useState(0)

  // Auto-close after the success state lingers. The log is already committed.
  useEffect(() => {
    if (!tracked) return
    const t = window.setTimeout(onClose, SUCCESS_MS)
    return () => window.clearTimeout(t)
  }, [tracked, onClose])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedPending = pending.filter((c) => selected.has(c.id))

  function confirm() {
    if (selectedPending.length === 0) return
    const time = hhmm(new Date())
    for (const c of selectedPending) {
      const siteId = isInjectable(c.method) ? nextSiteId(c) : null
      const log: DoseLog = {
        amount: String(c.dose),
        siteId,
        time24: time,
        inventoryItemId: vialFor(c),
      }
      logDose(userId, todayKey, c.id, log)
      // Advance THIS compound's rotation to the slot after the logged site, the
      // same as the dashboard's Log flow (each compound's cycle is independent).
      if (siteId) {
        const target = (loadStack(userId) ?? []).find((x) => x.id === c.id)
        if (target) upsertStack(userId, advanceRotation(target, siteId))
      }
    }
    setLoggedCount(selectedPending.length)
    setTracked(true)
  }

  if (tracked) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-12">
        <span className="relative flex h-16 w-16 items-center justify-center">
          <span
            aria-hidden
            className="animate-home-tick-ring absolute inset-0 rounded-full border-2 border-accent-green/40"
          />
          <span className="animate-home-tick-pop flex h-16 w-16 items-center justify-center rounded-full bg-accent-green text-bg-base">
            <Check className="h-9 w-9" strokeWidth={2.5} aria-hidden />
          </span>
        </span>
        <span className="text-base font-semibold text-foreground">Tracked</span>
        <span className="text-sm text-text-muted">
          {loggedCount} {loggedCount === 1 ? "dose" : "doses"} logged today
        </span>
      </div>
    )
  }

  return (
    <>
      <div className="px-4">
        {due.length === 0 ? (
          <p className="rounded-2xl bg-bg-surface-raised px-4 py-8 text-center text-sm text-text-muted">
            Nothing scheduled for today.
          </p>
        ) : (
          <>
            {pending.length === 0 && (
              <p className="mb-2 rounded-xl bg-bg-surface-raised px-4 py-3 text-center text-sm text-text-muted">
                Everything for today is logged.
              </p>
            )}
            <ul className="space-y-1">
              {due.map((c) => {
                const logged = Boolean(todayLogs[c.id])
                const isSel = selected.has(c.id)
                const meta = CATEGORY_META[c.category] ?? FALLBACK_CATEGORY_META
                const site = isInjectable(c.method) ? nextSiteId(c) : null
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={logged}
                      onClick={() => toggle(c.id)}
                      aria-pressed={logged || isSel}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                        logged
                          ? "opacity-55"
                          : isSel
                            ? "bg-accent-amber/10"
                            : "hover:bg-bg-surface-raised"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ease-out",
                          logged || isSel
                            ? "border-accent-amber bg-accent-amber text-bg-base"
                            : "border-border-strong text-transparent"
                        )}
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              meta.dot
                            )}
                          />
                          <span className="truncate text-sm font-medium text-foreground">
                            {c.name}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-xs tabular-nums text-text-muted">
                          {fmtDose(c.dose)}
                          {c.unit} · {formatTimeLabel(c.schedule.timeOfDay)}
                          {site && (
                            <span className="text-accent-amber"> · ▸ {siteLabel(site)}</span>
                          )}
                        </span>
                      </span>
                      {logged && (
                        <span className="shrink-0 text-[11px] text-text-subtle">
                          Logged
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      <SheetFooter className="flex-row gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-bg-surface-raised"
        >
          {due.length === 0 ? "Close" : "Cancel"}
        </button>
        {due.length > 0 && (
          <button
            type="button"
            onClick={confirm}
            disabled={selectedPending.length === 0}
            className="flex-1 rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {selectedPending.length > 0
              ? `Confirm (${selectedPending.length})`
              : "Confirm"}
          </button>
        )}
      </SheetFooter>
    </>
  )
}
