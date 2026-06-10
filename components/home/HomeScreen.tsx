"use client"

import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"

import { useMounted } from "@/components/home/useMounted"
import { WeekStrip, type WeekDay } from "@/components/home/WeekStrip"
import { TodaysCycleCard } from "@/components/home/TodaysCycleCard"
import { EmptyLogCard } from "@/components/home/EmptyLogCard"
import { WeightCard } from "@/components/home/WeightCard"
import { ReconCalcCard } from "@/components/home/ReconCalcCard"
import { LogDoseSheet } from "@/components/home/LogDoseSheet"
import { LogWeightSheet } from "@/components/home/LogWeightSheet"
import { CompoundDetailSheet } from "@/components/home/CompoundDetailSheet"
import { AddCompoundSheet } from "@/components/home/AddCompoundSheet"
import { PlaceholderActionSheet } from "@/components/shortcuts/PlaceholderActionSheet"
import { SHORTCUT_ITEMS } from "@/components/shortcuts/shortcutItems"
import { logBodyWeight } from "@/app/(app)/dashboard/actions"
import { ArchivedCompounds } from "@/components/home/ArchivedCompounds"
import {
  dateKeyToDate,
  resolveDateKey,
  seedStack,
  toDateKey,
  weightUnit,
  type DateKey,
  type DayStatus,
  type DoseLog,
} from "@/lib/home/mockHomeData"
import {
  advanceRotation,
  archiveInStack,
  getStackSnapshot,
  isDueOn,
  loadStack,
  notifyStackChanged,
  removeFromStack,
  resolvedDaySite,
  saveStack,
  subscribeStack,
  type StackCompound,
} from "@/lib/home/stack"
import {
  getDoseLogsSnapshot,
  logDose,
  removeCompoundLogs,
  subscribeDoseLogs,
  unlogDose,
  type DayLogs,
} from "@/lib/home/doseLog"
import { siteLabel } from "@/lib/home/siteCatalog"

const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

// Reuse the Plus-menu's reconstitution-calculator entry so the Home card opens
// the exact same placeholder sheet (title + medical-disclaimer warning).
const RECON_ITEM = SHORTCUT_ITEMS.find(
  (i) => i.id === "reconstitution-calculator"
)

// Stable empty-logs reference for useSyncExternalStore's server snapshot.
const EMPTY_LOGS: DayLogs = {}
const CONSISTENCY_DAYS = 30

function dayLabel(key: DateKey): string {
  const d = dateKeyToDate(key)
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** Time until the next occurrence of a "HH:MM" clock time, as "Xh Ym". */
function formatCountdown(now: Date, time24: string): string {
  const [h, m] = time24.split(":").map(Number)
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0)
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1)
  const mins = Math.max(0, Math.round((target.getTime() - now.getTime()) / 60000))
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

/** The next upcoming dose today (earliest time after now, else earliest overall). */
function computeNextDose(
  stack: StackCompound[],
  now: Date
): { name: string; time24: string } | null {
  const due = stack.filter((c) => isDueOn(c.schedule, now))
  if (due.length === 0) return null
  const sorted = [...due].sort((a, b) =>
    a.schedule.timeOfDay.localeCompare(b.schedule.timeOfDay)
  )
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`
  const upcoming = sorted.find((c) => c.schedule.timeOfDay > hhmm) ?? sorted[0]
  return { name: upcoming.name, time24: upcoming.schedule.timeOfDay }
}

/**
 * Home / Dashboard. A pinned week-strip header over scrolling cards (Today's
 * Cycle → Weight → Reconstitution Calculator). Selecting a day lifts here and
 * re-scopes the content; logging a dose flips that day's entry so the week dot
 * and Consistency strip both update, and advances that compound's injection-site
 * rotation. The stack (per-compound dosing/schedule/rotation) is device-local in
 * `localStorage`; a brand-new device falls back to the seed stack.
 *
 * `todayKey` is computed once on the server and passed in, so every date renders
 * identically on server and client; the stack is read from storage AFTER mount
 * (so SSR is deterministic), and only the countdown reads the live clock.
 */
export function HomeScreen({
  todayKey,
  name,
  weight,
  userId,
}: {
  todayKey: DateKey
  /** The user's first name for the greeting (empty → a plain "Hello"). */
  name: string
  /** Body-weight points (real from body_metrics, or the mock fallback), asc. */
  weight: { key: DateKey; kg: number }[]
  /** Scopes the device-local stack in localStorage. */
  userId: string
}) {
  const router = useRouter()
  const today = useMemo(() => dateKeyToDate(todayKey), [todayKey])

  const [selectedKey, setSelectedKey] = useState<DateKey>(todayKey)
  const [logTarget, setLogTarget] = useState<{
    compound: StackCompound
    existing: DoseLog | null
    /** This compound's real next site to preselect (no auto-dodge). */
    preselectSiteId: string | null
    /** Sites OTHER compounds land on today — flagged (not blocked) in the sheet. */
    usedByOtherIds: string[]
  } | null>(null)
  const [reconOpen, setReconOpen] = useState(false)
  const [weightSheetOpen, setWeightSheetOpen] = useState(false)
  // Tapping a compound opens its detail; "Edit" from there opens the add sheet.
  const [detailTarget, setDetailTarget] = useState<StackCompound | null>(null)
  const [editTarget, setEditTarget] = useState<StackCompound | null>(null)

  // The stack (per-compound dosing/schedule/rotation) lives in localStorage so it
  // survives reloads and a sibling (the add flow) can update it. `useSyncExternal-
  // Store` reads it: the seed stack on the server + during hydration (deterministic),
  // the stored stack on the client, re-reading whenever it changes.
  const stack = useSyncExternalStore(
    subscribeStack,
    () => getStackSnapshot(userId, seedStack),
    () => seedStack
  )
  const activeStack = stack.filter((c) => !c.archived)
  const archivedStack = stack.filter((c) => c.archived)

  // Logged doses, persisted device-local so history survives reloads — same store
  // pattern as the stack. Shape: { dateKey: { compoundId: DoseLog } }.
  const logs = useSyncExternalStore(
    subscribeDoseLogs,
    () => getDoseLogsSnapshot(userId),
    () => EMPTY_LOGS
  )

  // Persist the seed stack once on a fresh device so the rest of the app (e.g.
  // the Add-to-log menu's "already in your log" check) reads the same source of
  // truth. Side-effect only — no setState — so it's not a cascading render.
  useEffect(() => {
    if (loadStack(userId) === null) {
      saveStack(userId, seedStack)
      notifyStackChanged()
    }
  }, [userId])

  // Countdown: captured once from the live clock by the useState initializer
  // (no ticking timer), and only revealed after mount so the server-rendered
  // HTML omits it and there's no hydration drift.
  const mounted = useMounted()
  const [nextDose] = useState(() => computeNextDose(seedStack, new Date()))
  const [computedCountdown] = useState(() =>
    nextDose ? formatCountdown(new Date(), nextDose.time24) : null
  )
  const countdown = mounted ? computedCountdown : null

  const weekDays: WeekDay[] = useMemo(() => {
    const mondayOffset = (today.getDay() + 6) % 7 // days since Monday
    const monday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - mondayOffset
    )
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
      return { key: toDateKey(d), date: d }
    })
  }, [today])

  // A day's status is computed live from the persisted logs vs the active
  // compounds due that day (no stored status). Future days are always `future`.
  const statusOf = (key: DateKey): DayStatus => {
    if (key > todayKey) return "future"
    const date = dateKeyToDate(key)
    const dueIds = activeStack
      .filter((c) => isDueOn(c.schedule, date))
      .map((c) => c.id)
    const dayLogs = logs[key] ?? {}
    if (dueIds.length === 0) {
      return Object.keys(dayLogs).length > 0 ? "logged" : "future"
    }
    const loggedCount = dueIds.filter((id) => dayLogs[id]).length
    if (loggedCount === 0) return "missed"
    if (loggedCount >= dueIds.length) return "logged"
    return "partial"
  }

  const consistencyItems = Array.from({ length: CONSISTENCY_DAYS }, (_, i) => {
    const key = resolveDateKey(today, CONSISTENCY_DAYS - 1 - i)
    return { key, status: statusOf(key) }
  })

  // Selected day's list: anything LOGGED that day (history — kept even after a
  // compound is archived) plus active compounds due that day. Each shows its REAL
  // next site (no auto-dodge); we OBSERVE clashes and flag them (the user decides).
  const isToday = selectedKey === todayKey
  const selectedDate = dateKeyToDate(selectedKey)
  const selectedRows = logs[selectedKey] ?? {}
  const dueCompounds = stack.filter((c) =>
    selectedRows[c.id]
      ? true
      : !c.archived && isDueOn(c.schedule, selectedDate)
  )
  // Each injectable's resolved site for the day (logged site, else its next).
  const resolvedById: Record<string, string | null> = {}
  for (const c of dueCompounds) {
    resolvedById[c.id] = resolvedDaySite(c, selectedRows[c.id]?.siteId ?? null)
  }
  // Sites two or more compounds both land on today = a clash.
  const siteCount: Record<string, number> = {}
  for (const s of Object.values(resolvedById)) {
    if (s) siteCount[s] = (siteCount[s] ?? 0) + 1
  }
  const clashSites = new Set(
    Object.entries(siteCount)
      .filter(([, n]) => n >= 2)
      .map(([s]) => s)
  )
  const hasClash = clashSites.size > 0
  // Sites used by OTHER due compounds (for the log sheet's free-alternates list).
  const usedByOtherIds = (compoundId: string): string[] => {
    const out: string[] = []
    for (const c of dueCompounds) {
      const s = resolvedById[c.id]
      if (c.id !== compoundId && s) out.push(s)
    }
    return out
  }
  const dueDoses = dueCompounds.map((c) => {
    const site = resolvedById[c.id]
    return {
      ...c,
      log: selectedRows[c.id] ?? null,
      nextSiteLabel: site ? siteLabel(site) : null,
      clash: site != null && clashSites.has(site),
    }
  })

  // Days since each site was last logged (on any earlier day) — powers the log
  // sheet's "last used here" rest hint. Fills in as the user logs over time.
  const selDayN = Math.floor(selectedDate.getTime() / 86_400_000)
  const siteLastUsedDays: Record<string, number> = {}
  for (const [key, dayLogObj] of Object.entries(logs)) {
    if (key >= selectedKey) continue
    const ago = selDayN - Math.floor(dateKeyToDate(key).getTime() / 86_400_000)
    if (ago <= 0) continue
    for (const dayLog of Object.values(dayLogObj)) {
      const sid = dayLog.siteId
      if (sid && (siteLastUsedDays[sid] === undefined || ago < siteLastUsedDays[sid])) {
        siteLastUsedDays[sid] = ago
      }
    }
  }

  const cycleTitle = isToday
    ? "Today's Log"
    : `${WEEKDAYS[selectedDate.getDay()]}'s Log`

  // Weight points (real or mock fallback) resolved for the chart.
  const weightSamples = useMemo(
    () => weight.map((p) => ({ key: p.key, date: dateKeyToDate(p.key), kg: p.kg })),
    [weight]
  )

  function handleTracked(compoundId: string, log: DoseLog) {
    logDose(userId, selectedKey, compoundId, log)
    // Logging advances THIS compound's rotation to the slot after the site
    // actually logged (§3.7); each compound's cycle is independent. Written to
    // localStorage, then the notify re-syncs the store (and any sibling).
    if (log.siteId) {
      const current = loadStack(userId) ?? seedStack
      const next = current.map((c) =>
        c.id === compoundId ? advanceRotation(c, log.siteId) : c
      )
      saveStack(userId, next)
      notifyStackChanged()
    }
  }

  // Persist a weight to body_metrics (server action), then refresh so the chart
  // re-reads the user's real data. Returns the result for the sheet's UI.
  async function handleSaveWeight(weightKg: number) {
    const res = await logBodyWeight(weightKg)
    if (res.ok) router.refresh()
    return res
  }

  // Undo a logged dose — removes its entry. The rotation pointer is left where it
  // is (advancing is a logging-only action).
  function handleRemove(compoundId: string) {
    unlogDose(userId, selectedKey, compoundId)
  }

  return (
    <>
      {/* Pinned header — the only sticky element on Home. It sits below the
          shell's wordmark header (which scrolls away) and stays put while the
          cards scroll beneath it. Opaque background so content scrolls under. */}
      <div className="sticky top-0 z-30 border-b border-border-default bg-bg-base">
        <div className="mx-auto w-full max-w-md px-4 pt-2 pb-2.5">
          <WeekStrip
            days={weekDays}
            selectedKey={selectedKey}
            todayKey={todayKey}
            statusOf={statusOf}
            onSelect={setSelectedKey}
          />
        </div>
      </div>

      {/* Scrolling content — each item fades + rises in on load, staggered. */}
      <div className="mx-auto w-full max-w-md space-y-5 px-5 py-5">
        {/* Greeting + the selected-day date, just below the week strip. */}
        <div className="animate-home-up px-1" style={{ animationDelay: "0ms" }}>
          <h1 className="font-display text-3xl font-medium tracking-[-0.01em] text-foreground">
            {name ? `Hello, ${name}` : "Hello"}
          </h1>
          <p className="mt-0.5 text-sm text-text-muted">{dayLabel(selectedKey)}</p>
        </div>

        <div className="animate-home-up" style={{ animationDelay: "70ms" }}>
          {stack.length === 0 ? (
            <EmptyLogCard />
          ) : (
            <TodaysCycleCard
              isToday={isToday}
              title={cycleTitle}
              countdown={countdown}
              nextDoseName={nextDose?.name ?? ""}
              dueDoses={dueDoses}
              hasClash={hasClash}
              consistencyItems={consistencyItems}
              todayKey={todayKey}
              onLog={(dose) =>
                setLogTarget({
                  compound: dose,
                  existing: null,
                  preselectSiteId: resolvedById[dose.id] ?? null,
                  usedByOtherIds: usedByOtherIds(dose.id),
                })
              }
              onEdit={(dose, log) =>
                setLogTarget({
                  compound: dose,
                  existing: log,
                  preselectSiteId: log.siteId ?? resolvedById[dose.id] ?? null,
                  usedByOtherIds: usedByOtherIds(dose.id),
                })
              }
              onOpenDetail={(dose) => setDetailTarget(dose)}
            />
          )}
        </div>

        {archivedStack.length > 0 && (
          <div className="animate-home-up" style={{ animationDelay: "105ms" }}>
            <ArchivedCompounds
              compounds={archivedStack}
              onOpen={(c) => setDetailTarget(c)}
              onReactivate={(id) => archiveInStack(userId, id, false)}
            />
          </div>
        )}

        <div className="animate-home-up" style={{ animationDelay: "140ms" }}>
          <WeightCard
            series={weightSamples}
            selectedKey={selectedKey}
            unit={weightUnit}
            scopeLabel={isToday ? "vs. yesterday" : "vs. prior"}
            onOpenDetail={() => router.push("/weight")}
            onLogWeight={() => setWeightSheetOpen(true)}
          />
        </div>

        <div className="animate-home-up" style={{ animationDelay: "210ms" }}>
          <ReconCalcCard onOpenCalculator={() => setReconOpen(true)} />
        </div>
      </div>

      <LogDoseSheet
        open={logTarget !== null}
        compound={logTarget?.compound ?? null}
        existing={logTarget?.existing ?? null}
        preselectSiteId={logTarget?.preselectSiteId ?? null}
        usedByOtherIds={logTarget?.usedByOtherIds ?? []}
        siteLastUsedDays={siteLastUsedDays}
        onOpenChange={(open) => {
          if (!open) setLogTarget(null)
        }}
        onTracked={handleTracked}
        onRemove={handleRemove}
      />

      {/* Tap a compound → its detail; Edit there opens the add sheet pre-filled.
          Archive keeps history; Delete permanently is the destructive path. */}
      <CompoundDetailSheet
        open={detailTarget !== null}
        compound={detailTarget}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null)
        }}
        onEdit={(c) => {
          setDetailTarget(null)
          setEditTarget(c)
        }}
        onArchive={(id) => archiveInStack(userId, id, true)}
        onReactivate={(id) => archiveInStack(userId, id, false)}
        onDelete={(id) => {
          removeFromStack(userId, id)
          removeCompoundLogs(userId, id)
        }}
      />

      <AddCompoundSheet
        open={editTarget !== null}
        compound={null}
        editCompound={editTarget}
        userId={userId}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
        onAdded={() => setEditTarget(null)}
      />

      <LogWeightSheet
        open={weightSheetOpen}
        unit={weightUnit}
        defaultValue={
          weightSamples.length
            ? String(weightSamples[weightSamples.length - 1].kg)
            : ""
        }
        onOpenChange={setWeightSheetOpen}
        onSave={handleSaveWeight}
      />

      {/* Same placeholder (title + medical disclaimer) the Plus menu opens. */}
      <PlaceholderActionSheet
        open={reconOpen}
        onClose={() => setReconOpen(false)}
        title={RECON_ITEM?.title ?? "Reconstitution calculator"}
        warning={RECON_ITEM?.warning}
      />
    </>
  )
}
