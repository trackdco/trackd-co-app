/**
 * The eleven opponents, drawn on a canvas.
 *
 * ── WHY THESE ARE FUNCTIONS AND NOT PIXEL ROWS ──────────────────────────────
 * The roster used to be string arrays (`"...GwgEEgEEgG..."`) rendered through
 * `drawPixels`. That format is lovely for a 16x18 mascot and hopeless past it:
 * every character was capped at the resolution someone was willing to type out
 * by hand, and nothing could move except by swapping whole frames.
 *
 * Drawing into a 64x64 context instead buys three things that the ladder needs:
 * real shading (four tone bands per form rather than two), sub-pixel geometry,
 * and — the important one — a `t` parameter, so a portrait can breathe, blink,
 * churn or shake without anyone authoring a single extra frame.
 *
 * ── THE GRID ────────────────────────────────────────────────────────────────
 * Everything is drawn in a 64x64 space with the centre line at x=32. Feet, or
 * whatever passes for them, land around y=60. Nobody has legs — that was a
 * deliberate call, and it keeps the silhouettes readable at portrait size.
 */

export const PORTRAIT_SIZE = 64
const C = 32

export type Mood = "idle" | "thinking" | "gloat" | "beaten"
/**
 * `held` is milliseconds spent in the CURRENT mood.
 *
 * Without it every "thinking" animation runs on its own sine and is cut off
 * mid-stroke whenever the search happens to finish — Recon's bar would be
 * halfway through a sweep and then simply vanish. With it an animation can
 * settle: fill toward full and stay there, ease in over the first beat, and
 * generally behave like it is responding to the engine rather than to a clock
 * that knows nothing about the engine.
 */
export type Draw = (ctx: CanvasRenderingContext2D, t: number, mood: Mood, held: number) => void

/** Ease in over `ms`, so a mood change is a transition rather than a jump. */
const easeIn = (held: number, ms = 260) => {
  const x = Math.min(1, held / ms)
  return 1 - (1 - x) * (1 - x)
}
/** Approach 1 and stay there. Progress that settles, rather than a loop. */
const settle = (held: number, ms: number) => 1 - Math.exp(-held / ms)

/* ── shared drawing helpers ─────────────────────────────────────────────── */
const rr = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  c.beginPath(); c.roundRect(x, y, w, h, r); c.fill()
}
const el = (c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) => {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill()
}
const po = (c: CanvasRenderingContext2D, p: readonly (readonly [number, number])[]) => {
  c.beginPath(); c.moveTo(p[0][0], p[0][1])
  for (let i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1])
  c.closePath(); c.fill()
}
const cap = (c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, t: number, col: string) => {
  c.save(); c.translate(x1, y1); c.rotate(Math.atan2(y2 - y1, x2 - x1))
  c.fillStyle = col; rr(c, 0, -t / 2, Math.hypot(x2 - x1, y2 - y1), t, t / 2); c.restore()
}
/** Mirror a draw call through the centre line. Nothing is placed per-side. */
const mir = (fn: (s: -1 | 1) => void) => { fn(-1); fn(1) }

const INK = "#12110e", WHITE = "#f6f5f0"

interface EyeOpts {
  sclera?: string | null
  pupil?: string
  brow?: number
  lid?: number
  glow?: string | null
  blink?: number
}
function eyes(c: CanvasRenderingContext2D, y: number, gap: number, w: number, h: number, o: EyeOpts = {}) {
  const { sclera = WHITE, pupil = INK, brow = 0, lid = 0, glow = null, blink = 0 } = o
  const hh = Math.max(1.2, h * (1 - blink)), yy = y + (h - hh) / 2
  for (const s of [-1, 1]) {
    const x = C + s * gap - w / 2
    if (sclera) { c.fillStyle = sclera; rr(c, x, yy, w, hh, 1.6) }
    c.fillStyle = glow ?? pupil
    c.fillRect(x + (sclera ? 1.2 : 0), yy + (sclera ? 1.2 : 0) + lid,
      Math.max(1.2, w - (sclera ? 2.4 : 0)), Math.max(1.2, hh - (sclera ? 2.4 : 0) - lid))
    if (sclera && !glow && !blink) { c.fillStyle = "#ffffff"; c.fillRect(x + 1.5, yy + 1.5 + lid, 1.6, 1.6) }
    if (brow) {
      c.fillStyle = INK
      po(c, [[x - 1.5, yy - 3.6 + (s < 0 ? 0 : brow)], [x + w + 1.5, yy - 3.6 + (s < 0 ? brow : 0)],
        [x + w + 1.5, yy - 0.6], [x - 1.5, yy - 0.6]])
    }
  }
}
type ArmPose = "down" | "folded" | "out" | "flex" | "weakflex"
function arms(c: CanvasRenderingContext2D, pose: ArmPose, y: number, w: number, col: string, lift = 0) {
  c.fillStyle = col
  if (pose === "down") { cap(c, C - w, y, C - w - 3, y + 9 + lift, 4.6, col); cap(c, C + w, y, C + w + 3, y + 9 + lift, 4.6, col) }
  if (pose === "folded") { rr(c, C - w, y, w * 2, 4.6, 2.3); c.fillStyle = "rgba(255,255,255,.14)"; rr(c, C - w, y, w * 2, 1.6, .8) }
  if (pose === "out") { cap(c, C - w, y, C - w - 8, y + 2 - lift, 4.4, col); cap(c, C + w, y, C + w + 8, y + 2 - lift, 4.4, col) }
  if (pose === "flex") mir((s) => {
    cap(c, C + s * w, y + 3, C + s * (w + 6), y - 2 - lift, 5.2, col)
    cap(c, C + s * (w + 6), y - 2 - lift, C + s * (w + 3), y - 9 - lift, 5.2, col)
    c.fillStyle = col; el(c, C + s * (w + 5), y - 3 - lift, 3.8, 3.4)
    c.beginPath(); c.arc(C + s * (w + 3), y - 10 - lift, 2.8, 0, 7); c.fill()
  })
  if (pose === "weakflex") mir((s) => {
    cap(c, C + s * w, y + 2, C + s * (w + 5), y - 1 - lift, 3.4, col)
    cap(c, C + s * (w + 5), y - 1 - lift, C + s * (w + 3), y - 7 - lift, 3.4, col)
    c.fillStyle = col; el(c, C + s * (w + 4), y - 2 - lift, 1.9, 1.7)
  })
}
/** Bob is the idle heartbeat; gloat is a fast bounce; beaten sags and stays down. */
function bob(t: number, mood: Mood, speed = 640, amp = 1.4) {
  if (mood === "gloat") return -Math.abs(Math.sin(t / 110)) * 4.5
  if (mood === "beaten") return 3
  return Math.sin(t / speed) * amp
}
const blinkAt = (t: number, period: number) => ((t % period) < 130 ? 0.85 : 0)

/* ── Chad's skin ramp, shared by head and torso ──────────────────────────
   The first version had a torso ~45% darker than the face, which the eye reads
   as clothing no matter how much anatomy is drawn on it. One ramp fixes it. */
const SK = { d: "#8f8b80", mid: "#b0aca1", lit: "#c6c2b6", top: "#d8d4c7", sh: "#77746b" }

function chadHead(c: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const P = (pts: readonly (readonly [number, number])[]) =>
    po(c, pts.map(([x, y]) => [cx + x * s, cy + y * s] as const))
  c.fillStyle = SK.mid; P([[-5, -9], [5, -9], [5.6, -3], [5, 2], [-5, 2], [-5.6, -3]])
  c.fillStyle = SK.lit; P([[-6.4, -4], [6.4, -4], [7, 3], [4, 8], [0, 9.6], [-4, 8], [-7, 3]])
  c.fillStyle = SK.top; P([[-5.6, -4], [5.6, -4], [5.6, 2], [-5.6, 2]])
  c.fillStyle = SK.d; P([[-6.2, 0], [-2.6, -1], [-3.4, 3.4], [-6.4, 2.4]]); P([[6.2, 0], [2.6, -1], [3.4, 3.4], [6.4, 2.4]])
  c.fillStyle = SK.sh; P([[-6.2, 3.6], [6.2, 3.6], [4, 8], [0, 9.6], [-4, 8]])
  c.fillStyle = "#63605a"; P([[-.8, 6], [.8, 6], [.8, 9.4], [-.8, 9.4]])
  c.fillStyle = "#1f1f1d"; P([[-6, -9], [6, -9], [5.4, -14], [0, -11], [-5.4, -14]])
  c.fillRect(cx - 6 * s, cy - 9.8 * s, 12 * s, 1.8 * s)
  c.fillStyle = "#5a574f"; c.fillRect(cx - 5.4 * s, cy - 3.3 * s, 4.6 * s, 1.8 * s); c.fillRect(cx + 0.8 * s, cy - 3.3 * s, 4.6 * s, 1.8 * s)
  c.fillStyle = "#f4f2ea"; c.fillRect(cx - 4.7 * s, cy - 1.5 * s, 3.6 * s, 2 * s); c.fillRect(cx + 1.1 * s, cy - 1.5 * s, 3.6 * s, 2 * s)
  c.fillStyle = "#22221f"; c.fillRect(cx - 3.8 * s, cy - 1.3 * s, 1.7 * s, 1.7 * s); c.fillRect(cx + 2.1 * s, cy - 1.3 * s, 1.7 * s, 1.7 * s)
  c.fillStyle = SK.d; c.fillRect(cx - 1.8 * s, cy + 3.7 * s, 3.6 * s, 1.3 * s)
}

/* ══ KYLE PRIME ═════════════════════════════════════════════════════════
   The final boss, and the only portrait with its own dedicated helpers.

   Four earlier attempts failed for one reason: the eyes were in the SHOULDER,
   where the glass already has a flare and a highlight competing for attention,
   so they crowded and read as lumps. Giving the vial a proper NECK — narrow,
   tall, dark, nothing else in it — is what finally made them land. */
const K_ARM_D = "#1a1815", K_ARM_M = "#33302a", K_ARM_L = "#4e4a41", K_ARM_H = "#6b6559"

/** A real bicep has a PEAK, and a tricep sitting behind and outside it. Drawing
 *  the tricep first gives the correct depth order seen from the front; without
 *  that pairing the whole limb reads as one sausage. */
function kyleArm(c: CanvasRenderingContext2D, X: number, s: -1 | 1, pump: number) {
  c.fillStyle = K_ARM_D; el(c, X, 26, 8.6 + pump * 0.3, 7.4)
  c.fillStyle = K_ARM_M; el(c, X, 25.4, 6.6 + pump * 0.3, 5.6)
  c.fillStyle = K_ARM_L; el(c, X - s * 1.6, 23.6, 3.2, 2.6)
  c.fillStyle = K_ARM_D; po(c, [[X + s * 2, 30], [X + s * 8, 34], [X + s * 7, 44], [X + s * 1, 42]])
  c.fillStyle = "#2a2822"; po(c, [[X + s * 3, 31.5], [X + s * 7, 35], [X + s * 6, 43], [X + s * 2, 41]])
  c.fillStyle = K_ARM_D; po(c, [[X - s * 6, 31], [X - s * 2, 31], [X + s * (3 + pump), 37], [X + s * 1, 44], [X - s * 5, 43]])
  c.fillStyle = K_ARM_M; po(c, [[X - s * 5.4, 32.4], [X - s * 2.4, 32.4], [X + s * (2 + pump), 37], [X + s * 0.4, 42.6], [X - s * 4.4, 41.8]])
  c.fillStyle = K_ARM_L; po(c, [[X - s * 4.6, 33.6], [X - s * 3, 33.6], [X + s * 0.6, 37.2], [X - s * 1, 40.4], [X - s * 4, 40]])
  c.fillStyle = K_ARM_H; el(c, X - s * 2.6, 36, 1.8, 2.4)
  c.fillStyle = K_ARM_D; po(c, [[X - s * 4, 44], [X + s * 4, 44], [X + s * 3.4, 48], [X - s * 3.4, 48]])
  c.fillStyle = K_ARM_M; po(c, [[X - s * 3, 45], [X + s * 3, 45], [X + s * 2.6, 47.4], [X - s * 2.6, 47.4]])
  c.fillStyle = K_ARM_D; po(c, [[X - s * 4, 48], [X + s * 4.4, 48], [X + s * 3, 57], [X - s * 2.6, 57]])
  c.fillStyle = K_ARM_M; po(c, [[X - s * 3.2, 49], [X + s * 3.4, 49], [X + s * 2.2, 56], [X - s * 2, 56]])
  c.fillStyle = K_ARM_L; po(c, [[X - s * 2.6, 49.8], [X - s * 0.6, 49.8], [X - s * 0.4, 54], [X - s * 1.8, 54.6]])
  c.fillStyle = K_ARM_D; el(c, X + s * 0.4, 59.5, 5.6, 4.4)
  c.fillStyle = K_ARM_M; el(c, X + s * 0.4, 59, 4, 3.2)
}

export const PORTRAITS: Record<string, Draw> = {
  chud(c, t, m) {
    const b = bob(t, m, 620, 1.1)
    c.save(); c.translate(0, -b)
    c.fillStyle = "#c9a98c"; el(c, C, 55, 19, 11)
    c.fillStyle = "#d9b894"; el(c, C, 53.5, 17.5, 9.6)
    c.fillStyle = "#b8967a"; el(c, C, 48.5, 16.5, 4.2)
    c.fillStyle = "#3a3f52"; rr(c, 10, 39, 44, 11, 4)
    c.fillStyle = "#2e3446"; po(c, [[10, 48], [54, 48], [51, 51], [13, 51]])
    c.fillStyle = "#5a4436"; el(c, C, 58, 1.2, 1.6)
    c.fillStyle = "rgba(90,68,54,.5)"; for (let i = 0; i < 5; i++) el(c, C, 50 + i * 2, 1, 1.4)
    cap(c, 13, 42, 8, 55, 6.4, "#b8967a"); cap(c, 51, 42, 56, 55, 6.4, "#b8967a")
    c.fillStyle = "#a8866a"; el(c, 7.5, 56, 3.4, 3); el(c, 56.5, 56, 3.4, 3)
    c.fillStyle = "#d9b894"; el(c, C, 27, 15.5, 14.5)
    c.fillStyle = "#c9a98c"; el(c, C, 37, 12.5, 6.8)
    c.fillStyle = "#3a2c1e"                                            // neckbeard, no moustache
    c.beginPath(); c.ellipse(C, 35.5, 12.5, 8, 0, 0, Math.PI); c.fill()
    c.fillRect(C - 9.5, 34, 19, 6.9)
    c.fillStyle = "rgba(0,0,0,.2)"
    for (let i = 0; i < 8; i++) el(c, C - 8.75 + i * 2.5, 39.5 + (i % 2 ? 1 : 0), 1.1, 2)
    c.fillStyle = "#c9a98c"; el(c, C, 25, 14.5, 10.5)
    c.fillStyle = "#e2c4a2"; el(c, 26, 20, 5, 3.4)
    eyes(c, 22.5, 6.4, 6, 6, { blink: blinkAt(t, 3400) })
    c.lineWidth = 1.8; c.strokeStyle = "#232326"                       // glasses
    c.beginPath(); c.arc(C - 6.7, 25, 6.2, 0, 7); c.stroke()
    c.beginPath(); c.arc(C + 6.7, 25, 6.2, 0, 7); c.stroke()
    c.fillStyle = "#232326"; c.fillRect(C - 1.8, 24.2, 3.6, 1.5)
    c.fillStyle = "rgba(210,232,255,.3)"
    po(c, [[C - 10.4, 22], [C - 4.4, 20.6], [C - 6, 26], [C - 10.8, 25.4]])
    po(c, [[C + 3, 22], [C + 9, 20.6], [C + 7.4, 26], [C + 2.6, 25.4]])
    c.fillStyle = "#6b4a3a"; c.fillRect(28, 32.5, 8, 1.8)
    c.fillStyle = "#3b2f24"; el(c, C, 15, 22, 4.4)                     // fedora
    c.fillStyle = "#4a3b2c"; po(c, [[20, 15], [44, 15], [41, 3], [23, 3]])
    c.fillStyle = "#54432f"; po(c, [[22, 14], [31, 14], [29, 4], [24, 4]])
    c.fillStyle = "#2e2418"; c.fillRect(20, 11.5, 24, 3.4)
    c.restore()
  },

  will(c, t, m, held) {
    const b = bob(t, m, 700, 1.5)
    c.save(); c.translate(0, -b)
    arms(c, "down", 40, 13, "#5e5e57", m === "thinking" ? Math.sin(t / 220) * 1.5 * easeIn(held) : 0)
    c.fillStyle = "#adada2"; rr(c, 19, 10, 26, 44, 13)
    c.save(); c.beginPath(); c.rect(19, 32, 26, 22); c.clip()
    c.fillStyle = "#7a7a72"; rr(c, 19, 10, 26, 44, 13); c.restore()
    c.fillStyle = "#5e5e57"; c.fillRect(19, 31, 26, 2.6)
    c.fillStyle = "rgba(255,255,255,.5)"; rr(c, 22.5, 14, 3.6, 11, 1.8)
    eyes(c, 20, 6.4, 6.2, 6.2, { sclera: null, pupil: INK, blink: blinkAt(t, 4200) })
    c.fillStyle = "#5e5e57"; c.fillRect(26.5, 27.5, 11, 2)
    c.restore()
  },

  blu(c, t, m, held) {
    const b = bob(t, m, 560, 1.6)
    const p = m === "thinking"
      ? Math.abs(Math.sin(t / 180)) * 3 * easeIn(held)
      : Math.abs(Math.sin(t / 700)) * 1.2
    c.save(); c.translate(0, -b)
    mir((s) => {
      cap(c, C + s * 13, 36, C + s * 20, 31 - p, 4.6, "#1a4a6e")
      cap(c, C + s * 20, 31 - p, C + s * 17, 22 - p, 4.6, "#1a4a6e")
      c.fillStyle = "#1a4a6e"; el(c, C + s * 19, 30 - p, 2.6, 2.3)
      c.beginPath(); c.arc(C + s * 17, 20 - p, 3.4, 0, 7); c.fill()
    })
    c.fillStyle = "#8a8a80"; rr(c, 23, 11, 18, 6, 1.8)
    c.fillStyle = "#c8c8be"; c.fillRect(23, 12.8, 18, 2.2)
    c.fillStyle = "#0d2b42"; rr(c, 19, 17, 26, 33, 4.5)
    c.fillStyle = "#1f7fa8"; rr(c, 20.8, 18.8, 22.4, 29.4, 3.2)
    c.fillStyle = "#3fc8e0"; rr(c, 20.8, 30, 22.4, 18.2, 3.2)
    c.fillStyle = "#7fe6f4"; c.fillRect(20.8, 30, 22.4, 2)
    c.fillStyle = "rgba(255,255,255,.45)"; c.fillRect(22.6, 20, 3, 26)
    eyes(c, 24, 6, 5.8, 5.8, { sclera: null, pupil: INK, blink: blinkAt(t, 3800) })
    c.fillStyle = "#0c3d56"; c.beginPath(); c.arc(C, 32, 5, 0.15, Math.PI - 0.15); c.fill()
    c.restore()
  },

  notes(c, t, m, held) {
    const b = bob(t, m, 640, 1.4)
    c.save(); c.translate(0, -b)
    arms(c, "out", 42, 22, "#c9a83c", m === "thinking" ? Math.sin(t / 200) * 3 * easeIn(held) : 0)
    c.fillStyle = "#e8e6df"; rr(c, 10, 9, 44, 46, 8)
    c.fillStyle = "#f2c744"; rr(c, 10, 9, 44, 13, 8); c.fillRect(10, 18, 44, 4)
    c.fillStyle = "#d9ae2e"; c.fillRect(10, 20.6, 44, 1.6)
    c.fillStyle = "#d4d1c6"; for (let i = 0; i < 5; i++) c.fillRect(16, 38 + i * 3.6, 32, 1.8)
    eyes(c, 27, 7.2, 7.2, 7.2, { sclera: "#fff", pupil: "#4a4436", blink: blinkAt(t, 3000) })
    c.fillStyle = "#8f8b7c"; po(c, [[27, 35], [37, 35], [35, 37], [29, 37]])
    c.restore()
  },

  scoops(c, t, m, held) {
    const b = bob(t, m, 580, 1.5)
    const w = m === "thinking" ? Math.sin(t / 240) * 2.2 * easeIn(held) : 0
    c.save(); c.translate(w, -b)
    arms(c, "out", 42, 23, "#2f7d70", m === "thinking" ? Math.sin(t / 210) * 3.5 : 0)
    c.fillStyle = "#2f7d70"; po(c, [[6, 26], [58, 26], [55, 59], [9, 59]])
    c.fillStyle = "#4fb3a6"; po(c, [[8, 28], [56, 28], [53.4, 57], [10.6, 57]])
    c.fillStyle = "#66c9bc"; po(c, [[8, 28], [20, 28], [19, 57], [10.6, 57]])
    c.fillStyle = "#3f9a8c"; rr(c, 5, 37, 6, 13, 3); rr(c, 53, 37, 6, 13, 3)
    c.fillStyle = "#e8f2ef"; c.fillRect(12, 39, 40, 13)
    c.fillStyle = "#c9ddd8"; c.fillRect(12, 39, 40, 2.2)
    c.fillStyle = "#2f7d70"; c.fillRect(16, 44, 20, 1.6); c.fillRect(16, 47, 14, 1.4)
    c.fillStyle = "#f4f4ee"; rr(c, 3, 14, 58, 13, 3)
    c.fillStyle = "#e2e2da"; for (let i = 0; i < 13; i++) c.fillRect(5 + i * 4.4, 15, 1.6, 9)
    c.fillStyle = "#dcdcd4"; c.fillRect(3, 24, 58, 3)
    eyes(c, 31, 9.4, 8.6, 8.6, { sclera: "#fff", pupil: "#173a34", blink: blinkAt(t, 2600) })
    c.fillStyle = "#173a34"; c.beginPath(); c.arc(C, 35.5, 5.8, 0.1, Math.PI - 0.1); c.fill()
    c.restore()
  },

  recon(c, t, m, held) {
    const b = bob(t, m, 720, 1.2)
    c.save(); c.translate(0, -b)
    arms(c, "down", 44, 16, "#2a2a26")
    c.fillStyle = "#151513"; rr(c, 15, 9, 34, 46, 6)
    c.fillStyle = "#262622"; rr(c, 16.8, 10.8, 30.4, 42.4, 4.5)
    /* Fills toward full for as long as he is actually thinking, with a small
       flicker on top so it does not look like a progress bar lying to you. It
       settles rather than sweeping, so however long the search takes, the bar
       is somewhere sensible when the move lands. */
    const fill = m === "thinking"
      ? Math.min(0.97, settle(held, 520) * (0.94 + Math.sin(t / 90) * 0.03))
      : 1
    c.fillStyle = "#3d3325"; rr(c, 19, 14, 26, 3.6, 1.8)
    c.fillStyle = "#c8861a"; rr(c, 19, 14, Math.max(0.2, 26 * fill), 3.6, 1.8)
    c.fillStyle = "rgba(200,134,26,.3)"; rr(c, 19, 12.6, Math.max(0.2, 26 * fill), 6.4, 3)
    c.fillStyle = "#0d0d0b"; rr(c, 19, 20.5, 26, 13, 2.4)
    eyes(c, 25, 6, 6.8, 6, { sclera: null, pupil: "#f0c674", glow: "#f0c674", blink: blinkAt(t, 4600) })
    c.fillStyle = "#0f0f0d"
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) rr(c, 19.5 + k * 9, 36.5 + r * 5.5, 7.4, 4.4, 1.5)
    c.fillStyle = "#c8861a"; rr(c, 37.5, 47.5, 7.4, 4.4, 1.5)
    c.restore()
  },

  cal(c, t, m, held) {
    const b = bob(t, m, 760, 1.4)
    c.save(); c.translate(0, -b)
    arms(c, "folded", 42, 17, "#c2c0b6")
    c.fillStyle = "#6b4a2a"; c.fillRect(30.5, 6, 3.4, 9)
    c.fillStyle = "#4c9a2a"; po(c, [[34, 12], [47, 4], [44, 14], [35, 16]])
    c.fillStyle = "#f6f5f0"; el(c, 24, 36, 14, 17); el(c, 40, 36, 14, 17); c.fillRect(24, 19, 16, 34)
    c.fillStyle = "#e6e4da"; el(c, C, 46, 16, 8)
    c.fillStyle = "rgba(255,255,255,.8)"; el(c, 23, 27, 5, 6)
    const pulse = m === "thinking" ? 1 - easeIn(held) * (0.5 - Math.abs(Math.sin(t / 300)) * 0.5) : 1
    c.globalAlpha = pulse
    eyes(c, 30, 7.2, 7.6, 3.2, { sclera: null, pupil: "#5fd6e8", glow: "#5fd6e8" })
    c.globalAlpha = 1
    c.fillStyle = "#a8a69c"; c.fillRect(28.5, 39, 7, 1.6)
    c.restore()
  },

  ester(c, t, m, held) {
    // Never bobs. The stillness is the character; only the glow moves.
    /* Ester brightens steadily the longer she thinks. Nothing oscillates —
       that is the character. */
    const glow = m === "thinking" ? 0.6 + settle(held, 900) * 0.4
      : m === "gloat" ? 1 : 0.7 + Math.sin(t / 900) * 0.15
    c.fillStyle = "#2a2a26"; rr(c, 22, 5, 20, 6, 1.8)
    c.fillStyle = "#4e4e48"; c.fillRect(22, 6.6, 20, 2)
    c.fillStyle = "#3a3a34"; for (let i = 0; i < 9; i++) c.fillRect(23 + i * 2.2, 5, 1, 6)
    c.fillStyle = "#14120f"; c.fillRect(25, 11, 14, 3.2)
    c.fillStyle = "#0d0d0b"; po(c, [[19, 14], [45, 14], [48, 22], [47, 58], [17, 58], [16, 22]])
    c.fillStyle = "#1c1a16"; po(c, [[20.8, 15.8], [43.2, 15.8], [46, 22.6], [45, 56.2], [19, 56.2], [18, 22.6]])
    c.fillStyle = "#241505"; po(c, [[18.4, 29], [45.6, 29], [45, 56.2], [19, 56.2]])
    c.fillStyle = "#3a2008"; c.fillRect(18.4, 29, 27.2, 1.8)
    c.fillStyle = "rgba(255,150,90,.16)"; c.fillRect(21.4, 17, 3.2, 38)
    c.fillStyle = "#0a0a09"; c.fillRect(17, 58, 30, 4)
    c.globalAlpha = glow
    c.fillStyle = "rgba(255,58,30,.16)"; el(c, C, 22, 18, 11)
    eyes(c, 21, 7.2, 7, 5, { sclera: null, pupil: "#ff3a1e", glow: "#ff3a1e", brow: 6 })
    c.globalAlpha = 1
  },

  spike(c, t, m, held) {
    const b = bob(t, m, 840, 1.1)
    c.save(); c.translate(0, -b)
    arms(c, "folded", 42, 12, "#2a3a48")
    /* The dial turns TOWARD a position and holds, rather than oscillating. */
    const dial = m === "thinking" ? settle(held, 420) * 1.5 : 0
    c.save(); c.translate(C, 9); c.rotate(dial * 0.12); c.translate(-C, -9)
    c.fillStyle = "#d8dee6"; rr(c, 24, 3, 16, 11, 3)
    c.fillStyle = "#9aa6b4"; for (let i = 0; i < 6; i++) c.fillRect(25, 4.4 + i * 1.6, 14, 1)
    c.restore()
    c.fillStyle = "#1e2a36"; rr(c, 25, 14, 14, 4.4, 1.5)
    c.fillStyle = "#e8edf3"; rr(c, 23, 18.4, 18, 33, 3.5)
    c.fillStyle = "#c3ccd6"; c.fillRect(23, 18.4, 4.6, 33)
    c.fillStyle = "#5a97c8"; rr(c, 26.5, 36, 11, 11, 2)
    c.fillStyle = "#9fd4ff"; c.fillRect(26.5, 36, 11, 1.8)
    c.fillStyle = "#4e4e48"; rr(c, 27, 51.4, 10, 3.8, 1.5)
    c.fillStyle = "#c8c8be"; c.fillRect(30.9, 55, 2.2, 8)
    eyes(c, 25, 6, 6.8, 7, { sclera: "#f4f8fc", pupil: "#1a2833", lid: 3, blink: blinkAt(t, 5200) })
    c.fillStyle = "#8fa0b0"; c.fillRect(29, 33.5, 6, 1.4)
    c.restore()
  },

  chad(c, t, m, held) {
    const b = bob(t, m, 900, 0.7)
    const p = m === "thinking" ? Math.abs(Math.sin(t / 260)) * 2 * easeIn(held) : 0
    c.save(); c.translate(0, -b)
    c.fillStyle = SK.mid; el(c, 8 - p, 40, 8, 6.8); el(c, 56 + p, 40, 8, 6.8)
    cap(c, 7 - p, 42, 3 - p, 61, 9, SK.mid); cap(c, 57 + p, 42, 61 + p, 61, 9, SK.mid)
    c.fillStyle = SK.lit; el(c, 5 - p, 48, 5.4, 6.2); el(c, 59 + p, 48, 5.4, 6.2)
    c.fillStyle = SK.d; el(c, 3.5 - p, 59, 4.2, 4); el(c, 60.5 + p, 59, 4.2, 4)
    const top = 38, halfTop = 23, halfWaist = 11.5, bottom = 62, pecH = 9
    c.fillStyle = SK.d; po(c, [[C - halfTop - 3, top - 1.5], [C + halfTop + 3, top - 1.5], [C + halfWaist + 2, bottom], [C - halfWaist - 2, bottom]])
    c.fillStyle = SK.mid; po(c, [[C - halfTop, top], [C + halfTop, top], [C + halfWaist, bottom - 1.5], [C - halfWaist, bottom - 1.5]])
    c.fillStyle = SK.lit
    po(c, [[C - halfTop + 3, top + 1.5], [C - 1.2, top + 1.5], [C - 1.2, top + pecH], [C - halfTop + 5, top + pecH + 1.5]])
    po(c, [[C + halfTop - 3, top + 1.5], [C + 1.2, top + 1.5], [C + 1.2, top + pecH], [C + halfTop - 5, top + pecH + 1.5]])
    c.fillStyle = SK.top
    po(c, [[C - halfTop + 5, top + 2.6], [C - 2.6, top + 2.6], [C - 2.6, top + pecH - 2.8], [C - halfTop + 6.6, top + pecH - 1.8]])
    po(c, [[C + halfTop - 5, top + 2.6], [C + 2.6, top + 2.6], [C + 2.6, top + pecH - 2.8], [C + halfTop - 6.6, top + pecH - 1.8]])
    c.fillStyle = SK.sh; c.fillRect(C - halfTop + 5, top + pecH + 0.8, halfTop - 6.2, 1.8)
    c.fillRect(C + 1.2, top + pecH + 0.8, halfTop - 6.2, 1.8)
    c.fillStyle = SK.d; c.fillRect(C - 1.2, top + 1.5, 2.4, pecH)
    const absTop = top + pecH + 4
    for (let r = 0; r < 4; r++) {
      c.fillStyle = SK.sh; c.fillRect(C - 7, absTop + r * 3.6, 5.8, 1.8); c.fillRect(C + 1.2, absTop + r * 3.6, 5.8, 1.8)
      c.fillStyle = SK.top; c.fillRect(C - 6.8, absTop + r * 3.6 + 1.8, 5.4, 1.1); c.fillRect(C + 1.4, absTop + r * 3.6 + 1.8, 5.4, 1.1)
    }
    c.fillStyle = SK.sh; c.fillRect(C - 0.8, absTop - 1.4, 1.6, 16)
    c.fillStyle = SK.d; po(c, [[15, 33], [49, 33], [45, 38], [19, 38]])
    c.fillStyle = SK.mid; po(c, [[26, 23], [38, 23], [40, 35], [24, 35]])
    c.fillStyle = SK.lit; c.fillRect(28, 26, 8, 9)
    chadHead(c, C, 15, 1.55)
    c.restore()
  },

  /**
   * KYLE PRIME. Everything here is mirrored; nothing is placed per-side.
   *
   * The animation is the boss fight: he breathes slowly at idle, the liquid
   * churns constantly, vapour rises off the cap, and when he is thinking the
   * whole vessel lights from within while his arms pump. On a win the glow goes
   * to full and he surges. He is the only portrait that emits light.
   */
  prime(c, t, m, held) {
    const breathe = Math.sin(t / 900) * 1.1
    const pump = m === "thinking" ? Math.abs(Math.sin(t / 240)) * 2.2 * easeIn(held, 340)
      : m === "gloat" ? Math.abs(Math.sin(t / 130)) * 3 : 0
    /* Kyle heats UP the longer he takes over you, and does not cool between
       frames. The longer the search, the brighter he gets. */
    const heat = m === "thinking" ? 0.45 + settle(held, 1100) * 0.55
      : m === "gloat" ? 1 : 0.45 + Math.sin(t / 1100) * 0.12
    const surge = m === "gloat" ? -Math.abs(Math.sin(t / 130)) * 3 : -breathe

    c.save(); c.translate(0, surge)

    /* A soft radial falloff rather than a flat amber disc. The flat version read
       as a yellow card behind him; a gradient reads as light coming off him. */
    const halo = c.createRadialGradient(C, 40, 4, C, 40, 30 + heat * 4)
    halo.addColorStop(0, `rgba(245,197,24,${0.06 + heat * 0.07})`)
    halo.addColorStop(0.55, `rgba(245,197,24,${0.03 + heat * 0.035})`)
    halo.addColorStop(1, "rgba(245,197,24,0)")
    c.fillStyle = halo
    el(c, C, 40, 30 + heat * 4, 32 + heat * 4)

    mir((s) => kyleArm(c, C + s * 22, s, pump))

    c.fillStyle = `rgba(255,230,170,${0.18 + heat * 0.2})`             // vapour, rising and looping
    for (let i = 0; i < 5; i++) {
      const ph = (t / 1400 + i * 0.2) % 1
      el(c, C - 5 + i * 2.6 + Math.sin(t / 500 + i) * 2, 4 - ph * 9, 1.5 - ph * 0.7, (1.5 - ph * 0.7) * 1.4)
    }
    c.fillStyle = "#7a7a72"; c.fillRect(26, 2, 12, 2.6)
    c.fillStyle = "#adada2"; c.fillRect(26, 4.6, 12, 2.6)
    c.fillStyle = "#7a7a72"; c.fillRect(26, 7.2, 12, 2.6)

    c.fillStyle = "#14140f"; c.fillRect(25, 10, 14, 13)                 // the neck void
    c.fillStyle = "#0a0a08"; c.fillRect(27, 11, 10, 12)
    c.fillStyle = "#3e3e38"; c.fillRect(27, 11, 1.6, 12)

    c.fillStyle = "#1a1a14"; po(c, [[25, 23], [39, 23], [47, 30], [43, 58], [21, 58], [17, 30]])
    c.fillStyle = "#0d0d0a"; po(c, [[27.5, 25], [36.5, 25], [43.5, 31.5], [40, 56], [24, 56], [20.5, 31.5]])
    c.fillStyle = "#33332c"; po(c, [[27.5, 25], [29.5, 25], [23, 31.5], [26, 56], [24, 56], [20.5, 31.5]])
    c.fillStyle = "#2a2a24"; po(c, [[34.5, 25], [36.5, 25], [43.5, 31.5], [40, 56], [38, 56], [41, 31.5]])

    /* Churn: the surface TILTS and the tilt reverses, so it reads as sloshing
       rather than as a bar that grew. */
    const tilt = Math.sin(t / 700) * 1.8
    c.fillStyle = "#c99a08"; po(c, [[21.5, 32 - tilt], [41.5, 32 + tilt], [40, 56], [24, 56]])
    c.fillStyle = "#f5c518"; po(c, [[21.8, 34 - tilt], [41.2, 34 + tilt], [40, 56], [24, 56]])
    c.fillStyle = "#ffe066"; po(c, [[21.5, 32 - tilt], [41.5, 32 + tilt], [41.2, 34.4 + tilt], [21.8, 34.4 - tilt]])
    c.fillStyle = "#d9a80c"                                              // the swirl under it
    po(c, [[25, 40 + tilt], [36, 38 + tilt], [34, 44 + tilt], [27, 45 + tilt]])
    for (let i = 0; i < 5; i++) {                                        // bubbles rising and looping
      const ph = ((t / 1800) + i * 0.21) % 1
      c.fillStyle = `rgba(255,243,184,${0.9 - ph * 0.6})`
      el(c, C - 7 + i * 3.4 + Math.sin(t / 400 + i * 2) * 1.4, 55 - ph * 20, 1.1 + ph * 0.5, 1.1 + ph * 0.5)
    }
    c.fillStyle = "#1a1a14"; c.fillRect(20, 58, 24, 3.5)
    c.fillStyle = "rgba(255,255,255,.24)"; c.fillRect(28.5, 12, 1.6, 10)
    c.fillStyle = "rgba(255,255,255,.14)"; c.fillRect(24, 32, 1.4, 22)

    c.globalAlpha = 0.55 + heat * 0.45
    c.fillStyle = "rgba(255,194,30,.42)"; mir((s) => el(c, C + s * 4.5, 16.5, 4.6 + heat, 4 + heat * 0.6))
    mir((s) => { c.fillStyle = "#ffc21e"; po(c, [[C + s * 7.5, 14], [C + s * 2, 16.5], [C + s * 2, 19], [C + s * 7.5, 17]]) })
    mir((s) => { c.fillStyle = "#fff4c0"; po(c, [[C + s * 7, 14.9], [C + s * 3.2, 16.7], [C + s * 3.2, 17.6], [C + s * 7, 16.1]]) })
    c.globalAlpha = 1
    c.restore()
  },
}
