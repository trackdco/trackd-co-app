"use client"

import { useMemo, useState, useSyncExternalStore, type CSSProperties } from "react"

import { Container } from "@/components/containers"
import { useCloudHydration } from "@/components/home/useCloudHydration"
import { CycleRuleSheet } from "@/components/protocol/CycleRuleSheet"
import {
  FTiles,
  PlainRow,
  PlusButton,
  QButtons,
  RCard,
  SubpageShell,
  XFig,
  XList,
  XRow,
  XSub,
  useOpenRow,
} from "@/components/protocol/pages/Subpage"
import { inventoryTypeForCompound, isVialForm } from "@/lib/containers/form"
import { cycleColourVar, formatCyclePattern } from "@/lib/protocol/cycleRule"
import { RHYTHM_CELL_MAX, cycleFacts, shortDate, type CycleFacts } from "@/lib/protocol/cyclePage"
import { cyclePauseContext } from "@/lib/home/pauses"
import { toDateKey } from "@/lib/home/mockHomeData"
import {
  cadenceLabel,
  getStackSnapshot,
  isRunning,
  setCompoundCycle,
  subscribeStack,
  type StackCompound,
} from "@/lib/home/stack"

const EMPTY_STACK: StackCompound[] = []

/**
 * Protocol → Cycles (Adrian, 2026-09-24). Each row draws its rhythm (a cell a
 * day, or one proportional bar for a long cycle, today marked) and the days on
 * or off left; it opens in place onto two tiles that never wrap, Pattern and
 * Started, then Edit · Remove. A "No cycle" card lists the rest, each with a +.
 * An ended cycle just ends and is hidden.
 */
export function CyclesScreen({
  userId,
  backHref,
  previewCompounds,
}: {
  userId: string
  backHref?: string
  previewCompounds?: StackCompound[]
}) {
  useCloudHydration(userId)
  const live = useSyncExternalStore(subscribeStack, () => getStackSnapshot(userId, EMPTY_STACK), () => EMPTY_STACK)
  const compounds = previewCompounds ?? live
  const todayKey = toDateKey(new Date())
  const active = useMemo(() => compounds.filter((c) => !c.archived), [compounds])

  const { cycled, uncycled } = useMemo(() => {
    const cycled: { c: StackCompound; f: CycleFacts }[] = []
    const uncycled: StackCompound[] = []
    for (const c of active) {
      if (!c.cycle) {
        if (isRunning(c, todayKey)) uncycled.push(c)
        continue
      }
      const f = cycleFacts(c.cycle, todayKey, cyclePauseContext(c.pauses, c.cycle, todayKey))
      if (!f.ended) cycled.push({ c, f })
    }
    return { cycled, uncycled }
  }, [active, todayKey])

  const [editing, setEditing] = useState<StackCompound | null>(null)
  const rows = useOpenRow()

  return (
    <SubpageShell screen="protocol-cycles" title="Cycles" backHref={backHref}>
      {cycled.length > 0 && (
        <XList>
          {cycled.map(({ c, f }) => {
            const colour = cycleColourVar(c.cycle!.colour)
            const off = !f.on
            const type = inventoryTypeForCompound(c.name, c.method, c.inventoryForm)
            const leftLabel = off ? "days off left" : "days on left"
            return (
              <XRow
                key={c.id}
                rowKey={c.id}
                open={rows.openKey === c.id}
                mini={rows.openKey !== null && rows.openKey !== c.id}
                onToggle={() => rows.toggle(c.id)}
                rowRef={rows.ref(c.id)}
                icon={
                  <span className={off ? "opacity-45" : undefined}>
                    <Container name={c.name} inventoryType={type} category={c.category} stackColour={colour} fill={off ? 0 : 0.62} size={34} />
                  </span>
                }
                name={c.name}
                sub={<Rhythm f={f} hue={colour} />}
                fig={f.daysLeft != null ? <XFig value={f.daysLeft} label={leftLabel} /> : undefined}
              >
                <FTiles
                  hue={colour}
                  tiles={[
                    f.daysLeft != null
                      ? { value: f.daysLeft, label: off ? "Days off left" : "Days on left" }
                      : { value: f.pending ? shortDate(c.cycle!.anchor) : "On", label: f.pending ? "Starts" : "Every due day" },
                    f.end,
                  ]}
                />
                <RCard rows={[["Pattern", formatCyclePattern(c.cycle!.pattern)], ["Started", shortDate(c.cycle!.anchor)]]} />
                <QButtons
                  actions={[
                    { label: "Edit", onClick: () => setEditing(c) },
                    { label: "Remove", destructive: true, onClick: () => setCompoundCycle(userId, c.id, null) },
                  ]}
                />
              </XRow>
            )
          })}
        </XList>
      )}
      {uncycled.length > 0 && (
        <XList label="No cycle" delay={60}>
          {uncycled.map((c) => (
            <PlainRow
              key={c.id}
              icon={
                <Container
                  name={c.name}
                  inventoryType={inventoryTypeForCompound(c.name, c.method, c.inventoryForm)}
                  category={c.category}
                  fill={0.62}
                  size={30}
                />
              }
              name={c.name}
              sub={<XSub>{cadenceLabel(c.schedule.cadence)}</XSub>}
              right={<PlusButton label={`Add a cycle to ${c.name}`} onClick={() => setEditing(c)} />}
            />
          ))}
        </XList>
      )}
      {cycled.length === 0 && uncycled.length === 0 && (
        <p className="px-1 text-sm text-text-muted">Nothing is running. Add a compound on Protocol first.</p>
      )}

      <CycleRuleSheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        compoundName={editing?.name ?? ""}
        cycle={editing?.cycle ?? null}
        vialTracked={editing ? isVialForm(inventoryTypeForCompound(editing.name, editing.method, editing.inventoryForm)) : false}
        onSave={(cycle) => {
          if (editing) setCompoundCycle(userId, editing.id, cycle)
          setEditing(null)
        }}
      />
    </SubpageShell>
  )
}

/** A cell a day with today ringed, or for a long cycle one bar with a tick. */
function Rhythm({ f, hue }: { f: CycleFacts; hue: string }) {
  if (f.onDays == null || f.offDays == null) return null
  const period = f.onDays + f.offDays
  const style = { "--hue": hue } as CSSProperties
  if (period <= RHYTHM_CELL_MAX) {
    return (
      <span aria-hidden className="x-rhy mt-[5px] grid max-w-[170px] auto-cols-fr grid-flow-col gap-[3px]" style={style}>
        {Array.from({ length: period }, (_, i) => (
          <i key={i} data-on={i < f.onDays! ? "true" : "false"} data-now={i === f.at ? "true" : "false"} />
        ))}
      </span>
    )
  }
  return (
    <span aria-hidden className="x-rhy relative mt-[5px] flex max-w-[170px] gap-[3px]" style={style}>
      <i data-on="true" style={{ flex: f.onDays }} />
      <i style={{ flex: f.offDays }} />
      {f.at != null && (
        <b
          className="absolute -top-[3px] h-3 w-0.5 rounded-[1px] bg-foreground"
          style={{ left: `calc(${(f.at / period) * 100}% - 1px)` }}
        />
      )}
    </span>
  )
}
