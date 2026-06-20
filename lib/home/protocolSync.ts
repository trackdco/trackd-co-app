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
import { ensureActiveCycle } from "@/lib/db/cycles"
import {
  deleteProtocolCompound,
  setProtocolCompoundActive,
  upsertProtocolCompound,
} from "@/lib/db/protocolCompounds"
import { deleteDoseLog, upsertDoseLog } from "@/lib/db/doseLogs"
import {
  localSiteToInjectionSite,
  protocolCompoundToStack,
  stackCompoundToProtocolInsert,
  type DoseRow,
  type DoseUnit,
} from "@/lib/db/types"
import type { CompoundCategory } from "@/lib/compound-categories"
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
 * Resolves the catalogue uuid by name; a name not in the catalogue is a custom
 * compound and is left device-local (`skipped`).
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
    const compoundId = rows?.[0]?.id as string | undefined
    if (!compoundId) return { ok: false, skipped: true } // custom → device-local
    const cycle = await ensureActiveCycle()
    if (!cycle) return { ok: false }
    const pcId = resolvePcId(cx.userId, c.id)
    const saved = await upsertProtocolCompound(
      stackCompoundToProtocolInsert(c, { id: pcId, cycleId: cycle.id, compoundId })
    )
    return { ok: saved !== null, protocolCompoundId: pcId }
  } catch (e) {
    console.error("pushProtocolCompound failed", e)
    return { ok: false }
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
  // Live logs (`logDose`) pass `true`: when the client left the vial undecided
  // (the Stock list loads async and the user can tap Track before it arrives),
  // link the compound's current active vial server-side so the runway always
  // decrements. The migration leaves this `false` so a historical dose never
  // retro-links to a vial bought long after it was taken.
  autoLinkActiveVial = false
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
    // (v_inventory_math). A vial id = the user's explicit pick; `null` = an
    // explicit "Not tracked"; `undefined` = undecided → fall back to the
    // compound's newest active vial on a live log. A link is only kept when the
    // vial's base unit is family-compatible with the dose unit — otherwise it's
    // dropped rather than failing the whole log (the DB would reject it).
    let inventoryItemId: string | null = null
    const picked = log.inventoryItemId
    if (typeof picked === "string") {
      const { data: vial } = await cx.supabase
        .from("inventory_items")
        .select("base_unit")
        .eq("id", picked)
        .eq("user_id", cx.userId)
        .eq("is_active", true)
        .maybeSingle()
      if (vial && unitFamilyOk(vial.base_unit as string, pc.dose_unit as string)) {
        inventoryItemId = picked
      }
    } else if (picked === undefined && autoLinkActiveVial) {
      const { data: vial } = await cx.supabase
        .from("inventory_items")
        .select("id, base_unit")
        .eq("protocol_compound_id", pcId)
        .eq("user_id", cx.userId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (vial && unitFamilyOk(vial.base_unit as string, pc.dose_unit as string)) {
        inventoryItemId = vial.id as string
      }
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
  try {
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

    const stack: StackCompound[] = []
    for (const row of pcRes.data ?? []) {
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
  } catch (e) {
    console.error("pullProtocolStackAndLogs failed", e)
    return empty
  }
}
