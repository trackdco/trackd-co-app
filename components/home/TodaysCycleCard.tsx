"use client"

import { useContext, useRef, useState, type ReactNode } from "react"

import { CaretRight, Pause, Plus } from "@/components/icons"
import { cn } from "@/lib/utils"
import { CARD_EYEBROW, DATA_MONO, PRESS, ROW_CHEVRON, ROW_META, ROW_NAME } from "@/lib/ui-presets"
import { CategoryIcon } from "@/components/compounds/CategoryIcon"
import { Container } from "@/components/containers"
import { Fold } from "@/components/protocol/pages/Subpage"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { formatDose } from "@/lib/format/dose"
import { dayShort } from "@/lib/format/date"
import type { DateKey } from "@/lib/home/mockHomeData"
import type { DrawSource } from "@/lib/home/draw"
import type { DayDose } from "@/lib/home/logRows"
import type { StackCompound } from "@/lib/home/stack"
import {
  isReflexReversal,
  stackLogTargets,
  stackProgress,
  stackUnlogTargets,
  type BulkTickKind,
  type BulkTickMark,
} from "@/lib/home/stackTicks"
import { partitionByStack, type Stack } from "@/lib/home/stacks"
import type { OneOffLog } from "@/lib/home/oneOffLogs"
import { paletteColourVar } from "@/lib/palette"
import { closeRowIn, LogEdge, LogFlowContext, type LogFlow } from "@/components/home/log/LogFlow"
import {
  DueAside,
  FlowDoseRow,
  FoldArrow,
  GroupDivider,
  RowsFold,
  TickMark,
  groupByType,
} from "@/components/home/log/FlowRow"

/**
 * One paused thing on the dashboard — a compound, or a whole stack collapsed to
 * a single entry.
 *
 * A fully paused STACK collapses to one row rather than listing five members,
 * because five greyed rows saying the same thing is not five pieces of
 * information.
 */
export interface PausedEntry {
  /** The compound this entry acts on. For a stack it is the first member, which
   *  is enough: the Pause sheet resolves the group from the pause itself. */
  compound: StackCompound
  /** What to call it — the compound's name, or the stack's. */
  label: string
  /** How many compounds this entry stands for. >1 = a collapsed stack. */
  count: number
  /** A collapsed stack's members, in order, so the row can open and let one be
   *  resumed on its own (Adrian, 2026-08-07). Absent on a loose compound. */
  members?: StackCompound[]
  /** The stack's name, for the sheet's heading. Opening a collapsed stack used
   *  to head the sheet "Resume Creatine" — the first member's name, which is a
   *  compound the user did not tap. */
  stackName?: string
  /** The day they come back, or null for an indefinite pause. */
  resumesOn: string | null
  /** How that return READS: a date when it is far off, a countdown once it is
   *  within a week, "Indefinite" when there is none. Resolved by the caller so
   *  the date formatting stays in one place. */
  resumeLabel: string
}

/**
 * One row in the Paused section.
 *
 * A loose compound is a single button that opens its Pause sheet. A collapsed
 * STACK is that button plus the fold arrow that opens its members, because
 * "resume the stack" and "resume just this one" are both things people want
 * (Adrian, 2026-08-07). Tapping the row itself is always the STACK; a member is
 * reached inside.
 */
function PausedRow({
  entry,
  onOpen,
  onOpenMember,
}: {
  entry: PausedEntry
  onOpen: () => void
  onOpenMember?: (compound: StackCompound) => void
}) {
  const [open, setOpen] = useState(false)
  const members = entry.members ?? []
  const isStack = entry.count > 1 && members.length > 0

  return (
    <li>
      <div className={cn(PRESS.row, "-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 opacity-50 transition-opacity hover:opacity-80")}>
        <button
          type="button"
          onClick={onOpen}
          className={cn(PRESS.rowPart, "flex min-w-0 flex-1 items-center gap-3 text-left")}
        >
          {/* A pause glyph where the tick would be — it names the state rather
              than leaving an empty ring that reads as an unticked dose. */}
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-muted"
          >
            <Pause className="h-3 w-3" weight="fill" />
          </span>
          <span className={cn(ROW_NAME, "min-w-0 flex-1")}>
            {entry.label}
            {/* A collapsed STACK says how many it stands for, or its name reads
                as a single compound you do not recognise. */}
            {entry.count > 1 && <span className="ml-1.5 text-text-muted">· {entry.count}</span>}
          </span>
          {/* A date while the return is far off, a countdown once it is within
              a week — see `resumeLabel`. */}
          <span className={cn(DATA_MONO, "shrink-0")}>{entry.resumeLabel}</span>
        </button>
        {isStack && (
          <FoldArrow
            open={open}
            onToggle={() => setOpen((v) => !v)}
            label={`${open ? "Hide" : "Show"} the compounds in ${entry.label}`}
          />
        )}
      </div>
      {isStack && (
        <Fold open={open}>
          <ul className="pb-1 pl-9">
            {members.map((m) => (
              <li key={m.id}>
                {/* Opens that member's own Pause sheet: it GOES somewhere. */}
                <button
                  type="button"
                  onClick={() => onOpenMember?.(m)}
                  className={cn(PRESS.rowPart, "flex w-full items-center gap-2 py-1.5 text-left opacity-60 transition-opacity hover:opacity-100")}
                >
                  <span className={cn(ROW_NAME, "min-w-0 flex-1")}>{m.name}</span>
                  <CaretRight className={ROW_CHEVRON} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </Fold>
      )}
    </li>
  )
}

/** A due compound plus its log state (the rows' shared shape, `DayDose`). */
export type DueDose = DayDose

interface TodaysCycleCardProps {
  /** Heading for the selected day — "Today's Log" or e.g. "Monday's Log". */
  title: string
  /** The greeting, rendered ABOVE the eyebrow (Spec 02). */
  greeting?: ReactNode
  dueDoses: DueDose[]
  /** Compounds paused on the selected day, with the day they come back. Never
   *  hidden — a hidden compound reads as a deleted one. */
  paused?: PausedEntry[]
  /** Tap a paused entry → its Pause sheet, where Resume lives. On a collapsed
   *  stack this is the WHOLE stack; `onOpenPausedMember` is one member. */
  onOpenPaused?: (entry: PausedEntry) => void
  /** Tap a paused member (inside a stack, or a paused stack member's row) →
   *  that compound's own Pause sheet (consistency fix #25). */
  onOpenPausedMember?: (compound: StackCompound) => void
  /** Things taken off-plan on the selected day (Spec w2b-13, Step 8). Shown
   *  ONLY when there are some. */
  oneOffs?: OneOffLog[]
  /** The soonest compound whose start date is still ahead, when nothing is due
   *  on the selected day. Null when there is none. */
  startsNext?: { name: string; startDate: string } | null
  /** Log one of a compound's doses (the stack tick's fallback). */
  onLog: (dose: StackCompound, slot: number) => void
  /** Untick a logged dose (the stack tick's fallback). */
  onUnlog: (dose: StackCompound, slot: number) => void
  /** The "⋯" → the compound's sheet, where every edit lives. */
  onOpenDetail: (dose: StackCompound) => void
  /** Per-Dose Draw (Spec 21) — the backing vial's facts per compound id. */
  drawSources: Record<string, DrawSource>
  /** `id|slot|day|nonce` of a dose just tracked: that row's tick lifts. */
  popKey?: string | null
  /** The day being rendered. Grouping is DATED: a stack only groups days from
   *  the day it was created (Spec 05 · dating). */
  dayKey: DateKey
  /** The user's stacks (Spec 05). Members render inside their stack row. */
  stacks?: Stack[]
  /** Log every unlogged member of a stack in one action. */
  onLogStack?: (members: StackCompound[]) => void
  /** Untick a whole stack: the exact slots to remove, already filtered by the
   *  row (paused members and Skipped doses are never in the list). */
  onUnlogStack?: (targets: { compound: StackCompound; slot: number }[]) => void
  /** The day's doses logged and due, for the card's edge (Flow B, L1). Absent =
   *  no edge. */
  progress?: { logged: number; due: number }
}

/**
 * One compound in the card: blacked out when it is a paused STACK MEMBER with
 * nothing logged (its tap opens its Pause sheet), else its Flow B row(s).
 */
function DoseRow({
  flow,
  dose,
  onOpenDetail,
  onOpenPaused,
  drawSource,
  popFor,
}: {
  flow: LogFlow
  dose: DueDose
  onOpenDetail: (dose: StackCompound) => void
  onOpenPaused?: (dose: StackCompound) => void
  drawSource: DrawSource | undefined
  popFor?: (id: string, slot: number) => string | null
}) {
  // PAUSED (a stack member only — see `DayDose.paused`). Untickable: nothing is
  // due. It stays in place so the stack keeps showing every compound it holds.
  // ⚠️ Only when NOTHING is logged: a backdated pause over a logged day must
  // still show what was taken, so that falls through to the normal row.
  if (dose.paused && dose.slots.every((s) => s.log == null)) {
    return (
      <li className="opacity-40">
        {/* One button, the whole row: a paused row opens its Pause sheet, as
            the Paused section's rows do (consistency fix #25). */}
        <button
          type="button"
          onClick={() => (onOpenPaused ?? onOpenDetail)(dose)}
          aria-label={`Resume ${dose.name}`}
          className={cn(PRESS.row, "-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-2 text-left")}
        >
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-muted"
          >
            <Pause className="h-3 w-3" weight="fill" />
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn("block line-through decoration-text-muted/60", ROW_NAME)}>{dose.name}</span>
            <span className={cn("mt-0.5 block", ROW_META)}>Paused</span>
          </span>
        </button>
      </li>
    )
  }
  return <FlowDoseRow flow={flow} dose={dose} drawSource={drawSource} onOpenDetail={onOpenDetail} popFor={popFor} />
}

/** An off-plan amount in the one dose format when it is a number. */
function oneOffAmount(o: OneOffLog): string {
  const n = Number.parseFloat(o.amount ?? "")
  if (o.amount && Number.isFinite(n)) return formatDose(n, o.unit)
  return o.amount ?? ""
}

/**
 * The hero card: the day scoped to the selected day, as a tick-off list grouped
 * by type (a type title folds its group). Every row is a Flow B row: the tick
 * opens it and logs it, the name opens it, the "⋯" opens the compound's sheet.
 * The host (Home) provides the `LogFlowContext` and the Track bar.
 */
export function TodaysCycleCard({
  title,
  dueDoses,
  paused,
  onOpenPaused,
  onOpenPausedMember,
  oneOffs,
  startsNext = null,
  onLog,
  onUnlog,
  onOpenDetail,
  drawSources,
  dayKey,
  popKey = null,
  stacks,
  onLogStack,
  onUnlogStack,
  greeting,
  progress,
}: TodaysCycleCardProps) {
  const flow = useContext(LogFlowContext)
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const toggleGroup = (cat: string, ids: string[]) => {
    if (flow && !folded.has(cat)) closeRowIn(flow, ids)
    setFolded((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }
  /** Is this slot the dose that was just tracked, on the day being shown? */
  const popFor = (id: string, slot: number): string | null => {
    if (!popKey) return null
    const [pid, pslot, pday] = popKey.split("|")
    return pid === id && Number(pslot) === slot && pday === dayKey ? popKey : null
  }
  // ONE partition, FOR THIS DAY: a member appears in its stack row and therefore
  // cannot also appear in a type section; a stack created after `dayKey` groups
  // nothing here, which is how the day looked when it was lived.
  const byId = new Map(dueDoses.map((d) => [d.id, d]))
  const { stacks: grouped, loose } = partitionByStack(
    dueDoses.map((d) => d.id),
    stacks ?? [],
    dayKey,
  )
  const looseDoses = loose.map((id) => byId.get(id)).filter((d): d is DueDose => Boolean(d))

  return (
    <section
      className="flow-card relative inst-card p-5"
      data-log-done={progress && progress.due > 0 && progress.logged >= progress.due ? "true" : undefined}
    >
      {progress ? <LogEdge logged={progress.logged} due={progress.due} /> : null}
      {greeting}
      <h2 className={cn(CARD_EYEBROW, greeting && "mt-3")}>{title}</h2>

      {dueDoses.length > 0 ? (
        flow ? (
        <div className="mt-4">
          {/* Stacks first — one row each, expandable to tickable members. */}
          {grouped.map(({ stack, memberIds }) => (
            <StackDoseRow
              key={stack.id}
              flow={flow}
              stack={stack}
              members={memberIds.map((id) => byId.get(id)).filter((d): d is DueDose => Boolean(d))}
              onLog={onLog}
              onUnlog={onUnlog}
              onOpenDetail={onOpenDetail}
              onOpenPaused={onOpenPausedMember}
              onLogStack={onLogStack}
              onUnlogStack={onUnlogStack}
              drawSources={drawSources}
              popFor={popFor}
            />
          ))}

          {groupByType(looseDoses).map((group) => {
            // ANY unlogged slot, not just slot 0, so a divider never reads
            // "Logged" over a "1 of 2". A paused member counts toward neither.
            const pending = group.doses.filter((d) => !d.paused && d.slots.some((s) => s.log == null)).length
            const open = !folded.has(group.cat)
            return (
              <div key={group.cat} className="mt-3 first:mt-2">
                <GroupDivider
                  mark={<CategoryIcon category={group.cat} className="h-3.5 w-3.5" />}
                  label={group.label}
                  aside={<DueAside pending={pending} />}
                  open={open}
                  onToggle={() => toggleGroup(group.cat, group.doses.map((d) => d.id))}
                />
                <RowsFold open={open}>
                  <ul className="px-1">
                    {group.doses.map((dose) => (
                      <DoseRow
                        key={dose.id}
                        flow={flow}
                        dose={dose}
                        onOpenDetail={onOpenDetail}
                        onOpenPaused={onOpenPausedMember}
                        drawSource={drawSources[dose.id]}
                        popFor={popFor}
                      />
                    ))}
                  </ul>
                </RowsFold>
              </div>
            )
          })}
        </div>
        ) : null
      ) : (
        <div className="mt-4 inst-rows px-4 py-6 text-center">
          {/* "Nothing scheduled" when the day had nothing on it (consistency
              fix #24). A compound with a FUTURE start date is named, or the
              add would look like it had failed. */}
          <p className="text-sm text-text-muted">Nothing scheduled</p>
          {startsNext ? (
            <p className="mt-1 text-sm text-text-muted">
              {startsNext.name} starts {dayShort(startsNext.startDate)}.
            </p>
          ) : null}
        </div>
      )}

      {/* PAUSED — its own group, at the very BOTTOM, so the things that still
          need logging sit above it (Adrian, 2026-08-07). Never hidden: a hidden
          compound reads as a deleted one. Stack members are NOT here: a paused
          member stays in its stack row, blacked out. */}
      {paused && paused.length > 0 && (
        <div className="mt-4 pt-3">
          <GroupDivider
            mark={<Pause className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />}
            label="Paused"
            // COMPOUNDS, not entries: a collapsed stack stands for several.
            aside={<span className="font-mono text-[11px] tabular-nums text-text-muted">{paused.reduce((n, p) => n + p.count, 0)}</span>}
          />
          <ul className="px-1">
            {paused.map((p) => (
              <PausedRow
                key={p.compound.id}
                entry={p}
                onOpen={() => onOpenPaused?.(p)}
                onOpenMember={onOpenPausedMember}
              />
            ))}
          </ul>
        </div>
      )}

      {/* ALSO LOGGED — off-plan entries, ONLY when there are some. Not drawn as
          rows: there is nothing to tap on them here (consistency fix #25), and
          the Calendar is where one is added or removed. */}
      {oneOffs && oneOffs.length > 0 && (
        <div className="mt-4 pt-3">
          <GroupDivider mark={<Plus className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />} label="Also logged" />
          <p className="px-1 pt-1 text-[13px] leading-relaxed text-text-muted">
            {oneOffs.map((o, i) => (
              <span key={o.id}>
                {i > 0 ? " · " : null}
                <span className="text-foreground">{o.label}</span>
                {oneOffAmount(o) ? <span className="font-mono"> {oneOffAmount(o)}</span> : null}
              </span>
            ))}
          </p>
        </div>
      )}
    </section>
  )
}

/**
 * A stack as ONE row on the dashboard (Spec 05, steps 6–8).
 *
 * Collapsed it shows the stack's name, its members' containers in the stack
 * colour, and a single tick that logs every unlogged member at once. The name
 * (or the arrow) opens the members, each individually tickable — so someone who
 * took two of three records exactly that.
 *
 * **Partial reads as partial, never as complete**: the tick only fills white
 * when every member is logged; part-way through it is a BARE white outline and
 * the row states the count in words.
 */
function StackDoseRow({
  flow,
  stack,
  popFor,
  members,
  onLog,
  onUnlog,
  onOpenDetail,
  onOpenPaused,
  onLogStack,
  onUnlogStack,
  drawSources,
}: {
  flow: LogFlow
  stack: Stack
  popFor?: (id: string, slot: number) => string | null
  members: DueDose[]
  onLog: (dose: StackCompound, slot: number) => void
  onUnlog: (dose: StackCompound, slot: number) => void
  onOpenDetail: (dose: StackCompound) => void
  onOpenPaused?: (dose: StackCompound) => void
  onLogStack?: (members: StackCompound[]) => void
  onUnlogStack?: (targets: { compound: StackCompound; slot: number }[]) => void
  drawSources: Record<string, DrawSource>
}) {
  const [open, setOpenState] = useState(false)
  const setOpen = (next: (o: boolean) => boolean) => {
    if (open && !next(open)) closeRowIn(flow, members.map((m) => m.id))
    setOpenState(next)
  }
  const colour = paletteColourVar(stack.colour)
  /**
   * The last whole-stack action and when it happened (see `isReflexReversal`).
   * A ref: it must not re-render, and is only read at the moment of a click.
   * `performance.now()`, because a wall clock can step backwards.
   */
  const lastBulk = useRef<BulkTickMark | null>(null)
  const reversingTooFast = (kind: BulkTickKind) => isReflexReversal(lastBulk.current, kind, performance.now())

  // Counted in DOSES, not members, and paused members count for nothing (the
  // rules live in `lib/home/stackTicks.ts`, where they are tested).
  const { logged, total, complete, partial } = stackProgress(members)
  /** What a whole-stack untick would remove — never a paused member, never a
   *  Skipped dose. */
  const unlogTargets = stackUnlogTargets(members)
  const canUnlogAll = complete && unlogTargets.length > 0

  /** Log every member that isn't logged yet (the next dose of each). */
  function logRemaining() {
    // A tap moments after an untick-all is the second half of a double-tap,
    // not a decision; refusing it keeps five edited doses from being replaced
    // by the plan. A deliberate re-tick a moment later still works.
    if (reversingTooFast("log")) return
    lastBulk.current = { at: performance.now(), kind: "log" }
    const unlogged = stackLogTargets(members)
    if (onLogStack) onLogStack(unlogged)
    else {
      for (const m of unlogged) {
        const next = m.slots.find((sl) => sl.log == null)
        if (next) onLog(m, next.slot)
      }
    }
  }

  /** Untick the whole stack — the mirror of `logRemaining`. */
  function unlogAll() {
    if (unlogTargets.length === 0) return
    if (reversingTooFast("unlog")) return
    lastBulk.current = { at: performance.now(), kind: "unlog" }
    if (onUnlogStack) onUnlogStack(unlogTargets)
    else for (const t of unlogTargets) onUnlog(t.compound, t.slot)
  }

  return (
    <div className="mt-3 first:mt-2">
      <GroupDivider
        mark={<span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colour }} aria-hidden />}
        label={stack.name}
        // A wholly paused stack has NOTHING live in it, so no "0 due" nag.
        aside={total === 0 ? <DueAside pending={0} settled="Paused" /> : <DueAside pending={complete ? 0 : total - logged} />}
      />

      {/* A finished stack dims exactly as a finished dose row does. */}
      <div
        className={cn(
          PRESS.row,
          "-mx-1 flex items-center gap-3 rounded-xl px-2 py-2 transition-opacity duration-200",
          complete && "opacity-60",
        )}
      >
        {total === 0 ? (
          // Nothing live to log, so the pause glyph rather than a dead tick.
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-muted"
          >
            <Pause className="h-3 w-3" weight="fill" />
          </span>
        ) : canUnlogAll ? (
          <button
            type="button"
            onClick={unlogAll}
            aria-label={`Untick the ${unlogTargets.length} logged ${unlogTargets.length === 1 ? "dose" : "doses"} in ${stack.name}`}
            className={cn(PRESS.tick, "inst-tick log-tick-on flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ease-out")}
          >
            <TickMark draw={false} />
          </button>
        ) : complete ? (
          // Complete with nothing the bulk control may touch (every live member
          // SKIPPED or historic): a mark, not a button that does nothing.
          <span aria-hidden className="inst-tick log-tick-on flex h-6 w-6 shrink-0 items-center justify-center rounded-full border">
            <TickMark draw={false} />
          </span>
        ) : (
          <button
            type="button"
            onClick={logRemaining}
            aria-label={partial ? `Log the remaining ${total - logged} in ${stack.name}` : `Log all of ${stack.name}`}
            className={cn(
              PRESS.tick,
              "inst-tick flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ease-out",
              // Partway reads as partway: the ring goes white without filling.
              partial ? "border-text-primary text-transparent" : "log-tick-due",
            )}
          >
            <TickMark draw={false} />
          </button>
        )}

        {/* The name opens the members in place (the arrow at the right too). */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          tabIndex={-1}
          className={cn(PRESS.rowPart, "flex min-w-0 flex-1 items-center gap-3 text-left")}
        >
          <span className="flex items-end gap-1">
            {members.map((m) => (
              <Container
                key={m.id}
                name={m.name}
                inventoryType={inventoryTypeForCompound(m.name, m.method, m.inventoryForm)}
                category={m.category}
                stackColour={colour}
                // Drops by a dose's worth when logged — all members move at once.
                fill={m.log ? 0.55 : 0.7}
                size={30}
              />
            ))}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn("block", ROW_NAME)}>{stack.name}</span>
            <span className={cn("mt-0.5 block", ROW_META)}>
              {total === 0 ? "Paused" : `${logged} of ${total} logged`}
            </span>
          </span>
        </button>

        <FoldArrow
          open={open}
          onToggle={() => setOpen((o) => !o)}
          label={`${open ? "Hide" : "Show"} the compounds in ${stack.name}`}
        />
      </div>

      {/* Kept MOUNTED so it animates both ways; inert while shut, so a keyboard
          user cannot log a dose they cannot see. */}
      <RowsFold open={open}>
        <ul className="px-1 pl-4">
          {members.map((dose) => (
            <DoseRow
              key={dose.id}
              flow={flow}
              dose={dose}
              onOpenDetail={onOpenDetail}
              onOpenPaused={onOpenPaused}
              drawSource={drawSources[dose.id]}
              popFor={popFor}
            />
          ))}
        </ul>
      </RowsFold>
    </div>
  )
}
