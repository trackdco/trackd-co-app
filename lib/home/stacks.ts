/**
 * Stacks — a DISPLAY GROUPING over compounds taken at the same time (Spec 05).
 *
 * **A stack is not a container.** Every member keeps its own schedule, dose, log
 * entries and history; removing a compound from a stack changes nothing about
 * that compound. That is not a convention to uphold here — it is structural:
 * a `Stack` holds a name, a colour and a list of member IDS, and there is no
 * field on it for a dose, a schedule, a time or a log. The grouping cannot own
 * what it has nowhere to put.
 *
 * A stack means compounds INJECTED AT THE SAME TIME, not compounds combined into
 * one substance. Blends — several peptides genuinely sharing a vial — already
 * exist as single catalogue compounds and are a different thing entirely;
 * nothing here reads or offers them.
 *
 * Persisted device-local (the synchronous, offline read path) and mirrored to
 * Postgres `stacks` + `stack_members` (`supabase/protocol/007`), the same shape
 * as the rest of the protocol data.
 *
 * Pure data + pure helpers + guarded storage only; no React (`code-standards.md`).
 */
import { DEFAULT_PALETTE_COLOUR, isPaletteColour, type PaletteColour } from "@/lib/palette"

/** Stack names reuse the compound picker's existing limit — not a new one. */
export const STACK_NAME_MAX = 80

export interface Stack {
  id: string
  /** Required, user-chosen. Cycles are unnamed; stacks are the named thing. */
  name: string
  colour: PaletteColour
  /**
   * ORDERED references to `StackCompound.id`. References — deleting the stack
   * drops this list and nothing else. A compound id appears at most once here,
   * and at most once across ALL stacks (see {@link setStackMembers}).
   */
  memberIds: string[]
}

const storageKey = (userId: string) => `trackd.stacks.v1.${userId}`

/* ----------------------------------------------------------------- storage */

export function loadStacks(userId: string): Stack[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: Stack[] = []
    for (const item of parsed) {
      const s = normalizeStack(item)
      if (s) out.push(s)
    }
    return dedupeMembership(out)
  } catch {
    return []
  }
}

export function saveStacks(userId: string, stacks: Stack[]): boolean {
  if (typeof window === "undefined") return false
  try {
    window.localStorage.setItem(
      storageKey(userId),
      JSON.stringify(dedupeMembership(stacks))
    )
    return true
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ queries */

/** The stack a compound belongs to, or null. A compound has at most one. */
export function stackOf(stacks: Stack[], compoundId: string): Stack | null {
  for (const s of stacks) {
    if (s.memberIds.includes(compoundId)) return s
  }
  return null
}

/** Every compound id that is in some stack — what the "add members" picker
 *  excludes, so only unstacked compounds are offered. */
export function stackedIds(stacks: Stack[]): Set<string> {
  const out = new Set<string>()
  for (const s of stacks) for (const id of s.memberIds) out.add(id)
  return out
}

/**
 * Split a list of compound ids into the stacks they belong to and the loose
 * remainder — the dashboard's one pass. A member renders inside its stack row
 * and must NOT also appear in its category section, so this returns a partition
 * rather than two independently-filtered lists that could drift.
 *
 * Stacks come back in their stored order, each carrying only the members
 * actually present in `ids` (so a member not due today doesn't create a ghost).
 */
export function partitionByStack(
  ids: string[],
  stacks: Stack[]
): { stacks: { stack: Stack; memberIds: string[] }[]; loose: string[] } {
  const present = new Set(ids)
  const claimed = new Set<string>()
  const grouped: { stack: Stack; memberIds: string[] }[] = []

  for (const s of stacks) {
    const members = s.memberIds.filter((id) => present.has(id))
    if (members.length === 0) continue
    for (const id of members) claimed.add(id)
    grouped.push({ stack: s, memberIds: members })
  }

  return { stacks: grouped, loose: ids.filter((id) => !claimed.has(id)) }
}

/* ---------------------------------------------------------------- mutations */

/**
 * Replace a stack's members. **This is where the one-stack-per-compound rule is
 * enforced**: any id added here is removed from every other stack first, so the
 * invariant holds by construction rather than by a check a caller might skip.
 * Duplicates within the list are collapsed.
 */
export function setStackMembers(
  stacks: Stack[],
  stackId: string,
  memberIds: string[]
): Stack[] {
  const unique = [...new Set(memberIds)]
  const taken = new Set(unique)
  return stacks.map((s) =>
    s.id === stackId
      ? { ...s, memberIds: unique }
      : { ...s, memberIds: s.memberIds.filter((id) => !taken.has(id)) }
  )
}

/**
 * Drop a compound from whichever stack holds it — what deleting a compound
 * triggers. The stack SURVIVES with one fewer member (Spec 05), and the
 * compound's logged history is untouched because none of it lives here.
 */
export function removeMemberEverywhere(
  stacks: Stack[],
  compoundId: string
): Stack[] {
  return stacks.map((s) =>
    s.memberIds.includes(compoundId)
      ? { ...s, memberIds: s.memberIds.filter((id) => id !== compoundId) }
      : s
  )
}

/** Delete the stack itself. Ungroups its members; nothing else changes. */
export function removeStack(stacks: Stack[], stackId: string): Stack[] {
  return stacks.filter((s) => s.id !== stackId)
}

/* ---------------------------------------------------------------- internals */

/** Belt-and-braces for stored data: if two stacks somehow claim the same
 *  compound, the FIRST keeps it. Reading can then never show a compound twice. */
function dedupeMembership(stacks: Stack[]): Stack[] {
  const seen = new Set<string>()
  return stacks.map((s) => {
    const memberIds: string[] = []
    for (const id of s.memberIds) {
      if (seen.has(id)) continue
      seen.add(id)
      memberIds.push(id)
    }
    return { ...s, memberIds }
  })
}

function normalizeStack(item: unknown): Stack | null {
  if (!item || typeof item !== "object") return null
  const s = item as Record<string, unknown>
  if (typeof s.id !== "string" || typeof s.name !== "string") return null
  const name = s.name.trim().slice(0, STACK_NAME_MAX)
  if (name === "") return null
  const memberIds = Array.isArray(s.memberIds)
    ? s.memberIds.filter((m): m is string => typeof m === "string")
    : []
  return {
    id: s.id,
    name,
    colour: isPaletteColour(s.colour) ? s.colour : DEFAULT_PALETTE_COLOUR,
    memberIds: [...new Set(memberIds)],
  }
}
