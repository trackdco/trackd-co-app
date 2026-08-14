"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { pieceBitmap, type PieceKey } from "@/components/admin/arcade/chessSet"
import { LADDER, pickTaunt, type Bot } from "@/components/admin/arcade/pieces"
import { Portrait } from "@/components/admin/arcade/Portrait"
import { sfx, wakeAudio } from "@/lib/admin/arcade/audio"
import {
  applyMove,
  file,
  inCheck,
  kingSquare,
  legalMoves,
  newGame,
  outcome,
  budgetFor,
  pickMoveTimed,
  rank,
  sq,
  type Game,
  type Move,
} from "@/lib/admin/arcade/chess"
import { drawGrid } from "@/lib/admin/arcade/kyle"

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
/**
 * Pieces sit at 88% of the square.
 *
 * At full width they touch their neighbours and the whole board reads as one
 * solid mass; the gap is what lets you see eight separate pieces on a rank.
 * They are also centred on their actual painted ink rather than on their box —
 * see `pieceBitmap` — because the drawings are not symmetric about the middle.
 */
const PIECE_PX = Math.round(CELL * 0.88)
const PIECE_OFF = (CELL - PIECE_PX) / 2
const MIN_THINK_MS = 600

type Status = { text: string; over: boolean; won?: boolean }

function ChessBoard({ bot, onBack }: { bot: Bot; onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [confirmBack, setConfirmBack] = useState(false)
  /** Have you actually played anything worth discarding? */
  const [inPlay, setInPlay] = useState(false)
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
   * Cancels an in-flight bot move.
   *
   * The search is async and now runs for up to 2.2s (1.6s budget + the 600ms
   * thinking pause). Restart, switching opponent, or closing the arcade during
   * that window used to apply the stale move to a board that no longer matched
   * it: either `applyMove` threw on an empty from-square — inside a timer, so
   * nothing caught it and the board locked on "thinking…" forever — or it
   * succeeded, flipped the turn to black, and silently froze input. Every async
   * continuation now checks it is still the generation that started it.
   */
  const generation = useRef(0)
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
    generation.current += 1
    setInPlay(false)
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
          if (won) { sfx.win(); burstConfetti() } else { sfx.lose(); setTaunt(pickTaunt(bot)) }
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
    const mine = generation.current
    setTimeout(() => {
      if (mine !== generation.current) return
      void pickMoveTimed(g.current, { depth: bot.depth, blunder: bot.blunder, noise: bot.noise }, budgetFor(bot.depth))
        .then((m) => {
      if (mine !== generation.current) return
      const elapsed = performance.now() - startedAt
      const wait = Math.max(0, MIN_THINK_MS - elapsed)
      setTimeout(() => {
        if (mine !== generation.current) return
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
        })
        .catch(() => {
          // A search should not be able to throw, but if it ever does the board
          // must not be left stuck on "thinking…" with input blocked.
          if (mine !== generation.current) return
          setThinking(false)
          busy.current = false
        })
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
      setInPlay(true)
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

  // Leaving the game invalidates anything still in flight, so a stale reply
  // cannot play a chess sound over the dashboard or set state after unmount.
  useEffect(() => () => { generation.current += 1 }, [])

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
        const bmp = pieceBitmap(p.t as PieceKey, p.c === "w", PIECE_PX)
        if (bmp) {
          /* A very slight contact shadow. Enough to stop the piece floating,
             low enough that you do not notice it as a shadow. */
          const cx = file(i) * CELL + CELL / 2, cy = rank(i) * CELL + CELL * 0.84
          ctx.fillStyle = "rgba(0,0,0,.16)"
          ctx.beginPath(); ctx.ellipse(cx, cy, CELL * 0.24, CELL * 0.06, 0, 0, Math.PI * 2); ctx.fill()
          ctx.drawImage(bmp, file(i) * CELL + PIECE_OFF, rank(i) * CELL + PIECE_OFF * 0.4)
        }
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
          const bmp = pieceBitmap(p.t as PieceKey, p.c === "w", PIECE_PX)
          if (bmp) {
            ctx.globalAlpha = 0.92
            ctx.drawImage(bmp, drag.current.x - PIECE_PX / 2, drag.current.y - PIECE_PX / 2)
            ctx.globalAlpha = 1
          }
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="relative mx-auto flex h-full w-full max-w-[620px] flex-col gap-3">
      {/* Who you are actually fighting, with their face on it. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => (inPlay && !status.over ? setConfirmBack(true) : onBack())}
            aria-label="Change opponent"
            className="glass-pill grid size-9 shrink-0 place-items-center rounded-full text-text-muted hover:text-foreground"
          >
            <span aria-hidden className="text-base leading-none">←</span>
          </button>
          <div className="glass-pill grid size-[88px] shrink-0 place-items-center overflow-hidden rounded-2xl">
            <Portrait
              bot={bot}
              size={88}
              mood={status.over ? (status.won ? "beaten" : "gloat") : thinking ? "thinking" : "idle"}
            />
          </div>
          <div className="min-w-0">
            <p className="text-base font-medium text-foreground">{bot.name}</p>
            <p className="text-xs text-text-muted">
              {bot.elo} elo · {bot.who}
            </p>
          </div>
        </div>
        <span className="font-mono text-xs text-text-muted">
          {thinking ? "thinking…" : status.text}
        </span>
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
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-bg-base/85 px-4 text-center">
            <div className="w-full max-w-sm">
              {/* The scene: they laugh at you, and the line comes out of their
                  mouth rather than sitting in a caption underneath. */}
              <div className="flex items-end justify-center gap-3">
                <Portrait bot={bot} size={132} mood={status.won ? "beaten" : "gloat"} />
                {taunt && !status.won && (
                  <div className="relative mb-4 max-w-[15rem] rounded-2xl rounded-bl-sm bg-[#f0efe9] px-3.5 py-2.5 text-left">
                    <p className="text-sm leading-snug text-[#1b1a17]">“{taunt}”</p>
                    <span className="absolute -bottom-1.5 left-2 size-3 rotate-45 bg-[#f0efe9]" />
                  </div>
                )}
              </div>
              <p
                className={`mt-4 font-mono text-lg ${
                  status.won ? "text-accent-amber" : "text-foreground"
                }`}
              >
                {status.text}
              </p>
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

      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="glass-pill px-3 py-1 text-[10px] text-text-muted hover:text-foreground"
        >
          Restart
        </button>
        <button
          type="button"
          onClick={() => (inPlay && !status.over ? setConfirmBack(true) : onBack())}
          className="glass-pill px-3 py-1 text-[10px] text-text-muted hover:text-foreground"
        >
          Change opponent
        </button>
      </div>
      <p className="text-center text-[11px] text-text-muted">
        Drag a piece, or tap it and tap where it goes.
      </p>

      {/* Only ever shown when there is a real game to lose — a confirm on an
          untouched board is a dialog that teaches you to dismiss dialogs. */}
      {confirmBack && (
        <div className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-bg-base/90 px-4 text-center">
          <div className="w-full max-w-xs">
            <p className="text-sm text-foreground">Leave this game?</p>
            <p className="mt-1 text-[11px] text-text-muted">
              Your game against {bot.name} will be discarded.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmBack(false)}
                className="glass-pill px-4 py-1.5 text-xs text-foreground"
              >
                Keep playing
              </button>
              <button
                type="button"
                onClick={() => { setConfirmBack(false); onBack() }}
                className="rounded-full bg-accent-amber px-4 py-1.5 text-xs font-medium text-bg-base"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


/**
 * Choose your opponent.
 *
 * The roster used to be a strip of thumbnails under a live board, which made
 * picking a fight compete for attention with the game already in progress.
 * Giving it a screen makes it the moment it should be.
 */
function OpponentSelect({ onPick }: { onPick: (b: Bot) => void }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-[620px] flex-col gap-3 overflow-y-auto">
      <div className="text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-text-muted">Choose your opponent</p>
        <p className="mt-1 text-[11px] text-text-muted">Nothing is locked. Start anywhere.</p>
      </div>
      <div className="grid grid-cols-3 gap-2 pb-2 sm:grid-cols-4">
        {LADDER.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => { wakeAudio(); onPick(b) }}
            className="glass-pill flex flex-col items-center gap-1 rounded-xl px-2 py-3 transition-colors hover:bg-[var(--admin-glass-hover)]"
          >
            <Portrait bot={b} size={64} mood="idle" />
            <span className="text-center text-[11px] font-medium leading-tight text-foreground">{b.name}</span>
            <span className="font-mono text-[10px] tabular-nums text-accent-amber">{b.elo}</span>
            <span className="text-center text-[9px] leading-tight text-text-muted">{b.who}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function ChessGame() {
  const [bot, setBot] = useState<Bot | null>(null)
  if (!bot) return <OpponentSelect onPick={setBot} />
  /* `key` remounts on a change of opponent, so a new fight starts from a clean
     board without anyone having to remember to reset every ref. */
  return <ChessBoard key={bot.id} bot={bot} onBack={() => setBot(null)} />
}
