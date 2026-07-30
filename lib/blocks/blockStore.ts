/**
 * Device-local store for blocks, with the same shape as the other home stores
 * (`lib/home/stack.ts`): localStorage is the synchronous read path the UI uses,
 * and a `useSyncExternalStore` subscription keeps every screen in step.
 *
 * A Postgres mirror is NOT built yet and is required before this ships — losing
 * a sixteen-week prep to a PWA reinstall would be the worst possible bug in a
 * feature whose entire point is looking back. Tracked in `next-tasks.md`. The
 * shape here is deliberately the one a `blocks` table would take, so the mirror
 * is a sync layer rather than a rewrite.
 *
 * Guarded storage only, no React (`code-standards.md`).
 */

import type { Block } from "./block"

const key = (userId: string) => `trackd.blocks.v1.${userId}`
const EVENT = "trackd:blocks-changed"

/**
 * Snapshot cache. `useSyncExternalStore` compares snapshots by reference, so
 * parsing JSON on every call would hand back a new array each time and spin the
 * component forever. Re-parsed only when a write says something changed.
 */
let cache: { userId: string; raw: string | null; value: Block[] } | null = null
const EMPTY: Block[] = []

function isBlock(v: unknown): v is Block {
  if (!v || typeof v !== "object") return false
  const b = v as Record<string, unknown>
  return (
    typeof b.id === "string" &&
    typeof b.name === "string" &&
    typeof b.startedOn === "string" &&
    (b.endsOn === null || typeof b.endsOn === "string") &&
    (b.status === "active" || b.status === "completed" || b.status === "abandoned")
  )
}

/** Harden the shape on the way in: this is a cache, and caches get edited. */
function normalise(parsed: unknown): Block[] {
  if (!Array.isArray(parsed)) return EMPTY
  return parsed.filter(isBlock).map((b) => ({
    ...b,
    targets: Array.isArray(b.targets) ? b.targets : [],
    closedOn: typeof b.closedOn === "string" ? b.closedOn : null,
    reflection: typeof b.reflection === "string" ? b.reflection : null,
  }))
}

export function getBlocksSnapshot(userId: string): Block[] {
  if (typeof window === "undefined") return EMPTY
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(key(userId))
  } catch {
    return EMPTY
  }
  if (cache && cache.userId === userId && cache.raw === raw) return cache.value
  let value = EMPTY
  if (raw) {
    try {
      value = normalise(JSON.parse(raw))
    } catch {
      value = EMPTY
    }
  }
  cache = { userId, raw, value }
  return value
}

export function writeBlocks(userId: string, blocks: Block[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(blocks))
  } catch {
    /* storage full or blocked — the caller's own state still applies */
  }
  cache = null
  window.dispatchEvent(new CustomEvent(EVENT))
}

export function subscribeBlocks(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(EVENT, cb)
  window.addEventListener("storage", cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener("storage", cb)
  }
}

export { EMPTY as EMPTY_BLOCKS }
