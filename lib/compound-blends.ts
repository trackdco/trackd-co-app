/**
 * Named blend ("stack") products — single catalogue compounds that bundle several
 * peptides (Wolverine / Glow / KLOW). A blend is tracked as ONE unit: its
 * constituents are never separate, individually-loggable rows. If a user wants
 * more of one specific compound they add THAT compound on its own — they don't
 * break the blend apart (Adrian's call).
 *
 * This module is the single source of what each blend contains. Its only job is
 * to flag an OVERLAP — when a user adds a compound that's already covered by a
 * blend they track (or adds a blend covering something they already track). The
 * flag is a heads-up, never a block: stacking another dose on purpose is allowed.
 *
 * Keyed by each blend's EXACT catalogue name; constituents are EXACT catalogue
 * compound names (see lib/compounds-catalogue.ts). Pure data + pure helpers —
 * no React, no storage.
 */

export interface Blend {
  /** Exact catalogue name, e.g. "Glow (BPC-157 + TB-500 + GHK-Cu)". */
  name: string
  /** Short label for messaging, e.g. "Glow". */
  label: string
  /** Exact catalogue names of the compounds it contains. */
  contains: string[]
}

export const BLENDS: Blend[] = [
  {
    name: "Wolverine (BPC-157 + TB-500)",
    label: "Wolverine",
    contains: ["BPC-157", "TB-500"],
  },
  {
    name: "Glow (BPC-157 + TB-500 + GHK-Cu)",
    label: "Glow",
    contains: ["BPC-157", "TB-500", "GHK-Cu"],
  },
  {
    name: "KLOW (BPC-157 + TB-500 + GHK-Cu + KPV)",
    label: "KLOW",
    contains: ["BPC-157", "TB-500", "GHK-Cu", "KPV"],
  },
]

const norm = (s: string) => s.trim().toLowerCase()
const blendByName = new Map(BLENDS.map((b) => [norm(b.name), b]))

/** The blend with this exact catalogue name, or null if it isn't a blend. */
export function blendFor(name: string): Blend | null {
  return blendByName.get(norm(name)) ?? null
}

/** True if this catalogue name is one of the named blends. */
export function isBlend(name: string): boolean {
  return blendByName.has(norm(name))
}

/**
 * What a stack entry "covers": a blend → its constituents; any other compound →
 * just itself. Lets overlap be a plain set-intersection regardless of whether the
 * entry is a blend or a single compound.
 */
export function coveredCompounds(name: string): string[] {
  const b = blendFor(name)
  return b ? b.contains : [name]
}

export interface BlendOverlap {
  /** The existing stack entry that overlaps (its display name). */
  withName: string
  /** Short label — the blend label, else the compound name. */
  withLabel: string
  /** Whether the existing entry is itself a blend. */
  withIsBlend: boolean
  /** The compound name(s) the two share. */
  shared: string[]
}

const unique = (xs: string[]): string[] => [...new Set(xs)]

/**
 * Detect overlap between a compound being added and the names already in the
 * user's stack. Works both ways: adding a constituent a tracked blend already
 * contains, OR adding a blend that contains something already tracked. Returns
 * every distinct overlap (an entry never overlaps its own re-add). Empty when
 * there's nothing to flag.
 */
export function findBlendOverlaps(
  addingName: string,
  stackNames: string[]
): BlendOverlap[] {
  const addingCovers = new Set(coveredCompounds(addingName).map(norm))
  const out: BlendOverlap[] = []
  for (const existing of stackNames) {
    if (norm(existing) === norm(addingName)) continue
    const shared = coveredCompounds(existing).filter((c) =>
      addingCovers.has(norm(c))
    )
    if (shared.length === 0) continue
    const b = blendFor(existing)
    out.push({
      withName: existing,
      withLabel: b?.label ?? existing,
      withIsBlend: b !== null,
      shared,
    })
  }
  return out
}

/** "a" · "a and b" · "a, b and c". */
function list(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? ""
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`
}

/**
 * A friendly, non-advice heads-up describing the overlap(s), or null when there
 * are none. Phrased by direction: adding a blend that covers compounds you track,
 * vs adding a single compound a blend you track already includes.
 */
export function describeBlendOverlap(
  addingName: string,
  overlaps: BlendOverlap[]
): string | null {
  if (overlaps.length === 0) return null
  const adding = blendFor(addingName)

  // Adding a single compound one or more tracked blends already include.
  if (!adding) {
    const names = unique(overlaps.map((o) => o.withLabel))
    const word = names.length > 1 ? "stacks" : "stack"
    return `${addingName} is already in your ${list(
      names
    )} ${word}. Only add it separately if you want an extra dose on top.`
  }

  // Adding a blend whose constituents you already track.
  const shared = unique(overlaps.flatMap((o) => o.shared))
  // Common case: those constituents are tracked on their own.
  if (overlaps.every((o) => !o.withIsBlend)) {
    const own = shared.length > 1 ? "which you track on your own" : "which you track on its own"
    const extra = shared.length > 1 ? "those extra doses" : "that extra dose"
    return `${adding.label} already includes ${list(
      shared
    )}, ${own}. Only add ${adding.label} if you want ${extra}.`
  }
  // Edge: the overlap is with another blend (e.g. Glow while you track KLOW).
  const names = unique(overlaps.map((o) => o.withLabel))
  const word = names.length > 1 ? "stacks" : "stack"
  return `${adding.label} overlaps with your ${list(
    names
  )} ${word}. Both include ${list(shared)}. Only add ${adding.label} if you want to track ${
    shared.length > 1 ? "those" : "it"
  } from each.`
}

/* ------------------------------------------------------------- components */

/**
 * One part of a compound, for the half-life curves (build brief §5, item 9).
 *
 * A blend draws one line per component (Sorbet, told apart by dash too), and
 * each component has its own half-life, read from the catalogue by `name` —
 * never restated here, so a retuned half-life in `compounds.csv` moves the line.
 */
export interface BlendComponent {
  /** Exact catalogue name. Its half-life and "est." flag come from there. */
  name: string
  /** The short label on its tab ("BPC"). */
  label: string
  /** How much of this component ONE unit of the compound's dose holds, in
   *  {@link unit}: Glow's 1750 mcg dose is 250 BPC-157 : 250 TB-500 : 1250
   *  GHK-Cu, so BPC-157 is 1/7. The dose unit is {@link per} when set. */
  perDoseUnit: number
  /** The component's own unit when it differs from the compound's: NDT is
   *  dosed in mg of tablet, its T4 is counted in mcg. Absent = the same. */
  unit?: string
  /** The dose unit {@link perDoseUnit} counts per, when it is a fixed one:
   *  NDT's parts are per mg of tablet, so a dose added in mcg is converted to
   *  mg first. Absent = whatever unit the compound is dosed in (a same-unit
   *  blend splits its dose as it is). */
  per?: string
}

/**
 * The make-up of every compound that is more than one thing, keyed by exact
 * catalogue name. The blend ratios are the ones the half-life design was drawn
 * with (the preview, 2026-09-24): Wolverine and CJC + Ipamorelin 1:1, Glow
 * 1:1:5, KLOW 1:1:5:1. NDT is labelled per grain (60 mg): 38 mcg T4 and 9 mcg T3.
 *
 * Deliberately NOT {@link BLENDS}: that list drives the overlap heads-up, and
 * adding NDT or CJC + Ipamorelin there would start flagging T3 or Ipamorelin
 * against them — a behaviour change nobody asked for.
 */
const COMPONENTS: Record<string, BlendComponent[]> = {
  "wolverine (bpc-157 + tb-500)": [
    { name: "BPC-157", label: "BPC", perDoseUnit: 1 / 2 },
    { name: "TB-500", label: "TB", perDoseUnit: 1 / 2 },
  ],
  "glow (bpc-157 + tb-500 + ghk-cu)": [
    { name: "BPC-157", label: "BPC", perDoseUnit: 1 / 7 },
    { name: "TB-500", label: "TB", perDoseUnit: 1 / 7 },
    { name: "GHK-Cu", label: "GHK", perDoseUnit: 5 / 7 },
  ],
  "klow (bpc-157 + tb-500 + ghk-cu + kpv)": [
    { name: "BPC-157", label: "BPC", perDoseUnit: 1 / 8 },
    { name: "TB-500", label: "TB", perDoseUnit: 1 / 8 },
    { name: "GHK-Cu", label: "GHK", perDoseUnit: 5 / 8 },
    { name: "KPV", label: "KPV", perDoseUnit: 1 / 8 },
  ],
  "cjc-1295 + ipamorelin": [
    { name: "CJC-1295 (no DAC)", label: "CJC", perDoseUnit: 1 / 2 },
    { name: "Ipamorelin", label: "IPA", perDoseUnit: 1 / 2 },
  ],
  "natural desiccated thyroid": [
    { name: "Levothyroxine (T4)", label: "T4", perDoseUnit: 38 / 60, unit: "mcg", per: "mg" },
    { name: "Liothyronine (T3)", label: "T3", perDoseUnit: 9 / 60, unit: "mcg", per: "mg" },
  ],
}

/** The components of this compound, or null when it is a single compound. */
export function componentsOf(name: string): BlendComponent[] | null {
  return COMPONENTS[norm(name)] ?? null
}
