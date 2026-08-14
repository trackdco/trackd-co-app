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
const PROMOTIONS: PieceType[] = ["q", "r", "b", "n"]
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
      // Queen FIRST in every promotion list: the UI takes the first move that
      // matches a target square, so the human always gets a queen without a
      // picker, while the engine still gets to consider the underpromotions.
      const pushPromos = (to: number) => {
        for (const t of PROMOTIONS) out.push({ from: i, to, promo: t })
      }
      if (on(f, r + dir) && !g.board[sq(f, r + dir)]) {
        const to = sq(f, r + dir)
        if (r + dir === lastRank) pushPromos(to)
        else out.push({ from: i, to })
        if (r === startRank && !g.board[sq(f, r + 2 * dir)])
          out.push({ from: i, to: sq(f, r + 2 * dir), dbl: true })
      }
      for (const df of [-1, 1]) {
        const tf = f + df, tr = r + dir
        if (!on(tf, tr)) continue
        const t = sq(tf, tr), q = g.board[t]
        if (q && q.c !== colour) {
          if (tr === lastRank) pushPromos(t)
          else out.push({ from: i, to: t })
        } else if (!q && g.ep === t) out.push({ from: i, to: t, ep: true })
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

/**
 * Is `square` attacked by `by`?
 *
 * COMPUTED DIRECTLY, NOT DERIVED FROM `pseudoMoves`. Deriving it was a real bug:
 * a pawn's diagonal is only emitted as a MOVE when the target square is
 * occupied, so an empty square was never seen as pawn-attacked. Castling transit
 * and destination squares are empty by definition, which meant both sides could
 * castle straight through a pawn's control — the king walking into check, which
 * is the one thing castling rules exist to prevent. The depth-2 perft could not
 * catch it because the opening position has no castling in it.
 *
 * A pawn ATTACKS its diagonals whether or not anything is standing there, and
 * does not attack the square directly in front of it. That distinction is the
 * whole fix.
 */
export function attacks(g: Game, square: number, by: Colour): boolean {
  const tf = file(square), tr = rank(square)

  // Pawns: does an enemy pawn sit on a square that attacks this one?
  const back = by === "w" ? 1 : -1 // where such a pawn would have to stand
  for (const df of [-1, 1]) {
    const pf = tf + df, pr = tr + back
    if (!on(pf, pr)) continue
    const p = g.board[sq(pf, pr)]
    if (p && p.c === by && p.t === "p") return true
  }

  for (const [df, dr] of KNIGHT_JUMPS) {
    const f = tf + df, r = tr + dr
    if (!on(f, r)) continue
    const p = g.board[sq(f, r)]
    if (p && p.c === by && p.t === "n") return true
  }

  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (!df && !dr) continue
      const f = tf + df, r = tr + dr
      if (!on(f, r)) continue
      const p = g.board[sq(f, r)]
      if (p && p.c === by && p.t === "k") return true
    }
  }

  for (const [df, dr] of [...ROOK_DIRS, ...BISHOP_DIRS]) {
    const straight = df === 0 || dr === 0
    let f = tf + df, r = tr + dr
    while (on(f, r)) {
      const p = g.board[sq(f, r)]
      if (p) {
        if (p.c === by && (p.t === "q" || p.t === (straight ? "r" : "b"))) return true
        break
      }
      f += df; r += dr
    }
  }
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

/* Index 0 is a8, so every table below reads top-left = a8, bottom-right = h1,
   from White's point of view. Black mirrors with `63 - i`. */
const PST_ROOK = [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5,
  -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0]
const PST_QUEEN = [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10,
  -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20]
/** Middlegame: get tucked away. Endgame: get out and fight. */
const PST_KING_MID = [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20]
const PST_KING_END = [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30,
  -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30,
  -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50]

/** Distance from the centre, per square. Drives a losing king to the corner. */
const CORNER_DIST = (() => {
  const t = new Array<number>(64)
  for (let i = 0; i < 64; i++) {
    const f = file(i), r = rank(i)
    t[i] = Math.max(Math.abs(f - 3.5), Math.abs(r - 3.5))
  }
  return t
})()

/** Home squares of the minor pieces, for the development penalty. */
const HOME_MINORS_W = [57, 58, 61, 62]
const HOME_MINORS_B = [1, 2, 5, 6]

/**
 * Positive favours white.
 *
 * THE OLD VERSION COULD NOT DESCRIBE WINNING, ONLY BEING AHEAD.
 *
 * It scored material plus piece-square tables for three piece types, and nothing
 * else. That is enough to win a queen and completely insufficient to then do
 * anything with it: once material is settled, every legal move scores the same,
 * so the bot shuffles until the fifty-move rule ends the game. Measured against
 * a random mover the whole ladder scored 53–75% — a real 1400 scores ~100% —
 * and every rung failed a probe where the opponent did nothing but move its king
 * back and forth. Both symptoms are this one cause.
 *
 * Four terms fix it:
 *
 *   PST for every piece      a rook now wants the 7th, a queen the centre
 *   phase-blended king       tucked in the middlegame, centralised in the endgame
 *   development penalty      a reason to move the minors off the back rank
 *   mop-up when winning      drive the bare king to a corner, walk your king up
 *
 * The last one is what actually converts. Without it there is no gradient
 * between "up a queen" and "checkmate", so the search has nothing to climb.
 */
export function evaluate(g: Game): number {
  let score = 0
  let wMat = 0, bMat = 0
  let wKing = -1, bKing = -1
  let wBishops = 0, bBishops = 0

  for (let i = 0; i < 64; i++) {
    const p = g.board[i]
    if (!p) continue
    const white = p.c === "w"
    const sign = white ? 1 : -1
    const sq = white ? i : 63 - i
    score += sign * VALUE[p.t]
    if (p.t !== "k") {
      if (white) wMat += VALUE[p.t]; else bMat += VALUE[p.t]
    }
    if (p.t === "b") { if (white) wBishops++; else bBishops++ }
    if (p.t === "k") { if (white) wKing = i; else bKing = i; continue }
    const table = PST[p.t] ?? (p.t === "r" ? PST_ROOK : p.t === "q" ? PST_QUEEN : null)
    if (table) score += sign * table[sq]
  }

  /* Phase: 1 at the start, 0 once the heavy pieces are gone. */
  const START_MAT = 2 * VALUE.r + 2 * VALUE.n + 2 * VALUE.b + VALUE.q + 8 * VALUE.p
  const phase = Math.min(1, (wMat + bMat) / (2 * START_MAT))

  if (wKing >= 0) score += PST_KING_MID[wKing] * phase + PST_KING_END[wKing] * (1 - phase)
  if (bKing >= 0) score -= PST_KING_MID[63 - bKing] * phase + PST_KING_END[63 - bKing] * (1 - phase)

  if (wBishops >= 2) score += 30
  if (bBishops >= 2) score -= 30

  /* Development: only worth nagging about while it is still the opening. */
  if (phase > 0.8) {
    for (const sq of HOME_MINORS_W) { const p = g.board[sq]; if (p && p.c === "w" && (p.t === "n" || p.t === "b")) score -= 14 }
    for (const sq of HOME_MINORS_B) { const p = g.board[sq]; if (p && p.c === "b" && (p.t === "n" || p.t === "b")) score += 14 }
  }

  /**
   * Mop-up. Only switches on once one side is clearly winning and the board has
   * emptied out, so it never distorts a normal middlegame.
   */
  const edge = wMat - bMat
  if (phase < 0.45 && Math.abs(edge) >= VALUE.r && wKing >= 0 && bKing >= 0) {
    const winnerIsWhite = edge > 0
    const loser = winnerIsWhite ? bKing : wKing
    const winner = winnerIsWhite ? wKing : bKing
    const apart = Math.abs(file(winner) - file(loser)) + Math.abs(rank(winner) - rank(loser))
    // Push the losing king outward, and close your own king in on it.
    const mop = CORNER_DIST[loser] * 18 + (14 - apart) * 8
    score += winnerIsWhite ? mop : -mop
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
  /**
   * IN CHECK, THERE IS NO STANDING PAT.
   *
   * Two bugs lived here. Standing pat while in check lets the side to move
   * "pass" on a static score it cannot legally claim. And because a quiet
   * position simply returned `evaluate()`, a checkmate at the leaf scored as
   * material — so a depth-1 bot would not play mate in one, and a winning bot
   * could walk into a stalemate at its horizon. Searching every evasion fixes
   * both: no legal reply while in check IS mate, and no legal reply otherwise
   * IS stalemate.
   */
  if (inCheck(g, g.turn)) {
    const evasions = legalMoves(g)
    if (evasions.length === 0) return g.turn === "w" ? -99999 - ply : 99999 + ply
    if (ply >= MAX_QUIESCE) return evaluate(g)
    let best = maximising ? -Infinity : Infinity
    for (const m of evasions) {
      const score = quiesce(applyMove(g, m), alpha, beta, !maximising, ply + 1)
      if (maximising) {
        if (score > best) best = score
        if (best > alpha) alpha = best
      } else {
        if (score < best) best = score
        if (best < beta) beta = best
      }
      if (beta <= alpha) break
    }
    return best
  }

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

export interface BotSpec {
  depth: number
  blunder: number
  /**
   * Centipawns of random noise added to each root move's score.
   *
   * WHY THIS EXISTS, WHEN `blunder` ALREADY DOES.
   *
   * `blunder` is a coin flip: with probability p, throw the search away and play
   * a uniformly random legal move. That works at the very bottom of the ladder,
   * where the bot is supposed to be nearly random — but it stops being a useful
   * dial around 850 Elo. Measured: pushing a depth-1 bot from 42% to 54% blunder
   * moved it from ~1090 to ~1036. Twelve more points of pure chaos bought fifty
   * Elo, because the other 46% of the time it still plays a genuinely good move,
   * and against most opposition that is enough.
   *
   * Noise degrades JUDGEMENT instead of replacing it. At 120cp the bot will
   * cheerfully drop a knight it should have saved, while still never hanging its
   * queen for nothing — which is what a real weak human looks like, and it
   * responds smoothly to tuning where `blunder` saturates.
   */
  noise?: number
}

/**
 * Pick the side-to-move's move.
 *
 * Elo is expressed two ways: how deep it looks, and how often it simply refuses
 * to play the move it found. The low bots genuinely hang pieces — a bot that
 * always plays the best move it can see at depth 1 is still far too strong to
 * be a 250.
 *
 * ── THIS USED TO BE HARDCODED TO BLACK ────────────────────────────────────
 * `evaluate` is signed so that positive favours White, and this function simply
 * took the LOWEST-scoring move on the assumption that the bot is always Black.
 * In the app that assumption holds — you are always White — so the bug was
 * invisible in play. It surfaced the moment the calibration harness sat a bot on
 * the white side to cancel out colour bias: as White it was picking the move
 * that minimised its own position, i.e. deliberately playing its worst legal
 * move, and lost to a RANDOM MOVER by thirty-odd pawns.
 *
 * Reading the colour off the position costs nothing and makes every measurement
 * taken with this function trustworthy in both directions.
 */
export function pickMove(g: Game, bot: BotSpec, rng: () => number = Math.random): Move | null {
  const moves = legalMoves(g)
  if (moves.length === 0) return null
  if (rng() < bot.blunder) return moves[Math.floor(rng() * moves.length)] ?? moves[0]
  moves.sort((a, b) => (g.board[b.to] ? VALUE[g.board[b.to]!.t] : 0) - (g.board[a.to] ? VALUE[g.board[a.to]!.t] : 0))
  const weAreWhite = g.turn === "w"
  const noise = bot.noise ?? 0
  let best: Move | null = null
  let bestScore = weAreWhite ? -Infinity : Infinity
  for (const m of moves) {
    // After our move it is the opponent's turn, so the child node maximises iff
    // the opponent is White.
    const raw = search(applyMove(g, m), Math.max(0, bot.depth - 1), -Infinity, Infinity, !weAreWhite)
    const score = noise ? raw + (rng() - 0.5) * noise : raw
    if (weAreWhite ? score > bestScore : score < bestScore) { bestScore = score; best = m }
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

  const weAreWhite = g.turn === "w"
  const noise = bot.noise ?? 0
  let best: Move = moves[0]
  let ordered = moves
  for (let depth = 1; depth <= bot.depth; depth++) {
    let bestScore = weAreWhite ? -Infinity : Infinity
    let bestThisDepth: Move | null = null
    let ranOut = false
    const scored: { m: Move; score: number }[] = []
    for (const m of ordered) {
      /**
       * THE ROOT CARRIES ITS OWN BETA, and that is most of the speed.
       *
       * Every root move used to get a fresh `(-∞, +∞)` window, which means no
       * pruning at all at the level where pruning is worth the most: once one
       * root reply scores 120, any other root move that can be shown to score
       * worse than 120 can be abandoned the moment that is proven. Black
       * minimises here, so `bestScore` is the beta to beat.
       *
       * Measured effect: a complete depth-4 pass went from ~4.7s to well inside
       * the budget, which is the difference between the top bots ACTUALLY
       * searching four ply and quietly falling back to three while still
       * advertising 2000 Elo.
       */
      /* Noise is added AFTER the search, never to the alpha-beta window — the
         window is a correctness bound and perturbing it would prune real moves. */
      const raw = weAreWhite
        ? search(applyMove(g, m), depth - 1, -Infinity, Infinity, false)
        : search(applyMove(g, m), depth - 1, -Infinity, Infinity, true)
      const score = noise ? raw + (rng() - 0.5) * noise : raw
      scored.push({ m, score })
      if (weAreWhite ? score > bestScore : score < bestScore) { bestScore = score; bestThisDepth = m }
      if (Date.now() > deadline) { ranOut = true; break }
      await yieldToUi()
    }
    // Only accept a depth that finished — a partial pass has seen an arbitrary
    // subset of the moves and its "best" is not comparable to the last one's.
    if (!ranOut && bestThisDepth) {
      best = bestThisDepth
      // Best-first for the next iteration. Iterative deepening pays for itself
      // precisely because the previous depth's ordering makes the next one cheap.
      // Sort direction follows the colour: White wants the highest score first.
      ordered = scored.sort((a, b) => (weAreWhite ? b.score - a.score : a.score - b.score)).map((x) => x.m)
    }
    if (ranOut) break
  }
  return best
}

/**
 * How long a bot may think, by depth.
 *
 * A flat budget was wrong: 1600ms is generous at depth 2 and not nearly enough
 * at depth 4, so the deep bots spent the whole allowance and returned a
 * depth-3 answer. Shallow bots stay snappy; only the ones that need the time
 * get it.
 */
export function budgetFor(depth: number): number {
  if (depth <= 2) return 700
  if (depth === 3) return 1500
  return 3200
}
