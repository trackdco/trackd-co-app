"use client"

import { useCallback, useEffect, useState } from "react"

import { ChessGame } from "@/components/admin/arcade/ChessGame"
import { BlockBlast, ConnectFour, Solitaire } from "@/components/admin/arcade/MoreGames"
import {
  Dose2048,
  DrawTime,
  KyleRun,
  Titration,
  VialSnake,
  VialStack,
} from "@/components/admin/arcade/SmallGames"
import { TileArt } from "@/components/admin/arcade/TileArt"
import { isMuted, setMuted, sfx, wakeAudio } from "@/lib/admin/arcade/audio"

/**
 * The arcade: a full-screen takeover launched from the dashboard header, or by
 * typing "games" into ⌘K.
 *
 * NOT a tab and not a footer button. Adrian's call both times: a footer button
 * is too small to find and a sixth tab would put games permanently beside the
 * revenue. A takeover keeps the dashboard a dashboard and gives the games the
 * whole screen, which is what they actually need.
 */

interface Entry {
  id: string
  name: string
  blurb: string
  Component: () => React.JSX.Element
}

const GAMES: Entry[] = [
  { id: "chess", name: "Chess", blurb: "Eleven opponents, 250 to 2000 Elo", Component: ChessGame },
  { id: "blocks", name: "Block Blast", blurb: "Drag shapes in, clear rows and columns", Component: BlockBlast },
  { id: "connect", name: "Connect Four", blurb: "Amber discs against Will's grey pills", Component: ConnectFour },
  { id: "solitaire", name: "Solitaire", blurb: "Klondike, draw one, amber suits", Component: Solitaire },
  { id: "stack", name: "Vial Stack", blurb: "Perfect drops grow the vial back", Component: VialStack },
  { id: "2048", name: "Dose 2048", blurb: "5mg + 5mg = 10mg, all the way up", Component: Dose2048 },
  { id: "snake", name: "Vial Snake", blurb: "Collect doses, don't eat yourself", Component: VialSnake },
  { id: "titration", name: "Titration", blurb: "Hold the level in the band as it decays", Component: Titration },
  { id: "run", name: "Kyle Run", blurb: "He floats, he hops, he has no legs", Component: KyleRun },
  { id: "draw", name: "Draw Time", blurb: "Five draws, pure reaction", Component: DrawTime },
]

export function Arcade({ onClose }: { onClose: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [muted, setMutedState] = useState(() => isMuted())
  const game = GAMES.find((g) => g.id === openId)

  // Escape backs out one level: game → menu → closed. Two presses to leave, so
  // a mis-hit mid-game doesn't dump you back on the dashboard.
  const escape = useCallback(() => {
    if (openId) setOpenId(null)
    else onClose()
  }, [openId, onClose])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); escape() }
    }
    window.addEventListener("keydown", key)
    // The page behind must not scroll while a takeover is open.
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", key)
      document.body.style.overflow = prev
    }
  }, [escape])

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    setMutedState(next)
    if (!next) { wakeAudio(); sfx.start() }
  }

  return (
    <div className="admin-overlay">
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 py-6 sm:px-6">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {game && (
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="glass-pill px-3 py-1 text-xs text-text-muted hover:text-foreground"
              >
                ← All games
              </button>
            )}
            <p className="text-[10px] tracking-[0.18em] uppercase text-text-muted">
              {game ? game.name : "Trackd · arcade"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={muted}
              className="glass-pill px-3 py-1 text-xs text-text-muted hover:text-foreground"
            >
              {muted ? "🔇" : "🔊"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="glass-pill px-3 py-1 text-xs text-text-muted hover:text-foreground"
            >
              Close
            </button>
          </div>
        </header>

        {game ? (
          <div className="mt-6 flex-1">
            <game.Component />
          </div>
        ) : (
          <>
            <h2 className="mt-6 text-2xl font-light tracking-[-0.02em] text-foreground">
              Pick something
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              All of them work on a phone. Escape backs out.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {GAMES.map((g, i) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => { wakeAudio(); setOpenId(g.id) }}
                  style={{ "--admin-delay": `${i * 50}ms` } as React.CSSProperties}
                  className="glass-panel animate-admin-rise overflow-hidden p-3 text-left transition-colors hover:bg-[var(--admin-glass-hover)]"
                >
                  <TileArt id={g.id} />
                  <p className="mt-2.5 text-base font-medium text-foreground">{g.name}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{g.blurb}</p>
                </button>
              ))}
            </div>
            <p className="mt-8 text-xs text-text-muted">
              Ten games. Escape backs out; ⌘K → “games” gets you back here.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
