"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { Container } from "@/components/containers"
import { CloseArrow } from "@/components/feel/CloseArrow"
import { NumberPad, PadInput } from "@/components/feel/NumberPad"
import { SolidIcon } from "@/components/feel/SolidIcon"
import { usePadSession } from "@/components/feel/usePadSession"
import { BodyAspectSwitch, BodyMap } from "@/components/sites/BodyMap"
import { cn } from "@/lib/utils"
import { ADD_ACTION, PRESS, TILE_LABEL } from "@/lib/ui-presets"
import type { StockItem, StockRead } from "@/lib/db/inventory"
import type { BodySex, InjectionSiteAspect, InjectionSiteRow } from "@/lib/db/types"
import { unitFamilyOk } from "@/lib/db/doseUnits"
import { containerColour } from "@/lib/containers/colour"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { containerNounTitle } from "@/lib/containers/labels"
import { readDoseSheet } from "@/lib/home/doseSheetRead"
import { decayWindow } from "@/lib/home/siteRecency"
import { siteDisplayName, siteLabel, siteShortLabel, sitesForSex } from "@/lib/home/siteCatalog"
import { isInjectable, type StackCompound } from "@/lib/home/stack"
import { clockHHMM, formatStepAmount, logTimeLabel, stepFor, type RowDraft } from "@/lib/home/logDraft"
import { containersOf } from "@/lib/protocol/stockView"

export type LogTile = "site" | "stock" | "note"

/** What the Track bar covers at the bottom of the screen, with a little air. */
const TRACK_BAR_CLEAR_PX = 104
/** A picked site closes its panel this long after the pick (build-brief-final §3.2). */
const SITE_AUTOCLOSE_MS = 500
/** The house settle curve, as numbers (WAAPI keyframes must not hold `var()`). */
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)"

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

function Plus() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/* ----------------------------------------------------------------- panel */

/**
 * The row of a Today's Log dose, OPEN (Flow B; the final design, Adrian,
 * 2026-09-26): Dose (tap the figure to type it, or step it), Time, then Site /
 * Stock / Note tiles. A tile opens its panel in the inset; the SAME tile closes
 * it again. Every panel starts with ONE header row and no empty band:
 *
 * - Site: the Front / Back switch and the arrow on one line, the map below. It
 *   closes itself half a second after a site is picked. Never a suggested site.
 * - Stock: the container in use, and nothing else. No arrow: tapping the row
 *   (or "No stock yet") closes the panel, as the Stock tile does.
 * - Note: "Add a Note" and the arrow, the field below. The note survives closing.
 *
 * Switching tiles cross-fades the header, the body and the arrow while the
 * panel's height eases to the new one. Nothing is logged until Track.
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
  /** Add stock from the row. Absent inside a sheet (Quick log, the Calendar's
   *  day), where it would open a sheet over a sheet. */
  onAddStock?: () => void
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
  /** Bumped by "Try again" after a failed read. */
  const [readTry, setReadTry] = useState(0)
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
        // A back-dated day offers only the container in use THEN: one started
        // later would be dropped by the server, and a spare started on a past
        // day would take every later dose.
        const dateVialId = read.dateVialId ?? null
        const next = onToday
          ? { kind: "ready" as const, open: open.filter(fit), spares: spares.filter(fit) }
          : { kind: "ready" as const, open: open.filter((v) => v.id === dateVialId), spares: [], dateVialId }
        setStock(next)
        // Undecided stays undecided unless there is an obvious answer: today,
        // the container in use (the oldest open one), or with none open an
        // unopened spare, which Track then starts; a back-dated day, the one
        // in use then. A powder vial is never picked unmixed.
        if (draftRef.current.inventoryItemId === undefined) {
          const sealed = next.spares.find((v) => v.inventoryType !== "reconstituted")
          const pick = onToday ? (next.open[0]?.id ?? sealed?.id) : (read.dateVialId ?? undefined)
          if (pick) {
            onDraft({ inventoryItemId: pick })
            if (onToday && !next.open[0] && sealed) onSpare(sealed.id)
          }
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
  }, [compound.id, dateKey, readKey, readTry])

  /* ---- keep the open row in view, above the Track bar (on opening only) ---- */
  const rootRef = useRef<HTMLDivElement>(null)
  const bringIntoView = (delay: number) => {
    window.setTimeout(() => {
      const el = rootRef.current
      if (!el) return
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      const behavior: ScrollBehavior = reduce ? "auto" : "smooth"
      const r = el.getBoundingClientRect()
      // Inside a sheet (Quick log, the Calendar's day) the sheet's own body
      // scrolls, and its Track bar sits under it, not over the page.
      const sheet = el.closest<HTMLElement>('[data-slot="sheet-content"]')
      if (sheet) {
        let box: HTMLElement | null = el.parentElement
        while (box && box !== sheet && !(box.scrollHeight > box.clientHeight && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) {
          box = box.parentElement
        }
        if (!box || box === sheet) return
        const over = r.bottom - box.getBoundingClientRect().bottom + 8
        if (over > 0) box.scrollBy({ top: over, behavior })
        return
      }
      const over = r.bottom - (window.innerHeight - TRACK_BAR_CLEAR_PX)
      if (over > 0) window.scrollBy({ top: over, behavior })
    }, delay)
  }
  // The row has opened (its body grows over 450ms).
  useEffect(() => {
    bringIntoView(470)
  }, [])

  /* ---- the tile and its panel ---- */
  const [tile, setTile] = useState<LogTile | null>(null)
  const [shown, setShown] = useState<LogTile | null>(null)
  const panRef = useRef<HTMLDivElement>(null)
  const swapFrom = useRef<number | null>(null)
  const siteTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(siteTimer.current), [])

  const parts = () =>
    Array.from(panRef.current?.querySelectorAll<HTMLElement>("[data-pan-part]") ?? [])

  const close = () => {
    window.clearTimeout(siteTimer.current)
    setTile(null)
    onTileChange(false)
  }
  const choose = (next: LogTile) => {
    // The same tile again closes its panel.
    if (next === tile) {
      close()
      return
    }
    window.clearTimeout(siteTimer.current)
    onTileChange(true)
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const pan = panRef.current
    if (tile && shown && pan && !reduce) {
      // Switching: the header, body and arrow fade 4px down (110ms), the
      // height eases to the new one (280ms), the new ones rise in (240ms).
      swapFrom.current = pan.getBoundingClientRect().height
      setTile(next)
      Promise.all(
        parts().map(
          (p) =>
            p.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(4px)" }], {
              duration: 110,
              easing: "ease-in",
              fill: "forwards",
            }).finished,
        ),
      )
        .then(() => setShown(next))
        .catch(() => {})
      return
    }
    setTile(next)
    setShown(next)
    // A panel growing below the fold is brought up once it has (450ms).
    bringIntoView(470)
  }
  // The new content is in: ease the height, raise the new parts in.
  useEffect(() => {
    const from = swapFrom.current
    const pan = panRef.current
    if (from == null || !pan) return
    swapFrom.current = null
    for (const p of parts()) p.getAnimations().forEach((a) => a.cancel())
    const to = pan.getBoundingClientRect().height
    if (Math.abs(to - from) > 1) {
      pan.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 280, easing: EASE })
    }
    for (const p of parts()) {
      p.animate([{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }], {
        duration: 240,
        easing: EASE,
      })
    }
  }, [shown])

  /* ---- dose and time ---- */
  // From the PLAN, so the step does not drift as the amount changes; whole
  // steps for things you count.
  const step = stepFor(compound.dose, draft.unit)
  const counted = step === 1 && (draft.unit === "tab" || draft.unit === "capsule" || draft.unit === "drop")
  const setAmount = (n: number) => onDraft({ amount: Math.max(0, Number(n.toFixed(3))) })
  const pad = usePadSession()
  const [padText, setPadText] = useState<string | null>(null)
  const amountText = padText ?? (draft.amount > 0 ? formatStepAmount(draft.amount) : "")
  const [clock, setClock] = useState(() => clockHHMM(new Date()))
  useEffect(() => {
    if (draft.time24 || !onToday) return
    const id = window.setInterval(() => setClock(clockHHMM(new Date())), 15_000)
    return () => window.clearInterval(id)
  }, [draft.time24, onToday])
  const timeShown = draft.time24 ?? (onToday ? clock : compound.schedule.timeOfDay)

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
  const [aspect, setAspect] = useState<InjectionSiteAspect>("anterior")
  const pickSite = (id: string) => {
    const next = id === draft.siteId ? null : id
    onDraft({ siteId: next })
    window.clearTimeout(siteTimer.current)
    // A pick closes the panel half a second later; an un-pick leaves it open.
    if (next) siteTimer.current = window.setTimeout(close, SITE_AUTOCLOSE_MS)
  }

  /* ---- stock: the container in use, and only it ---- */
  const ready = stock.kind === "ready" ? stock : null
  const inUse: StockItem | undefined = ready
    ? ([...ready.open, ...ready.spares].find((v) => v.id === draft.inventoryItemId) ?? ready.open[0])
    : undefined
  const onlyUnmixed =
    ready !== null && !inUse && ready.spares.length > 0 && ready.spares.every((v) => v.inventoryType === "reconstituted")
  const pastNone = ready !== null && !onToday && !inUse
  const noStock = ready !== null && !inUse && !onlyUnmixed && !pastNone
  const nounOf = (v: StockItem) =>
    containerNounTitle({ inventoryType: v.inventoryType, totalAmountUnit: v.totalAmountUnit, category: compound.category, name: compound.name })
  const fillOf = (v?: StockItem) =>
    v && v.remainingBase != null && v.totalBase ? Math.max(0, Math.min(1, v.remainingBase / v.totalBase)) : 0.5
  const inUseName = inUse
    ? !onToday
      ? `${nounOf(inUse)} in use then`
      : inUse.acquiredOn == null
        ? `Unopened ${nounOf(inUse).toLowerCase()}`
        : `Current ${nounOf(inUse).toLowerCase()}`
    : ""
  const dosesLeft =
    inUse?.dosesRemaining != null ? `${inUse.dosesRemaining} ${inUse.dosesRemaining === 1 ? "dose" : "doses"} left` : null

  /* ---- the tiles ---- */
  const tiles: { key: LogTile; glyph: "site" | "stock" | "note"; label: string; sub: string; set: boolean }[] = [
    ...(injectable
      ? [{
          key: "site" as const,
          glyph: "site" as const,
          label: "Site",
          sub: draft.siteId ? siteShortLabel(draft.siteId, siteName(draft.siteId)) : "Pick one",
          set: Boolean(draft.siteId),
        }]
      : []),
    {
      key: "stock",
      glyph: "stock",
      label: "Stock",
      sub: stock.kind !== "ready" ? " " : inUse ? nounOf(inUse) : "None",
      set: Boolean(inUse),
    },
    { key: "note", glyph: "note", label: "Note", sub: draft.note.trim() ? "Added" : "Add", set: Boolean(draft.note.trim()) },
  ]

  /** A panel's header row (left) and body. The Stock panel has no body. */
  const headerOf = (kind: LogTile): ReactNode => {
    if (kind === "site") {
      return <BodyAspectSwitch aspect={aspect} onChange={setAspect} small />
    }
    if (kind === "note") {
      return <span className="text-[13px] text-foreground">Add a Note</span>
    }
    // Stock: the row IS the header, and tapping it closes the panel.
    if (stock.kind === "loading") {
      return <span aria-hidden className="sk h-[34px] w-full rounded-xl bg-bg-surface-raised" />
    }
    if (stock.kind === "failed") {
      // The same error line as Protocol's, with its retry (consistency fix #22).
      return (
        <p className="min-w-0 flex-1 py-1.5 text-[13px] text-state-error">
          Couldn&apos;t load your stock.{" "}
          <button
            type="button"
            onClick={() => {
              setStock({ kind: "loading" })
              setReadTry((t) => t + 1)
            }}
            className={cn(PRESS.text, "text-foreground underline underline-offset-4")}
          >
            Try again
          </button>
        </p>
      )
    }
    if (noStock) {
      return (
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <button type="button" onClick={close} className="min-w-0 flex-1 py-1.5 text-left text-[13px] text-text-muted">
            No stock yet
          </button>
          {onAddStock ? (
            <button
              type="button"
              onClick={onAddStock}
              aria-label="Add stock"
              className={ADD_ACTION}
            >
              <Plus />
            </button>
          ) : null}
        </span>
      )
    }
    if (onlyUnmixed || pastNone) {
      return (
        <button type="button" onClick={close} className="min-w-0 flex-1 py-1.5 text-left text-[13px] text-text-muted">
          {pastNone ? "No container was in use that day" : "No mixed vial yet"}
        </button>
      )
    }
    return (
      <button type="button" onClick={close} className={cn(PRESS.rowPart, "flex min-w-0 flex-1 items-center gap-2.5 text-left")}>
        <span className="flex shrink-0">
          <Container
            name={compound.name}
            inventoryType={inUse?.inventoryType ?? inventoryType}
            category={compound.category}
            fill={inUse?.acquiredOn == null ? 1 : fillOf(inUse)}
            size={30}
          />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[13px] text-foreground">{inUseName}</span>
          {dosesLeft ? <span className="block font-mono text-[11px] text-text-muted">{dosesLeft}</span> : null}
        </span>
      </button>
    )
  }
  const bodyOf = (kind: LogTile): ReactNode => {
    if (kind === "site") {
      return (
        <div className="flex flex-col items-center gap-1.5">
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
              aspect={aspect}
              onAspectChange={setAspect}
              hideSwitch
              onTapSite={pickSite}
            />
          )}
          <p key={draft.siteId ?? "none"} className="animate-hl-swap min-h-5 text-center text-[13px]">
            {draft.siteId ? (
              <span className="text-foreground">{siteDisplayName(siteName(draft.siteId))}</span>
            ) : (
              <span className="text-text-muted">Tap where you injected</span>
            )}
          </p>
        </div>
      )
    }
    if (kind === "note") {
      return (
        <textarea
          value={draft.note}
          onChange={(e) => onDraft({ note: e.target.value.slice(0, 500) })}
          placeholder="Anything to remember?"
          aria-label="Note"
          rows={2}
          className="inset-focus block w-full resize-none rounded-[10px] bg-bg-input px-2.5 py-2 text-[13px] text-foreground outline-none placeholder:text-text-muted"
        />
      )
    }
    return null
  }

  const hasArrow = shown !== "stock"
  const body = shown ? bodyOf(shown) : null

  return (
    <div ref={rootRef} className="flex flex-col pb-3" style={{ "--hue": hue } as CSSProperties}>
      <div className="hairline-t flex items-center justify-between gap-2.5 py-[9px]">
        <span className="text-[13px] text-text-muted">Dose</span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Less"
            onClick={() => setAmount(draft.amount - step)}
            className={cn(PRESS.icon, "inst-ghost flex h-[30px] w-[30px] items-center justify-center rounded-lg text-base text-foreground")}
          >
            −
          </button>
          {/* Tap the figure to type it on the Trakabl pad. */}
          <PadInput
            {...pad.bind("dose")}
            value={amountText}
            label={`${compound.name} dose`}
            unit={draft.unit}
            align="center"
            className="h-9 w-[104px] px-2 text-[17px] font-light"
            suffix={<small className="font-sans text-[11px] text-text-muted">{draft.unit}</small>}
          />
          <button
            type="button"
            aria-label="More"
            onClick={() => setAmount(draft.amount + step)}
            className={cn(PRESS.icon, "inst-ghost flex h-[30px] w-[30px] items-center justify-center rounded-lg text-base text-foreground")}
          >
            +
          </button>
        </span>
      </div>
      <NumberPad
        {...pad.padProps([
          {
            id: "dose",
            label: `${compound.name} dose`,
            unit: draft.unit,
            value: amountText,
            decimal: !counted,
            onChange: (v) => {
              setPadText(v)
              const n = Number.parseFloat(v)
              onDraft({ amount: Number.isFinite(n) && n > 0 ? Number(n.toFixed(3)) : 0 })
            },
          },
        ])}
        onClose={() => {
          setPadText(null)
          pad.close()
        }}
        selectOnOpen
      />
      <div className="hairline-t flex items-center justify-between gap-2.5 py-[9px]">
        <span className="text-[13px] text-text-muted">Time</span>
        {/* The time opens the phone's own picker: a native time input laid
            transparently over the words. */}
        <label className="relative font-mono text-[12px] text-foreground">
          {logTimeLabel(dateKey, todayKey, timeShown)}
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
            aria-expanded={tile === t.key}
            data-on={tile === t.key ? "true" : "false"}
            className={cn(
              PRESS.card,
              "log-tile inst-tile flex min-h-[68px] min-w-0 flex-1 flex-col items-center justify-center gap-[5px] px-1 pt-[9px] pb-2",
              tile === t.key ? "bg-bg-input text-foreground" : "bg-bg-surface-raised text-text-muted",
            )}
          >
            <span className="log-tile-icon flex">
              <SolidIcon name={t.glyph} size={20} tone={tile === t.key || t.set ? "on" : "off"} />
            </span>
            <span className={cn(TILE_LABEL, "leading-[1.1]", tile === t.key && "text-foreground")}>{t.label}</span>
            <span className="max-w-full truncate font-mono text-[10px] leading-none text-text-muted">{t.sub}</span>
          </button>
        ))}
      </div>

      {/* Closed, the panel keeps its last content drawn while it folds away;
          inert, so none of it can still be tabbed to or read out. */}
      <div className="log-panel" data-open={tile ? "true" : "false"} inert={!tile}>
        <div>
          <div ref={panRef} className="inset-surface relative mt-2.5 overflow-hidden pt-2 pr-2.5 pb-2.5 pl-3">
            <div className="flex min-h-8 items-center gap-2.5">
              <div data-pan-part className="flex min-w-0 flex-1 items-center gap-2.5">
                {shown ? headerOf(shown) : null}
              </div>
              {hasArrow ? (
                <span data-pan-part className="flex shrink-0">
                  <CloseArrow onClick={close} shown={tile !== null} />
                </span>
              ) : null}
            </div>
            {body ? (
              <div data-pan-part className="mt-2.5">
                {body}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
