/**
 * Human labels for the enum values the founder dashboard ranks.
 *
 * WHY THESE ARE NOT IMPORTED FROM THE ONBOARDING SCREENS
 * `RUNNING_OPTIONS` / `STRUGGLE_OPTIONS` live in
 * `components/onboarding/screens/intent.tsx` and carry a `ReactNode` icon each,
 * so importing them would drag React into a module the aggregate layer uses and
 * break the "lib/ is pure" rule. The labels are restated here instead.
 *
 * THE DRIFT THAT DUPLICATION INVITES IS CAUGHT BY A TEST, NOT BY DISCIPLINE.
 * `lib/admin/labels.test.ts` asserts these maps cover EVERY tag in `RUNNING_TAGS`
 * and `STRUGGLE_TAGS`. Add a tag to the onboarding flow without adding it here
 * and the suite fails — rather than the dashboard quietly ranking a raw
 * `blast_cruise` key next to properly-labelled rows.
 *
 * RETIRED TAGS ARE LABELLED, NOT DROPPED. A tag is removed from the OFFER, never
 * from the PARSER (`lib/onboarding/session.ts`), so accounts created before a
 * retirement still hold it and it still has to render as words.
 */

/** Onboarding "what are you running" tags. */
export const RUNNING_LABELS: Record<string, string> = {
  comp_prep: "Comp prep",
  trt: "TRT / hormone optimisation",
  peptides: "Peptides",
  first_cycle: "First cycle",
  health: "Supplements & general health",
  nothing: "Just tracking for now",
  // Retired from the offer, still present on older accounts.
  off_season: "Off season (retired)",
  blast_cruise: "Blast & cruise (retired)",
}

/** Onboarding "what do you struggle with" tags. */
export const STRUGGLE_LABELS: Record<string, string> = {
  whats_left: "Losing track of what's left",
  recon_maths: "Reconstitution maths by hand",
  last_site: "Can't remember my last site",
  no_history: "No history when I get bloods",
  took_today: "Forgetting if I've taken it today",
  other: "Something else",
  // Retired from the offer, still present on older accounts.
  notes_app: "Living in the notes app (retired)",
  too_much: "Too much to keep track of (retired)",
  cant_compare: "Can't compare cycles (retired)",
}

/** Where a signup says they came from (`signup_attribution.source`). */
export const ATTRIBUTION_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  mate: "A mate",
  community: "A community",
  elsewhere: "Elsewhere",
}

/** Administration route (`protocol_compounds.route`). */
export const ROUTE_LABELS: Record<string, string> = {
  subq: "Sub-Q",
  im: "IM",
  po: "Oral",
  nasal: "Nasal",
  topical: "Topical",
}

/** How the physical stock is held (`inventory_items.inventory_type`). */
export const INVENTORY_TYPE_LABELS: Record<string, string> = {
  reconstituted: "Reconstituted",
  preconcentrated: "Pre-mixed",
  oral_solid: "Tabs / caps",
  bulk_powder: "Bulk powder",
}

/** Dosing schedule shape (`protocol_compounds.schedule_type`). */
export const SCHEDULE_LABELS: Record<string, string> = {
  every_day: "Every day",
  specific_days: "Specific days",
  every_n_days: "Every N days",
}

/** Onboarding goal (`profiles.goal`). */
export const GOAL_LABELS: Record<string, string> = {
  bulk: "Bulk",
  cut: "Cut",
  recomp: "Recomp",
  contest_prep: "Contest prep",
  first_cycle: "First cycle",
  blast_cruise: "Blast & cruise",
  trt: "TRT",
  other: "Other",
}

/** Legal documents a user consents to (`consent_records.document`). */
export const CONSENT_DOC_LABELS: Record<string, string> = {
  tos: "Terms of service",
  privacy: "Privacy policy",
  disclaimer: "Disclaimer",
  health_data_consent: "Health data consent",
}

/** Look a label up, falling back to the raw key so nothing renders blank. */
export function labelFor(map: Record<string, string>, key: string): string {
  return map[key] ?? key
}
