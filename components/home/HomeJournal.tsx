"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { readJournalForHome, saveJournalEntry } from "@/app/(app)/progress/actions"
import { useWriteAccess } from "@/components/billing/ReadOnlyGate"
import { DatePickerPanel } from "@/components/calendar/DatePickerPanel"
import { SolidIcon } from "@/components/feel/SolidIcon"
import { PhotoAdjustSheet, type PhotoAdjustResult } from "@/components/media/PhotoAdjustSheet"
import { MarkerDialer } from "@/components/progress/MarkerDialer"
import type { DateKey } from "@/lib/home/mockHomeData"
import { DOCUMENT_ASPECT } from "@/lib/media/framing"
import type { JournalEntry, MarkerOption } from "@/lib/progress/journal"
import { createClient } from "@/lib/supabase/client"
import { showToast } from "@/lib/toast"
import { CARD_EYEBROW, PRESS, PRIMARY_BUTTON } from "@/lib/ui-presets"
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

type Loaded = { entries: JournalEntry[]; options: MarkerOption[] }

function UpArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 14.5l6-6 6 6" />
    </svg>
  )
}

function Plus({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
      <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function dayLine(key: string): string {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }).replace(",", "")
}

function dayWord(key: string, todayKey: string): string {
  if (key === todayKey) return "Today"
  const [y, m, d] = todayKey.split("-").map(Number)
  const yest = new Date(y, m - 1, d - 1)
  const yk = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, "0")}-${String(yest.getDate()).padStart(2, "0")}`
  if (key === yk) return "Yesterday"
  const [ky, km, kd] = key.split("-").map(Number)
  return new Date(ky, km - 1, kd).toLocaleDateString("en-AU", { day: "numeric", month: "short" })
}

/**
 * THE JOURNAL, IN PLACE ON HOME (build-brief-final §3.5). Closed, it is one
 * quiet field, "How did today go?". Tapped, the card grows in place: the day,
 * the note, and three tiles, Markers / Photos / Date. Nothing opens until a tile
 * is tapped; each opens a panel with ONE header row (its name and the arrow),
 * and switching tiles cross-fades as the dose row's panels do.
 *
 * It saves through the same action and the same journal read as the Progress
 * page's journal, so an entry written here is the entry you find there. The
 * read happens only when the card opens, so Home's own load never pays for it.
 */
export function HomeJournal({ userId, dayKey, todayKey }: { userId: string; dayKey: DateKey; todayKey: DateKey }) {
  const { guard } = useWriteAccess()
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState<Loaded | "loading" | "failed" | null>(null)
  const [date, setDate] = useState<string>(dayKey)
  const [body, setBody] = useState("")
  const [markers, setMarkers] = useState<{ markerId: string; tierValue: number }[]>([])
  const [pending, setPending] = useState<{ path: string; url: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [adjustQueue, setAdjustQueue] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const data = loaded && typeof loaded === "object" ? loaded : null
  const entry = data?.entries.find((e) => e.date === date) ?? null
  const photos = [...(entry?.attachments ?? []).map((a) => ({ key: a.id, url: a.url })), ...pending.map((p) => ({ key: p.path, url: p.url }))]
  // "Use my last": the markers on the most recent entry before this day.
  const lastUsed = useMemo(() => {
    const prev = (data?.entries ?? []).filter((e) => e.date < date && e.markers.length > 0).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
    return prev ? prev.markers.map((m) => m.markerId) : []
  }, [data, date])

  const preload = (forDate: string, from: Loaded | null) => {
    const e = from?.entries.find((x) => x.date === forDate) ?? null
    setBody(e?.body ?? "")
    setMarkers((e?.markers ?? []).map((m) => ({ markerId: m.markerId, tierValue: m.tierValue })))
  }

  const openCard = () => {
    setOpen(true)
    setDate(dayKey)
    setError(null)
    if (data) {
      preload(dayKey, data)
      return
    }
    setLoaded("loading")
    void readJournalForHome().then((r) => {
      if (!r.ok) {
        setLoaded("failed")
        return
      }
      const next = { entries: r.entries, options: r.options }
      setLoaded(next)
      preload(dayKey, next)
    })
  }

  /** Photos uploaded for an entry that was never saved leave the bucket again. */
  async function rollback() {
    const paths = pending.map((p) => p.path)
    pending.forEach((p) => URL.revokeObjectURL(p.url))
    setPending([])
    if (paths.length > 0) await supabase.storage.from("journal").remove(paths)
  }

  /* ---- the tile and its panel (the dose row's pattern) ---- */
  const [tile, setTile] = useState<Tile | null>(null)
  const [shown, setShown] = useState<Tile | null>(null)
  const panRef = useRef<HTMLDivElement>(null)
  const swapFrom = useRef<number | null>(null)
  const parts = () => Array.from(panRef.current?.querySelectorAll<HTMLElement>("[data-pan-part]") ?? [])
  const choose = (next: Tile) => {
    if (next === tile) {
      setTile(null)
      return
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const pan = panRef.current
    if (tile && shown && pan && !reduce) {
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
  }
  useEffect(() => {
    const from = swapFrom.current
    const pan = panRef.current
    if (from == null || !pan) return
    swapFrom.current = null
    for (const p of parts()) p.getAnimations().forEach((a) => a.cancel())
    const to = pan.getBoundingClientRect().height
    if (Math.abs(to - from) > 1) pan.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 280, easing: EASE })
    for (const p of parts()) {
      p.animate([{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: EASE })
    }
  }, [shown])

  const close = () => {
    void rollback()
    setTile(null)
    setOpen(false)
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
    setUploading(true)
    try {
      const ext = EXT[file.type] ?? "jpg"
      const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
      const path = `${userId}/${id}/photo.${ext}`
      const up = await supabase.storage.from("journal").upload(path, file, { contentType: file.type, upsert: false })
      if (up.error) throw new Error(up.error.message)
      setPending((prev) => [...prev, { path, url: URL.createObjectURL(file) }])
    } catch {
      setAttachError("Couldn't add that photo.")
    } finally {
      setUploading(false)
    }
  }
  const onAdjusted = (r: PhotoAdjustResult) => {
    setAdjustQueue((q) => q.slice(1))
    void upload(r.file)
  }

  /* ---- save ---- */
  const canSave = body.trim().length > 0 || markers.length > 0 || photos.length > 0
  const save = () =>
    guard(async () => {
      setSaving(true)
      setError(null)
      const res = await saveJournalEntry({
        entryDate: date,
        touchBody: true,
        body,
        markers,
        attachmentsAdd: pending.map((p) => p.path),
        attachmentsRemove: [],
      })
      setSaving(false)
      if (!res.ok) {
        setError(res.error ?? "Couldn't save. Try again.")
        return
      }
      pending.forEach((p) => URL.revokeObjectURL(p.url))
      setPending([])
      // The next open reads the journal again, with this entry in it.
      setLoaded(null)
      setTile(null)
      setOpen(false)
      showToast("Saved")
    })

  const rated = markers.filter((m) => m.tierValue > 0).length
  const subs: Record<Tile, string> = {
    markers: rated > 0 ? `${rated} noted` : markers.length > 0 ? "Not rated" : "None",
    photos: photos.length > 0 ? String(photos.length) : "None",
    date: dayWord(date, todayKey),
  }

  const panelBody = (kind: Tile): ReactNode => {
    if (kind === "markers") {
      if (loaded === "loading" || loaded === null) return <div aria-hidden className="sk h-[96px] rounded-xl bg-bg-surface-raised" />
      if (loaded === "failed") return <p className="py-4 text-center text-[13px] text-text-muted">Couldn&apos;t load your markers.</p>
      return (
        <MarkerDialer
          key={date}
          options={data?.options ?? []}
          initial={entry?.markers ?? []}
          onChange={setMarkers}
          lastUsed={lastUsed}
        />
      )
    }
    if (kind === "photos") {
      return (
        <div>
          {photos.length === 0 ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className={cn(PRESS.card, "flex min-h-[118px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-border-strong text-[13px] text-text-muted")}
            >
              <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-bg-surface-raised text-foreground">
                <Plus />
              </span>
              {uploading ? "Adding…" : "Add photos"}
            </button>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {photos.map((p) =>
                p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.key} src={p.url} alt="" className="h-[62px] w-[62px] rounded-[10px] object-cover" />
                ) : (
                  <span key={p.key} className="h-[62px] w-[62px] rounded-[10px] bg-bg-surface-raised" />
                ),
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                aria-label="Add photos"
                className={cn(PRESS.card, "flex h-[62px] w-[62px] items-center justify-center rounded-[10px] border border-border-strong text-text-muted")}
              >
                <Plus />
              </button>
            </div>
          )}
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
    return (
      <DatePickerPanel
        value={date as DateKey}
        todayKey={todayKey}
        active={tile === "date"}
        onPick={(k) => {
          if (k === date) return
          void rollback()
          setDate(k)
          preload(k, data)
        }}
      />
    )
  }

  return (
    <section className="inst-card p-5" data-journal-open={open ? "true" : "false"}>
      <div className="flex items-center justify-between">
        <h2 className={CARD_EYEBROW}>Journal</h2>
        {open ? (
          <button
            type="button"
            onClick={close}
            aria-label="Close the journal"
            className={cn(
              PRESS.icon,
              "inst-ghost -my-1.5 flex h-[30px] w-[30px] items-center justify-center rounded-md text-foreground transition-opacity",
              tile && "pointer-events-none opacity-0",
            )}
          >
            <UpArrow />
          </button>
        ) : null}
      </div>

      {!open ? (
        <button
          type="button"
          onClick={openCard}
          className={cn(PRESS.field, "mt-3 flex w-full items-center rounded-xl bg-bg-input px-4 py-3 text-left text-sm text-text-muted")}
        >
          How did today go?
        </button>
      ) : null}

      <div className="log-panel" data-open={open ? "true" : "false"} inert={!open}>
        <div>
          <p className="mt-2 text-[17px] font-light text-foreground">{dayLine(date)}</p>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Training, sleep, how the protocol’s treating you"
            aria-label="Note"
            className="inset-focus mt-2 block w-full resize-none rounded-xl bg-bg-input px-3 py-2.5 text-[13px] text-foreground outline-none placeholder:text-text-muted"
          />
          <div className="log-tiles hairline-t mt-3 flex gap-[7px] pt-2.5" data-focus={tile ? "true" : "false"}>
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
                <span className="text-[11.5px] leading-[1.1]">{t.label}</span>
                <span className="max-w-full truncate font-mono text-[9.5px] leading-none text-text-muted">{subs[t.key]}</span>
              </button>
            ))}
          </div>
          <div className="log-panel" data-open={tile ? "true" : "false"} inert={!tile}>
            <div>
              <div ref={panRef} className="inset-surface relative mt-2.5 overflow-hidden pt-2 pr-2.5 pb-2.5 pl-3">
                <div className="flex min-h-8 items-center gap-2.5">
                  <span data-pan-part className="min-w-0 flex-1 text-[13px] text-foreground">
                    {shown ? TILES.find((t) => t.key === shown)?.label : null}
                  </span>
                  <button
                    data-pan-part
                    type="button"
                    onClick={() => setTile(null)}
                    aria-label="Close"
                    className={cn(PRESS.icon, "inst-ghost flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md text-foreground")}
                  >
                    <UpArrow />
                  </button>
                </div>
                <div data-pan-part className="mt-2.5">
                  {shown ? panelBody(shown) : null}
                </div>
              </div>
            </div>
          </div>
          {error ? <p className="mt-3 text-[12.5px] text-accent-destructive-on-surface">{error}</p> : null}
          <button type="button" onClick={save} disabled={!canSave || saving || uploading} className={cn(PRIMARY_BUTTON, "mt-4 w-full")}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <PhotoAdjustSheet
        open={adjustQueue.length > 0}
        file={adjustQueue[0] ?? null}
        aspect={DOCUMENT_ASPECT}
        onCancel={() => setAdjustQueue((q) => q.slice(1))}
        onConfirm={onAdjusted}
      />
    </section>
  )
}
