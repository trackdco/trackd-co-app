"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { CalendarDays } from "lucide-react"

import { useMounted } from "@/components/home/useMounted"
import { useCloudHydration } from "@/components/home/useCloudHydration"
import { PageScrollTitle } from "@/components/layout/PageScrollTitle"
import { WeekStrip, type WeekDay } from "@/components/home/WeekStrip"
import { HomeGreeting } from "@/components/home/HomeGreeting"
import { TodaysCycleCard } from "@/components/home/TodaysCycleCard"
import { EmptyLogCard } from "@/components/home/EmptyLogCard"
import { WeightGlanceCard } from "@/components/home/WeightGlanceCard"
import { InjectionSitesGlanceCard } from "@/components/home/InjectionSitesGlanceCard"
import { InjectionSitesSheet } from "@/components/home/InjectionSitesSheet"
import { ProgressPhotoSection } from "@/components/progress/ProgressPhotoSection"
import { ReconCalcCard } from "@/components/home/ReconCalcCard"
import { ReconCalculatorSheet } from "@/components/home/ReconCalculatorSheet"
import { LogDoseSheet } from "@/components/home/LogDoseSheet"
import { CompoundDetailSheet } from "@/components/home/CompoundDetailSheet"
import { AddCompoundSheet } from "@/components/home/AddCompoundSheet"
import type { WeightUnit } from "@/lib/weight"
import type { ProgressPhoto } from "@/lib/progress/photos"
import type { InjectionSiteRoute, InjectionSiteRow } from "@/lib/db/types"
import {
  dateKeyToDate,
  seedStack,
  toDateKey,
  type DateKey,
  type DayStatus,
  type DoseLog,
} from "@/lib/home/mockHomeData"
import {
  archiveInStack,
  getStackSnapshot,
  isDueOn,
  loadStack,
  notifyStackChanged,
  removeFromStack,
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
import { siteDaysSince } from "@/lib/home/siteRecency"

const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

// Stable empty-logs reference for useSyncExternalStore's server snapshot.
const EMPTY_LOGS: DayLogs = {}

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
 * Home / Dashboard. A pinned header (a sans "Dashboard" title + the selected
 * day's date + the week strip) over scrolling cards (Today's Log → Reconstitution
 * Calculator). Selecting a day re-scopes the content and the date; logging a dose
 * flips that day's entry so the week dot updates, and
 * advances that compound's injection-site rotation. The stack + dose logs are
 * device-local; weight lives on its own view now (the + menu's Weight tile).
 *
 * `serverTodayKey` is computed on the server so SSR + the first client render
 * match (no hydration drift); we then re-derive "today" from the DEVICE's local
 * clock (the server runs in UTC and can be a day off) and keep it current across
 * local midnight + app foreground — so the date always rolls over at the user's
 * midnight, never UTC's. The stack is read from storage AFTER mount (SSR is
 * deterministic), and only the countdown reads the live clock.
 */
export function HomeScreen({
  todayKey: serverTodayKey,
  userId,
  weight,
  unit,
  firstName,
  progressPhotos,
  injectionCatalogue,
  notificationsBanner,
}: {
  todayKey: DateKey
  /** Scopes the device-local stack in localStorage. */
  userId: string
  /** Bodyweight points from `weight_logs` (oldest → newest) for the glance card. */
  weight: { key: DateKey; kg: number }[]
  /** The user's display weight unit. */
  unit: WeightUnit
  /** First name for the greeting (from auth metadata; null = greet without a name). */
  firstName: string | null
  /** Latest progress photos (newest first) for the Home glance peek. */
  progressPhotos: ProgressPhoto[]
  /** Injection-site catalogue (both routes) for the glance card + menu. */
  injectionCatalogue: InjectionSiteRow[]
  /** Slim "Enable notifications" prompt, rendered above Today's Log. Self-hides
   *  (renders null) when there's nothing to do, so it never leaves a gap. */
  notificationsBanner?: ReactNode
}) {
  const router = useRouter()

  // "Today", corrected to the device's local date after mount (the server seed is
  // UTC and can read as yesterday/tomorrow). See the foreground/midnight sync
  // effect below.
  const [todayKey, setTodayKey] = useState<DateKey>(serverTodayKey)
  const today = useMemo(() => dateKeyToDate(todayKey), [todayKey])

  const [selectedKey, setSelectedKey] = useState<DateKey>(serverTodayKey)
  // Which week the strip shows: 0 = current, -1 = last week, … Swipe to change,
  // capped at 0 so it stays a "look back" (never a future week).
  const [weekOffset, setWeekOffset] = useState(0)
  const [logTarget, setLogTarget] = useState<{
    compound: StackCompound
    existing: DoseLog | null
  } | null>(null)
  const [reconOpen, setReconOpen] = useState(false)
  // Injection-site map (opened from the glance card) — a read-only view of the
  // rotation derived from the dose log. `mirrorTip` shows a one-time note that the
  // front view is mirrored, decided on the first-ever open (event-driven, so no
  // setState-in-effect).
  const [sitesOpen, setSitesOpen] = useState(false)
  const [mirrorTip, setMirrorTip] = useState(false)
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

  // Logged doses, persisted device-local so history survives reloads — same store
  // pattern as the stack. Shape: { dateKey: { compoundId: DoseLog } }.
  const logs = useSyncExternalStore(
    subscribeDoseLogs,
    () => getDoseLogsSnapshot(userId),
    () => EMPTY_LOGS
  )

  // Restore the stack + dose logs from the user's Supabase account on load (and
  // migrate any local-only data up), so the protocol survives a PWA reinstall —
  // localStorage is just the device cache. Best-effort; runs once per user.
  useCloudHydration(userId)

  // Persist the seed stack once on a fresh device so the rest of the app (e.g.
  // the Add-to-log menu's "already in your log" check) reads the same source of
  // truth. Side-effect only — no setState — so it's not a cascading render.
  useEffect(() => {
    if (loadStack(userId) === null) {
      saveStack(userId, seedStack)
      notifyStackChanged()
    }
  }, [userId])

  // Keep "today" pinned to the DEVICE's local date. The server seed is UTC-based
  // and can read as the wrong day (e.g. a user ahead of UTC sees yesterday first
  // thing in the morning). Correct it on mount, whenever the tab/app regains
  // focus or visibility (covers a PWA reopened the next day), and on a 1-minute
  // tick so it rolls over at local midnight while left open. If the user is
  // parked on "today" we follow the rollover; if they've navigated to another
  // day, their selection is left untouched. A `setState` only fires when the day
  // actually changes, so the tick is a no-op in the steady state.
  const todayKeyRef = useRef(todayKey)
  useEffect(() => {
    todayKeyRef.current = todayKey
  }, [todayKey])
  useEffect(() => {
    function syncToday() {
      const local = toDateKey(new Date())
      if (local === todayKeyRef.current) return
      setSelectedKey((sel) => (sel === todayKeyRef.current ? local : sel))
      setTodayKey(local)
    }
    syncToday()
    const onVisible = () => {
      if (document.visibilityState === "visible") syncToday()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", syncToday)
    const id = window.setInterval(syncToday, 60_000)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", syncToday)
      window.clearInterval(id)
    }
  }, [])

  // Countdown: captured once from the live clock by the useState initializer
  // (no ticking timer), and only revealed after mount so the server-rendered
  // HTML omits it and there's no hydration drift.
  const mounted = useMounted()
  const [nextDose] = useState(() => computeNextDose(seedStack, new Date()))
  const [computedCountdown] = useState(() =>
    nextDose ? formatCountdown(new Date(), nextDose.time24) : null
  )
  const countdown = mounted ? computedCountdown : null

  // Build any week's 7 days from an offset (0 = current). The strip renders the
  // current week plus its neighbours so it can slide smoothly between them.
  const daysForOffset = useCallback(
    (offset: number): WeekDay[] => {
      const mondayOffset = (today.getDay() + 6) % 7 // days since Monday
      const monday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - mondayOffset + offset * 7
      )
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
        return { key: toDateKey(d), date: d }
      })
    },
    [today]
  )
  // The week strip commits an absolute offset after its slide — unbounded in both
  // directions (past and future weeks).
  function handleWeekChange(offset: number) {
    setWeekOffset(offset)
  }

  // A day's status is computed live from the persisted logs vs the active
  // compounds due that day (no stored status). Labelled by POSITION (A7): a
  // future day is "future"; a past/today day with nothing due is `none` (a rest
  // day — never "Upcoming", never "missed").
  const statusOf = (key: DateKey): DayStatus => {
    if (key > todayKey) return "future"
    const date = dateKeyToDate(key)
    const dueIds = activeStack
      .filter((c) => isDueOn(c.schedule, date))
      .map((c) => c.id)
    const dayLogs = logs[key] ?? {}
    if (dueIds.length === 0) {
      return Object.keys(dayLogs).length > 0 ? "logged" : "none"
    }
    const loggedCount = dueIds.filter((id) => dayLogs[id]).length
    if (loggedCount === 0) return "missed"
    if (loggedCount >= dueIds.length) return "logged"
    return "partial"
  }

  // Today's completion for the greeting line — always TODAY (not the selected
  // day): active compounds due today vs how many already have a log today.
  const todayDue = activeStack.filter((c) => isDueOn(c.schedule, today))
  const todayLogs = logs[todayKey] ?? {}
  const dueToday = todayDue.length
  const loggedToday = todayDue.filter((c) => todayLogs[c.id]).length

  // Selected day's list: anything LOGGED that day (history — kept even after a
  // compound is archived) plus active compounds due that day. The injection site
  // is chosen in the log sheet's body map (Spec 19), not per compound here.
  const isToday = selectedKey === todayKey
  const selectedDate = dateKeyToDate(selectedKey)
  const selectedRows = logs[selectedKey] ?? {}
  const dueCompounds = stack.filter((c) =>
    selectedRows[c.id]
      ? true
      : !c.archived && isDueOn(c.schedule, selectedDate)
  )
  const dueDoses = dueCompounds.map((c) => ({
    ...c,
    log: selectedRows[c.id] ?? null,
  }))

  // Days since each site was last used, for the log sheet's "last used here" rest
  // hint. Relative to the SELECTED day and INCLUDING it — so a site another compound
  // already used that day reads "used today" (you can still log two compounds into
  // one muscle; this just tells you). Only the dose being logged right now (the
  // active compound's own log on that day) is left out, so it never counts itself.
  const activeLogCompoundId = logTarget?.compound.id
  const selDayN = Math.floor(selectedDate.getTime() / 86_400_000)
  const siteLastUsedDays: Record<string, number> = {}
  for (const [key, dayLogObj] of Object.entries(logs)) {
    if (key > selectedKey) continue
    const ago = selDayN - Math.floor(dateKeyToDate(key).getTime() / 86_400_000)
    if (ago < 0) continue
    for (const [compoundId, dayLog] of Object.entries(dayLogObj)) {
      if (key === selectedKey && compoundId === activeLogCompoundId) continue
      const sid = dayLog.siteId
      if (sid && (siteLastUsedDays[sid] === undefined || ago < siteLastUsedDays[sid])) {
        siteLastUsedDays[sid] = ago
      }
    }
  }

  // Days since each site was last used, TODAY-relative and INCLUDING today — the
  // recency shading for the Injection-sites card + sheet (last pin brightest amber).
  // This intentionally differs from siteLastUsedDays above, which is selected-day
  // relative and excludes the selected day (that one is only the log sheet's rest
  // hint — "don't count the dose you're logging").
  const siteDaysSinceToday = siteDaysSince(logs, todayKey)

  // Recent injectable doses grouped by SITE (muscle), newest first, for the
  // Injection-sites "Last logged" list. Each muscle shows the compound(s) logged
  // there on its most recent day ("Left Delt — Test E, Deca · today"), so two
  // compounds put in one area read together instead of as separate rows. Injectable
  // (IM / Sub-Q) only; a site-less dose stays on its own; an archived/deleted
  // compound is skipped (no name to show).
  const todayN = Math.floor(dateKeyToDate(todayKey).getTime() / 86_400_000)
  const siteGroups = new Map<
    string,
    {
      siteLabel: string | null
      route: InjectionSiteRoute
      dayKey: DateKey
      daysAgo: number
      sortKey: string
      compounds: string[]
    }
  >()
  for (const [key, dayLogObj] of Object.entries(logs)) {
    if (key > todayKey) continue
    const ago = todayN - Math.floor(dateKeyToDate(key).getTime() / 86_400_000)
    if (ago < 0) continue
    for (const [compoundId, log] of Object.entries(dayLogObj)) {
      const c = stack.find((s) => s.id === compoundId)
      const route =
        c?.method === "im" ? "im" : c?.method === "subq" ? "subq" : null
      if (!c || !route) continue
      const site = log.siteId
        ? injectionCatalogue.find((s) => s.id === log.siteId)
        : null
      // Group by site id; a site-less dose gets a unique key so it stays separate.
      const groupKey = log.siteId ?? `none:${compoundId}:${key}`
      const sortKey = `${key}T${log.time24 ?? "00:00"}`
      const g = siteGroups.get(groupKey)
      if (!g) {
        siteGroups.set(groupKey, {
          siteLabel: site?.label ?? null,
          route,
          dayKey: key as DateKey,
          daysAgo: ago,
          sortKey,
          compounds: [c.name],
        })
      } else if (key > g.dayKey) {
        // A newer day for this site — it becomes the shown day; reset its compounds.
        g.dayKey = key as DateKey
        g.daysAgo = ago
        g.sortKey = sortKey
        g.compounds = [c.name]
      } else if (key === g.dayKey) {
        // Same (most-recent) day — collect the other compound(s) put in this muscle.
        if (!g.compounds.includes(c.name)) g.compounds.push(c.name)
        if (sortKey > g.sortKey) g.sortKey = sortKey
      }
      // Older day → ignore (we only show each site's most recent day).
    }
  }
  const recentInjectionSites = [...siteGroups.values()].sort((a, b) =>
    a.sortKey < b.sortKey ? 1 : -1,
  )

  const cycleTitle = isToday
    ? "Today's Log"
    : `${WEEKDAYS[selectedDate.getDay()]}'s Log`

  function handleTracked(compoundId: string, log: DoseLog) {
    logDose(userId, selectedKey, compoundId, log)
  }

  // Undo a logged dose — removes its entry.
  function handleRemove(compoundId: string) {
    unlogDose(userId, selectedKey, compoundId)
  }

  return (
    <>
      {/* Everything scrolls — each item fades + rises in on load, staggered. The
          shared scroll-title provides the date eyebrow, the large "Dashboard"
          heading, and the fade-in compact bar (same preset on every tab page). */}
      <div className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5">
        <div className="animate-home-up" style={{ animationDelay: "0ms" }}>
          <PageScrollTitle
            title="Dashboard"
            eyebrow={dayLabel(selectedKey)}
            action={
              <Link
                href="/calendar"
                aria-label="Open calendar"
                className="-mr-1 flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CalendarDays className="h-5 w-5" aria-hidden />
              </Link>
            }
          />
        </div>

        <div className="animate-home-up" style={{ animationDelay: "55ms" }}>
          <WeekStrip
            weekOffset={weekOffset}
            daysForOffset={daysForOffset}
            selectedKey={selectedKey}
            todayKey={todayKey}
            statusOf={statusOf}
            onSelect={setSelectedKey}
            onWeekChange={handleWeekChange}
          />
        </div>

        {/* Greeting + today's completion — a "right now" status under the
            calendar, always scoped to TODAY regardless of the selected day. */}
        <div className="animate-home-up" style={{ animationDelay: "85ms" }}>
          <HomeGreeting
            firstName={firstName}
            loggedToday={loggedToday}
            dueToday={dueToday}
            paused={logTarget !== null}
          />
        </div>

        {/* Slim, persistent "Enable notifications" prompt (brings its own
            animate-home-up wrapper; renders null when there's nothing to do, so
            space-y-5 never opens a gap here). */}
        {notificationsBanner}

        <div className="animate-home-up" style={{ animationDelay: "110ms" }}>
          {stack.length === 0 ? (
            <EmptyLogCard />
          ) : (
            <TodaysCycleCard
              isToday={isToday}
              title={cycleTitle}
              countdown={countdown}
              nextDoseName={nextDose?.name ?? ""}
              dueDoses={dueDoses}
              onLog={(dose) =>
                setLogTarget({ compound: dose, existing: null })
              }
              onUnlog={(dose) => handleRemove(dose.id)}
              onOpenDetail={(dose) => setDetailTarget(dose)}
            />
          )}
        </div>

        {/* Weight — display only; tap to open the full Weight view (logging lives
            there + in the + menu). */}
        <div className="animate-home-up" style={{ animationDelay: "165ms" }}>
          <WeightGlanceCard
            series={weight}
            unit={unit}
            onOpenDetail={() => router.push("/weight")}
          />
        </div>

        {/* Injection sites — the muscle map at a glance (IM / Sub-Q); tap to choose
            your sites or see where you last pinned. */}
        <div className="animate-home-up" style={{ animationDelay: "175ms" }}>
          <InjectionSitesGlanceCard
            daysSince={siteDaysSinceToday}
            recentSites={recentInjectionSites}
            onOpen={() => {
              setSitesOpen(true)
              try {
                const seen = localStorage.getItem("trackd-injsites-mirror-seen")
                setMirrorTip(!seen)
                if (!seen)
                  localStorage.setItem("trackd-injsites-mirror-seen", "1")
              } catch {
                setMirrorTip(false)
              }
            }}
          />
        </div>

        {/* Progress photos — the SAME menu as the Progress tab's photo section
            (card → gallery → add / edit / view / compare), opened inline. Tapping
            opens the gallery here instead of routing to /progress and hunting for
            it, so there's no navigation friction. */}
        <div className="animate-home-up" style={{ animationDelay: "185ms" }}>
          <ProgressPhotoSection
            photos={progressPhotos}
            userId={userId}
            todayKey={todayKey}
            unit={unit}
            compact
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
        siteLastUsedDays={siteLastUsedDays}
        onOpenChange={(open) => {
          if (!open) setLogTarget(null)
        }}
        onTracked={handleTracked}
        onRemove={handleRemove}
      />

      {/* Tap a compound → its detail; Edit there opens the add sheet pre-filled.
          "Stop logging" archives it (history kept, reversible); "Delete all" is the
          destructive path (removes the compound + every logged dose, two-step confirm). */}
      <CompoundDetailSheet
        open={detailTarget !== null}
        compound={detailTarget}
        isToday={isToday}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null)
        }}
        onEditTodaysDose={(c) => {
          // "Edit today's dose" → open the Log sheet for today's entry (edit if
          // already logged, fresh otherwise), the same site/time flow as logging.
          setDetailTarget(null)
          setLogTarget({
            compound: c,
            existing: selectedRows[c.id] ?? null,
          })
        }}
        onEdit={(c) => {
          setDetailTarget(null)
          setEditTarget(c)
        }}
        onArchive={(id) => archiveInStack(userId, id, true)}
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

      {/* The real reconstitution calculator (A8) — opened from the home card. */}
      <ReconCalculatorSheet open={reconOpen} onOpenChange={setReconOpen} />

      {/* Injection-site menu — choose your sites / see where you last pinned. */}
      <InjectionSitesSheet
        open={sitesOpen}
        onOpenChange={setSitesOpen}
        catalogue={injectionCatalogue}
        daysSince={siteDaysSinceToday}
        recentSites={recentInjectionSites}
        showMirrorTip={mirrorTip}
      />
    </>
  )
}
