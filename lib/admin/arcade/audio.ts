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

export const sfx = {
  /** A piece landing on a board — filtered noise, not a beep. */
  place: () => { noise(0.055, 0.05, 700); tone(320, 0.045, "triangle", 0.02, 240) },
  capture: () => { noise(0.13, 0.08, 520); tone(190, 0.1, "triangle", 0.035, 110) },
  castle: () => { noise(0.06, 0.05, 700); setTimeout(() => noise(0.06, 0.05, 700), 90) },
  check: () => { tone(880, 0.09, "square", 0.035); setTimeout(() => tone(1180, 0.11, "square", 0.035), 90) },
  promote: () => { [660, 880, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.14, "triangle", 0.045), i * 90)) },
  select: () => tone(760, 0.035, "square", 0.02),
  illegal: () => tone(150, 0.08, "square", 0.028),

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
  clear: () => { [700, 900, 1200].forEach((f, i) => setTimeout(() => tone(f, 0.08, "square", 0.035), i * 55)) },
  good: () => tone(760, 0.05, "sine", 0.025),
  bad: () => tone(170, 0.12, "sawtooth", 0.035, 110),
  die: () => { tone(300, 0.42, "sawtooth", 0.06, 60); noise(0.3, 0.04, 600) },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.2, "triangle", 0.05), i * 120)) },
  lose: () => { [400, 330, 260, 180].forEach((f, i) => setTimeout(() => tone(f, 0.24, "sawtooth", 0.045), i * 140)) },
  start: () => { tone(520, 0.07, "square", 0.035); setTimeout(() => tone(820, 0.1, "square", 0.035), 70) },
}
