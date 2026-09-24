"use server"

/**
 * Data access for `inventory_items` + the read-only `v_inventory_math` view
 * (Protocol Cutover, Step 5 — the Stock view / "stock left" runway). RLS-scoped;
 * identity from the verified session, never the service role (house pattern).
 *
 * INVARIANT: all derived figures — remaining, doses-remaining, projected-empty,
 * mL-per-dose — come ONLY from `v_inventory_math` (read here, never recomputed in
 * TS). Writes store raw inputs only. Refill = a NEW row (never mutate a vial);
 * archive = `is_active = false` (never hard-delete).
 *
 * ONE ROW PER CONTAINER, AND SEVERAL MAY BE OPEN (Adrian, 2026-09-24). Adding
 * stock no longer archives the compound's other containers: two open vials can
 * both be logged from, the OLDER first, and spares (`acquired_on` NULL, not yet
 * mixed or opened) are held beside them. What a compound HOLDS is read per
 * compound from `v_compound_stock` (`supabase/protocol/026`); which container is
 * in use is the pure rule in `lib/protocol/stockView.ts`. A container leaves the
 * list when it is discarded (archived) — history is never deleted.
 */
import { createClient } from "@/lib/supabase/server"
import type { DoseUnit, InventoryType } from "@/lib/db/types"
import { refuseWrite, type WriteRefusalKind } from "@/lib/billing/gate"

/**
 * `inventory_items` + its joined compound, as of `supabase/protocol/016`.
 * `protocol_compounds!inner` + the is_active filter makes Stock a strict subset
 * of the user's ACTIVE compounds: archiving a compound on Home drops its vial
 * from Stock too, so Stock can never show a compound Home doesn't.
 * custom_name/custom_category cover a CUSTOM compound (compound_id NULL, so the
 * nested `compounds` join is null) — coalesced when the row is mapped.
 */
const ITEM_COLUMNS_POST_016 =
  "id, created_at, protocol_compound_id, inventory_type, base_unit, acquired_on, reconstituted_on, total_amount, total_amount_unit, bac_water_ml, concentration_mg_per_ml, strength_per_unit, serving_size_g, prior_used_base, protocol_compounds!inner(is_active, custom_name, custom_category, compounds(name, category))"

/** The same list before `016` renamed the strength column and `014` added the
 *  serving size — the retry list, so the app still runs against a database that
 *  has had neither applied. */
const ITEM_COLUMNS_PRE_016 =
  "id, created_at, protocol_compound_id, inventory_type, base_unit, acquired_on, reconstituted_on, total_amount, total_amount_unit, bac_water_ml, concentration_mg_per_ml, strength_per_unit_mg, prior_used_base, protocol_compounds!inner(is_active, custom_name, custom_category, compounds(name, category))"

/** The math view's columns as they exist before `supabase/protocol/010`. */
const MATH_COLUMNS =
  "inventory_item_id, remaining_display, doses_remaining, est_empty_date, ml_per_dose, units_per_dose_oral, concentration_per_ml, remaining_base, total_base"
/** …and with 010's timezone-free runway. */
const MATH_COLUMNS_WITH_DAYS = `${MATH_COLUMNS}, days_to_empty`

/** The per-compound read (`supabase/protocol/026`). */
const COMPOUND_STOCK_COLUMNS = "protocol_compound_id, doses_ready, open_count, spares_held"

/** "That relation doesn't exist" — `026` (which creates `v_compound_stock`) is
 *  not applied yet. `42P01` from Postgres, `PGRST205` from PostgREST's cache. */
function isMissingRelation(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205"
}

/** "That column doesn't exist" — 010 is not applied yet. `42703` from Postgres,
 *  `PGRST204` from PostgREST's own schema cache. Mirrors `protocolSync.ts`. */
function isUndefinedColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703" || error?.code === "PGRST204"
}

/**
 * "That enum has no such value" — `bulk_powder` and `g` before
 * `supabase/protocol/014` PART A.
 *
 * A DIFFERENT code from a missing column (`22P02` is invalid text
 * representation; `23514` is the type CHECK rejecting the shape), so the
 * column-name retries never fired for it and adding a tub of creatine simply
 * failed with a bare "couldn't save this stock".
 *
 * There is deliberately NO retry for it. Unlike a renamed column, there is
 * nothing to rewrite the payload INTO: a database without the enum value cannot
 * hold a powder at all, and coercing it to `oral_solid` would store a tub as a
 * tablet count and quietly corrupt the maths. The caller gets a specific answer
 * instead, so the sheet can say what is actually wrong.
 */
function isPendingEnumValue(
  error: { code?: string } | null,
  row: StockInsert,
): boolean {
  // A value the `inventory_type` enum has never heard of — unambiguous.
  if (error?.code === "22P02") return true
  if (error?.code !== "23514") return false
  /**
   * `23514` is EVERY check violation on this table, plus both unit-family
   * triggers, which `RAISE ... USING ERRCODE = '23514'`. Treating all of it as
   * "your database is behind" meant a row rejected for a perfectly ordinary
   * reason — a strength of 0 (`strength_positive`), or a `base_unit` that cannot
   * pair with the compound's dose unit — told the user:
   *
   *   "This container type isn't available yet. Try Reconstituted, Pre-mixed or
   *    Oral for now."
   *
   * …on a sheet where Oral was already selected. A dead end, and a false one.
   *
   * The pending-migration reading only ever made sense for the case it was
   * written for: a database with no `bulk_powder` enum value rejects a tub via
   * the type CHECK. So it is claimed for a tub and nothing else.
   */
  return row.inventory_type === "bulk_powder"
}

/**
 * A write payload rewritten for a database that has not had `014`/`016` applied:
 * `strength_per_unit` goes back to `strength_per_unit_mg` and `serving_size_g`
 * is dropped.
 *
 * The rename is safe to undo because the values are identical — `016` renames a
 * column, it does not convert anything. Dropping the serving size is a real (if
 * small) loss, and it is the right trade: a serving size is a convenience, and
 * losing it beats failing the whole insert and telling the user their stock
 * didn't save. It cannot bite in practice either way, since `serving_size_g` is
 * only ever set on a `bulk_powder`, and a database without `014` has no such
 * type for the row to be.
 */
function toLegacyColumns(row: object): Record<string, unknown> {
  const { strength_per_unit, serving_size_g: _dropped, ...rest } = row as Record<string, unknown>
  void _dropped
  return strength_per_unit === undefined
    ? rest
    : { ...rest, strength_per_unit_mg: strength_per_unit }
}

async function sessionCtx() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, userId: user.id }
}

/** A stock item = the raw `inventory_items` row + its joined compound name and the
 *  DERIVED figures from `v_inventory_math`. The maths fields are read-only. */
export interface StockItem {
  id: string
  /** When the row was written — the tie-break after `acquiredOn` for which of
   *  two containers started the same day is older. */
  createdAt: string | null
  protocolCompoundId: string
  compoundName: string
  category: string
  inventoryType: InventoryType
  baseUnit: string
  /** The day this container was started (mixed or opened). NULL = a SPARE, held
   *  but not started (`supabase/protocol/026`); a spare counts no doses. */
  acquiredOn: string | null
  reconstitutedOn: string | null
  // raw inputs — for pre-filling the edit form (NOT used for any maths):
  totalAmount: number | null
  totalAmountUnit: string | null
  bacWaterMl: number | null
  concentrationMgPerMl: number | null
  /** Strength of ONE tab/cap, in the unit named by `baseUnit` — mg OR iu, which
   *  is why `016` renamed the column off `_mg`. NULL is meaningful: the label
   *  states no single strength (a multivitamin), and then the COUNT is the base. */
  strengthPerUnit: number | null
  /** Grams in one scoop, for a `bulk_powder` only. A convenience for the
   *  quick-add chip — inventory is tracked in grams either way. */
  servingSizeG: number | null
  /** Base-unit amount already used when the vial was added part-used (NULL = full).
   *  A raw INPUT folded into remaining by v_inventory_math — never a stored balance. */
  priorUsedBase: number | null
  // derived (v_inventory_math) — never recomputed in TS:
  remainingDisplay: number | null
  dosesRemaining: number | null
  /**
   * The view's `current_date + N`. `current_date` is the DATABASE's date, and
   * Supabase runs UTC, so this is a day out for any user whose local date differs
   * from UTC's at the moment they read it. Prefer `daysToEmpty`, which is the same
   * estimate with the date anchoring removed.
   */
  estEmptyDate: string | null
  /** Whole days of runway left — the N above, on its own, so the client can add it
   *  to the day IT knows it is. Null until `supabase/protocol/010` is applied. */
  daysToEmpty: number | null
  mlPerDose: number | null
  unitsPerDoseOral: number | null
  concentrationPerMl: number | null
  /** Remaining + total in the base unit — for the fullness bar (remaining/total). */
  remainingBase: number | null
  totalBase: number | null
}

/** Raw inputs for a new inventory item. `user_id` is injected server-side; the
 *  type-specific discriminators are CHECK-enforced by the schema. */
export interface StockInsert {
  id: string
  protocol_compound_id: string
  inventory_type: InventoryType
  base_unit: DoseUnit
  total_amount: number
  total_amount_unit: DoseUnit
  bac_water_ml?: number | null
  concentration_mg_per_ml?: number | null
  /** Renamed off `_mg` by `supabase/protocol/016`; nullable since the same
   *  migration, meaning "the label states no single strength". */
  strength_per_unit?: number | null
  /** `bulk_powder` only — the CHECK rejects it on anything else. */
  serving_size_g?: number | null
  reconstituted_on?: string | null
  /**
   * The day the container was started. OMITTED = the column default, today (a
   * container in use, which is what every caller before `026` meant). `null` =
   * a SPARE, held but not started; an unmixed vial must also have no water and
   * no mix date (`inv_type_fields`, `026`).
   */
  acquired_on?: string | null
  /** Base-unit amount already gone when added part-used (NULL/0 = a full vial). */
  prior_used_base?: number | null
}

/** What one compound HOLDS, from `v_compound_stock` (`026`). Never recomputed. */
export interface CompoundStock {
  protocolCompoundId: string
  /** Doses in every OPEN container. Null when none is open or none can say. */
  dosesReady: number | null
  /** Containers started and not discarded. */
  openCount: number
  /** Containers held but not started (spares). */
  sparesHeld: number
}

/**
 * A stock read. A FAILED read is its own answer, never an empty list: an empty
 * list is the claim "you hold nothing", which is exactly what every card used to
 * say ("Add stock") when the read merely broke (build brief §5, item 6).
 */
export type StockRead =
  | { ok: true; items: StockItem[]; compounds: CompoundStock[] }
  | { ok: false }

/**
 * Active stock for the user: every container not discarded, each joined to its
 * compound name + category and its `v_inventory_math` figures (stitched by id —
 * no maths recomputed), plus what each COMPOUND holds from `v_compound_stock`.
 *
 * `{ ok: false }` on any failure, and signed out. Never an empty list standing
 * in for an error: see {@link StockRead}.
 */
export async function listStock(): Promise<StockRead> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const itemsQuery = (columns: string) =>
      ctx.supabase
        .from("inventory_items")
        // `protocol_compounds!inner` + the is_active filter below makes Stock a
        // strict subset of the user's ACTIVE compounds: archiving or removing a
        // compound on Home (which sets/clears its protocol_compounds row) drops its
        // stock too, so Stock can never show a compound Home doesn't.
        // custom_name/custom_category cover a CUSTOM compound (compound_id NULL,
        // so the nested `compounds` join is null) — coalesced below.
        .select(columns)
        .eq("user_id", ctx.userId)
        .eq("is_active", true)
        .eq("protocol_compounds.is_active", true)
        .order("created_at", { ascending: false })
    const [itemsRes, mathRes, compoundRes] = await Promise.all([
      itemsQuery(ITEM_COLUMNS_POST_016),
      // `days_to_empty` arrives with `supabase/protocol/010`. Asked for
      // optimistically and retried without it below: the app must run against a
      // database that has not had 010 applied yet.
      ctx.supabase.from("v_inventory_math").select(MATH_COLUMNS_WITH_DAYS),
      ctx.supabase.from("v_compound_stock").select(COMPOUND_STOCK_COLUMNS),
    ])
    // The column list is a variable (the pre-016 retry reuses the query), so the
    // client cannot type the rows from it; they are read field by field below.
    let itemRows = itemsRes.data as unknown as Record<string, unknown>[] | null
    if (itemsRes.error) {
      // Pre-016: `strength_per_unit` and `serving_size_g` do not exist yet. Retry
      // on the old column list, and alias the old name into the new one below.
      if (!isUndefinedColumn(itemsRes.error)) {
        console.error("listStock items failed", itemsRes.error)
        return { ok: false }
      }
      const retry = await itemsQuery(ITEM_COLUMNS_PRE_016)
      if (retry.error) {
        console.error("listStock items failed", retry.error)
        return { ok: false }
      }
      itemRows = retry.data as unknown as Record<string, unknown>[] | null
    }
    let mathRows: Record<string, unknown>[] | null =
      (mathRes.data as Record<string, unknown>[] | null) ?? null
    if (mathRes.error) {
      // Pre-010: the column does not exist yet. Read the rest rather than fail,
      // and the runway falls back to `est_empty_date` below.
      if (!isUndefinedColumn(mathRes.error)) {
        // A failed math read would otherwise show items with null runway as if valid.
        console.error("listStock math failed", mathRes.error)
        return { ok: false }
      }
      const retry = await ctx.supabase.from("v_inventory_math").select(MATH_COLUMNS)
      if (retry.error) {
        console.error("listStock math failed", retry.error)
        return { ok: false }
      }
      mathRows = (retry.data as Record<string, unknown>[] | null) ?? null
    }
    const math = new Map<string, Record<string, unknown>>()
    for (const m of mathRows ?? []) {
      math.set(m.inventory_item_id as string, m)
    }
    const num = (v: unknown): number | null => (v == null ? null : Number(v))

    const items: StockItem[] = (itemRows ?? []).map((row) => {
      const r = row as Record<string, unknown>
      const pc = r.protocol_compounds as {
        custom_name?: string | null
        custom_category?: string | null
        compounds?: { name?: string; category?: string } | null
      } | null
      const cat = pc?.compounds
      const m = math.get(r.id as string) ?? {}
      return {
        id: r.id as string,
        createdAt: (r.created_at as string | null) ?? null,
        protocolCompoundId: r.protocol_compound_id as string,
        // Catalogue name/category, else the custom row's own — a custom vial shows
        // the user's compound name in Stock, not a "Compound" placeholder.
        compoundName: cat?.name ?? pc?.custom_name ?? "Compound",
        category: cat?.category ?? pc?.custom_category ?? "anabolic",
        inventoryType: r.inventory_type as InventoryType,
        baseUnit: r.base_unit as string,
        acquiredOn: (r.acquired_on as string | null) ?? null,
        reconstitutedOn: (r.reconstituted_on as string | null) ?? null,
        totalAmount: num(r.total_amount),
        totalAmountUnit: (r.total_amount_unit as string | null) ?? null,
        bacWaterMl: num(r.bac_water_ml),
        concentrationMgPerMl: num(r.concentration_mg_per_ml),
        // `strength_per_unit_mg` is the pre-016 name — read as a fallback so the
        // retry path above produces the same shape as the primary one.
        strengthPerUnit: num(r.strength_per_unit ?? r.strength_per_unit_mg),
        servingSizeG: num(r.serving_size_g),
        priorUsedBase: num(r.prior_used_base),
        remainingDisplay: num(m.remaining_display),
        dosesRemaining: num(m.doses_remaining),
        estEmptyDate: (m.est_empty_date as string | null) ?? null,
        daysToEmpty: m.days_to_empty == null ? null : Number(m.days_to_empty),
        mlPerDose: num(m.ml_per_dose),
        unitsPerDoseOral: num(m.units_per_dose_oral),
        concentrationPerMl: num(m.concentration_per_ml),
        remainingBase: num(m.remaining_base),
        totalBase: num(m.total_base),
      }
    })

    let compounds: CompoundStock[]
    if (!compoundRes.error) {
      compounds = ((compoundRes.data as Record<string, unknown>[] | null) ?? []).map((r) => ({
        protocolCompoundId: r.protocol_compound_id as string,
        dosesReady: num(r.doses_ready),
        openCount: Number(r.open_count ?? 0),
        sparesHeld: Number(r.spares_held ?? 0),
      }))
    } else if (isMissingRelation(compoundRes.error)) {
      // Pre-026 there is no per-compound view, and no spares either: every row
      // `main` writes is started, and `addStockItem` archived all but one. So the
      // compound holds exactly its rows' doses. Summed here only until `026` is
      // applied; after that the view answers and this branch is dead.
      compounds = compoundsFromItems(items)
    } else {
      console.error("listStock compound read failed", compoundRes.error)
      return { ok: false }
    }
    return { ok: true, items, compounds }
  } catch (e) {
    console.error("listStock failed", e)
    return { ok: false }
  }
}

/** The pre-`026` stand-in for `v_compound_stock`. See its caller. */
function compoundsFromItems(items: StockItem[]): CompoundStock[] {
  const by = new Map<string, CompoundStock>()
  for (const it of items) {
    const c = by.get(it.protocolCompoundId) ?? {
      protocolCompoundId: it.protocolCompoundId,
      dosesReady: null,
      openCount: 0,
      sparesHeld: 0,
    }
    if (it.acquiredOn == null) c.sparesHeld += 1
    else {
      c.openCount += 1
      if (it.dosesRemaining != null) c.dosesReady = (c.dosesReady ?? 0) + it.dosesRemaining
    }
    by.set(it.protocolCompoundId, c)
  }
  return [...by.values()]
}

/**
 * Add stock: ONE row per container. `count` > 1 adds that many identical
 * containers ("a box of ten"), the first with `row.id` and the rest with fresh
 * ids, in ONE insert so a box is never half-added. Used for first stock and for
 * more stock alike: a new container is always a new row (consumption history is
 * the moat), and the compound's other containers are LEFT OPEN. Two open vials
 * can both be logged from, the older first (Adrian, 2026-09-24). This used to
 * archive every other active row, which is what made "one vial at a time" true.
 *
 * Spares: pass `acquired_on: null` for a container held but not started. The
 * box's first container can be started at once (mixed or opened, with today's
 * date) while the rest are spares; the caller shapes each row, so pass
 * `restAsSpares` for that.
 */
export async function addStockItem(
  row: StockInsert,
  opts: {
    count?: number
    restAsSpares?: boolean
    /**
     * What this add REPLACES, archived once it is in. A refill replaces the
     * one container refilled ("A new vial replaces this one"); the add-compound
     * flow replaces every other active row, as every add did before containers
     * could be held side by side. Omitted: nothing is archived, so a second
     * container stays open beside the first (Adrian, 2026-09-24).
     */
    replace?: "others" | { id: string }
  } = {},
): Promise<{
  ok: boolean
  pendingMigration?: boolean
  rejectedShape?: boolean
  /** Refused by the read-only gate, not by a network or a database. */
  refusal?: WriteRefusalKind
}> {
  // ⚠️ THE READ-ONLY GATE, ENFORCED. The client guard is UX; this is the rule.
  // A server action is a public HTTP endpoint. See `lib/billing/gate.ts`.
  const refused = await refuseWrite();
  if (refused) return refused;
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    // A box of up to 50; a count outside that is a typo, not a shelf.
    const count = Math.min(50, Math.max(1, Math.floor(opts.count ?? 1)))
    const spare = (r: StockInsert): StockInsert =>
      r.inventory_type === "reconstituted"
        ? { ...r, acquired_on: null, reconstituted_on: null, bac_water_ml: null }
        : { ...r, acquired_on: null }
    // Every container after the first starts FULL: the "how much is in it"
    // estimate is about the one in hand, not the rest of the box.
    const rows: StockInsert[] = Array.from({ length: count }, (_, i) =>
      i === 0
        ? row
        : { ...(opts.restAsSpares ? spare(row) : row), id: crypto.randomUUID(), prior_used_base: null },
    )
    const payload = rows.map((r) => ({ ...r, user_id: ctx.userId }))
    let { error } = await ctx.supabase.from("inventory_items").insert(payload)
    // Pre-016 the strength column still has its old name. Retry on the old shape
    // rather than telling the user their stock didn't save.
    if (error && isUndefinedColumn(error)) {
      ;({ error } = await ctx.supabase
        .from("inventory_items")
        .insert(rows.map((r) => ({ ...toLegacyColumns(r), user_id: ctx.userId }))))
    }
    if (error) {
      // A form the database cannot hold YET, rather than a failure of this
      // write. Reported distinctly so the sheet can name the real reason —
      // there is nothing to retry, and silently degrading a tub to a tablet
      // count would corrupt its maths. See `isPendingEnumValue`.
      if (isPendingEnumValue(error, row) || isPendingSpare(error, rows)) {
        console.error("addStockItem: form not available until its migration", error)
        return { ok: false, pendingMigration: true }
      }
      console.error("addStockItem failed", error)
      // A CHECK or a unit-family trigger said no. Distinguished from a transient
      // failure because retrying identical input cannot help, and telling the
      // user to "try again" sends them round a loop that never ends.
      return { ok: false, rejectedShape: error.code === "23514" }
    }
    if (opts.replace) {
      // Best-effort, as it always was: the new stock is already in, so a
      // failure here leaves one container too many rather than none.
      let q = ctx.supabase
        .from("inventory_items")
        .update({ is_active: false })
        .eq("user_id", ctx.userId)
        .eq("protocol_compound_id", row.protocol_compound_id)
        .eq("is_active", true)
      q =
        opts.replace === "others"
          ? q.not("id", "in", `(${rows.map((r) => r.id).join(",")})`)
          : q.eq("id", opts.replace.id)
      const { error: archiveError } = await q
      if (archiveError) console.error("addStockItem replace failed", archiveError)
    }
    return { ok: true }
  } catch (e) {
    console.error("addStockItem failed", e)
    return { ok: false }
  }
}

/**
 * A spare vial or a dropper refused by a database without `026`. An unmixed
 * vial breaks the old `reconstituted` arm (no water) and a dropper is an enum
 * value it has never heard of (`22P02`, caught above). Same answer as a tub
 * before `014`: nothing to retry, so say why.
 */
function isPendingSpare(error: { code?: string } | null, rows: StockInsert[]): boolean {
  if (error?.code !== "23514") return false
  return rows.some(
    (r) => r.inventory_type === "dropper" ||
      (r.inventory_type === "reconstituted" && r.bac_water_ml == null),
  )
}

/**
 * MIX a spare vial: its water, and today as both its mix date and its start
 * (Mix 2, Adrian, 2026-09-24: tap the vial, then Mix). `dateKey` is the
 * DEVICE's local date — the database's `current_date` is UTC.
 *
 * Only a container not yet started is touched (`acquired_on IS NULL`), so a
 * second tap, or a stale screen, cannot restart a vial already in use.
 */
export async function mixStockItem(
  id: string,
  bacWaterMl: number,
  dateKey: string,
): Promise<{ ok: boolean; refusal?: WriteRefusalKind }> {
  const refused = await refuseWrite();
  if (refused) return refused;
  if (!(bacWaterMl > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return { ok: false }
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const { data, error } = await ctx.supabase
      .from("inventory_items")
      .update({ bac_water_ml: bacWaterMl, reconstituted_on: dateKey, acquired_on: dateKey })
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .eq("inventory_type", "reconstituted")
      .is("acquired_on", null)
      .select("id")
    if (error) {
      console.error("mixStockItem failed", error)
      return { ok: false }
    }
    // Zero rows is not an error to PostgREST: already started, or not theirs.
    return { ok: (data ?? []).length === 1 }
  } catch (e) {
    console.error("mixStockItem failed", e)
    return { ok: false }
  }
}

/**
 * OPEN a spare that needs no mixing: today becomes its start ("Unopened", tap,
 * then Open). The same call starts a spare picked in the log panel, because
 * picking it is the moment it goes into use. Idempotent in the same way as
 * {@link mixStockItem}.
 */
export async function openStockItem(
  id: string,
  dateKey: string,
): Promise<{ ok: boolean; refusal?: WriteRefusalKind }> {
  const refused = await refuseWrite();
  if (refused) return refused;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return { ok: false }
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const { data, error } = await ctx.supabase
      .from("inventory_items")
      .update({ acquired_on: dateKey })
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .neq("inventory_type", "reconstituted")
      .is("acquired_on", null)
      .select("id")
    if (error) {
      console.error("openStockItem failed", error)
      return { ok: false }
    }
    return { ok: (data ?? []).length === 1 }
  } catch (e) {
    console.error("openStockItem failed", e)
    return { ok: false }
  }
}

/**
 * Correct an existing inventory item's amounts in place (the "edit stock" path —
 * for fixing a mis-typed quantity, not refilling). Distinct from refill (which
 * adds a NEW row): a typo fix should change the SAME row, so the doses already
 * logged against this vial keep their link and `v_inventory_math` just recomputes
 * the remaining from the corrected total. ALL type-discriminator columns are set
 * (nulling the ones the chosen type doesn't use) so even a type change can't leave
 * stale columns that violate the per-type CHECK constraints. RLS-scoped to the
 * owner; `protocol_compound_id` is intentionally NOT editable (that would orphan
 * the linked doses).
 */
export async function updateStockItem(
  id: string,
  row: Omit<StockInsert, "id" | "protocol_compound_id">
): Promise<{
  ok: boolean
  rejectedShape?: boolean
  /** Refused by the read-only gate, not by a network or a database. */
  refusal?: WriteRefusalKind
}> {
  // ⚠️ THE READ-ONLY GATE, ENFORCED. The client guard is UX; this is the rule.
  // A server action is a public HTTP endpoint. See `lib/billing/gate.ts`.
  const refused = await refuseWrite();
  if (refused) return refused;
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const payload = {
        inventory_type: row.inventory_type,
        base_unit: row.base_unit,
        total_amount: row.total_amount,
        total_amount_unit: row.total_amount_unit,
        bac_water_ml: row.bac_water_ml ?? null,
        concentration_mg_per_ml: row.concentration_mg_per_ml ?? null,
        strength_per_unit: row.strength_per_unit ?? null,
        serving_size_g: row.serving_size_g ?? null,
        reconstituted_on: row.reconstituted_on ?? null,
        prior_used_base: row.prior_used_base ?? null,
    }
    let { error } = await ctx.supabase
      .from("inventory_items")
      .update(payload)
      .eq("id", id)
      .eq("user_id", ctx.userId)
    if (error && isUndefinedColumn(error)) {
      ;({ error } = await ctx.supabase
        .from("inventory_items")
        .update(toLegacyColumns(payload))
        .eq("id", id)
        .eq("user_id", ctx.userId))
    }
    if (error) {
      console.error("updateStockItem failed", error)
      // Same distinction as `addStockItem`: a constraint rejection cannot be
      // retried into success, so the caller must not offer that as the remedy.
      return { ok: false, rejectedShape: error.code === "23514" }
    }
    return { ok: true }
  } catch (e) {
    console.error("updateStockItem failed", e)
    return { ok: false }
  }
}

/** Archive (empty/discarded) or restore an inventory item — never hard-delete. */
export async function setStockArchived(
  id: string,
  archived: boolean
): Promise<{ ok: boolean }> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const { error } = await ctx.supabase
      .from("inventory_items")
      .update({ is_active: !archived })
      .eq("id", id)
      .eq("user_id", ctx.userId)
    if (error) console.error("setStockArchived: cloud write failed", error)
    return { ok: !error }
  } catch (e) {
    console.error("setStockArchived failed", e)
    return { ok: false }
  }
}

/**
 * Delete a stock item outright (the user just wants the leftover stock gone; they
 * can re-add it anytime). Safe re: history: `dose_logs.inventory_item_id` is
 * `ON DELETE SET NULL`, so logged doses survive — only the vial record + its runway
 * disappear. (Distinct from the compound, which is never hard-deleted here.)
 */
export async function deleteStockItem(id: string): Promise<{ ok: boolean }> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const { error } = await ctx.supabase
      .from("inventory_items")
      .delete()
      .eq("id", id)
      .eq("user_id", ctx.userId)
    if (error) console.error("deleteStockItem: cloud write failed", error)
    return { ok: !error }
  } catch (e) {
    console.error("deleteStockItem failed", e)
    return { ok: false }
  }
}
