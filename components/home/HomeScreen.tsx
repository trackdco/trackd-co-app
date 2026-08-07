"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { CalendarDots, CaretDown, NotePencil, User } from "@/components/icons"
import { requestProgressAction } from "@/lib/progress/progressAction"
import { computeNextDose } from "@/lib/home/nextDose"
import { CARD_EYEBROW } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

import { useCloudHydration } from "@/components/home/useCloudHydration"
import { PageScrollTitle } from "@/components/layout/PageScrollTitle"
import { WeekStrip, type WeekDay } from "@/components/home/WeekStrip"
import { HomeGreeting } from "@/components/home/HomeGreeting"
import { TodaysCycleCard } from "@/components/home/TodaysCycleCard"
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
import {
  DayStatusWidgets,
  type DayDot,
  type NextDoseInfo,
} from "@/components/home/DayStatusWidgets"
import { EmptyLogCard } from "@/components/home/EmptyLogCard"
import { InjectionSitesGlanceCard } from "@/components/home/InjectionSitesGlanceCard"
import { InjectionSitesSheet } from "@/components/home/InjectionSitesSheet"
import { LogDoseSheet } from "@/components/home/LogDoseSheet"
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
import {
  archiveInStack,
  getStackSnapshot,
  isDueOnFor,
  loadStack,
  majorityInjectionRoute,
  nextStartingCompound,
  doseAmountsOf,
  doseTimesOf,
  formatDateKeyShort,
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
  unlogDose,
  type DayLogs,
} from "@/lib/home/doseLog"
import { resolveDrawSources, type DrawSourcesResult } from "@/lib/home/protocolSync"
import { siteDaysSince } from "@/lib/home/siteRecency"
import { setSelectedDay } from "@/lib/home/selectedDay"

const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

// Stable empty-logs reference for useSyncExternalStore's server snapshot.
const EMPTY_LOGS: DayLogs = {}

// Same, for one-offs — a fresh {} each render would loop the store.
const EMPTY_ONE_OFFS: OneOffDays = {}

// Stable empty reference so a day with no resolved vials doesn't remount the rows.
const EMPTY_DRAW_RESULT: DrawSourcesResult = { sources: {}, noVial: [] }

function dayLabel(key: DateKey): string {
  const d = dateKeyToDate(key)
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

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

/* ------------------------------------------------ week-strip open/closed state */
/**
 * Whether the week strip is expanded, remembered between sessions and defaulting
 * to OPEN (Spec 02).
 *
 * A `useSyncExternalStore` rather than state synced in an effect: localStorage is
 * an external store, the server has no access to it, and an effect that reads it
 * on mount both trips the set-state-in-effect rule and paints once with the wrong
 * state before correcting itself. The server snapshot is the documented default,
 * so hydration matches whenever the user hasn't changed it.
 */
const STRIP_OPEN_KEY = "trackd.home.weekStripOpen"
const STRIP_OPEN_EVENT = "trackd:week-strip-open"

function getStripOpen(): boolean {
  if (typeof window === "undefined") return true
  try {
    return window.localStorage.getItem(STRIP_OPEN_KEY) !== "0"
  } catch {
    return true // storage off — the default stands
  }
}

function writeStripOpen(open: boolean): void {
  try {
    window.localStorage.setItem(STRIP_OPEN_KEY, open ? "1" : "0")
  } catch {
    /* storage full / off — the strip still works, it just won't be remembered */
  }
  window.dispatchEvent(new CustomEvent(STRIP_OPEN_EVENT))
}

function subscribeStripOpen(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(STRIP_OPEN_EVENT, cb)
  window.addEventListener("storage", cb)
  return () => {
    window.removeEventListener(STRIP_OPEN_EVENT, cb)
    window.removeEventListener("storage", cb)
  }
}

export function HomeScreen({
  todayKey: serverTodayKey,
  userId,
  firstName,
  injectionCatalogue,
  bodySex,
  notificationsBanner,
  previewStack,
  previewStacks,
  previewLogs,
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
  /** Slim "Enable notifications" prompt, rendered above Today's Log. Self-hides
   *  (renders null) when there's nothing to do, so it never leaves a gap. */
  notificationsBanner?: ReactNode
  /** Dev-preview-only: inject the device-local compounds / stacks / dose log, so
   *  `/preview/home` can render a populated dashboard without signing in. The
   *  real screen reads all three from the device store. */
  previewStack?: StackCompound[]
  previewStacks?: Stack[]
  previewLogs?: DayLogs
}) {
  const router = useRouter()

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
  const [logTarget, setLogTarget] = useState<{
    compound: StackCompound
    existing: DoseLog | null
    /** Which of the day's doses is being logged (Spec w2b-13, Step 5). */
    slot: number
  } | null>(null)
  // Injection-site map (opened from the glance card) — a read-only view of the
  // rotation derived from the dose log. `mirrorTip` shows a one-time note that the
  // front view is mirrored, decided on the first-ever open (event-driven, so no
  // setState-in-effect).
  /** The compound whose Pause sheet is open, if any. */
  const [pauseTarget, setPauseTarget] = useState<StackCompound | null>(null)
  const [sitesOpen, setSitesOpen] = useState(false)
  const [mirrorTip, setMirrorTip] = useState(false)
  // Tapping a compound opens its detail; "Edit" from there opens the add sheet.
  const [detailTarget, setDetailTarget] = useState<StackCompound | null>(null)
  const [editTarget, setEditTarget] = useState<StackCompound | null>(null)

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
  const oneOffsToday = useMemo(
    () => oneOffsOn(oneOffDays, selectedKey),
    [oneOffDays, selectedKey]
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
  // is chosen in the log sheet's body map (Spec 19), not per compound here.
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
    if (loggedCountFor(selectedRows, c.id) > 0) return true
    if (c.archived) return false
    if (isDueOnFor(c, selectedDate)) return true
    // A PAUSED stack member is kept in the list so its stack still shows every
    // compound it contains; the row renders it blacked out and untickable. A
    // paused LOOSE compound is not — it moves to the Paused section instead.
    //
    // ...unless the WHOLE stack is paused, in which case there is nothing left
    // for the row to show and the stack appears once under Paused.
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
  const countable = dueDoses.filter((d) => !d.paused)
  const selectedLogged = countable.reduce(
    (n, d) => n + d.slots.filter((s) => s.log != null).length,
    0,
  )
  const dayDots: DayDot[] = countable.flatMap((d) =>
    d.slots.map((s) => ({
      id: `${d.id}#${s.slot}`,
      category: d.category,
      logged: s.log != null,
    })),
  )
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
        resumeLabel(c.pauses, selectedKey, formatDateKeyShort) ?? "Indefinite",
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
      resumesOn: resumesOn(members[0].pauses, selectedKey),
      resumeLabel:
        resumeLabel(members[0].pauses, selectedKey, formatDateKeyShort) ??
        "Indefinite",
    }),
  )

  // The soonest UNLOGGED dose on the selected day, through the SHARED resolver.
  // A local sort here got this wrong: `timeOfDay` may legitimately be `""`, which
  // string-compares below every real time, so an untimed compound sorted FIRST and
  // sat permanently in the slot hiding every dose that did have a time.
  // `computeNextDose` already handles that (and resolves the dose as it was on the
  // day), and is pinned by a regression test.
  const next = computeNextDose(stack, logs, selectedKey, selectedDate)
  // "Everything is logged" and "nothing was ever scheduled" need different words,
  // so they are told apart by whether anything is DUE that day — not by whether a
  // log exists. `dueDoses` also contains compounds that merely have a log (kept as
  // history after a schedule change), which would otherwise read as "you're clear".
  const anyScheduled = dueCompounds.some(
    (c) => !c.archived && isDueOnFor(c, selectedDate)
  )
  const nextDoseInfo: NextDoseInfo = next
    ? { kind: "due", next }
    : { kind: "none", scheduledAny: anyScheduled }

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
      const result = await resolveDrawSources(dueIdsKey.split(","), selectedKey)
      if (!cancelled && request === latestRequest) setDrawState({ key: drawKey, result })
    }
    void read()
    const onFocus = () => void read()
    window.addEventListener("focus", onFocus)
    return () => {
      cancelled = true
      window.removeEventListener("focus", onFocus)
    }
  }, [drawKey, dueIdsKey, selectedKey])

  // Trust the resolved vials ONLY for the exact day + due-set they were read for.
  // Scrubbing the week strip re-reads, and until that lands the slot stays empty
  // rather than showing a draw priced against the previous day's vial — a wrong draw
  // is worse than no draw.
  const drawResult = drawState.key === drawKey ? drawState.result : EMPTY_DRAW_RESULT
  // Only compounds we looked up and CONFIRMED have no vial may offer "add stock" — not
  // a read still in flight, and not one whose query failed. Both of those say nothing.
  const noVialIds = useMemo(() => new Set(drawResult.noVial), [drawResult])

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

  /**
   * Commit a dose on the day the sheet says it lands on.
   *
   * `landsOn` is usually `openedOn`. When the user has changed the Date row it
   * is not, and the dose has to MOVE: writing the new day without clearing the
   * old one would leave two entries for one dose, which is exactly the
   * duplication the un-log path exists to prevent.
   */
  function handleTracked(
    compoundId: string,
    log: DoseLog,
    landsOn: string,
    openedOn: string,
    slot = 0
  ) {
    commitDoseOn(userId, compoundId, log, landsOn, openedOn, slot)
    // Follow the dose to its new day — but only AFTER the sheet has closed. The
    // sheet freezes the day it opened on for exactly this reason: moving the
    // selection while it is open used to remount it, wiping the success tick and
    // re-seeding every field from the schedule.
    if (landsOn !== openedOn) setPendingDay(landsOn as DateKey)
  }

  /** A day the committed dose moved to, applied once the sheet is out of the way. */
  const [pendingDay, setPendingDay] = useState<DateKey | null>(null)

  /**
   * Undo a logged dose — on the day the SHEET was showing, which the sheet
   * passes in.
   *
   * It used to read `selectedKey`, the live selection. Those agreed only by
   * accident; once the sheet froze the day it opened on, leaving it open across
   * midnight was enough to make Remove delete the NEXT day's dose and tombstone
   * it, while the one on screen survived.
   */
  function handleRemove(compoundId: string, dateKey: string, slot = 0) {
    unlogDose(userId, dateKey, compoundId, slot)
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
              // Collapse, calendar, profile — left to right (Spec 02).
              <div className="-mr-1 flex items-center">
                <button
                  type="button"
                  onClick={() => setStripOpen((o) => !o)}
                  aria-expanded={stripOpen}
                  aria-label={stripOpen ? "Collapse the week" : "Expand the week"}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CaretDown
                    aria-hidden
                    className={cn(
                      "h-5 w-5 transition-transform duration-300 ease-out motion-reduce:transition-none",
                      !stripOpen && "-rotate-90"
                    )}
                  />
                </button>
                <Link
                  href="/calendar"
                  aria-label="Open calendar"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CalendarDots className="h-5 w-5" aria-hidden />
                </Link>
                <Link
                  href="/profile"
                  aria-label="Open profile"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            "grid animate-home-up",
            // The transition is suppressed until the store's first CLIENT read.
            // `useSyncExternalStore` prevents a hydration MISMATCH, not a wrong
            // first paint: the server snapshot is "open", so a user who collapsed
            // the strip would watch it render open and then animate shut on every
            // single load, shoving the page below it upward.
            stripReady &&
              "transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
          )}
          style={{ animationDelay: "55ms", gridTemplateRows: stripOpen ? "1fr" : "0fr" }}
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
          />
          </div>
        </div>


        {/* Slim, persistent "Enable notifications" prompt (brings its own
            animate-home-up wrapper; renders null when there's nothing to do, so
            space-y-5 never opens a gap here). */}
        {notificationsBanner}

        <div className="animate-home-up" style={{ animationDelay: "110ms" }}>
          {stack.length === 0 ? (
            // First run has no Today's Log card to host the greeting, and that
            // is the one session where the greeting matters most — so it sits
            // above the empty card instead of vanishing.
            <div className="space-y-3">
              <HomeGreeting firstName={firstName} />
              <EmptyLogCard />
            </div>
          ) : (
            <TodaysCycleCard
              greeting={<HomeGreeting firstName={firstName} />}
              title={cycleTitle}
              dueDoses={dueDoses}
              startsNext={startsNext}
              onLog={(dose, slot) =>
                setLogTarget({ compound: dose, existing: null, slot })
              }
              /* From the ROW, so the day is the one the row is rendered for. */
              onUnlog={(dose, slot) => handleRemove(dose.id, selectedKey, slot)}
              onOpenDetail={(dose) => setDetailTarget(dose)}
              drawSources={drawResult.sources}
              noVialIds={noVialIds}
              // Carries WHICH compound, so Protocol opens straight onto its
              // add-stock sheet. Dropping the argument left the user at the top
              // of a scrolling row having to recognise the card again.
              onAddStock={(dose) =>
                router.push(`/protocol?stock=${encodeURIComponent(dose.id)}`)
              }
              // Grouping is dated, so the card has to know WHICH day it is
              // drawing — a stack made today never reaches back over history.
              dayKey={selectedKey}
              paused={[...pausedStackEntries, ...pausedEntries]}
              onOpenPaused={(entry) => setPauseTarget(entry.compound)}
              // Off-plan entries for the SELECTED day. The card renders the
              // section only when this is non-empty — most days it is.
              oneOffs={oneOffsToday}
              stacks={stacks}
              // One tap logs every unlogged member. Each still writes its OWN
              // dose log through the same path a single tick uses, to the
              // SELECTED day — a stack is a grouping, never a shared entry.
              onLogStack={(members) => {
                // The time a stack is logged is the time it was TAKEN, not the
                // time it was scheduled for. Using `schedule.timeOfDay` stamped
                // an 08:00 stack as 08:00 even when tapped at 22:00 — and where
                // a member has no set time at all it fell through to noon. On the
                // selected day's "today" that means the clock; back-dating has no
                // clock to read, so it falls back to the scheduled time, which is
                // the same rule the single-dose log sheet uses.
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
              }}
            />
          )}
        </div>

        {/* */}
        {/* The day's status — ring + next dose, both scoped to the SELECTED day
            (Spec 02). Always rendered: on a day with nothing scheduled the cards
            say so, which is information; a missing card is not. */}
        <div className="animate-home-up" style={{ animationDelay: "140ms" }}>
          <DayStatusWidgets
            // The card is selected-day scoped, so it names the day it is showing
            // rather than always saying "Today".
            title={isToday ? "Today" : WEEKDAYS[selectedDate.getDay()]}
            logged={selectedLogged}
            // DOSES, not compounds. `dueDoses.length` counted compounds while
            // `logged` and `dots` counted doses, so a twice-daily compound with
            // its morning dose ticked read "1 of 1" at 100% while the row below
            // it correctly said "1 of 2" — and a stack with a paused member
            // could never reach 100% at all. `dayDots` is built from exactly the
            // set `logged` is counted over, so using its length makes the three
            // agree by construction.
            due={dayDots.length}
            dots={dayDots}
            next={nextDoseInfo}
            paused={logTarget !== null}
          />
        </div>


        {/* Injection sites — the muscle map at a glance (IM / Sub-Q); tap to choose
            your sites or see where you last pinned. */}
        <div className="animate-home-up" style={{ animationDelay: "175ms" }}>
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
        <div className="animate-home-up" style={{ animationDelay: "195ms" }}>
          <section className="rounded-2xl bg-bg-surface p-5">
            <h2 className={CARD_EYEBROW}>Journal</h2>
            <button
              type="button"
              onClick={() => {
                requestProgressAction("journal-write", selectedKey)
                router.push("/progress")
              }}
              className="mt-3 flex w-full items-center gap-3 rounded-xl bg-bg-input px-4 py-3 text-left transition active:scale-[0.99]"
            >
              <NotePencil className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
              <span className="text-sm text-text-muted">How did today go?</span>
            </button>
          </section>
        </div>
        )}
      </div>

      <LogDoseSheet
        open={logTarget !== null}
        compound={logTarget?.compound ?? null}
        existing={logTarget?.existing ?? null}
        slot={logTarget?.slot ?? 0}
        // The dose lands on the day the strip is parked on, not necessarily today —
        // `handleTracked` already writes to `selectedKey`, and the sheet needs the
        // same day to default the time and name it back to the user.
        dateKey={selectedKey}
        todayKey={todayKey}
        siteLastUsedDays={siteLastUsedDays}
        bodySex={bodySex}
        onOpenChange={(open) => {
          if (!open) {
            setLogTarget(null)
            // The sheet is gone, so following a moved dose to its new day can no
            // longer remount it out from under the user.
            if (pendingDay) {
              setSelectedKey(pendingDay)
              setPendingDay(null)
            }
          }
        }}
        onTracked={handleTracked}
        onRemove={handleRemove}
        hasLogOn={(day) =>
          Boolean(
            logs[day]?.[slotKey(logTarget?.compound.id ?? "", logTarget?.slot ?? 0)]
          )
        }
      />

      {/* Tap a compound → its detail; Edit there opens the add sheet pre-filled.
          "Delete" stops future doses and keeps every logged dose — the only
          lifecycle verb there is (Spec 02). */}
      <CompoundDetailSheet
        open={detailTarget !== null}
        compound={detailTarget}
        isToday={isToday}
        dateKey={selectedKey}
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
            // Slot 0 — "Edit today's dose" means the day's FIRST dose. A
            // multi-dose compound's later doses are edited from their own
            // sub-rows, where it is unambiguous which one is meant.
            slot: 0,
          })
        }}
        onPause={(c) => {
          setDetailTarget(null)
          setPauseTarget(c)
        }}
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
            remaining: src.remainingDisplay,
            unit: src.inventoryType === "oral_solid" ? src.oralForm : null,
            // A DrawSource only exists where a vial resolved, so reaching here
            // is itself the proof.
            exists: true,
          }
        })()}
        onAddStock={(c) => {
          setDetailTarget(null)
          router.push(`/protocol?stock=${encodeURIComponent(c.id)}`)
        }}
        // SKIP — a record, not an absence. It writes a log with
        // `status: "skipped"`, so the day reads as dealt with rather than as a
        // dose forgotten, and stock does not move (`v_inventory_math`'s consumed
        // CTE has always filtered on `taken`).
        // What is on the day already, so the primary button can say "Log" or
        // "Edit" rather than both.
        todaysLog={detailTarget ? (selectedRows[detailTarget.id] ?? null) : null}
        onSkip={(c) => {
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
          logDose(
            userId,
            selectedKey,
            c.id,
            {
              amount: String(
                doseAmountsOf(resolved.schedule, resolved.dose)[slot] ?? c.dose,
              ),
              unit: c.unit,
              time24: selectedKey === todayKey ? hhmmNow() : "",
              siteId: null,
              status: "skipped",
            },
            slot,
          )
        }}
        onEdit={(c) => {
          setDetailTarget(null)
          setEditTarget(c)
        }}
        // Stops it from the day the strip is parked on, not from today — the same
        // rule every other write on this screen follows.
        onArchive={(id) => archiveInStack(userId, id, true, selectedKey)}
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

      {/* Injection-site menu — choose your sites / see where you last pinned. */}
      {/* Pause — the second and last lifecycle verb. A stack's members come
          along so "pause the whole stack" can list them; one action writes N
          pauses sharing a group id, which is what lets Resume restore only what
          it paused. */}
      <PauseSheet
        open={pauseTarget !== null}
        onOpenChange={(o) => {
          if (!o) setPauseTarget(null)
        }}
        compound={pauseTarget}
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
          if (ids.length === 1) {
            pauseCompound(userId, ids[0], { id: newId(), ...range })
          } else {
            // One group id for the whole action, so resuming the stack later
            // restores exactly these and leaves a separately-paused member be.
            pauseCompounds(userId, ids, range, newId(), newId)
          }
          notifyStackChanged()
        }}
        onResume={(c, on, onlyThis) => {
          const active = activePause(c.pauses, on)
          // A group pause resumes as a GROUP, or the other members would stay
          // paused with no obvious way back.
          //
          // UNLESS the caller says otherwise: the stack checklist resumes each
          // ticked member on its own, because it has already listed every paused
          // member and an unticked one is a choice, not an oversight.
          if (active?.groupId && !onlyThis) {
            resumePauseGroup(userId, active.groupId, on)
          } else {
            resumeCompound(userId, c.id, on)
          }
          notifyStackChanged()
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
