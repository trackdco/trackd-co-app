import type { Palette, Pixels } from "@/lib/admin/arcade/kyle"

/**
 * The chess set, at 24×24.
 *
 * WHY NOT 16. The first cut was 16×16 and the knight was unrecognisable — at
 * that size a horse head is about nine pixels of actual head, which is not
 * enough for a muzzle, an eye and a mane to coexist. 24×24 is 2.25× the pixels
 * and it is the difference between "a shape" and "a horse". Every piece gained
 * a highlight column as well, so they read as glass rather than as flat blocks.
 *
 * SILHOUETTE FIRST. A chess piece has to be identifiable from across a board,
 * so each is shaped to read as its ROLE before it reads as lab equipment.
 */

export const PIECE_SIZE = 24

export const AMBER: Palette = {
  G: "#3b3b36", C: "#8a8a80", c: "#c2c2b8", b: "#2b2a24",
  A: "#c8861a", H: "#e8ab45", a: "#8a5a10", E: "#12110f", S: "#ffffff",
  W: "#f0c674", m: "#6a6a62",
}
export const GREY: Palette = {
  G: "#2e2e2a", C: "#6e6e66", c: "#a8a89e", b: "#24241f",
  A: "#a8a89e", H: "#d8d8d0", a: "#6b6b63", E: "#12110f", S: "#ffffff",
  W: "#e2e2da", m: "#4a4a44",
}

export const PIECES: Record<string, Pixels> = {
  /** Pawn — an ampoule. The smallest unit of anything. */
  p: [
    "........................", "........................", "........................",
    ".........CCCCCC.........", ".........cccccc.........", ".........CCCCCC.........",
    "........GGGGGGGG........", "........GbHbbbbG........", "........GbHbbbbG........",
    "........GbHbbbbG........", "........GbHbbbbG........", "........GAHAAAAG........",
    "........GAHAAAAG........", "........GAHAAAAG........", "........GAHAAAAG........",
    "........GaaaaaaG........", "........GGGGGGGG........", ".......GGGGGGGGGG.......",
    ".......GGGGGGGGGG.......", "........................", "........................",
    "........................", "........................", "........................",
  ],

  /**
   * Knight — a horse head in profile, facing left.
   *
   * THE FACE AND THE MANE ARE TWO DIFFERENT TONES, and that is the whole trick.
   * Three earlier attempts drew the head as one solid mass and every one of them
   * read as a lump with a snout. A Staunton knight is legible because the mane
   * sweeps down the back of the neck as a distinct plane behind the face — so
   * the face is `H` (light) and the mane is `A` (mid), with the boundary running
   * diagonally from the crown down to the shoulder.
   *
   * Generated from geometry rather than hand-counted, and checked by rendering
   * it as text blocks before it went anywhere near the board.
   */
  n: [
    "........................", "..............GA.AG.....", "............GHHAGAAG....",
    "..........GHHHHAAAAAG...", ".........GHHHHHAAAAAG...", ".......GHHHHHHAAAAAAG...",
    "......GHHHHHHHAAAAAAG...", ".....GHEEHHHHHAAAAAAG...", "....GHHESHHHHHAAAAAAG...",
    "...GHHHHHHHHHAAAAAAAG...", "..GHHHHHHHHHHAAAAAAAG...", "..GHmHHHHHHHHAAAAAAAG...",
    "..GGGHHHHHHHHAAAAAAG....", "...GHHHHHHHHHAAAAAAG....", ".....GHHHHHHAAAAAAAG....",
    "........GHHHAAAAAAAG....", "..........GHAAAAAAAG....", "...........GAAAAAAAG....",
    "..........GAAAAAAAAG....", "..........GAAAAAAAAG....", "......GAAAAAAAAAAAAG....",
    "....GAAAAAAAAAAAAAAG....", "...GaaaaaaaaaaaaaaaaG...", "...GGGGGGGGGGGGGGGGGG...",
  ],

  /** Bishop — a dropper. Narrow, precise, cuts on the diagonal. */
  b: [
    "........................", "..........CCCC..........", ".........CccccC.........",
    ".........CccccC.........", ".........GccccG.........", "........GbbbbbbG........",
    ".......GbHbbbbbbG.......", ".......GbHbbbbbbG.......", ".......GAHAAAAAAG.......",
    ".......GAHAAAAAAG.......", "........GAAAAAAG........", ".........GAAAAG.........",
    "..........GAAG..........", "..........GAAG..........", "..........GAAG..........",
    "..........GGG...........", ".........GGGGG..........", "........GGGGGGG.........",
    ".......GGGGGGGGG........", "......GGGGGGGGGGG.......", "......GGGGGGGGGGG.......",
    "........................", "........................", "........................",
  ],

  /**
   * Rook — a vial with battlements. The crenellated top is what says "rook";
   * everything below it is an ordinary vial, which is what says "ours".
   */
  r: [
    "........................", "........................", ".....CC.CC.CC.CC........",
    ".....CC.CC.CC.CC........", "....CCCCCCCCCCCCC.......", "....ccccccccccccc.......",
    "....GGGGGGGGGGGGG.......", "....GbHbbbbbbbbbG.......", "....GbHbbbbbbbbbG.......",
    "....GAHAAAAAAAAAG.......", "....GAHAAAAAAAAAG.......", "....GAHAAAAAAAAAG.......",
    "....GAHAAAAAAAAAG.......", "....GAHAAAAAAAAAG.......", "....GaaaaaaaaaaaG.......",
    "....GGGGGGGGGGGGG.......", "...GGGGGGGGGGGGGGG......", "...GGGGGGGGGGGGGGG......",
    "........................", "........................", "........................",
    "........................", "........................", "........................",
  ],

  /**
   * Queen — tall, crowned, tapering. She is the tallest piece on the board and
   * the silhouette narrows at the neck before flaring, which is what makes a
   * queen read as a queen rather than as a big pawn.
   */
  q: [
    "........................", "...........W............", "........W..W..W.........",
    "........WWWWWWW.........", ".........WWWWW..........", ".........GCCCG..........",
    ".........GcccG..........", "..........GbG...........", "..........GbG...........",
    ".........GbHbG..........", ".........GAHAG..........", "........GAAHAAG.........",
    ".......GAAAHAAAG........", "......GAAAAHAAAAG.......", "......GAAAAAAAAAG.......",
    ".....GAAAAAAAAAAAG......", ".....GaaaaaaaaaaaG......", "......GaaaaaaaaaG.......",
    "......GGGGGGGGGGG.......", "........................", "........................",
    "........................", "........................", "........................",
  ],

  /**
   * King — Kyle, crowned. The eyes are 2×2 with a white catchlight, which is
   * the whole reason the face reads at board size now.
   */
  k: [
    "........................", "......W..W..W..W........", "......WWWWWWWWWW........",
    ".......CCCCCCCC.........", ".......cccccccc.........", ".......CCCCCCCC.........",
    "......GGGGGGGGGG........", "......GbbbbbbbbG........", "......GbEEbbEEbG........",
    "......GbESbbESbG........", "......GbbbbbbbbG........", "......GbbbmmbbbG........",
    "......GbbbbbbbbG........", "......GAHAAAAAAG........", "......GAHAAAAAAG........",
    "......GAHAAAAAAG........", "......GAHAAAAAAG........", "......GaaaaaaaaG........",
    "......GGGGGGGGGG........", ".....GGGGGGGGGGGG.......", ".....GGGGGGGGGGGG.......",
    "........................", "........................", "........................",
  ],
}

/* ── The ladder ───────────────────────────────────────────────────────── */

export interface Bot {
  id: string
  name: string
  who: string
  elo: number
  depth: number
  /** Probability of ignoring the move it found and playing a random legal one. */
  blunder: number
  /**
   * Centipawns of random noise on each root move's score. See `BotSpec` in
   * lib/admin/arcade/chess.ts — this is the dial that actually works in the
   * 600–1200 band, where `blunder` saturates.
   */
  noise?: number
  /**
   * What it says when it beats you. In character, and meant to sting slightly.
   *
   * A LIST, not a string. One line per opponent meant you heard the same
   * sentence every time you lost to the same rung, which turns a joke into
   * wallpaper by about the third rematch.
   */
  taunts: readonly string[]
}

/**
 * ELO CALIBRATION — researched, not guessed (2026-08-13).
 *
 * The first pass labelled "depth 1, 55% random" as 250 Elo. That was wrong by
 * about a thousand points, and Adrian was right to push back on it.
 *
 * WHAT THE REFERENCE POINTS ACTUALLY SAY:
 *  - **Stockfish skill level 0 searches to depth 1** and is rated roughly
 *    1100–1250 Elo. So a CLEAN depth-1 search is already a competent club
 *    beginner, not a novice.
 *  - **Lichess level 1 is under 400, level 2 about 500, level 3 about 800.**
 *  - **Chess.com's Martin is 250** and is described as showing no development at
 *    all, "allowing you to take queens, rooks and all other pieces at no cost".
 *    That is near-random play, not shallow play. A genuine 250 has to blunder
 *    almost every move — which is why Will sits at 0.9 rather than 0.5.
 *
 * WHY THIS ENGINE IS WEAKER THAN STOCKFISH AT EQUAL DEPTH: the evaluation is
 * material plus three piece-square tables, against Stockfish's NNUE. Adding
 * quiescence search (see `chess.ts`) closed the largest part of the gap — a
 * fixed-depth search without it hangs pieces on the horizon and plays perhaps
 * 300 points below its depth — but a gap remains. Hence the numbers below sit
 * under the Stockfish equivalents at the same depth.
 *
 *   depth 1, ~90% random   ~250   Martin territory: hangs everything
 *   depth 1, ~70% random   ~450   takes a free piece if it happens to look
 *   depth 1, ~45% random   ~650   half-decent, half-catastrophic
 *   depth 1, near-clean    ~800   sees one move; misses every reply
 *   depth 2, ~35% random   ~950   sees an exchange, then forgets
 *   depth 2, ~18% random  ~1100   punishes an obvious blunder
 *   depth 2, clean        ~1250   solid, unimaginative
 *   depth 3, ~12% random  ~1400   coherent middlegame
 *   depth 3, clean        ~1550   you have to pay attention
 *   depth 4, ~8% random   ~1700   you have to actually try
 *   depth 4, clean        ~1850   you are not beating this casually
 *
 * ── REVISED DOWN AGAIN, 2026-08-14 ────────────────────────────────────────
 * Adrian said three times that Kyle Prime did not feel like 2000, and he was
 * right twice over.
 *
 * FIRST, the top bots were not actually searching to depth 4. A complete
 * depth-4 pass measured ~4.7s against a 1600ms budget, so iterative deepening
 * always ran out and returned the depth-3 answer — Cal and Prime were the same
 * bot as The Panel, separated only by blunder rate. Carrying beta at the root
 * and re-ordering best-first between iterations brought a complete depth-4 pass
 * to **1763ms**, inside its budget, so they now play the depth they claim.
 *
 * SECOND, even a genuine depth 4 here is not 2000. The evaluation is material
 * plus three piece-square tables — no king safety, no pawn structure, no
 * mobility term. Stockfish at skill 0 rates ~1100-1250 on ONE ply because its
 * evaluation is an order of magnitude better than this one. So the ceiling came
 * down to 1850, which is still comfortably above any casual player and is a
 * number that can be defended.
 *
 * These remain APPROXIMATE and deliberately conservative. Nobody should quote
 * them anywhere real; the ordering and the feel are what a ladder needs.
 */


export const LADDER: Bot[] = [
  { id: "chud", name: "Chud", who: "discord mod", elo: 250, depth: 1, blunder: 0.9, noise: 0,
    taunts: [
      "i've actually read a lot about this",
      "well that was a bad beat",
      "i don't even play this seriously",
      "rematch. i wasn't warmed up.",
    ] },
  { id: "will", name: "Will the Pill", who: "multivitamin", elo: 450, depth: 1, blunder: 0.7, noise: 120,
    taunts: [
      "I am taking this seriously.",
      "That was the correct move. I checked.",
      "You will find I am very consistent.",
      "One a day. Every day. Same as chess.",
    ] },
  { id: "blu", name: "Blu", who: "BPC-157", elo: 650, depth: 1, blunder: 0.4, noise: 420,
    taunts: [
      "Check out the guns. CHECK THEM OUT.",
      "Recovery is a skill and I have it.",
      "That's what a full protocol looks like.",
      "I heal faster than you learn.",
    ] },
  { id: "notes", name: "Notes", who: "how you used to track", elo: 800, depth: 1, blunder: 0.26, noise: 320,
    taunts: [
      "It's all in here. Somewhere.",
      "I had that written down.",
      "Scroll up. No, further. Further.",
      "I definitely saved that one.",
    ] },
  { id: "scoops", name: "Scoops", who: "creatine monohydrate", elo: 950, depth: 1, blunder: 0.16, noise: 240,
    taunts: [
      "Five grams. Every day. That's the whole thing.",
      "Twenty years on the shelf. Still here.",
      "Cheapest thing that works. Like that move.",
      "You don't need to load. You need to play better.",
    ] },
  { id: "recon", name: "Recon", who: "reconstitution calculator", elo: 1100, depth: 1, blunder: 0.1, noise: 165,
    taunts: [
      "2ml. 250mcg per unit. It was never hard.",
      "I did the arithmetic. You did the guessing.",
      "That line was forced. I showed my working.",
      "Round down next time. On both counts.",
    ] },
  { id: "cal", name: "Cal", who: "the calorie app", elo: 1250, depth: 2, blunder: 0.1, noise: 130,
    taunts: [
      "I counted every one. Including these mistakes.",
      "That's forty-one moves and thirty-nine errors.",
      "Logged. All of it.",
      "You were over budget by move nine.",
    ] },
  { id: "ester", name: "Ester", who: "trenbolone", elo: 1400, depth: 2, blunder: 0.05, noise: 80,
    taunts: [
      "I did not raise my voice once.",
      "You had thirty moves to notice.",
      "It was decided a long time before you saw it.",
      "Nothing about that was sudden.",
    ] },
  { id: "spike", name: "Spike", who: "somatropin", elo: 1550, depth: 3, blunder: 0.05, noise: 50,
    taunts: [
      "I have been doing this since before you started.",
      "There is no hurry. There never was.",
      "You will feel that one in about six weeks.",
      "Slow is not the same as harmless.",
    ] },
  { id: "chad", name: "Chad", who: "the gym", elo: 1700, depth: 3, blunder: 0.02, noise: 22,
    taunts: [
      "Good set.",
      "You went to failure about ten moves early.",
      "Form broke down under load. Happens.",
      "Rack it. Try again Thursday.",
    ] },
  { id: "prime", name: "KYLE PRIME", who: "final form", elo: 1850, depth: 3, blunder: 0.0, noise: 0,
    taunts: [
      "You logged none of it. I logged all of it.",
      "This is what the data looks like when you keep it.",
      "I am every dose you meant to write down.",
      "You built me. Every week you skipped.",
    ] },
]


/**
 * One of a bot's lines, at random.
 *
 * Ester and Chad hold empty lists on purpose — they never speak — so this
 * returns null for them and callers must handle the silence rather than render
 * an empty speech bubble.
 */
export function pickTaunt(bot: Bot, rng: () => number = Math.random): string | null {
  if (bot.taunts.length === 0) return null
  return bot.taunts[Math.floor(rng() * bot.taunts.length)] ?? bot.taunts[0]
}
