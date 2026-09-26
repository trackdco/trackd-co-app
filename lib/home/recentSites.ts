/**
 * Home's Injection-sites "Last logged" list, derived on read from the dose log
 * (architecture Invariant 1: nothing about recency is stored). Pure; no React.
 * It reports where doses went, and never suggests where the next one should go.
 */
import { parseSlotKey, type DayLogs } from "@/lib/home/doseLog"
import type { DateKey } from "@/lib/home/mockHomeData"
import { siteLabel as bundledSiteLabel } from "@/lib/home/siteCatalog"
import { calendarDayNumber } from "@/lib/home/siteRecency"
import type { InjectionSiteRoute } from "@/lib/db/types"

/** One muscle in the list: its most recent day, and what went in there. */
export interface RecentInjectionSite {
  siteId: string
  /** The catalogue's label ("Side Abdomen – Left"); the card rewords it. */
  siteLabel: string
  route: InjectionSiteRoute
  /** The compound(s) logged at this site on its most recent day. */
  compounds: string[]
  daysAgo: number
}

/** What the list needs from a compound: its name and how it is taken. */
export interface RecentSiteCompound {
  id: string
  name: string
  method: string
}

/**
 * A site's label: the catalogue's (the database's row) first, then the bundled
 * one, so a site since narrowed out of the catalogue (the pecs on a female body)
 * still names itself in history. An id neither knows gives null: it has no name
 * to show, so the list leaves it out rather than printing a raw id.
 */
export function siteLabelFrom(
  catalogue: ReadonlyArray<{ id: string; label: string }>,
  siteId: string,
): string | null {
  const row = catalogue.find((s) => s.id === siteId)
  if (row) return row.label
  const bundled = bundledSiteLabel(siteId)
  return bundled === siteId ? null : bundled
}

/**
 * Recent injectable doses grouped by SITE (muscle), newest first. Each muscle
 * shows the compound(s) logged there on its most recent day ("Delt, Left: Test E,
 * Deca, today"), so two compounds put in one area read together instead of as
 * separate rows.
 *
 * - Injectable (IM / Sub-Q) compounds only; the route is the compound's.
 * - A dose with NO site is left out (cold review F14). The list names muscles,
 *   and "No site" is not one; it used to head the list whenever the newest dose
 *   had no site.
 * - Every dose of a day counts, the later ones (`<id>#<n>`) too. They used to be
 *   dropped, while the body map above already lit their sites.
 * - A compound no longer in `compounds` (archived or deleted) is skipped: it has
 *   no name to show.
 * - Days are calendar days, so a clock change never merges two.
 */
export function recentInjectionSites(
  logs: DayLogs,
  todayKey: DateKey,
  compounds: ReadonlyArray<RecentSiteCompound>,
  labelFor: (siteId: string) => string | null,
): RecentInjectionSite[] {
  const todayN = calendarDayNumber(todayKey)
  if (todayN === null) return []
  const byId = new Map(compounds.map((c) => [c.id, c]))
  const groups = new Map<string, RecentInjectionSite & { dayKey: string; sortKey: string }>()
  for (const [key, dayLogObj] of Object.entries(logs)) {
    if (key > todayKey) continue
    const n = calendarDayNumber(key)
    if (n === null) continue
    const ago = todayN - n
    if (ago < 0) continue
    for (const [slot, log] of Object.entries(dayLogObj ?? {})) {
      const siteId = log?.siteId
      if (!siteId) continue
      const c = byId.get(parseSlotKey(slot).compoundId)
      const route: InjectionSiteRoute | null =
        c?.method === "im" ? "im" : c?.method === "subq" ? "subq" : null
      if (!c || !route) continue
      const label = labelFor(siteId)
      if (!label) continue
      const sortKey = `${key}T${log.time24 ?? "00:00"}`
      const g = groups.get(siteId)
      if (!g) {
        groups.set(siteId, {
          siteId,
          siteLabel: label,
          route,
          compounds: [c.name],
          daysAgo: ago,
          dayKey: key,
          sortKey,
        })
      } else if (key > g.dayKey) {
        // A newer day for this site: it becomes the shown day; its compounds reset.
        g.dayKey = key
        g.daysAgo = ago
        g.sortKey = sortKey
        g.route = route
        g.compounds = [c.name]
      } else if (key === g.dayKey) {
        // The same (most recent) day: collect the other compound(s) put there.
        if (!g.compounds.includes(c.name)) g.compounds.push(c.name)
        if (sortKey > g.sortKey) g.sortKey = sortKey
      }
      // An older day is ignored: each site shows its most recent day only.
    }
  }
  return [...groups.values()]
    .sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0))
    .map(({ siteId, siteLabel, route, compounds, daysAgo }) => ({
      siteId,
      siteLabel,
      route,
      compounds,
      daysAgo,
    }))
}
