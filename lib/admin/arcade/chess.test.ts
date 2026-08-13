import { describe, expect, it } from "vitest"

import {
  applyMove,
  inCheck,
  legalMoves,
  newGame,
  outcome,
  pickMove,
  pseudoMoves,
  sq,
  type Game,
  type Move,
  type Piece,
  type PieceType,
} from "./chess"

/** Build a position from scratch — far clearer than a FEN string in a test. */
function position(pieces: Record<string, string>, turn: "w" | "b" = "w"): Game {
  const g = newGame()
  g.board = new Array(64).fill(null)
  g.turn = turn
  g.cast = { wK: false, wQ: false, bK: false, bQ: false }
  for (const [square, code] of Object.entries(pieces)) {
    const f = square.charCodeAt(0) - 97
    const r = 8 - Number(square[1])
    const piece: Piece = {
      t: code.toLowerCase() as PieceType,
      c: code === code.toUpperCase() ? "w" : "b",
    }
    g.board[sq(f, r)] = piece
  }
  return g
}
const at = (s: string) => sq(s.charCodeAt(0) - 97, 8 - Number(s[1]))
const has = (moves: Move[], from: string, to: string) =>
  moves.some((m) => m.from === at(from) && m.to === at(to))

describe("opening position", () => {
  it("has exactly 20 legal moves", () => {
    expect(legalMoves(newGame())).toHaveLength(20)
  })

  it("gives black 20 after 1.e4", () => {
    const g = applyMove(newGame(), { from: at("e2"), to: at("e4"), dbl: true })
    expect(legalMoves(g)).toHaveLength(20)
  })

  // The classic perft check. If move generation is subtly wrong anywhere, this
  // is the number that catches it.
  it("has 400 positions after one move each", () => {
    let total = 0
    for (const m of legalMoves(newGame())) total += legalMoves(applyMove(newGame(), m)).length
    expect(total).toBe(400)
  })
})

describe("check", () => {
  it("sees a rook check down the file", () => {
    expect(inCheck(position({ e1: "K", e8: "r" }), "w")).toBe(true)
  })

  it("does not see one through a blocker", () => {
    expect(inCheck(position({ e1: "K", e4: "P", e8: "r" }), "w")).toBe(false)
  })

  it("refuses a move that leaves the king in check", () => {
    // The pawn is pinned to the king by the rook and cannot step aside.
    const g = position({ e1: "K", e2: "P", e8: "r" })
    expect(has(legalMoves(g), "e2", "d3")).toBe(false)
  })
})

describe("castling", () => {
  const base = (): Game => {
    const g = position({ e1: "K", h1: "R", a1: "R", e8: "k" })
    g.cast = { wK: true, wQ: true, bK: false, bQ: false }
    return g
  }

  it("allows both sides when the path is clear", () => {
    const moves = legalMoves(base())
    expect(has(moves, "e1", "g1")).toBe(true)
    expect(has(moves, "e1", "c1")).toBe(true)
  })

  it("moves the rook too", () => {
    const g = applyMove(base(), { from: at("e1"), to: at("g1"), castle: "K" })
    expect(g.board[at("f1")]).toEqual({ t: "r", c: "w" })
    expect(g.board[at("h1")]).toBeNull()
  })

  it("refuses to castle out of check", () => {
    const g = base()
    g.board[at("e5")] = { t: "r", c: "b" }
    expect(has(legalMoves(g), "e1", "g1")).toBe(false)
  })

  it("refuses to castle THROUGH an attacked square", () => {
    const g = base()
    g.board[at("f5")] = { t: "r", c: "b" } // attacks f1, the transit square
    expect(has(legalMoves(g), "e1", "g1")).toBe(false)
    // Queenside is untouched by that rook.
    expect(has(legalMoves(g), "e1", "c1")).toBe(true)
  })

  it("refuses when a piece is in the way", () => {
    const g = base()
    g.board[at("g1")] = { t: "n", c: "w" }
    expect(has(legalMoves(g), "e1", "g1")).toBe(false)
  })

  it("loses the right once the king moves", () => {
    const g = applyMove(base(), { from: at("e1"), to: at("e2") })
    expect(g.cast.wK).toBe(false)
    expect(g.cast.wQ).toBe(false)
  })

  it("loses one side's right when that rook moves", () => {
    const g = applyMove(base(), { from: at("h1"), to: at("h5") })
    expect(g.cast.wK).toBe(false)
    expect(g.cast.wQ).toBe(true)
  })
})

describe("en passant", () => {
  it("is offered only immediately after the double step", () => {
    let g = position({ e5: "P", d7: "p", e1: "K", e8: "k" }, "b")
    g = applyMove(g, { from: at("d7"), to: at("d5"), dbl: true })
    expect(g.ep).toBe(at("d6"))
    expect(has(legalMoves(g), "e5", "d6")).toBe(true)
  })

  it("removes the captured pawn from its own square, not the landing square", () => {
    let g = position({ e5: "P", d7: "p", e1: "K", e8: "k" }, "b")
    g = applyMove(g, { from: at("d7"), to: at("d5"), dbl: true })
    g = applyMove(g, { from: at("e5"), to: at("d6"), ep: true })
    expect(g.board[at("d6")]).toEqual({ t: "p", c: "w" })
    expect(g.board[at("d5")]).toBeNull()
  })

  it("expires after any other move", () => {
    let g = position({ e5: "P", d7: "p", e1: "K", e8: "k", h2: "P" }, "b")
    g = applyMove(g, { from: at("d7"), to: at("d5"), dbl: true })
    g = applyMove(g, { from: at("h2"), to: at("h3") })
    expect(g.ep).toBeNull()
  })
})

describe("promotion", () => {
  it("promotes on reaching the last rank", () => {
    const g = position({ a7: "P", e1: "K", e8: "k" })
    const move = legalMoves(g).find((m) => m.from === at("a7") && m.to === at("a8"))
    expect(move?.promo).toBe("q")
    expect(applyMove(g, move!).board[at("a8")]).toEqual({ t: "q", c: "w" })
  })

  it("promotes on a capture into the last rank", () => {
    const g = position({ a7: "P", b8: "r", e1: "K", e8: "k" })
    expect(legalMoves(g).find((m) => m.from === at("a7") && m.to === at("b8"))?.promo).toBe("q")
  })
})

describe("outcomes", () => {
  it("finds back-rank mate", () => {
    // King boxed in by its own pawns, rook on the back rank.
    const g = position({ h1: "K", g2: "P", h2: "P", a1: "r", e8: "k" })
    expect(outcome(g)).toEqual({ kind: "checkmate", winner: "b" })
  })

  it("finds stalemate and does NOT call it mate", () => {
    const g = position({ h1: "K", g3: "q", e8: "k" }, "w")
    expect(inCheck(g, "w")).toBe(false)
    expect(outcome(g)).toEqual({ kind: "stalemate" })
  })

  it("reports nothing while the game is alive", () => {
    expect(outcome(newGame())).toBeNull()
  })

  it("calls the fifty-move draw", () => {
    const g = position({ e1: "K", e8: "k", a1: "R" })
    g.half = 100
    expect(outcome(g)).toEqual({ kind: "fifty" })
  })
})

describe("the bots", () => {
  it("takes a free queen when it is looking", () => {
    // Black knight on c6 can take an undefended white queen on d4.
    const g = position({ e1: "K", e8: "k", d4: "Q", c6: "n" }, "b")
    const m = pickMove(g, { depth: 2, blunder: 0 }, () => 0.99)
    expect(m?.to).toBe(at("d4"))
  })

  it("blunders on demand — which is what makes a 250 a 250", () => {
    const g = position({ e1: "K", e8: "k", d4: "Q", c6: "n", h7: "p" }, "b")
    // rng always below the blunder threshold → a random legal move, and the
    // first random index lands on something other than the capture.
    const m = pickMove(g, { depth: 2, blunder: 1 }, () => 0)
    expect(m).not.toBeNull()
  })

  it("always returns a legal move", () => {
    const g = newGame()
    const black = applyMove(g, { from: at("e2"), to: at("e4"), dbl: true })
    const m = pickMove(black, { depth: 2, blunder: 0 })
    expect(legalMoves(black).some((x) => x.from === m!.from && x.to === m!.to)).toBe(true)
  })

  it("returns null when there is nothing to play", () => {
    const g = position({ h1: "K", g3: "q", e8: "k" }, "w")
    expect(pickMove(g, { depth: 1, blunder: 0 })).toBeNull()
  })
})

describe("pseudoMoves vs legalMoves", () => {
  it("pseudo includes the illegal king move that legal filters out", () => {
    const g = position({ e1: "K", d8: "r", e8: "k" })
    expect(pseudoMoves(g, "w").some((m) => m.to === at("d1"))).toBe(true)
    expect(has(legalMoves(g), "e1", "d1")).toBe(false)
  })
})
