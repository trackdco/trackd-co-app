"use client"

import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react"

import { Container } from "@/components/containers"
import { AddStockSheet } from "@/components/protocol/AddStockSheet"
import { useWriteAccess } from "@/components/billing/ReadOnlyGate"
import { useCloudHydration } from "@/components/home/useCloudHydration"
import {
  FTiles,
  PlainRow,
  PlusButton,
  QButtons,
  SubpageShell,
  WhitePill,
  XFig,
  XList,
  XRow,
  XSub,
  useOpenRow,
} from "@/components/protocol/pages/Subpage"
import { cn } from "@/lib/utils"
import { PRESS } from "@/lib/ui-presets"
import {
  listStock,
  mixStockItem,
  openStockItem,
  setStockArchived,
  type StockItem,
  type StockRead,
} from "@/lib/db/inventory"
import { containerColour } from "@/lib/containers/colour"
import { containerNounTitle, remainingLabel } from "@/lib/containers/labels"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { getDoseLogsSnapshot, loggedCountFor, subscribeDoseLogs, subscribeDoseSynced, type DayLogs } from "@/lib/home/doseLog"
import { resolveProtocolCompoundIds } from "@/lib/home/protocolSync"
import { toDateKey } from "@/lib/home/mockHomeData"
import { getStackSnapshot, isRunning, subscribeStack, type StackCompound } from "@/lib/home/stack"
import { containersOf } from "@/lib/protocol/stockView"
import { runsDryInDays } from "@/lib/protocol/runsDry"
import { mixWaterDefault, needsMixing, runsDryText, stockSubLine } from "@/lib/protocol/stockPage"

const EMPTY_STACK: StackCompound[] = []
const EMPTY_LOGS: DayLogs = {}

/** What the page knows about one running compound's stock. */
interface Held {
  compound: StackCompound
  open: StockItem[]
  spares: StockItem[]
  inUse: StockItem | null
  dosesReady: number | null
  runsDryDays: number | null
  hue: string
}

/**
 * Protocol → Stock (Adrian, 2026-09-24). Every running compound with its
 * container IN USE at its real level and the doses it holds; a row opens in
 * place onto Doses left and Runs dry, its containers (the oldest open one marked
 * NEXT, then the spares grouped), and Add stock · Correct · Discard. Compounds
 * with nothing held sit in a "No stock" card. An ended compound's stock stays
 * hidden, as on Protocol. There is no foot "Add stock": every add is for one
 * compound, from its row.
 */
export function StockScreen({
  userId,
  backHref,
  previewRead,
}: {
  userId: string
  backHref?: string
  /** Dev-only: stock to show instead of reading it (keyed by client id). */
  previewRead?: StockRead
}) {
  useCloudHydration(userId)
  const { guard } = useWriteAccess()
  const stack = useSyncExternalStore(
    subscribeStack,
    () => (userId === "anon" ? EMPTY_STACK : getStackSnapshot(userId, EMPTY_STACK)),
    () => EMPTY_STACK,
  )
  const logs = useSyncExternalStore(subscribeDoseLogs, () => getDoseLogsSnapshot(userId), () => EMPTY_LOGS)
  const todayKey = toDateKey(new Date())
  const active = useMemo(() => stack.filter((c) => isRunning(c, todayKey)), [stack, todayKey])

  /* ---- the read: stock rows, and the client → server id map ---- */
  const [fetched, setFetched] = useState<{ read: StockRead; idMap: Record<string, string> } | null>(null)
  const [tick, setTick] = useState(0)
  const refresh = () => setTick((t) => t + 1)
  useEffect(() => subscribeDoseSynced(refresh), [])
  const activeKey = active.map((c) => c.id).join(",")
  useEffect(() => {
    if (previewRead || !userId || userId === "anon" || activeKey === "") return
    let cancelled = false
    void (async () => {
      const members = activeKey.split(",").map((id) => ({ id, name: active.find((c) => c.id === id)?.name ?? null }))
      const [read, idMap] = await Promise.all([listStock(), resolveProtocolCompoundIds(members)])
      if (!cancelled) setFetched({ read, idMap })
    })()
    return () => {
      cancelled = true
    }
    // Keyed on the ids, not the array, which changes identity on every read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, activeKey, previewRead, tick])
  const data = useMemo(
    () => (previewRead ? { read: previewRead, idMap: Object.fromEntries(active.map((c) => [c.id, c.id])) } : fetched),
    [previewRead, active, fetched],
  )

  const { held, none } = useMemo(() => {
    const held: Held[] = []
    const none: StackCompound[] = []
    if (!data?.read.ok) return { held, none }
    for (const c of active) {
      const pcId = data.idMap[c.id]
      const { open, spares, inUse } = pcId ? containersOf(data.read.items, pcId) : { open: [], spares: [], inUse: null }
      if (open.length === 0 && spares.length === 0) {
        none.push(c)
        continue
      }
      const agg = data.read.compounds.find((x) => x.protocolCompoundId === pcId)
      const dosesReady = agg ? agg.dosesReady : open.reduce<number | null>((n, v) => (v.dosesRemaining == null ? n : (n ?? 0) + v.dosesRemaining), null)
      held.push({
        compound: c,
        open,
        spares,
        inUse,
        dosesReady,
        runsDryDays: open.length > 0 ? runsDryInDays(c, dosesReady, todayKey, loggedCountFor(logs[todayKey], c.id)) : null,
        hue: containerColour({ category: c.category }),
      })
    }
    return { held, none }
  }, [data, active, logs, todayKey])

  /* ---- sheets ---- */
  const [addFor, setAddFor] = useState<StackCompound | null>(null)
  const [editItem, setEditItem] = useState<StockItem | null>(null)
  const rows = useOpenRow()
  const loading = activeKey !== "" && !data
  const failed = data != null && !data.read.ok

  return (
    <SubpageShell screen="protocol-stock" title="Stock" backHref={backHref}>
      {loading ? (
        <div aria-hidden className="sk h-[180px] rounded-2xl bg-bg-surface" />
      ) : failed ? (
        <p className="px-1 text-sm text-state-error">
          Couldn&apos;t load your stock.{" "}
          <button type="button" onClick={refresh} className={cn(PRESS.text, "text-foreground underline underline-offset-4")}>
            Try again
          </button>
        </p>
      ) : active.length === 0 ? (
        <p className="px-1 text-sm text-text-muted">Nothing is running. Add a compound on Protocol first.</p>
      ) : (
        <>
          {held.length > 0 && (
            <XList>
              {held.map((h) => (
                <StockRow
                  key={h.compound.id}
                  h={h}
                  todayKey={todayKey}
                  open={rows.openKey === h.compound.id}
                  mini={rows.openKey !== null && rows.openKey !== h.compound.id}
                  onToggle={() => rows.toggle(h.compound.id)}
                  rowRef={rows.ref(h.compound.id)}
                  onAdd={() => guard(() => setAddFor(h.compound))}
                  onCorrect={(item) => guard(() => setEditItem(item))}
                  onChanged={refresh}
                  guard={guard}
                />
              ))}
            </XList>
          )}
          {none.length > 0 && (
            <XList label="No stock" delay={60}>
              {none.map((c) => (
                <PlainRow
                  key={c.id}
                  icon={
                    <span className="opacity-50">
                      <Container
                        name={c.name}
                        inventoryType={inventoryTypeForCompound(c.name, c.method, c.inventoryForm)}
                        category={c.category}
                        fill={0}
                        size={30}
                      />
                    </span>
                  }
                  name={c.name}
                  right={<PlusButton label={`Add ${c.name} stock`} onClick={() => guard(() => setAddFor(c))} />}
                />
              ))}
            </XList>
          )}
        </>
      )}

      <AddStockSheet
        open={addFor !== null || editItem !== null}
        userId={userId}
        refillFor={null}
        preselectFor={editItem ? null : (addFor?.id ?? null)}
        refillType={
          editItem || !addFor
            ? null
            : (held.find((h) => h.compound.id === addFor.id)?.inUse?.inventoryType ?? null)
        }
        editItem={editItem}
        onOpenChange={(o) => {
          if (!o) {
            setAddFor(null)
            setEditItem(null)
          }
        }}
        onAdded={() => {
          setAddFor(null)
          setEditItem(null)
          refresh()
        }}
      />
    </SubpageShell>
  )
}

type Pick = { kind: "item"; id: string } | { kind: "mix" } | { kind: "open" }

function StockRow({
  h,
  todayKey,
  open,
  mini,
  onToggle,
  rowRef,
  onAdd,
  onCorrect,
  onChanged,
  guard,
}: {
  h: Held
  todayKey: string
  open: boolean
  mini: boolean
  onToggle: () => void
  rowRef: (el: HTMLElement | null) => void
  onAdd: () => void
  onCorrect: (item: StockItem) => void
  onChanged: () => void
  guard: (fn: () => void) => void
}) {
  const c = h.compound
  const type = h.inUse?.inventoryType ?? inventoryTypeForCompound(c.name, c.method, c.inventoryForm)
  const fillOf = (v: StockItem | null) =>
    v && v.remainingBase != null && v.totalBase ? Math.max(0, Math.min(1, v.remainingBase / v.totalBase)) : undefined
  const dry = h.spares.filter(needsMixing)
  const sealed = h.spares.filter((v) => !needsMixing(v))
  const runs = runsDryText(h.runsDryDays, todayKey)
  const low = runs?.low ?? false

  const [pick, setPick] = useState<Pick | null>(null)
  const current: Pick = pick ?? (h.open[0] ? { kind: "item", id: h.open[0].id } : dry.length ? { kind: "mix" } : { kind: "open" })
  const selectedItem =
    current.kind === "item" ? (h.open.find((v) => v.id === current.id) ?? h.open[0] ?? null) : null
  const [water, setWater] = useState(() => String(mixWaterDefault([...h.open, ...h.spares])))
  const [busy, setBusy] = useState(false)
  const waterWidth = water.length
  const [justStarted, setJustStarted] = useState<string | null>(null)

  const start = (kind: "mix" | "open") =>
    guard(() => {
      const target = (kind === "mix" ? dry : sealed)[0]
      const ml = Number.parseFloat(water)
      if (!target || (kind === "mix" && !(ml > 0))) return
      setBusy(true)
      void (kind === "mix" ? mixStockItem(target.id, ml, todayKey) : openStockItem(target.id, todayKey))
        .then((r) => {
          if (r.ok) {
            setJustStarted(target.id)
            setPick({ kind: "item", id: target.id })
            onChanged()
          }
        })
        .finally(() => setBusy(false))
    })

  const noun = (v: StockItem) =>
    containerNounTitle({ inventoryType: v.inventoryType, totalAmountUnit: v.totalAmountUnit, category: c.category, name: c.name })

  return (
    <XRow
      rowKey={c.id}
      open={open}
      mini={mini}
      onToggle={onToggle}
      rowRef={rowRef}
      icon={
        <>
          <Container name={c.name} inventoryType={type} category={c.category} fill={fillOf(h.inUse) ?? 0} size={34} />
          {h.spares.length > 0 && (
            <span className="absolute -top-0.5 -right-2.5 rounded-full bg-bg-surface-raised px-[5px] py-px font-mono text-[9.5px] text-foreground shadow-[0_0_0_1.5px_var(--bg-surface)]">
              +{h.spares.length}
            </span>
          )}
        </>
      }
      name={c.name}
      sub={<XSub>{stockSubLine(h.open, h.spares, h.inUse)}</XSub>}
      fig={h.dosesReady != null ? <XFig value={h.dosesReady} label="doses left" low={low} /> : undefined}
    >
      <FTiles
        hue={h.hue}
        tiles={[
          { value: h.dosesReady ?? "—", label: "Doses left", low },
          { value: runs?.text ?? "—", label: "Runs dry", low },
        ]}
      />
      <div className="x-vscroll -mx-0.5 flex gap-2 overflow-x-auto p-0.5" style={{ "--hue": h.hue } as CSSProperties}>
        {h.open.map((v, i) => {
          const on = current.kind === "item" && selectedItem?.id === v.id
          const next = i === 0 && h.open.length > 1
          const left = v.dosesRemaining != null ? `${v.dosesRemaining} ${v.dosesRemaining === 1 ? "dose" : "doses"} left` : (remainingLabel(v) ?? "Open")
          return (
            <button
              key={v.id}
              type="button"
              aria-pressed={on}
              onClick={() => setPick({ kind: "item", id: v.id })}
              className={cn(
                "x-vcard flex flex-col items-center gap-1.5 rounded-xl border bg-bg-surface px-1 pt-3 pb-2.5 text-[12.5px] text-foreground",
                on ? "border-text-primary" : "border-transparent",
                justStarted === v.id && "animate-hl-swap",
              )}
            >
              <Container name={c.name} inventoryType={v.inventoryType} category={c.category} fill={fillOf(v) ?? 0} size={52} />
              {noun(v)} {i + 1}
              <small className="font-mono text-[9px] tracking-[0.06em] text-text-muted uppercase">{left}</small>
              {/* The one used first when two are open. Its own line: beside the
                  figure it wrapped, and WebKit clipped the figure. */}
              {next && <small className="-mt-1 font-mono text-[9px] tracking-[0.06em] text-foreground uppercase">Next</small>}
            </button>
          )
        })}
        {dry.length > 0 && (
          <SpareGroup
            count={dry.length}
            word="unreconstituted"
            sub="Mix first"
            on={current.kind === "mix"}
            onClick={() => setPick({ kind: "mix" })}
            art={<Container name={c.name} inventoryType={dry[0].inventoryType} category={c.category} fill={0} size={46} />}
          />
        )}
        {sealed.length > 0 && (
          <SpareGroup
            count={sealed.length}
            word="unopened"
            sub="Open first"
            on={current.kind === "open"}
            onClick={() => setPick({ kind: "open" })}
            art={<Container name={c.name} inventoryType={sealed[0].inventoryType} category={c.category} fill={1} size={46} />}
          />
        )}
      </div>
      {current.kind === "mix" && dry.length > 0 ? (
        <div className="animate-hl-swap flex items-center justify-center gap-2">
          <label className="flex items-center gap-1 rounded-full border border-border-strong px-2.5 py-[5px] font-mono text-[11px] text-foreground">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              value={water}
              onChange={(e) => setWater(e.target.value)}
              aria-label="BAC water, mL"
              style={{ width: `${Math.max(1, waterWidth)}ch` }}
                className="min-w-0 bg-transparent text-right outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            mL
          </label>
          <WhitePill onClick={() => start("mix")} disabled={busy || !(Number.parseFloat(water) > 0)}>
            Mix one
          </WhitePill>
        </div>
      ) : current.kind === "open" && sealed.length > 0 ? (
        <div className="animate-hl-swap flex justify-center">
          <WhitePill onClick={() => start("open")} disabled={busy}>
            Open one
          </WhitePill>
        </div>
      ) : (
        <QButtons
          actions={[
            { label: "Add stock", onClick: onAdd },
            { label: "Correct", onClick: () => selectedItem && onCorrect(selectedItem), disabled: !selectedItem },
            {
              label: "Discard",
              destructive: true,
              disabled: !selectedItem,
              onClick: () => {
                if (!selectedItem) return
                void setStockArchived(selectedItem.id, true).then(() => {
                  setPick(null)
                  onChanged()
                })
              },
            },
          ]}
        />
      )}
    </XRow>
  )
}

function SpareGroup({
  count,
  word,
  sub,
  on,
  onClick,
  art,
}: {
  count: number
  word: string
  sub: string
  on: boolean
  onClick: () => void
  art: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      data-group="true"
      className={cn(
        // Sized to its words ("9 unreconstituted"), never narrower than a
        // container card; the strip scrolls.
        "x-vcard flex flex-col items-center gap-1.5 rounded-xl border bg-bg-surface px-2.5 pt-3 pb-2.5 text-[12.5px] text-foreground",
        on ? "border-text-primary" : "border-transparent",
      )}
    >
      <span className="x-stackv flex justify-center">
        {art}
        {count > 1 && art}
        {count > 2 && art}
      </span>
      <span className="whitespace-nowrap">
        {count} {word}
      </span>
      <small className="font-mono text-[9px] tracking-[0.06em] text-text-muted uppercase">{sub}</small>
    </button>
  )
}
