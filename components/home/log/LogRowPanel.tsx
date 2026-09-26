"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { Container } from "@/components/containers"
import { CloseArrow } from "@/components/feel/CloseArrow"
import { NumberPad, PadInput } from "@/components/feel/NumberPad"
import { SolidIcon } from "@/components/feel/SolidIcon"
import { usePadSession } from "@/components/feel/usePadSession"
import { BodyAspectSwitch, BodyMap } from "@/components/sites/BodyMap"
import { cn } from "@/lib/utils"
import { ADD_ACTION, HIT_30, PRESS, TILE_LABEL } from "@/lib/ui-presets"
import type { StockItem, StockRead } from "@/lib/db/inventory"
import type { BodySex, InjectionSiteAspect, InjectionSiteRow } from "@/lib/db/types"
import { containerColour } from "@/lib/containers/colour"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { containerNounTitle } from "@/lib/containers/labels"
import { readDoseSheet } from "@/lib/home/doseSheetRead"
import { resolveProtocolCompoundIds } from "@/lib/home/protocolSync"
import { decayWindow } from "@/lib/home/siteRecency"
import { siteDisplayName, siteLabel, siteShortLabel, sitesForSex } from "@/lib/home/siteCatalog"
import { isInjectable, type StackCompound } from "@/lib/home/stack"
import {
  clockHHMM,
  formatStepAmount,
  logTimeLabel,
  shownTime,
  stepAmount,
  stepFor,
  type RowDraft,
} from "@/lib/home/logDraft"
import {
  autoPickContainer,
  needsStockIdLookup,
  rowContainer,
  rowStockOf,
  stockCompoundId,
  type RowStock,
} from "@/lib/home/logRows"

export type LogTile = "site" | "stock" | "note"

/** What the Track bar covers at the bottom of the screen, with a little air. */
const TRACK_BAR_CLEAR_PX = 104
/** A picked site closes its panel this long after the pick (build-brief-final §3.2). */
const SITE_AUTOCLOSE_MS = 500
/** The house settle curve, as numbers (WAAPI keyframes must not hold `var()`). */
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)"

/** What the row knows about this compound's containers. */
type StockState = { kind: "loading" } | { kind: "failed" } | ({ kind: "ready" } & RowStock)

/**
 * Device compound id → the Postgres id its containers carry, where the two
 * differ (cold review S11), learnt once per page load: Protocol resolves the
 * same way (`resolveProtocolCompoundIds`).
 */
const stockIds = new Map<string, string>()

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
  slot = 0,
  editing = false,
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
  /** Which of the day's doses this is: its scheduled time on a back-dated day. */
  slot?: number
  /** A dose already logged, opened to edit: its container is never re-picked. */
  editing?: boolean
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
      .then(async (read) => {
        if (!alive) return
        if (read.catalogue && read.catalogue.length > 0) setFetchedCatalogue(read.catalogue)
        if (!read.stock?.ok) {
          setStock({ kind: "failed" })
          return
        }
        const items = read.stock.items
        // The containers carry the Postgres id. Where none carries the device
        // id, ask for the Postgres one the way Protocol does (S11), once.
        let resolved = stockIds.get(compound.id) ?? null
        if (!previewStock && !resolved && needsStockIdLookup(items, compound.id)) {
          const map: Record<string, string> = await resolveProtocolCompoundIds([
            { id: compound.id, name: compound.name },
          ]).catch(() => ({}))
          if (!alive) return
          resolved = map[compound.id] ?? null
          if (resolved) stockIds.set(compound.id, resolved)
        }
        const pcId = stockCompoundId(items, compound.id, resolved)
        const next = rowStockOf(items, pcId, compound.unit, onToday, read.dateVialId)
        setStock({ kind: "ready", ...next })
        // Undecided stays undecided unless there is an obvious answer (and
        // never for a dose already logged, B8): see `autoPickContainer`.
        if (draftRef.current.inventoryItemId === undefined) {
          const pick = autoPickContainer(next, onToday, editing)
          if (pick) {
            onDraft({ inventoryItemId: pick.id })
            if (pick.spare) onSpare(pick.id)
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
  /**
   * Counts swaps that have landed, so the rise-in runs even when a swap lands
   * on the content already shown (two quick taps back to the first tile):
   * `shown` would not change, and the faded parts stayed blank (B31).
   */
  const [landed, setLanded] = useState(0)
  /** The swap in flight: a newer tap, or a close, makes an older one land nowhere. */
  const swapToken = useRef(0)
  const panRef = useRef<HTMLDivElement>(null)
  const swapFrom = useRef<number | null>(null)
  const siteTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(siteTimer.current), [])

  const parts = () =>
    Array.from(panRef.current?.querySelectorAll<HTMLElement>("[data-pan-part]") ?? [])
  /** Whatever a cut-short swap left faded is put back. */
  const settleParts = () => {
    for (const p of parts()) p.getAnimations().forEach((a) => a.cancel())
  }

  const close = () => {
    window.clearTimeout(siteTimer.current)
    swapToken.current += 1
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
    const token = ++swapToken.current
    if (tile && shown && pan && !reduce) {
      // Switching: the header, body and arrow fade 4px down (110ms), the
      // height eases to the new one (280ms), the new ones rise in (240ms).
      // Interruptible: each part fades from where it is now, and a second
      // tap mid-swap takes over the first (B31).
      swapFrom.current = pan.getBoundingClientRect().height
      setTile(next)
      const fades = parts().map((p) => {
        const now = getComputedStyle(p)
        const from = Number.parseFloat(now.opacity)
        const at = { opacity: Number.isFinite(from) ? from : 1, transform: now.transform === "none" ? "none" : now.transform }
        p.getAnimations().forEach((a) => a.cancel())
        return p.animate([at, { opacity: 0, transform: "translateY(4px)" }], {
          duration: Math.max(40, 110 * at.opacity),
          easing: "ease-in",
          fill: "forwards",
        }).finished
      })
      // Lands on its token even when a fade was cancelled on the way.
      const land = () => {
        if (token !== swapToken.current) return
        setShown(next)
        setLanded((n) => n + 1)
      }
      Promise.all(fades).then(land, land)
      return
    }
    settleParts()
    swapFrom.current = null
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
    settleParts()
    pan.getAnimations().forEach((a) => a.cancel())
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
    // `landed` re-runs it when a swap lands on the content already shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, landed])

  /* ---- dose and time ---- */
  // From the PLAN, so the step does not drift as the amount changes; whole
  // steps for things you count.
  const step = stepFor(compound.dose, draft.unit)
  // Tablets, capsules and drops: + and - move by one whole thing; typing on the
  // pad takes any amount, a half tablet included (Adrian, 26 Sep: "if I want to
  // specify otherwise I can type").
  const stepBy = (dir: 1 | -1) => onDraft({ amount: stepAmount(draft.amount, dir, draft.unit, step) })
  const pad = usePadSession()
  const [padText, setPadText] = useState<string | null>(null)
  const amountText = padText ?? (draft.amount > 0 ? formatStepAmount(draft.amount) : "")
  const [clock, setClock] = useState(() => clockHHMM(new Date()))
  useEffect(() => {
    if (draft.time24 || !onToday) return
    const id = window.setInterval(() => setClock(clockHHMM(new Date())), 15_000)
    return () => window.clearInterval(id)
  }, [draft.time24, onToday])
  // What Track will write: this slot's own time on a back-dated day (B19).
  const timeShown = shownTime(compound, draft, dateKey, todayKey, slot, clock)

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

  /* ---- stock: the container the dose comes out of, and only it ---- */
  // The same answer Track writes (B20): see `rowContainer`.
  const container = stock.kind === "ready" ? rowContainer(stock, draft.inventoryItemId, onToday, draft.status === "skipped") : null
  const inUse: StockItem | undefined = container?.kind === "item" ? container.item : undefined
  /** A back-dated day's container that is no longer listed: named, not measured. */
  const thenOnly = container?.kind === "then"
  const noneWhy = container?.kind === "none" ? container.why : null
  const nounOf = (v: StockItem) =>
    containerNounTitle({ inventoryType: v.inventoryType, totalAmountUnit: v.totalAmountUnit, category: compound.category, name: compound.name })
  const compoundNoun = containerNounTitle({ inventoryType, totalAmountUnit: null, category: compound.category, name: compound.name })
  const fillOf = (v?: StockItem) =>
    v && v.remainingBase != null && v.totalBase ? Math.max(0, Math.min(1, v.remainingBase / v.totalBase)) : 0.5
  const inUseName = inUse
    ? !onToday
      ? `${nounOf(inUse)} in use then`
      : inUse.acquiredOn == null
        ? `Unopened ${nounOf(inUse).toLowerCase()}`
        : `Current ${nounOf(inUse).toLowerCase()}`
    : thenOnly
      ? `${compoundNoun} in use then`
      : ""
  const dosesLeft =
    inUse?.dosesRemaining != null ? `${inUse.dosesRemaining} ${inUse.dosesRemaining === 1 ? "dose" : "doses"} left` : null
  const NONE_WORDS: Record<NonNullable<typeof noneWhy>, string> = {
    noStock: "No stock yet",
    unmixed: "No mixed vial yet",
    pastNone: "No container was in use that day",
    notCounted: "Not counted from stock",
  }

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
      sub: stock.kind !== "ready" ? " " : inUse ? nounOf(inUse) : thenOnly ? compoundNoun : "None",
      set: Boolean(inUse) || thenOnly,
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
    if (noneWhy === "noStock") {
      return (
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <button type="button" onClick={close} className="min-w-0 flex-1 py-1.5 text-left text-[13px] text-text-muted">
            {NONE_WORDS.noStock}
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
    if (noneWhy) {
      return (
        <button type="button" onClick={close} className="min-w-0 flex-1 py-1.5 text-left text-[13px] text-text-muted">
          {NONE_WORDS[noneWhy]}
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
            fill={inUse ? (inUse.acquiredOn == null ? 1 : fillOf(inUse)) : fillOf(undefined)}
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
            onClick={() => stepBy(-1)}
            // Drawn at 30, pressed at 44 (D8).
            className={cn(PRESS.icon, HIT_30, "inst-ghost flex h-[30px] w-[30px] items-center justify-center rounded-lg text-base text-foreground")}
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
            onClick={() => stepBy(1)}
            className={cn(PRESS.icon, HIT_30, "inst-ghost flex h-[30px] w-[30px] items-center justify-center rounded-lg text-base text-foreground")}
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
            decimal: true,
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
