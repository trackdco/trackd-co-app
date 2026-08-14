"use client"

import { useEffect, useRef } from "react"

import { pieceBitmap, type PieceKey } from "@/components/admin/arcade/chessSet"
import { drawKyle } from "@/lib/admin/arcade/kyle"

/**
 * The little picture on each arcade menu tile.
 *
 * Every tile drew a title and a sentence and nothing else, which made the menu
 * a list of links rather than an arcade. Each game now shows the thing it
 * actually is — chess shows a board with pieces on it, Stack shows a stack,
 * 2048 shows tiles. Same canvas pixel language as the games themselves, so the
 * menu previews the thing rather than describing it.
 */

const W = 104
const H = 64

type Art = (ctx: CanvasRenderingContext2D, t: number) => void

const ART: Record<string, Art> = {
  /** A corner of a real board, with real pieces. */
  chess: (ctx) => {
    const cell = 16
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 6; c++) {
        ctx.fillStyle = (r + c) % 2 ? "#1c1c1a" : "#2a2a26"
        ctx.fillRect(c * cell + 4, r * cell, cell, cell)
      }
    }
    const put = (piece: PieceKey, c: number, r: number, white: boolean) => {
      const bmp = pieceBitmap(piece, white, cell)
      if (bmp) ctx.drawImage(bmp, c * cell + 4, r * cell)
    }
    put("k", 1, 0, false)
    put("p", 3, 1, false)
    put("n", 2, 2, true)
    put("q", 4, 3, true)
  },

  /** A leaning tower of vials, mid-run. */
  stack: (ctx, t) => {
    const widths = [66, 60, 54, 46, 38]
    widths.forEach((w, i) => {
      const wobble = Math.sin(t / 700 + i) * 3
      const x = W / 2 - w / 2 + wobble
      const y = H - 12 - i * 11
      ctx.fillStyle = i % 2 ? "#3e3e3a" : "#4a4a45"
      ctx.fillRect(x, y, w, 9)
      ctx.fillStyle = i === 0 ? "#f0c674" : "#c8861a"
      ctx.fillRect(x + 2, y + 4, w - 4, 4)
    })
  },

  /** Dose tiles, mid-merge. */
  "2048": (ctx) => {
    const vals = ["5", "10", "25", "50"]
    const cols = ["#4a4a45", "#7a6440", "#c8861a", "#f0c674"]
    vals.forEach((v, i) => {
      const x = 8 + (i % 2) * 46
      const y = 6 + Math.floor(i / 2) * 28
      ctx.fillStyle = cols[i]
      ctx.fillRect(x, y, 40, 24)
      ctx.fillStyle = i >= 2 ? "#111110" : "#f0efe9"
      ctx.font = "500 13px ui-monospace,Menlo,monospace"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(v, x + 20, y + 12)
    })
    ctx.textBaseline = "alphabetic"
  },

  /** A snake curling toward a dose. */
  snake: (ctx, t) => {
    const seg = 9
    const n = 7
    for (let i = 0; i < n; i++) {
      const p = t / 420 + i * 0.5
      const x = W / 2 + Math.cos(p) * 26 - seg / 2
      const y = H / 2 + Math.sin(p * 1.6) * 16 - seg / 2
      ctx.fillStyle = i === 0 ? "#f0efe9" : i % 2 ? "#4a4a45" : "#3e3e3a"
      ctx.fillRect(x, y, seg - 1, seg - 1)
    }
    ctx.fillStyle = "#c8861a"
    ctx.fillRect(16, 14, 8, 10)
    ctx.fillStyle = "#9a9a90"
    ctx.fillRect(18, 12, 4, 3)
  },

  /** The therapeutic band, with a line wandering through it. */
  titration: (ctx, t) => {
    ctx.fillStyle = "rgba(200,134,26,.18)"
    ctx.fillRect(0, 24, W, 18)
    ctx.fillStyle = "#c8861a"
    ctx.fillRect(0, 32, W, 1)
    ctx.strokeStyle = "#4fb3a6"
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = 0; x <= W; x += 4) {
      const y = 33 + Math.sin(x / 13 + t / 600) * 13
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  },

  /** Kyle mid-hop over a vial. */
  run: (ctx, t) => {
    const ground = H - 10
    ctx.fillStyle = "#2e2e2c"
    ctx.fillRect(0, ground, W, 2)
    ctx.fillStyle = "#3e3e3a"
    ctx.fillRect(72, ground - 14, 8, 14)
    ctx.fillStyle = "#c8861a"
    ctx.fillRect(72, ground - 6, 8, 4)
    const hop = Math.abs(Math.sin(t / 420)) * -18
    drawKyle(ctx, "jump", t, 2, 26, ground - 36 + hop)
  },

  /** The amber DRAW flash. */
  draw: (ctx, t) => {
    const on = Math.sin(t / 700) > 0
    ctx.fillStyle = on ? "#c8861a" : "#26261f"
    ctx.fillRect(18, 16, 68, 32)
    ctx.fillStyle = on ? "#111110" : "#5a5a54"
    ctx.font = "500 13px ui-monospace,Menlo,monospace"
    ctx.textAlign = "center"
    ctx.fillText(on ? "DRAW" : "WAIT", 52, 37)
  },

  /** Block shapes falling onto a grid. */
  blocks: (ctx) => {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 8; c++) {
        ctx.fillStyle = "#1c1c1a"
        ctx.fillRect(4 + c * 12, 4 + r * 12, 10, 10)
      }
    }
    const filled: [number, number, string][] = [
      [0, 0, "#c8861a"], [1, 0, "#c8861a"], [0, 1, "#c8861a"],
      [4, 2, "#4fb3a6"], [5, 2, "#4fb3a6"], [6, 2, "#4fb3a6"],
      [2, 4, "#6b7fd4"], [3, 4, "#6b7fd4"],
    ]
    for (const [c, r, col] of filled) {
      ctx.fillStyle = col
      ctx.fillRect(4 + c * 12, 4 + r * 12, 10, 10)
    }
  },

  /** Four in a row, amber against grey. */
  connect: (ctx) => {
    ctx.fillStyle = "#26261f"
    ctx.fillRect(10, 4, 84, 56)
    const discs: [number, number, string | null][] = [
      [0, 3, "#c8861a"], [1, 3, "#9a9a90"], [2, 3, "#c8861a"], [3, 3, "#9a9a90"],
      [0, 2, "#9a9a90"], [1, 2, "#c8861a"], [2, 2, "#c8861a"], [3, 2, null],
      [1, 1, "#c8861a"], [2, 1, "#9a9a90"], [0, 1, null], [3, 1, null],
    ]
    for (let c = 0; c < 5; c++) {
      for (let r = 0; r < 4; r++) {
        const hit = discs.find((d) => d[0] === c && d[1] === r)
        ctx.fillStyle = hit?.[2] ?? "#111110"
        ctx.beginPath()
        ctx.arc(20 + c * 16, 12 + r * 13, 5.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  },

  /** A fanned run of amber cards. */
  solitaire: (ctx) => {
    for (let i = 0; i < 4; i++) {
      const x = 14 + i * 16
      const y = 10 + i * 6
      ctx.fillStyle = "#2b2a24"
      ctx.fillRect(x, y, 26, 36)
      ctx.fillStyle = i === 3 ? "#f0efe9" : "#c8861a"
      ctx.fillRect(x + 2, y + 2, 22, 32)
      ctx.fillStyle = "#111110"
      ctx.font = "500 11px ui-monospace,Menlo,monospace"
      ctx.textAlign = "left"
      ctx.fillText(["A", "K", "Q", "J"][i], x + 5, y + 14)
    }
  },
}

export function TileArt({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext("2d")
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    const art = ART[id]
    let raf = 0
    const frame = (t: number) => {
      ctx.clearRect(0, 0, W, H)
      art?.(ctx, t)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [id])

  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      aria-hidden
      className="block w-full rounded-lg bg-[#141413] [image-rendering:pixelated]"
    />
  )
}
