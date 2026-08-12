import "server-only"

import { percent, tally, type Tally } from "@/lib/admin/aggregate"
import {
  INVENTORY_TYPE_LABELS,
  ROUTE_LABELS,
  SCHEDULE_LABELS,
  labelFor,
} from "@/lib/admin/labels"
import { CATEGORY_META } from "@/lib/compound-categories"
import { columnValues, userIdSet, type AdminClient, type IssueLog } from "./core"

/**
 * What people actually run, and which features they actually touch.
 *
 * FREE TEXT IS NEVER READ HERE. A custom compound carries a user-authored
 * `custom_name` on `protocol_compounds`; this module selects `custom_category`
 * and deliberately not `custom_name`, so a custom entry is counted but never
 * named. Custom categories are additionally matched against the known category
 * list and anything unrecognised is folded into "Other", so an arbitrary string
 * written by a client cannot end up rendered as a row on the dashboard.
 */

export interface CompoundMetrics {
  /** Catalogue compounds by how many protocol entries name them. */
  topCompounds: Tally[]
  /** Category split across every protocol entry. */
  categories: Tally[]
  /** Administration route split. */
  routes: Tally[]
  /** Dosing schedule shape split. */
  schedules: Tally[]
  /** Protocol entries that are a user's own compound rather than a catalogue one. */
  customEntries: number
  /** Protocol entries currently switched on. */
  activeEntries: number
  /** Protocol entries ever created. */
  totalEntries: number
}

export async function compoundMetrics(
  supabase: AdminClient,
  issues: IssueLog
): Promise<CompoundMetrics> {
  const [entries, catalogue] = await Promise.all([
    columnValues<{
      compound_id: string | null
      custom_category: string | null
      route: string | null
      schedule_type: string | null
      is_active: boolean | null
    }>(
      supabase,
      "protocol_compounds",
      "compound_id, custom_category, route, schedule_type, is_active",
      issues,
      "Protocol compounds"
    ),
    // The shared, read-only catalogue. Not user data.
    columnValues<{ id: string; name: string | null; category: string | null }>(
      supabase,
      "compounds",
      "id, name, category",
      issues,
      "Compound catalogue"
    ),
  ])

  const nameById = new Map(catalogue.map((c) => [c.id, c.name ?? "(unnamed)"]))
  const categoryById = new Map(catalogue.map((c) => [c.id, c.category ?? "other"]))
  const knownCategory = (raw: string | null): string =>
    raw && raw in CATEGORY_META ? raw : "other"

  const categoryKeys = entries.map((e) =>
    e.compound_id
      ? knownCategory(categoryById.get(e.compound_id) ?? null)
      : knownCategory(e.custom_category)
  )

  return {
    topCompounds: tally(
      entries.map((e) => (e.compound_id ? nameById.get(e.compound_id) ?? null : null))
    ),
    categories: tally(categoryKeys, (k) =>
      k in CATEGORY_META ? CATEGORY_META[k as keyof typeof CATEGORY_META].label : "Other"
    ),
    routes: tally(
      entries.map((e) => e.route),
      (k) => labelFor(ROUTE_LABELS, k)
    ),
    schedules: tally(
      entries.map((e) => e.schedule_type),
      (k) => labelFor(SCHEDULE_LABELS, k)
    ),
    customEntries: entries.filter((e) => !e.compound_id).length,
    activeEntries: entries.filter((e) => e.is_active === true).length,
    totalEntries: entries.length,
  }
}

export interface InventoryMetrics {
  /** Inventory items ever added. */
  total: number
  /** Items still in play. */
  active: number
  /** Accounts tracking any stock at all. */
  accounts: number
  /** How stock is held — the reconstitution branch is the one that cost the most. */
  byType: Tally[]
}

export async function inventoryMetrics(
  supabase: AdminClient,
  issues: IssueLog
): Promise<InventoryMetrics> {
  const rows = await columnValues<{
    user_id: string | null
    inventory_type: string | null
    is_active: boolean | null
  }>(
    supabase,
    "inventory_items",
    "user_id, inventory_type, is_active",
    issues,
    "Inventory"
  )
  return {
    total: rows.length,
    active: rows.filter((r) => r.is_active === true).length,
    accounts: new Set(rows.map((r) => r.user_id).filter((id): id is string => Boolean(id))).size,
    byType: tally(
      rows.map((r) => r.inventory_type),
      (k) => labelFor(INVENTORY_TYPE_LABELS, k)
    ),
  }
}

/**
 * Every surface a user can leave a trace on, and the column holding the user id.
 *
 * This list is the single source for THREE numbers that must agree with each
 * other: feature adoption, the funnel's protocol and dose steps, and "never
 * written". They used to come from two different lists — adoption from these 11
 * tables, "never written" from activity's 5 — so an account whose only activity
 * was bloodwork, inventory, stacks, blocks or markers appeared in the adoption
 * chart AND in "accounts that have logged nothing, ever", on the same page.
 *
 * Note the user column per feature — `weight_logs` keys on `profile_id`, not
 * `user_id`. See `activity.ts` for what assuming otherwise already cost.
 */
const FEATURES = [
  { label: "Protocol", table: "protocol_compounds", column: "user_id", isWrite: true },
  { label: "Dose logging", table: "dose_logs", column: "user_id", isWrite: true },
  { label: "Inventory", table: "inventory_items", column: "user_id", isWrite: true },
  { label: "Weight", table: "weight_logs", column: "profile_id", isWrite: true },
  { label: "Journal", table: "journal_entries", column: "user_id", isWrite: true },
  { label: "Progress photos", table: "progress_photos", column: "user_id", isWrite: true },
  { label: "Stacks", table: "stacks", column: "user_id", isWrite: true },
  { label: "Blocks", table: "blocks", column: "user_id", isWrite: true },
  { label: "Bloodwork", table: "lab_panels", column: "user_id", isWrite: true },
  { label: "Side-effect markers", table: "user_markers", column: "user_id", isWrite: true },
  /**
   * `isWrite: false` — this is ADOPTION but not a WRITE.
   *
   * A push subscription row appears when the browser grants notification
   * permission. The user recorded nothing; they answered a permission prompt.
   * Counting it as "has written something" would let an account that only
   * tapped Allow fall out of "never written", whose tile says "logged nothing,
   * ever". It still belongs in the adoption chart, which asks a different
   * question.
   */
  { label: "Push notifications", table: "push_subscriptions", column: "user_id", isWrite: false },
] as const

export interface FeatureAdoption {
  label: string
  users: number
  pct: number | null
}

/** The distinct user ids behind each feature. Read ONCE, reused three ways. */
export type FeatureSets = Map<string, Set<string>>

/**
 * Who has touched each feature.
 *
 * Returns the id SETS rather than counts because the callers need set maths:
 * adoption wants sizes, the funnel wants intersections, and "never written"
 * wants the union subtracted from all accounts. Reading each table once and
 * sharing the result is also what stopped `dose_logs` and `protocol_compounds`
 * being read all-time twice per page render.
 *
 * The sets stay INSIDE `lib/db/admin/`. Nothing here is returned to the page —
 * see the invariant in `core.ts`.
 */
export async function featureUserSets(
  supabase: AdminClient,
  issues: IssueLog
): Promise<FeatureSets> {
  const sets = await Promise.all(
    FEATURES.map(({ label, table, column }) =>
      userIdSet(supabase, table, column, issues, `${label} adoption`)
    )
  )
  return new Map(FEATURES.map((f, i) => [f.label, sets[i]]))
}

/** Feature adoption as a share of all accounts, ranked. */
export function featureAdoption(
  sets: FeatureSets,
  totalAccounts: number
): FeatureAdoption[] {
  return FEATURES.map((f) => {
    const users = sets.get(f.label)?.size ?? 0
    return { label: f.label, users, pct: percent(users, totalAccounts) }
  }).sort((a, b) => b.users - a.users)
}

/**
 * Every account that has WRITTEN something, on any surface.
 *
 * Skips the surfaces flagged `isWrite: false` — granting notification
 * permission is adoption, not a record the user made. This is the set
 * "never written" subtracts, so the two numbers stay honest against the
 * wording of the tile that shows them.
 */
export function everWrittenAnything(sets: FeatureSets): Set<string> {
  const all = new Set<string>()
  for (const feature of FEATURES) {
    if (!feature.isWrite) continue
    for (const id of sets.get(feature.label) ?? []) all.add(id)
  }
  return all
}
