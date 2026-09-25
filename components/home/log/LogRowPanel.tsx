"use client"

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { Container } from "@/components/containers"
import { BodyMap } from "@/components/sites/BodyMap"
import { cn } from "@/lib/utils"
import { PRESS } from "@/lib/ui-presets"
import type { StockItem, StockRead } from "@/lib/db/inventory"
import type { BodySex, InjectionSiteRow } from "@/lib/db/types"
import { unitFamilyOk } from "@/lib/db/doseUnits"
import { containerColour } from "@/lib/containers/colour"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { containerNounTitle } from "@/lib/containers/labels"
import { readDoseSheet } from "@/lib/home/doseSheetRead"
import { decayWindow } from "@/lib/home/siteRecency"
import { siteLabel, sitesForSex } from "@/lib/home/siteCatalog"
import { formatTimeLabel, isInjectable, type StackCompound } from "@/lib/home/stack"
import { formatDateKeyShort } from "@/lib/home/stack"
import { clockHHMM, formatStepAmount, stepFor, type RowDraft } from "@/lib/home/logDraft"
import { containersOf } from "@/lib/protocol/stockView"
import { mixWaterDefault } from "@/lib/protocol/stockPage"
import { mixStockItem } from "@/lib/db/inventory"
import { useWriteAccess } from "@/components/billing/ReadOnlyGate"

export type LogTile = "site" | "stock" | "note"

/** What the Track bar covers at the bottom of the screen, with a little air. */
const TRACK_BAR_CLEAR_PX = 104

/** What the row knows about this compound's containers. */
type StockState =
  | { kind: "loading" }
  | { kind: "failed" }
  | {
      kind: "ready"
      open: StockItem[]
      spares: StockItem[]
      /** A back-dated day: the container in use THEN (null = none), and only it. */
      dateVialId?: string | null
    }

/* ------------------------------------------------------------------ icons */

/** The Site tile's figure; its dot is always amber, brighter once a site is set. */
function FigureIcon({ set }: { set: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="4.5" r="2.6" fill="currentColor" />
      <path d="M7.5 9.5c0-1.2 1-2 2.2-2h4.6c1.2 0 2.2.8 2.2 2V15h-2v6.5h-5V15h-2z" fill="currentColor" opacity=".5" />
      <circle cx="12" cy="12.2" r="2.1" fill="var(--accent-amber)" opacity={set ? 1 : 0.7} />
    </svg>
  )
}

/** The Note tile's card. */
function NoteIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" opacity=".6" />
      <path d="M8 8.5h8M8 12h8M8 15.5h5" />
    </svg>
  )
}

function UpArrow() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M2.5 7.5L6 4l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ----------------------------------------------------------------- panel */

/**
 * The row of a Today's Log dose, OPEN (Flow B, Adrian 2026-09-24): Dose on a
 * stepper, Time, then Site / Stock / Note tiles. A tile LIFTS (K3) and opens
 * its panel in place, in the inset; switching tiles drops the old content and
 * raises the new (S4) inside a panel that stays open, which closes only by its
 * up arrow (D2, the misclick guard). Nothing is logged until Track.
 */
export function LogRowPanel({
  compound,
  dateKey,
  todayKey,
  draft,
  onDraft,
  catalogue,
  siteLastUsedDays,
  bodySex,
  onTileChange,
  onAddStock,
  onSpare,
  readKey = 0,
  previewStock,
}: {
  compound: StackCompound
  dateKey: string
  todayKey: string
  draft: RowDraft
  onDraft: (patch: Partial<RowDraft>) => void
  catalogue: InjectionSiteRow[]
  siteLastUsedDays: Record<string, number>
  bodySex: BodySex
  /** A panel opened or closed: the other rows condense while one is open. */
  onTileChange: (open: boolean) => void
  onAddStock: () => void
  /** The picked container is an unopened spare, so Track must start it first. */
  onSpare: (id: string | null) => void
  /** Changes when stock was added from this row: read it again. */
  readKey?: number
  /** Dev-preview-only: stock to show instead of reading it. */
  previewStock?: StockRead
}) {
  const injectable = isInjectable(compound.method)
  const hue = containerColour({ category: compound.category })
  const inventoryType = inventoryTypeForCompound(compound.name, compound.method, compound.inventoryForm)

  /* ---- stock, read once when the row opens ---- */
  const [stock, setStock] = useState<StockState>({ kind: "loading" })
  // Mix 2 (Adrian, 2026-09-24): tap the unmixed vials, then Mix. The water
  // starts at what this compound was last mixed with and can be changed.
  const { guard } = useWriteAccess()
  const [armed, setArmed] = useState(false)
  const [water, setWater] = useState<string | null>(null)
  const [mixing, setMixing] = useState(false)
  const [mixTick, setMixTick] = useState(0)
  // The site list when the server's read came back empty: fetched here, as the
  // Log sheet did, so one failed read does not cost every dose its site.
  const [fetchedCatalogue, setFetchedCatalogue] = useState<InjectionSiteRow[] | null>(null)
  const needCatalogue = injectable && catalogue.length === 0 && !previewStock
  const onToday = dateKey === todayKey
  const draftRef = useRef(draft)
  useEffect(() => {
    draftRef.current = draft
  }, [draft])
  useEffect(() => {
    let alive = true
    const reading = previewStock
      ? Promise.resolve({ stock: previewStock, dateVialId: undefined, catalogue: null })
      : readDoseSheet(compound.id, dateKey, { draw: false, stock: true, dateVial: !onToday, catalogue: needCatalogue })
    reading
      .then((read) => {
        if (!alive) return
        if (read.catalogue && read.catalogue.length > 0) setFetchedCatalogue(read.catalogue)
        if (!read.stock?.ok) {
          setStock({ kind: "failed" })
          return
        }
        const { open, spares } = containersOf(read.stock.items, compound.id)
        const fit = (v: StockItem) => unitFamilyOk(v.baseUnit, compound.unit)
        // A back-dated day offers only the container in use THEN, as the Log
        // sheet did: one started later would be dropped by the server, and a
        // spare started on a past day would take every later dose.
        const dateVialId = read.dateVialId ?? null
        const next = onToday
          ? { kind: "ready" as const, open: open.filter(fit), spares: spares.filter(fit) }
          : { kind: "ready" as const, open: open.filter((v) => v.id === dateVialId), spares: [], dateVialId }
        setStock(next)
        // Undecided stays undecided unless there is an obvious answer: today,
        // the container in use; a back-dated day, the one in use then.
        if (draftRef.current.inventoryItemId === undefined) {
          const pick = onToday ? next.open[0]?.id : (read.dateVialId ?? undefined)
          if (pick) onDraft({ inventoryItemId: pick })
        }
      })
      .catch(() => {
        if (alive) setStock({ kind: "failed" })
      })
    return () => {
      alive = false
    }
    // Read once per open row; a draft change must not re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compound.id, dateKey, readKey, mixTick])

  /* ---- keep the open row in view, above the Track bar ---- */
  const rootRef = useRef<HTMLDivElement>(null)
  const bringIntoView = (delay: number) => {
    window.setTimeout(() => {
      const el = rootRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const over = r.bottom - (window.innerHeight - TRACK_BAR_CLEAR_PX)
      if (over > 0) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        window.scrollBy({ top: over, behavior: reduce ? "auto" : "smooth" })
      }
    }, delay)
  }
  // The row has opened (its body grows over 450ms).
  useEffect(() => {
    // Once, when the row opens.
    bringIntoView(470)
  }, [])

  /* ---- the tile and its panel, with the S4 swap ---- */
  const [tile, setTile] = useState<LogTile | null>(null)
  const [shown, setShown] = useState<LogTile | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const swapFrom = useRef<number | null>(null)

  const choose = (next: LogTile) => {
    if (next === tile) return // only the up arrow closes a panel
    onTileChange(true)
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (tile && shown && innerRef.current && wrapRef.current && !reduce) {
      // S4: the old content drops away, then the new settles in from above.
      swapFrom.current = wrapRef.current.offsetHeight
      setTile(next)
      const out = innerRef.current.animate(
        [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(10px)" }],
        { duration: 130, easing: "ease-in", fill: "forwards" },
      )
      out.finished
        .then(() => {
          setShown(next)
          out.cancel()
        })
        .catch(() => {})
      return
    }
    setTile(next)
    setShown(next)
    // A panel growing below the fold is brought up once it has (600ms).
    bringIntoView(620)
  }
  const close = () => {
    setTile(null)
    onTileChange(false)
  }
  // The new content is in: ease the panel to its new height and raise it in.
  useLayoutEffect(() => {
    const from = swapFrom.current
    const wrap = wrapRef.current
    const inner = innerRef.current
    if (from == null || !wrap || !inner) return
    swapFrom.current = null
    const to = wrap.scrollHeight
    wrap.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 380, easing: "cubic-bezier(0.32, 0.72, 0, 1)" })
    inner.animate(
      [{ opacity: 0, transform: "translateY(-10px)" }, { opacity: 1, transform: "none" }],
      { duration: 340, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    )
  }, [shown])

  /* ---- dose and time ---- */
  // From the PLAN, so the step does not drift as the amount changes.
  const step = stepFor(compound.dose)
  const setAmount = (n: number) => onDraft({ amount: Math.max(0, Number(n.toFixed(3))) })
  const [clock, setClock] = useState(() => clockHHMM(new Date()))
  useEffect(() => {
    if (draft.time24 || !onToday) return
    const id = window.setInterval(() => setClock(clockHHMM(new Date())), 15_000)
    return () => window.clearInterval(id)
  }, [draft.time24, onToday])
  const timeShown = draft.time24 ?? (onToday ? clock : compound.schedule.timeOfDay)
  const dayWord = onToday ? "Today" : formatDateKeyShort(dateKey)

  /* ---- site ---- */
  const route = compound.method === "im" ? "im" : "subq"
  const cat = catalogue.length > 0 ? catalogue : (fetchedCatalogue ?? catalogue)
  const sites = sitesForSex(cat.filter((s) => s.route === route), bodySex)
  const siteIds = new Set(sites.map((s) => s.id))
  const history: Record<string, number> = {}
  let freshest: { id: string; days: number } | null = null
  for (const [id, days] of Object.entries(siteLastUsedDays)) {
    if (!siteIds.has(id)) continue
    history[id] = days
    if (!freshest || days < freshest.days) freshest = { id, days }
  }
  const siteName = (id: string) => cat.find((s) => s.id === id)?.label ?? siteLabel(id)

  /* ---- stock ---- */
  /** A past day whose container in use then is no longer held: a card for it. */
  const pastOnly = stock.kind === "ready" && !onToday && stock.open.length === 0
  const noStock =
    stock.kind === "ready" && stock.open.length === 0 && stock.spares.length === 0 && !(pastOnly && stock.dateVialId)
  const notCounted = draft.inventoryItemId === null
  const picked =
    stock.kind === "ready" ? [...stock.open, ...stock.spares].find((v) => v.id === draft.inventoryItemId) : undefined
  const fillOf = (v?: StockItem) =>
    v && v.remainingBase != null && v.totalBase ? Math.max(0, Math.min(1, v.remainingBase / v.totalBase)) : 0.5

  const stockFace: ReactNode = noStock ? (
    <span className="opacity-[0.45]">
      <Container name={compound.name} inventoryType={inventoryType} category={compound.category} fill={0} size={24} />
    </span>
  ) : notCounted ? (
    <span className="relative">
      <Container name={compound.name} inventoryType={inventoryType} category={compound.category} fill={0.5} size={24} />
      <svg aria-hidden viewBox="0 0 60 96" className="absolute inset-0 h-full w-full overflow-visible">
        <line className="animate-strike" x1="6" y1="90" x2="54" y2="8" pathLength={1} stroke="var(--state-error)" strokeWidth="6" strokeLinecap="round" />
      </svg>
    </span>
  ) : (
    <Container name={compound.name} inventoryType={inventoryType} category={compound.category} fill={fillOf(picked)} size={24} />
  )

  const tiles: { key: LogTile; icon: ReactNode; label: string; set: boolean }[] = [
    ...(injectable
      ? [{ key: "site" as const, icon: <FigureIcon set={Boolean(draft.siteId)} />, label: draft.siteId ? siteName(draft.siteId) : "Site", set: Boolean(draft.siteId) }]
      : []),
    { key: "stock", icon: stockFace, label: noStock ? "No stock" : notCounted ? "Not counted" : "Stock", set: !noStock },
    { key: "note", icon: <NoteIcon />, label: draft.note.trim() || "Note", set: Boolean(draft.note.trim()) },
  ]

  const noun = (i: number, v: StockItem) =>
    `${containerNounTitle({ inventoryType: v.inventoryType, totalAmountUnit: v.totalAmountUnit, category: compound.category, name: compound.name })} ${i + 1}`

  const panel = (kind: LogTile) => {
    if (kind === "site") {
      return (
        <div className="flex flex-col items-center gap-2">
          {sites.length === 0 ? (
            <p className="py-6 text-sm text-text-muted">Couldn&apos;t load the body map. You can still log the dose.</p>
          ) : (
            <BodyMap
              sites={sites}
              mode="pick"
              sex={bodySex}
              activeIds={draft.siteId ? [draft.siteId] : []}
              history={history}
              historyWindow={decayWindow(route)}
              dayChips
              freshestId={freshest?.id ?? null}
              tone="lifted"
              onTapSite={(id) => onDraft({ siteId: id === draft.siteId ? null : id })}
            />
          )}
          <p key={draft.siteId ?? "none"} className="animate-hl-swap min-h-5 text-center text-sm text-foreground">
            {draft.siteId ? siteName(draft.siteId) : " "}
          </p>
        </div>
      )
    }
    if (kind === "note") {
      return (
        <textarea
          value={draft.note}
          onChange={(e) => onDraft({ note: e.target.value.slice(0, 500) })}
          placeholder="Anything to remember"
          aria-label="Note"
          className="min-h-[80px] w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-text-muted"
        />
      )
    }
    if (stock.kind === "loading") {
      return <div aria-hidden className="sk h-[118px] rounded-xl bg-bg-surface-raised" />
    }
    if (stock.kind === "failed") {
      return <p className="py-6 text-center text-sm text-text-muted">Couldn&apos;t load your stock.</p>
    }
    if (pastOnly) {
      // A past day: the container in use then, if it has since been finished
      // and put away, or none at all.
      const thenId = stock.dateVialId
      return thenId ? (
        <div>
          <button
            type="button"
            aria-pressed={!notCounted}
            onClick={() => onDraft({ inventoryItemId: thenId })}
            className={cn(
              "log-vcard mx-auto flex w-[calc(50%-4px)] flex-col items-center gap-1.5 rounded-xl border bg-bg-surface px-2 pt-3 pb-2.5 text-[12.5px] text-foreground",
              notCounted ? "border-transparent opacity-30" : "border-text-primary",
            )}
          >
            <Container name={compound.name} inventoryType={inventoryType} category={compound.category} size={52} />
            In use then
          </button>
          <button
            type="button"
            onClick={() => onDraft({ inventoryItemId: notCounted ? thenId : null })}
            className={cn(
              PRESS.text,
              "mx-auto mt-3 block rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors",
              notCounted ? "bg-bg-surface-raised text-foreground" : "text-text-muted",
            )}
          >
            {notCounted ? "Count it" : "Don’t count this dose"}
          </button>
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-text-muted">No {compound.name} container was in use that day.</p>
      )
    }
    if (noStock) {
      return (
        <div className="flex flex-col items-center gap-2.5 py-2.5">
          <span className="opacity-[0.45]">
            <Container name={compound.name} inventoryType={inventoryType} category={compound.category} fill={0} size={56} />
          </span>
          <p className="text-[13px] text-text-muted">No {compound.name} stock yet</p>
          <button
            type="button"
            onClick={onAddStock}
            className={cn(PRESS.button, "inst-btn px-[18px] py-[9px] text-[13px] font-medium text-bg-base")}
          >
            Add stock
          </button>
        </div>
      )
    }
    // Spares are GROUPED, one card per kind ("9 · Mix first"): nine identical
    // cards to swipe past say nothing one card does not. Picking the unopened
    // group takes the oldest, which Track then starts.
    const dryOnes = stock.spares.filter((v) => v.inventoryType === "reconstituted")
    const waterShown = water ?? String(mixWaterDefault([...stock.open, ...stock.spares]))
    const waterWidth = waterShown.length
    const sealed = stock.spares.filter((v) => v.inventoryType !== "reconstituted")
    const group = (vs: StockItem[], dry: boolean) =>
      vs.length === 0
        ? []
        : [{ v: vs[0], ids: vs.map((x) => x.id), name: vs.length === 1 ? "Spare" : "Spares", sub: `${vs.length} · ${dry ? "Mix first" : "Unopened"}`, dry }]
    const cards = [
      ...stock.open.map((v, i) => ({ v, ids: [v.id], name: noun(i, v), sub: v.dosesRemaining != null ? `${v.dosesRemaining} ${v.dosesRemaining === 1 ? "dose" : "doses"} left` : "Open", dry: false })),
      ...group(sealed, false),
      ...group(dryOnes, true),
    ]
    return (
      <div>
        <div className={cn("log-vcards -mx-0.5 flex gap-2 overflow-x-auto p-0.5", notCounted && "log-vcards-off")}>
          {cards.map(({ v, ids, name, sub, dry }) => {
            const on = !notCounted && draft.inventoryItemId != null && ids.includes(draft.inventoryItemId)
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={on}
                aria-expanded={dry ? armed : undefined}
                onClick={() => {
                  if (dry) {
                    setArmed((a) => !a)
                    return
                  }
                  setArmed(false)
                  onDraft({ inventoryItemId: v.id })
                  onSpare(v.acquiredOn == null ? v.id : null)
                }}
                className={cn(
                  "log-vcard flex flex-[0_0_calc(50%-4px)] flex-col items-center gap-1.5 rounded-xl border bg-bg-surface px-2 pt-3 pb-2.5 text-[12.5px] text-foreground",
                  on || (dry && armed) ? "border-text-primary" : "border-transparent",
                  dry && !armed && "opacity-55",
                )}
              >
                <Container
                  name={compound.name}
                  inventoryType={v.inventoryType}
                  category={compound.category}
                  fill={v.acquiredOn == null ? (dry ? 0 : 1) : fillOf(v)}
                  size={52}
                />
                {name}
                <small className="font-mono text-[9.5px] tracking-[0.06em] text-text-muted uppercase">{sub}</small>
              </button>
            )
          })}
        </div>
        {armed && dryOnes.length > 0 ? (
          <div className="animate-hl-swap mt-3 flex items-center justify-center gap-2">
            <label className="flex items-center gap-1 rounded-lg border border-border-strong px-2.5 py-[5px] font-mono text-[11px] text-foreground">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.5}
                value={waterShown}
                onChange={(e) => setWater(e.target.value)}
                aria-label="BAC water, mL"
                style={{ width: `${Math.max(1, waterWidth)}ch` }}
                className="min-w-0 bg-transparent text-right outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              mL
            </label>
            <button
              type="button"
              disabled={mixing || !(Number.parseFloat(waterShown) > 0)}
              onClick={() =>
                guard(() => {
                  const target = dryOnes[0]
                  const ml = Number.parseFloat(waterShown)
                  if (!target || !(ml > 0)) return
                  setMixing(true)
                  void mixStockItem(target.id, ml, todayKey)
                    .then((r) => {
                      if (!r.ok) return
                      setArmed(false)
                      onSpare(null)
                      onDraft({ inventoryItemId: target.id })
                      setMixTick((t) => t + 1)
                    })
                    .finally(() => setMixing(false))
                })
              }
              className={cn(PRESS.button, "inst-btn px-3.5 py-[5px] text-[12.5px] font-medium text-bg-base disabled:opacity-50")}
            >
              Mix
            </button>
          </div>
        ) : (
        <button
          type="button"
          onClick={() => {
            if (notCounted) {
              onDraft({ inventoryItemId: onToday ? stock.open[0]?.id : (stock.dateVialId ?? undefined) })
            } else {
              onDraft({ inventoryItemId: null })
              onSpare(null)
            }
          }}
          className={cn(
            PRESS.text,
            "mx-auto mt-3 block rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors",
            notCounted ? "bg-bg-surface-raised text-foreground" : "text-text-muted",
          )}
        >
          {notCounted ? "Count it" : "Don’t count this dose"}
        </button>
        )}
      </div>
    )
  }

  return (
    <div ref={rootRef} className="flex flex-col pb-3" style={{ "--hue": hue } as CSSProperties}>
      <div className="hairline-t flex items-center justify-between gap-2.5 py-[9px]">
        <span className="text-[13px] text-text-muted">Dose</span>
        <span className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label="Less"
            onClick={() => setAmount(draft.amount - step)}
            className={cn(PRESS.icon, "flex h-[30px] w-[30px] items-center justify-center rounded-full bg-bg-surface-raised text-base text-foreground")}
          >
            −
          </button>
          <b className="min-w-[38px] text-center font-mono text-[17px] font-light text-foreground">
            {draft.amount > 0 ? formatStepAmount(draft.amount) : "—"}
          </b>
          <small className="-ml-1.5 text-[11px] text-text-muted">{draft.unit}</small>
          <button
            type="button"
            aria-label="More"
            onClick={() => setAmount(draft.amount + step)}
            className={cn(PRESS.icon, "flex h-[30px] w-[30px] items-center justify-center rounded-full bg-bg-surface-raised text-base text-foreground")}
          >
            +
          </button>
        </span>
      </div>
      <div className="hairline-t flex items-center justify-between gap-2.5 py-[9px]">
        <span className="text-[13px] text-text-muted">Time</span>
        {/* The time opens the phone's own picker: a native time input laid
            transparently over the words. */}
        <label className="relative font-mono text-[12.5px] text-foreground">
          {dayWord} · {formatTimeLabel(timeShown)}
          <input
            type="time"
            value={timeShown}
            onChange={(e) => onDraft({ time24: e.target.value || null })}
            aria-label="Time taken"
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>

      <div className="log-tiles hairline-t flex gap-[7px] pt-2.5" data-focus={tile ? "true" : "false"}>
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => choose(t.key)}
            aria-pressed={tile === t.key}
            data-on={tile === t.key ? "true" : "false"}
            className={cn(
              "log-tile flex min-h-[72px] min-w-0 flex-1 flex-col items-center justify-center gap-[7px] rounded-[14px] bg-bg-surface-raised px-1.5 pt-3 pb-2.5 text-[11.5px]",
              t.set || tile === t.key ? "text-foreground" : "text-text-muted",
            )}
          >
            {t.icon}
            <span className="max-w-full truncate">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Closed, the panel keeps its last content drawn while it folds away;
          inert, so none of it can still be tabbed to or read out. */}
      <div className="log-panel" data-open={tile ? "true" : "false"} inert={!tile}>
        <div>
          <div ref={wrapRef} className="inset-surface relative mt-2.5 overflow-hidden rounded-[14px] px-3 pt-11 pb-3">
            {tile ? (
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className={cn(PRESS.icon, "log-panel-close absolute top-2 right-2 z-10 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-bg-surface-raised text-foreground")}
              >
                <UpArrow />
              </button>
            ) : null}
            <div ref={innerRef}>{shown ? panel(shown) : null}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
