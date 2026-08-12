import "server-only"

import { percent, tally, type Tally } from "@/lib/admin/aggregate"
import {
  INVENTORY_TYPE_LABELS,
  ROUTE_LABELS,
  SCHEDULE_LABELS,
  labelFor,
} from "@/lib/admin/labels"
import { CATEGORY_META } from "@/lib/compound-categories"
import { columnValues, distinctUsers, type AdminClient, type IssueLog } from "./core"

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
 * Which features have users, as a share of all accounts.
 *
 * The point of this list is to find the DEAD ones. A feature sitting at 2%
 * adoption after a month is either undiscoverable or unwanted, and both of those
 * are worth knowing before building the next thing beside it.
 *
 * Note the user column per feature — `weight_logs` keys on `profile_id`, not
 * `user_id`. See `activity.ts` for what assuming otherwise already cost.
 */
const FEATURES = [
  { label: "Protocol", table: "protocol_compounds", column: "user_id" },
  { label: "Dose logging", table: "dose_logs", column: "user_id" },
  { label: "Inventory", table: "inventory_items", column: "user_id" },
  { label: "Weight", table: "weight_logs", column: "profile_id" },
  { label: "Journal", table: "journal_entries", column: "user_id" },
  { label: "Progress photos", table: "progress_photos", column: "user_id" },
  { label: "Stacks", table: "stacks", column: "user_id" },
  { label: "Blocks", table: "blocks", column: "user_id" },
  { label: "Bloodwork", table: "lab_panels", column: "user_id" },
  { label: "Side-effect markers", table: "user_markers", column: "user_id" },
  { label: "Push notifications", table: "push_subscriptions", column: "user_id" },
] as const

export interface FeatureAdoption {
  label: string
  users: number
  pct: number | null
}

export async function featureAdoption(
  supabase: AdminClient,
  totalAccounts: number,
  issues: IssueLog
): Promise<FeatureAdoption[]> {
  const counts = await Promise.all(
    FEATURES.map(({ label, table, column }) =>
      distinctUsers(supabase, table, column, issues, `${label} adoption`)
    )
  )
  return FEATURES.map((f, i) => ({
    label: f.label,
    users: counts[i],
    pct: percent(counts[i], totalAccounts),
  })).sort((a, b) => b.users - a.users)
}
