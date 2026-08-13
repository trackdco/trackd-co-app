"use client"

import { useEffect, useRef } from "react"

import type { Bot } from "@/components/admin/arcade/pieces"
import { drawPixels } from "@/lib/admin/arcade/kyle"

/**
 * An opponent's face, drawn on a canvas.
 *
 * The roster used to be a row of bare Elo numbers — Adrian's "where are all our
 * people gone, I can't see Will's pill" was exactly right: the characters were
 * defined, rendered nowhere, and the one place you fight them showed a number.
 *
 * `mood` drives the idle: they bob gently, gloat when they beat you, and sag
 * when you beat them. `gauge` bots (The Gauge) animate their liquid level,
 * because a syringe that never moves is just a tube.
 */
export function Portrait({
  bot,
  scale = 3,
  mood = "idle",
}: {
  bot: Bot
  scale?: number
  mood?: "idle" | "gloat" | "beaten"
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const moodRef = useRef(mood)
  useEffect(() => { moodRef.current = mood })

  const w = (bot.rows[0]?.length ?? 16) * scale
  const h = (bot.rows.length + 2) * scale

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext("2d")
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    let raf = 0
    const frame = (t: number) => {
      ctx.clearRect(0, 0, w, h)
      const m = moodRef.current
      /**
       * The laugh is a BOUNCE PLUS A SQUASH, not just a bob.
       *
       * A character that only moves up and down reads as floating. Squashing on
       * the way down and stretching on the way up is what makes it read as
       * someone actually laughing at you — the same squash-and-stretch that
       * makes Kyle's jump work.
       */
      const laugh = Math.abs(Math.sin(t / 115))
      const bob =
        m === "gloat" ? Math.round(-laugh * 4)
        : m === "beaten" ? 3
        : Math.round(Math.sin(t / 460 + bot.elo) * 1.2)
      const rows = bot.gauge ? gaugeRows(bot, t) : bot.rows
      drawPixels(ctx, rows, bot.pal, scale, 0, (2 + bob) * scale, {
        sx: m === "gloat" ? 1 + laugh * 0.06 : m === "beaten" ? 1.1 : 1,
        sy: m === "gloat" ? 1 - laugh * 0.08 : m === "beaten" ? 0.9 : 1,
      })
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [bot, scale, w, h])

  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      style={{ width: w, height: h }}
      aria-label={`${bot.name}, ${bot.elo} Elo`}
      className="block [image-rendering:pixelated]"
    />
  )
}

/**
 * The Gauge's liquid rises and falls — it is a syringe being drawn up and
 * pushed out, which is the joke of the character.
 */
function gaugeRows(bot: Bot, t: number): readonly string[] {
  const level = (Math.sin(t / 900) + 1) / 2 // 0..1
  const liquidRows = bot.rows
    .map((r, i) => (r.includes("A") ? i : -1))
    .filter((i) => i >= 0)
  if (liquidRows.length === 0) return bot.rows
  const keep = Math.round(level * liquidRows.length)
  const drained = new Set(liquidRows.slice(0, liquidRows.length - keep))
  return bot.rows.map((r, i) => (drained.has(i) ? r.replace(/A/g, "b") : r))
}
