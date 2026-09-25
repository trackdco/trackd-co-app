"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import Link from "next/link"
import { CalendarDots, User } from "@/components/icons"
import { CloseArrowIcon } from "@/components/feel/CloseArrow"
import { belongsInDayLog, ringCounts } from "@/lib/home/dayDoses"
import { PRESS } from "@/lib/ui-presets"
import { useWriteAccess } from "@/components/billing/ReadOnlyGate"
import { cn } from "@/lib/utils"
import { showToast } from "@/lib/toast"
import { bubbleSeen, celebrated, hasAnyLog, markBubbleSeen, markCelebrated } from "@/lib/home/firstRun"
import { FirstDoseModal } from "@/components/home/FirstDoseModal"
import { HomeJournal } from "@/components/home/HomeJournal"

import { useCloudHydration } from "@/components/home/useCloudHydration"
import { SkeletonSwap } from "@/components/feel/Skeleton"
import { HomeSkeleton } from "@/components/home/HomeSkeleton"
import { useArrivedFromSkeleton, useSkeletonOnScreen } from "@/components/feel/Skeleton"
import { getStripOpen, subscribeStripOpen, writeStripOpen } from "@/lib/home/weekStripOpen"
import {
  getHydrationState,
  subscribeHydrationState,
  type HydrationState,
} from "@/lib/home/hydrationState"
import { PageScrollTitle } from "@/components/layout/PageScrollTitle"
import { WeekStrip, type WeekDay } from "@/components/home/WeekStrip"
import { HomeGreeting } from "@/components/home/HomeGreeting"
import { TodaysCycleCard } from "@/components/home/TodaysCycleCard"
import { LogFlowContext, rowKey } from "@/components/home/log/LogFlow"
import { TrackBar } from "@/components/home/log/TrackBar"
import { useLogRows } from "@/components/home/log/useLogRows"
import { AddStockSheet } from "@/components/protocol/AddStockSheet"
import { AddToStackMenu } from "@/components/navigation/add-to-stack-menu"
import type { StockRead } from "@/lib/db/inventory"
import { dayLong } from "@/lib/format/date"
import { pauseUndoable, pausesEndedBy } from "@/lib/home/pauseUndo"
import {
  getOneOffsSnapshot,
  oneOffsOn,
  subscribeOneOffs,
  type OneOffDays,
} from "@/lib/home/oneOffLogs"
import {
  EMPTY_STACKS,
  getStacksSnapshot,
  memberIdsOn,
  subscribeStacks,
  type Stack,
} from "@/lib/home/stacks"
import { EmptyLogCard } from "@/components/home/EmptyLogCard"
import { InjectionSitesGlanceCard } from "@/components/home/InjectionSitesGlanceCard"
import { InjectionSitesSheet } from "@/components/home/InjectionSitesSheet"
import { CompoundDetailSheet } from "@/components/home/CompoundDetailSheet"
import type { PausedEntry } from "@/components/home/TodaysCycleCard"
import { PauseSheet } from "@/components/home/PauseSheet"
import {
  activePause,
  isPausedOn,
  resumeLabel,
  resumesOn,
} from "@/lib/home/pauses"
import { newId } from "@/lib/home/id"
import { AddCompoundSheet } from "@/components/home/AddCompoundSheet"
import type { BodySex, InjectionSiteRoute, InjectionSiteRow } from "@/lib/db/types"
import {
  dateKeyToDate,
  seedStack,
  toDateKey,
  type DateKey,
  type DayStatus,
  type DoseLog,
} from "@/lib/home/mockHomeData"
import type { Pause } from "@/lib/home/pauses"
import {
  archiveInStack,
  getStackSnapshot,
  isDueOnFor,
  isRunning,
  loadStack,
  majorityInjectionRoute,
  nextStartingCompound,
  doseAmountsOf,
  doseTimesOf,
  notifyStackChanged,
  pauseCompound,
  pauseCompounds,
  resolveScheduleOn,
  resumeCompound,
  resumePauseGroup,
  saveStack,
  subscribeStack,
  timesPerDayOf,
  type StackCompound,
} from "@/lib/home/stack"
import {
  getDoseLogsSnapshot,
  commitDoseOn,
  loggedCountFor,
  logDose,
  slotKey,
  nextUnloggedSlot,
  slotsForDay,
  subscribeDoseLogs,
  subscribeDoseSynced,
  unlogDose,
  type DayLogs,
} from "@/lib/home/doseLog"
import { resolveDrawSources, type DrawSourcesResult } from "@/lib/home/protocolSync"
import { remainingLabel } from "@/lib/containers/labels"
import { siteDaysSince } from "@/lib/home/siteRecency"
import { setSelectedDay } from "@/lib/home/selectedDay"
import { HalfLifeGlance } from "@/components/halflife/HalfLifeGlance"

const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
]

// Stable empty-logs reference for useSyncExternalStore's server snapshot.
const EMPTY_LOGS: DayLogs = {}

// Same, for one-offs — a fresh {} each render would loop the store.
const EMPTY_ONE_OFFS: OneOffDays = {}

// Stable empty reference so a day with no resolved vials doesn't remount the rows.
const EMPTY_DRAW_RESULT: DrawSourcesResult = { sources: {}, noVial: [] }


/**
 * Home / Dashboard. A pinned header (a sans "Dashboard" title + the selected
 * day's date + the week strip) over scrolling cards (Today's Log → Progress
 * photos). Selecting a day re-scopes the content and the date; logging a dose
 * flips that day's entry so the week dot updates, and
 * advances that compound's injection-site rotation. The stack + dose logs are
 * device-local; weight lives on its own view now (the quick-actions Weight tile),
 * and the reconstitution calculator has its own nav tab (`/calculator`, Spec 20).
 *
 * `serverTodayKey` is computed on the server so SSR + the first client render
 * match (no hydration drift); we then re-derive "today" from the DEVICE's local
 * clock (the server runs in UTC and can be a day off) and keep it current across
 * local midnight + app foreground — so the date always rolls over at the user's
 * midnight, never UTC's. The stack is read from storage AFTER mount (SSR is
 * deterministic), and the greeting reads the live clock.
 */
/** Local 24h "HH:mm" right now — the time a dose is actually being logged at. */
function hhmmNow(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

/* The week strip open/closed store lives in `lib/home/weekStripOpen.ts`. */

export function HomeScreen({
  todayKey: serverTodayKey,
  userId,
  firstName,
  injectionCatalogue,
  bodySex,
  trialBanner,
  notificationsBanner,
  previewStack,
  previewStacks,
  previewLogs,
  previewLogKnown,
  previewStock,
}: {
  todayKey: DateKey
  /** Scopes the device-local stack in localStorage. */
  userId: string
  /** First name for the greeting (from auth metadata; null = greet without a name). */
  firstName: string | null
  /** Injection-site catalogue (both routes) for the glance card + menu. Already
   *  narrowed to the sites that exist on `bodySex`'s body by the server. */
  injectionCatalogue: InjectionSiteRow[]
  /** Which figure every body map on Home draws (from the user's profile). */
  bodySex: BodySex
  /** "Your free trial ends …", rendered above the notifications prompt in the
   *  trial's final stretch. Sits HIGHER because it is time-bound and about
   *  money, where the notifications prompt is persistent and about setup. Both
   *  self-hide, so the two are never stacked for long. */
  trialBanner?: ReactNode
  /** Slim "Enable notifications" prompt, rendered above Today's Log. Self-hides
   *  (renders null) when there's nothing to do, so it never leaves a gap. */
  notificationsBanner?: ReactNode
  /** Dev-preview-only: inject the device-local compounds / stacks / dose log, so
   *  `/preview/home` can render a populated dashboard without signing in. The
   *  real screen reads all three from the device store. */
  previewStack?: StackCompound[]
  previewStacks?: Stack[]
  previewLogs?: DayLogs
  /** Dev-preview-only: hold the loading skeleton (false) to review it. */
  previewLogKnown?: boolean
  /** Dev-preview-only: the stock an open row's Stock panel shows. */
  previewStock?: StockRead
}) {
  /**
   * THE READ-ONLY GATE. Wraps the write-initiating handlers on this screen and
   * nothing else.
   *
   * GUARDED: the dose tick, the whole-stack tick, Skip. All three CREATE a dose
   * log. NOT GUARDED: un-ticking, un-ticking a stack, archiving a compound.
   * Those remove data the user already put in, which is theirs to do whatever
   * their subscription says (see `lib/billing/gate.ts`).
   */
  const { guard } = useWriteAccess()

  // "Today", corrected to the device's local date after mount (the server seed is
  // UTC and can read as yesterday/tomorrow). See the foreground/midnight sync
  // effect below.
  const [todayKey, setTodayKey] = useState<DateKey>(serverTodayKey)
  const today = useMemo(() => dateKeyToDate(todayKey), [todayKey])

  const [selectedKey, setSelectedKey] = useState<DateKey>(serverTodayKey)
  // The week strip is collapsible and DEFAULTS TO OPEN, with the choice kept
  // between sessions (Spec 02). Read lazily so SSR stays deterministic and the
  // first paint doesn't flash the wrong state.
  const stripOpen = useSyncExternalStore(
    subscribeStripOpen,
    getStripOpen,
    () => true // server: always open, so SSR is deterministic
  )
  const setStripOpen = (next: boolean | ((cur: boolean) => boolean)) =>
    writeStripOpen(typeof next === "function" ? next(getStripOpen()) : next)
  // False on the server and on the very first client render, true from the next
  // one — which is exactly when the stored state has been applied, so the strip
  // settles into place silently and only animates from a real user tap.
  const stripReady = useSyncExternalStore(
    subscribeStripOpen,
    () => true,
    () => false
  )
  // Which week the strip shows: 0 = current, -1 = last week, … Swipe to change,
  // capped at 0 so it stays a "look back" (never a future week).
  const [weekOffset, setWeekOffset] = useState(0)
  // Injection-site map (opened from the glance card) — a read-only view of the
  // rotation derived from the dose log. `mirrorTip` shows a one-time note that the
  // front view is mirrored, decided on the first-ever open (event-driven, so no
  // setState-in-effect).
  /** The compound whose Pause sheet is open, if any. */
  const [pauseTarget, setPauseTarget] = useState<StackCompound | null>(null)
  /** The STACK's name when the sheet was opened from a collapsed stack row —
   *  which heads it, and opens it on the whole-stack list. Null for a compound. */
  const [pauseAsStack, setPauseAsStack] = useState<string | null>(null)
  const [sitesOpen, setSitesOpen] = useState(false)
  const [mirrorTip, setMirrorTip] = useState(false)
  // Tapping a compound opens its detail; "Edit" from there opens the add sheet.
  const [detailTarget, setDetailTarget] = useState<StackCompound | null>(null)
  const [editTarget, setEditTarget] = useState<StackCompound | null>(null)
  /** The compound picker, from the empty log's "Add compound". */
  const [addOpen, setAddOpen] = useState(false)

  // The stack (per-compound dosing/schedule/rotation) lives in localStorage so it
  // survives reloads and a sibling (the add flow) can update it. `useSyncExternal-
  // Store` reads it: the seed stack on the server + during hydration (deterministic),
  // the stored stack on the client, re-reading whenever it changes.
  const liveStack = useSyncExternalStore(
    subscribeStack,
    () => getStackSnapshot(userId, seedStack),
    () => seedStack
  )
  const stack = previewStack ?? liveStack
  const activeStack = stack.filter((c) => !c.archived)
  // The user's stacks (Spec 05) — a display grouping over the same compounds.
  const liveStacks = useSyncExternalStore(
    subscribeStacks,
    () => getStacksSnapshot(userId),
    () => EMPTY_STACKS
  )
  const stacks = previewStacks ?? liveStacks

  // Open the injection-site views on whichever route the protocol actually uses
  // most (by compound count) — a mostly-Sub-Q stack shouldn't land on an empty IM
  // body. A soft default: the user can still toggle, and it re-derives next load.
  const defaultRoute = majorityInjectionRoute(activeStack)

  // Logged doses, persisted device-local so history survives reloads — same store
  // pattern as the stack. Shape: { dateKey: { compoundId: DoseLog } }.
  // ONE-OFFS for the selected day. Same external-store shape as the dose logs,
  // so a one-off added on the calendar shows on Home without a reload.
  const oneOffDays = useSyncExternalStore(
    subscribeOneOffs,
    () => getOneOffsSnapshot(userId),
    () => EMPTY_ONE_OFFS
  )

  const liveLogs = useSyncExternalStore(
    subscribeDoseLogs,
    () => getDoseLogsSnapshot(userId),
    () => EMPTY_LOGS
  )
  const logs = previewLogs ?? liveLogs
  // What is running TODAY (not the strip's selected day): the half-life glance.
  const runningNow = useMemo(
    () => stack.filter((c) => isRunning(c, todayKey)),
    [stack, todayKey]
  )
  const oneOffsToday = useMemo(
    () => oneOffsOn(oneOffDays, selectedKey),
    [oneOffDays, selectedKey]
  )

  // Restore the stack + dose logs from the user's Supabase account on load (and
  // migrate any local-only data up), so the protocol survives a PWA reinstall —
  // localStorage is just the device cache. Best-effort; runs once per user.
  useCloudHydration(userId)

  /**
   * IS THE LOG KNOWN YET? (feel pass §1)
   *
   * The server snapshot is always the empty seed, and a stored `[]` reads back
   * as nothing, so "no compounds" and "not loaded" used to look the same and the
   * first-run instructions flashed on every cold load. The log is known when the
   * device already has a stack (it renders at once), or when the first cloud
   * pull has settled either way. Until then: a skeleton, never the empty state.
   */
  const hydration = useSyncExternalStore<HydrationState>(
    subscribeHydrationState,
    () => getHydrationState(userId),
    () => "pending",
  )
  // Did the route's own skeleton just hand over? Then the title and strip are
  // already on screen and must not fade in again.
  const fromSkeleton = useArrivedFromSkeleton("dashboard")
  // The title, strip and skeleton the route's loading shell already drew
  // (including on a full page load) do not fade in again.
  const skeletonShown = useSkeletonOnScreen("dashboard")
  const logKnown =
    previewLogKnown ??
    (previewStack !== undefined || stack.length > 0 || hydration !== "pending")

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

  // Publish the day the strip is parked on so logging actions rendered OUTSIDE
  // this tree write to it too — the quick-actions FAB lives in the (app) shell
  // and used to hardcode "today", so back-scrolling the strip and logging from
  // the FAB silently landed the dose on today. Cleared on unmount so the
  // selection can never outlive this screen (see lib/home/selectedDay.ts).
  useEffect(() => {
    setSelectedDay(selectedKey)
    return () => setSelectedDay(null)
  }, [selectedKey])

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
    // Judged by the rule that was in force on THAT day, not the current one — an
    // alteration applies forward only, so a past rest day stays a rest day.
    const dayLogs = logs[key] ?? {}
    // In DOSES, not compounds: a compound due twice contributes two, so logging
    // one of them is `partial` rather than the whole day reading as done.
    const due = activeStack.filter((c) => isDueOnFor(c, date))
    const dueCount = due.reduce(
      (n, c) => n + timesPerDayOf(resolveScheduleOn(c, key).schedule),
      0,
    )
    if (dueCount === 0) {
      return Object.keys(dayLogs).length > 0 ? "logged" : "none"
    }
    const loggedCount = due.reduce((n, c) => n + loggedCountFor(dayLogs, c.id), 0)
    if (loggedCount === 0) return "missed"
    if (loggedCount >= dueCount) return "logged"
    return "partial"
  }

  /**
   * The soonest compound whose START DATE is still ahead of the selected day.
   *
   * A compound added with a future start is due on no day yet, so Today's Log
   * read "nothing scheduled" while the onboarding card had already gone (it is
   * gated on an empty stack). The compound then appeared in exactly ONE place in
   * the app, and the only reasonable reading of that screen was that the add had
   * failed. Naming it, and when it begins, is the whole fix.
   */
  const startsNext = nextStartingCompound(activeStack, selectedKey)

  /** Is anything scheduled on this day at all? Separate from `statusOf`, which
   *  reports POSITION (a future day is always "future"), so the strip can dim a
   *  rest day whether it has happened yet or not. */
  const hasDoseOn = (key: DateKey): boolean => {
    const date = dateKeyToDate(key)
    return activeStack.some((c) => isDueOnFor(c, date))
  }

  // Selected day's list: anything LOGGED that day (history — kept even after a
  // compound is archived) plus active compounds due that day. The injection site
  // is chosen in an open row's Site panel (Spec 19), not per compound here.
  const isToday = selectedKey === todayKey
  const selectedDate = dateKeyToDate(selectedKey)
  const selectedRows = logs[selectedKey] ?? {}
  /** Every compound in a stack ON THE SELECTED DAY — a paused member stays in
   *  its stack row rather than moving to the Paused section (Adrian,
   *  2026-08-07).
   *
   *  Dated, via `memberIdsOn`: membership is a set of SPELLS since the stack
   *  dating work, so a compound that has since left a stack must not be held out
   *  of the Paused section on the days after it left. */
  const stackMemberIds = new Set(
    stacks.flatMap((st) => memberIdsOn(st, selectedKey)),
  )
  /**
   * Stacks with EVERY member paused on the selected day.
   *
   * They leave the log entirely and collapse to one entry in Paused (Adrian,
   * 2026-08-07). A partly paused stack does not: its paused members stay in the
   * stack row, blacked out, because the running ones still need somewhere to be
   * and the stack still has something to say about the day.
   *
   * A stack with a LOG on the day is never fully paused for this purpose, even
   * if every member is — the day still has to show what was taken, which is the
   * same rule `dueIds` applies to a loose compound below.
   */
  const fullyPausedStacks = stacks
    .map((st) => {
      const members = memberIdsOn(st, selectedKey)
        .map((id) => stack.find((c) => c.id === id))
        .filter((c): c is StackCompound => c !== undefined && !c.archived)
      if (members.length === 0) return null
      if (members.some((c) => loggedCountFor(selectedRows, c.id) > 0)) return null
      if (!members.every((c) => isPausedOn(c.pauses, selectedKey))) return null
      return { stack: st, members }
    })
    .filter((x): x is { stack: Stack; members: StackCompound[] } => x !== null)
  /** Members of a fully paused stack — held out of the log, since the stack is
   *  represented once in Paused instead. */
  const fullyPausedIds = new Set(
    fullyPausedStacks.flatMap((g) => g.members.map((c) => c.id)),
  )
  const dueCompounds = stack.filter((c) => {
    // The membership rule itself lives in `lib/home/dayDoses.ts`, because the
    // desktop rail needs the SAME answer and a second copy of it drifted: the
    // rail dropped archived-with-a-log and historic slots, so the two rings
    // disagreed about the same day. See that file's header.
    if (belongsInDayLog(c, selectedRows, selectedDate)) return true
    // A PAUSED stack member is kept in the list so its stack still shows every
    // compound it contains; the row renders it blacked out and untickable. A
    // paused LOOSE compound is not — it moves to the Paused section instead.
    //
    // ...unless the WHOLE stack is paused, in which case there is nothing left
    // for the row to show and the stack appears once under Paused.
    //
    // Display only: these are paused, so `ringCounts` filters them out again
    // and they never reach the ring. That is why the shared rule above does not
    // carry this branch.
    if (fullyPausedIds.has(c.id)) return false
    return stackMemberIds.has(c.id) && isPausedOn(c.pauses, selectedKey)
  })
  const dueDoses = dueCompounds.map((c) => ({
    ...c,
    // `log` is slot 0's, unchanged — `slotKey(id, 0)` IS the bare compound id,
    // so every row that existed before slots reads back exactly as it did.
    log: selectedRows[c.id] ?? null,
    slots: slotsForDay(c, selectedKey, selectedRows),
    paused: isPausedOn(c.pauses, selectedKey),
  }))
  // Per-Dose Draw (Spec 21) — the backing vial per due compound, for the selected
  // day. Its own read because the today's-log is computed from the device stack +
  // logs and carries no inventory data. Resolved for `selectedKey`, not today, so a
  // back-dated row prices against the vial that was in use then.
  //
  // Derived at read time and never stored: an inventory edit, an undo, or a skip
  // reflows the draw with no extra action (Invariant 1). Re-runs when the day or the
  // due set changes — and on focus, so adding a vial on the Protocol tab and coming
  // back fills the slot in without a reload.
  const [drawState, setDrawState] = useState<{
    key: string
    result: DrawSourcesResult
  }>({ key: "", result: EMPTY_DRAW_RESULT })
  // Ring + dots for the SELECTED day, from the same `dueDoses` the log renders,
  // so the two can never disagree about what is due.
  // Counted in DOSES, not compounds. A compound due twice a day contributes two
  // of each, or the ring would read 100% with the evening dose still untaken.
  // A paused compound is not DUE, so it contributes nothing to the ring — it
  // would otherwise sit there permanently unlogged and hold the day below 100%.
  // Shared with the desktop rail (`lib/home/dayDoses.ts`), so the two rings
  // cannot report different numbers for the same day.
  const { logged: selectedLogged, dots: dayDots } = ringCounts(dueDoses)
  /**
   * What is paused on the selected day, collapsed for display.
   *
   * Two things this deliberately does, both of which the naive version got
   * wrong:
   *
   *  - **Archived compounds are excluded.** A soft-deleted compound keeps its
   *    pause rows, so counting them would inflate the number with things the
   *    user has already removed.
   *  - **A fully paused stack collapses to ONE entry**, rather than listing five
   *    members that all say the same thing. A partly paused stack does not — its
   *    paused members are genuinely separate from its running ones.
   */
  const dueIds = new Set(dueDoses.map((d) => d.id))
  const pausedEntries: PausedEntry[] = stack
    .filter(
      (c) =>
        !c.archived &&
        // Not already on screen above. A compound with a log on a backdated
        // pause's day stays in the day's list (showing what was taken), and
        // listing it down here as well rendered it twice.
        !dueIds.has(c.id) &&
        // A paused STACK MEMBER stays in its stack, blacked out, rather than
        // moving down here (Adrian, 2026-08-07) — its stack should keep showing
        // everything it contains. Only loose compounds move.
        !stackMemberIds.has(c.id) &&
        activePause(c.pauses, selectedKey) !== null,
    )
    .map((c) => ({
      compound: c,
      label: c.name,
      count: 1,
      resumesOn: resumesOn(c.pauses, selectedKey),
      resumeLabel:
        resumeLabel(c.pauses, selectedKey, dayLong) ?? "Indefinite",
    }))
  // A fully paused stack, as ONE entry. The return date is read from the FIRST
  // member and the entry acts on it: members paused in one action share a group
  // and agree, and members paused separately do not, in which case one date has
  // to be chosen and the first is the one the row is named after.
  const pausedStackEntries: PausedEntry[] = fullyPausedStacks.map(
    ({ stack: st, members }) => ({
      compound: members[0],
      label: st.name,
      count: members.length,
      // Carried so the row can OPEN and offer one member on its own, and so the
      // sheet can be headed with the stack rather than with `members[0]`.
      members,
      stackName: st.name,
      resumesOn: resumesOn(members[0].pauses, selectedKey),
      resumeLabel:
        resumeLabel(members[0].pauses, selectedKey, dayLong) ??
        "Indefinite",
    }),
  )

  const dueIdsKey = dueDoses.map((d) => d.id).sort().join(",")
  const drawKey = `${selectedKey}|${dueIdsKey}`
  useEffect(() => {
    if (!dueIdsKey) return
    let cancelled = false
    // The initial read and every focus read share this effect instance, so they all
    // carry the same `drawKey` and the key check below can't order them. Without a
    // token, a slow earlier read can land after a newer one and overwrite it — e.g.
    // add a vial, focus back, and the pre-vial response resolves last, dropping the
    // row to "add stock" while the vial sits in stock.
    let latestRequest = 0
    const read = async () => {
      const request = ++latestRequest
      try {
        const result = await resolveDrawSources(dueIdsKey.split(","), selectedKey)
        if (!cancelled && request === latestRequest) setDrawState({ key: drawKey, result })
      } catch {
        // A Server Action REJECTS client-side when the POST itself fails —
        // offline, a 5xx, or an action-id skew right after a deploy. Unhandled,
        // that surfaced as a rejection in the console and the dev overlay on the
        // most ordinary offline action there is. Swallowed deliberately: the
        // figures simply stay as they were, which is what a failed read means.
      }
    }
    void read()
    const onFocus = () => void read()
    window.addEventListener("focus", onFocus)
    // Re-read when a dose actually LANDS in Postgres. These figures are derived
    // by `v_inventory_math` from `dose_logs`, and the vial behind a dose is
    // usually resolved server-side, so ticking something cannot update them
    // locally — the screen has to ask again. Before this it only asked on mount,
    // on a day change and on focus, so ticking a stack left every "left in the
    // vial" figure untouched until the app was backgrounded and reopened, which
    // reads as the dose not having come off the stock at all.
    //
    // No debounce here on purpose. The signal is already coalesced AT THE
    // SOURCE, by counting writes still in flight — a five-member stack tick
    // fires it exactly once, when the last write settles. A timer cannot do that
    // job: Server Actions are serialized by Next, so consecutive writes are two
    // round trips apart, and any delay short enough to feel instant is far too
    // short to span them.
    const unsubscribe = subscribeDoseSynced(() => void read())
    return () => {
      cancelled = true
      unsubscribe()
      window.removeEventListener("focus", onFocus)
    }
  }, [drawKey, dueIdsKey, selectedKey])

  // Trust the resolved vials ONLY for the exact day + due-set they were read for.
  // Scrubbing the week strip re-reads, and until that lands the slot stays empty
  // rather than showing a draw priced against the previous day's vial — a wrong draw
  // is worse than no draw.
  const drawResult = drawState.key === drawKey ? drawState.result : EMPTY_DRAW_RESULT

  // Days since each site was last used, TODAY-relative and INCLUDING today — the
  // recency shading for the Injection-sites card + sheet (last pin brightest amber).
  // The Site panel's own day chips are selected-day relative and leave out the
  // dose being logged (`siteDaysBefore`, inside `useLogRows`).
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

  /** Commit a dose (fresh or edited) on the day its row belongs to. */
  function handleTracked(compoundId: string, log: DoseLog, day: string, slot = 0) {
    /**
     * ⚠️ GUARDED HERE TOO, not only at the tick that opens the row.
     *
     * A cold review found the hole: the tick is guarded, and "Log today's dose"
     * on the COMPOUND DETAIL SHEET was not — so a lapsed user reached this
     * function, `commitDoseOn` wrote `localStorage`, the server refused the
     * mirror, and the toast told them **"Saved on your device. Still syncing to
     * your account. We'll keep trying."**
     *
     * It never syncs. Not on reload, not on focus, not on an `online` event, and
     * NOT AFTER THEY RESUBSCRIBE. A dose on the phone that the cloud has refused
     * is exactly the two-sources-of-truth state `ReadOnlyGate.tsx` says the
     * client layer exists to prevent, and the message is a promise the app
     * cannot keep.
     *
     * The entry points are guarded as well, so a user meets the pop-up at the
     * door rather than after filling in a sheet. This is the backstop for every
     * route into the sheet, including ones added later.
     */
    if (!guard(() => {})) return
    // The very first dose of this account opens "First Dose Logged", once. Read
    // BEFORE the write, and only once the cloud history has settled, so a
    // returning user on a new phone is never greeted as new.
    const firstEver = hydration === "done" && !hasAnyLog(logs) && !celebrated(userId)
    commitDoseOn(userId, compoundId, log, day, day, slot)
    if (firstEver) {
      markCelebrated(userId)
      // After the tick's lift, so the row reads as logged under the scrim.
      window.setTimeout(() => setFirstDoseOpen(true), 420)
    }
    // The row's tick lifts once its row has closed (feel pass §8).
    trackedRef.current = { id: compoundId, slot, day }
  }

  /**
   * THE ROW'S TICK LIFTS AFTER TRACK (feel pass §8), on the dose that was just
   * tracked. Recorded at commit, played once the row has closed, cleared once
   * the lift has finished.
   */
  const trackedRef = useRef<{ id: string; slot: number; day: string } | null>(null)
  const [firstDoseOpen, setFirstDoseOpen] = useState(false)
  // First run: the bubble goes after the first tap and never comes back.
  const [bubbleGone, setBubbleGone] = useState(() => typeof window !== "undefined" && bubbleSeen(userId))
  const [popKey, setPopKey] = useState<string | null>(null)
  const popTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(popTimer.current), [])
  function playTrackedPop() {
    const t = trackedRef.current
    trackedRef.current = null
    if (!t) return
    setPopKey(`${t.id}|${t.slot}|${t.day}|${performance.now()}`)
    window.clearTimeout(popTimer.current)
    popTimer.current = window.setTimeout(() => setPopKey(null), 700)
  }

  /* ------------------------------------------------ Today's Log, Flow B */

  /** Stock added from an open row: the sheet over it, then the row reads its
   *  stock again. Also Home's compound sheet's Stock (consistency fix #4: open
   *  the Add stock sheet here rather than leaving Home). */
  const [stockSheetFor, setStockSheetFor] = useState<StackCompound | null>(null)
  const [stockReadKey, setStockReadKey] = useState(0)

  // FIRST RUN (build-brief-final §3.1): nobody has logged a dose on this
  // account yet, and the cloud history has settled, so the first due row's
  // circle gets the bubble. Today only.
  const firstDue = dueDoses.find((d) => !d.log && !d.paused)
  const firstRunKey =
    hydration === "done" && isToday && !bubbleGone && !hasAnyLog(logs) && firstDue ? rowKey(firstDue.id, 0) : null

  /**
   * The rows open in place, the tick logs on its second tap, and the Track bar
   * is the open row's action (`useLogRows`, shared with Quick log and the
   * Calendar's day, consistency fix #0).
   */
  const rows = useLogRows({
    day: selectedKey,
    todayKey,
    logs,
    guard,
    commit: (id, log, day, slot) => handleTracked(id, log, day, slot),
    remove: (id, day, slot) => handleRemove(id, day, slot),
    afterTrack: playTrackedPop,
    onAnyTick: () => {
      if (!firstRunKey) return
      markBubbleSeen(userId)
      setBubbleGone(true)
    },
    firstRunKey,
    catalogue: injectionCatalogue,
    bodySex,
    onAddStock: (c) => setStockSheetFor(c),
    stockReadKey,
    previewStock,
  })

  /** Remove a logged dose, on the day its row was drawn for (passed in, never
   *  the live selection, which can have moved since). */
  function handleRemove(compoundId: string, dateKey: string, slot = 0) {
    unlogDose(userId, dateKey, compoundId, slot)
  }

  /* ------------------------------------------------ toasts with Undo (§3.16) */

  /**
   * Resumes arrive one call per compound (the stack checklist loops), so they
   * are gathered for one tick and confirmed with ONE toast whose Undo puts every
   * one of them back.
   */
  const resumeBatch = useRef<{ compoundId: string; pause: Pause }[] | null>(null)
  function confirmResumed(ended: { compoundId: string; pause: Pause }[]) {
    if (!resumeBatch.current) {
      resumeBatch.current = []
      queueMicrotask(() => {
        const all = resumeBatch.current ?? []
        resumeBatch.current = null
        showToast("Resumed", {
          undo:
            all.length > 0
              ? () => {
                  // Pausing again with the very pause it ended: the store merges
                  // it back over the shortened one, which restores it exactly.
                  for (const e of all) pauseCompound(userId, e.compoundId, e.pause)
                  notifyStackChanged()
                }
              : undefined,
        })
      })
    }
    resumeBatch.current.push(...ended)
  }

  return (
    <>
      {/* Everything scrolls — each item fades + rises in on load, staggered. The
          shared scroll-title provides the date eyebrow, the large "Dashboard"
          heading, and the fade-in compact bar (same preset on every tab page). */}
      <div
        data-screen="dashboard"
        data-desktop-layout="grid"
        className="relative mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5"
      >
        {/* One rise per arrival (feel pass §1): the title and the week strip
            fade in where they stand, and only the content below them rises. */}
        <div data-area="title" className={cn(!skeletonShown && "animate-shortcut-fade")}>
          <PageScrollTitle
            title="Dashboard"
            eyebrow={dayLong(selectedKey)}
            action={
              // Collapse, calendar, profile — left to right (Spec 02).
              <div className="-mr-1 flex items-center">
                {/* The week opens in place, so its toggle is THE close arrow
                    (consistency fix #11): raised and pointing up while the
                    week is open, a plain down arrow while it is shut. */}
                <button
                  type="button"
                  onClick={() => setStripOpen((o) => !o)}
                  aria-expanded={stripOpen}
                  aria-label={stripOpen ? "Collapse the week" : "Expand the week"}
                  className={cn(PRESS.icon, "flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-[30px] w-[30px] items-center justify-center rounded-[9px] transition-[rotate,color] duration-300 ease-out motion-reduce:transition-none",
                      stripOpen ? "inst-ghost text-foreground" : "rotate-180",
                    )}
                  >
                    <CloseArrowIcon />
                  </span>
                </button>
                <Link
                  href="/calendar"
                  aria-label="Open calendar"
                  className={cn(PRESS.icon, "flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
                >
                  <CalendarDots className="h-5 w-5" aria-hidden />
                </Link>
                <Link
                  href="/profile"
                  aria-label="Open profile"
                  className={cn(PRESS.icon, "flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
                >
                  <User className="h-5 w-5" aria-hidden />
                </Link>
              </div>
            }
          />
        </div>

        {/* Collapsible (Spec 02). Kept MOUNTED so it animates both ways; `inert`
            while closed so its day buttons leave the tab order. */}
        <div
          className={cn(
            "grid",
            !skeletonShown && "animate-shortcut-fade",
            // The transition is suppressed until the store's first CLIENT read.
            // `useSyncExternalStore` prevents a hydration MISMATCH, not a wrong
            // first paint: the server snapshot is "open", so a user who collapsed
            // the strip would watch it render open and then animate shut on every
            // single load, shoving the page below it upward.
            stripReady &&
              "transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
          )}
          data-area="weekstrip"
          style={{ gridTemplateRows: stripOpen ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden" inert={!stripOpen}>
          <WeekStrip
            weekOffset={weekOffset}
            daysForOffset={daysForOffset}
            selectedKey={selectedKey}
            todayKey={todayKey}
            statusOf={statusOf}
            hasDoseOn={hasDoseOn}
            onSelect={setSelectedKey}
            onWeekChange={handleWeekChange}
            loading={!logKnown}
          />
          </div>
        </div>


        {/* The trial's final stretch, above the notifications prompt: it is
            time-bound and about money, and it disappears on its own. Wrapped so
            it animates in like every other block; renders null outside the
            window, so `space-y-5` never opens a gap. */}
        {trialBanner ? (
          <div data-area="banner" className="animate-home-up" style={{ animationDelay: "95ms" }}>
            {trialBanner}
          </div>
        ) : null}

        {/* Slim, persistent "Enable notifications" prompt (brings its own
            animate-home-up wrapper; renders null when there's nothing to do, so
            space-y-5 never opens a gap here). */}
        {notificationsBanner}

        <SkeletonSwap
          ready={logKnown}
          skeleton={skeletonShown ? <HomeSkeleton continued /> : <HomeSkeleton />}
          leaveOnMount={fromSkeleton}
        >
        <div data-area="log" className="animate-home-up" style={{ animationDelay: "0ms" }}>
          {stack.length === 0 ? (
            // First run has no Today's Log card to host the greeting, and that
            // is the one session where the greeting matters most — so it sits
            // above the empty card instead of vanishing.
            <div className="space-y-3">
              <HomeGreeting firstName={firstName} />
              {/* The + stays hidden until the first log, so the card ends in
                  the one action that fixes it (consistency fix #24). */}
              <EmptyLogCard onAdd={() => guard(() => setAddOpen(true))} />
            </div>
          ) : (
            // Flow B: the rows open in place, the tick logs on its second tap,
            // and the Track bar below is the open row's action.
            <LogFlowContext.Provider value={rows.flow}>
            <TodaysCycleCard
              progress={{ logged: selectedLogged, due: dayDots.length }}
              greeting={<HomeGreeting firstName={firstName} />}
              title={cycleTitle}
              dueDoses={dueDoses}
              startsNext={startsNext}
              /* The stack tick's fallback: a dose opens its row, which is
                 guarded there. Un-ticking below is NOT guarded: removing a
                 dose you logged is yours to do whatever your subscription says. */
              onLog={(dose, slot) => rows.flow.onOpen(dose, slot)}
              /* From the ROW, so the day is the one the row is rendered for. */
              onUnlog={(dose, slot) => handleRemove(dose.id, selectedKey, slot)}
              onOpenDetail={(dose) => setDetailTarget(dose)}
              drawSources={drawResult.sources}
              // Grouping is dated, so the card has to know WHICH day it is
              // drawing — a stack made today never reaches back over history.
              dayKey={selectedKey}
              popKey={popKey}
              paused={[...pausedStackEntries, ...pausedEntries]}
              // The ROW is the stack: the sheet opens headed with the stack's
              // name and already on the whole-stack list.
              onOpenPaused={(entry) => {
                setPauseTarget(entry.compound)
                setPauseAsStack(
                  entry.stackName != null && entry.count > 1
                    ? entry.stackName
                    : null,
                )
              }}
              // A member INSIDE an opened stack row is just that compound. It
              // still offers the whole stack from within its own sheet.
              onOpenPausedMember={(c) => {
                setPauseTarget(c)
                setPauseAsStack(null)
              }}
              // Off-plan entries for the SELECTED day. The card renders the
              // section only when this is non-empty — most days it is.
              oneOffs={oneOffsToday}
              stacks={stacks}
              // One tap logs every unlogged member. Each still writes its OWN
              // dose log through the same path a single tick uses, to the
              // SELECTED day — a stack is a grouping, never a shared entry.
              onLogStack={(members) => guard(() => {
                // The time a stack is logged is the time it was TAKEN, not the
                // time it was scheduled for. Using `schedule.timeOfDay` stamped
                // an 08:00 stack as 08:00 even when tapped at 22:00 — and where
                // a member has no set time at all it fell through to noon. On the
                // selected day's "today" that means the clock; back-dating has no
                // clock to read, so it falls back to the scheduled time, which is
                // the same rule a single row's Track uses.
                const time24 = selectedKey === todayKey ? hhmmNow() : ""
                for (const m of members) {
                  // One tap logs the NEXT unlogged dose of each member, not
                  // always its first. Without this, tapping a twice-daily
                  // member's stack in the evening overwrote the morning dose it
                  // had already recorded. A member already complete for the day
                  // returns null and is skipped rather than duplicated.
                  const resolved = resolveScheduleOn(m, selectedKey)
                  const slot = nextUnloggedSlot(
                    selectedRows,
                    m.id,
                    timesPerDayOf(resolved.schedule),
                  )
                  if (slot == null) continue
                  // THIS SLOT's planned amount, which is not always the
                  // compound's — an evening dose may be half the morning one
                  // (`supabase/protocol/021`).
                  const planned =
                    doseAmountsOf(resolved.schedule, resolved.dose)[slot] ?? m.dose
                  logDose(
                    userId,
                    selectedKey,
                    m.id,
                    {
                      amount: String(planned),
                      unit: m.unit,
                      time24:
                        time24 || doseTimesOf(resolved.schedule)[slot] || "",
                      // No site: a stack tick has no body map, and inventing one
                      // would corrupt the rotation view. Members needing a site are
                      // ticked individually, where the map is offered.
                      siteId: null,
                    },
                    slot,
                  )
                }
              })}
              // The mirror of `onLogStack`, and deliberately the same shape: each
              // slot is removed through the SAME `unlogDose` a single row's tick
              // uses, so the tombstone, the Postgres delete and the vial's
              // restored runway all behave identically whether one dose was
              // unticked or five. A stack is a grouping, never a shared entry.
              //
              // Which slots is not decided here — the row hands over exactly the
              // ones it means (never a paused member, never a Skipped dose).
              onUnlogStack={(targets) => {
                const day = selectedKey
                // What each removed dose WAS, so Undo puts back the very same
                // doses: amounts, times, sites and containers.
                const removed = targets.flatMap((t) => {
                  const log = logs[day]?.[slotKey(t.compound.id, t.slot)]
                  return log ? [{ id: t.compound.id, slot: t.slot, log }] : []
                })
                for (const t of targets) handleRemove(t.compound.id, day, t.slot)
                showToast("Unticked", {
                  undo: () => {
                    for (const r of removed) handleTracked(r.id, r.log, day, r.slot)
                  },
                })
              }}
            />
            </LogFlowContext.Provider>
          )}
        </div>

        {/* The half-life glance (H5): always NOW, whichever day the strip shows,
            because a level in the body is a fact about this moment. */}
        <div data-area="halflife" className="animate-home-up empty:hidden" style={{ animationDelay: "30ms" }}>
          <HalfLifeGlance compounds={runningNow} logs={logs} userId={userId} />
        </div>

        {/* The Today ring and Next dose widgets are gone (Adrian, round two:
            "none"; the final design has nothing between the half-life rail and
            the sites). The day's counts still fill the Log card's edge. */}

        {/* Injection sites — the muscle map at a glance (IM / Sub-Q); tap to choose
            your sites or see where you last pinned. */}
        <div data-area="sites" className="animate-home-up" style={{ animationDelay: "110ms" }}>
          <InjectionSitesGlanceCard
            daysSince={siteDaysSinceToday}
            recentSites={recentInjectionSites}
            bodySex={bodySex}
            defaultRoute={defaultRoute}
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

        {/* Journal — the last card (Spec 02). One tappable input that opens the
            existing journal surface for the SELECTED day, never today. The entry
            flow itself is unchanged.
            HIDDEN on a future day: the server refuses to journal one, and because
            the editor hides its date field there is nothing in the sheet the user
            could change to make the save succeed — the entry could only be
            abandoned. Logging a DOSE on a future day stays allowed, so the strip
            still scrolls forward; it is only journalling the server rejects. */}
        {selectedKey <= todayKey && (
        <div data-area="journal" className="animate-home-up" style={{ animationDelay: "165ms" }}>
          {/* The journal opens IN PLACE (build-brief-final §3.5), for the selected
              day; a new day starts it afresh. */}
          <HomeJournal key={selectedKey} userId={userId} dayKey={selectedKey} todayKey={todayKey} />
        </div>
        )}
        </SkeletonSwap>
      </div>

      <FirstDoseModal open={firstDoseOpen} onClose={() => setFirstDoseOpen(false)} />

      {/* The open row's action (A1). */}
      <TrackBar {...rows.bar} />

      {/* Add stock from a log row: a sheet OVER the open row, ending on the
          "Added" card, with no Refill offer (Adrian, 2026-09-24). The row reads
          its stock again once it lands. */}
      <AddStockSheet
        open={stockSheetFor !== null}
        onOpenChange={(o) => {
          if (!o) setStockSheetFor(null)
        }}
        userId={userId}
        refillFor={null}
        preselectFor={stockSheetFor?.id ?? null}
        refillType={null}
        editItem={null}
        onAdded={() => {
          setStockSheetFor(null)
          setStockReadKey((k) => k + 1)
        }}
      />

      {/* Tap a compound → its detail; Edit there opens the add sheet pre-filled.
          "Delete" stops future doses and keeps every logged dose — the only
          lifecycle verb there is (Spec 02). */}
      <CompoundDetailSheet
        open={detailTarget !== null}
        compound={detailTarget}
        // The ⋯ on a Flow B row: the row itself logs, so no Log button here.
        context="row"
        isToday={isToday}
        dateKey={selectedKey}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null)
        }}
        onPause={(c) => guard(() => {
          // Pausing EDITS THE PROTOCOL, which is on the gated list.
          setDetailTarget(null)
          setPauseTarget(c)
        })}
        // The container's REAL fill, from the same `v_inventory_math` figures
        // the Protocol storage card reads (Spec w2b-13, Step 7). Undefined when
        // this compound has no vial resolved, and the artwork then falls back to
        // the illustrative level rather than drawing an empty container.
        stock={(() => {
          const src = detailTarget
            ? drawResult.sources[detailTarget.id]
            : undefined
          if (!src) return undefined
          const fill =
            src.remainingBase != null && src.totalBase
              ? Math.max(0, Math.min(1, src.remainingBase / src.totalBase))
              : null
          return {
            fill,
            // ONE worded string, not a number plus a unit the caller guesses.
            // This built the unit itself and got two of three forms wrong: a tub
            // fell to `null` and read "990 left" with no unit at all, and an
            // oral used the raw stored value for "60 capsule left".
            label: remainingLabel({
              inventoryType: src.inventoryType,
              remainingDisplay: src.remainingDisplay,
              totalAmountUnit: src.oralForm,
            }),
            // A DrawSource only exists where a vial resolved, so reaching here
            // is itself the proof.
            exists: true,
          }
        })()}
        // The Add stock sheet Home already mounts, over Home, rather than
        // leaving for Protocol (consistency fix #4).
        onAddStock={(c) => {
          setDetailTarget(null)
          guard(() => setStockSheetFor(c))
        }}
        // SKIP — a record, not an absence. It writes a log with
        // `status: "skipped"`, so the day reads as dealt with rather than as a
        // dose forgotten, and stock does not move (`v_inventory_math`'s consumed
        // CTE has always filtered on `taken`).
        // What is on the day already, so the primary button can say "Log" or
        // "Edit" rather than both.
        todaysLog={detailTarget ? (selectedRows[detailTarget.id] ?? null) : null}
        onSkip={(c) => guard(() => {
          // A skip WRITES a dose log (status: "skipped"), so it is a write like
          // any other and is gated like one.
          const resolved = resolveScheduleOn(c, selectedKey)
          const slot = nextUnloggedSlot(
            selectedRows,
            c.id,
            timesPerDayOf(resolved.schedule),
          )
          // ⚠️ NULL means every dose of the day is already recorded. Falling
          // back to slot 0 here OVERWROTE a dose the user had taken — losing its
          // real amount, its real time and its injection site, with no
          // confirmation and no undo. Nothing to skip is not the same as skip
          // the first one.
          if (slot == null) return
          const day = selectedKey
          logDose(
            userId,
            day,
            c.id,
            {
              amount: String(
                doseAmountsOf(resolved.schedule, resolved.dose)[slot] ?? c.dose,
              ),
              unit: c.unit,
              time24: day === todayKey ? hhmmNow() : "",
              siteId: null,
              status: "skipped",
            },
            slot,
          )
          // Undo unskips: the skip record goes, and the dose is due again.
          showToast("Skipped", { undo: () => handleRemove(c.id, day, slot) })
        })}
        onEdit={(c) => {
          setDetailTarget(null)
          setEditTarget(c)
        }}
        // Stops it from the day the strip is parked on, not from today — the same
        // rule every other write on this screen follows.
        onArchive={(id) => {
          const name = stack.find((c) => c.id === id)?.name
          if (archiveInStack(userId, id, true, selectedKey)) showToast(name ? `${name} deleted` : "Deleted")
        }}
      />

      {/* The empty log's one action (the + is hidden until the first log). */}
      <AddToStackMenu open={addOpen} onOpenChange={setAddOpen} userId={userId} />

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

      {/* Injection-site menu — choose your sites / see where you last pinned. */}
      {/* Pause — the second and last lifecycle verb. A stack's members come
          along so "pause the whole stack" can list them; one action writes N
          pauses sharing a group id, which is what lets Resume restore only what
          it paused. */}
      <PauseSheet
        open={pauseTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setPauseTarget(null)
            setPauseAsStack(null)
          }
        }}
        compound={pauseTarget}
        // Set only when a collapsed STACK row was tapped, which is the one case
        // where the sheet must not name the compound it happens to act through.
        title={pauseAsStack ?? undefined}
        defaultStackMode={pauseAsStack !== null}
        todayKey={todayKey}
        // The day being VIEWED. `pausedEntries` is derived against it, so the
        // sheet has to judge "already paused" against the same day or tapping a
        // paused row on a past day opens a blank new-pause form.
        referenceKey={selectedKey}
        stackMembers={
          pauseTarget
            ? (
                stacks
                  .map((st) => memberIdsOn(st, selectedKey))
                  .find((ids) => ids.includes(pauseTarget.id)) ?? []
              )
                .filter((id) => id !== pauseTarget.id)
                .map((id) => stack.find((c) => c.id === id))
                .filter((c): c is StackCompound => c !== undefined)
            : []
        }
        onPause={(ids, range) => {
          const targets = ids
            .map((id) => stack.find((c) => c.id === id))
            .filter((c): c is StackCompound => c !== undefined)
          // Changing the dates of a pause already running is a save, not a pause.
          const editing = targets.some((c) => activePause(c.pauses, selectedKey) !== null)
          // Undo only when the pause stood alone (see `pauseUndoable`).
          const undoable = !editing && pauseUndoable(targets, range)
          let undo: (() => void) | undefined
          if (ids.length === 1) {
            pauseCompound(userId, ids[0], { id: newId(), ...range })
            if (undoable) undo = () => void resumeCompound(userId, ids[0], range.startedOn)
          } else {
            // One group id for the whole action, so resuming the stack later
            // restores exactly these and leaves a separately-paused member be.
            const groupId = newId()
            pauseCompounds(userId, ids, range, groupId, newId)
            if (undoable) undo = () => void resumePauseGroup(userId, groupId, range.startedOn)
          }
          notifyStackChanged()
          showToast(editing ? "Saved" : "Paused", {
            undo: undo
              ? () => {
                  undo?.()
                  notifyStackChanged()
                }
              : undefined,
          })
        }}
        onResume={(c, on, onlyThis) => {
          const active = activePause(c.pauses, on)
          // A group pause resumes as a GROUP, or the other members would stay
          // paused with no obvious way back.
          //
          // UNLESS the caller says otherwise: the stack checklist resumes each
          // ticked member on its own, because it has already listed every paused
          // member and an unticked one is a choice, not an oversight.
          // What this resume ends, remembered first so Undo can put it back.
          const group = active?.groupId && !onlyThis ? active.groupId : null
          const ended = pausesEndedBy(stack, on, group ? { groupId: group } : { compoundId: c.id })
          const ok = group ? resumePauseGroup(userId, group, on) : resumeCompound(userId, c.id, on)
          notifyStackChanged()
          if (ok) confirmResumed(ended)
        }}
      />

      <InjectionSitesSheet
        open={sitesOpen}
        onOpenChange={setSitesOpen}
        catalogue={injectionCatalogue}
        daysSince={siteDaysSinceToday}
        recentSites={recentInjectionSites}
        bodySex={bodySex}
        defaultRoute={defaultRoute}
        showMirrorTip={mirrorTip}
      />
    </>
  )
}
