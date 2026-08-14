/**
 * Measure what our chess bots are actually worth, in Elo, against Stockfish.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every Elo number on the ladder up to now was asserted, not measured. Adrian
 * reported that shuffling a king back and forth went unpunished by the "800",
 * which is exactly the symptom you get when a bot has no idea how to make
 * progress in a quiet position. Rather than guess a fourth time, this plays
 * real games and derives the rating from the score.
 *
 * WHY STOCKFISH IS THE RULER AND NOT THE OPPONENT
 * -----------------------------------------------
 * Stockfish's `UCI_Elo` floor is 1320. It physically cannot play at 250 or 800,
 * which is most of our ladder, so it can't ship as the in-game engine. It is,
 * however, a calibrated yardstick: play N games against it at a known setting,
 * take the score, and invert the Elo expectancy formula.
 *
 *     E = 1 / (1 + 10^((Rb - Ra)/400))   =>   Ra = Rb - 400 * log10(1/E - 1)
 *
 * A bot that scores 0 against a 1320 tells us only "below 1320", so weak rungs
 * are anchored a second way: against a RANDOM MOVER, which the literature and
 * chess.com's own weakest bot put at roughly 250. Any bot that beats random
 * ~100% of the time is somewhere above it, and the gap to the next rung up is
 * measured bot-vs-bot. Chaining those pairwise gaps from an anchored floor is
 * how the mid-ladder numbers are derived.
 *
 * Dev-only, and `stockfish` is deliberately NOT a declared dependency — see the
 * note above `ENGINE` below. Nothing under app/ or lib/ imports any of this, so
 * none of it can reach a bundle.
 *
 *   node scripts/chess-calibrate.mjs                 # full ladder, default games
 *   node scripts/chess-calibrate.mjs --games 40      # more games, tighter CI
 *   node scripts/chess-calibrate.mjs --bots calc,map # a subset
 *   node scripts/chess-calibrate.mjs --sf 1320,1600  # extra reference points
 */

import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"

const ROOT = path.resolve(import.meta.dirname, "..")

const { newGame, legalMoves, applyMove, outcome, pickMove, file, rank } =
  await import(path.join(ROOT, "lib/admin/arcade/chess.ts"))

/* ── args ─────────────────────────────────────────────────────────── */
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const GAMES = Number(arg("games", 24))
const MAX_PLIES = Number(arg("plies", 160))
const SF_LEVELS = arg("sf", "1320").split(",").map(Number)
const ONLY = arg("bots", "").split(",").filter(Boolean)

/* ── UCI: talk to Stockfish over stdio like any other engine ─────────
 *
 * Stockfish is NOT a declared dependency. The package is ~250 MB unpacked, and
 * making every `npm install` and every CI run pay that for a script that gets
 * run occasionally is a bad trade. Install it on demand instead:
 *
 *     npm i -D --no-save stockfish
 *
 * Without it the random-mover anchor and the king-shuffle probe still work, so
 * the script degrades to "relative strength only" rather than failing outright.
 */
const ENGINE = path.join(ROOT, "node_modules/stockfish/bin/stockfish-18-lite-single.js")
const HAVE_SF = fs.existsSync(ENGINE)
if (!HAVE_SF) {
  console.log("\n  Stockfish not installed — running with the random-mover anchor only.")
  console.log("  For absolute Elo against a calibrated reference:")
  console.log("    npm i -D --no-save stockfish\n")
}

function uci() {
  const p = spawn(process.execPath, [ENGINE], { stdio: ["pipe", "pipe", "ignore"] })
  let buf = ""
  const waiters = []
  p.stdout.on("data", (chunk) => {
    buf += chunk.toString()
    let nl
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].test(line)) { waiters[i].resolve(line); waiters.splice(i, 1) }
      }
    }
  })
  const send = (cmd) => p.stdin.write(cmd + "\n")
  const expect = (test, ms = 30000) =>
    new Promise((resolve, reject) => {
      const w = { test, resolve }
      waiters.push(w)
      setTimeout(() => {
        const i = waiters.indexOf(w)
        if (i >= 0) { waiters.splice(i, 1); reject(new Error("UCI timeout: " + test)) }
      }, ms)
    })
  return { send, expect, kill: () => p.kill() }
}

async function startEngine(elo) {
  const e = uci()
  e.send("uci")
  await e.expect((l) => l === "uciok")
  e.send("setoption name Threads value 1")
  e.send("setoption name Hash value 16")
  e.send("setoption name UCI_LimitStrength value true")
  e.send(`setoption name UCI_Elo value ${elo}`)
  e.send("isready")
  await e.expect((l) => l === "readyok")
  return e
}

/* ── move notation ────────────────────────────────────────────────── */
const FILES = "abcdefgh"
/**
 * Index 0 is a8, not a1 — the board is filled straight from a FEN, which starts
 * at rank 8. So the UCI rank is `8 - rank(i)`, not `rank(i) + 1`. Getting this
 * backwards silently produces legal-looking coordinates for the wrong squares.
 */
const sqName = (i) => `${FILES[file(i)]}${8 - rank(i)}`
const toUci = (m) => `${sqName(m.from)}${sqName(m.to)}${m.promo ?? ""}`

/* ── the opponents we can measure against without Stockfish ────────── */
const randomMover = { id: "random", label: "random mover", elo: 250, anchor: true }

function pickFor(spec, g) {
  if (spec.id === "random") {
    const ms = legalMoves(g)
    return ms.length ? ms[Math.floor(Math.random() * ms.length)] : null
  }
  return pickMove(g, { depth: spec.depth, blunder: spec.blunder })
}

/* ── play one game ────────────────────────────────────────────────── */
/** Returns 1 / 0.5 / 0 from the perspective of `white`. */
async function playGame(white, black, sfEngine, sfIsWhite) {
  let g = newGame()
  const history = []
  for (let ply = 0; ply < MAX_PLIES; ply++) {
    // `outcome` returns an object or null — null means the game is still going.
    const res = outcome(g)
    if (res) return res.kind === "checkmate" ? (res.winner === "w" ? 1 : 0) : 0.5
    const usSf = sfEngine && (g.turn === "w") === sfIsWhite
    let move
    if (usSf) {
      sfEngine.send(`position startpos${history.length ? " moves " + history.join(" ") : ""}`)
      sfEngine.send("go movetime 60")
      const line = await sfEngine.expect((l) => l.startsWith("bestmove"))
      const u = line.split(" ")[1]
      if (!u || u === "(none)") return 0.5
      move = legalMoves(g).find((m) => toUci(m) === u)
      if (!move) throw new Error(`Stockfish played ${u}, which we do not consider legal`)
    } else {
      move = pickFor(g.turn === "w" ? white : black, g)
      if (!move) return 0.5
    }
    history.push(toUci(move))
    g = applyMove(g, move)
  }
  return 0.5   // hit the ply cap — score it a draw, and count it separately
}

/* ── Elo maths ────────────────────────────────────────────────────── */
/** Invert the expectancy formula. Clamped, because 0% and 100% are ±infinity. */
function eloFromScore(score, opponentElo, n) {
  const eps = 1 / (2 * n + 2)
  const s = Math.min(1 - eps, Math.max(eps, score))
  return Math.round(opponentElo - 400 * Math.log10(1 / s - 1))
}
/** Rough 95% band on the score, carried through to Elo. */
function band(score, opponentElo, n) {
  const se = Math.sqrt(Math.max(0.0001, score * (1 - score)) / n)
  return [eloFromScore(score - 1.96 * se, opponentElo, n), eloFromScore(score + 1.96 * se, opponentElo, n)]
}

/* ── the ladder under test ────────────────────────────────────────── */
const LADDER = JSON.parse(process.env.LADDER_JSON ?? "null") ?? [
  { id: "will",   claimed: 250,  depth: 1, blunder: 0.9 },
  { id: "blu",    claimed: 450,  depth: 1, blunder: 0.7 },
  { id: "tubbs",  claimed: 650,  depth: 1, blunder: 0.45 },
  { id: "calc",   claimed: 800,  depth: 1, blunder: 0.1 },
  { id: "greens", claimed: 950,  depth: 2, blunder: 0.35 },
  { id: "map",    claimed: 1100, depth: 2, blunder: 0.18 },
  { id: "spike",  claimed: 1250, depth: 2, blunder: 0.02 },
  { id: "gauge",  claimed: 1400, depth: 3, blunder: 0.12 },
  { id: "panel",  claimed: 1550, depth: 3, blunder: 0.0 },
  { id: "cal",    claimed: 1700, depth: 4, blunder: 0.08 },
  { id: "prime",  claimed: 1850, depth: 4, blunder: 0.0 },
]

const bots = LADDER.filter((b) => !ONLY.length || ONLY.includes(b.id))

/* ── match runners ────────────────────────────────────────────────── */
async function matchVsRandom(bot, n) {
  let score = 0
  for (let i = 0; i < n; i++) {
    const botWhite = i % 2 === 0
    const r = await playGame(botWhite ? bot : randomMover, botWhite ? randomMover : bot, null, false)
    score += botWhite ? r : 1 - r
  }
  return score / n
}

async function matchVsStockfish(bot, elo, n) {
  const eng = await startEngine(elo)
  let score = 0
  try {
    for (let i = 0; i < n; i++) {
      const botWhite = i % 2 === 0
      const r = await playGame(botWhite ? bot : null, botWhite ? null : bot, eng, !botWhite)
      score += botWhite ? r : 1 - r
    }
  } finally { eng.kill() }
  return score / n
}

/* ── the shuffling-king probe ─────────────────────────────────────── */
/**
 * The exact complaint, as a test.
 *
 * Black shuffles its king between e8 and d8 (or the nearest legal equivalent)
 * and does nothing else. A bot with any positional understanding should develop,
 * take the centre, and convert. One that only knows material will shuffle back
 * and the game will die at the ply cap. That is the difference this measures.
 */
async function shuffleProbe(bot) {
  let g = newGame()
  for (let ply = 0; ply < MAX_PLIES; ply++) {
    const res = outcome(g)
    if (res) {
      if (res.kind === "checkmate") return { result: res.winner === "w" ? `BOT WON @${ply}` : "bot LOST", ply }
      return { result: `draw (${res.kind})`, ply }
    }
    let move
    if (g.turn === "w") {
      move = pickMove(g, { depth: bot.depth, blunder: bot.blunder })
    } else {
      const ms = legalMoves(g)
      // Prefer a king move that isn't a capture — that is the whole point.
      const kingMoves = ms.filter((m) => g.board[m.from]?.t === "k" && !g.board[m.to])
      move = kingMoves[0] ?? ms[0]
    }
    if (!move) return { result: "no move", ply }
    g = applyMove(g, move)
  }
  return { result: "UNPUNISHED (hit ply cap)", ply: MAX_PLIES }
}

/* ── run ──────────────────────────────────────────────────────────── */
const pad = (s, n) => String(s).padEnd(n)
const padL = (s, n) => String(s).padStart(n)

console.log(`\nCalibrating ${bots.length} bots · ${GAMES} games per match · ply cap ${MAX_PLIES}`)
console.log(`Stockfish reference levels: ${SF_LEVELS.join(", ")}\n`)

console.log(pad("bot", 8) + padL("claimed", 8) + padL("vs random", 11) + padL("→ Elo", 8) +
  SF_LEVELS.map((l) => padL(`vs SF${l}`, 10)).join("") + padL("→ Elo", 8) + "  king-shuffle")
console.log("─".repeat(64 + SF_LEVELS.length * 10))

const results = []
for (const bot of bots) {
  const vsRandom = await matchVsRandom(bot, GAMES)
  const eloVsRandom = eloFromScore(vsRandom, randomMover.elo, GAMES)

  const sfScores = []
  if (HAVE_SF) for (const lvl of SF_LEVELS) sfScores.push(await matchVsStockfish(bot, lvl, GAMES))
  else SF_LEVELS.forEach(() => sfScores.push(NaN))
  // Take the reference the bot is closest to even with — that is the most informative one.
  let bestIdx = 0, bestDist = 1
  sfScores.forEach((s, i) => { const d = Math.abs(s - 0.5); if (d < bestDist) { bestDist = d; bestIdx = i } })
  const eloVsSf = HAVE_SF ? eloFromScore(sfScores[bestIdx], SF_LEVELS[bestIdx], GAMES) : NaN

  const probe = await shuffleProbe(bot)

  // Below the Stockfish floor the random anchor is the only honest signal.
  const measured = !HAVE_SF || sfScores[bestIdx] < 0.02
    ? eloVsRandom
    : Math.round((eloVsRandom + eloVsSf) / 2)
  const [lo, hi] = band(vsRandom, randomMover.elo, GAMES)

  results.push({ ...bot, vsRandom, eloVsRandom, sfScores, eloVsSf, measured, lo, hi, probe })
  console.log(
    pad(bot.id, 8) + padL(bot.claimed, 8) +
    padL((vsRandom * 100).toFixed(0) + "%", 11) + padL(eloVsRandom, 8) +
    sfScores.map((s) => padL(Number.isNaN(s) ? "-" : (s * 100).toFixed(0) + "%", 10)).join("") +
    padL(Number.isNaN(eloVsSf) ? "-" : eloVsSf, 8) +
    "  " + probe.result
  )
}

console.log("\n─── verdict ───")
for (const r of results) {
  const drift = r.measured - r.claimed
  const flag = Math.abs(drift) >= 200 ? "  ← WRONG" : Math.abs(drift) >= 100 ? "  ← off" : ""
  console.log(
    `${pad(r.id, 8)} claimed ${padL(r.claimed, 5)}   measured ${padL(r.measured, 5)} ` +
    `(${padL(r.lo, 4)}–${padL(r.hi, 4)})   drift ${padL(drift > 0 ? "+" + drift : drift, 6)}${flag}`
  )
}
console.log(
  "\nBots that never punished a shuffling king: " +
  (results.filter((r) => r.probe.result.startsWith("UNPUNISHED")).map((r) => r.id).join(", ") || "none")
)
console.log()
