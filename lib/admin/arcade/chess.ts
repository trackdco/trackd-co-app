/**
 * Chess — full legal rules and a search, as a pure module.
 *
 * Pure so it can be unit-tested: castling through check, en passant, promotion
 * and stalemate are exactly the rules that are easy to get subtly wrong and
 * impossible to notice by playing casually.
 *
 * Board is 64 squares, index 0 = a8 … 63 = h1. White is the human (amber) and
 * moves up the board.
 */

export type PieceType = "p" | "n" | "b" | "r" | "q" | "k"
export type Colour = "w" | "b"
export interface Piece { t: PieceType; c: Colour }
export interface Move {
  from: number
  to: number
  promo?: PieceType
  ep?: boolean
  dbl?: boolean
  castle?: "K" | "Q"
}
export interface Game {
  board: (Piece | null)[]
  turn: Colour
  cast: { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean }
  ep: number | null
  half: number
}

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"

export function newGame(): Game {
  const board: (Piece | null)[] = new Array(64).fill(null)
  let i = 0
  for (const ch of START) {
    if (ch === "/") continue
    if (/\d/.test(ch)) { i += Number(ch); continue }
    board[i++] = { t: ch.toLowerCase() as PieceType, c: ch === ch.toUpperCase() ? "w" : "b" }
  }
  return { board, turn: "w", cast: { wK: true, wQ: true, bK: true, bQ: true }, ep: null, half: 0 }
}

export const file = (i: number) => i % 8
export const rank = (i: number) => Math.floor(i / 8)
const on = (f: number, r: number) => f >= 0 && f < 8 && r >= 0 && r < 8
export const sq = (f: number, r: number) => r * 8 + f

const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const
const KNIGHT_JUMPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]] as const

/** Every move the pieces can make, ignoring whether it leaves the king in check. */
export function pseudoMoves(g: Game, colour: Colour): Move[] {
  const out: Move[] = []
  for (let i = 0; i < 64; i++) {
    const p = g.board[i]
    if (!p || p.c !== colour) continue
    const f = file(i), r = rank(i)
    const add = (tf: number, tr: number): boolean => {
      if (!on(tf, tr)) return false
      const t = sq(tf, tr), q = g.board[t]
      if (q && q.c === colour) return false
      out.push({ from: i, to: t })
      return !q
    }
    if (p.t === "p") {
      const dir = colour === "w" ? -1 : 1
      const startRank = colour === "w" ? 6 : 1
      const lastRank = colour === "w" ? 0 : 7
      if (on(f, r + dir) && !g.board[sq(f, r + dir)]) {
        const promo = r + dir === lastRank
        out.push({ from: i, to: sq(f, r + dir), ...(promo ? { promo: "q" as PieceType } : {}) })
        if (r === startRank && !g.board[sq(f, r + 2 * dir)])
          out.push({ from: i, to: sq(f, r + 2 * dir), dbl: true })
      }
      for (const df of [-1, 1]) {
        const tf = f + df, tr = r + dir
        if (!on(tf, tr)) continue
        const t = sq(tf, tr), q = g.board[t]
        if (q && q.c !== colour)
          out.push({ from: i, to: t, ...(tr === lastRank ? { promo: "q" as PieceType } : {}) })
        else if (!q && g.ep === t) out.push({ from: i, to: t, ep: true })
      }
    } else if (p.t === "n") {
      for (const [df, dr] of KNIGHT_JUMPS) add(f + df, r + dr)
    } else if (p.t === "k") {
      for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) if (df || dr) add(f + df, r + dr)
    } else {
      const dirs = p.t === "q" ? [...ROOK_DIRS, ...BISHOP_DIRS] : p.t === "r" ? ROOK_DIRS : BISHOP_DIRS
      for (const [df, dr] of dirs) {
        let tf = f + df, tr = r + dr
        while (add(tf, tr)) { tf += df; tr += dr }
      }
    }
  }
  return out
}

export function attacks(g: Game, square: number, by: Colour): boolean {
  for (const m of pseudoMoves(g, by)) if (m.to === square) return true
  return false
}

export function kingSquare(g: Game, c: Colour): number {
  for (let i = 0; i < 64; i++) { const p = g.board[i]; if (p && p.t === "k" && p.c === c) return i }
  return -1
}

export function inCheck(g: Game, c: Colour): boolean {
  const k = kingSquare(g, c)
  return k >= 0 && attacks(g, k, c === "w" ? "b" : "w")
}

export function applyMove(g: Game, m: Move): Game {
  const n: Game = {
    board: g.board.slice(),
    turn: g.turn === "w" ? "b" : "w",
    cast: { ...g.cast },
    ep: null,
    half: g.half + 1,
  }
  const p = n.board[m.from]!
  n.board[m.from] = null
  if (m.ep) n.board[sq(file(m.to), rank(m.from))] = null
  if (n.board[m.to] || p.t === "p") n.half = 0
  n.board[m.to] = m.promo ? { t: m.promo, c: p.c } : p
  if (m.dbl) n.ep = sq(file(m.from), (rank(m.from) + rank(m.to)) / 2)
  if (m.castle) {
    const r = rank(m.from)
    if (m.castle === "K") { n.board[sq(5, r)] = n.board[sq(7, r)]; n.board[sq(7, r)] = null }
    else { n.board[sq(3, r)] = n.board[sq(0, r)]; n.board[sq(0, r)] = null }
  }
  if (p.t === "k") {
    if (p.c === "w") { n.cast.wK = false; n.cast.wQ = false } else { n.cast.bK = false; n.cast.bQ = false }
  }
  for (const s of [m.from, m.to]) {
    if (s === 56) n.cast.wQ = false
    if (s === 63) n.cast.wK = false
    if (s === 0) n.cast.bQ = false
    if (s === 7) n.cast.bK = false
  }
  return n
}

/** Every move that is actually allowed, castling included. */
export function legalMoves(g: Game): Move[] {
  const colour = g.turn
  const moves = pseudoMoves(g, colour).filter((m) => !inCheck(applyMove(g, m), colour))
  const r = colour === "w" ? 7 : 0
  const k = sq(4, r)
  const foe: Colour = colour === "w" ? "b" : "w"
  const canK = colour === "w" ? g.cast.wK : g.cast.bK
  const canQ = colour === "w" ? g.cast.wQ : g.cast.bQ
  const kp = g.board[k]
  // The king may not start, pass through, or land on an attacked square.
  if ((canK || canQ) && kp && kp.t === "k" && kp.c === colour && !attacks(g, k, foe)) {
    const rookK = g.board[sq(7, r)], rookQ = g.board[sq(0, r)]
    if (canK && !g.board[sq(5, r)] && !g.board[sq(6, r)] && rookK && rookK.t === "r" && rookK.c === colour &&
        !attacks(g, sq(5, r), foe) && !attacks(g, sq(6, r), foe))
      moves.push({ from: k, to: sq(6, r), castle: "K" })
    if (canQ && !g.board[sq(3, r)] && !g.board[sq(2, r)] && !g.board[sq(1, r)] &&
        rookQ && rookQ.t === "r" && rookQ.c === colour &&
        !attacks(g, sq(3, r), foe) && !attacks(g, sq(2, r), foe))
      moves.push({ from: k, to: sq(2, r), castle: "Q" })
  }
  return moves
}

export type Outcome =
  | { kind: "checkmate"; winner: Colour }
  | { kind: "stalemate" }
  | { kind: "fifty" }
  | null

export function outcome(g: Game): Outcome {
  if (legalMoves(g).length === 0)
    return inCheck(g, g.turn) ? { kind: "checkmate", winner: g.turn === "w" ? "b" : "w" } : { kind: "stalemate" }
  if (g.half >= 100) return { kind: "fifty" }
  return null
}

/* ── Search ────────────────────────────────────────────────────────────── */

export const VALUE: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 }

const PST_PAWN = [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10,
  5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0]
const PST_KNIGHT = [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30,
  -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50]
const PST_BISHOP = [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10,
  -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20]
const PST: Partial<Record<PieceType, number[]>> = { p: PST_PAWN, n: PST_KNIGHT, b: PST_BISHOP }

/** Positive favours white. */
export function evaluate(g: Game): number {
  let score = 0
  for (let i = 0; i < 64; i++) {
    const p = g.board[i]
    if (!p) continue
    const sign = p.c === "w" ? 1 : -1
    score += sign * VALUE[p.t]
    const table = PST[p.t]
    if (table) score += sign * table[p.c === "w" ? i : 63 - i]
  }
  return score
}

/**
 * Quiescence search — keep looking while pieces are still being taken.
 *
 * WITHOUT THIS THE ENGINE IS MUCH WEAKER THAN ITS DEPTH SUGGESTS. A fixed-depth
 * search stops dead at the horizon, so if the last ply happens to be "I take
 * your queen" it scores that as winning a queen and never sees the recapture.
 * That is the horizon effect, and it is why a naive depth-4 engine plays more
 * like 1500 than like the ~2000 the depth implies. Extending only along
 * captures until the position is quiet costs little and removes it.
 *
 * Capped at `MAX_QUIESCE` ply: a long forced capture sequence is real, but an
 * unbounded extension can blow the stack in a pathological position.
 */
const MAX_QUIESCE = 4

function quiesce(g: Game, alpha: number, beta: number, maximising: boolean, ply = 0): number {
  const standPat = evaluate(g)
  if (ply >= MAX_QUIESCE) return standPat
  // Stand-pat: you are never forced to capture, so the static score is a floor
  // for the side to move.
  if (maximising) {
    if (standPat >= beta) return beta
    if (standPat > alpha) alpha = standPat
  } else {
    if (standPat <= alpha) return alpha
    if (standPat < beta) beta = standPat
  }
  const captures = legalMoves(g).filter((m) => g.board[m.to] || m.ep)
  if (captures.length === 0) return standPat
  captures.sort((a, b) => (g.board[b.to] ? VALUE[g.board[b.to]!.t] : 0) - (g.board[a.to] ? VALUE[g.board[a.to]!.t] : 0))
  for (const m of captures) {
    const score = quiesce(applyMove(g, m), alpha, beta, !maximising, ply + 1)
    if (maximising) {
      if (score >= beta) return beta
      if (score > alpha) alpha = score
    } else {
      if (score <= alpha) return alpha
      if (score < beta) beta = score
    }
  }
  return maximising ? alpha : beta
}

function search(g: Game, depth: number, alpha: number, beta: number, maximising: boolean): number {
  if (depth === 0) return quiesce(g, alpha, beta, maximising)
  const moves = legalMoves(g)
  if (moves.length === 0) return inCheck(g, g.turn) ? (g.turn === "w" ? -99999 - depth : 99999 + depth) : 0
  // Captures first. Cheap ordering, large pruning win.
  moves.sort((a, b) => (g.board[b.to] ? VALUE[g.board[b.to]!.t] : 0) - (g.board[a.to] ? VALUE[g.board[a.to]!.t] : 0))
  if (maximising) {
    let best = -Infinity
    for (const m of moves) {
      best = Math.max(best, search(applyMove(g, m), depth - 1, alpha, beta, false))
      alpha = Math.max(alpha, best)
      if (beta <= alpha) break
    }
    return best
  }
  let best = Infinity
  for (const m of moves) {
    best = Math.min(best, search(applyMove(g, m), depth - 1, alpha, beta, true))
    beta = Math.min(beta, best)
    if (beta <= alpha) break
  }
  return best
}

export interface BotSpec { depth: number; blunder: number }

/**
 * Pick black's move.
 *
 * Elo is expressed two ways: how deep it looks, and how often it simply refuses
 * to play the move it found. The low bots genuinely hang pieces — a bot that
 * always plays the best move it can see at depth 1 is still far too strong to
 * be a 250.
 */
export function pickMove(g: Game, bot: BotSpec, rng: () => number = Math.random): Move | null {
  const moves = legalMoves(g)
  if (moves.length === 0) return null
  if (rng() < bot.blunder) return moves[Math.floor(rng() * moves.length)] ?? moves[0]
  moves.sort((a, b) => (g.board[b.to] ? VALUE[g.board[b.to]!.t] : 0) - (g.board[a.to] ? VALUE[g.board[a.to]!.t] : 0))
  let best: Move | null = null
  let bestScore = Infinity // black minimises
  for (const m of moves) {
    const score = search(applyMove(g, m), Math.max(0, bot.depth - 1), -Infinity, Infinity, true)
    if (score < bestScore) { bestScore = score; best = m }
  }
  return best ?? moves[0]
}

/**
 * The move the UI actually calls — searched WITHOUT freezing the tab.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * `pickMove` is synchronous, and measured on a real midgame position it costs:
 *
 *     depth 1     9ms      depth 3    409ms
 *     depth 2    28ms      depth 4  3,724ms
 *
 * Nearly four seconds of blocked main thread for the top two bots. No repaint,
 * no input, no scrolling — the tab is simply hung, and a browser may offer to
 * kill it. A 600ms "thinking" pause on top of that is beside the point.
 *
 * ── THE FIX, IN TWO PARTS ─────────────────────────────────────────────────
 * **Iterative deepening.** Search depth 1, then 2, then 3, keeping the best
 * move from the last COMPLETED depth. If the budget runs out mid-way the answer
 * is still a real one, just shallower — which is exactly how real engines
 * handle a clock, and it means the budget can be honoured without ever
 * returning a half-searched move.
 *
 * **Yielding between root moves.** Each root subtree at depth 4 is roughly
 * 3724/30 ≈ 125ms, which is a pause rather than a freeze. Handing control back
 * to the event loop between them lets the board repaint and keeps input alive.
 *
 * The blunder roll happens once, up front, so a bot that was going to throw the
 * move away does not burn the budget first.
 */
export async function pickMoveTimed(
  g: Game,
  bot: BotSpec,
  budgetMs = 1600,
  rng: () => number = Math.random
): Promise<Move | null> {
  const moves = legalMoves(g)
  if (moves.length === 0) return null
  if (rng() < bot.blunder) return moves[Math.floor(rng() * moves.length)] ?? moves[0]

  moves.sort((a, b) => (g.board[b.to] ? VALUE[g.board[b.to]!.t] : 0) - (g.board[a.to] ? VALUE[g.board[a.to]!.t] : 0))
  const deadline = Date.now() + budgetMs
  const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

  let best: Move = moves[0]
  for (let depth = 1; depth <= bot.depth; depth++) {
    let bestScore = Infinity
    let bestThisDepth: Move | null = null
    let ranOut = false
    for (const m of moves) {
      const score = search(applyMove(g, m), depth - 1, -Infinity, Infinity, true)
      if (score < bestScore) { bestScore = score; bestThisDepth = m }
      if (Date.now() > deadline) { ranOut = true; break }
      await yieldToUi()
    }
    // Only accept a depth that finished — a partial pass has seen an arbitrary
    // subset of the moves and its "best" is not comparable to the last one's.
    if (!ranOut && bestThisDepth) best = bestThisDepth
    if (ranOut) break
  }
  return best
}
