/**
 * Stacks — a DISPLAY GROUPING over compounds taken at the same time (Spec 05).
 *
 * **A stack is not a container.** Every member keeps its own schedule, dose, log
 * entries and history; removing a compound from a stack changes nothing about
 * that compound. That is not a convention to uphold here — it is structural:
 * a `Stack` holds a name, a colour and a list of member REFERENCES, and there is
 * no field on it for a dose, a schedule, a time or a log. The grouping cannot own
 * what it has nowhere to put.
 *
 * A stack means compounds INJECTED AT THE SAME TIME, not compounds combined into
 * one substance. Blends — several peptides genuinely sharing a vial — already
 * exist as single catalogue compounds and are a different thing entirely;
 * nothing here reads or offers them.
 *
 * **A grouping is dated, exactly like a schedule** (Spec 01's rule, applied to
 * the one part of the protocol that was missing it). A stack created today
 * describes today forward; it does not reach back and re-draw days that were
 * already lived. Before this, `partitionByStack` was handed the day's due
 * compounds and no date at all, so a stack made this morning wrapped every day in
 * the user's history — a stack named "Vitamins" appeared on days when only
 * creatine existed, and adding a member next month would have re-grouped every
 * day before it joined. Membership carries the same dating, so a member shows
 * inside the stack only on the days it was actually in it.
 *
 * Persisted device-local (the synchronous, offline read path) and mirrored to
 * Postgres `stacks` + `stack_members` (`supabase/protocol/007`, dated by `013`),
 * the same shape as the rest of the protocol data.
 *
 * Pure data + pure helpers + guarded storage only; no React (`code-standards.md`).
 */
import { DEFAULT_PALETTE_COLOUR, isPaletteColour, type PaletteColour } from "@/lib/palette"
import { pushStacks } from "@/lib/home/stackSync"
// Function-level use only (inside `commit`), so the stack.ts ⇄ stacks.ts cycle
// is resolved long before either is called.
import { loadStack } from "@/lib/home/stack"
import { toDateKey, type DateKey } from "@/lib/home/mockHomeData"
import { trackCriticalSync } from "@/lib/home/syncStatus"

/** Stack names reuse the compound picker's existing limit — not a new one. */
export const STACK_NAME_MAX = 80

/**
 * One compound's spell inside one stack.
 *
 * A REFERENCE plus the days it applied for — nothing else. There is deliberately
 * no dose, time or log field here either: dating the membership must not become
 * a back door through which a stack starts owning its members.
 */
export interface StackMembership {
  /** References `StackCompound.id`. */
  compoundId: string
  /** Local "YYYY-MM-DD" — the first day this compound was in the stack. */
  from: DateKey
  /**
   * EXCLUSIVE end — the first day it was no longer in the stack. Absent means it
   * still is. Exclusive rather than inclusive so `from === to` is the empty span
   * (joined and left the same day), which {@link pruneEmpty} drops rather than
   * storing a membership that covers no day at all.
   */
  to?: DateKey
  /** Display order within the stack. Mirrors `stack_members.position` 1:1. */
  position: number
}

export interface Stack {
  id: string
  /** Required, user-chosen. Cycles are unnamed; stacks are the named thing. */
  name: string
  colour: PaletteColour
  /**
   * Local "YYYY-MM-DD" — the day this stack began grouping. Days before it show
   * the members ungrouped, in their category sections, which is what those days
   * actually looked like.
   */
  effectiveFrom: DateKey
  /**
   * Every spell any compound has had in this stack, past and present. One list,
   * not a current-members list beside a history list: two would drift, and the
   * drift would be invisible until someone scrolled back a month.
   *
   * A compound appears at most once with an OPEN span here, and at most once
   * across ALL stacks (see {@link setStackMembers}). It may appear more than once
   * with closed spans — leaving a stack and rejoining it later is two spells.
   */
  members: StackMembership[]
  /**
   * TRUE when `effectiveFrom` is a GUESS, not a record — set only by the v1→v2
   * migration, which finds a stack with no dates at all and can do no better than
   * "today". It is what stops that guess being written over the server's real
   * `stacks.created_at`: `pushStacks` omits the column for a provisional stack,
   * so an upsert leaves the true date alone, and `hydrateStacks` clears the flag
   * once it has adopted that date. Absent on every stack the app itself created.
   */
  provisionalStart?: boolean
}

/**
 * What the editing UI works in: present-tense membership, no dates. The store
 * turns this into spans against today, so every screen that changes a stack goes
 * through the same dating logic and none of them has to think about it.
 */
export interface StackDraft {
  id: string
  name: string
  colour: PaletteColour
  memberIds: string[]
}

const storageKey = (userId: string) => `trackd.stacks.v2.${userId}`
/** Pre-dating stacks (`{ memberIds: string[] }`). Migrated on first read. */
const legacyStorageKey = (userId: string) => `trackd.stacks.v1.${userId}`

/** Today as a local date key — the day every membership change takes effect. */
function todayKey(): DateKey {
  return toDateKey(new Date())
}

/* ----------------------------------------------------------------- storage */

export function loadStacks(userId: string): Stack[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (raw === null) return migrateLegacy(userId)
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

/**
 * Read the pre-dating store and date it, so an existing user keeps their stacks.
 *
 * The old shape recorded no dates, so the true start is unknowable from the
 * device — TODAY is the honest answer here, and it errs the safe way: the stack
 * under-groups the days between its real creation and now, rather than falsely
 * claiming days it never covered (the bug this whole change exists to fix).
 * Postgres does know (`stacks.created_at`), and `hydrateStacks` adopts the pulled
 * `effective_from` on the next sync, which corrects it for good.
 */
function migrateLegacy(userId: string): Stack[] {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(legacyStorageKey(userId))
  } catch {
    return []
  }
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const today = todayKey()
    const out: Stack[] = []
    for (const item of parsed) {
      const s = normalizeStack(item, today)
      if (s) out.push(s)
    }
    const migrated = dedupeMembership(out)
    // A failed write (quota, storage off) is not fatal — the caller still gets
    // the migrated list — but it does mean the next read re-migrates and
    // recomputes "today", so the guessed start slides forward a day at a time
    // until a write lands. `provisionalStart` is what makes that recoverable:
    // hydration replaces the guess with the server's real date regardless.
    //
    // The v1 key is deliberately NOT cleared: it costs nothing, and a rollback
    // to the previous bundle would otherwise find no stacks at all.
    saveStacks(userId, migrated)
    return migrated
  } catch {
    return []
  }
}

/**
 * The name an unnamed stack gets: "Stack 1", "Stack 2", … (Adrian's call — Spec
 * 05 made the name required; a blank one now falls back rather than blocking).
 *
 * Picks the LOWEST free number rather than `count + 1`, so deleting "Stack 2" of
 * three and adding another reuses 2 instead of minting "Stack 4" beside an
 * existing one. Only auto-generated names are considered, so a stack the user
 * genuinely called "Stack 3" is respected and skipped over.
 */
export function nextStackName(stacks: Stack[]): string {
  const taken = new Set<number>()
  for (const s of stacks) {
    const m = /^Stack (\d+)$/.exec(s.name.trim())
    if (m) taken.add(Number(m[1]))
  }
  let n = 1
  while (taken.has(n)) n += 1
  return `Stack ${n}`
}

/* ------------------------------------------------------------------ queries */

/**
 * Deterministic member order: the stored position, then the id so a tie never
 * renders differently between two reads.
 *
 * Positions are assigned ONCE per membership and never restated (see
 * {@link setStackMembers}), so a past day keeps the order it actually had. They
 * were briefly renumbered 0..n-1 on every save, which silently reordered history:
 * removing the first of two members renumbered the second to 0, colliding with
 * the closed span still holding 0, and the tie-break then flipped the pair on
 * every day before the removal.
 */
function byPosition(a: StackMembership, b: StackMembership): number {
  return a.position - b.position || a.compoundId.localeCompare(b.compoundId)
}

/** Was this stack grouping anything yet on `dateKey`? */
export function stackStartedOn(stack: Stack, dateKey: DateKey): boolean {
  return dateKey >= stack.effectiveFrom
}

/**
 * The memberships in force on `dateKey`, in display order.
 *
 * Gated on the stack's own start as well as each span's, so a membership can
 * never render on a day before the stack it belongs to existed — the gate holds
 * even if a bad span were somehow stored.
 */
export function membersOn(stack: Stack, dateKey: DateKey): StackMembership[] {
  if (!stackStartedOn(stack, dateKey)) return []
  const inForce = stack.members
    .filter((m) => m.from <= dateKey && (m.to === undefined || dateKey < m.to))
    .sort(byPosition)
  // ONE row per compound, always. Two spans for the same compound should never
  // overlap, but nothing upstream can promise it — a device clock that moves
  // backwards, or two client ids that later resolve to one Postgres row, both
  // produce an overlap — and the spec's "never twice inside one stack" has to
  // hold at the point of rendering, not just at the point of writing.
  const seen = new Set<string>()
  return inForce.filter((m) => {
    if (seen.has(m.compoundId)) return false
    seen.add(m.compoundId)
    return true
  })
}

/** The compound ids in the stack on `dateKey`, in display order. */
export function memberIdsOn(stack: Stack, dateKey: DateKey): string[] {
  return membersOn(stack, dateKey).map((m) => m.compoundId)
}

/** The memberships that are still open — what every present-tense screen wants. */
export function currentMembers(stack: Stack): StackMembership[] {
  return stack.members.filter((m) => m.to === undefined).sort(byPosition)
}

/** The compound ids currently in the stack, in display order. */
export function currentMemberIds(stack: Stack): string[] {
  return currentMembers(stack).map((m) => m.compoundId)
}

/** Stacks that still group at least one compound — what Protocol lists. A stack
 *  whose last member was deleted is retained for history but is over, so it is
 *  not offered as something to view or edit. */
export function activeStacks(stacks: Stack[]): Stack[] {
  return stacks.filter((s) => currentMembers(s).length > 0)
}

/** The stack a compound is in NOW, or null. A compound has at most one. */
export function stackOf(stacks: Stack[], compoundId: string): Stack | null {
  for (const s of stacks) {
    if (currentMembers(s).some((m) => m.compoundId === compoundId)) return s
  }
  return null
}

/** Every compound id currently in some stack — what the "add members" picker
 *  excludes, so only unstacked compounds are offered. */
export function stackedIds(stacks: Stack[]): Set<string> {
  const out = new Set<string>()
  for (const s of stacks) {
    for (const m of currentMembers(s)) out.add(m.compoundId)
  }
  return out
}

/**
 * Split a list of compound ids into the stacks they belonged to ON `dateKey` and
 * the loose remainder — the dashboard's one pass. A member renders inside its
 * stack row and must NOT also appear in its category section, so this returns a
 * partition rather than two independently-filtered lists that could drift.
 *
 * `dateKey` is what stops a grouping from rewriting history: a stack that had not
 * been created by that day contributes nothing and its compounds fall through to
 * `loose`, which is exactly how the day looked when it was lived.
 *
 * Stacks come back in their stored order, each carrying only the members that
 * were both in it that day and present in `ids` (so a member not due that day
 * doesn't create a ghost).
 */
export function partitionByStack(
  ids: string[],
  stacks: Stack[],
  dateKey: DateKey
): { stacks: { stack: Stack; memberIds: string[] }[]; loose: string[] } {
  const present = new Set(ids)
  const claimed = new Set<string>()
  const grouped: { stack: Stack; memberIds: string[] }[] = []

  for (const s of stacks) {
    // `claimed` is consulted, not merely recorded: two stacks can both hold a
    // span covering this day for one compound (overlapping history, or two
    // client ids that resolved to the same Postgres row), and rendering it in
    // both rows would show the same dose twice with two ticks for one event.
    const members = memberIdsOn(s, dateKey).filter(
      (id) => present.has(id) && !claimed.has(id)
    )
    if (members.length === 0) continue
    for (const id of members) claimed.add(id)
    grouped.push({ stack: s, memberIds: members })
  }

  return { stacks: grouped, loose: ids.filter((id) => !claimed.has(id)) }
}

/* ---------------------------------------------------------------- mutations */

/** Drop spans that cover no day — a compound added and removed the same day was
 *  never in the stack on any day, and storing it would render as a member on
 *  none of them while still occupying the one-stack-per-compound slot. */
function pruneEmpty(members: StackMembership[]): StackMembership[] {
  return members.filter((m) => m.to === undefined || m.to > m.from)
}

/**
 * Close every OPEN span for `compoundId` in `stack` as of `on`.
 *
 * `on` is clamped to the span's own start, so a device clock that has moved
 * backwards can never write `to < from` — which `stack_members_span_valid`
 * rejects outright, and which would take the whole membership push down with it.
 * A span clamped to zero length is then pruned, exactly like a join-and-leave on
 * the same day.
 */
function closeMember(
  stack: Stack,
  compoundId: string,
  on: DateKey
): Stack {
  let touched = false
  const members = stack.members.map((m) => {
    if (m.compoundId !== compoundId || m.to !== undefined) return m
    touched = true
    return { ...m, to: on < m.from ? m.from : on }
  })
  return touched ? { ...stack, members: pruneEmpty(members) } : stack
}

/**
 * Replace a stack's CURRENT members, effective from `on` (today, in every real
 * call). **This is where the one-stack-per-compound rule is enforced**: any id
 * added here has its open span in every other stack closed first, so the
 * invariant holds by construction rather than by a check a caller might skip.
 * Duplicates within the list are collapsed.
 *
 * Existing members keep the span they already had — re-saving a stack without
 * touching its members must not restate every membership as beginning today,
 * which would erase the grouping from every day before the edit.
 */
export function setStackMembers(
  stacks: Stack[],
  stackId: string,
  memberIds: string[],
  on: DateKey = todayKey()
): Stack[] {
  // An unknown id would otherwise fall through to the "some OTHER stack" branch
  // for every stack and quietly evict the listed compounds from all of them,
  // adding them nowhere. No caller does this today; the guard makes it so none
  // can.
  if (!stacks.some((s) => s.id === stackId)) return stacks

  const unique = [...new Set(memberIds)]
  const taken = new Set(unique)

  return stacks.map((s) => {
    if (s.id !== stackId) {
      // A compound claimed by the target stack leaves this one as of `on`; its
      // days here up to `on` are history and stay.
      let next = s
      for (const id of unique) next = closeMember(next, id, on)
      return next
    }

    const open = new Map<string, StackMembership>()
    for (const m of s.members) {
      if (m.to === undefined) open.set(m.compoundId, m)
    }
    const kept: StackMembership[] = s.members.filter((m) => m.to !== undefined)
    // A NEW member goes after every position ever used in this stack. Existing
    // members keep the position they already had.
    //
    // Restating positions 0..n-1 on each save was wrong twice over: it rewrote
    // the order of days already lived (the closed spans keep their old numbers,
    // so the two schemes collide), and it bought nothing — the editor is a tick
    // list with no way to reorder, so the only order the user can express is the
    // order they ticked things in, which is what this preserves.
    let nextPosition = s.members.reduce((max, m) => Math.max(max, m.position + 1), 0)
    for (const id of unique) {
      const existing = open.get(id)
      if (existing) kept.push(existing)
      else kept.push({ compoundId: id, from: on, position: nextPosition++ })
    }
    // Members that are gone: close them where they stood.
    for (const [id, m] of open) {
      if (!taken.has(id)) kept.push({ ...m, to: on })
    }
    return { ...s, members: pruneEmpty(kept) }
  })
}

/**
 * End a compound's membership wherever it currently sits — what deleting a
 * compound triggers. The stack SURVIVES with one fewer member (Spec 05), the
 * compound's logged history is untouched because none of it lives here, and the
 * days it WAS in the stack keep showing it there.
 */
export function removeMemberEverywhere(
  stacks: Stack[],
  compoundId: string,
  on: DateKey = todayKey()
): Stack[] {
  return stacks.map((s) => closeMember(s, compoundId, on))
}

/**
 * Delete the stack itself. Ungroups its members on every day, past included.
 *
 * The asymmetry with member removal is deliberate: a member leaving is an
 * ordinary forward-dated change, whereas deleting a stack is the user saying
 * this grouping should not exist — the same "delete means gone" the rest of the
 * app uses for a grouping that owns no history of its own. Nothing about a
 * compound or a logged dose is touched either way.
 */
export function removeStack(stacks: Stack[], stackId: string): Stack[] {
  return stacks.filter((s) => s.id !== stackId)
}

/* ----------------------------------------- useSyncExternalStore integration */

export const STACKS_CHANGED_EVENT = "trackd:stacks-changed"

export function notifyStacksChanged() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(STACKS_CHANGED_EVENT))
}

/** Same-tab (our event) + cross-tab (native `storage`), mirroring `subscribeStack`. */
export function subscribeStacks(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(STACKS_CHANGED_EVENT, callback)
  window.addEventListener("storage", callback)
  return () => {
    window.removeEventListener(STACKS_CHANGED_EVENT, callback)
    window.removeEventListener("storage", callback)
  }
}

export const EMPTY_STACKS: Stack[] = []

// `useSyncExternalStore` needs a STABLE reference between reads when nothing
// changed, or it loops. Cache by the raw stored string, same as the stack store.
let snapshotCache: { userId: string; raw: string | null; value: Stack[] } | null = null

export function getStacksSnapshot(userId: string): Stack[] {
  if (typeof window === "undefined") return EMPTY_STACKS
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(storageKey(userId))
  } catch {
    raw = null
  }
  if (snapshotCache && snapshotCache.userId === userId && snapshotCache.raw === raw) {
    return snapshotCache.value
  }
  const loaded = loadStacks(userId)
  const value = loaded.length > 0 ? loaded : EMPTY_STACKS
  // Re-read the raw value: `loadStacks` MIGRATES a v1 store, which writes the v2
  // key as a side effect. Caching under the pre-migration `raw` (null) meant the
  // very next read missed and rebuilt a fresh array, so `useSyncExternalStore`
  // saw two different snapshots for one unchanged store — React's dev-mode
  // double-read warns about exactly that, and it cost an extra render.
  let settled: string | null = raw
  try {
    settled = window.localStorage.getItem(storageKey(userId))
  } catch {
    settled = raw
  }
  snapshotCache = { userId, raw: settled, value }
  return value
}

/* ------------------------------------------------- persisting mutations */

/**
 * Write a stack list, notify subscribers, and mirror to Postgres best-effort.
 * The synchronous local write is the read path — a network blip can never block
 * or undo it (`architecture.md` → Storage Model).
 */
function commit(
  userId: string,
  next: Stack[],
  names?: Record<string, string>
): boolean {
  const ok = saveStacks(userId, next)
  if (ok) {
    notifyStacksChanged()
    // Names are how `resolveProtocolCompoundIds` matches a member whose Postgres
    // id has DIVERGED from its client id — the exact case the resolver exists
    // for. `pushStacks` deletes every membership row first and then skips any
    // member it cannot resolve, so a push without names silently dropped those
    // members from Postgres; the next pull returned a shorter but fully
    // resolvable stack, hydration adopted it, and the member was gone from the
    // device too.
    //
    // `deleteStack` and `dropMember` both used to call this with no names, so
    // the defaulting lives HERE rather than at the call sites: a future caller
    // that forgets cannot reintroduce the bug.
    //
    // CRITICAL, not plain. `hydrateFromPostgres` awaits only `awaitCriticalSyncs()`
    // before it reads, and hydration fires on mount, focus, visibilitychange and
    // reconnect — including on the Protocol screen, where stack deletion lives.
    // Tracked as ordinary, a delete raced its own push: the pull read the
    // pre-delete row, adopted it, and wrote the stack back to the device, which
    // the next push then restored to Postgres. The compound-archive half of
    // `archiveInStack` is already wrapped this way for exactly the same reason;
    // the stack half beside it was not.
    void trackCriticalSync(pushStacks(next, names ?? memberNames(userId)))
  }
  return ok
}

/** `{ compoundId: name }` for everything on the device, so a diverged member can
 *  still be matched by name. Cheap: the stack store is a synchronous read. */
function memberNames(userId: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of loadStack(userId) ?? []) out[c.id] = c.name
  return out
}

/**
 * Create or update a stack from the editing UI's present-tense draft. A NEW stack
 * starts today — it describes the protocol from here forward, not the history
 * behind it. Enforces one-stack-per-compound through {@link setStackMembers}.
 */
export function upsertStack(
  userId: string,
  draft: StackDraft,
  /** Member id → compound name, so the mirror can resolve a diverged id. */
  names?: Record<string, string>
): boolean {
  const cur = loadStacks(userId)
  const existing = cur.find((s) => s.id === draft.id)
  const today = todayKey()
  const next: Stack = existing
    ? { ...existing, name: draft.name, colour: draft.colour }
    : {
        id: draft.id,
        name: draft.name,
        colour: draft.colour,
        effectiveFrom: today,
        members: [],
      }
  const base = existing
    ? cur.map((s) => (s.id === draft.id ? next : s))
    : [...cur, next]
  return commit(userId, setStackMembers(base, draft.id, draft.memberIds, today), names)
}

/** Delete a stack. Ungroups its members; every compound keeps running. */
export function deleteStack(userId: string, stackId: string): boolean {
  return commit(userId, removeStack(loadStacks(userId), stackId))
}

/**
 * End a compound's membership wherever it sits — called when it is deleted.
 *
 * The stack is NOT dissolved when its last member goes, unlike before: the days
 * it grouped are still days it grouped, and deleting the row would rewrite them.
 * It simply stops being current, and `activeStacks` keeps it out of every
 * present-tense screen, so there is no empty card to get stuck with either.
 */
export function dropMember(userId: string, compoundId: string): boolean {
  const cur = loadStacks(userId)
  if (!stackOf(cur, compoundId)) return true // nothing to do
  return commit(userId, removeMemberEverywhere(cur, compoundId))
}

/* ---------------------------------------------------------------- internals */

/**
 * Belt-and-braces for stored data: if two stacks somehow hold an OPEN span for
 * the same compound, the FIRST keeps it. Reading can then never show a compound
 * in two stacks at once.
 *
 * The loser is CLOSED at the winner's start, not deleted. Deleting it threw away
 * however many months that stack had legitimately grouped the compound for — the
 * duplicate is almost always a stale open end on an older, genuine membership,
 * so ending it where the newer one begins is both the smaller claim and the more
 * likely truth. A loser that starts on or after the winner covered nothing and
 * prunes away by itself.
 *
 * Closed spans are left alone: a compound that genuinely moved between stacks has
 * one in each, and that is history, not a duplicate.
 */
function dedupeMembership(stacks: Stack[]): Stack[] {
  const winners = new Map<string, DateKey>()
  return stacks.map((s) => {
    const members: StackMembership[] = []
    for (const m of s.members) {
      if (m.to !== undefined) {
        members.push(m)
        continue
      }
      const winnerFrom = winners.get(m.compoundId)
      if (winnerFrom === undefined) {
        winners.set(m.compoundId, m.from)
        members.push(m)
        continue
      }
      members.push({ ...m, to: winnerFrom < m.from ? m.from : winnerFrom })
    }
    return { ...s, members: pruneEmpty(members) }
  })
}

/**
 * Harden one stored membership. Returns null for anything unusable.
 *
 * A `to` that is present but unusable (unparseable, or earlier than `from`) DROPS
 * the membership rather than reopening it. Reopening was the tempting reading —
 * "we don't know when it left, so assume it didn't" — but it silently pulls a
 * compound back into a stack it had left, and because an open span occupies the
 * global one-stack-per-compound slot, it then hides that compound from every
 * other stack's member picker with no way for the user to see why.
 */
function normalizeMembership(
  raw: unknown,
  index: number,
  fallbackFrom: DateKey
): StackMembership | null {
  if (!raw || typeof raw !== "object") return null
  const m = raw as Record<string, unknown>
  if (typeof m.compoundId !== "string" || m.compoundId === "") return null
  const from = isDateKey(m.from) ? m.from : fallbackFrom
  const departed = m.to !== undefined && m.to !== null
  const to = isDateKey(m.to) ? m.to : undefined
  if (departed && (to === undefined || to <= from)) return null
  const position =
    typeof m.position === "number" && Number.isFinite(m.position)
      ? Math.trunc(m.position)
      : index
  return {
    compoundId: m.compoundId,
    from,
    ...(to !== undefined ? { to } : {}),
    position,
  }
}

function isDateKey(v: unknown): v is DateKey {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

/**
 * Harden a stored stack, accepting BOTH shapes: the dated one, and the
 * pre-dating `{ memberIds: string[] }` (converted against `legacyFrom`).
 *
 * `legacyFrom` is only supplied by {@link migrateLegacy}. A v2 record that has
 * somehow lost its dates falls back to today for the same reason: under-grouping
 * is recoverable from Postgres, falsely grouping the past is the bug.
 */
function normalizeStack(item: unknown, legacyFrom?: DateKey): Stack | null {
  if (!item || typeof item !== "object") return null
  const s = item as Record<string, unknown>
  if (typeof s.id !== "string" || typeof s.name !== "string") return null
  const name = s.name.trim().slice(0, STACK_NAME_MAX)
  if (name === "") return null

  const stored = s.effectiveFrom
  const effectiveFrom: DateKey = isDateKey(stored)
    ? stored
    : (legacyFrom ?? todayKey())
  // Either the v1 migration or a v2 record that lost its date: the day above is
  // a guess, and must not be pushed over the server's real one.
  const provisional = !isDateKey(stored) || legacyFrom !== undefined

  let members: StackMembership[] = []
  if (Array.isArray(s.members) && s.members.length > 0) {
    const seen = new Set<string>()
    s.members.forEach((raw, i) => {
      const m = normalizeMembership(raw, i, effectiveFrom)
      if (!m) return
      // One OPEN span per compound per stack; closed ones may repeat.
      const key = m.to === undefined ? `open:${m.compoundId}` : `${m.compoundId}:${m.from}`
      if (seen.has(key)) return
      seen.add(key)
      members.push(m)
    })
  } else if (Array.isArray(s.memberIds)) {
    // Pre-dating record: every member is treated as having joined when the stack
    // itself starts, which is the only claim the old shape supports.
    const ids = [...new Set(s.memberIds.filter((m): m is string => typeof m === "string"))]
    members = ids.map((compoundId, position) => ({
      compoundId,
      from: effectiveFrom,
      position,
    }))
  }

  return {
    id: s.id,
    name,
    colour: isPaletteColour(s.colour) ? s.colour : DEFAULT_PALETTE_COLOUR,
    effectiveFrom,
    ...(provisional ? { provisionalStart: true as const } : {}),
    members: pruneEmpty(members),
  }
}
