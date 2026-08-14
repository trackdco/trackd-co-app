"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { LADDER, pickTaunt } from "@/components/admin/arcade/pieces"
import { Portrait } from "@/components/admin/arcade/Portrait"
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
  const [combo, setCombo] = useState(0)
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
    drag: null as { idx: number; x: number; y: number; held: number } | null,
    score: 0,
    /** Consecutive drops that cleared something. Drives the rising pitch AND the score. */
    combo: 0,
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
    g.current = { cells: new Array(N * N).fill(""), tray: deal(), drag: null, score: 0, combo: 0, over: false }
    setScore(0); setCombo(0); setOver(false); sfx.start()
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
    if (lines > 0) {
      sfx.clear(lines, st.combo)
      st.combo += 1
    } else if (st.combo > 0) {
      sfx.comboBreak()
      st.combo = 0
    }
    setCombo(st.combo)

    st.cells = cells
    // The chain multiplies, so a run of small clears beats one big lucky drop.
    st.score += placed + lines * lines * 20 * Math.max(1, st.combo)
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
      g.current.drag = { idx, x, y, held: 0 }
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!g.current.drag) return
      const { x, y } = local(e)
      g.current.drag = { ...g.current.drag, x, y, held: g.current.drag.held + 1 }
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
      const gy = Math.round((d.y - (shape.length * CELL) / 2 - CELL * 0.6) / CELL)
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
      // Ghost of where the lifted piece would land.
      const d = st.drag
      if (d) {
        const shape = st.tray[d.idx]?.shape
        if (shape) {
          const gx = Math.round((d.x - (shape[0].length * CELL) / 2) / CELL)
          const gy = Math.round((d.y - (shape.length * CELL) / 2 - CELL * 0.6) / CELL)
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
      /**
       * The tray. A piece being dragged is NOT drawn here — it is lifted out and
       * follows the pointer at full board size below.
       *
       * Adrian's note: dragging showed a small tray shape staying put while a
       * ghost appeared on the grid, so you were reading two things at once and
       * guessing which stock you had picked up. Lifting the actual piece and
       * growing it to the size it will BE removes the guess.
       */
      st.tray.forEach((t, i) => {
        if (t.used) return
        if (d && d.idx === i) return
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

      // The lifted piece, under the pointer, at the size it will occupy. It
      // grows from tray size to full size over the first few frames so the
      // pick-up reads as a lift rather than a teleport.
      if (d) {
        const piece = st.tray[d.idx]
        if (piece) {
          const grow = Math.min(1, d.held / 6)
          const cell = 14 + (CELL - 14) * grow
          const ox = d.x - (piece.shape[0].length * cell) / 2
          const oy = d.y - (piece.shape.length * cell) / 2 - CELL * 0.6 * grow
          for (let r = 0; r < piece.shape.length; r++) {
            for (let c = 0; c < piece.shape[r].length; c++) {
              if (!piece.shape[r][c]) continue
              ctx.fillStyle = piece.colour
              ctx.fillRect(ox + c * cell + 2, oy + r * cell + 2, cell - 4, cell - 4)
            }
          }
        }
      }
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
        Score <b className="text-foreground">{score}</b>
        {combo > 1 ? <b className="text-accent-amber"> · ×{combo} chain</b> : null} · drag a shape onto the grid ·{" "}
        {over ? "tap to retry" : "clear rows and columns"}
      </p>
    </div>
  )
}

/* ══════════════════════════ CONNECT FOUR ════════════════════════════════ */
/**
 * Amber discs against a character from the chess ladder, at four difficulties.
 *
 * The discs FALL — the board is not updated until one lands, so the animation
 * is the real state rather than a flourish over an already-decided move.
 *
 * Pure Connect Four engine, at module scope so the component's callbacks
 *  have no unstable dependencies and the search can be reasoned about alone. */
const C4W = 7, C4H = 6

function drop(cells: number[], col: number, player: number): number {
  for (let r = C4H - 1; r >= 0; r--) {
    if (!cells[r * C4W + col]) { cells[r * C4W + col] = player; return r }
  }
  return -1
}
function winner(cells: number[]): number {
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
function scoreWindow(w: number[], me: number) {
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
function evaluate(cells: number[], me: number) {
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
  for (let r = 0; r < C4H; r++) if (cells[r * C4W + 3] === me) s += 4
  return s
}
const legal = (cells: number[]) => [3, 2, 4, 1, 5, 0, 6].filter((c) => !cells[c])

function search(cells: number[], depth: number, a: number, b: number, maxing: boolean): number {
  const w = winner(cells)
  if (w === 2) return 100000 - (8 - depth)
  if (w === 1) return -100000 + (8 - depth)
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

/**
 * The four difficulties.
 *
 * `blunder` is the same lever as chess: how often it throws away the move it
 * found. EXTREME IS DELIBERATELY NOT PERFECT — connect four is a solved game
 * and a true solver playing first wins every single time, which is not a game,
 * it is a wall. Depth 6 with a real evaluation will punish anything careless
 * and can still be beaten by someone paying attention, which is what "hard but
 * beatable" actually means.
 */
export interface C4Level { id: string; name: string; depth: number; blunder: number; botIdx: number }
export const C4_LEVELS: C4Level[] = [
  { id: "easy",    name: "Easy",    depth: 1, blunder: 0.55, botIdx: 0 },
  { id: "medium",  name: "Medium",  depth: 3, blunder: 0.20, botIdx: 2 },
  { id: "hard",    name: "Hard",    depth: 5, blunder: 0.05, botIdx: 6 },
  { id: "extreme", name: "Extreme", depth: 6, blunder: 0.00, botIdx: 10 },
]

function chooseColumn(cells: number[], level: C4Level): number {
  const moves = legal(cells)
  if (moves.length === 0) return -1
  if (Math.random() < level.blunder) return moves[Math.floor(Math.random() * moves.length)]
  let best = moves[0], bestScore = -Infinity
  for (const c of moves) {
    const next = cells.slice(); drop(next, c, 2)
    const sc = search(next, level.depth - 1, -Infinity, Infinity, false)
    if (sc > bestScore) { bestScore = sc; best = c }
  }
  return best
}

export function ConnectFour() {
  const W = 460, H = 420
  const [level, setLevel] = useState<C4Level>(C4_LEVELS[1])
  const [status, setStatus] = useState("Your move")
  const [over, setOver] = useState<null | "win" | "lose" | "draw">(null)
  const cv = useRef<HTMLCanvasElement | null>(null)
  const bot = LADDER[level.botIdx] ?? LADDER[0]

  const g = useRef({
    cells: new Array(C4W * C4H).fill(0) as number[],
    over: false,
    busy: false,
    /** The disc currently falling — the board is not updated until it lands. */
    falling: null as { col: number; row: number; y: number; vy: number; player: number } | null,
    last: -1,
  })

  const reset = useCallback(() => {
    g.current = { cells: new Array(C4W * C4H).fill(0), over: false, busy: false, falling: null, last: -1 }
    setStatus("Your move"); setOver(null); sfx.start()
  }, [])

  /** Land the falling disc, then decide what happens next. */
  const land = useCallback(() => {
    const st = g.current
    const f = st.falling
    if (!f) return
    st.falling = null
    const cells = st.cells.slice()
    cells[f.row * C4W + f.col] = f.player
    st.cells = cells
    st.last = f.col
    sfx.drop()

    const w = winner(cells)
    if (w) {
      st.over = true
      setOver(w === 1 ? "win" : "lose")
      setStatus(w === 1 ? "You win" : `${bot.name} wins`)
      if (w === 1) sfx.win()
      else sfx.lose()
      return
    }
    if (legal(cells).length === 0) {
      st.over = true; setOver("draw"); setStatus("Full board — draw"); return
    }
    if (f.player === 1) {
      st.busy = true
      setStatus(`${bot.name} is thinking`)
      setTimeout(() => {
        const col = chooseColumn(st.cells, level)
        if (col < 0) { st.busy = false; return }
        const row = drop(st.cells.slice(), col, 2)
        st.falling = { col, row, y: -40, vy: 0, player: 2 }
        st.busy = false
      }, 320)
    } else setStatus("Your move")
  }, [bot.name, level])

  const play = useCallback((col: number) => {
    const st = g.current
    if (st.over || st.busy || st.falling || st.cells[col]) return
    const row = drop(st.cells.slice(), col, 1)
    if (row < 0) return
    st.falling = { col, row, y: -40, vy: 0, player: 1 }
  }, [])

  useEffect(() => {
    const el = cv.current
    if (!el) return
    const ctx = el.getContext("2d")
    if (!ctx) return
    let raf = 0
    const pad = 16
    const cw = (W - pad * 2) / C4W
    const r = Math.min(cw, (H - pad * 2 - 34) / C4H) / 2 - 3
    const cx = (c: number) => pad + cw * c + cw / 2
    const cy = (row: number) => 44 + row * (r * 2 + 6) + r

    const frame = () => {
      const st = g.current
      // Gravity on the falling disc. It lands when it reaches its slot.
      const f = st.falling
      if (f) {
        f.vy += 1.6
        f.y += f.vy
        if (f.y >= cy(f.row)) { f.y = cy(f.row); land() }
      }
      ctx.fillStyle = "#111110"; ctx.fillRect(0, 0, W, H)
      drawGrid(ctx, W, H)
      // The falling disc is drawn BEHIND the board face, so it reads as sliding
      // down inside the slot rather than floating over the front of it.
      if (f) {
        ctx.beginPath(); ctx.arc(cx(f.col), f.y, r, 0, Math.PI * 2)
        ctx.fillStyle = f.player === 1 ? "#c8861a" : "#9a9a90"; ctx.fill()
      }
      ctx.fillStyle = "#26261f"
      ctx.fillRect(pad - 8, 34, W - pad * 2 + 16, H - 46)
      for (let row = 0; row < C4H; row++) {
        for (let c = 0; c < C4W; c++) {
          const v = st.cells[row * C4W + c]
          ctx.beginPath(); ctx.arc(cx(c), cy(row), r, 0, Math.PI * 2)
          ctx.fillStyle = v === 1 ? "#c8861a" : v === 2 ? "#9a9a90" : "#111110"
          ctx.fill()
          if (v === 2) {
            ctx.fillStyle = "#6e6e66"
            ctx.fillRect(cx(c) - r, cy(row) - 1, r * 2, 2)
          }
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [H, W, land])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div className="glass-pill grid size-16 place-items-center overflow-hidden p-1">
          <Portrait bot={bot} size={72} mood={over === "lose" ? "gloat" : over === "win" ? "beaten" : "idle"} />
        </div>
        <div className="flex gap-1">
          {C4_LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => { wakeAudio(); setLevel(l); reset() }}
              aria-pressed={l.id === level.id}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                l.id === level.id ? "bg-accent-amber text-bg-base" : "glass-pill text-text-muted hover:text-foreground"
              }`}
            >
              {l.name}
            </button>
          ))}
        </div>
      </div>

      <div className="relative w-full max-w-[min(90vw,min(460px,60vh))]">
        <canvas
          ref={cv}
          width={W}
          height={H}
          aria-label="Connect Four"
          onPointerDown={(e) => {
            e.preventDefault(); wakeAudio()
            if (g.current.over) { reset(); return }
            const rect = e.currentTarget.getBoundingClientRect()
            const col = Math.floor((((e.clientX - rect.left) / rect.width) * W - 16) / ((W - 32) / C4W))
            if (col >= 0 && col < C4W) play(col)
          }}
          className="block w-full rounded-xl [touch-action:none]"
        />
        {over && (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-bg-base/85 px-4 text-center">
            <div>
              <div className="flex items-end justify-center gap-3">
                <Portrait bot={bot} size={112} mood={over === "lose" ? "gloat" : "beaten"} />
                {over === "lose" && (
                  <div className="relative mb-3 max-w-[14rem] rounded-2xl rounded-bl-sm bg-[#f0efe9] px-3 py-2 text-left">
                    <p className="text-sm leading-snug text-[#1b1a17]">“{pickTaunt(bot) ?? "…"}”</p>
                    <span className="absolute -bottom-1.5 left-2 size-3 rotate-45 bg-[#f0efe9]" />
                  </div>
                )}
              </div>
              <p className="mt-3 font-mono text-base text-foreground">{status}</p>
              <button type="button" onClick={reset} className="glass-pill mt-3 px-4 py-1.5 text-xs text-foreground">
                Play again
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="text-center text-[11px] text-text-muted">
        {status} · tap a column · {level.name} is {bot.name}
      </p>
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
      className={`inline-flex h-[68px] w-[48px] flex-col items-center justify-center gap-0.5 rounded-md border font-mono text-[15px] leading-none ${
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
  /**
   * Every state before the current one, newest last.
   *
   * Klondike is unwinnable often enough that a wrong move can end the deal, and
   * without an undo the only recovery is a new game — which throws away the
   * whole board for one mistake. Capped so a very long session cannot grow the
   * array without bound.
   */
  const [history, setHistory] = useState<SolState[]>([])
  const remember = useCallback(
    (prev: SolState) => setHistory((h) => [...h, prev].slice(-60)),
    []
  )

  const undo = useCallback(() => {
    wakeAudio()
    setHistory((h) => {
      if (h.length === 0) { sfx.bad(); return h }
      setSt(h[h.length - 1])
      sfx.place()
      return h.slice(0, -1)
    })
  }, [])

  const deal = useCallback(() => { setSt(freshDeal()); setHistory([]); sfx.start() }, [])

  const draw = useCallback(() => {
    wakeAudio()
    setSt((s) => {
      remember(s)
      if (s.stock.length === 0) {
        // Recycling the waste is a legal Klondike move, not a reset.
        return { ...s, stock: [...s.waste].reverse().map((c) => ({ ...c, up: false })), waste: [], sel: null }
      }
      const stock = s.stock.slice()
      const c = stock.pop()!
      return { ...s, stock, waste: [...s.waste, { ...c, up: true }], sel: null }
    })
    sfx.place()
  }, [remember])

  const moveTo = useCallback((to: { kind: "tab" | "found"; pile: number }) => {
    wakeAudio()
    setSt((s) => {
      if (!s.sel) return s
      const before = s
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
      remember(before)
      sfx.place()
      if (won) sfx.win()
      return { ...s, waste, tab, found, sel: null, moves: s.moves + 1, won }
    })
  }, [remember])

  return (
    <div className="flex h-full flex-col items-center gap-3 overflow-x-auto">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={draw}
          title={st.stock.length ? `${st.stock.length} left` : "Recycle the waste"}
          className="glass-pill h-[68px] w-[48px] text-xs text-text-muted"
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
            <span className="inline-block h-[68px] w-[48px] rounded-md border border-dashed border-[#3b3b36]" />
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
                <span className="inline-block h-[68px] w-[48px] rounded-md border border-dashed border-[#3b3b36]" />
              </button>
            ) : (
              pile.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  style={{ marginTop: i === 0 ? 0 : c.up ? -42 : -54 }}
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

      <div className="flex items-center gap-2 text-[11px] text-text-muted">
        <span>{st.won ? "Solved." : `${st.moves} moves · tap a card, then tap where it goes`}</span>
        <button
          type="button"
          onClick={undo}
          disabled={history.length === 0}
          className="glass-pill px-3 py-1 text-[11px] text-text-muted enabled:hover:text-foreground disabled:opacity-40"
        >
          Undo
        </button>
        <button type="button" onClick={deal} className="glass-pill px-3 py-1 text-[11px] text-text-muted hover:text-foreground">
          New deal
        </button>
      </div>
    </div>
  )
}
