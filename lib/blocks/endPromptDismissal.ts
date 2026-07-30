/**
 * "Leave running" — remembered per block, per device.
 *
 * This is a device PREFERENCE, not a record (`architecture.md` → the
 * localStorage keys that are never mirrored). Losing it costs the user one
 * re-tap of an answer they already gave; it never costs them data, and it is
 * never the source of truth for anything. A block's real state lives in
 * Postgres.
 *
 * It exists because "leave running" is a legitimate answer and the block is
 * genuinely past its end date afterwards. Without a memory the dot would return
 * on every visit, turning a supported choice into a nag. Without an expiry it
 * would also be right forever, which is why the memory is cleared the moment the
 * block is extended: a NEW end date is a new question.
 *
 * Every operation is BEST-EFFORT and silent on failure. A full or blocked
 * storage must never stop the user answering the prompt — and, per spec 07's
 * one shipped regression here, the UI must hold its own state rather than
 * reading this back to learn what was just tapped, or a refused write reads as a
 * dead control.
 */

const key = (userId: string) => `trackd.blocks.endPromptDismissed.v1.${userId}`

/** Block ids the user chose to leave running. */
function load(userId: string): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(key(userId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === "string")
  } catch {
    return []
  }
}

/** True when this block's end prompt was dismissed on this device. */
export function isEndPromptDismissed(userId: string, blockId: string): boolean {
  return load(userId).includes(blockId)
}

/**
 * Drop any remembered dismissal that is not in `liveIds`.
 *
 * A dismissal only ever means something for a LIVE block, so once one closes its
 * entry is dead weight. Without this the array grows for the life of the device.
 * Best-effort like everything else here: failing to prune costs nothing.
 */
export function pruneEndPromptDismissals(userId: string, liveIds: string[]): void {
  if (typeof window === "undefined") return
  try {
    const raw = window.localStorage.getItem(key(userId))
    if (raw === null) return
    const current = load(userId)
    const next = current.filter((id) => liveIds.includes(id))
    // Compared against what is actually STORED, not against the parsed list.
    // `load` already drops non-strings, so a stored `["a", 1, {}]` parsed to
    // `["a"]` and matched the filtered length — the junk was declared clean and
    // left in place forever.
    if (JSON.stringify(next) === raw) return
    window.localStorage.setItem(key(userId), JSON.stringify(next))
  } catch {
    /* storage full or blocked — an unpruned entry is harmless */
  }
}

/**
 * Record (or clear) a dismissal. Clearing matters as much as setting: extending
 * a block moves its end date, and the prompt must ask again when the new one
 * arrives.
 */
export function dismissEndPrompt(
  userId: string,
  blockId: string,
  dismissed: boolean,
): void {
  if (typeof window === "undefined") return
  try {
    const current = load(userId)
    const next = dismissed
      ? current.includes(blockId)
        ? current
        : [...current, blockId]
      : current.filter((id) => id !== blockId)
    if (next === current) return
    window.localStorage.setItem(key(userId), JSON.stringify(next))
  } catch {
    /* storage full or blocked — the user still answered, and can answer again */
  }
}
