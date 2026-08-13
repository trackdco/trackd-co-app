"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { AMBER, GREY, LADDER, PIECES, PIECE_SIZE, type Bot } from "@/components/admin/arcade/pieces"
import { sfx, wakeAudio } from "@/lib/admin/arcade/audio"
import {
  applyMove,
  file,
  inCheck,
  kingSquare,
  legalMoves,
  newGame,
  outcome,
  pickMove,
  rank,
  sq,
  type Game,
  type Move,
} from "@/lib/admin/arcade/chess"
import { drawGrid, drawPixels } from "@/lib/admin/arcade/kyle"

/**
 * Chess against the ladder.
 *
 * THREE THINGS ADRIAN ASKED FOR, and why each is not just polish:
 *  - **Drag as well as tap.** Tap-tap is the only workable phone input, but on a
 *    desktop dragging is what a board feels like. Both are wired to the same
 *    move list, so neither can produce a move the other wouldn't.
 *  - **The bot pauses before replying.** An instant reply reads as a scripted
 *    response rather than an opponent. `MIN_THINK_MS` holds the move even when
 *    the search returns immediately, which at 250 Elo it always does.
 *  - **Sound on every move.** Filtered noise for a piece landing, a heavier one
 *    for a capture — a beep would sound like a UI, not like wood on a board.
 */

const BOARD_PX = 576
const CELL = BOARD_PX / 8            // 72px squares
const PIECE_SCALE = 3                // 24×24 sprite → 72px, edge to edge
const PIECE_OFF = (CELL - PIECE_SIZE * PIECE_SCALE) / 2
const MIN_THINK_MS = 600

type Status = { text: string; over: boolean; won?: boolean }

export function ChessGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [bot, setBot] = useState<Bot>(LADDER[0])
  const [status, setStatus] = useState<Status>({ text: "Your move", over: false })
  const [thinking, setThinking] = useState(false)
  /** Their parting shot when they beat you. Cleared on restart. */
  const [taunt, setTaunt] = useState<string | null>(null)

  // Everything the render loop reads lives in a ref: the loop runs at 60fps and
  // must not re-subscribe or re-render React on every frame.
  const g = useRef<Game>(newGame())
  const sel = useRef<number | null>(null)
  const targets = useRef<Move[]>([])
  const lastMove = useRef<Move | null>(null)
  const drag = useRef<{ from: number; x: number; y: number } | null>(null)
  const busy = useRef(false)
  /**
   * Amber confetti, drawn on the board canvas itself.
   *
   * On the canvas rather than in the DOM so it lands over the pieces without a
   * second stacking context, and so it dies with the render loop instead of
   * leaking a timer if the arcade closes mid-celebration.
   */
  const confetti = useRef<{ x: number; y: number; vx: number; vy: number; r: number; life: number; c: string }[]>([])
  const burstConfetti = useCallback(() => {
    const colours = ["#c8861a", "#e8ab45", "#f0c674", "#d79422", "#f0efe9"]
    for (let i = 0; i < 130; i++) {
      confetti.current.push({
        x: BOARD_PX / 2 + (Math.random() - 0.5) * 160,
        y: BOARD_PX / 2,
        vx: (Math.random() - 0.5) * 9,
        vy: -Math.random() * 11 - 3,
        r: 3 + Math.random() * 4,
        life: 90 + Math.random() * 60,
        c: colours[Math.floor(Math.random() * colours.length)],
      })
    }
  }, [])

  const reset = useCallback(() => {
    g.current = newGame()
    sel.current = null
    targets.current = []
    lastMove.current = null
    drag.current = null
    busy.current = false
    confetti.current = []
    setThinking(false)
    setTaunt(null)
    setStatus({ text: "Your move", over: false })
  }, [])

  const settle = useCallback(
    (justMoved: "you" | "bot") => {
      const res = outcome(g.current)
      if (res) {
        if (res.kind === "checkmate") {
          const won = res.winner === "w"
          setStatus({ text: won ? `Checkmate — ${bot.name} is beaten` : "Checkmate — you lose", over: true, won })
          if (won) { sfx.win(); burstConfetti() } else { sfx.lose(); setTaunt(bot.taunt) }
        } else if (res.kind === "stalemate") {
          setStatus({ text: "Stalemate — no legal moves, no check", over: true })
          sfx.lose()
        } else {
          setStatus({ text: "Draw — fifty-move rule", over: true })
          sfx.lose()
        }
        return true
      }
      if (inCheck(g.current, g.current.turn)) sfx.check()
      setStatus({
        text: justMoved === "you" ? `${bot.name} is thinking` : inCheck(g.current, "w") ? "You're in check" : "Your move",
        over: false,
      })
      return false
    },
    [bot, burstConfetti]
  )

  const playBot = useCallback(() => {
    setThinking(true)
    const startedAt = performance.now()
    // Yield first so the board repaints with your move before the search blocks
    // the thread, then hold the reply for a beat regardless of how fast it was.
    setTimeout(() => {
      const m = pickMove(g.current, { depth: bot.depth, blunder: bot.blunder })
      const elapsed = performance.now() - startedAt
      const wait = Math.max(0, MIN_THINK_MS - elapsed)
      setTimeout(() => {
        if (!m) { setThinking(false); settle("bot"); return }
        const capture = Boolean(g.current.board[m.to]) || m.ep
        g.current = applyMove(g.current, m)
        lastMove.current = m
        if (m.castle) sfx.castle()
        else if (m.promo) sfx.promote()
        else if (capture) sfx.capture()
        else sfx.place()
        setThinking(false)
        busy.current = false
        settle("bot")
      }, wait)
    }, 30)
  }, [bot, settle])

  const commit = useCallback(
    (m: Move) => {
      const capture = Boolean(g.current.board[m.to]) || m.ep
      g.current = applyMove(g.current, m)
      lastMove.current = m
      sel.current = null
      targets.current = []
      if (m.castle) sfx.castle()
      else if (m.promo) sfx.promote()
      else if (capture) sfx.capture()
      else sfx.place()
      busy.current = true
      if (!settle("you")) playBot()
      else busy.current = false
    },
    [playBot, settle]
  )

  const select = useCallback((i: number) => {
    const p = g.current.board[i]
    if (!p || p.c !== "w") return false
    sel.current = i
    targets.current = legalMoves(g.current).filter((m) => m.from === i)
    if (targets.current.length === 0) sfx.illegal()
    else sfx.select()
    return true
  }, [])

  /* ── Input: tap and drag, both feeding the same move list ─────────────── */
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return

    const squareAt = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      const f = Math.floor(((e.clientX - r.left) / r.width) * 8)
      const rr = Math.floor(((e.clientY - r.top) / r.height) * 8)
      if (f < 0 || f > 7 || rr < 0 || rr > 7) return null
      return sq(f, rr)
    }
    const localXY = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      return {
        x: ((e.clientX - r.left) / r.width) * BOARD_PX,
        y: ((e.clientY - r.top) / r.height) * BOARD_PX,
      }
    }

    const down = (e: PointerEvent) => {
      e.preventDefault()
      wakeAudio()
      if (status.over || busy.current || g.current.turn !== "w") return
      const i = squareAt(e)
      if (i === null) return

      // Tapping a highlighted target completes a tap-tap move.
      if (sel.current !== null) {
        const m = targets.current.find((t) => t.to === i)
        if (m) { commit(m); return }
      }
      if (select(i)) {
        const { x, y } = localXY(e)
        drag.current = { from: i, x, y }
        cv.setPointerCapture(e.pointerId)
      } else {
        sel.current = null
        targets.current = []
      }
    }

    const move = (e: PointerEvent) => {
      if (!drag.current) return
      const { x, y } = localXY(e)
      drag.current = { ...drag.current, x, y }
    }

    const up = (e: PointerEvent) => {
      if (!drag.current) return
      const from = drag.current.from
      const to = squareAt(e)
      drag.current = null
      if (cv.hasPointerCapture(e.pointerId)) cv.releasePointerCapture(e.pointerId)
      if (to === null || to === from) return // a click, not a drag — keep it selected
      const m = targets.current.find((t) => t.to === to)
      if (m) commit(m)
      else sfx.illegal()
    }

    cv.addEventListener("pointerdown", down)
    cv.addEventListener("pointermove", move)
    cv.addEventListener("pointerup", up)
    cv.addEventListener("pointercancel", up)
    return () => {
      cv.removeEventListener("pointerdown", down)
      cv.removeEventListener("pointermove", move)
      cv.removeEventListener("pointerup", up)
      cv.removeEventListener("pointercancel", up)
    }
  }, [commit, select, status.over])

  /* ── Render loop ──────────────────────────────────────────────────────── */
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext("2d")
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    let raf = 0

    const frame = () => {
      const game = g.current
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const i = sq(f, r)
          ctx.fillStyle = (f + r) % 2 ? "#1c1c1a" : "#26261f"
          ctx.fillRect(f * CELL, r * CELL, CELL, CELL)
          if (lastMove.current && (i === lastMove.current.from || i === lastMove.current.to)) {
            ctx.fillStyle = "rgba(200,134,26,.15)"
            ctx.fillRect(f * CELL, r * CELL, CELL, CELL)
          }
        }
      }
      drawGrid(ctx, BOARD_PX, BOARD_PX, CELL)

      if (sel.current !== null) {
        ctx.fillStyle = "rgba(200,134,26,.26)"
        ctx.fillRect(file(sel.current) * CELL, rank(sel.current) * CELL, CELL, CELL)
      }
      for (const t of targets.current) {
        const f = file(t.to), r = rank(t.to)
        if (game.board[t.to] || t.ep) {
          ctx.strokeStyle = "rgba(200,134,26,.8)"
          ctx.lineWidth = 3
          ctx.strokeRect(f * CELL + 3, r * CELL + 3, CELL - 6, CELL - 6)
        } else {
          ctx.fillStyle = "rgba(240,239,233,.2)"
          ctx.beginPath()
          ctx.arc(f * CELL + CELL / 2, r * CELL + CELL / 2, 7, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      const ck = inCheck(game, game.turn) ? kingSquare(game, game.turn) : -1
      if (ck >= 0) {
        ctx.fillStyle = "rgba(239,68,68,.3)"
        ctx.fillRect(file(ck) * CELL, rank(ck) * CELL, CELL, CELL)
      }

      for (let i = 0; i < 64; i++) {
        const p = game.board[i]
        if (!p) continue
        // The dragged piece is drawn last, under the cursor.
        if (drag.current && drag.current.from === i) continue
        drawPixels(ctx, PIECES[p.t], p.c === "w" ? AMBER : GREY, PIECE_SCALE,
          file(i) * CELL + PIECE_OFF, rank(i) * CELL + PIECE_OFF)
      }
      if (confetti.current.length > 0) {
        for (const c of confetti.current) {
          c.vy += 0.28
          c.x += c.vx
          c.y += c.vy
          c.life -= 1
          ctx.fillStyle = c.c
          ctx.globalAlpha = Math.max(0, Math.min(1, c.life / 45))
          ctx.fillRect(c.x, c.y, c.r, c.r * 1.6)
        }
        ctx.globalAlpha = 1
        confetti.current = confetti.current.filter((c) => c.life > 0 && c.y < BOARD_PX + 40)
      }
      if (drag.current) {
        const p = game.board[drag.current.from]
        if (p) {
          drawPixels(ctx, PIECES[p.t], p.c === "w" ? AMBER : GREY, PIECE_SCALE,
            drag.current.x - (PIECE_SIZE * PIECE_SCALE) / 2,
            drag.current.y - (PIECE_SIZE * PIECE_SCALE) / 2, { alpha: 0.92 })
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
        <span>
          <b className="font-medium text-foreground">{bot.name}</b> · {bot.elo} elo · {bot.who}
        </span>
        <span className="font-mono">{thinking ? "thinking…" : status.text}</span>
      </div>

      <div className="relative mx-auto w-full max-w-[min(88vw,min(560px,68vh))]">
        <canvas
          ref={canvasRef}
          width={BOARD_PX}
          height={BOARD_PX}
          aria-label="Chess board"
          className="block w-full rounded-xl [image-rendering:pixelated] [touch-action:none]"
        />
        {status.over && (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-bg-base/80 px-6 text-center">
            <div>
              <p className={`font-mono text-lg ${status.won ? "text-accent-amber" : "text-foreground"}`}>
                {status.text}
              </p>
              {taunt && (
                <p className="mx-auto mt-3 max-w-[26ch] text-sm leading-relaxed text-text-muted">
                  <span className="text-foreground">{bot.name}:</span> “{taunt}”
                </p>
              )}
              <button
                type="button"
                onClick={reset}
                className="glass-pill mt-4 px-4 py-1.5 text-xs text-foreground"
              >
                Play again
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {/* No locks. Adrian's call: pick a fight with anyone you like. */}
        {LADDER.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => { wakeAudio(); setBot(b); reset() }}
            aria-pressed={b.id === bot.id}
            title={`${b.name} · ${b.elo} · ${b.who}`}
            className={`rounded-full px-2.5 py-1 font-mono text-[10px] transition-colors ${
              b.id === bot.id
                ? "bg-accent-amber text-bg-base"
                : "glass-pill text-text-muted hover:text-foreground"
            }`}
          >
            {b.elo}
          </button>
        ))}
        <button
          type="button"
          onClick={reset}
          className="glass-pill ml-2 px-3 py-1 text-[10px] text-text-muted hover:text-foreground"
        >
          Restart
        </button>
      </div>
      <p className="text-center text-[11px] text-text-muted">
        Drag a piece, or tap it and tap where it goes. Pick any opponent — nothing is locked.
      </p>
    </div>
  )
}
