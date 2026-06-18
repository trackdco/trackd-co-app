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
  )} ${word} — both include ${list(shared)}. Only add ${adding.label} if you want to track ${
    shared.length > 1 ? "those" : "it"
  } from each.`
}
