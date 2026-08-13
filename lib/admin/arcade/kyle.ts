/**
 * Kyle, and the pixel renderer everything in the arcade draws with.
 *
 * He is a VIAL — crimped cap, glass body, amber in the base. Never a jar.
 * He has no legs, so every pose is carried by bobbing, squash-and-stretch, the
 * liquid sloshing, and two stubby arms.
 *
 * Pure: no React, no DOM beyond the 2D context handed in.
 */

export type Pixels = readonly string[]
export type Palette = Record<string, string>

/** Chunky Kyle — Adrian's pick. Wider, heavier outline, most readable small. */
export const KYLE_PAL: Palette = {
  K: "#7a7a72", k: "#adada2", G: "#4a4a45", g: "#26261f", w: "#66665e",
  A: "#d79422", a: "#a06a12", E: "#f0efe9", S: "#ffffff", m: "#8a8a80", arm: "#4a4a45",
}

/**
 * `E` is the eye and `S` is the spark in it.
 *
 * Adrian couldn't read the face at small sizes, so the eyes went from one pixel
 * to a 2x2 block with a single white catchlight in the corner. A spark is what
 * makes a dot read as an eye rather than as a hole.
 */
export const KYLE: { w: number; h: number; armRow: number; leftCol: number; rightCol: number; liquidFrom: number; liquidTo: number; rows: Pixels } = {
  w: 16, h: 18, armRow: 8, leftCol: 3, rightCol: 12, liquidFrom: 11, liquidTo: 14,
  rows: [
    "................",
    ".....KKKKKK.....",
    ".....kkkkkk.....",
    ".....KKKKKK.....",
    "...GGGGGGGGGG...",
    "...GwgggggggG...",
    "...GwgEEgEEgG...",
    "...GwgESgESgG...",
    "...GwgggggggG...",
    "...GwggmmgggG...",
    "...GwgggggggG...",
    "...GwAAAAAAAG...",
    "...GwAAAAAAAG...",
    "...GwAAAAAAAG...",
    "...GaaaaaaaaG...",
    "...GGGGGGGGGG...",
    "....GGGGGGGG....",
    "................",
  ],
}

export function drawPixels(
  ctx: CanvasRenderingContext2D,
  rows: Pixels,
  pal: Palette,
  scale: number,
  ox: number,
  oy: number,
  opts: { flip?: boolean; tint?: string | null; sx?: number; sy?: number; slosh?: number; alpha?: number; liquidFrom?: number; liquidTo?: number } = {}
) {
  const { flip = false, tint = null, sx = 1, sy = 1, slosh = 0, alpha = 1, liquidFrom, liquidTo } = opts
  const w = rows[0]?.length ?? 0
  const h = rows.length
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(ox, oy)
  ctx.translate((w * scale) / 2, h * scale)
  ctx.scale(flip ? -sx : sx, sy)
  ctx.translate(-(w * scale) / 2, -h * scale)
  for (let r = 0; r < h; r++) {
    const row = rows[r]
    const liquid =
      liquidFrom !== undefined && liquidTo !== undefined && r >= liquidFrom && r < liquidTo
    for (let c = 0; c < row.length; c++) {
      const ch = row[c]
      if (ch === "." ) continue
      const col = pal[ch]
      if (!col) continue
      const dx = liquid && (ch === "A" || ch === "a") ? slosh : 0
      ctx.fillStyle = tint ?? col
      ctx.fillRect((c + dx) * scale, r * scale, scale, scale)
    }
  }
  ctx.restore()
}

export type KylePose = "idle" | "run" | "jump" | "hurt" | "cheer"

/** Kyle in a pose, arms and all. `t` is a millisecond clock. */
export function drawKyle(
  ctx: CanvasRenderingContext2D,
  pose: KylePose,
  t: number,
  scale: number,
  ox: number,
  oy: number,
  tint: string | null = null
) {
  let bob = 0, sx = 1, sy = 1, slosh = 0
  let aL = { dx: -2, dy: 0 }, aR = { dx: 1, dy: 0 }
  if (pose === "idle") {
    bob = Math.round(Math.sin(t / 380) * 1.4)
    slosh = Math.round(Math.sin(t / 520))
  } else if (pose === "run") {
    const p = (t / 90) % (Math.PI * 2)
    bob = Math.round(Math.abs(Math.sin(p)) * -2)
    slosh = Math.round(Math.sin(p * 2) * 1.2)
    aL = { dx: -2, dy: Math.round(Math.sin(p) * 2.2) }
    aR = { dx: 1, dy: Math.round(-Math.sin(p) * 2.2) }
  } else if (pose === "jump") {
    sy = 1.06; sx = 0.96; slosh = -1
    aL = { dx: -2, dy: -3 }; aR = { dx: 1, dy: -3 }
  } else if (pose === "hurt") {
    bob = 2; sx = 1.12; sy = 0.9
    aL = { dx: -3, dy: 1 }; aR = { dx: 2, dy: 1 }
  } else {
    // cheer
    bob = Math.round(Math.sin(t / 140) * 2.2)
    slosh = Math.round(Math.sin(t / 120) * 1.6)
    aL = { dx: -2, dy: -4 }; aR = { dx: 1, dy: -4 }
  }

  drawPixels(ctx, KYLE.rows, KYLE_PAL, scale, ox, oy + bob * scale, {
    sx, sy, slosh, tint, liquidFrom: KYLE.liquidFrom, liquidTo: KYLE.liquidTo,
  })

  ctx.fillStyle = tint ?? KYLE_PAL.arm
  const ar = KYLE.armRow
  const y = oy + bob * scale
  ctx.fillRect(ox + (KYLE.leftCol + aL.dx) * scale, y + (ar + aL.dy) * scale, 2 * scale, scale)
  ctx.fillRect(ox + (KYLE.leftCol + aL.dx) * scale, y + (ar + aL.dy) * scale, scale, 2 * scale)
  ctx.fillRect(ox + (KYLE.rightCol + aR.dx + 1) * scale, y + (ar + aR.dy) * scale, 2 * scale, scale)
  ctx.fillRect(ox + (KYLE.rightCol + aR.dx + 2) * scale, y + (ar + aR.dy) * scale, scale, 2 * scale)
}

/** The faint engineering grid every arcade screen sits on. */
export function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, step = 16) {
  ctx.strokeStyle = "rgba(255,255,255,0.03)"
  ctx.lineWidth = 1
  for (let x = 0; x < w; x += step) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke()
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke()
  }
}
