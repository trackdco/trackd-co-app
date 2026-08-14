/**
 * The chess set: Cartridge bodies, Cburnett knight.
 *
 * ── WHY THE KNIGHT IS NOT MINE ──────────────────────────────────────────────
 * I drew a knight four times and it was rejected four times — "weird little
 * snout", "looks like a pony", "wonky". The fifth attempt stopped drawing and
 * used the Cburnett outline instead: the chess piece SVG that Wikipedia,
 * lichess and effectively every chess site on the internet renders. It is the
 * shape people already have in their heads when they picture a knight, and no
 * amount of taste on my part beats that.
 *
 * The bezier control points below are that path, transformed from its 45-unit
 * viewBox into this grid. Do not "improve" them by eye.
 *
 * ── WHY CARTRIDGE FOR THE OTHER FIVE ────────────────────────────────────────
 * Five glassware directions were tried; this one won because it is the only one
 * whose facets survive being drawn at board size. Hex shoulders, hard chamfers,
 * a metal ferrule at each end, and a fill line that RISES WITH THE PIECE'S
 * VALUE — the pawn is nearly empty and the king nearly full, which means the
 * hierarchy is legible before you have parsed a single silhouette.
 */

export const SET_SIZE = 56
const C = SET_SIZE / 2
const FLOOR = 55

/**
 * Smoked glass, not metal.
 *
 * The core sits at 79% opacity — measured against the alternatives, that is the
 * furthest this can go while you can still see the square through the piece.
 * At 82% the board behind it disappears; at 62% the piece has no weight.
 *
 * Glass reads as glass because the EDGES are brighter than the middle, which is
 * the exact opposite of how metal is lit. Metal peaks near the centre; glass
 * catches the light where it curves away from you.
 */
export interface Material {
  rim: string; hi: string; core: string; lo: string
  amber: string; amberHi: string; amberLo: string
}
export const AMBER_SET: Material = {
  rim: "#f0c674", hi: "#8f6624", core: "rgba(30,26,17,.79)", lo: "#5c3c0a",
  amber: "#eaa81c", amberHi: "#ffe08c", amberLo: "#8a5a10",
}
export const GREY_SET: Material = {
  rim: "#c6ccd5", hi: "#5c626a", core: "rgba(28,31,36,.79)", lo: "#3a3e45",
  amber: "#8d939c", amberHi: "#d8dee6", amberLo: "#3f434a",
}
/** The ferrules stay metal — they are the one part that is not glass. */
const FERRULE = { dk: "#2b2d31", lo: "#585c63", mid: "#8d939c", hi: "#c6ccd5", top: "#eef2f7" }

const po = (c: CanvasRenderingContext2D, p: readonly (readonly [number, number])[]) => {
  c.beginPath(); c.moveTo(p[0][0], p[0][1])
  for (let i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1])
  c.closePath(); c.fill()
}
const el = (c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) => {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill()
}

/**
 * A lathe-turned surface.
 *
 * Every piece is a solid of revolution, and what sells that on a flat canvas is
 * a HORIZONTAL gradient: bright just left of centre, falling to dark at both
 * edges. Two flat tones read as cardboard; this reads as glass.
 */
function turned(c: CanvasRenderingContext2D, x0: number, x1: number,
  m: { dk: string; lo: string; mid: string; hi: string; top: string }) {
  const g = c.createLinearGradient(x0, 0, x1, 0)
  g.addColorStop(0, m.dk); g.addColorStop(0.20, m.hi); g.addColorStop(0.34, m.top)
  g.addColorStop(0.52, m.mid); g.addColorStop(0.80, m.lo); g.addColorStop(1, m.dk)
  return g
}
function glass(c: CanvasRenderingContext2D, x0: number, x1: number, m: Material) {
  const g = c.createLinearGradient(x0, 0, x1, 0)
  g.addColorStop(0, m.rim); g.addColorStop(0.16, m.hi)
  g.addColorStop(0.40, m.core); g.addColorStop(0.72, m.core)
  g.addColorStop(0.90, m.lo); g.addColorStop(1, m.rim)
  return g
}
/**
 * Facet lines, scaled to the piece.
 *
 * These used to be a fixed 0.9px, which meant the bishop — the narrowest body —
 * got the same line as the rook and it read as noticeably weaker. Scaling with
 * the width keeps every piece looking like it came from the same set.
 */
function facets(c: CanvasRenderingContext2D, m: Material, w: number, y: number, h: number) {
  const lw = Math.max(1, w * 0.12)
  c.fillStyle = m.rim
  c.fillRect(C - w * 0.42, y, lw, h)
  c.fillRect(C + w * 0.42 - lw, y, lw, h)
}
/** Amber sitting in the bottom of a body, with a meniscus and a darker settle. */
function liquid(c: CanvasRenderingContext2D, m: Material, halfTop: number, halfBot: number,
  top: number, bottom: number) {
  c.fillStyle = m.amber
  po(c, [[C - halfTop, top], [C + halfTop, top], [C + halfBot, bottom], [C - halfBot, bottom]])
  c.fillStyle = m.amberHi
  po(c, [[C - halfTop, top], [C + halfTop, top], [C + halfTop, top + 1.7], [C - halfTop, top + 1.7]])
  c.fillStyle = m.amberLo
  po(c, [[C - halfBot * 0.98, bottom - 2.6], [C + halfBot * 0.98, bottom - 2.6],
    [C + halfBot, bottom], [C - halfBot, bottom]])
}

/** Hex shoulder, chamfer facets, ferrule top and bottom, value-coded fill line. */
function barrel(c: CanvasRenderingContext2D, m: Material, top: number, w: number, fill: number) {
  c.fillStyle = glass(c, C - w, C + w, m)
  po(c, [[C - w * 0.5, top + 5], [C + w * 0.5, top + 5], [C + w, top + 11], [C + w, FLOOR - 7],
    [C + w * 0.8, FLOOR - 4], [C - w * 0.8, FLOOR - 4], [C - w, FLOOR - 7], [C - w, top + 11]])
  const h = FLOOR - 18 - top
  liquid(c, m, w * 0.86, w * 0.81, FLOOR - 7 - h * fill, FLOOR - 6)
  facets(c, m, w, top + 11, h)
  c.fillStyle = turned(c, C - w * 0.62, C + w * 0.62, FERRULE)
  c.fillRect(C - w * 0.62, top, w * 1.24, 5.2)
  c.fillStyle = FERRULE.top; c.fillRect(C - w * 0.62, top + 0.7, w * 1.24, 1.4)
  c.fillStyle = turned(c, C - w, C + w, FERRULE); c.fillRect(C - w, FLOOR - 4, w * 2, 4)
  c.fillStyle = FERRULE.dk; c.fillRect(C - w, FLOOR - 4, w * 2, 1)
  c.fillStyle = "rgba(255,255,255,.3)"; c.fillRect(C - w + 1.8, top + 12, 2, h)
}

const TOP = {
  ball: (c: CanvasRenderingContext2D, m: Material, y: number, r: number) => {
    c.fillStyle = glass(c, C - r, C + r, m); el(c, C, y, r, r)
  },
  mitre: (c: CanvasRenderingContext2D, m: Material, y: number, w: number, h: number) => {
    c.fillStyle = glass(c, C - w, C + w, m)
    po(c, [[C, y - h], [C + w, y - h * 0.35], [C + w * 0.9, y], [C - w * 0.9, y], [C - w, y - h * 0.35]])
    c.fillStyle = m.lo
    po(c, [[C, y - h + 2.5], [C + w * 0.55, y - h * 0.45], [C + w * 0.18, y - h * 0.38], [C - w * 0.22, y - h * 0.75]])
    c.fillStyle = glass(c, C - 3, C + 3, m); el(c, C, y - h - 2.6, 2.7, 2.7)
  },
  battle: (c: CanvasRenderingContext2D, m: Material, y: number, w: number, h: number) => {
    c.fillStyle = glass(c, C - w, C + w, m); c.fillRect(C - w, y - h, w * 2, h)
    c.fillStyle = "rgba(0,0,0,.5)"
    const n = 4, s = (w * 2) / (n * 2 - 1)
    for (let i = 0; i < n; i++) c.fillRect(C - w + s * (i * 2) + s * 0.5, y - h, s * 0.9, h * 0.55)
    c.fillStyle = m.rim; c.fillRect(C - w, y - 1.4, w * 2, 1.4)
  },
  coronet: (c: CanvasRenderingContext2D, m: Material, y: number, w: number, h: number) => {
    c.fillStyle = glass(c, C - w, C + w, m)
    po(c, [[C - w, y], [C + w, y], [C + w * 0.86, y - h], [C + w * 0.4, y - h * 0.5],
      [C, y - h * 1.28], [C - w * 0.4, y - h * 0.5], [C - w * 0.86, y - h]])
    c.fillStyle = m.rim; for (const dx of [-w * 0.86, 0, w * 0.86]) el(c, C + dx, y - h - 1.7, 2.2, 2.2)
  },
  cross: (c: CanvasRenderingContext2D, m: Material, y: number, w: number, h: number) => {
    c.fillStyle = glass(c, C - w, C + w, m)
    po(c, [[C - w, y], [C + w, y], [C + w * 0.9, y - h], [C, y - h * 0.58], [C - w * 0.9, y - h]])
    c.fillStyle = glass(c, C - 5, C + 5, m)
    c.fillRect(C - 1.7, y - h - 10, 3.4, 10); c.fillRect(C - 5.6, y - h - 7.2, 11.2, 3.2)
  },
}

/* ── The knight ─────────────────────────────────────────────────────────── */
const S = 1.05
const kx = (x: number) => (x - 22) * S + C
const ky = (y: number) => (y - 7) * S + 5.4

function knightOutline(c: CanvasRenderingContext2D) {
  c.beginPath()
  c.moveTo(kx(22), ky(10))
  c.bezierCurveTo(kx(32.5), ky(11), kx(38.5), ky(18), kx(38), ky(39))
  c.lineTo(kx(15), ky(39))
  c.bezierCurveTo(kx(15), ky(30), kx(25), ky(32.5), kx(23), ky(18))
  c.closePath()
  c.moveTo(kx(24), ky(18))
  c.bezierCurveTo(kx(24.38), ky(20.91), kx(18.45), ky(25.37), kx(16), ky(27))
  c.bezierCurveTo(kx(13), ky(29), kx(13.18), ky(31.34), kx(11), ky(31))
  c.bezierCurveTo(kx(9.958), ky(30.06), kx(12.41), ky(27.96), kx(11), ky(28))
  c.bezierCurveTo(kx(10), ky(28), kx(11.19), ky(29.23), kx(10), ky(30))
  c.bezierCurveTo(kx(9), ky(30), kx(5.997), ky(31), kx(6), ky(26))
  c.bezierCurveTo(kx(6), ky(24), kx(12), ky(14), kx(12), ky(14))
  c.bezierCurveTo(kx(12), ky(14), kx(13.89), ky(12.1), kx(14), ky(10.5))
  c.bezierCurveTo(kx(13.27), ky(9.506), kx(13.5), ky(8.5), kx(13.5), ky(7.5))
  c.bezierCurveTo(kx(14.5), ky(6.5), kx(16.5), ky(10), kx(16.5), ky(10))
  c.lineTo(kx(18.5), ky(10))
  c.bezierCurveTo(kx(18.5), ky(10), kx(19.28), ky(8.008), kx(21), ky(7))
  c.bezierCurveTo(kx(22), ky(7), kx(22), ky(10), kx(22), ky(10))
  c.closePath()
}

function knight(c: CanvasRenderingContext2D, m: Material) {
  const g = glass(c, kx(6), kx(38), m)
  c.fillStyle = g; c.strokeStyle = g
  /* Filled AND stroked: the two subpaths meet along a seam that a plain fill
     leaves as a hairline gap at this scale. */
  c.lineWidth = 1.2; c.lineJoin = "round"
  knightOutline(c); c.fill(); c.stroke()

  c.save(); knightOutline(c); c.clip()
  /* Amber pooling in the chest, following the widening base. A bare rectangle
     here ends in a hard line straight across the horse. */
  c.fillStyle = m.amber
  po(c, [[kx(9), ky(28)], [kx(36), ky(28)], [kx(38), ky(40)], [kx(7), ky(40)]])
  c.fillStyle = m.amberHi
  po(c, [[kx(9), ky(28)], [kx(36), ky(28)], [kx(36), ky(28) + 1.7], [kx(9), ky(28) + 1.7]])
  c.fillStyle = "rgba(0,0,0,.34)"                                 // mane
  c.beginPath()
  c.moveTo(kx(24), ky(9.5))
  c.bezierCurveTo(kx(34), ky(12), kx(38.5), ky(19), kx(38), ky(40))
  c.lineTo(kx(32.5), ky(40))
  c.bezierCurveTo(kx(34), ky(23), kx(31), ky(15), kx(23.5), ky(12.5))
  c.closePath(); c.fill()
  c.strokeStyle = "rgba(0,0,0,.4)"; c.lineWidth = 0.9
  for (let i = 0; i < 10; i++) {
    const t = i / 9
    c.beginPath()
    c.moveTo(kx(24 + t * 8.5), ky(12.5 + t * 26.5))
    c.lineTo(kx(34 + t * 3.5), ky(15.5 + t * 24.5))
    c.stroke()
  }
  c.fillStyle = "rgba(255,255,255,.2)"                            // cheek plane
  c.beginPath()
  c.moveTo(kx(7), ky(27))
  c.bezierCurveTo(kx(9), ky(19), kx(15), ky(13), kx(20), ky(12))
  c.bezierCurveTo(kx(23), ky(19), kx(19), ky(25), kx(14), ky(29))
  c.closePath(); c.fill()
  c.fillStyle = "rgba(255,255,255,.16)"
  c.beginPath()
  c.moveTo(kx(8.5), ky(26))
  c.bezierCurveTo(kx(10.5), ky(20), kx(15), ky(15), kx(19), ky(14))
  c.bezierCurveTo(kx(20.5), ky(19), kx(17), ky(24), kx(13), ky(27))
  c.closePath(); c.fill()
  c.restore()

  /**
   * The eye sits HIGH on the skull. Cburnett's own dot is at (9.5, 25.5), which
   * lands down by the mouth — fine in a flat two-tone icon, wrong once the head
   * is shaded, because the cheek plane then reads as the whole head and the eye
   * looks like a nostril.
   */
  c.fillStyle = "#241f14"
  c.beginPath(); c.ellipse(kx(13), ky(20), 2, 1.7, -0.35, 0, Math.PI * 2); c.fill()
  c.fillStyle = m.rim; c.fillRect(kx(13) - 1.6, ky(20) - 1.4, 1.2, 1.2)
  c.fillStyle = "#241f14"
  c.beginPath(); c.ellipse(kx(8), ky(29), 1.3, 1.0, -0.4, 0, Math.PI * 2); c.fill()
}

function knightFoot(c: CanvasRenderingContext2D, m: Material) {
  const w = 10, top = 39
  c.fillStyle = glass(c, C - w, C + w, m)
  po(c, [[C - w * 0.6, top], [C + w * 0.6, top], [C + w, top + 4], [C + w, FLOOR - 4],
    [C + w * 0.8, FLOOR - 2], [C - w * 0.8, FLOOR - 2], [C - w, FLOOR - 4], [C - w, top + 4]])
  /* The foot is a vial like every other body, so it gets the same amber and the
     same chamfer lines. Without them the knight read as a horse bolted onto a
     piece from a different set. */
  liquid(c, m, w * 0.84, w * 0.78, top + 6, FLOOR - 3)
  facets(c, m, w, top + 4, FLOOR - 7 - top)
  c.fillStyle = turned(c, C - w, C + w, FERRULE); c.fillRect(C - w, FLOOR - 4, w * 2, 4)
  c.fillStyle = FERRULE.dk; c.fillRect(C - w, FLOOR - 4, w * 2, 1)
  c.fillStyle = "rgba(255,255,255,.3)"; c.fillRect(C - w + 1.8, top + 5, 2, FLOOR - 9 - top)
}

export type PieceKey = "p" | "n" | "b" | "r" | "q" | "k"
export type PieceDraw = (c: CanvasRenderingContext2D, m: Material) => void

/** Fill fraction rises with value, so the hierarchy reads before the shape does. */
export const CHESS_SET: Record<PieceKey, PieceDraw> = {
  p: (c, m) => { barrel(c, m, 30, 7.5, 0.55); TOP.ball(c, m, 26, 4.8) },
  n: (c, m) => { knightFoot(c, m); knight(c, m) },
  b: (c, m) => { barrel(c, m, 26, 8, 0.65); TOP.mitre(c, m, 24, 7.6, 13) },
  r: (c, m) => { barrel(c, m, 24, 10.5, 0.76); TOP.battle(c, m, 23, 11.4, 9.5) },
  q: (c, m) => { barrel(c, m, 21, 9.2, 0.88); TOP.coronet(c, m, 20, 10.6, 10.5) },
  k: (c, m) => { barrel(c, m, 19, 9.8, 1); TOP.cross(c, m, 18, 10.6, 9.5) },
}

/**
 * Pieces are drawn once into an offscreen canvas and reused.
 *
 * There are up to 32 on the board and the loop runs at 60fps; re-running a
 * couple of hundred bezier segments per piece per frame is a lot of work for an
 * image that never changes. Twelve cached bitmaps — six pieces, two materials —
 * make the render loop a series of drawImage calls.
 */
const cache = new Map<string, HTMLCanvasElement>()

/**
 * Draw once to measure, then redraw centred on the ACTUAL INK.
 *
 * The pieces are not symmetric about the middle of their box — the knight sits
 * noticeably left — so trusting the box to centre them left every piece a
 * little off in its square, the knight worst of all. Measuring the painted
 * bounds and shifting by the difference is the only thing that reliably centres
 * art nobody hand-placed. It costs one extra draw per piece per size, once,
 * because the result is cached.
 */
export function pieceBitmap(k: PieceKey, white: boolean, px: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null
  const key = `${k}${white ? "w" : "b"}${px}`
  const hit = cache.get(key)
  if (hit) return hit

  const mat = white ? AMBER_SET : GREY_SET
  const probe = document.createElement("canvas")
  probe.width = probe.height = SET_SIZE
  const pc = probe.getContext("2d")
  if (!pc) return null
  CHESS_SET[k](pc, mat)
  const d = pc.getImageData(0, 0, SET_SIZE, SET_SIZE).data
  let minX = SET_SIZE, maxX = -1, minY = SET_SIZE, maxY = -1
  for (let y = 0; y < SET_SIZE; y++) {
    for (let x = 0; x < SET_SIZE; x++) {
      if (d[(y * SET_SIZE + x) * 4 + 3] < 24) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  const cv = document.createElement("canvas")
  cv.width = cv.height = px
  const c = cv.getContext("2d")
  if (!c) return null
  c.scale(px / SET_SIZE, px / SET_SIZE)
  if (maxX >= 0) c.translate((SET_SIZE - (minX + maxX + 1)) / 2, (SET_SIZE - (minY + maxY + 1)) / 2)
  CHESS_SET[k](c, mat)
  cache.set(key, cv)
  return cv
}
