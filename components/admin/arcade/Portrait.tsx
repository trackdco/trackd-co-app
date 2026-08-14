"use client"

import { useEffect, useRef } from "react"

import type { Bot } from "@/components/admin/arcade/pieces"
import { PORTRAIT_SIZE, PORTRAITS, type Mood } from "@/components/admin/arcade/portraits"

/**
 * An opponent's face, drawn on a canvas.
 *
 * The roster used to be a row of bare Elo numbers — Adrian's "where are all our
 * people gone, I can't see Will's pill" was exactly right: the characters were
 * defined, rendered nowhere, and the one place you fight them showed a number.
 *
 * ── WHY MOOD IS DRIVEN BY THE GAME, NOT A TIMER ─────────────────────────────
 * An earlier version cycled idle → thinking → gloat on a three-second loop,
 * which is fine for a preview and wrong in play: the opponent looked like it was
 * thinking while it was your move, and gloated at moments when nothing had
 * happened. The states now mean what they say:
 *
 *   idle      it is YOUR move
 *   thinking  the engine is actually searching, for exactly as long as it takes
 *   gloat     it won the GAME — not a piece
 *   beaten    you won
 *
 * Tying `thinking` to the real search is the whole point: Recon's amber bar
 * fills while he calculates and Kyle lights from within, so the wait reads as
 * deliberation rather than lag.
 */
/**
 * `size` is CSS PIXELS, not a multiplier.
 *
 * It used to take a `scale`, which meant a caller could write `scale={4}` into a
 * 96px box and get a 256px canvas cropped to one corner — which is exactly what
 * happened on the live page: the opponent's portrait showed the bottom-right
 * quarter of Recon and nothing else. Sizing in the same unit as the container
 * makes that class of mistake impossible to write.
 *
 * The backing store is still an integer multiple of 64 so the pixel art stays
 * crisp; the browser only ever scales it DOWN, never up.
 */
export function Portrait({
  bot,
  size = 64,
  mood = "idle",
}: {
  bot: Bot
  size?: number
  mood?: Mood
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const moodRef = useRef(mood)
  useEffect(() => { moodRef.current = mood })

  const zoom = Math.max(1, Math.ceil(size / PORTRAIT_SIZE))
  const backing = PORTRAIT_SIZE * zoom

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext("2d")
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    const draw = PORTRAITS[bot.id]
    if (!draw) return

    /* Draw at native 64 and blow up with nearest-neighbour, so the sprite keeps
       hard pixel edges instead of being smeared by the browser's filtering. */
    const src = document.createElement("canvas")
    src.width = src.height = PORTRAIT_SIZE
    const sctx = src.getContext("2d")
    if (!sctx) return

    const reduce = typeof matchMedia === "function"
      && matchMedia("(prefers-reduced-motion: reduce)").matches

    let raf = 0
    const frame = (t: number) => {
      sctx.clearRect(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE)
      draw(sctx, reduce ? 0 : t, moodRef.current)
      ctx.clearRect(0, 0, backing, backing)
      ctx.drawImage(src, 0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE, 0, 0, backing, backing)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [bot.id, backing])

  return (
    <canvas
      ref={ref}
      width={backing}
      height={backing}
      style={{ width: size, height: size }}
      aria-label={`${bot.name}, ${bot.elo} Elo`}
      className="block [image-rendering:pixelated]"
    />
  )
}
