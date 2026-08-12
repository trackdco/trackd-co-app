/**
 * Device-local persistence for logged doses, keyed `trackd.doselog.v1.<userId>`.
 *
 * Shape: `{ "YYYY-MM-DD": { compoundId: DoseLog } }` — only actual logs are kept
 * (an un-logged dose is simply absent). This is what makes "look back" history
 * survive reloads and powers the rest hint. Archiving a compound (see
 * `lib/home/stack.ts`) stops it appearing in present/future, but its past entries
 * stay here untouched. Mirrors the stack store's `useSyncExternalStore` pattern.
 *
 * Pure data + pure helpers + guarded storage only; no React (Context/code-standards.md).
 */
import { combineLocalDateTime, type DoseLog } from "@/lib/home/mockHomeData"
import { pushDoseLog, deleteDoseLog } from "@/lib/home/syncActions"
import {
  doseAmountsOf,
  doseTimesOf,
  loadStack,
  resolveScheduleOn,
  type StackCompound,
} from "@/lib/home/stack"
import {
  pushProtocolDoseLog,
  deleteProtocolDoseLog,
} from "@/lib/home/protocolSync"
import { trackCriticalSync, trackSync } from "@/lib/home/syncStatus"
import { createWriteCoalescer } from "@/lib/home/writeCoalescer"

/**
 * `{ "YYYY-MM-DD": { slotKey: DoseLog } }`, where `slotKey` is a compound id for
 * the first dose of the day and `<compoundId>#<n>` for any later one. See
 * {@link slotKey}.
 */
export type DayLogs = Record<string, Record<string, DoseLog>>

const EMPTY: DayLogs = {}

/* ------------------------------------------------------------- dose slots */

/**
 * The store key for one dose of one compound on one day.
 *
 * **Slot 0 is the bare compound id, unsuffixed.** That is what makes this a
 * pure addition rather than a migration: every key already written is a bare
 * compound id, so every existing log IS slot 0 and reads back correctly with no
 * conversion pass. A scheme that suffixed slot 0 too would have orphaned the
 * entire history behind a rewrite.
 *
 * A slot is an INDEX into the day's `dose_times`, not a time — see
 * `resolveSlotTime`, which resolves it against the schedule version in force on
 * that day rather than today's.
 */
export function slotKey(compoundId: string, slot = 0): string {
  return slot === 0 ? compoundId : `${compoundId}#${slot}`
}

/**
 * The inverse. An unsuffixed key is slot 0, which is how pre-slot data migrates
 * itself on read.
 *
 * Parsed from the LAST `#` and only when what follows is entirely digits, so a
 * compound id that somehow contains a `#` is returned whole rather than being
 * silently truncated into a different compound's log.
 */
export function parseSlotKey(key: string): { compoundId: string; slot: number } {
  const hash = key.lastIndexOf("#")
  if (hash <= 0) return { compoundId: key, slot: 0 }
  const suffix = key.slice(hash + 1)
  if (!/^\d+$/.test(suffix)) return { compoundId: key, slot: 0 }
  return { compoundId: key.slice(0, hash), slot: Number(suffix) }
}

/** Every logged slot for one compound on one day, slot order. */
export function loggedSlotsFor(
  day: Record<string, DoseLog> | undefined,
  compoundId: string,
): { slot: number; log: DoseLog }[] {
  if (!day) return []
  const out: { slot: number; log: DoseLog }[] = []
  for (const [key, log] of Object.entries(day)) {
    const parsed = parseSlotKey(key)
    if (parsed.compoundId === compoundId) out.push({ slot: parsed.slot, log })
  }
  return out.sort((a, b) => a.slot - b.slot)
}

/** How many of this compound's doses are logged on this day. */
export function loggedCountFor(
  day: Record<string, DoseLog> | undefined,
  compoundId: string,
): number {
  return loggedSlotsFor(day, compoundId).length
}

/** The lowest slot below `timesPerDay` with nothing logged against it, or null
 *  when the day is already complete. What a stack tick and a bare tap use. */
export function nextUnloggedSlot(
  day: Record<string, DoseLog> | undefined,
  compoundId: string,
  timesPerDay: number,
): number | null {
  const taken = new Set(loggedSlotsFor(day, compoundId).map((s) => s.slot))
  for (let i = 0; i < Math.max(1, timesPerDay); i++) {
    if (!taken.has(i)) return i
  }
  return null
}
/* ------------------------------------------------------------- tombstones */

/**
 * Days+compounds the user has UN-LOGGED but whose delete may not have reached
 * Postgres yet.
 *
 * Making the delete a critical sync closed the race where a pull overlapped an
 * in-flight delete, but not the offline case: hydration seeds from the pulled
 * rows unconditionally and there is no local-wins reconciliation for logs (there
 * is one for compounds). So unticking a dose with no network, then reconnecting,
 * pulled the row straight back — the tick refilled with its original amount, time
 * and site, and nothing retried the delete.
 *
 * A tombstone records the user's INTENT so the pull can be filtered by it. It is
 * removed as soon as the delete is confirmed, and expires on its own so a
 * tombstone whose delete never lands can't suppress a legitimate re-log forever.
 */
const TOMBSTONE_TTL_MS = 14 * 24 * 60 * 60 * 1000

const tombstoneKey = (userId: string) => `trackd.doselog.tombstones.v1.${userId}`

/** `${dateKey}|${compoundId}` → epoch ms the un-log happened. */
type Tombstones = Record<string, number>

export function loadTombstones(userId: string): Tombstones {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(tombstoneKey(userId))
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const now = Date.now()
    const out: Tombstones = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      // Drop expired and malformed entries on read, so the store self-prunes.
      if (typeof v !== "number" || !Number.isFinite(v)) continue
      if (now - v > TOMBSTONE_TTL_MS) continue
      out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function saveTombstones(userId: string, t: Tombstones): void {
  try {
    window.localStorage.setItem(tombstoneKey(userId), JSON.stringify(t))
  } catch {
    /* storage full / off — the delete still happened locally */
  }
}

/**
 * **The slot is part of the tombstone id**, and leaving it out was the whole
 * bug: tombstones keyed by compound and date alone meant undoing the EVENING
 * dose of a twice-daily compound while offline suppressed the MORNING one on
 * the next hydration, because the pull filter could not tell them apart.
 *
 * Slot 0 keeps the unsuffixed form, so tombstones written before slots existed
 * still match — the same bargain `slotKey` makes.
 */
export function tombstoneId(dateKey: string, compoundId: string, slot = 0): string {
  return `${dateKey}|${slotKey(compoundId, slot)}`
}

/** True when this dose was un-logged and the delete is not yet confirmed. */
export function isTombstoned(
  tombstones: Tombstones,
  dateKey: string,
  compoundId: string,
  slot = 0
): boolean {
  return Object.hasOwn(tombstones, tombstoneId(dateKey, compoundId, slot))
}

function addTombstone(
  userId: string,
  dateKey: string,
  compoundId: string,
  slot = 0
): void {
  const t = loadTombstones(userId)
  t[tombstoneId(dateKey, compoundId, slot)] = Date.now()
  saveTombstones(userId, t)
}

/** The delete landed, so the intent no longer needs recording. */
function clearTombstone(
  userId: string,
  dateKey: string,
  compoundId: string,
  slot = 0
): void {
  const t = loadTombstones(userId)
  if (!Object.hasOwn(t, tombstoneId(dateKey, compoundId, slot))) return
  delete t[tombstoneId(dateKey, compoundId, slot)]
  saveTombstones(userId, t)
}

/** Logging the same dose again cancels any pending un-log for it. */
function dropTombstoneOnRelog(
  userId: string,
  dateKey: string,
  compoundId: string,
  slot = 0
): void {
  clearTombstone(userId, dateKey, compoundId, slot)
}

const storageKey = (userId: string) => `trackd.doselog.v1.${userId}`

function isDoseLog(v: unknown): v is DoseLog {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return typeof o.amount === "string" && typeof o.time24 === "string"
}

/** Load the saved logs for this user (normalised); `{}` when none/unusable. */
export function loadDoseLogs(userId: string): DayLogs {
  if (typeof window === "undefined") return EMPTY
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return EMPTY
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return EMPTY
    const out: DayLogs = {}
    for (const [dateKey, day] of Object.entries(parsed as Record<string, unknown>)) {
      if (!day || typeof day !== "object") continue
      const dayOut: Record<string, DoseLog> = {}
      for (const [id, log] of Object.entries(day as Record<string, unknown>)) {
        if (isDoseLog(log)) {
          dayOut[id] = {
            amount: log.amount,
            // The unit the dose was recorded in, preserved so history isn't
            // relabelled when the compound's unit changes (see DoseLog.unit).
            ...(typeof log.unit === "string" && log.unit ? { unit: log.unit } : {}),
            // The user's own note. It was missing from this list, which made the
            // whole feature write-only: the sheet reads the logged dose back
            // THROUGH here, so re-opening one showed an empty box, saving it
            // again wrote `note: null` over what was in Postgres, and the
            // reconnect re-push (which also reads through here) wiped every note
            // in the user's history on a single network flap.
            ...(typeof log.note === "string" && log.note ? { note: log.note } : {}),
            // Absent = taken, which is every log written before Skip existed.
            ...(log.status === "skipped" ? { status: "skipped" as const } : {}),
            siteId: typeof log.siteId === "string" ? log.siteId : null,
            time24: log.time24,
            // `undefined` is a MEANINGFUL third state here, not just "missing" (see
            // DoseLog): a vial id = an explicit pick, `null` = an explicit "Not
            // tracked", absent = undecided → the server resolves the vial for the
            // dose's date. `JSON.stringify` drops an undefined value, so the KEY's
            // absence is what carries "undecided" across a reload — flattening it to
            // null here used to destroy that, and re-opening such a dose then read as
            // "Not tracked" and UNLINKED its vial on update.
            ...("inventoryItemId" in log
              ? {
                  inventoryItemId:
                    typeof log.inventoryItemId === "string"
                      ? log.inventoryItemId
                      : null,
                }
              : {}),
          }
        }
      }
      if (Object.keys(dayOut).length > 0) out[dateKey] = dayOut
    }
    return out
  } catch {
    return EMPTY
  }
}

export function saveDoseLogs(userId: string, logs: DayLogs): boolean {
  if (typeof window === "undefined") return false
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(logs))
    return true
  } catch {
    return false
  }
}

const CHANGED_EVENT = "trackd:doselog-changed"

function notify() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT))
}

/**
 * Dispatch the same-tab change signal so a sibling (the Home screen) re-reads.
 * Exposed for the cloud-hydration pass, which writes the store directly via
 * `saveDoseLogs` and then needs to wake `useSyncExternalStore` the same way the
 * mutators do. (`saveDoseLogs` is intentionally silent; the mutators notify.)
 */
export function notifyDoseLogsChanged() {
  notify()
}

export function subscribeDoseLogs(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(CHANGED_EVENT, callback)
  window.addEventListener("storage", callback)
  return () => {
    window.removeEventListener(CHANGED_EVENT, callback)
    window.removeEventListener("storage", callback)
  }
}

/**
 * A SECOND signal, fired once a dose write has actually landed in Postgres —
 * not when the device store changed.
 *
 * The two are days apart in meaning and both are needed. {@link CHANGED_EVENT}
 * fires synchronously so the tick fills in instantly (the whole point of the
 * device-local store). But anything DERIVED FROM THE SERVER cannot move until
 * the server knows: `v_inventory_math` recomputes what is left in a vial from
 * `dose_logs`, and the vial behind a dose is often resolved server-side
 * (`autoLinkVialForDate`), so the client cannot predict the new figure even in
 * principle.
 *
 * Without this, the dashboard read its stock figures on mount, on a day change
 * and on window focus — and on nothing else. Ticking a stack therefore left
 * every "left in the vial" figure exactly where it was, and the stock looked
 * like it had not been touched until the user backgrounded the app and came
 * back. The doses were linked and the maths was right the whole time; the screen
 * simply never asked again. (Adrian, 2026-08-12: "It should automatically log
 * from the stock of the vials … if I click the whole stack.")
 */
const SYNCED_EVENT = "trackd:dose-synced"

/**
 * Dose writes still in flight, coalesced into ONE signal per burst.
 *
 * The counting rule and the reasons a timer cannot do this job live in
 * {@link createWriteCoalescer}, where they are tested. This module just owns the
 * app's single instance of it and says what "landed" means: the write reached
 * Postgres and was not a no-op skip.
 */
const doseWrites = createWriteCoalescer(() => notifySynced())

/** Register a dose write and fire the signal when the last one settles. */
function trackDoseWrite(op: Promise<{ ok: boolean; skipped?: boolean }>): void {
  doseWrites.track(op)
}

function notifySynced() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(SYNCED_EVENT))
}

/**
 * Wake when a dose write reaches Postgres, so server-derived figures can be
 * re-read.
 *
 * Fires ONCE per burst and only when something actually landed — see
 * {@link trackDoseWrite}. Subscribers need no debounce of their own, and must
 * not assume one: the guarantee here is coalescing, not delay.
 */
export function subscribeDoseSynced(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(SYNCED_EVENT, callback)
  return () => window.removeEventListener(SYNCED_EVENT, callback)
}

// Stable snapshot for useSyncExternalStore — cached by the raw stored string.
let cache: { userId: string; raw: string | null; value: DayLogs } | null = null

export function getDoseLogsSnapshot(userId: string): DayLogs {
  if (typeof window === "undefined") return EMPTY
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(storageKey(userId))
  } catch {
    raw = null
  }
  if (cache && cache.userId === userId && cache.raw === raw) return cache.value
  const value = loadDoseLogs(userId)
  cache = { userId, raw, value }
  return value
}

/* ----------------------------------------------------------------- mutators */

export function logDose(
  userId: string,
  dateKey: string,
  compoundId: string,
  log: DoseLog,
  /** Which of the day's scheduled doses this is — an index into `dose_times`.
   *  Defaults to 0, which is every dose written before slots existed. */
  slot = 0
) {
  // Re-logging the same dose cancels any pending un-log for it, or the tombstone
  // would suppress the row the user just re-created.
  dropTombstoneOnRelog(userId, dateKey, compoundId, slot)
  const cur = loadDoseLogs(userId)
  const key = slotKey(compoundId, slot)
  const next: DayLogs = {
    ...cur,
    [dateKey]: { ...(cur[dateKey] ?? {}), [key]: log },
  }
  saveDoseLogs(userId, next)
  notify()
  void pushDoseLog(dateKey, key, log) // jsonb mirror (also backs up customs)
  // Postgres (canonical). Needs the compound's method (to map the injection site)
  // and the device-local taken_at instant; no-op for a custom compound. The final
  // `true` lets the server resolve the vial when the client hadn't (the Stock list
  // loads async, and a back-dated log deliberately leaves it undecided) — it links
  // whichever vial the compound was drawing from at `taken_at`, so the runway
  // decrements without a back-dated dose retro-linking to a vial bought since.
  // The NAME goes too: the Postgres id is resolved from it when the derived id has
  // drifted, which is the difference between the dose syncing and being silently
  // dropped.
  const onDevice = (loadStack(userId) ?? []).find((c) => c.id === compoundId)
  const method = onDevice?.method ?? "po"
  const push = pushProtocolDoseLog(
    compoundId,
    dateKey,
    log,
    combineLocalDateTime(dateKey, log.time24),
    method,
    true,
    onDevice?.name ?? null,
    true,
    slot
  )
  void trackSync(push)
  // The vial this dose comes off is usually resolved BY THE SERVER (the
  // `autoLinkVialForDate` argument above), so the amount left in it cannot be
  // known here — only asked for again once the write has landed. Registered on
  // the RAW promise rather than on `trackSync`, which swallows the outcome and
  // would report a failed write as a landed one.
  trackDoseWrite(push)
}

export function unlogDose(
  userId: string,
  dateKey: string,
  compoundId: string,
  slot = 0
) {
  const cur = loadDoseLogs(userId)
  const day = { ...(cur[dateKey] ?? {}) }
  delete day[slotKey(compoundId, slot)]
  const next = { ...cur }
  if (Object.keys(day).length === 0) delete next[dateKey]
  else next[dateKey] = day
  saveDoseLogs(userId, next)
  notify()
  // CRITICAL, not ordinary: `hydrateFromPostgres` awaits only critical syncs, so
  // an un-log tracked as ordinary let a pull that overlapped it read the row as
  // still present and write it straight back. Unticking then backgrounding the app
  // refilled the tick, with its original amount, time and site.
  addTombstone(userId, dateKey, compoundId, slot)
  // The name, for the same reason as `logDose` — and it matters more here: a delete
  // aimed at a derived id that no row has still reports ok, so the tombstone would
  // clear on a delete that removed nothing and the next pull would resurrect the
  // dose the user just unticked.
  const name = (loadStack(userId) ?? []).find((c) => c.id === compoundId)?.name ?? null
  /**
   * BOTH deletes, and the tombstone waits for both.
   *
   * An un-log has to remove the dose from two places: `dose_logs` (canonical)
   * and the `user_dose_logs` jsonb mirror. The mirror's delete used to be fired
   * and forgotten while the tombstone was dropped on the strength of the
   * canonical one alone — so a mirror delete that failed left the row there with
   * nothing suppressing it, and `hydrateFromPostgres` merges the MIRROR
   * (`remapLogs(cloud.doseLogs)`) as one of its sources. The dose came back on
   * the next pull with its original amount, time and site, and the failure was
   * never even reported: the discarded result never reached `trackSync`, so not
   * even the "didn't sync" notice fired.
   *
   * One tap on a stack now issues five of these at once, which is five chances
   * per tap rather than one. (Cold review, 2026-08-12.)
   */
  const mirror = deleteDoseLog(dateKey, slotKey(compoundId, slot))
  const canonical = deleteProtocolDoseLog(compoundId, dateKey, name, slot)
  const op = Promise.all([mirror, canonical]).then(([mirrorRes, res]) => {
    // Only drop the tombstone once BOTH have actually forgotten the dose.
    if (mirrorRes.ok && res.ok && !res.skipped) {
      clearTombstone(userId, dateKey, compoundId, slot)
    }
    // REPORT both too. Returning the canonical result alone still told
    // `trackSync` the un-log had succeeded when only half of it had, so the
    // "didn't sync" notice stayed silent about a mirror row that will resurrect
    // the dose on the next pull. `skipped` stays the canonical write's, since
    // that is the one that legitimately no-ops for a custom compound.
    return { ok: mirrorRes.ok && res.ok, skipped: res.skipped }
  })
  void trackCriticalSync(op)
  // An un-log GIVES the vial its dose back, so the same re-read is owed here as
  // on the way in — otherwise unticking left the stock reading low.
  //
  // Registered on the CANONICAL delete alone, not on `op`. `op` reports the pair
  // (so a failed mirror delete raises the sync notice), but `dose_logs` is what
  // `v_inventory_math` counts — if that succeeded the runway has genuinely moved
  // and the figures must be re-read, whatever the mirror did.
  trackDoseWrite(canonical)
}

/**
 * Commit a dose on the day the log sheet says it lands on.
 *
 * ONE implementation for all three callers — the dashboard, the calendar and
 * the quick-track sheet. It exists because they had three copies of this and
 * they had already drifted: quick-track's took two parameters where the sheet
 * passes four, so the day the user had just edited was dropped on the floor and
 * the dose landed on the day the sheet was opened on, with the confirmation tick
 * firing normally. TypeScript cannot catch that — a shorter function is
 * assignable to a longer signature — so the answer is to have one function.
 *
 * `landsOn` usually equals `openedOn`. When it does not, the dose MOVES: the old
 * day is un-logged first, so one dose can never become two.
 *
 * The un-log only runs when something is actually there. Firing it for a FRESH
 * log planted a 14-day tombstone on a day the user had never logged, and
 * hydration filters every source by tombstone — so a dose for that day sitting
 * in Postgres but not yet pulled (a reinstall, a second device, mid-sync) would
 * be deleted from the cloud and suppressed for a fortnight.
 */
export function commitDoseOn(
  userId: string,
  compoundId: string,
  log: DoseLog,
  landsOn: string,
  openedOn: string,
  /** Which of the day's doses this is. Moving a dose to another day keeps its
   *  slot: the second dose of Tuesday back-dated to Monday is still Monday's
   *  second dose, not a duplicate of its first. */
  slot = 0
): void {
  const moved = landsOn !== openedOn
  if (moved && loadDoseLogs(userId)[openedOn]?.[slotKey(compoundId, slot)]) {
    unlogDose(userId, openedOn, compoundId, slot)
  }
  logDose(userId, landsOn, compoundId, log, slot)
}

// There is deliberately NO "erase every logged dose for a compound" here (Spec 02):
// a compound has two states, active and deleted, and deleting keeps every logged
// dose. The only verb that touches a single day's entry is `unlogDose` above.

/* --------------------------------------------------- resolving a day's slots */

/** One of a compound's scheduled doses on one day. */
export interface DaySlot {
  /** Index into that day's `dose_times`. */
  slot: number
  /** The time this slot is due, `""` when none was set. */
  time24: string
  /**
   * The amount PLANNED for this slot, in the compound's unit
   * (`supabase/protocol/021`). Equal to the compound's own dose unless a
   * per-slot amount was set — 100 mg in the morning, 50 mg at night.
   */
  dose: number
  /** What was logged against it, or null. */
  log: DoseLog | null
  /**
   * True when this slot is no longer scheduled but HAS a log — a dose genuinely
   * taken under an older, longer schedule. It still renders: dropping from 3x to
   * 2x daily must not erase the third dose you took last month.
   */
  historic?: boolean
}

/**
 * A compound's dose slots for one day, **resolved against the schedule version
 * in force ON THAT DAY** rather than today's.
 *
 * That distinction is the whole point. A slot is an INDEX into `dose_times`, so
 * reading an old log against the CURRENT times relabels history: reorder your
 * times and a dose logged at 20:00 starts displaying as 14:00. `resolveScheduleOn`
 * already answers "what was the rule then" for dose and cadence; this extends the
 * same answer to the times.
 *
 * Slots beyond the day's schedule that carry a log are appended as `historic`
 * rather than dropped — see {@link DaySlot.historic}.
 */
export function slotsForDay(
  compound: StackCompound,
  dateKey: string,
  dayLogs: Record<string, DoseLog> | undefined,
): DaySlot[] {
  const resolved = resolveScheduleOn(compound, dateKey)
  const times = doseTimesOf(resolved.schedule)
  const amounts = doseAmountsOf(resolved.schedule, resolved.dose)
  const out: DaySlot[] = times.map((time24, slot) => ({
    slot,
    time24,
    dose: amounts[slot] ?? resolved.dose,
    log: dayLogs?.[slotKey(compound.id, slot)] ?? null,
  }))
  for (const { slot, log } of loggedSlotsFor(dayLogs, compound.id)) {
    if (slot < out.length) continue
    // A historic slot has no PLAN any more — the schedule it belonged to is
    // gone. Its log carries the amount actually taken, which is the only honest
    // figure to show; the compound's current dose is a fallback for display
    // only, never a claim about what was planned then.
    out.push({ slot, time24: "", dose: resolved.dose, log, historic: true })
  }
  return out
}
