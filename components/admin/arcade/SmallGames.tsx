"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { sfx, wakeAudio } from "@/lib/admin/arcade/audio"
import { drawGrid, drawKyle } from "@/lib/admin/arcade/kyle"

/**
 * The small games. One shared canvas hook, one loop each.
 *
 * Every one of these is a `useRef` world plus a `requestAnimationFrame` loop:
 * game state must not live in React state, because a 60fps re-render is both
 * pointless and slower than the game.
 */

function useCanvas(
  draw: (ctx: CanvasRenderingContext2D, t: number, dt: number) => void,
  w: number,
  h: number
) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  // The loop reads the LATEST draw function without re-subscribing. Written in
  // an effect, never during render: a ref write during render is a side effect
  // in a function React requires to be pure.
  const drawRef = useRef(draw)
  useEffect(() => { drawRef.current = draw })
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext("2d")
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 16.667, 3)
      last = now
      ctx.fillStyle = "#111110"
      ctx.fillRect(0, 0, w, h)
      drawGrid(ctx, w, h)
      drawRef.current(ctx, now, dt)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [w, h])
  return ref
}

function Screen({
  canvasRef,
  w,
  h,
  label,
  onPress,
  footer,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  w: number
  h: number
  label: string
  onPress?: () => void
  footer?: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <canvas
        ref={canvasRef}
        width={w}
        height={h}
        aria-label={label}
        onPointerDown={(e) => { e.preventDefault(); wakeAudio(); onPress?.() }}
        className="block w-full max-w-[min(90vw,min(560px,62vh))] rounded-xl [image-rendering:pixelated] [touch-action:none]"
      />
      {footer && <div className="text-center text-[11px] text-text-muted">{footer}</div>}
    </div>
  )
}

/* ══════════════════════════ VIAL STACK ══════════════════════════════════ */
/**
 * Perfect placement is the whole game.
 *
 * Land within `PERFECT_TOL` and nothing is sliced, the vial GROWS BACK, and the
 * pitch climbs with the chain. Without that, a stacker only ever shrinks and
 * every run is a slow death; with it a good run can recover, which is the
 * difference between one go and ten.
 */
const PERFECT_TOL = 5
const GROW = 10
const START_W = 130

export function VialStack() {
  const W = 420, H = 320
  const [score, setScore] = useState(0)
  const [chain, setChain] = useState(0)
  const s = useRef({
    stack: [{ x: (W - START_W) / 2, w: START_W, perfect: false }],
    cur: { x: 0, w: START_W, dir: 1 },
    speed: 2.2, over: false, flash: 0, n: 0, chain: 0,
  })

  const reset = useCallback(() => {
    s.current = {
      stack: [{ x: (W - START_W) / 2, w: START_W, perfect: false }],
      cur: { x: 0, w: START_W, dir: 1 }, speed: 2.2, over: false, flash: 0, n: 0, chain: 0,
    }
    setScore(0); setChain(0); sfx.start()
  }, [])

  const press = useCallback(() => {
    const st = s.current
    if (st.over) { reset(); return }
    const top = st.stack[st.stack.length - 1]
    const off = st.cur.x - top.x
    if (Math.abs(off) <= PERFECT_TOL) {
      const w = Math.min(START_W, top.w + GROW)
      st.stack.push({ x: top.x - (w - top.w) / 2, w, perfect: true })
      st.chain += 1; st.flash = 12
      sfx.perfect(st.chain)
    } else {
      const left = Math.max(st.cur.x, top.x)
      const right = Math.min(st.cur.x + st.cur.w, top.x + top.w)
      const w = right - left
      if (w <= 0) { st.over = true; st.chain = 0; sfx.lose(); setChain(0); return }
      st.stack.push({ x: left, w, perfect: false })
      st.chain = 0
      sfx.slice()
    }
    st.n += 1
    st.speed = Math.min(7, st.speed + 0.15)
    const nw = st.stack[st.stack.length - 1].w
    st.cur = { x: 0, w: nw, dir: 1 }
    if (st.stack.length > 13) st.stack.shift()
    setScore(st.n); setChain(st.chain)
  }, [reset])

  const ref = useCanvas((ctx, _t, dt) => {
    const st = s.current
    if (!st.over) {
      st.cur.x += st.cur.dir * st.speed * dt
      if (st.cur.x + st.cur.w > W) { st.cur.x = W - st.cur.w; st.cur.dir = -1 }
      if (st.cur.x < 0) { st.cur.x = 0; st.cur.dir = 1 }
    }
    if (st.flash > 0) st.flash -= dt
    const bh = 21, baseY = H - 26
    st.stack.forEach((b, i) => {
      const y = baseY - i * bh
      const glow = b.perfect && i === st.stack.length - 1 && st.flash > 0
      ctx.fillStyle = glow ? "#6a5a30" : i % 2 ? "#3e3e3a" : "#4a4a45"
      ctx.fillRect(b.x, y, b.w, bh - 2)
      ctx.fillStyle = b.perfect ? "#f0c674" : "#c8861a"
      ctx.fillRect(b.x + 2, y + bh - 10, b.w - 4, 6)
      ctx.fillStyle = "#9a9a90"
      ctx.fillRect(b.x + b.w / 2 - 9, y - 3, 18, 4)
    })
    if (!st.over) {
      const y = baseY - st.stack.length * bh
      ctx.fillStyle = "#5a5a54"; ctx.fillRect(st.cur.x, y, st.cur.w, bh - 2)
      ctx.fillStyle = "#d79422"; ctx.fillRect(st.cur.x + 2, y + bh - 10, st.cur.w - 4, 6)
      const top = st.stack[st.stack.length - 1]
      ctx.strokeStyle = "rgba(240,198,116,.22)"; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(top.x + 0.5, 0); ctx.lineTo(top.x + 0.5, H); ctx.stroke()
    } else {
      ctx.fillStyle = "rgba(17,17,16,.78)"; ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = "#f0efe9"; ctx.textAlign = "center"
      ctx.font = "500 14px ui-monospace,Menlo,monospace"
      ctx.fillText(`TOPPLED AT ${st.n} — TAP TO RETRY`, W / 2, H / 2)
    }
    if (st.chain > 1 && !st.over) {
      ctx.fillStyle = "#f0c674"; ctx.textAlign = "center"
      ctx.font = "500 15px ui-monospace,Menlo,monospace"
      ctx.fillText(`×${st.chain} PERFECT`, W / 2, 30)
    }
  }, W, H)

  return (
    <Screen
      canvasRef={ref} w={W} h={H} label="Vial Stack" onPress={press}
      footer={<>Height <b className="text-foreground">{score}</b> · chain <b className="text-foreground">{chain}</b> · tap to drop</>}
    />
  )
}

/* ══════════════════════════ DOSE 2048 ═══════════════════════════════════ */
/** 5mg + 5mg = 10mg. The doubling is the game and it is also the maths. */
const DOSES = ["5", "10", "25", "50", "100", "250", "500", "1g", "2g", "5g", "10g", "25g"]
const TILE_COL = ["#3e3e3a", "#4a4a45", "#5c5a4e", "#7a6440", "#96762f", "#b5895c", "#c8861a", "#d79422", "#e0a63f", "#f0c674", "#4fb3a6", "#6b7fd4"]

export function Dose2048() {
  const W = 420, H = 420
  const [score, setScore] = useState(0)
  const spawn = useCallback((cells: number[]) => {
    const free = cells.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0)
    if (free.length === 0) return
    cells[free[Math.floor(Math.random() * free.length)]] = Math.random() < 0.9 ? 1 : 2
  }, [])

  const g = useRef<{ cells: number[]; over: boolean; won: boolean }>({
    cells: new Array(16).fill(0), over: false, won: false,
  })

  /**
   * Seeded in an effect, and deliberately NOT in the ref initialiser.
   *
   * `Math.random()` in an initialiser runs during render, and React requires
   * render to be pure — the compiler rejects it outright. An effect is the right
   * home for it, and because this writes a REF rather than state it cannot
   * cascade a re-render either. The guard makes it idempotent under StrictMode's
   * double-invoke, which would otherwise deal four tiles instead of two.
   */
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    const cells = new Array(16).fill(0)
    spawn(cells); spawn(cells)
    g.current = { cells, over: false, won: false }
  }, [spawn])

  const reset = useCallback(() => {
    const cells = new Array(16).fill(0)
    spawn(cells); spawn(cells)
    g.current = { cells, over: false, won: false }
    setScore(0); sfx.start()
  }, [spawn])

  const slide = useCallback((dir: "l" | "r" | "u" | "d") => {
    const st = g.current
    if (st.over) { reset(); return }
    const cells = st.cells.slice()
    let gained = 0, moved = false
    const line = (idxs: number[]) => {
      const vals = idxs.map((i) => cells[i]).filter((v) => v > 0)
      const out: number[] = []
      for (let i = 0; i < vals.length; i++) {
        if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
          out.push(vals[i] + 1); gained += Math.pow(2, vals[i] + 1); sfx.merge(vals[i]); i++
        } else out.push(vals[i])
      }
      while (out.length < 4) out.push(0)
      idxs.forEach((cellIdx, k) => {
        if (cells[cellIdx] !== out[k]) moved = true
        cells[cellIdx] = out[k]
      })
    }
    // Rows for a horizontal swipe, columns for a vertical one — and NEVER both.
    // The first cut ran the row pass unconditionally and only then checked the
    // direction, so an up or down swipe also compacted and merged row 0
    // sideways: two separate tiles merged and scored on a vertical input.
    if (dir === "l" || dir === "r") {
      for (let r = 0; r < 4; r++) {
        const row = [0, 1, 2, 3].map((c) => r * 4 + c)
        line(dir === "l" ? row : row.slice().reverse())
      }
    } else {
      for (let c = 0; c < 4; c++) {
        const col = [0, 1, 2, 3].map((r) => r * 4 + c)
        line(dir === "u" ? col : col.slice().reverse())
      }
    }
    if (!moved) return
    spawn(cells)
    g.current.cells = cells
    setScore((s) => s + gained)
    // Dead when no move in any direction can change anything.
    const stuck = !cells.includes(0) && ![0, 1, 2, 3].some((r) =>
      [0, 1, 2].some((c) => cells[r * 4 + c] === cells[r * 4 + c + 1] || cells[c * 4 + r] === cells[(c + 1) * 4 + r])
    )
    if (stuck) { g.current.over = true; sfx.lose() }
  }, [reset, spawn])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const map: Record<string, "l" | "r" | "u" | "d"> = {
        ArrowLeft: "l", ArrowRight: "r", ArrowUp: "u", ArrowDown: "d",
        a: "l", d: "r", w: "u", s: "d",
      }
      const dir = map[e.key]
      if (!dir) return
      e.preventDefault(); wakeAudio(); slide(dir)
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [slide])

  const touch = useRef<{ x: number; y: number } | null>(null)
  const ref = useCanvas((ctx) => {
    const pad = 10, cell = (W - pad * 5) / 4
    for (let i = 0; i < 16; i++) {
      const r = Math.floor(i / 4), c = i % 4
      const x = pad + c * (cell + pad), y = pad + r * (cell + pad)
      const v = g.current.cells[i]
      ctx.fillStyle = v === 0 ? "#1c1c1a" : TILE_COL[Math.min(v - 1, TILE_COL.length - 1)]
      ctx.fillRect(x, y, cell, cell)
      if (v > 0) {
        ctx.fillStyle = v >= 7 ? "#111110" : "#f0efe9"
        ctx.font = `500 ${v >= 9 ? 20 : 24}px ui-monospace,Menlo,monospace`
        ctx.textAlign = "center"; ctx.textBaseline = "middle"
        ctx.fillText(DOSES[Math.min(v - 1, DOSES.length - 1)], x + cell / 2, y + cell / 2)
      }
    }
    ctx.textBaseline = "alphabetic"
    if (g.current.over) {
      ctx.fillStyle = "rgba(17,17,16,.8)"; ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = "#f0efe9"; ctx.textAlign = "center"
      ctx.font = "500 14px ui-monospace,Menlo,monospace"
      ctx.fillText("NO MOVES LEFT — TAP TO RETRY", W / 2, H / 2)
    }
  }, W, H)

  return (
    <div
      onPointerDown={(e) => { touch.current = { x: e.clientX, y: e.clientY }; wakeAudio() }}
      onPointerUp={(e) => {
        const t = touch.current; touch.current = null
        if (!t) return
        const dx = e.clientX - t.x, dy = e.clientY - t.y
        if (Math.abs(dx) < 24 && Math.abs(dy) < 24) { if (g.current.over) reset(); return }
        slide(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "r" : "l") : dy > 0 ? "d" : "u")
      }}
      className="h-full"
    >
      <Screen
        canvasRef={ref} w={W} h={H} label="Dose 2048"
        footer={<>Score <b className="text-foreground">{score}</b> · swipe or arrow keys · merge equal doses</>}
      />
    </div>
  )
}

/* ══════════════════════════ VIAL SNAKE ══════════════════════════════════ */
export function VialSnake() {
  const W = 420, H = 420, N = 20, S = W / N
  const [score, setScore] = useState(0)
  const g = useRef({
    body: [{ x: 10, y: 10 }], dir: { x: 1, y: 0 }, next: { x: 1, y: 0 },
    food: { x: 15, y: 10 }, acc: 0, over: false, speed: 7,
  })

  const reset = useCallback(() => {
    g.current = { body: [{ x: 10, y: 10 }], dir: { x: 1, y: 0 }, next: { x: 1, y: 0 },
      food: { x: 15, y: 10 }, acc: 0, over: false, speed: 7 }
    setScore(0); sfx.start()
  }, [])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const m: Record<string, { x: number; y: number }> = {
        ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
      }
      const d = m[e.key]
      if (!d) return
      e.preventDefault(); wakeAudio()
      const cur = g.current.dir
      // No instant reversal — it is always a death and never intentional.
      if (d.x === -cur.x && d.y === -cur.y) return
      g.current.next = d
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [])

  const ref = useCanvas((ctx, _t, dt) => {
    const st = g.current
    if (!st.over) {
      st.acc += dt
      if (st.acc >= 60 / st.speed) {
        st.acc = 0
        st.dir = st.next
        const head = { x: st.body[0].x + st.dir.x, y: st.body[0].y + st.dir.y }
        if (head.x < 0 || head.y < 0 || head.x >= N || head.y >= N ||
            st.body.some((b) => b.x === head.x && b.y === head.y)) {
          st.over = true; sfx.die()
        } else {
          st.body.unshift(head)
          if (head.x === st.food.x && head.y === st.food.y) {
            sfx.point(); st.speed = Math.min(16, st.speed + 0.3)
            setScore((s) => s + 1)
            do {
              st.food = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) }
            } while (st.body.some((b) => b.x === st.food.x && b.y === st.food.y))
          } else st.body.pop()
        }
      }
    }
    ctx.fillStyle = "#c8861a"
    ctx.fillRect(st.food.x * S + 4, st.food.y * S + 2, S - 8, S - 4)
    ctx.fillStyle = "#9a9a90"
    ctx.fillRect(st.food.x * S + 6, st.food.y * S, S - 12, 3)
    st.body.forEach((b, i) => {
      ctx.fillStyle = i === 0 ? "#f0efe9" : i % 2 ? "#4a4a45" : "#3e3e3a"
      ctx.fillRect(b.x * S + 1, b.y * S + 1, S - 2, S - 2)
    })
    if (st.over) {
      ctx.fillStyle = "rgba(17,17,16,.8)"; ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = "#f0efe9"; ctx.textAlign = "center"
      ctx.font = "500 14px ui-monospace,Menlo,monospace"
      ctx.fillText("TAP TO RETRY", W / 2, H / 2)
    }
  }, W, H)

  const touch = useRef<{ x: number; y: number } | null>(null)
  return (
    <div
      onPointerDown={(e) => { touch.current = { x: e.clientX, y: e.clientY } }}
      onPointerUp={(e) => {
        const t = touch.current; touch.current = null
        if (!t) return
        const dx = e.clientX - t.x, dy = e.clientY - t.y
        if (Math.abs(dx) < 20 && Math.abs(dy) < 20) { if (g.current.over) reset(); return }
        const d = Math.abs(dx) > Math.abs(dy)
          ? { x: dx > 0 ? 1 : -1, y: 0 }
          : { x: 0, y: dy > 0 ? 1 : -1 }
        const cur = g.current.dir
        if (!(d.x === -cur.x && d.y === -cur.y)) g.current.next = d
      }}
      className="h-full"
    >
      <Screen canvasRef={ref} w={W} h={H} label="Vial Snake"
        footer={<>Length <b className="text-foreground">{score + 1}</b> · swipe or arrows</>} />
    </div>
  )
}

/* ══════════════════════════ TITRATION ═══════════════════════════════════ */
/**
 * Hold a level inside the therapeutic band.
 *
 * The decay is EXPONENTIAL, not linear — a real half-life, so the fall is steep
 * when you are high and lazy when you are low. That is what makes it feel
 * unpredictable to hold rather than a straight ramp you can time once.
 */
export function Titration() {
  const W = 560, H = 240
  const [secs, setSecs] = useState(0)
  const g = useRef({ level: 0.55, band: { c: 0.55, w: 0.13 }, hold: false, score: 0, over: false, hist: [] as number[], grace: 90 })

  const reset = useCallback(() => {
    g.current = { level: 0.55, band: { c: 0.55, w: 0.13 }, hold: false, score: 0, over: false, hist: [], grace: 90 }
    setSecs(0); sfx.start()
  }, [])

  const ref = useCanvas((ctx, t, dt) => {
    const st = g.current
    if (!st.over) {
      if (st.grace > 0) st.grace -= dt
      // Exponential decay toward zero; dosing pushes toward 1 at a fixed rate.
      st.level = st.hold
        ? Math.min(1, st.level + 0.0075 * dt)
        : Math.max(0, st.level - st.level * 0.011 * dt - 0.0006 * dt)
      st.band.c = Math.max(0.2, Math.min(0.8, st.band.c + Math.sin(t / 2600) * 0.0016 * dt))
      st.band.w = Math.max(0.055, st.band.w - 0.000035 * dt)
      const inRange = Math.abs(st.level - st.band.c) <= st.band.w
      if (inRange) st.score += dt
      else if (st.grace <= 0) {
        st.score = Math.max(0, st.score - dt * 1.6)
        if (st.level <= 0.001) { st.over = true; sfx.lose() }
      }
      st.hist.push(st.level)
      if (st.hist.length > W - 90) st.hist.shift()
      setSecs(Math.round(st.score) / 10)
    }
    const gx = 70, gw = W - 90, gy = 26, gh = H - 72
    const yFor = (v: number) => gy + gh - v * gh
    ctx.fillStyle = "rgba(200,134,26,.15)"
    ctx.fillRect(gx, yFor(st.band.c + st.band.w), gw, st.band.w * 2 * gh)
    ctx.fillStyle = "#c8861a"; ctx.fillRect(gx, yFor(st.band.c) - 1, gw, 2)
    ctx.fillStyle = "#2e2e2c"; ctx.fillRect(gx, gy, 1, gh); ctx.fillRect(gx, gy + gh, gw, 1)
    ctx.strokeStyle = "#4fb3a6"; ctx.lineWidth = 2; ctx.beginPath()
    st.hist.forEach((v, i) => {
      const x = gx + i * (gw / (W - 90)), y = yFor(v)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
    const px = gx + st.hist.length * (gw / (W - 90))
    const inR = Math.abs(st.level - st.band.c) <= st.band.w
    ctx.fillStyle = inR ? "#4fb3a6" : "#ef4444"
    ctx.fillRect(px - 3, yFor(st.level) - 3, 6, 6)
    drawKyle(ctx, st.hold ? "cheer" : "idle", t, 2, 14, H - 18 * 2 - 30)
    ctx.fillStyle = "#7a7a74"; ctx.font = "400 10px ui-monospace,Menlo,monospace"; ctx.textAlign = "center"
    ctx.fillText(st.hold ? "DOSING" : "DECAYING", 14 + 16, H - 16)
    if (st.over) {
      ctx.fillStyle = "rgba(17,17,16,.8)"; ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = "#f0efe9"; ctx.textAlign = "center"
      ctx.font = "500 14px ui-monospace,Menlo,monospace"
      ctx.fillText(`${(st.score / 10).toFixed(1)}s IN RANGE — TAP TO RETRY`, W / 2, H / 2)
    }
  }, W, H)

  const down = useCallback(() => {
    wakeAudio()
    if (g.current.over) reset()
    else g.current.hold = true
  }, [reset])
  const up = useCallback(() => { g.current.hold = false }, [])

  // `[down, up]`, not a bare effect. Without a dependency array this
  // re-subscribed both window listeners on every render — and `setSecs` runs
  // once per frame, so that was ~120 listener swaps a second.
  useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (e.code === "Space") { e.preventDefault(); down() } }
    const ku = (e: KeyboardEvent) => { if (e.code === "Space") up() }
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku)
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku) }
  }, [down, up])

  return (
    <div onPointerDown={down} onPointerUp={up} onPointerLeave={up} className="h-full">
      <Screen canvasRef={ref} w={W} h={H} label="Titration"
        footer={<>In range <b className="text-foreground">{secs.toFixed(1)}s</b> · hold to dose, release to let it decay</>} />
    </div>
  )
}

/* ══════════════════════════ DRAW TIME ═══════════════════════════════════ */
export function DrawTime() {
  const W = 480, H = 220
  const [last, setLast] = useState<number | null>(null)
  const [avg, setAvg] = useState<number | null>(null)
  const g = useRef<{ state: "ready" | "wait" | "go" | "early" | "done"; at: number; times: number[] }>({
    state: "ready", at: 0, times: [],
  })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const arm = useCallback(() => {
    g.current.state = "wait"
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (g.current.state === "wait") { g.current.state = "go"; g.current.at = performance.now(); sfx.start() }
    }, 900 + Math.random() * 2200)
  }, [])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const press = useCallback(() => {
    const st = g.current
    if (st.state === "ready" || st.state === "done") { st.times = []; setAvg(null); setLast(null); arm(); return }
    if (st.state === "wait") {
      st.state = "early"; sfx.bad()
      // Tracked, so leaving the game during a false start cannot fire `arm()`
      // after unmount and play a start sound over the dashboard.
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(arm, 900)
      return
    }
    if (st.state === "go") {
      const ms = Math.round(performance.now() - st.at)
      st.times.push(ms); setLast(ms); sfx.good()
      if (st.times.length >= 5) {
        st.state = "done"
        setAvg(Math.round(st.times.reduce((a, b) => a + b, 0) / st.times.length))
        sfx.win()
      } else arm()
    }
  }, [arm])

  useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (e.code === "Space") { e.preventDefault(); wakeAudio(); press() } }
    window.addEventListener("keydown", kd)
    return () => window.removeEventListener("keydown", kd)
  }, [press])

  const ref = useCanvas((ctx, t) => {
    const st = g.current
    if (st.state === "go") {
      ctx.fillStyle = "#c8861a"; ctx.fillRect(W / 2 - 90, H / 2 - 36, 180, 70)
      ctx.fillStyle = "#111110"; ctx.textAlign = "center"
      ctx.font = "500 22px ui-monospace,Menlo,monospace"
      ctx.fillText("DRAW", W / 2, H / 2 + 8)
    } else {
      ctx.fillStyle = "#f0efe9"; ctx.textAlign = "center"
      ctx.font = "500 15px ui-monospace,Menlo,monospace"
      const label = st.state === "ready" ? "TAP TO START"
        : st.state === "wait" ? "WAIT FOR AMBER…"
        : st.state === "early" ? "TOO EARLY" : `AVG ${avg}ms — TAP TO GO AGAIN`
      ctx.fillText(label, W / 2, H / 2 + 4)
      ctx.fillStyle = "#7a7a74"; ctx.font = "400 11px ui-monospace,Menlo,monospace"
      ctx.fillText(`DRAW ${Math.min(st.times.length + 1, 5)} OF 5`, W / 2, H / 2 + 28)
    }
    drawKyle(ctx, st.state === "go" ? "cheer" : "idle", t, 3, 20, H - 18 * 3 - 16)
  }, W, H)

  return (
    <Screen canvasRef={ref} w={W} h={H} label="Draw Time" onPress={press}
      footer={<>Last <b className="text-foreground">{last ?? "—"}{last ? "ms" : ""}</b> · avg <b className="text-foreground">{avg ?? "—"}{avg ? "ms" : ""}</b> · five draws</>} />
  )
}

/* ══════════════════════════ KYLE RUN ════════════════════════════════════ */
export function KyleRun() {
  const W = 640, H = 200
  const [score, setScore] = useState(0)
  const g = useRef({ y: 0, vy: 0, air: false, obs: [] as { x: number; h: number }[], n: 0, speed: 3.4, over: false, nextPoint: 100 })

  const reset = useCallback(() => {
    g.current = { y: 0, vy: 0, air: false, obs: [], n: 0, speed: 3.4, over: false, nextPoint: 100 }
    setScore(0); sfx.start()
  }, [])

  const press = useCallback(() => {
    const st = g.current
    if (st.over) { reset(); return }
    if (!st.air) { st.vy = -10.6; st.air = true; sfx.jump() }
  }, [reset])

  useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (e.code === "Space") { e.preventDefault(); wakeAudio(); press() } }
    window.addEventListener("keydown", kd)
    return () => window.removeEventListener("keydown", kd)
  }, [press])

  const ref = useCanvas((ctx, t, dt) => {
    const st = g.current
    const GROUND = 148, floor = GROUND + 18 * 4 - 2
    if (!st.over) {
      st.vy += 0.62 * dt; st.y += st.vy * dt
      if (st.y > 0) { if (st.air) sfx.land(); st.y = 0; st.vy = 0; st.air = false }
      st.speed += 0.0013 * dt
      st.n += 0.4 * dt
      if (st.n > st.nextPoint) { st.nextPoint += 100; sfx.point() }
      st.obs = st.obs
        .map((o) => ({ ...o, x: o.x - st.speed * dt }))
        .filter((o) => o.x > -40)
      const lastO = st.obs[st.obs.length - 1]
      if (!lastO || lastO.x < W - 200 - Math.random() * 150) {
        st.obs.push({ x: W + 20, h: 20 + Math.round(Math.random() * 18) })
      }
      setScore(Math.floor(st.n))
    }
    ctx.fillStyle = "#2e2e2c"; ctx.fillRect(0, floor, W, 2)
    for (const o of st.obs) {
      const bx = Math.round(o.x), by = floor - o.h
      ctx.fillStyle = "#3e3e3a"; ctx.fillRect(bx, by, 12, o.h)
      ctx.fillStyle = "#c8861a"; ctx.fillRect(bx, by + o.h - 8, 12, 6)
      ctx.fillStyle = "#9a9a90"; ctx.fillRect(bx + 1, by - 3, 10, 4)
    }
    const kx = 68, kb = GROUND + Math.round(st.y)
    drawKyle(ctx, st.over ? "hurt" : st.air ? "jump" : "run", t, 4, kx, kb)
    if (!st.over) {
      const kx1 = kx + 14, kx2 = kx + 16 * 4 - 14, ky2 = kb + 18 * 4
      for (const o of st.obs) {
        if (o.x < kx2 && o.x + 12 > kx1 && ky2 > floor - o.h + 5) { st.over = true; sfx.die(); break }
      }
    } else {
      ctx.fillStyle = "rgba(17,17,16,.76)"; ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = "#f0efe9"; ctx.textAlign = "center"
      ctx.font = "500 15px ui-monospace,Menlo,monospace"
      ctx.fillText(`KYLE DOWN — ${Math.floor(st.n)} — TAP TO GO AGAIN`, W / 2, H / 2)
    }
  }, W, H)

  return (
    <Screen canvasRef={ref} w={W} h={H} label="Kyle Run" onPress={press}
      footer={<>Score <b className="text-foreground">{score}</b> · tap or space to jump</>} />
  )
}
