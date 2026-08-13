"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { sfx, wakeAudio } from "@/lib/admin/arcade/audio"
import { drawGrid } from "@/lib/admin/arcade/kyle"

/** Block Blast, Connect Four vs Will, and Solitaire. */

/* ══════════════════════════ BLOCK BLAST ═════════════════════════════════ */
/**
 * Drag one of three shapes onto an 8×8 grid; a full row or column clears.
 *
 * You lose when NONE of the three offered shapes fits anywhere — which is the
 * whole game, and the reason the shapes are dealt three at a time rather than
 * one: with one shape there is always a corner it fits into and the run never
 * ends.
 */
const SHAPES: number[][][] = [
  [[1]], [[1, 1]], [[1], [1]], [[1, 1, 1]], [[1], [1], [1]],
  [[1, 1], [1, 1]], [[1, 1, 1, 1]], [[1], [1], [1], [1]],
  [[1, 0], [1, 0], [1, 1]], [[0, 1], [0, 1], [1, 1]],
  [[1, 1], [0, 1]], [[1, 1], [1, 0]], [[1, 1, 1], [0, 1, 0]],
  [[1, 1, 1], [1, 0, 0]], [[1, 1, 1], [0, 0, 1]],
]
const SHAPE_COLOURS = ["#c8861a", "#4fb3a6", "#6b7fd4", "#b5895c", "#c77da0"]
const N = 8
const CELL = 40
const TRAY_Y = N * CELL + 16

export function BlockBlast() {
  const W = N * CELL, H = N * CELL + 96
  const [score, setScore] = useState(0)
  const [over, setOver] = useState(false)
  const cv = useRef<HTMLCanvasElement | null>(null)

  const deal = useCallback(
    () => [0, 1, 2].map(() => {
      const i = Math.floor(Math.random() * SHAPES.length)
      return { shape: SHAPES[i], colour: SHAPE_COLOURS[i % SHAPE_COLOURS.length], used: false }
    }),
    []
  )

  const g = useRef({
    cells: new Array(N * N).fill("") as string[],
    tray: [] as { shape: number[][]; colour: string; used: boolean }[],
    drag: null as { idx: number; x: number; y: number } | null,
    score: 0,
    over: false,
  })

  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    g.current.tray = deal()
  }, [deal])

  const fits = useCallback((shape: number[][], gx: number, gy: number, cells: string[]) => {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue
        const x = gx + c, y = gy + r
        if (x < 0 || y < 0 || x >= N || y >= N) return false
        if (cells[y * N + x]) return false
      }
    }
    return true
  }, [])

  const anyFits = useCallback(
    (tray: typeof g.current.tray, cells: string[]) =>
      tray.some((t) => {
        if (t.used) return false
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (fits(t.shape, x, y, cells)) return true
        return false
      }),
    [fits]
  )

  const reset = useCallback(() => {
    g.current = { cells: new Array(N * N).fill(""), tray: deal(), drag: null, score: 0, over: false }
    setScore(0); setOver(false); sfx.start()
  }, [deal])

  const place = useCallback((idx: number, gx: number, gy: number) => {
    const st = g.current
    const piece = st.tray[idx]
    if (!piece || piece.used || !fits(piece.shape, gx, gy, st.cells)) { sfx.bad(); return }
    const cells = st.cells.slice()
    let placed = 0
    for (let r = 0; r < piece.shape.length; r++) {
      for (let c = 0; c < piece.shape[r].length; c++) {
        if (!piece.shape[r][c]) continue
        cells[(gy + r) * N + gx + c] = piece.colour
        placed++
      }
    }
    st.tray = st.tray.map((t, i) => (i === idx ? { ...t, used: true } : t))
    sfx.drop()

    // Clear full rows and columns TOGETHER, then wipe — clearing a row first
    // would stop a column that shared a cell from counting.
    const fullRows: number[] = [], fullCols: number[] = []
    for (let y = 0; y < N; y++) if (cells.slice(y * N, y * N + N).every(Boolean)) fullRows.push(y)
    for (let x = 0; x < N; x++) {
      let all = true
      for (let y = 0; y < N; y++) if (!cells[y * N + x]) { all = false; break }
      if (all) fullCols.push(x)
    }
    for (const y of fullRows) for (let x = 0; x < N; x++) cells[y * N + x] = ""
    for (const x of fullCols) for (let y = 0; y < N; y++) cells[y * N + x] = ""
    const lines = fullRows.length + fullCols.length
    if (lines > 0) sfx.clear()

    st.cells = cells
    st.score += placed + lines * lines * 20
    if (st.tray.every((t) => t.used)) st.tray = deal()
    setScore(st.score)
    if (!anyFits(st.tray, st.cells)) { st.over = true; setOver(true); sfx.lose() }
  }, [anyFits, deal, fits])

  useEffect(() => {
    const el = cv.current
    if (!el) return
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
    }
    const down = (e: PointerEvent) => {
      e.preventDefault(); wakeAudio()
      if (g.current.over) { reset(); return }
      const { x, y } = local(e)
      if (y < TRAY_Y) return
      const idx = Math.floor(x / (W / 3))
      if (idx < 0 || idx > 2 || g.current.tray[idx]?.used) return
      g.current.drag = { idx, x, y }
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!g.current.drag) return
      const { x, y } = local(e)
      g.current.drag = { ...g.current.drag, x, y }
    }
    const up = (e: PointerEvent) => {
      const d = g.current.drag
      if (!d) return
      g.current.drag = null
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      const shape = g.current.tray[d.idx]?.shape
      if (!shape) return
      // Anchor on the shape's centre so the piece lands where it looks.
      const gx = Math.round((d.x - (shape[0].length * CELL) / 2) / CELL)
      const gy = Math.round((d.y - (shape.length * CELL) / 2 - CELL) / CELL)
      place(d.idx, gx, gy)
    }
    el.addEventListener("pointerdown", down)
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerup", up)
    el.addEventListener("pointercancel", up)
    return () => {
      el.removeEventListener("pointerdown", down)
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerup", up)
      el.removeEventListener("pointercancel", up)
    }
  }, [H, W, place, reset])

  useEffect(() => {
    const el = cv.current
    if (!el) return
    const ctx = el.getContext("2d")
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    let raf = 0
    const frame = () => {
      const st = g.current
      ctx.fillStyle = "#111110"; ctx.fillRect(0, 0, W, H)
      drawGrid(ctx, W, H)
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const v = st.cells[y * N + x]
          ctx.fillStyle = v || "#1c1c1a"
          ctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4)
        }
      }
      // Ghost of where the dragged piece would land.
      const d = st.drag
      if (d) {
        const shape = st.tray[d.idx]?.shape
        if (shape) {
          const gx = Math.round((d.x - (shape[0].length * CELL) / 2) / CELL)
          const gy = Math.round((d.y - (shape.length * CELL) / 2 - CELL) / CELL)
          const ok = fits(shape, gx, gy, st.cells)
          for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
              if (!shape[r][c]) continue
              ctx.fillStyle = ok ? "rgba(240,198,116,.45)" : "rgba(239,68,68,.35)"
              ctx.fillRect((gx + c) * CELL + 2, (gy + r) * CELL + 2, CELL - 4, CELL - 4)
            }
          }
        }
      }
      // The tray.
      st.tray.forEach((t, i) => {
        if (t.used) return
        const bw = W / 3
        const cell = 14
        const ox = i * bw + bw / 2 - (t.shape[0].length * cell) / 2
        const oy = TRAY_Y + 24 - (t.shape.length * cell) / 2
        for (let r = 0; r < t.shape.length; r++) {
          for (let c = 0; c < t.shape[r].length; c++) {
            if (!t.shape[r][c]) continue
            ctx.fillStyle = t.colour
            ctx.fillRect(ox + c * cell, oy + r * cell, cell - 2, cell - 2)
          }
        }
      })
      if (st.over) {
        ctx.fillStyle = "rgba(17,17,16,.8)"; ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = "#f0efe9"; ctx.textAlign = "center"
        ctx.font = "500 15px ui-monospace,Menlo,monospace"
        ctx.fillText(`NOTHING FITS — ${st.score} — TAP TO RETRY`, W / 2, H / 2)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [H, W, fits])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <canvas
        ref={cv}
        width={W}
        height={H}
        aria-label="Block Blast"
        className="block w-full max-w-[min(90vw,min(420px,72vh))] rounded-xl [image-rendering:pixelated] [touch-action:none]"
      />
      <p className="text-center text-[11px] text-text-muted">
        Score <b className="text-foreground">{score}</b> · drag a shape onto the grid ·{" "}
        {over ? "tap to retry" : "clear rows and columns"}
      </p>
    </div>
  )
}

/* ══════════════════════════ CONNECT FOUR ════════════════════════════════ */
/**
 * Amber discs against Will's grey pills.
 *
 * The AI is a 4-ply minimax over a window-scoring evaluation — it will take a
 * win, block yours, and set up a double threat. Deliberately not perfect: a
 * solved-game player would be unbeatable and no fun.
 */
const C4W = 7, C4H = 6

/** Pure Connect Four engine, at module scope so the component's callbacks
 *  have no unstable dependencies and the search can be reasoned about alone. */
const drop = (cells: number[], col: number, player: number): number => {
  for (let r = C4H - 1; r >= 0; r--) {
    if (!cells[r * C4W + col]) { cells[r * C4W + col] = player; return r }
  }
  return -1
}
const winner = (cells: number[]): number => {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]]
  for (let r = 0; r < C4H; r++) {
    for (let c = 0; c < C4W; c++) {
      const p = cells[r * C4W + c]
      if (!p) continue
      for (const [dc, dr] of dirs) {
        let n = 1
        while (n < 4) {
          const nr = r + dr * n, nc = c + dc * n
          if (nr < 0 || nr >= C4H || nc < 0 || nc >= C4W || cells[nr * C4W + nc] !== p) break
          n++
        }
        if (n === 4) return p
      }
    }
  }
  return 0
}
const scoreWindow = (w: number[], me: number) => {
  const foe = me === 1 ? 2 : 1
  const mine = w.filter((x) => x === me).length
  const theirs = w.filter((x) => x === foe).length
  if (mine && theirs) return 0
  if (mine === 4) return 10000
  if (theirs === 4) return -10000
  if (mine === 3) return 50
  if (theirs === 3) return -60 // block slightly harder than you build
  if (mine === 2) return 6
  if (theirs === 2) return -6
  return 0
}
const evaluate = (cells: number[], me: number) => {
  let s = 0
  for (let r = 0; r < C4H; r++) {
    for (let c = 0; c < C4W; c++) {
      for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const w: number[] = []
        for (let n = 0; n < 4; n++) {
          const nr = r + dr * n, nc = c + dc * n
          if (nr < 0 || nr >= C4H || nc < 0 || nc >= C4W) { w.length = 0; break }
          w.push(cells[nr * C4W + nc])
        }
        if (w.length === 4) s += scoreWindow(w, me)
      }
    }
  }
  // Centre control is worth real points in connect four.
  for (let r = 0; r < C4H; r++) if (cells[r * C4W + 3] === me) s += 4
  return s
}
const legal = (cells: number[]) => [3, 2, 4, 1, 5, 0, 6].filter((c) => !cells[c])
const search = (cells: number[], depth: number, a: number, b: number, maxing: boolean): number => {
  const w = winner(cells)
  if (w === 2) return 100000 - (4 - depth)
  if (w === 1) return -100000 + (4 - depth)
  const moves = legal(cells)
  if (depth === 0 || moves.length === 0) return evaluate(cells, 2)
  if (maxing) {
    let best = -Infinity
    for (const c of moves) {
      const next = cells.slice(); drop(next, c, 2)
      best = Math.max(best, search(next, depth - 1, a, b, false))
      a = Math.max(a, best); if (b <= a) break
    }
    return best
  }
  let best = Infinity
  for (const c of moves) {
    const next = cells.slice(); drop(next, c, 1)
    best = Math.min(best, search(next, depth - 1, a, b, true))
    b = Math.min(b, best); if (b <= a) break
  }
  return best
}


export function ConnectFour() {
  const W = 420, H = 380
  const [status, setStatus] = useState("Your move")
  const g = useRef({ cells: new Array(C4W * C4H).fill(0) as number[], over: false, busy: false, hover: -1, last: -1 })
  const cv = useRef<HTMLCanvasElement | null>(null)

  const reset = useCallback(() => {
    g.current = { cells: new Array(C4W * C4H).fill(0), over: false, busy: false, hover: -1, last: -1 }
    setStatus("Your move"); sfx.start()
  }, [])

  const play = useCallback((col: number) => {
    const st = g.current
    if (st.over || st.busy || st.cells[col]) return
    const cells = st.cells.slice()
    drop(cells, col, 1)
    st.cells = cells; st.last = col
    sfx.drop()
    if (winner(cells) === 1) { st.over = true; setStatus("You win"); sfx.win(); return }
    if (legal(cells).length === 0) { st.over = true; setStatus("Full board — draw"); return }
    st.busy = true
    setStatus("Will is thinking")
    setTimeout(() => {
      let best = legal(st.cells)[0], bestScore = -Infinity
      for (const c of legal(st.cells)) {
        const next = st.cells.slice(); drop(next, c, 2)
        const sc = search(next, 3, -Infinity, Infinity, false)
        if (sc > bestScore) { bestScore = sc; best = c }
      }
      const cells2 = st.cells.slice()
      drop(cells2, best, 2)
      st.cells = cells2; st.last = best; st.busy = false
      sfx.drop()
      if (winner(cells2) === 2) { st.over = true; setStatus("Will wins — “Milligram does this better too.”"); sfx.lose() }
      else if (legal(cells2).length === 0) { st.over = true; setStatus("Full board — draw") }
      else setStatus("Your move")
    }, 420)
    // `search`, `drop`, `winner` and `legal` are module-level pure functions —
    // nothing here closes over changing state, so the empty deps are correct.
  }, [])

  useEffect(() => {
    const el = cv.current
    if (!el) return
    const ctx = el.getContext("2d")
    if (!ctx) return
    let raf = 0
    const frame = () => {
      const st = g.current
      ctx.fillStyle = "#111110"; ctx.fillRect(0, 0, W, H)
      drawGrid(ctx, W, H)
      const pad = 14, cw = (W - pad * 2) / C4W, r = Math.min(cw, (H - pad * 2 - 30) / C4H) / 2 - 3
      ctx.fillStyle = "#26261f"
      ctx.fillRect(pad - 6, 30, W - pad * 2 + 12, H - 40)
      for (let row = 0; row < C4H; row++) {
        for (let c = 0; c < C4W; c++) {
          const v = st.cells[row * C4W + c]
          ctx.beginPath()
          ctx.arc(pad + cw * c + cw / 2, 46 + row * (r * 2 + 6) + r, r, 0, Math.PI * 2)
          ctx.fillStyle = v === 1 ? "#c8861a" : v === 2 ? "#9a9a90" : "#111110"
          ctx.fill()
          if (v === 2) { ctx.fillStyle = "#6e6e66"; ctx.fillRect(pad + cw * c + cw / 2 - r, 46 + row * (r * 2 + 6) + r - 1, r * 2, 2) }
        }
      }
      if (st.over) {
        ctx.fillStyle = "rgba(17,17,16,.78)"; ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = "#f0efe9"; ctx.textAlign = "center"
        ctx.font = "500 14px ui-monospace,Menlo,monospace"
        ctx.fillText("TAP TO PLAY AGAIN", W / 2, H / 2)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [H, W])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <canvas
        ref={cv}
        width={W}
        height={H}
        aria-label="Connect Four"
        onPointerDown={(e) => {
          e.preventDefault(); wakeAudio()
          if (g.current.over) { reset(); return }
          const r = e.currentTarget.getBoundingClientRect()
          const col = Math.floor((((e.clientX - r.left) / r.width) * W - 14) / ((W - 28) / C4W))
          if (col >= 0 && col < C4W) play(col)
        }}
        className="block w-full max-w-[min(90vw,min(460px,66vh))] rounded-xl [touch-action:none]"
      />
      <p className="text-center text-[11px] text-text-muted">{status} · tap a column</p>
    </div>
  )
}

/* ══════════════════════════ SOLITAIRE ═══════════════════════════════════ */
/**
 * Klondike, draw one, with amber suits.
 *
 * Suits are SHAPES, not compounds — Adrian changed his mind on that and was
 * right: a card game needs suits you can tell apart at a glance, and four
 * compound names in a corner is not that.
 *
 * State lives in `useState`, not a ref, unlike every other game here. Solitaire
 * is turn-based — it redraws when you move a card, not sixty times a second —
 * so a ref would buy nothing and reading one during render is exactly what the
 * React Compiler rejects.
 */
const SUITS = ["●", "◆", "▲", "■"] as const
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
interface PlayCard { rank: number; suit: number; up: boolean }
const isRed = (s: number) => s === 1 || s === 3

interface SolState {
  stock: PlayCard[]
  waste: PlayCard[]
  found: PlayCard[][]
  tab: PlayCard[][]
  sel: { from: "waste" | "tab"; pile: number; idx: number } | null
  moves: number
  won: boolean
}

function freshDeal(): SolState {
  const deck: PlayCard[] = []
  for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) deck.push({ rank: r, suit: s, up: false })
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const tab: PlayCard[][] = []
  for (let i = 0; i < 7; i++) {
    const pile = deck.splice(0, i + 1)
    pile[pile.length - 1] = { ...pile[pile.length - 1], up: true }
    tab.push(pile)
  }
  return { stock: deck, waste: [], found: [[], [], [], []], tab, sel: null, moves: 0, won: false }
}

const canStack = (card: PlayCard, onto: PlayCard | undefined) =>
  onto ? isRed(card.suit) !== isRed(onto.suit) && card.rank === onto.rank - 1 : card.rank === 12
const canFound = (card: PlayCard, pile: PlayCard[]) =>
  pile.length === 0
    ? card.rank === 0
    : pile[pile.length - 1].suit === card.suit && card.rank === pile[pile.length - 1].rank + 1

function CardFace({ c }: { c: PlayCard }) {
  return (
    <span
      className={`inline-flex h-11 w-8 flex-col items-center justify-center rounded-[5px] border font-mono text-[11px] leading-none ${
        c.up
          ? `border-[#3b3b36] bg-[#f0efe9] ${isRed(c.suit) ? "text-[#b5391f]" : "text-[#1b1a17]"}`
          : "border-[#4a4a45] bg-[#2b2a24] text-[#4a4a45]"
      }`}
    >
      {c.up ? (
        <>
          <span>{RANKS[c.rank]}</span>
          <span>{SUITS[c.suit]}</span>
        </>
      ) : (
        "·"
      )}
    </span>
  )
}

export function Solitaire() {
  const [st, setSt] = useState<SolState>(freshDeal)

  const deal = useCallback(() => { setSt(freshDeal()); sfx.start() }, [])

  const draw = useCallback(() => {
    wakeAudio()
    setSt((s) => {
      if (s.stock.length === 0) {
        // Recycling the waste is a legal Klondike move, not a reset.
        return { ...s, stock: [...s.waste].reverse().map((c) => ({ ...c, up: false })), waste: [], sel: null }
      }
      const stock = s.stock.slice()
      const c = stock.pop()!
      return { ...s, stock, waste: [...s.waste, { ...c, up: true }], sel: null }
    })
    sfx.place()
  }, [])

  const moveTo = useCallback((to: { kind: "tab" | "found"; pile: number }) => {
    wakeAudio()
    setSt((s) => {
      if (!s.sel) return s
      const src = s.sel.from === "waste" ? s.waste : s.tab[s.sel.pile]
      const moving = src.slice(s.sel.idx)
      if (moving.length === 0) return { ...s, sel: null }
      const card = moving[0]

      const found = s.found.map((f) => f.slice())
      const tab = s.tab.map((t) => t.slice())
      let ok = false
      if (to.kind === "found") {
        ok = moving.length === 1 && canFound(card, found[to.pile])
        if (ok) found[to.pile].push(card)
      } else {
        ok = canStack(card, tab[to.pile][tab[to.pile].length - 1])
        if (ok) tab[to.pile] = [...tab[to.pile], ...moving]
      }
      if (!ok) { sfx.bad(); return { ...s, sel: null } }

      let waste = s.waste
      if (s.sel.from === "waste") waste = s.waste.slice(0, s.sel.idx)
      else {
        tab[s.sel.pile] = src.slice(0, s.sel.idx)
        const rest = tab[s.sel.pile]
        // Turning the newly exposed card face up is the point of the game.
        if (rest.length && !rest[rest.length - 1].up) {
          rest[rest.length - 1] = { ...rest[rest.length - 1], up: true }
        }
      }
      const won = found.every((f) => f.length === 13)
      sfx.place()
      if (won) sfx.win()
      return { ...s, waste, tab, found, sel: null, moves: s.moves + 1, won }
    })
  }, [])

  return (
    <div className="flex h-full flex-col items-center gap-3 overflow-x-auto">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={draw}
          title={st.stock.length ? `${st.stock.length} left` : "Recycle the waste"}
          className="glass-pill h-11 w-8 text-[10px] text-text-muted"
        >
          {st.stock.length || "↺"}
        </button>
        <button
          type="button"
          onClick={() => st.waste.length && setSt((s) => ({ ...s, sel: { from: "waste", pile: 0, idx: s.waste.length - 1 } }))}
          className={`rounded-[5px] ${st.sel?.from === "waste" ? "ring-2 ring-accent-amber" : ""}`}
        >
          {st.waste.length ? (
            <CardFace c={st.waste[st.waste.length - 1]} />
          ) : (
            <span className="inline-block h-11 w-8 rounded-[5px] border border-dashed border-[#3b3b36]" />
          )}
        </button>
        <span className="w-4" />
        {st.found.map((f, i) => (
          <button key={i} type="button" onClick={() => moveTo({ kind: "found", pile: i })} className="rounded-[5px]">
            {f.length ? (
              <CardFace c={f[f.length - 1]} />
            ) : (
              <span className="inline-flex h-11 w-8 items-center justify-center rounded-[5px] border border-dashed border-[#3b3b36] text-[13px] text-text-subtle">
                {SUITS[i]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex items-start gap-2">
        {st.tab.map((pile, p) => (
          <div key={p} className="flex flex-col">
            {pile.length === 0 ? (
              <button type="button" onClick={() => moveTo({ kind: "tab", pile: p })}>
                <span className="inline-block h-11 w-8 rounded-[5px] border border-dashed border-[#3b3b36]" />
              </button>
            ) : (
              pile.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  style={{ marginTop: i === 0 ? 0 : -26 }}
                  onClick={() => {
                    if (!c.up) return
                    if (st.sel) moveTo({ kind: "tab", pile: p })
                    else setSt((s) => ({ ...s, sel: { from: "tab", pile: p, idx: i } }))
                  }}
                  className={`rounded-[5px] ${
                    st.sel?.from === "tab" && st.sel.pile === p && st.sel.idx === i
                      ? "ring-2 ring-accent-amber"
                      : ""
                  }`}
                >
                  <CardFace c={c} />
                </button>
              ))
            )}
          </div>
        ))}
      </div>

      <p className="text-center text-[11px] text-text-muted">
        {st.won ? "Solved." : `${st.moves} moves · tap a card, then tap where it goes`} ·{" "}
        <button type="button" onClick={deal} className="underline underline-offset-2 hover:text-foreground">
          new deal
        </button>
      </p>
    </div>
  )
}
