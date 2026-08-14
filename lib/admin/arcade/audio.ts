/**
 * Arcade sound, generated live.
 *
 * No audio files anywhere: nothing extra to load, nothing to 404, and nothing
 * a CSP can block. Every sound is an oscillator or a short noise buffer.
 *
 * The context is created lazily and resumed on the first gesture, because
 * browsers refuse to start audio before a user has touched the page.
 */

let ctx: AudioContext | null = null
let muted = false

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!C) return null
    ctx = new C()
  }
  if (ctx.state === "suspended") void ctx.resume()
  return ctx
}

/** Call from a pointer/key handler so the browser lets the context start. */
export function wakeAudio() { ac() }

export function setMuted(next: boolean) { muted = next }
export function isMuted() { return muted }

function tone(freq: number, dur: number, type: OscillatorType = "square", vol = 0.05, slideTo: number | null = null) {
  if (muted) return
  const c = ac(); if (!c) return
  const o = c.createOscillator(), g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, c.currentTime)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), c.currentTime + dur)
  g.gain.setValueAtTime(vol, c.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur)
  o.connect(g); g.connect(c.destination)
  o.start(); o.stop(c.currentTime + dur + 0.02)
}

function noise(dur = 0.12, vol = 0.05, cutoff = 900) {
  if (muted) return
  const c = ac(); if (!c) return
  const n = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, n, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2)
  const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter()
  f.type = "lowpass"; f.frequency.value = cutoff
  s.buffer = buf; g.gain.value = vol
  s.connect(f); f.connect(g); g.connect(c.destination)
  s.start()
}

/**
 * A wooden knock — the sound a chess piece actually makes.
 *
 * A beep is the wrong model for this. A piece hitting a board is a broadband
 * transient with a short woody ring: noise decaying very fast (the `^6` envelope)
 * through a high-Q bandpass gives the attack, and a sine at the same frequency
 * underneath gives the body. Changing `freq` alone is enough to make a pawn and
 * a queen sound like different-sized pieces.
 */
function knock(freq: number, dur: number, vol: number, q = 5, bright = 3000) {
  if (muted) return
  const c = ac(); if (!c) return
  const n = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, n, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 6)
  const s = c.createBufferSource(), bp = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = c.createGain()
  bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q
  lp.type = "lowpass"; lp.frequency.value = bright
  s.buffer = buf
  g.gain.setValueAtTime(vol, c.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur)
  s.connect(bp); bp.connect(lp); lp.connect(g); g.connect(c.destination)
  s.start()
  const o = c.createOscillator(), og = c.createGain()
  o.type = "sine"
  o.frequency.setValueAtTime(freq * 0.85, c.currentTime)
  og.gain.setValueAtTime(vol * 0.55, c.currentTime)
  og.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur * 0.8)
  o.connect(og); og.connect(c.destination)
  o.start(); o.stop(c.currentTime + dur + 0.02)
}

export const sfx = {
  /** A piece set down. Heavier pieces knock lower — `weight` is 0 (pawn) to 1 (king). */
  place: (weight = 0.3) => knock(300 - weight * 130, 0.08, 0.075, 5, 3400),
  /**
   * A capture is TWO events, because that is what it is: the captured piece
   * scraped off the square, then the capturing piece set down hard.
   */
  capture: (weight = 0.5) => {
    noise(0.05, 0.045, 1800)
    knock(210 - weight * 70, 0.12, 0.095, 4, 2400)
    setTimeout(() => knock(150, 0.07, 0.04, 3, 1400), 55)
  },
  /** King then rook — two knocks, different sizes, in the order you'd hear them. */
  castle: () => { knock(190, 0.08, 0.07, 5, 2800); setTimeout(() => knock(265, 0.07, 0.06, 5, 3200), 105) },
  check: () => { knock(240, 0.07, 0.06); setTimeout(() => tone(1046, 0.1, "square", 0.04), 60); setTimeout(() => tone(1396, 0.13, "square", 0.04), 150) },
  promote: () => { knock(200, 0.09, 0.07); [660, 880, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.14, "triangle", 0.045), 80 + i * 90)) },
  select: () => knock(620, 0.035, 0.03, 7, 5000),
  illegal: () => knock(110, 0.11, 0.05, 2, 700),

  jump: () => tone(430, 0.13, "square", 0.045, 780),
  land: () => tone(180, 0.06, "sine", 0.03),
  point: () => tone(1180, 0.045, "square", 0.022),
  drop: () => tone(300, 0.07, "square", 0.04),
  slice: () => { tone(820, 0.06, "square", 0.035); noise(0.07, 0.02) },
  /** Rising with the chain — the pitch IS the reward. */
  perfect: (chain: number) => {
    const f = 520 * Math.pow(1.0595, Math.min(chain, 24))
    tone(f, 0.09, "square", 0.045)
    setTimeout(() => tone(f * 1.5, 0.11, "square", 0.035), 60)
  },
  merge: (n: number) => tone(300 + Math.min(n, 11) * 70, 0.07, "square", 0.035),
  /**
   * A line clear, ascending with the run.
   *
   * Two independent axes, because two different things are worth rewarding:
   * `lines` (how much you cleared in one drop) makes the arpeggio longer and
   * wider, and `combo` (how many drops in a row have cleared something)
   * transposes the whole figure up a semitone at a time. A chain of six
   * therefore climbs a fifth over its length, and you hear the run building
   * before you see the score.
   */
  clear: (lines = 1, combo = 0) => {
    const base = 620 * Math.pow(2, Math.min(combo, 14) / 12)
    const shape = lines >= 4 ? [0, 4, 7, 12, 16] : lines === 3 ? [0, 4, 7, 12] : lines === 2 ? [0, 4, 9] : [0, 7]
    shape.forEach((semi, i) =>
      setTimeout(() => tone(base * Math.pow(2, semi / 12), 0.1, "square", 0.04), i * 52))
  },
  /** The chain breaking — a short fall, so you notice you dropped it. */
  comboBreak: () => { tone(430, 0.06, "triangle", 0.02, 300) },
  good: () => tone(760, 0.05, "sine", 0.025),
  bad: () => tone(170, 0.12, "sawtooth", 0.035, 110),
  die: () => { tone(300, 0.42, "sawtooth", 0.06, 60); noise(0.3, 0.04, 600) },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.2, "triangle", 0.05), i * 120)) },
  lose: () => { [400, 330, 260, 180].forEach((f, i) => setTimeout(() => tone(f, 0.24, "sawtooth", 0.045), i * 140)) },
  start: () => { tone(520, 0.07, "square", 0.035); setTimeout(() => tone(820, 0.1, "square", 0.035), 70) },
}
