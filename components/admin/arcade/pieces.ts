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
   * Knight — a horse head in profile. Ears up, mane down the back, muzzle to
   * the left, and a flared neck into the base. This is the piece the extra
   * resolution was for.
   */
  n: [
    "........................", "........................", ".........GG....GG.......",
    "........GHHG..GHHG......", "........GHHGGGGHHG......", ".......GHHHHHHHHHG......",
    "......GHHHHHHHHHHHG.....", ".....GHHHHHHHHHHHHG.....", "....GAHHHHHHHHHHHHG.....",
    "...GAAEHHHHHHHHHHHG.....", "...GASAAAHHHHHHHHHG.....", "..GAAAAAAAHHHHHHHHG.....",
    "..GAAAAAAAAAHHHHHHG.....", ".GAAGGGAAAAAAHHHHHG.....", ".GAGG..GAAAAAAHHHHG.....",
    ".GG.....GAAAAAAHHHG.....", "........GAAAAAAAHHG.....", "........GAAAAAAAAHG.....",
    ".......GGAAAAAAAAAGG....", "......GAAAAAAAAAAAAAG...", ".....GAAAAAAAAAAAAAAAG..",
    ".....GaaaaaaaaaaaaaaaG..", ".....GGGGGGGGGGGGGGGGG..", "........................",
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
  /** What it says when it beats you. In character, and meant to sting slightly. */
  taunt: string
  pal: Palette
  rows: Pixels
  /** Portrait animates its liquid level, for the ones that are gauges. */
  gauge?: boolean
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
 *   depth 1, clean         ~850   sees one move; misses every reply
 *   depth 2, ~30% random  ~1000   sees an exchange, then forgets
 *   depth 2, ~12% random  ~1200   punishes an obvious blunder
 *   depth 2, clean        ~1350   solid, unimaginative
 *   depth 3, ~8% random   ~1500   coherent middlegame
 *   depth 3, clean        ~1650   you have to pay attention
 *   depth 4, ~5% random   ~1850   you have to actually try
 *   depth 4 + quiescence  ~2000   you are not beating this casually
 *
 * These remain APPROXIMATE and are deliberately conservative. Nobody should
 * quote them anywhere real; the ordering and the feel are what a ladder needs.
 */

const CAP: Palette = { G: "#3a3a35", L: "#c9c9c2", D: "#6e6e66", d: "#525249", E: "#1b1a17", S: "#ffffff" }
const BLU: Palette = { G: "#123454", b: "#2f6fb5", B: "#4ea8ff", W: "#bfe4ff", C: "#8fa8c0", c: "#cfe4f5", E: "#0a1622", S: "#ffffff" }
const TUB: Palette = { G: "#3a3a35", L: "#e8e8e2", D: "#b9b9b0", c: "#ffffff", A: "#1b1a17", E: "#1b1a17", S: "#ffffff" }
const GRN: Palette = { G: "#1e3d1a", A: "#4f9c3a", a: "#356b27", L: "#7fd063", c: "#d9f2cd", E: "#0f1f0d", S: "#ffffff" }
const CAL: Palette = { G: "#3a3a35", b: "#1c1c1a", c: "#c2c2b8", S: "#4fb3a6", K: "#5a5a52", E: "#f0efe9", s: "#ffffff" }
const MAP: Palette = { G: "#3a3a35", b: "#4a4a45", A: "#c8861a", E: "#f0efe9", S: "#ffffff" }
const SPK: Palette = { G: "#4a4a45", b: "#2b2a24", A: "#8fd8cf", c: "#adada2", W: "#f0efe9", E: "#f0efe9", S: "#ffffff" }
const GAU: Palette = { G: "#4a4a45", b: "#2b2a24", A: "#d79422", c: "#adada2", E: "#f0efe9", S: "#ffffff" }
const PAN: Palette = { G: "#3a2f45", C: "#8b5fb0", c: "#c9a6e0", A: "#8e2f3f", a: "#5e1e2a", b: "#2b2733", E: "#f0efe9", S: "#ffffff" }
const APL: Palette = { G: "#8e8e88", A: "#ffffff", a: "#e8e8e2", L: "#ffffff", s: "#6b6b64", E: "#1b1a17", S: "#ffffff" }
const PRM: Palette = { G: "#3a2a08", A: "#ffb43c", a: "#c8861a", W: "#fff0c8", E: "#ef4444", S: "#ffffff", C: "#8a8a80", c: "#d8d8d0" }

export const LADDER: Bot[] = [
  { id: "will", name: "Will the Pill", who: "Milligram", elo: 250, depth: 1, blunder: 0.9,
    taunt: "Ha. Milligram does this better too.", pal: CAP, rows: [
    "................", ".....GGGGGG.....", "...GGLLLLLLGG...", "..GLLLLLLLLLLG..",
    "..GLLLLLLLLLLG..", "..GLLEELLEELLG..", "..GLLESLLESLLG..", "..GLLLLLLLLLLG..",
    "..GLLLLGGLLLLG..", "..GGGGGGGGGGGG..", "..GDDDDDDDDDDG..", "..GDDDDDDDDDDG..",
    "..GDDDDDDDDDDG..", "..GDDDDDDDDDDG..", "..GdddddddddDG..", "...GdddddddDG...",
    ".....GGGGGG.....", "................"] },

  { id: "blu", name: "Blu", who: "PepMod", elo: 450, depth: 1, blunder: 0.7,
    taunt: "Peptides beat glassware, mate.", pal: BLU, rows: [
    "................", "....CCCCCCCC....", "....cccccccc....", "....CCCCCCCC....",
    "..GGGGGGGGGGGG..", "..GWbbbbbbbbWG..", "..GWbEEbbEEbWG..", "..GWbESbbESbWG..",
    "..GWbbbbbbbbWG..", "..GBBBBBBBBBBG..", "..GBBBBBBBBBBG..", "..GBBBBBBBBBBG..",
    "..GBBBBBBBBBBG..", "..GBBBBBBBBBBG..", "..GbbbbbbbbbbG..", "..GGGGGGGGGGGG..",
    "...GGGGGGGGGG...", "................"] },

  { id: "tubbs", name: "Tubbs", who: "IM8", elo: 650, depth: 1, blunder: 0.45,
    taunt: "Scoop a day. You clearly missed a few.", pal: TUB, rows: [
    "................", "..GGGGGGGGGGGG..", "..GccccccccccG..", "..GGGGGGGGGGGG..",
    "..GLLLLLLLLLLG..", "..GLLEELLEELLG..", "..GLLESLLESLLG..", "..GLLLLLLLLLLG..",
    "..GLLLAAAALLLG..", "..GLLLLLLLLLLG..", "..GDDDDDDDDDDG..", "..GDDDDDDDDDDG..",
    "..GDDDDDDDDDDG..", "..GDDDDDDDDDDG..", "..GDDDDDDDDDDG..", "..GGGGGGGGGGGG..",
    "................", "................"] },

  { id: "calc", name: "The Calculator", who: "recon maths", elo: 850, depth: 1, blunder: 0.0,
    taunt: "I did the maths. You are not the variable that mattered.", pal: CAL, rows: [
    "................", "..GGGGGGGGGGGG..", "..GccccccccccG..", "..GcSSSSSSSScG..",
    "..GccccccccccG..", "..GGGGGGGGGGGG..", "..GbEEbbbbEEbG..", "..GbESbbbbESbG..",
    "..GbbbbbbbbbbG..", "..GKKbKKbKKbbG..", "..GKKbKKbKKbbG..", "..GbbbbbbbbbbG..",
    "..GKKbKKbKKbbG..", "..GKKbKKbKKbbG..", "..GbbbbbbbbbbG..", "..GGGGGGGGGGGG..",
    "................", "................"] },

  { id: "greens", name: "The Greens", who: "greens powder", elo: 1000, depth: 2, blunder: 0.3,
    taunt: "Not enough micronutrients in that opening.", pal: GRN, rows: [
    "................", "...GGG....GGG...", "...GcG....GcG...", "..GGGGGGGGGGGG..",
    "..GLAAAAAAAALG..", "..GAAAAAAAAAAG..", "..GAAEEAAEEAAG..", "..GAAESAAESAAG..",
    "..GAAAAccAAAAG..", "..GAAAAAAAAAAG..", "..GaaaaaaaaaaG..", "..GaaaaaaaaaaG..",
    "..GaaaaaaaaaaG..", "..GaaaaaaaaaaG..", "..GaaaaaaaaaaG..", "..GGGGGGGGGGGG..",
    "................", "................"] },

  { id: "map", name: "The Map", who: "site rotation", elo: 1200, depth: 2, blunder: 0.12,
    taunt: "Wrong site. Wrong square. Same problem.", pal: MAP, rows: [
    "................", "......GGGG......", "......GbbG......", "......GEEG......",
    "......GSSG......", "....GGGGGGGG....", "...GbAbbbbAbG...", "...GbbbbbbbbG...",
    "...GbbAbbAbbG...", "...GbbbbbbbbG...", "....GbbbbbbG....", "....GbAbbAbG....",
    "....GbbbbbbG....", "....GGbbbbGG....", "...GbbG..GbbG...", "...GbbG..GbbG...",
    "...GGGG..GGGG...", "................"] },

  { id: "spike", name: "Spike", who: "GHK-Cu", elo: 1350, depth: 2, blunder: 0.0,
    taunt: "Copper peptides. Copper brain.", pal: SPK, rows: [
    "................", ".......GG.......", ".......GG.......", ".......GG.......",
    "......GccG......", "....GGGGGGGG....", "....GbbbbbbG....", "....GbEEbEEG....",
    "....GbESbESG....", "....GbbbbbbG....", "....GAAAAAAG....", "....GAAAAAAG....",
    "....GAAAAAAG....", "....GaaaaaaG....", "....GGGGGGGG....", "....GccccccG....",
    "....GGGGGGGG....", "................"] },

  { id: "gauge", name: "The Gauge", who: "the draw", elo: 1500, depth: 3, blunder: 0.08,
    taunt: "Drawn up, pushed out. Same as your position.", pal: GAU, gauge: true, rows: [
    "................", ".......GG.......", ".......GG.......", "......GccG......",
    "....GGGGGGGG....", "....GbEEbEEG....", "....GbESbESG....", "....GbbbbbbG....",
    "....GAAAAAAG....", "....GAAAAAAG....", "....GAAAAAAG....", "....GAAAAAAG....",
    "....GAAAAAAG....", "....GAAAAAAG....", "....GGGGGGGG....", "....GccccccG....",
    "....GGGGGGGG....", "................"] },

  { id: "panel", name: "The Panel", who: "bloodwork", elo: 1650, depth: 3, blunder: 0.0,
    taunt: "Your markers are fine. Your chess is not.", pal: PAN, rows: [
    "................", ".....CCCCCC.....", ".....cccccc.....", ".....CCCCCC.....",
    "....GGGGGGGG....", "....GbbbbbbG....", "....GbEEbEEG....", "....GbESbESG....",
    "....GbbbbbbG....", "....GAAAAAAG....", "....GAAAAAAG....", "....GAAAAAAG....",
    "....GAAAAAAG....", "....GaaaaaaG....", "....GaaaaaaG....", "....GGGGGGGG....",
    ".....GGGGGG.....", "................"] },

  { id: "cal", name: "Cal", who: "Cal AI", elo: 1850, depth: 4, blunder: 0.05,
    taunt: "I counted every calorie and every one of your mistakes.", pal: APL, rows: [
    "................", "........s.......", ".......ss.......", "......LLss......",
    "....GGAAAAGG....", "...GAAAAAAAAG...", "..GAAAAAAAAAAG..", "..GAAEEAAEEAAG..",
    "..GAAESAAESAAG..", "..GAAAAAAAAAAG..", "..GAAAAAAAAAAG..", "..GaaAAAAAAaaG..",
    "..GaaaaAAaaaaG..", "...GaaaaaaaaG...", "....GGaaaaGG....", "......GGGG......",
    "................", "................"] },

  { id: "prime", name: "KYLE PRIME", who: "you, if you'd tracked everything", elo: 2000, depth: 4, blunder: 0.0,
    taunt: "You never logged a single dose. I logged all of them.", pal: PRM, rows: [
    "....................", "......CCCCCCCC......", "......cccccccc......", "......CCCCCCCC......",
    "....GGGGGGGGGGGG....", "...GGWWWWWWWWWWGG...", "..GG.GWEEWWEEWG.GG..", "..GG.GWSEWWESWG.GG..",
    "..GG.GWWWWWWWWG.GG..", "..GG.GAAAAAAAAG.GG..", "..GGGGAAAAAAAAGGGG..", "..GGGGAAAAAAAAGGGG..",
    "..GG.GAAAAAAAAG.GG..", "..GG.GAAAAAAAAG.GG..", ".....GAAAAAAAAG.....", ".....GAAAAAAAAG.....",
    ".....GaaaaaaaaG.....", ".....GaaaaaaaaG.....", ".....GGGGGGGGGG.....", "......GGGGGGGG......",
    "....................", "...................."] },
]
