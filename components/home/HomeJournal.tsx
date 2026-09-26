"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { readJournalForHome, saveJournalEntry } from "@/app/(app)/progress/actions"
import { useWriteAccess } from "@/components/billing/ReadOnlyGate"
import { DatePickerPanel } from "@/components/calendar/DatePickerPanel"
import { CloseArrow } from "@/components/feel/CloseArrow"
import { SolidIcon } from "@/components/feel/SolidIcon"
import { dayLong, dayShort } from "@/lib/format/date"
import { PhotoAdjustSheet, type PhotoAdjustResult } from "@/components/media/PhotoAdjustSheet"
import { JournalPhoto } from "@/components/progress/JournalPhoto"
import { MarkerDialer } from "@/components/progress/MarkerDialer"
import type { DateKey } from "@/lib/home/mockHomeData"
import { DOCUMENT_ASPECT } from "@/lib/media/framing"
import type { JournalEntry, MarkerOption } from "@/lib/progress/journal"
import {
  draftOnRead,
  draftSnapshot,
  entriesAfterSave,
  isSavedDraft,
  journalSaveBlock,
  markersTileWord,
  mergeRatedIntoRows,
  ratedRows,
  rowsFromEntry,
  uploadLands,
  type DraftRow,
} from "@/lib/progress/journalDraft"
import { growAnchor, growScroll, translateY, type Band } from "@/lib/progress/journalGrow"
import { landSwap, pressTile, shutPanel, swapStart, type SwapState } from "@/lib/progress/tileSwap"
import { createClient } from "@/lib/supabase/client"
import { CARD_EYEBROW, HIT_Y_TEXT, PRESS, PRIMARY_BUTTON, TILE_LABEL } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

type Tile = "markers" | "photos" | "date"
const TILES: { key: Tile; label: string; glyph: "markers" | "photos" | "date" }[] = [
  { key: "markers", label: "Markers", glyph: "markers" },
  { key: "photos", label: "Photos", glyph: "photos" },
  { key: "date", label: "Date", glyph: "date" },
]
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)"
const MAX_BYTES = 10 * 1024 * 1024
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
}
/** The panel's well (Context/markers-spec.md, "Where it sits"): radius 14 and
 *  the deeper inner shadow, over the inset's own gradient (softened, W38). */
const WELL = { borderRadius: 14, boxShadow: "inset 0 2px 6px rgba(0,0,0,.45)" } as const
/** How long the dialer outlives a close: the collapse (450ms) plays out whole. */
const UNMOUNT_AFTER_CLOSE_MS = 500

type Loaded = { entries: JournalEntry[]; options: MarkerOption[] }
type Pending = { path: string; url: string }

function Plus({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
      <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/** The small tick on Save once the entry is saved (W10): it draws in. */
function SavedTick() {
  return (
    <svg viewBox="0 0 24 24" className="tick-lift tick-draw h-3.5 w-3.5" aria-hidden>
      <path
        d="M5.5 12.6l4.1 4.1L18.6 7.6"
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function dayWord(key: string, todayKey: string): string {
  if (key === todayKey) return "Today"
  const [y, m, d] = todayKey.split("-").map(Number)
  const yest = new Date(y, m - 1, d - 1)
  const yk = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, "0")}-${String(yest.getDate()).padStart(2, "0")}`
  if (key === yk) return "Yesterday"
  return dayShort(key, y)
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false
}

/* ---- the page follows the card as it grows (W52) ---- */

/** Where `el` is laid out on screen, less the scroll settle's nudge on its card. */
function laidOut(el: HTMLElement): { top: number; bottom: number } {
  const r = el.getBoundingClientRect()
  let y = 0
  for (let a = el.closest<HTMLElement>("[data-area]"); a; a = a.parentElement?.closest<HTMLElement>("[data-area]") ?? null) {
    y += translateY(a.style.translate)
  }
  return { top: r.top - y, bottom: r.bottom - y }
}

let safeTopPx: number | null = null
/** The status bar's inset (env(safe-area-inset-top)), read once. */
function safeTop(): number {
  if (safeTopPx !== null) return safeTopPx
  const probe = document.createElement("div")
  probe.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none"
  document.body.appendChild(probe)
  safeTopPx = probe.getBoundingClientRect().height
  document.body.removeChild(probe)
  return safeTopPx
}

/** What the card may use: under the status bar, above the tab bar and the +. */
function visibleBand(): Band {
  const vv = window.visualViewport
  const top = (vv?.offsetTop ?? 0) + safeTop() + 12
  let bottom = vv ? vv.offsetTop + vv.height : window.innerHeight
  const nav = document.querySelector("[data-bottom-nav]")?.getBoundingClientRect()
  if (nav && nav.height > 0) bottom = Math.min(bottom, nav.top)
  const layer = document.querySelector<HTMLElement>("[data-quick-actions]")
  if (layer && Number(getComputedStyle(layer).opacity) > 0.05) {
    const plus = layer.querySelector('button[aria-haspopup="dialog"]')?.getBoundingClientRect()
    if (plus && plus.height > 0) bottom = Math.min(bottom, plus.top)
  }
  return { top, bottom }
}

/**
 * The page follows `el`'s height for as long as it moves, holding its bottom
 * where it was (W52). `keep` is what must stay in view as it grows; null
 * while it folds, when the bottom stays exactly where it was (the page is
 * never pulled down). A touch or a wheel hands the page back at once. Returns
 * the stop.
 */
function followGrowth(
  el: HTMLElement,
  startBottom: number,
  keep: (() => HTMLElement | null) | null,
  onStop: () => void,
): () => void {
  const band = visibleBand()
  // Opening, the bottom comes up to what can be seen if it started lower.
  const anchor = keep ? growAnchor(startBottom, band) : startBottom
  let raf = 0
  let still = 0
  let lastH = -1
  const t0 = performance.now()
  const stop = () => {
    cancelAnimationFrame(raf)
    window.removeEventListener("touchstart", stop)
    window.removeEventListener("wheel", stop)
    onStop()
  }
  window.addEventListener("touchstart", stop, { passive: true })
  window.addEventListener("wheel", stop, { passive: true })
  const tick = () => {
    const r = laidOut(el)
    const k = keep?.() ?? null
    const d = growScroll({
      bottom: r.bottom,
      anchor,
      keepTop: k ? laidOut(k).top : r.top,
      bandTop: band.top,
      scrollY: window.scrollY,
    })
    if (Math.abs(d) >= 0.5) window.scrollTo({ top: window.scrollY + d, behavior: "instant" })
    const h = el.offsetHeight
    still = Math.abs(h - lastH) < 0.5 ? still + 1 : 0
    lastH = h
    const t = performance.now() - t0
    if (t > 1200 || (t > 220 && still >= 6)) {
      stop()
      return
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return stop
}

/**
 * THE JOURNAL, IN PLACE ON HOME (build-brief-final §3.5). Closed, it is one
 * quiet field, "How did today go?". Tapped, the card grows UPWARDS from where
 * it sits (W52): the page follows the growth so the card's bottom stays put,
 * and the day, the note, the tiles and Save slide up into place, one after
 * another. Nothing opens until a tile is tapped; each opens a panel (the well:
 * radius 14, the deeper inner shadow) with ONE header row, its name at 12.5px
 * and the 30px arrow (W8), and it too grows upwards. Switching tiles
 * cross-fades on a token, so two quick taps always land on the last one (B31).
 * Reduced motion: the card and panels open at once and their contents fade.
 *
 * The draft (lib/progress/journalDraft.ts):
 * - The journal is read each time the card opens. When it lands it fills the
 *   day shown THEN, not the day it was opened on, and keeps anything typed
 *   meanwhile (B5). Save waits for it and says so.
 * - The markers dialer stays mounted while the card is open, hidden while
 *   another tile shows, so rows and ratings survive a tile switch (B6), and
 *   the Markers tile says what is there, "Not rated" included (F11).
 * - A photo belongs to the day it was started on: one still uploading when the
 *   day changes or the card closes is taken back out, never attached to the
 *   day now shown (S8). A photo arrives once loaded, fading down (W9).
 * - Saving leaves the card where it is: Save turns into a tick and "Saved"
 *   until the next change, so the page never jumps (W10). No toast.
 *
 * It saves through the same action and the same journal read as the Progress
 * page's journal, so an entry written here is the entry you find there.
 */
export function HomeJournal({ userId, dayKey, todayKey }: { userId: string; dayKey: DateKey; todayKey: DateKey }) {
  const { guard } = useWriteAccess()
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  /** Bumped by every open: the rise-in replays, and the dialer starts afresh. */
  const [session, setSession] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | "loading" | "failed" | null>(null)
  const [date, setDate] = useState<string>(dayKey)
  const [body, setBody] = useState("")
  const [rows, setRows] = useState<DraftRow[]>([])
  const [pending, setPending] = useState<Pending[]>([])
  /** The draft ticket of each upload in flight (S8). */
  const [inFlight, setInFlight] = useState<number[]>([])
  const [ticket, setTicket] = useState(0)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [adjustQueue, setAdjustQueue] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Save was tapped while it could not save: the reason shows (ruling 10). */
  const [asked, setAsked] = useState(false)
  const [savedSnap, setSavedSnap] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [dialerLive, setDialerLive] = useState(false)

  const sectionRef = useRef<HTMLElement>(null)
  const openRef = useRef<HTMLDivElement>(null)
  const tilesRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  // What the read's landing needs, as of now (B5), not as of the open.
  const dateRef = useRef<string>(dayKey)
  const bodyRef = useRef("")
  const typedDuringRead = useRef(false)
  const readToken = useRef(0)
  const ticketRef = useRef(0)
  const pendingRef = useRef<Pending[]>([])
  /** Paths being saved right now: a close meanwhile must not take them back out. */
  const savingPaths = useRef(new Set<string>())
  /** Object URLs kept by the local copy of a saved entry, freed when it is replaced. */
  const localUrls = useRef<string[]>([])
  const growStop = useRef<(() => void) | null>(null)
  const closeToken = useRef(0)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const focusNote = useRef(false)
  /** The big "Add photos" box, as it was when tapped: the small tile grows out of it. */
  const bigAddRect = useRef<DOMRect | null>(null)

  const data = loaded && typeof loaded === "object" ? loaded : null
  const read: "loading" | "failed" | "ready" = data ? "ready" : loaded === "failed" ? "failed" : "loading"
  const entry = data?.entries.find((e) => e.date === date) ?? null
  const photos = [
    ...(entry?.attachments ?? []).map((a) => ({ key: a.id, url: a.url })),
    ...pending.map((p) => ({ key: p.path, url: p.url as string | null })),
  ]
  const uploadingNow = inFlight.filter((t) => t === ticket).length
  // "Use my last": the markers on the most recent entry before this day.
  const lastUsed = useMemo(() => {
    const prev = (data?.entries ?? []).filter((e) => e.date < date && e.markers.length > 0).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
    return prev ? prev.markers.map((m) => m.markerId) : []
  }, [data, date])

  function setNote(v: string) {
    bodyRef.current = v
    setBody(v)
  }

  function bumpTicket() {
    ticketRef.current += 1
    setTicket(ticketRef.current)
  }

  const preload = (forDate: string, from: Loaded | null) => {
    const e = from?.entries.find((x) => x.date === forDate) ?? null
    setNote(e?.body ?? "")
    setRows(rowsFromEntry(e))
  }

  function freeLocalUrls() {
    localUrls.current.forEach((u) => URL.revokeObjectURL(u))
    localUrls.current = []
  }

  function startRead() {
    const token = ++readToken.current
    setLoaded("loading")
    void readJournalForHome()
      .then((r) => {
        if (token !== readToken.current) return
        if (!r.ok) {
          setLoaded("failed")
          return
        }
        const next = { entries: r.entries, options: r.options }
        freeLocalUrls()
        setLoaded(next)
        // B5: the day shown NOW, and the note typed while the read was out.
        const d = draftOnRead(next.entries, dateRef.current, typedDuringRead.current ? bodyRef.current : null)
        typedDuringRead.current = false
        setNote(d.body)
        setRows(d.rows)
      })
      .catch(() => {
        if (token === readToken.current) setLoaded("failed")
      })
  }

  /* ---- the tile and its panel (a token per press: B31) ---- */
  const [swap, setSwap] = useState<SwapState<Tile>>(swapStart)
  const swapRef = useRef(swap)
  const tile = swap.tile
  const shown = swap.shown
  const panRef = useRef<HTMLDivElement>(null)
  const swapFrom = useRef<number | null>(null)
  const parts = () => Array.from(panRef.current?.querySelectorAll<HTMLElement>("[data-pan-part]") ?? [])

  function commitSwap(next: SwapState<Tile>) {
    swapRef.current = next
    setSwap(next)
  }

  /** The page follows the card's height as it moves (W52); see `followGrowth`. */
  function follow(startBottom: number, keep: (() => HTMLElement | null) | null) {
    growStop.current?.()
    const el = sectionRef.current
    if (!el || typeof requestAnimationFrame !== "function") return
    growStop.current = followGrowth(el, startBottom, keep, () => {
      growStop.current = null
    })
  }

  const bottomNow = () => (sectionRef.current ? laidOut(sectionRef.current).bottom : 0)
  const keepTiles = () => tilesRef.current

  const choose = (next: Tile) => {
    const start = bottomNow()
    const pan = panRef.current
    const cur = swapRef.current
    const { state, step } = pressTile(cur, next, !reducedMotion() && pan !== null)
    commitSwap(state)
    follow(start, keepTiles)
    if (step !== "fade" || !pan) return
    swapFrom.current = pan.getBoundingClientRect().height
    const token = state.token
    const land = () => commitSwap(landSwap(swapRef.current, token, next))
    // Out the way it came in: down 4px, fading, from wherever it is now.
    Promise.allSettled(
      parts().map((p) => {
        const cs = getComputedStyle(p)
        return p.animate(
          [
            { opacity: cs.opacity, transform: cs.transform === "none" ? "none" : cs.transform },
            { opacity: 0, transform: "translateY(4px)" },
          ],
          { duration: 110, easing: "ease-in", fill: "forwards" },
        ).finished
      }),
    ).then(land, land)
  }

  const closeTile = () => {
    const start = bottomNow()
    commitSwap(shutPanel(swapRef.current))
    follow(start, null)
  }

  // Every landing (a switch, or a panel opening) brings the parts up into place.
  useLayoutEffect(() => {
    const pan = panRef.current
    if (!pan || swap.landed === 0) return
    const from = swapFrom.current
    swapFrom.current = null
    const ps = parts()
    for (const p of ps) p.getAnimations().forEach((a) => a.cancel())
    if (reducedMotion()) {
      for (const p of ps) p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" })
      return
    }
    const to = pan.getBoundingClientRect().height
    if (from != null && Math.abs(to - from) > 1) {
      pan.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 280, easing: EASE })
    }
    ps.forEach((p, i) => {
      p.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], {
        duration: 260,
        delay: i === ps.length - 1 ? 40 : 0,
        easing: EASE,
        fill: "backwards",
      })
    })
    // `parts` reads the panel as it is now; only a landing re-runs this.
  }, [swap.landed])

  /* ---- open and close ---- */
  const openCard = (fromKeyboard: boolean) => {
    const start = bottomNow()
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeToken.current += 1
    bumpTicket()
    setSession((s) => s + 1)
    setOpen(true)
    setDialerLive(true)
    setDate(dayKey)
    dateRef.current = dayKey
    setError(null)
    setAttachError(null)
    setAsked(false)
    setSavedSnap(null)
    setCreating(false)
    typedDuringRead.current = false
    focusNote.current = fromKeyboard
    // Read afresh on every open: the full-page writer (the +, Progress) may
    // have changed the day since, and a cached copy would save over it.
    setNote("")
    setRows([])
    startRead()
    follow(start, () => sectionRef.current)
  }

  // The card's contents slide up into place as it grows, one after another
  // (W52). Reduced motion: a fade.
  useLayoutEffect(() => {
    const root = openRef.current
    if (!open || !root) return
    const reduce = reducedMotion()
    root.querySelectorAll<HTMLElement>("[data-rise]").forEach((el, i) => {
      el.getAnimations().forEach((a) => a.cancel())
      el.animate(
        reduce
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { opacity: 0, transform: "translateY(14px)" },
              { opacity: 1, transform: "none" },
            ],
        { duration: reduce ? 200 : 380, delay: reduce ? 0 : 40 + i * 50, easing: EASE, fill: "backwards" },
      )
    })
    if (focusNote.current) {
      focusNote.current = false
      textRef.current?.focus({ preventScroll: true })
    }
    // Once per open.
  }, [open, session])

  /** Photos uploaded for a draft that was never saved leave the bucket again. */
  async function rollback() {
    const list = pendingRef.current.filter((p) => !savingPaths.current.has(p.path))
    pendingRef.current = pendingRef.current.filter((p) => savingPaths.current.has(p.path))
    setPending(pendingRef.current)
    list.forEach((p) => URL.revokeObjectURL(p.url))
    if (list.length > 0) await supabase.storage.from("journal").remove(list.map((p) => p.path))
  }

  const close = () => {
    const start = bottomNow()
    void rollback()
    bumpTicket()
    commitSwap(shutPanel(swapRef.current))
    setOpen(false)
    setAdjustQueue([])
    setAsked(false)
    bigAddRect.current = null
    // Leave the way it came: the parts sink and fade as the card folds down.
    if (!reducedMotion()) {
      openRef.current?.querySelectorAll<HTMLElement>("[data-rise]").forEach((el) => {
        el.getAnimations().forEach((a) => a.cancel())
        el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(10px)" }], {
          duration: 200,
          easing: "ease-in",
          fill: "forwards",
        })
      })
    }
    follow(start, null)
    // The dialer goes once the fold has played out, unless the card reopened.
    const mine = ++closeToken.current
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      if (mine === closeToken.current) {
        setDialerLive(false)
        setCreating(false)
      }
    }, UNMOUNT_AFTER_CLOSE_MS)
  }

  // Leaving Home's day (the card remounts per day) or the page: nothing orphaned.
  useEffect(() => {
    const paths = savingPaths.current
    return () => {
      growStop.current?.()
      if (closeTimer.current) clearTimeout(closeTimer.current)
      ticketRef.current += 1
      readToken.current += 1
      const left = pendingRef.current.filter((p) => !paths.has(p.path))
      pendingRef.current = []
      left.forEach((p) => URL.revokeObjectURL(p.url))
      if (left.length > 0) void supabase.storage.from("journal").remove(left.map((p) => p.path))
      localUrls.current.forEach((u) => URL.revokeObjectURL(u))
      localUrls.current = []
    }
  }, [supabase])

  /* ---- the day ---- */
  function pickDay(k: string) {
    if (k === dateRef.current) return
    void rollback()
    bumpTicket()
    setAdjustQueue([])
    bigAddRect.current = null
    setDate(k)
    dateRef.current = k
    setSavedSnap(null)
    setAsked(false)
    // The dialer starts afresh on the new day (its key), not mid "Create your own".
    setCreating(false)
    if (data) preload(k, data)
    else {
      setNote("")
      setRows([])
      typedDuringRead.current = false
    }
  }

  /* ---- photos ---- */
  function queue(files: FileList | null) {
    if (!files || files.length === 0) return
    setAttachError(null)
    const ok: File[] = []
    for (const f of Array.from(files)) {
      if (!EXT[f.type]) setAttachError("Photos only: JPG, PNG, WebP or HEIC.")
      else if (f.size > MAX_BYTES) setAttachError("Each photo must be under 10 MB.")
      else ok.push(f)
    }
    if (ok.length > 0) setAdjustQueue(ok)
    if (fileRef.current) fileRef.current.value = ""
  }
  async function upload(file: File) {
    // S8: the upload belongs to the draft it started in.
    const mine = ticketRef.current
    setInFlight((f) => [...f, mine])
    try {
      const ext = EXT[file.type] ?? "jpg"
      const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
      const path = `${userId}/${id}/photo.${ext}`
      const up = await supabase.storage.from("journal").upload(path, file, { contentType: file.type, upsert: false })
      if (up.error) throw new Error(up.error.message)
      if (uploadLands(mine, ticketRef.current) === "discard") {
        await supabase.storage.from("journal").remove([path])
        return
      }
      pendingRef.current = [...pendingRef.current, { path, url: URL.createObjectURL(file) }]
      setPending(pendingRef.current)
    } catch {
      if (mine === ticketRef.current) setAttachError("Couldn’t add that photo. Try again.")
    } finally {
      setInFlight((f) => {
        const i = f.indexOf(mine)
        return i < 0 ? f : [...f.slice(0, i), ...f.slice(i + 1)]
      })
    }
  }
  const onAdjusted = (r: PhotoAdjustResult) => {
    setAdjustQueue((q) => q.slice(1))
    void upload(r.file)
  }

  // The first photo: the big "Add photos" box shrinks into the small add tile
  // beside it (the final-check page's J2), transform only.
  const gridShown = photos.length + uploadingNow > 0
  const smallAddRef = useRef<HTMLButtonElement>(null)
  const wasGrid = useRef(gridShown)
  useLayoutEffect(() => {
    const was = wasGrid.current
    wasGrid.current = gridShown
    const from = bigAddRect.current
    const el = smallAddRef.current
    if (was || !gridShown || !from || !el) return
    bigAddRect.current = null
    if (reducedMotion()) return
    const to = el.getBoundingClientRect()
    if (to.width === 0 || to.height === 0) return
    el.animate(
      [
        {
          transformOrigin: "top left",
          transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`,
        },
        { transformOrigin: "top left", transform: "none" },
      ],
      { duration: 520, easing: EASE },
    )
  }, [gridShown])

  /* ---- save ---- */
  const reason = journalSaveBlock({ read, uploading: uploadingNow > 0, body, rows, photoCount: photos.length })
  const saved = isSavedDraft(savedSnap, { date, body, rows }, pending.length + uploadingNow)
  const save = () => {
    if (saving || saved) return
    if (reason) {
      setAsked(true)
      return
    }
    guard(async () => {
      const sentDate = date
      const sentBody = body
      const sentRows = rows
      const sent = pendingRef.current
      const sentTicket = ticketRef.current
      sent.forEach((p) => savingPaths.current.add(p.path))
      setSaving(true)
      setError(null)
      setAsked(false)
      const res = await saveJournalEntry({
        entryDate: sentDate,
        touchBody: true,
        body: sentBody,
        markers: ratedRows(sentRows),
        attachmentsAdd: sent.map((p) => p.path),
        attachmentsRemove: [],
      })
      sent.forEach((p) => savingPaths.current.delete(p.path))
      setSaving(false)
      const sentPaths = new Set(sent.map((p) => p.path))
      if (!res.ok) {
        // Closed or moved to another day meanwhile: those photos are orphans now.
        if (sentTicket !== ticketRef.current && sent.length > 0) {
          pendingRef.current = pendingRef.current.filter((p) => !sentPaths.has(p.path))
          setPending(pendingRef.current)
          sent.forEach((p) => URL.revokeObjectURL(p.url))
          void supabase.storage.from("journal").remove(sent.map((p) => p.path))
        }
        setError(res.error ?? "Couldn’t save. Try again.")
        return
      }
      // The photos are on the entry now: they leave the draft, keeping their
      // preview in the local copy of the entry.
      pendingRef.current = pendingRef.current.filter((p) => !sentPaths.has(p.path))
      setPending(pendingRef.current)
      localUrls.current.push(...sent.map((p) => p.url))
      setLoaded((prev) =>
        prev && typeof prev === "object"
          ? {
              ...prev,
              entries: entriesAfterSave(prev.entries, {
                date: sentDate,
                body: sentBody,
                rows: sentRows,
                options: prev.options,
                photosAdded: sent.map((p) => ({ id: p.path, url: p.url })),
              }),
            }
          : prev,
      )
      setSavedSnap(draftSnapshot({ date: sentDate, body: sentBody, rows: sentRows }))
    })
  }

  const subs: Record<Tile, string> = {
    markers: markersTileWord(rows),
    photos: photos.length > 0 ? String(photos.length) : "None",
    date: dayWord(date, todayKey),
  }

  const markersBody = (): ReactNode => {
    if (data && dialerLive) {
      return (
        <MarkerDialer
          key={`${session}:${date}`}
          options={data.options}
          initial={rows}
          onChange={(rated) => setRows((prev) => mergeRatedIntoRows(prev, rated))}
          onRowsChange={(all) => setRows(all.map((r) => ({ markerId: r.markerId, tierValue: r.tierValue })))}
          onCreatingChange={setCreating}
          lastUsed={lastUsed}
        />
      )
    }
    return null
  }

  const panelBody = (kind: Tile): ReactNode => {
    if (kind === "markers") {
      if (read === "loading") return <div aria-hidden className="sk h-[96px] rounded-xl bg-bg-surface-raised" />
      if (read === "failed") return <p className="py-4 text-center text-[13px] text-text-muted">Couldn&apos;t load your markers.</p>
      return null
    }
    if (kind === "photos") {
      return (
        <div>
          {!gridShown ? (
            <button
              type="button"
              onClick={(e) => {
                bigAddRect.current = e.currentTarget.getBoundingClientRect()
                fileRef.current?.click()
              }}
              className={cn(PRESS.card, "flex min-h-[118px] w-full flex-col items-center justify-center gap-[7px] rounded-xl border border-border-strong text-[12px] text-text-muted")}
            >
              <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-bg-surface-raised text-foreground">
                <Plus />
              </span>
              Add photos
            </button>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {photos.map((p) =>
                p.url ? (
                  <span key={p.key} className="h-[62px] w-[62px] overflow-hidden rounded-[10px] bg-bg-surface-raised">
                    <JournalPhoto src={p.url} className="h-full w-full object-cover" />
                  </span>
                ) : (
                  <span key={p.key} className="h-[62px] w-[62px] rounded-[10px] bg-bg-surface-raised" />
                ),
              )}
              {Array.from({ length: uploadingNow }, (_, i) => (
                <span key={`up-${i}`} aria-hidden className="sk h-[62px] w-[62px] rounded-[10px] bg-bg-surface-raised" />
              ))}
              <button
                ref={smallAddRef}
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Add photos"
                className={cn(PRESS.card, "flex h-[62px] w-[62px] items-center justify-center rounded-[10px] border border-border-strong text-text-muted")}
              >
                <Plus />
              </button>
            </div>
          )}
          {uploadingNow > 0 ? (
            <p role="status" className="mt-2 text-[12px] text-text-muted">
              Adding…
            </p>
          ) : null}
          {attachError ? <p className="mt-2 text-[12px] text-text-muted">{attachError}</p> : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            multiple
            hidden
            onChange={(e) => queue(e.target.files)}
          />
        </div>
      )
    }
    return <DatePickerPanel value={date as DateKey} todayKey={todayKey} active={tile === "date"} onPick={pickDay} />
  }

  // Create your own brings its own header row ("Cancel", "New marker"): the
  // panel's row steps aside so there is only ever one (W8).
  const headerShown = !(shown === "markers" && creating)

  return (
    <section ref={sectionRef} className="inst-card p-5" data-journal-open={open ? "true" : "false"}>
      <div className="flex items-center justify-between">
        <h2 className={CARD_EYEBROW}>Journal</h2>
        {/* The one close arrow (consistency fix #11); it steps back while a
            tile's panel, with its own arrow, is open. */}
        <CloseArrow onClick={close} label="Close the journal" shown={open && !tile} className="-my-2" />
      </div>

      {/* Closed: one quiet field. It folds away as the card opens, so the
          card's height changes in one smooth move. */}
      <div className="log-panel" data-open={open ? "false" : "true"} inert={open}>
        <div>
          <button
            type="button"
            onClick={(e) => openCard(e?.detail === 0)}
            className={cn(PRESS.field, "mt-3 flex w-full items-center rounded-xl bg-bg-input px-4 py-3 text-left text-sm text-text-muted")}
          >
            How did today go?
          </button>
        </div>
      </div>

      <div className="log-panel" data-open={open ? "true" : "false"} inert={!open}>
        <div ref={openRef}>
          <p data-rise className="mt-2 text-[17px] font-light text-foreground">
            {dayLong(date)}
          </p>
          <textarea
            ref={textRef}
            data-rise
            value={body}
            onChange={(e) => {
              if (loaded === "loading") typedDuringRead.current = true
              setNote(e.target.value)
            }}
            rows={3}
            placeholder="Training, sleep, how the protocol’s treating you"
            aria-label="Note"
            className="inset-focus mt-2 block w-full resize-none rounded-xl bg-bg-input px-3 py-2.5 text-[13px] text-foreground outline-none placeholder:text-text-muted"
          />
          <div ref={tilesRef} data-rise className="log-tiles hairline-t mt-3 flex gap-[7px] pt-2.5" data-focus={tile ? "true" : "false"}>
            {TILES.map((t) => (
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
                  <SolidIcon name={t.glyph} size={20} tone={tile === t.key || subs[t.key] !== "None" ? "on" : "off"} />
                </span>
                <span className={cn(TILE_LABEL, "leading-[1.1]", tile === t.key && "text-foreground")}>{t.label}</span>
                <span className="max-w-full truncate font-mono text-[10px] leading-none text-text-muted">{subs[t.key]}</span>
              </button>
            ))}
          </div>
          <div className="log-panel" data-open={tile ? "true" : "false"} inert={!tile}>
            <div>
              <div ref={panRef} className="inset-surface relative mt-[9px] overflow-hidden pt-2 pr-2.5 pb-2.5 pl-3" style={WELL}>
                {headerShown ? (
                  <div className="flex min-h-8 items-center gap-2.5">
                    <span data-pan-part className="min-w-0 flex-1 text-[12.5px] text-foreground">
                      {shown ? TILES.find((t) => t.key === shown)?.label : null}
                    </span>
                    <span data-pan-part className="flex shrink-0">
                      <CloseArrow onClick={closeTile} shown={tile !== null} />
                    </span>
                  </div>
                ) : null}
                <div data-pan-part className={headerShown ? "mt-2.5" : undefined}>
                  {/* The dialer stays mounted while the card is open, hidden
                      under another tile, so nothing rated is lost (B6). */}
                  <div hidden={shown !== "markers"}>{markersBody()}</div>
                  {shown ? panelBody(shown) : null}
                </div>
              </div>
            </div>
          </div>
          {read === "failed" ? (
            <p data-rise className="mt-3 flex items-center justify-between gap-3 text-[12.5px] text-text-muted">
              Couldn’t load your journal.
              <button type="button" onClick={startRead} className={cn(PRESS.text, HIT_Y_TEXT, "shrink-0 text-foreground")}>
                Try again
              </button>
            </p>
          ) : asked && reason ? (
            <p role="status" className="mt-3 text-[12.5px] text-text-muted">
              {reason}
            </p>
          ) : null}
          {error ? <p className="mt-3 text-[12.5px] text-accent-destructive-on-surface">{error}</p> : null}
          <div data-rise className="mt-4">
            {/* Never dead without a reason: while it cannot save it is dimmed,
                and a tap says why (ruling 10). */}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              aria-disabled={reason !== null && !saved ? true : undefined}
              className={cn(PRIMARY_BUTTON, "w-full aria-disabled:opacity-50")}
            >
              {saving ? (
                "Saving…"
              ) : saved ? (
                <span key={savedSnap} role="status" className="flex items-center gap-2">
                  <SavedTick />
                  Saved
                </span>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </div>
      </div>

      <PhotoAdjustSheet
        open={adjustQueue.length > 0}
        file={adjustQueue[0] ?? null}
        aspect={DOCUMENT_ASPECT}
        onCancel={() => {
          if (adjustQueue.length <= 1) bigAddRect.current = null
          setAdjustQueue((q) => q.slice(1))
        }}
        onConfirm={onAdjusted}
      />
    </section>
  )
}
