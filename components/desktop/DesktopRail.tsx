"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"

import { NotePencil, Scales, Plus, ClipboardText } from "@/components/icons"
import { AddToStackMenu } from "@/components/navigation/add-to-stack-menu"
import { LogWeightPad } from "@/components/weight/LogWeightPad"
import { QuickTrackSheet } from "@/components/home/QuickTrackSheet"
import { useWriteAccess } from "@/components/billing/ReadOnlyGate"
import { CategoryIcon } from "@/components/compounds/CategoryIcon"
import { useIsDesktop } from "@/lib/desktop/breakpoint"
import { computeNextDose } from "@/lib/home/nextDose"
import { requestProgressAction } from "@/lib/progress/progressAction"
import { listStock, type StockItem } from "@/lib/db/inventory"
import { remainingLabel } from "@/lib/containers/labels"
import {
  getDoseLogsSnapshot,
  slotsForDay,
  subscribeDoseLogs,
  subscribeDoseSynced,
  type DayLogs,
} from "@/lib/home/doseLog"
import {
  getStackSnapshot,
  resolveScheduleOn,
  subscribeStack,
  type StackCompound,
} from "@/lib/home/stack"
import { isPausedOn } from "@/lib/home/pauses"
import { belongsInDayLog, ringCounts } from "@/lib/home/dayDoses"
import { toDateKey } from "@/lib/home/mockHomeData"
import { CARD_EYEBROW, DATA_MONO, METRIC_VALUE, UNIT_SUFFIX } from "@/lib/ui-presets"
import type { BodySex } from "@/lib/db/types"
import type { WeightUnit } from "@/lib/weight"
import { cn } from "@/lib/utils"

const EMPTY_STACK: StackCompound[] = []
const EMPTY_LOGS: DayLogs = {}

// Same geometry as Home's completion ring (DayStatusWidgets), so the two read as
// one instrument rather than two drawings of the same idea.
const RING_R = 16
const RING_C = 2 * Math.PI * RING_R

/** Lowest-runway vials worth standing on the rail. More than three is a list. */
const RUNWAY_SHOWN = 3

function formatDose(dose: number): string {
  return Number.isInteger(dose) ? String(dose) : dose.toFixed(2).replace(/0$/, "")
}

/** "20:00" → "8:00 pm". The app's one clock format. */
function clockLabel(time24: string): { time: string; suffix: string } | null {
  if (!time24) return null
  const [h, m] = time24.split(":").map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  const suffix = h < 12 ? "am" : "pm"
  const hour = h % 12 === 0 ? 12 : h % 12
  return { time: `${hour}:${String(m).padStart(2, "0")}`, suffix }
}

/**
 * THE RAIL — the right column of the desktop shell, and the single clearest
 * thing the extra width buys.
 *
 * ## Why it exists
 *
 * On a phone, "today" is a destination: you go to the Dashboard tab to see what
 * is due. On a laptop there is room for it to simply be PRESENT, so you can log
 * a dose while reading Progress, or check what is outstanding without leaving
 * the month you are looking at. That is not a phone interaction made bigger; it
 * is one a phone cannot have.
 *
 * ## Two states, one column
 *
 * This component is the STANDING state. The WORKING state is not a second
 * component: every bottom sheet in the app (`data-desktop="rail"`) docks into
 * this same column and covers it, which is why opening a compound on desktop
 * reads as "the rail is showing that now" rather than "a sheet appeared". See
 * `app/desktop.css` § 4.
 *
 * ## It is not a second Dashboard, and the difference is load-bearing
 *
 * The Dashboard is scoped to the SELECTED day and the week strip can be parked
 * on any of them. The rail is always TODAY and only ever shows what is
 * actionable now. So the two never contradict each other: one answers "what
 * about that day", the other "what about right now". Keeping that line is what
 * stops the rail becoming a duplicate.
 *
 * ## What it computes, and what it borrows
 *
 * Nothing here re-derives scheduling. `isDueOnFor`, `resolveScheduleOn`,
 * `slotsForDay` and `computeNextDose` are the same pure helpers the Dashboard
 * composes, so a change to what "due" means lands in both at once. The rail only
 * decides which of their answers is worth standing in a column.
 */
export function DesktopRail({
  userId,
  unit,
  bodySex,
  lastWeightKg = null,
  previewStack,
  previewLogs,
}: {
  userId: string
  unit: WeightUnit
  bodySex: BodySex
  /** The latest weigh-in (kg); Log weight opens the pad on it. */
  lastWeightKg?: number | null
  /** Dev-preview only: render the rail without a signed-in read. Same
   *  convention as `ProtocolScreen` / `ProgressScreen`. */
  previewStack?: StackCompound[]
  previewLogs?: DayLogs
}) {
  const isDesktop = useIsDesktop()
  const { guard } = useWriteAccess()

  const [quickTrackOpen, setQuickTrackOpen] = useState(false)
  const [weightOpen, setWeightOpen] = useState(false)
  // Where focus goes back to when the weight pad closes: the rail button that
  // opened it, if it had focus (a keyboard or a click in Chrome).
  const weightTrigger = useRef<HTMLElement | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [stock, setStock] = useState<StockItem[]>([])

  const liveStack = useSyncExternalStore(
    subscribeStack,
    () => (isDesktop ? getStackSnapshot(userId, EMPTY_STACK) : EMPTY_STACK),
    () => EMPTY_STACK,
  )
  const liveLogs = useSyncExternalStore(
    subscribeDoseLogs,
    () => (isDesktop ? getDoseLogsSnapshot(userId) : EMPTY_LOGS),
    () => EMPTY_LOGS,
  )
  const stack = previewStack ?? liveStack
  const logs = previewLogs ?? liveLogs

  /**
   * The device's own clock, not the server's.
   *
   * The server runs in UTC, so a `todayKey` seeded there is a day out for anyone
   * far enough east or west — the same trap `HomeScreen` documents. The rail
   * mounts in the browser, so it simply asks the browser, and re-asks when the
   * tab is brought back after midnight.
   */
  const [today, setToday] = useState(() => toDateKey(new Date()))
  useEffect(() => {
    const check = () => setToday(toDateKey(new Date()))
    check()
    const onVisible = () => {
      if (document.visibilityState === "visible") check()
    }
    document.addEventListener("visibilitychange", onVisible)
    // A tab left open across midnight would otherwise keep yesterday's due list.
    const timer = window.setInterval(check, 60_000)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.clearInterval(timer)
    }
  }, [])

  /**
   * Stock is a SERVER read (`v_inventory_math`), so it is fetched rather than
   * derived. The rail lives in the (app) layout and therefore mounts once and
   * survives every in-app navigation, so this is one round trip per session, not
   * one per page. It re-reads when a dose finishes syncing, which is the only
   * thing that moves a runway.
   */
  useEffect(() => {
    if (!isDesktop || previewStack) return
    let alive = true
    const load = () => {
      listStock()
        .then((rows) => {
          if (alive) setStock(rows)
        })
        .catch(() => {
          // Non-fatal. A rail with no runway section is a smaller loss than a
          // rail that throws, and `listStock` already returns [] on error.
        })
    }
    load()
    const unsubscribe = subscribeDoseSynced(load)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [isDesktop, previewStack])

  const todayDate = useMemo(() => {
    const [y, m, d] = today.split("-").map(Number)
    return new Date(y, (m ?? 1) - 1, d ?? 1)
  }, [today])

  /**
   * Today's dose slots, and whether each is logged.
   *
   * ⚠️ THE MEMBERSHIP RULE IS NOT WRITTEN HERE, ON PURPOSE.
   *
   * It used to be, and it was wrong in two ways that a cold review caught by
   * putting the two rings side by side: this filtered out archived compounds
   * before checking for a log (so deleting a compound you had already taken
   * today removed that dose from the count) and filtered out historic slots (so
   * cutting a compound from three doses a day to two un-counted this morning's
   * third). Both made the rail under-report, on the surface whose whole job is
   * saying what is still outstanding.
   *
   * `belongsInDayLog` and `ringCounts` are the Dashboard's own rule, extracted
   * to `lib/home/dayDoses.ts` so there is one of it. Do not reintroduce a filter
   * here; if the rule needs to change, change it there and both move together.
   */
  const { dueCount, loggedCount, dots } = useMemo(() => {
    if (!isDesktop) return { dueCount: 0, loggedCount: 0, dots: [] as StackCompound[] }
    const dayLogs = logs[today] ?? {}
    const entries = stack
      .filter((c) => belongsInDayLog(c, dayLogs, todayDate))
      .map((c) => ({
        id: c.id,
        category: c.category ?? "",
        paused: isPausedOn(c.pauses, today),
        slots: slotsForDay(c, today, dayLogs),
        compound: c,
      }))
    const counts = ringCounts(entries)
    // "Still due" lists COMPOUNDS with an unlogged slot, which is a display
    // choice and not part of the shared arithmetic. Paused ones are excluded
    // for the same reason `ringCounts` does not count them: they cannot be
    // logged, so offering them as outstanding work is a lie.
    const outstanding = entries
      .filter((e) => !e.paused && e.slots.some((s) => s.log == null))
      .map((e) => e.compound)
    return { dueCount: counts.due, loggedCount: counts.logged, dots: outstanding }
  }, [isDesktop, stack, logs, today, todayDate])

  const next = useMemo(
    () => (isDesktop ? computeNextDose(stack, logs, today, todayDate) : null),
    [isDesktop, stack, logs, today, todayDate],
  )

  /** Lowest runway first, and only vials that actually report one. */
  const runway = useMemo(
    () =>
      stock
        .filter((s) => s.dosesRemaining != null)
        .sort((a, b) => (a.dosesRemaining ?? 0) - (b.dosesRemaining ?? 0))
        .slice(0, RUNWAY_SHOWN),
    [stock],
  )

  const fill = dueCount === 0 ? 0 : loggedCount / dueCount
  const allDone = dueCount > 0 && loggedCount === dueCount
  const outstanding = Math.max(0, dueCount - loggedCount)
  const nextClock = next ? clockLabel(next.time24) : null

  return (
    <aside
      data-desktop-rail=""
      aria-label="Today"
      /* See the note in DesktopSidebar: the `hidden` ATTRIBUTE cannot be used
         here, because Tailwind's preflight makes it `display: none !important`.
         This pair is the same visibility with a cascade that can be beaten. */
      className="hidden desktop:flex"
    >
      {/* ---- the day, as a ring ---- */}
      <div className="flex items-center gap-3.5">
        <div className="relative h-14 w-14 shrink-0">
          <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90" aria-hidden>
            <circle
              cx="18"
              cy="18"
              r={RING_R}
              fill="none"
              stroke="var(--bg-surface-raised)"
              strokeWidth={2.5}
            />
            <circle
              cx="18"
              cy="18"
              r={RING_R}
              fill="none"
              /* ALWAYS AMBER, matching Home's ring exactly.
                 
                 This resolved to white at 100% on the argument that a finished
                 day should stop asking for attention. A cold review pointed out
                 the obvious consequence: at 3 of 3 the rail's ring went white
                 while the Dashboard's ring, 250px away on the same screen,
                 stayed amber. Two drawings of one fact, disagreeing.
                 
                 The Dashboard's is the reference — ui-context sanctions the
                 completion ring as the day's "live progress pulse" and says
                 nothing about it resolving. Inventing a variant on a new
                 surface is exactly the drift "new screens reuse the system"
                 exists to stop. If the white-when-done idea is worth having, it
                 is worth having on BOTH rings, and that is a change to the
                 documented beat rather than something to do on the side. */
              stroke="var(--accent-amber)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - fill)}
              className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-mono text-[0.6875rem] tabular-nums text-foreground">
              {loggedCount}
              <span className="text-text-subtle">/{dueCount}</span>
            </span>
          </div>
        </div>
        <div className="min-w-0">
          <h2 className={CARD_EYEBROW}>Today</h2>
          <p className="mt-1 truncate text-[0.8125rem] text-text-muted">
            {dueCount === 0
              ? "Nothing scheduled"
              : allDone
                ? "All logged"
                : `${outstanding} ${outstanding === 1 ? "dose" : "doses"} left`}
          </p>
        </div>
      </div>

      <div className="hairline-t" />

      {/* ---- what is next ---- */}
      <section>
        <h3 className={CARD_EYEBROW}>Next due</h3>
        {next ? (
          <>
            {nextClock ? (
              <p className={cn(METRIC_VALUE, "mt-2 text-[1.5rem]")}>
                {nextClock.time}
                <span className={UNIT_SUFFIX}> {nextClock.suffix}</span>
              </p>
            ) : (
              <p className={cn(METRIC_VALUE, "mt-2 text-[1.5rem]")}>Today</p>
            )}
            <p className="mt-1 flex items-center gap-2 text-[0.8125rem] text-foreground">
              <CategoryIcon category={next.compound.category ?? ""} className="h-3.5 w-3.5" />
              <span className="truncate">{next.name}</span>
            </p>
            <p className={cn(DATA_MONO, "mt-1 tracking-[0.08em] uppercase")}>
              {formatDose(next.dose)} {next.unit}
            </p>
            <button
              type="button"
              onClick={() => guard(() => setQuickTrackOpen(true))}
              className="mt-3.5 w-full rounded-full bg-accent-primary px-4 py-2 text-[0.8125rem] font-medium text-bg-base transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Log it
            </button>
          </>
        ) : (
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-text-muted">
            {dueCount === 0
              ? "Nothing is scheduled for today."
              : "Everything scheduled for today is logged."}
          </p>
        )}
      </section>

      {/* ---- still outstanding ---- */}
      {dots.length > 0 && next ? (
        <>
          <div className="hairline-t" />
          <section>
            <h3 className={CARD_EYEBROW}>Still due</h3>
            <ul className="mt-2.5 flex flex-col gap-2">
              {dots.slice(0, 5).map((c) => {
                const on = resolveScheduleOn(c, today)
                return (
                  <li key={c.id} className="flex items-center gap-2.5 text-xs">
                    <CategoryIcon category={c.category ?? ""} className="h-3.5 w-3.5" />
                    <span className="min-w-0 flex-1 truncate text-text-muted">{c.name}</span>
                    <span className={DATA_MONO}>
                      {formatDose(on.dose)} {on.unit}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      ) : null}

      {/* ---- stock runway ----
          Inventory, not health data, so a low vial is a fact about a box in a
          drawer and carries no state colour. The figures come from
          `v_inventory_math` and are never recomputed here (architecture
          invariant: no stored or re-derived values). */}
      {runway.length > 0 ? (
        <>
          <div className="hairline-t" />
          <section>
            <h3 className={CARD_EYEBROW}>Stock runway</h3>
            <ul className="mt-2.5 flex flex-col gap-2.5">
              {runway.map((s) => (
                <li key={s.id} className="flex items-baseline gap-2.5 text-xs">
                  <span className="min-w-0 flex-1 truncate text-text-muted">{s.compoundName}</span>
                  <span className={DATA_MONO}>
                    {remainingLabel(s) ??
                      `${s.dosesRemaining} ${s.dosesRemaining === 1 ? "dose" : "doses"}`}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/protocol"
              className="mt-3 inline-block text-xs text-text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Manage stock
            </Link>
          </section>
        </>
      ) : null}

      {/* ---- quick actions ----
          The FAB's menu, unpacked. On a phone these live behind a floating plus
          because there is nowhere to put six things; here there is a column, so
          they are simply visible. Same flows, same sheets, same writes. */}
      <div className="mt-auto pt-4">
        <div className="hairline-t mb-4" />
        <h3 className={CARD_EYEBROW}>Quick actions</h3>
        <div className="mt-2.5 flex flex-col gap-1">
          <RailAction icon={Plus} label="Log a dose" onClick={() => guard(() => setQuickTrackOpen(true))} />
          <RailAction
            icon={Scales}
            label="Log weight"
            onClick={() => {
              const el = document.activeElement
              weightTrigger.current = el instanceof HTMLElement && el !== document.body ? el : null
              guard(() => setWeightOpen(true))
            }}
          />
          <RailAction
            icon={NotePencil}
            label="Write journal"
            onClick={() => guard(() => requestProgressAction("journal-write", today))}
            href="/progress"
          />
          <RailAction
            icon={ClipboardText}
            label="Bloodwork"
            onClick={() => requestProgressAction("bloodwork-gallery")}
            href="/progress"
          />
          <RailAction icon={Plus} label="Add a compound" onClick={() => guard(() => setAddOpen(true))} />
        </div>
      </div>

      {/* The layout-level flows, exactly the ones the FAB opens on a phone. They
          are the same components with the same props, so a dose logged from the
          rail and a dose logged from the FAB take literally the same path. */}
      <QuickTrackSheet
        open={quickTrackOpen}
        onOpenChange={setQuickTrackOpen}
        userId={userId}
        bodySex={bodySex}
      />
      <LogWeightPad
        open={weightOpen}
        onOpenChange={setWeightOpen}
        unit={unit}
        lastKg={lastWeightKg}
        returnFocusRef={weightTrigger}
      />
      <AddToStackMenu open={addOpen} onOpenChange={setAddOpen} userId={userId} />
    </aside>
  )
}

function RailAction({
  icon: Ico,
  label,
  onClick,
  href,
}: {
  icon: typeof Plus
  label: string
  onClick: () => void
  /** When the action's flow lives on another screen, go there after signalling. */
  href?: string
}) {
  const className =
    "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[0.8125rem] text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

  if (href) {
    return (
      <Link href={href} onClick={onClick} className={className}>
        <Ico className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
        {label}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      <Ico className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
      {label}
    </button>
  )
}
