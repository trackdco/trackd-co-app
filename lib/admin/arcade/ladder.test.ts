import { describe, expect, it } from "vitest"

import { LADDER, PIECES, PIECE_SIZE } from "@/components/admin/arcade/pieces"
import { PORTRAITS } from "@/components/admin/arcade/portraits"

/**
 * Sprites are hand-authored strings, so one mistyped row is a silently skewed
 * image — the renderer just draws a short row and nothing complains. These are
 * the only thing between a typo and a knight with a dent in it.
 */
describe("chess piece sprites", () => {
  it("are all square at PIECE_SIZE", () => {
    for (const [name, rows] of Object.entries(PIECES)) {
      expect(rows, `${name} row count`).toHaveLength(PIECE_SIZE)
      for (const [i, row] of rows.entries()) {
        expect(row.length, `${name} row ${i}`).toBe(PIECE_SIZE)
      }
    }
  })

  it("cover all six piece types", () => {
    expect(Object.keys(PIECES).sort()).toEqual(["b", "k", "n", "p", "q", "r"])
  })

  it("give the king a face with catchlights", () => {
    const king = PIECES.k.join("")
    expect(king.split("E").length - 1).toBeGreaterThanOrEqual(4)
    expect(king.split("S").length - 1).toBe(2)
  })
})

describe("the ladder", () => {
  it("has a portrait for every rung", () => {
    for (const bot of LADDER) {
      expect(PORTRAITS[bot.id], `${bot.name} has no portrait`).toBeTypeOf("function")
    }
  })

  it("ascends in Elo with no ties", () => {
    const elos = LADDER.map((b) => b.elo)
    expect(elos).toEqual([...elos].sort((a, b) => a - b))
    expect(new Set(elos).size).toBe(elos.length)
  })

  /**
   * Strength must actually increase up the ladder.
   *
   * Blunder rate alone is NOT the invariant, because the two levers trade off:
   * The Calculator is a clean depth-1 (850) and The Greens is a depth-2 that
   * throws away 30% of its moves (1000). The second is stronger despite
   * blundering more, so the assertion has to be on the combination.
   *
   * The proxy weights a ply of search against how often the move survives, minus
   * a term for score noise — crude, but the same shape as the real relationship,
   * and it catches the thing that matters: a rung secretly weaker than the one
   * below it. Noise is weighted well under blunder because it is a much gentler
   * handicap: 120cp of misjudgement costs far less than a 12% chance of playing
   * a uniformly random move.
   */
  const strength = (b: (typeof LADDER)[number]) =>
    b.depth * 400 + (1 - b.blunder) * 400 - (b.noise ?? 0) * 0.3

  it("gets genuinely stronger every rung", () => {
    for (let i = 1; i < LADDER.length; i++) {
      expect(
        strength(LADDER[i]),
        `${LADDER[i].name} (${LADDER[i].elo}) is not stronger than ${LADDER[i - 1].name}`
      ).toBeGreaterThan(strength(LADDER[i - 1]))
    }
  })

  it("never searches shallower than the rung below", () => {
    for (let i = 1; i < LADDER.length; i++) {
      expect(LADDER[i].depth).toBeGreaterThanOrEqual(LADDER[i - 1].depth)
    }
  })

  /**
   * The published Elo must track the measured strength. If someone retunes a
   * bot without moving its label, the ladder starts lying about itself.
   */
  it("orders its Elo labels the same way it orders strength", () => {
    const byElo = [...LADDER].sort((a, b) => a.elo - b.elo).map((b) => b.id)
    const byStrength = [...LADDER].sort((a, b) => strength(a) - strength(b)).map((b) => b.id)
    expect(byElo).toEqual(byStrength)
  })

  /**
   * Several distinct lines each, not one. A single line per rung meant you heard
   * the same sentence every rematch, which turns a joke into wallpaper by about
   * the third one.
   */
  it("gives everyone several distinct lines, and no two shared", () => {
    const all = LADDER.flatMap((b) => b.taunts)
    expect(all.every((t) => t.trim().length > 0), "blank taunt").toBe(true)
    expect(new Set(all).size, "duplicate taunt").toBe(all.length)
    for (const b of LADDER) {
      expect(b.taunts.length, `${b.name} needs more than one line`).toBeGreaterThan(1)
    }
  })

  it("has unique ids and names", () => {
    expect(new Set(LADDER.map((b) => b.id)).size).toBe(LADDER.length)
    expect(new Set(LADDER.map((b) => b.name)).size).toBe(LADDER.length)
  })

  // The weakest rung has to actually be beatable by someone who has just
  // learned the rules, which means mostly-random rather than merely shallow.
  it("starts genuinely weak", () => {
    expect(LADDER[0].blunder).toBeGreaterThan(0.8)
    expect(LADDER[0].depth).toBe(1)
  })

  /**
   * Depth 3, not 4.
   *
   * This asserted `>= 4` on the assumption that deeper is stronger. Measured
   * against Stockfish (`scripts/chess-calibrate.mjs`), depth 3 with no blunder
   * scores 100% against SF at 1320 — about 1810 Elo, which is what the top rung
   * is meant to be. Depth 4 cost several times the search budget for no
   * measurable gain, and routinely failed to finish a pass inside its allowance,
   * which silently dropped it back to depth 3 anyway.
   */
  it("ends genuinely strong", () => {
    const top = LADDER[LADDER.length - 1]
    expect(top.blunder).toBe(0)
    expect(top.depth).toBeGreaterThanOrEqual(3)
  })
})
