"use server"

/**
 * Home ⇄ Postgres adapter (Protocol Cutover, Step 3). The Home flip keeps the
 * existing device-local store APIs (`lib/home/stack.ts`, `doseLog.ts`) and their
 * `StackCompound` / `DayLogs` shapes unchanged — these server actions are what
 * those stores now ALSO read from / write to, making Postgres the source of truth
 * while localStorage stays the instant offline cache.
 *
 * All catalogue resolution (name ⇄ `compounds.id`) and id handling live HERE,
 * server-side, so there is ONE implementation:
 *  - `protocol_compounds.id` = the client `StackCompound.id` when that is a valid
 *    uuid (the common case — `crypto.randomUUID()`); otherwise a deterministic
 *    uuid hashed from it (the insecure-context `s_…`/`c_…` fallback ids). Either
 *    way the mapping is stable, so re-runs and the Step 2 migration upsert the
 *    SAME rows (idempotent) and the local store + Postgres stay joined by id.
 *  - A compound whose name doesn't resolve in the read-only catalogue is a custom
 *    "Make your own" compound (v1.5) — these writes no-op (`skipped`) so customs
 *    stay device-local; their dose-log writes find no `protocol_compound` and are
 *    skipped without error.
 *
 * Identity is always from the verified session; RLS the backstop; never the
 * service role (house pattern). Everything is best-effort and never throws — the
 * synchronous localStorage write has already succeeded; Postgres is the durable
 * source, not the read path, so a network blip can't break Home.
 */
import { createHash } from "node:crypto"

import { createClient } from "@/lib/supabase/server"
import { guard } from "@/lib/resilience/circuitBreaker"
import { ensureActiveCycle } from "@/lib/db/cycles"
import {
  deleteProtocolCompound,
  setProtocolCompoundActive,
  upsertProtocolCompound,
  upsertProtocolCompounds,
} from "@/lib/db/protocolCompounds"
import { deleteDoseLog, upsertDoseLog, upsertDoseLogs } from "@/lib/db/doseLogs"
import {
  localSiteToInjectionSite,
  protocolCompoundToStack,
  stackCompoundToProtocolInsert,
  type BatchDoseEntry,
  type DoseLogInsert,
  type DoseRow,
  type DoseUnit,
  type InventoryType,
  type ProtocolCompoundInsert,
} from "@/lib/db/types"
import type { CompoundCategory } from "@/lib/compound-categories"
import type { DrawSource } from "@/lib/home/draw"
import type { StackCompound } from "@/lib/home/stack"
import type { DoseLog } from "@/lib/home/mockHomeData"

type Ok = { ok: boolean; skipped?: boolean }

async function ctx() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, userId: user.id }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function deterministicUuid(seed: string): string {
  const b = createHash("sha256").update(seed).digest().subarray(0, 16)
  b[6] = (b[6] & 0x0f) | 0x40 // version 4
  b[8] = (b[8] & 0x3f) | 0x80 // variant 10
  const hex = b.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** The canonical `protocol_compounds.id` for a client `StackCompound.id`. */
function resolvePcId(userId: string, clientId: string): string {
  return UUID_RE.test(clientId) ? clientId : deterministicUuid(`pc:${userId}:${clientId}`)
}

function parseAmount(raw: string, fallback: number): number {
  const n = Number.parseFloat(raw)
  if (Number.isFinite(n) && n > 0) return n
  return fallback > 0 ? fallback : 0.001
}

/** Mirrors the DB `unit_family_compatible`: an mg-tracked vial takes mg/mcg doses;
 *  an iu-tracked vial takes iu doses. Guards the dose↔inventory link. */
function unitFamilyOk(base: string, dose: string): boolean {
  return (base === "mg" && (dose === "mg" || dose === "mcg")) || (base === "iu" && dose === "iu")
}

/* --------------------------------------------------------------- compounds */

/**
 * Upsert a stack compound into `protocol_compounds` under the active cycle.
 * Resolves the catalogue uuid by name; a name NOT in the catalogue is a custom
 * "Make your own" compound and is stored as a custom row (compound_id NULL +
 * custom_name/custom_category, supabase/protocol/004) — so it too can carry vials
 * + stock runway via the unchanged inventory_items / v_inventory_math chain.
 * Either way it returns the resolved `protocolCompoundId` so the caller can attach
 * inventory to it.
 */
export async function pushProtocolCompound(
  c: StackCompound,
): Promise<Ok & { protocolCompoundId?: string }> {
  try {
    const cx = await ctx()
    if (!cx) return { ok: false }
    // Exact name match (NOT ilike — a custom name could contain %/_ and wildcard-
    // match an unrelated catalogue row). Names come verbatim from the catalogue.
    const { data: rows } = await cx.supabase
      .from("compounds")
      .select("id")
      .eq("name", c.name)
      .limit(1)
    const compoundId = (rows?.[0]?.id as string | undefined) ?? null
    const cycle = await ensureActiveCycle()
    if (!cycle) return { ok: false }

    if (compoundId === null) {
      // Custom compound. Its id is deterministic from the stable client id, which
      // is also what the dose-log path (pushProtocolDoseLog → resolvePcId) uses, so
      // both resolve to THIS row and the runway decrements correctly. `newId()`
      // always yields a uuid, so resolvePcId returns it unchanged ⇒ the Postgres
      // row id == the local stack id (no divergence). Upsert-by-id is idempotent,
      // and the (cycle_id, custom_name) partial unique index is the DB backstop.
      const pcId = resolvePcId(cx.userId, c.id)
      const saved = await upsertProtocolCompound(
        stackCompoundToProtocolInsert(c, { id: pcId, cycleId: cycle.id, compoundId: null })
      )
      return { ok: saved !== null, protocolCompoundId: saved ? pcId : undefined }
    }

    // Reuse the canonical row for this (cycle, compound) if one already exists,
    // so a RE-ADD (when the local cache has drifted from Postgres) UPDATES that
    // row instead of inserting a second one with a fresh client id — the
    // duplicate-compound bug. A fresh add finds nothing and uses the client id
    // (so local and Postgres stay joined). The `(cycle_id, compound_id)` unique
    // constraint is the DB backstop either way.
    const { data: existing } = await cx.supabase
      .from("protocol_compounds")
      .select("id")
      .eq("user_id", cx.userId)
      .eq("cycle_id", cycle.id)
      .eq("compound_id", compoundId)
      .limit(1)
      .maybeSingle()
    const pcId = (existing?.id as string | undefined) ?? resolvePcId(cx.userId, c.id)
    const saved = await upsertProtocolCompound(
      stackCompoundToProtocolInsert(c, { id: pcId, cycleId: cycle.id, compoundId })
    )
    return { ok: saved !== null, protocolCompoundId: pcId }
  } catch (e) {
    console.error("pushProtocolCompound failed", e)
    return { ok: false }
  }
}

/**
 * Batched backfill for the one-time device→Postgres migration. Does in a SINGLE
 * round-trip (one auth check, one catalogue lookup, one `ensureActiveCycle`, then
 * chunked multi-row upserts) what the per-item `pushProtocolCompound` /
 * `pushProtocolDoseLog` would do over N+M round-trips — each of which re-verifies
 * the session and re-queries the catalogue/unit. Same deterministic ids + the same
 * mappers, so it stays idempotent and interchangeable with the live single-item
 * path; only the migration uses it.
 *
 * `doseEntries.takenAtIso` is computed client-side (device tz). `inventory_item_id`
 * stays null — a historical dose never retro-links to a vial bought later.
 */
export async function pushProtocolBatch(
  stack: StackCompound[],
  doseEntries: BatchDoseEntry[]
): Promise<{ ok: boolean; compounds: number; doseLogs: number; skippedCustom: number }> {
  const empty = { ok: false, compounds: 0, doseLogs: 0, skippedCustom: 0 }
  try {
    const cx = await ctx()
    if (!cx) return empty
    if (stack.length === 0) return { ...empty, ok: true }

    // Resolve every catalogue name → id in ONE query. Exact-match `.in()` is
    // parameterized (no wildcard/injection risk); a name absent from the read-only
    // catalogue is a custom compound and stays device-local.
    const names = [...new Set(stack.map((c) => c.name))]
    const { data: catRows, error: catError } = await cx.supabase
      .from("compounds")
      .select("id, name")
      .in("name", names)
    // Supabase returns errors in `error`, it doesn't throw — surface it so the
    // batch fails (caught below → ok:false → migration retries) instead of
    // treating every compound as "custom" and reporting a false success.
    if (catError) throw catError
    const idByName = new Map<string, string>()
    for (const r of catRows ?? []) idByName.set(r.name as string, r.id as string)

    const cycle = await ensureActiveCycle()
    if (!cycle) return empty

    // Reuse the canonical id for any compound already in this cycle — exactly like
    // the single-item pushProtocolCompound. Without this, a batch row would derive
    // a fresh id from the local c.id and the `(cycle_id, compound_id)` unique guard
    // would reject the whole upsert (aborting the migration). One query for all.
    const existingIdByCompound = new Map<string, string>()
    const compoundIds = [...new Set(idByName.values())]
    if (compoundIds.length > 0) {
      const { data: existingRows, error: existingError } = await cx.supabase
        .from("protocol_compounds")
        .select("id, compound_id")
        .eq("user_id", cx.userId)
        .eq("cycle_id", cycle.id)
        .in("compound_id", compoundIds)
      if (existingError) throw existingError
      for (const row of existingRows ?? []) {
        existingIdByCompound.set(row.compound_id as string, row.id as string)
      }
    }

    // Build the compound rows + a per-client-id map of what a dose log needs, so we
    // never re-query a compound back for its unit/amount (the single-item path did).
    type Meta = {
      pcId: string
      doseUnit: DoseUnit
      doseAmount: number
      method: StackCompound["method"]
    }
    const pcRows: ProtocolCompoundInsert[] = []
    const meta = new Map<string, Meta>()
    // One row per compound — the `(cycle_id, compound_id)` unique constraint would
    // reject a batch that tried to insert the same compound twice (a legacy/corrupt
    // local stack with two same-name entries). Keep the first; map any later
    // entry's dose logs onto that canonical row so no log is lost.
    const canonicalByCompound = new Map<string, Meta>()
    let skippedCustom = 0
    for (const c of stack) {
      const compoundId = idByName.get(c.name)
      if (!compoundId) {
        skippedCustom++
        continue
      }
      const existing = canonicalByCompound.get(compoundId)
      if (existing) {
        meta.set(c.id, existing)
        continue
      }
      const pcId = existingIdByCompound.get(compoundId) ?? resolvePcId(cx.userId, c.id)
      const row = stackCompoundToProtocolInsert(c, { id: pcId, cycleId: cycle.id, compoundId })
      pcRows.push(row)
      const m: Meta = {
        pcId,
        doseUnit: row.dose_unit,
        doseAmount: row.dose_amount,
        method: c.method,
      }
      canonicalByCompound.set(compoundId, m)
      meta.set(c.id, m)
    }

    const cRes = await upsertProtocolCompounds(pcRows)
    // Don't attempt dose logs if the compounds didn't fully land — their FK would
    // reject. A retry redoes both (deterministic ids → idempotent).
    if (!cRes.ok) return { ok: false, compounds: cRes.count, doseLogs: 0, skippedCustom }

    const dlRows: DoseLogInsert[] = []
    for (const e of doseEntries) {
      const m = meta.get(e.clientCompoundId)
      if (!m) continue // custom / unresolved compound — its log stays device-local
      const injectable = m.method === "im" || m.method === "subq"
      dlRows.push({
        id: deterministicUuid(`dl:${cx.userId}:${e.dateKey}:${m.pcId}`),
        protocol_compound_id: m.pcId,
        inventory_item_id: null,
        status: "taken",
        dose_amount: parseAmount(e.amount, m.doseAmount),
        dose_unit: m.doseUnit,
        injection_site: injectable ? localSiteToInjectionSite(e.siteId) : null,
        taken_at: e.takenAtIso,
      })
    }
    const dRes = await upsertDoseLogs(dlRows)
    return { ok: dRes.ok, compounds: cRes.count, doseLogs: dRes.count, skippedCustom }
  } catch (e) {
    console.error("pushProtocolBatch failed", e)
    return empty
  }
}

/** Archive (stop dosing, keep history) or reactivate. No-op for a custom compound
 *  (no `protocol_compound` exists). */
export async function archiveProtocolCompound(
  clientId: string,
  archived: boolean
): Promise<Ok> {
  try {
    const cx = await ctx()
    if (!cx) return { ok: false }
    const saved = await setProtocolCompoundActive(resolvePcId(cx.userId, clientId), !archived)
    return { ok: saved !== null }
  } catch (e) {
    console.error("archiveProtocolCompound failed", e)
    return { ok: false }
  }
}

/** Hard-delete a protocol compound (cascades its dose logs) — the Archive screen's
 *  permanent delete. No-op for a custom compound. */
export async function deleteProtocolCompoundForStack(clientId: string): Promise<Ok> {
  try {
    const cx = await ctx()
    if (!cx) return { ok: false }
    return await deleteProtocolCompound(resolvePcId(cx.userId, clientId))
  } catch (e) {
    console.error("deleteProtocolCompoundForStack failed", e)
    return { ok: false }
  }
}

/* --------------------------------------------------------------- dose logs */

/** The vial `base_unit` a dose in `doseUnit` may draw from (the `unitFamilyOk`
 *  families, expressed as a query filter). Null = no vial can ever match. */
function baseUnitForDose(doseUnit: string): "mg" | "iu" | null {
  if (doseUnit === "mg" || doseUnit === "mcg") return "mg"
  if (doseUnit === "iu") return "iu"
  return null
}

/**
 * The `acquired_on` cutoff for a dose on `dateKey`: the day AFTER it.
 *
 * The +1 day is the local-vs-UTC tolerance, the same one `weight/actions.ts`
 * `isFuture` uses. `inventory_items.acquired_on` defaults to `current_date`, which
 * the DB evaluates in **UTC**, while `dateKey` is the **device's local** date — so a
 * vial added this evening by a user BEHIND UTC is stamped with tomorrow's UTC date
 * and a strict `<= dateKey` would refuse to link the dose they just took from it.
 * (Max real offset either way is one calendar day.) Back-dating stays honest: a vial
 * acquired a week after the dose still can't link — this only forgives the boundary.
 */
function acquiredOnCutoff(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * THE vial-on-a-date rule, in one place (both the write path and the log sheet's
 * read use it, so they can't drift).
 *
 * Which vial a compound was drawing from on `dateKey` = the newest one already
 * acquired by then. `addStockItem` archives the compound's prior vials on every
 * add/refill, so exactly one vial is in use at a time and "newest acquired on or
 * before D" is precisely that one. Deliberately NOT filtered on `is_active`: the
 * vial a back-dated dose came from has often been used up and archived since, and
 * it's still the right one to draw down.
 *
 * The `lte` is what makes back-dating honest — a dose logged for last Tuesday can
 * never draw down a vial that wasn't acquired until Friday. It leaves live logging
 * unchanged (the current vial was always acquired on or before today). Nothing that
 * far back ⇒ null ⇒ no link, rather than a wrong one.
 *
 * Compared by DAY (`acquired_on`, the column meaning "when this item started being
 * used") rather than by instant: a dose's time-of-day is a user-editable guess, so
 * an instant compare would drop the link on a dose logged for 08:00 today from a
 * vial added at 14:00 today — same day, real vial.
 *
 * Unit-family is filtered IN the query (not after `limit 1`), so an incompatible
 * newest vial falls through to an older compatible one instead of losing the link.
 */
type VialLookup =
  /** The query ran. `vial` is null only when there genuinely wasn't one that day. */
  | { ok: true; vial: { id: string; totalAmountUnit: string | null } | null }
  /** The query failed — we do NOT know whether a vial exists. */
  | { ok: false }

async function vialOnDateResult(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  pcId: string,
  dateKey: string,
  doseUnit: string
): Promise<VialLookup> {
  const base = baseUnitForDose(doseUnit)
  if (!base) return { ok: true, vial: null } // no vial can ever match — a real answer
  const { data, error } = await supabase
    .from("inventory_items")
    // `total_amount_unit` rides along for the draw's tab/cap wording (Spec 21). The
    // view doesn't carry it, and fetching it here rather than in a second query keeps
    // it impossible for the noun to go missing while the vial resolved.
    .select("id, total_amount_unit")
    .eq("protocol_compound_id", pcId)
    .eq("user_id", userId)
    .eq("base_unit", base)
    .lte("acquired_on", acquiredOnCutoff(dateKey))
    .order("acquired_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  // A failed read and "no vial that far back" are very different problems, so they get
  // different answers. The dose-log WRITE path deliberately collapses both to "no
  // link" (never guess a vial) — see the `vialOnDate` wrapper. The draw READ must not:
  // "no vial" is rendered as the claim *you have no stock*, which a broken query has
  // no business making.
  if (error) {
    console.error("vialOnDate failed", error)
    return { ok: false }
  }
  return {
    ok: true,
    vial: data
      ? { id: data.id as string, totalAmountUnit: (data.total_amount_unit as string | null) ?? null }
      : null,
  }
}

/** The write path's view of the rule: a failed read and "no vial" both mean no link —
 *  the safe answer either way, since a wrong link would decrement the wrong vial. */
async function vialOnDate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  pcId: string,
  dateKey: string,
  doseUnit: string
): Promise<{ id: string } | null> {
  const r = await vialOnDateResult(supabase, userId, pcId, dateKey, doseUnit)
  return r.ok && r.vial ? { id: r.vial.id } : null
}

/**
 * Which vial a dose on `dateKey` would draw from — the log sheet's read, so a
 * back-dated log can name the vial it's about to decrement (and offer the opt-out)
 * instead of guessing. `listStock` can't answer this: it only knows what's active
 * NOW, and the vial in use on a past day is often archived by now.
 *
 * Returns null when the compound had no compatible vial that far back (⇒ the dose
 * links nothing), or for a custom/unmigrated compound.
 */
export async function resolveVialForDate(
  clientCompoundId: string,
  dateKey: string
): Promise<{ id: string } | null> {
  try {
    const cx = await ctx()
    if (!cx) return null
    const pcId = resolvePcId(cx.userId, clientCompoundId)
    const { data: pc } = await cx.supabase
      .from("protocol_compounds")
      .select("dose_unit")
      .eq("id", pcId)
      .eq("user_id", cx.userId)
      .maybeSingle()
    if (!pc) return null
    return await vialOnDate(cx.supabase, cx.userId, pcId, dateKey, pc.dose_unit as string)
  } catch (e) {
    console.error("resolveVialForDate failed", e)
    return null
  }
}

/**
 * Per-Dose Draw (Spec 21) — the vial-side facts each of the day's dose rows needs
 * to show how much to draw, keyed by the CLIENT compound id the caller passed.
 *
 * The Home today's-log is computed client-side from the device stack + dose logs
 * (it is not a Postgres select), so it carries no inventory data at all — hence
 * this read rather than extra columns on an existing query.
 *
 * Resolution reuses `vialOnDate` verbatim, so the vial a row prices its draw
 * against is exactly the vial a dose logged that day would draw down. It resolves
 * for the SELECTED day, not today: a back-dated row must price against the vial in
 * use *then* (often archived by now), the same rule that keeps back-dating honest.
 *
 * `concentration_per_ml` / `inventory_type` / `strength_per_unit_mg` come ONLY from
 * `v_inventory_math` — never recomputed. The division by the row's own dose happens
 * in `lib/home/draw.ts`; see the note there for why the view can't do it.
 *
 * Best-effort like the rest of this module: never throws, and logging is never
 * blocked. But "no vial" is NOT signalled by absence — it's returned explicitly in
 * `noVial`, because the row renders it as the claim *you have no stock*. A failed
 * lookup leaves a compound out of BOTH maps: we don't know, so the row says nothing.
 */
export interface DrawSourcesResult {
  /** Vial facts, per client compound id — only where a vial actually resolved. */
  sources: Record<string, DrawSource>
  /** Client compound ids we successfully looked up and CONFIRMED have no vial that
   *  day. Only these may offer "add stock". Absent from both maps ⇒ lookup failed. */
  noVial: string[]
}

const EMPTY_RESULT: DrawSourcesResult = { sources: {}, noVial: [] }

export async function resolveDrawSources(
  clientCompoundIds: string[],
  dateKey: string
): Promise<DrawSourcesResult> {
  try {
    const cx = await ctx()
    if (!cx || clientCompoundIds.length === 0) return EMPTY_RESULT

    // Client id ⇄ protocol_compounds.id, de-duped (the same compound can't appear
    // twice on a day, but the caller shouldn't have to guarantee that).
    const pairs = [...new Set(clientCompoundIds)].map((clientId) => ({
      clientId,
      pcId: resolvePcId(cx.userId, clientId),
    }))

    // dose_unit from Postgres, not the client: it's what the vial's unit family is
    // filtered on, so reading it here keeps the match and the formatting on one fact.
    const { data: pcs, error: pcErr } = await cx.supabase
      .from("protocol_compounds")
      .select("id, dose_unit")
      .eq("user_id", cx.userId)
      .in("id", pairs.map((p) => p.pcId))
    if (pcErr) {
      // We couldn't even read the compounds — we know nothing about anyone's stock.
      console.error("resolveDrawSources compounds failed", pcErr)
      return EMPTY_RESULT
    }
    const unitByPc = new Map(
      (pcs ?? []).map((r) => [r.id as string, r.dose_unit as string])
    )

    // One `vialOnDate` per compound — THE shared rule, applied per compound rather
    // than re-implemented as a batch pick in TS (a second implementation is exactly
    // the drift that rule exists to prevent). Small, indexed, and run in parallel.
    const looked = await Promise.all(
      pairs.map(async (p) => {
        const doseUnit = unitByPc.get(p.pcId)
        // A custom / unmigrated compound has no protocol_compounds row and so can
        // hold no vial — a real "no vial", not a failure.
        if (!doseUnit) return { ...p, doseUnit: null, lookup: { ok: true, vial: null } as VialLookup }
        const lookup = await vialOnDateResult(cx.supabase, cx.userId, p.pcId, dateKey, doseUnit)
        return { ...p, doseUnit, lookup }
      })
    )

    // Confirmed no vial ⇒ the row may offer "add stock". A failed lookup falls through
    // both lists and the row stays quiet.
    const noVial = looked
      .filter((l) => l.lookup.ok && l.lookup.vial === null)
      .map((l) => l.clientId)
    const hits = looked.flatMap((l) =>
      l.lookup.ok && l.lookup.vial && l.doseUnit
        ? [{ clientId: l.clientId, doseUnit: l.doseUnit, vial: l.lookup.vial }]
        : []
    )
    if (hits.length === 0) return { sources: {}, noVial }

    const mathRes = await cx.supabase
      .from("v_inventory_math")
      .select("inventory_item_id, inventory_type, concentration_per_ml, strength_per_unit_mg")
      .in("inventory_item_id", hits.map((h) => h.vial.id))
    if (mathRes.error) {
      // The vials resolved but their maths didn't load. Keep the confirmed-no-vial
      // rows (that lookup DID succeed) and leave the rest quiet — never downgrade a
      // compound we know has a vial into "add stock".
      console.error("resolveDrawSources math failed", mathRes.error)
      return { sources: {}, noVial }
    }

    const math = new Map(
      (mathRes.data ?? []).map((m) => [m.inventory_item_id as string, m])
    )

    const sources: Record<string, DrawSource> = {}
    for (const h of hits) {
      const m = math.get(h.vial.id)
      if (!m) continue // vial resolved but no math row — say nothing, don't claim empty
      sources[h.clientId] = {
        inventoryType: m.inventory_type as InventoryType,
        concentrationPerMl:
          m.concentration_per_ml == null ? null : Number(m.concentration_per_ml),
        strengthPerUnitMg:
          m.strength_per_unit_mg == null ? null : Number(m.strength_per_unit_mg),
        oralForm: h.vial.totalAmountUnit,
        doseUnit: h.doseUnit,
      }
    }
    return { sources, noVial }
  } catch (e) {
    console.error("resolveDrawSources failed", e)
    return EMPTY_RESULT
  }
}

/**
 * Upsert a logged dose. `takenAtIso` is computed CLIENT-side from the local date +
 * time (the server can't know the device's timezone). The dose-log id is
 * deterministic per (user, day, compound) so it matches the Step 2 migration and
 * an edit overwrites in place. No-op (no error) when the compound has no
 * `protocol_compound` — i.e. a custom compound's log stays device-local.
 */
export async function pushProtocolDoseLog(
  clientCompoundId: string,
  dateKey: string,
  log: DoseLog,
  takenAtIso: string,
  method: "im" | "subq" | "po" | "nasal",
  // Live logs (`logDose`) pass `true`: when the client left the vial undecided,
  // resolve one server-side from `takenAtIso` so the runway still decrements. The
  // migration leaves this `false` — bulk-imported history should link nothing at
  // all rather than guess.
  autoLinkVialForDate = false
): Promise<Ok> {
  try {
    const cx = await ctx()
    if (!cx) return { ok: false }
    const pcId = resolvePcId(cx.userId, clientCompoundId)
    const { data: pc } = await cx.supabase
      .from("protocol_compounds")
      .select("dose_unit, dose_amount")
      .eq("id", pcId)
      .eq("user_id", cx.userId)
      .maybeSingle()
    if (!pc) return { ok: false, skipped: true } // custom / unmigrated → skip

    // Resolve which vial (if any) this dose draws from, so its runway decrements
    // (v_inventory_math). A vial id = an explicit pick; `null` = an explicit "Not
    // tracked"; `undefined` = undecided → resolve it from the dose's own day. A link
    // is only kept when the vial's base unit is family-compatible with the dose unit
    // — otherwise it's dropped rather than failing the whole log (the DB would
    // reject it).
    let inventoryItemId: string | null = null
    const picked = log.inventoryItemId
    if (typeof picked === "string") {
      // What must hold: the vial is the user's own, belongs to THIS compound, and
      // is unit-family compatible. `is_active` is deliberately NOT one of them — a
      // back-dated dose legitimately draws from the vial that was in use on its day,
      // which is often archived by now (every add/refill archives the prior vial), so
      // filtering on it here would silently drop exactly the link `vialOnDate` just
      // resolved. The `protocol_compound_id` check is what keeps that relaxation
      // safe: without it the accepted set would widen from "this compound's active
      // vials" to "every vial the user owns", letting a stale or hand-edited cache
      // point compound A's dose at compound B's vial and draw down the wrong stock.
      // (The DB constrains the unit family but not the compound.) RLS stays the
      // ownership backstop.
      // `acquired_on` is checked here too, not just in `vialOnDate` — otherwise the
      // date rule would be trivially bypassable by anything that sends an explicit
      // id, and a link made under the OLD rule (newest ACTIVE vial, whenever the dose
      // happened) would survive every re-save instead of healing. Legit picks all
      // satisfy it by construction: today's picker only offers vials acquired by
      // today, and a back-dated pick comes from `vialOnDate`, which applies the same
      // cutoff. Verified against live data — 51 linked doses, none with a vial
      // acquired after the dose's day — so this rejects nothing real.
      const { data: vial, error } = await cx.supabase
        .from("inventory_items")
        .select("base_unit")
        .eq("id", picked)
        .eq("user_id", cx.userId)
        .eq("protocol_compound_id", pcId)
        .lte("acquired_on", acquiredOnCutoff(dateKey))
        .maybeSingle()
      if (error) console.error("pushProtocolDoseLog vial check failed", error)
      if (vial && unitFamilyOk(vial.base_unit as string, pc.dose_unit as string)) {
        inventoryItemId = picked
      }
    } else if (picked === undefined && autoLinkVialForDate) {
      // Undecided — resolve the vial from the dose's own DAY (see `vialOnDate`).
      // The sheet normally resolves this itself and sends an explicit id; this is
      // the fallback for a dose tracked before that read returned.
      const vial = await vialOnDate(
        cx.supabase,
        cx.userId,
        pcId,
        dateKey,
        pc.dose_unit as string
      )
      if (vial) inventoryItemId = vial.id
    }

    const dlId = deterministicUuid(`dl:${cx.userId}:${dateKey}:${pcId}`)
    const saved = await upsertDoseLog({
      id: dlId,
      protocol_compound_id: pcId,
      inventory_item_id: inventoryItemId,
      status: "taken",
      dose_amount: parseAmount(log.amount, Number(pc.dose_amount)),
      dose_unit: pc.dose_unit as DoseUnit,
      injection_site: method === "im" || method === "subq"
        ? localSiteToInjectionSite(log.siteId)
        : null,
      taken_at: takenAtIso,
    })
    return { ok: saved !== null }
  } catch (e) {
    console.error("pushProtocolDoseLog failed", e)
    return { ok: false }
  }
}

/** Remove a logged dose (the untick / undo path). No-op for a custom compound. */
export async function deleteProtocolDoseLog(
  clientCompoundId: string,
  dateKey: string
): Promise<Ok> {
  try {
    const cx = await ctx()
    if (!cx) return { ok: false }
    const pcId = resolvePcId(cx.userId, clientCompoundId)
    const dlId = deterministicUuid(`dl:${cx.userId}:${dateKey}:${pcId}`)
    return await deleteDoseLog(dlId)
  } catch (e) {
    console.error("deleteProtocolDoseLog failed", e)
    return { ok: false }
  }
}

/* ------------------------------------------------------------------- pull */

/**
 * The user's protocol compounds (joined to the catalogue for name/category) as
 * `StackCompound[]`, plus raw dose-log rows for the client to key by local day.
 * Empty shapes (never throws) when signed out / offline / on error — so a failed
 * pull never wipes the local cache.
 */
export async function pullProtocolStackAndLogs(): Promise<{
  stack: StackCompound[]
  doseRows: DoseRow[]
}> {
  const empty = { stack: [] as StackCompound[], doseRows: [] as DoseRow[] }
  // Guarded: a hung Supabase fast-fails to `empty` so hydration never blocks on a
  // degraded dependency; an empty pull never wipes the local cache (the read path).
  return guard(
    "supabase:pullProtocolStackAndLogs",
    async () => {
      const cx = await ctx()
      if (!cx) return empty
      const [pcRes, dlRes] = await Promise.all([
        cx.supabase
          .from("protocol_compounds")
          .select("*, compounds(name, category)")
          .eq("user_id", cx.userId),
        cx.supabase
          .from("dose_logs")
          .select("protocol_compound_id, taken_at, dose_amount, injection_site, inventory_item_id")
          .eq("user_id", cx.userId),
      ])
      // Surface Supabase errors (they don't throw) so the breaker counts a real
      // failure and we fall back to the cache, rather than rendering empty.
      if (pcRes.error) throw pcRes.error
      if (dlRes.error) throw dlRes.error

      // One row per compound. The `(cycle_id, compound_id)` unique constraint
      // prevents new duplicates, but a row left over from before the constraint
      // (or in an archived cycle) could still surface the same compound twice —
      // and the client merge only de-dupes the LOCAL extras, not this pull. Keep
      // the best row per compound (active first, then most-recently-updated) so
      // the Home stack can never render "two of the same".
      type PcRow = NonNullable<typeof pcRes.data>[number]
      const rank = (row: PcRow): number => {
        const r = row as Record<string, unknown>
        const active = r.is_active === false ? 0 : 1
        const t = Date.parse((r.updated_at ?? r.created_at) as string) || 0
        return active * 1e15 + t
      }
      const bestByCompound = new Map<string, PcRow>()
      for (const row of pcRes.data ?? []) {
        const key = (row as { compound_id?: string }).compound_id
        if (!key) continue
        const cur = bestByCompound.get(key)
        if (!cur || rank(row) > rank(cur)) bestByCompound.set(key, row)
      }

      const stack: StackCompound[] = []
      for (const row of bestByCompound.values()) {
        const cat = (row as { compounds?: { name: string; category: string } | null }).compounds
        if (!cat) continue
        stack.push(
          protocolCompoundToStack(row, {
            name: cat.name,
            category: cat.category as CompoundCategory,
          })
        )
      }

      const doseRows: DoseRow[] = (dlRes.data ?? []).map((r) => ({
        compoundId: r.protocol_compound_id as string,
        takenAt: r.taken_at as string,
        amount: String(r.dose_amount),
        injectionSite: (r.injection_site as string | null) ?? null,
        inventoryItemId: (r.inventory_item_id as string | null) ?? null,
      }))

      return { stack, doseRows }
    },
    { fallback: empty }
  )
}
