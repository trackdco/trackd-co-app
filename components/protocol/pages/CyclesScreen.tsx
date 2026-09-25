"use client"

import Link from "next/link"
import { useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react"

import { Container } from "@/components/containers"
import { ConfirmDialog } from "@/components/feel/ConfirmDialog"
import { PopDialog } from "@/components/feel/PopDialog"
import { ListBlocks } from "@/components/feel/RouteSkeletons"
import { SkeletonGroup } from "@/components/feel/Skeleton"
import { SolidIcon } from "@/components/feel/SolidIcon"
import { useWriteAccess } from "@/components/billing/ReadOnlyGate"
import { useCloudHydration } from "@/components/home/useCloudHydration"
import { CaretRight } from "@/components/icons"
import { CycleRuleSheet } from "@/components/protocol/CycleRuleSheet"
import { CyclesTimeline, type TimelineCycle } from "@/components/protocol/CyclesTimeline"
import { Fold, SquareActions, SubpageShell } from "@/components/protocol/pages/Subpage"
import { CATEGORY_META, CATEGORY_DISPLAY_ORDER, type CompoundCategory } from "@/lib/compound-categories"
import { inventoryTypeForCompound, isVialForm } from "@/lib/containers/form"
import { endCycle, hiddenEndedCycles, subscribeHiddenEndedCycles, EMPTY_HIDDEN } from "@/lib/home/endedCycleActions"
import { getDoseLogsSnapshot, subscribeDoseLogs, type DayLogs } from "@/lib/home/doseLog"
import { getHydrationState, subscribeHydrationState, type HydrationState } from "@/lib/home/hydrationState"
import { toDateKey } from "@/lib/home/mockHomeData"
import { activePause, cyclePauseContext } from "@/lib/home/pauses"
import { cycleColourVar, type CycleRule } from "@/lib/protocol/cycleRule"
import { cycleFacts, cyclePatternText } from "@/lib/protocol/cyclePage"
import { STRIP_DAYS, onDaysIn } from "@/lib/protocol/cycleTimeline"
import { cyclesHintSeen, markCyclesHintSeen } from "@/lib/protocol/cyclesHint"
import { endedCycles } from "@/lib/protocol/endedCycles"
import { CATEGORY_GLYPH } from "@/lib/solidGlyphs"
import { showToast } from "@/lib/toast"
import { PRESS } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"
import {
  getStackSnapshot,
  isRunning,
  setCompoundCycle,
  subscribeStack,
  type Cadence,
  type StackCompound,
} from "@/lib/home/stack"

const EMPTY_STACK: StackCompound[] = []
const EMPTY_LOGS: DayLogs = {}

/** The schedule inside the End question: "daily", "every 3 days", "on Mon and Thu". */
function scheduleWords(cadence: Cadence): string {
  switch (cadence.type) {
    case "daily":
      return "daily"
    case "everyOtherDay":
      return "every other day"
    case "everyNDays":
      return cadence.n === 2 ? "every other day" : `every ${cadence.n} days`
    case "daysOfWeek": {
      const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      const days = [...cadence.days].sort((a, b) => a - b).map((d) => names[d] ?? "")
      if (days.length === 0) return "on its days"
      if (days.length === 1) return `on ${days[0]}`
      return `on ${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}`
    }
  }
}

interface Running {
  c: StackCompound
  rule: CycleRule
  colour: string
  paused: boolean
}

/**
 * Protocol → Cycles (build-brief-final §3.10). "Cycles ?" with the "+" (New
 * cycle) at top right.
 *
 * The list card groups the running cycles by type, every type folded, with
 * "Tap a type to see its cycles." until the first tap. A type's header shows its
 * mark, its name and a count, never the compounds. A row: the name, the pattern
 * in words, and the next 28 days as a strip. A tap on a row opens Edit and End.
 * Cycles whose compound is paused sit LAST, in a folded Paused group.
 *
 * End asks, then the compound carries on without weeks off and the cycle moves
 * to Ended ("Ended N ›" at the foot). Under the list, the Timeline.
 * Pause and Resume are not on this page (the event-actions spec).
 */
export function CyclesScreen({
  userId,
  backHref,
  endedHref = "/protocol/cycles/ended",
  previewCompounds,
}: {
  userId: string
  backHref?: string
  endedHref?: string
  previewCompounds?: StackCompound[]
}) {
  useCloudHydration(userId)
  const { guard } = useWriteAccess()
  const live = useSyncExternalStore(subscribeStack, () => getStackSnapshot(userId, EMPTY_STACK), () => EMPTY_STACK)
  const logs = useSyncExternalStore(subscribeDoseLogs, () => getDoseLogsSnapshot(userId), () => EMPTY_LOGS)
  const hidden = useSyncExternalStore(subscribeHiddenEndedCycles, () => hiddenEndedCycles(userId), () => EMPTY_HIDDEN)
  const hydration = useSyncExternalStore<HydrationState>(
    subscribeHydrationState,
    () => getHydrationState(userId),
    () => "pending",
  )
  const compounds = previewCompounds ?? live
  const known = previewCompounds !== undefined || compounds.length > 0 || hydration !== "pending"
  const todayKey = toDateKey(new Date())
  const active = useMemo(() => compounds.filter((c) => !c.archived), [compounds])

  const running = useMemo(() => {
    const out: Running[] = []
    for (const c of active) {
      if (!c.cycle) continue
      if (cycleFacts(c.cycle, todayKey, cyclePauseContext(c.pauses, c.cycle, todayKey)).ended) continue
      out.push({
        c,
        rule: c.cycle,
        colour: cycleColourVar(c.cycle.colour),
        paused: activePause(c.pauses, todayKey) !== null,
      })
    }
    return out
  }, [active, todayKey])

  const groups = useMemo(() => {
    const by = new Map<CompoundCategory, Running[]>()
    for (const r of running) {
      if (r.paused) continue
      by.set(r.c.category, [...(by.get(r.c.category) ?? []), r])
    }
    const out: { key: string; label: string; paused: boolean; category?: CompoundCategory; rows: Running[] }[] =
      CATEGORY_DISPLAY_ORDER.filter((k) => by.has(k)).map((k) => ({
        key: k,
        label: CATEGORY_META[k].label,
        paused: false,
        category: k,
        rows: by.get(k)!,
      }))
    const paused = running.filter((r) => r.paused)
    if (paused.length) out.push({ key: "paused", label: "Paused", paused: true, rows: paused })
    return out
  }, [running])

  const endedCount = useMemo(() => endedCycles(active, todayKey, hidden).length, [active, todayKey, hidden])
  const candidates = useMemo(() => active.filter((c) => !c.cycle && isRunning(c, todayKey)), [active, todayKey])

  // All folded, except a list with one type, which opens (nothing to choose).
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const groupOpen = (key: string) => openGroups[key] ?? (groups.length === 1 && key !== "paused")
  const [hintGone, setHintGone] = useState(() => typeof window !== "undefined" && cyclesHintSeen(userId))
  const [hintLeaving, setHintLeaving] = useState(false)
  const hintRef = useRef<HTMLParagraphElement>(null)
  const dropHint = () => {
    if (hintGone || hintLeaving) return
    markCyclesHintSeen(userId)
    const el = hintRef.current
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (!el || reduce) {
      setHintGone(true)
      return
    }
    setHintLeaving(true)
    el.animate(
      [
        { opacity: 1, height: `${el.offsetHeight}px` },
        { opacity: 0, height: "0px", paddingTop: "0px", paddingBottom: "0px" },
      ],
      { duration: 260, easing: "ease-in", fill: "forwards" },
    ).finished.then(() => setHintGone(true), () => setHintGone(true))
  }

  const [openRow, setOpenRow] = useState<string | null>(null)
  const [editing, setEditing] = useState<StackCompound | null>(null)
  const [ending, setEnding] = useState<Running | null>(null)
  const [picking, setPicking] = useState(false)

  const end = (r: Running) => {
    if (!endCycle(userId, r.c.id, todayKey)) {
      showToast("Couldn’t end it. Try again.")
      return
    }
    setOpenRow(null)
    showToast(`Cycle ended. ${r.c.name} carries on.`, {
      // Today's End version is replaced in place, so the run carries on as if
      // it had never ended.
      undo: () => void setCompoundCycle(userId, r.c.id, r.rule, todayKey),
    })
  }

  const timeline: TimelineCycle[] = useMemo(
    () => running.map((r) => ({ compound: r.c, rule: r.rule, colour: r.colour })),
    [running],
  )

  return (
    <SubpageShell
      screen="protocol-cycles"
      title="Cycles"
      backHref={backHref}
      explainer="cycles"
      action={{ label: "New cycle", onClick: () => guard(() => setPicking(true)) }}
    >
      {!known ? (
        <SkeletonGroup label="Loading your cycles" className="space-y-4">
          <ListBlocks cards={1} />
        </SkeletonGroup>
      ) : (
        <>
          <section className="animate-home-up inst-card px-4 py-1.5">
            {groups.length === 0 ? (
              <p className="py-3 text-[13.5px] text-text-muted">
                {active.length === 0 ? "Add a compound on Protocol first." : "No cycles running."}
              </p>
            ) : (
              <>
                {groups.length > 1 && !hintGone ? (
                  <p ref={hintRef} className="overflow-hidden pt-2.5 pb-1 text-[12px] text-text-muted">
                    Tap a type to see its cycles.
                  </p>
                ) : null}
                {groups.map((g, gi) => {
                  const open = groupOpen(g.key)
                  return (
                    <div key={g.key} className={cn(gi > 0 && "hairline-t border-border-default")}>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => {
                          dropHint()
                          setOpenGroups((s) => ({ ...s, [g.key]: !open }))
                        }}
                        className={cn(PRESS.row, "flex w-full items-center gap-2 py-3 text-left")}
                      >
                        {g.paused ? (
                          <SolidIcon name="pause" size={14} tone="off" />
                        ) : (
                          <SolidIcon
                            name={CATEGORY_GLYPH[g.category!] ?? "catPeptide"}
                            size={14}
                            hue={`var(--cat-${g.category})`}
                          />
                        )}
                        <span className="text-[13px] text-foreground">{g.label}</span>
                        <span className="font-mono text-[11.5px] text-text-muted">{g.rows.length}</span>
                        <span className="flex-1" />
                        <CaretRight className="cy-chev h-4 w-4 text-text-muted" aria-hidden />
                      </button>
                      <Fold open={open}>
                        {g.rows.map((r, i) => (
                          <CycleRow
                            key={r.c.id}
                            r={r}
                            first={i === 0}
                            todayKey={todayKey}
                            open={openRow === r.c.id}
                            onToggle={() => {
                              dropHint()
                              setOpenRow(openRow === r.c.id ? null : r.c.id)
                            }}
                            onEdit={() => guard(() => setEditing(r.c))}
                            onEnd={() => guard(() => setEnding(r))}
                          />
                        ))}
                      </Fold>
                    </div>
                  )
                })}
              </>
            )}
          </section>

          {timeline.length > 0 ? <CyclesTimeline cycles={timeline} logs={logs} todayKey={todayKey} /> : null}

          {endedCount > 0 ? (
            <Link
              href={endedHref}
              className={cn(PRESS.card, "animate-home-up inst-card flex items-center justify-between px-4 py-3.5 text-[13.5px] text-foreground")}
              style={{ animationDelay: "120ms" }}
            >
              <span>Ended</span>
              <span className="flex items-center gap-1.5 font-mono text-[12px] text-text-muted">
                {endedCount}
                <CaretRight className="h-4 w-4" aria-hidden />
              </span>
            </Link>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={ending !== null}
        onClose={() => setEnding(null)}
        title="End this cycle?"
        line={
          ending
            ? `${ending.c.name} keeps going, ${scheduleWords(ending.c.schedule.cadence)}, without weeks off. Your logs stay, and you can restart it from Ended.`
            : undefined
        }
        confirmLabel="End cycle"
        onConfirm={() => {
          if (ending) end(ending)
        }}
      />

      <PopDialog open={picking} onClose={() => setPicking(false)} title="New cycle">
        {candidates.length === 0 ? (
          <p className="mt-2 text-[13.5px] leading-snug text-text-muted">
            {active.length === 0 ? "Add a compound on Protocol first." : "Every compound is on a cycle."}
          </p>
        ) : (
          <div className="inst-rows mt-3 max-h-[50vh] overflow-y-auto">
            {candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setPicking(false)
                  setEditing(c)
                }}
                className={cn(PRESS.row, "flex w-full items-center gap-2.5 px-3 py-2.5 text-left")}
              >
                <Container
                  name={c.name}
                  inventoryType={inventoryTypeForCompound(c.name, c.method, c.inventoryForm)}
                  category={c.category}
                  fill={0.6}
                  size={22}
                />
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-foreground">{c.name}</span>
              </button>
            ))}
          </div>
        )}
      </PopDialog>

      <CycleRuleSheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        compoundName={editing?.name ?? ""}
        cycle={editing?.cycle ?? null}
        vialTracked={editing ? isVialForm(inventoryTypeForCompound(editing.name, editing.method, editing.inventoryForm)) : false}
        onSave={(cycle) => {
          if (editing && cycle) {
            setCompoundCycle(userId, editing.id, cycle)
            showToast("Saved")
          }
          setEditing(null)
        }}
      />
    </SubpageShell>
  )
}

/** A running cycle: name, pattern, the next 28 days; opens onto Edit and End. */
function CycleRow({
  r,
  first,
  todayKey,
  open,
  onToggle,
  onEdit,
  onEnd,
}: {
  r: Running
  first: boolean
  todayKey: string
  open: boolean
  onToggle: () => void
  onEdit: () => void
  onEnd: () => void
}) {
  const strip = useMemo(
    () => onDaysIn(r.rule, r.c.pauses, todayKey, [0, STRIP_DAYS]),
    [r.rule, r.c.pauses, todayKey],
  )
  return (
    <div data-cycle={r.c.id} className={cn(!first && "hairline-t border-border-default")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(PRESS.row, "flex w-full items-center gap-2.5 py-2.5 text-left")}
      >
        <span className={cn("flex shrink-0", r.paused && "opacity-45")}>
          <Container
            name={r.c.name}
            inventoryType={inventoryTypeForCompound(r.c.name, r.c.method, r.c.inventoryForm)}
            category={r.c.category}
            stackColour={r.colour}
            fill={0.6}
            size={22}
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13.5px] text-foreground">{r.c.name}</span>
          <span className="text-[11.5px] text-text-muted">{cyclePatternText(r.rule.pattern)}</span>
        </span>
        {r.paused ? (
          <span className="shrink-0 text-[11.5px] text-text-muted">Paused</span>
        ) : (
          <span aria-hidden className="cy-strip flex w-[74px] shrink-0 items-end gap-px" style={{ "--hue": r.colour } as CSSProperties}>
            {strip.map((on, d) => (
              <i key={d} data-on={on ? "true" : "false"} />
            ))}
          </span>
        )}
      </button>
      <Fold open={open} className="pb-3">
        <SquareActions
          actions={[
            { label: "Edit", icon: "edit", onClick: onEdit },
            { label: "End", icon: "end", destructive: true, onClick: onEnd },
          ]}
        />
      </Fold>
    </div>
  )
}
