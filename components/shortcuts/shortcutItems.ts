import {
  Pill,
  ListChecks,
  Scale,
  NotebookPen,
  ClipboardList,
  CalendarDays,
  MessageSquarePlus,
  type LucideIcon,
} from "lucide-react"

/**
 * Single source of truth for the quick-actions menu the bottom-right FAB opens
 * (Context/Feature Specs/20 → D2, D6).
 *
 * A three-column grid of six equal tiles, with **`FEEDBACK_ACTION` rendered
 * separately** as a full-width white row beneath it (Adrian's call, on seeing it
 * built): as a seventh tile it left a ragged one-item last row, and the white row
 * both fills that space and sets the beta tool apart from the core actions. The
 * earlier primary "Log a dose" row *was* folded in — inside a pop-up this small,
 * that hierarchy read as clutter rather than emphasis.
 *
 * Each item declares what it does via `action`:
 *  - `route`       → navigate to a route
 *  - `quick-track` → the "What would you like to track?" quick-log popup (tick
 *                    today's due compounds → confirm), instead of routing away
 *  - `add-stack`   → the existing, unchanged Add-to-Stack flow
 *  - `weight`      → the quick log-today's-weight popup (the full Weight view,
 *                    with the graph + history, is reached by tapping the home
 *                    Weight card)
 *  - `journal`     → go to Progress and open the journal compose (Write / Markers)
 *  - `bloodwork`   → go to Progress and open the bloodwork gallery (view + add)
 *  - `feedback`    → the beta "Beta notes & feedback" sheet — sends a note to the
 *                    founders
 *
 * **No calculator action** (Spec 20 → D6): the reconstitution calculator now
 * holds the centre bottom-nav slot and `/calculator` is its entry point, so a
 * tile here would only duplicate it and spend a grid cell doing so.
 *
 * No UI lives in this file.
 */
export type ShortcutAction =
  | "route"
  | "quick-track"
  | "add-stack"
  | "weight"
  | "journal"
  | "bloodwork"
  | "feedback"

export interface ShortcutItem {
  id: string
  title: string
  subtitle: string
  icon: LucideIcon
  action: ShortcutAction
  /** Destination for `route` items. */
  href?: string
  /** Short label for the compact grid tile. */
  shortLabel?: string
}

/** The quick-actions grid, in display order — 3 columns × 2 rows, exactly full. */
export const QUICK_ACTIONS: ShortcutItem[] = [
  {
    id: "log-dose",
    title: "Log a dose",
    subtitle: "Tick off today's doses",
    icon: ListChecks,
    action: "quick-track",
    shortLabel: "Log a dose",
  },
  {
    id: "add-compound",
    title: "Add a compound",
    subtitle: "Add a new compound to your cycle",
    icon: Pill,
    action: "add-stack",
    shortLabel: "Add compound",
  },
  {
    id: "journal",
    title: "Journal",
    subtitle: "Free-write and track how you feel",
    icon: NotebookPen,
    action: "journal",
    shortLabel: "Journal",
  },
  {
    id: "weight",
    title: "Weight",
    subtitle: "Log today's bodyweight",
    icon: Scale,
    action: "weight",
    shortLabel: "Weight",
  },
  {
    id: "blood-work",
    title: "Blood work",
    subtitle: "View and add your bloods",
    icon: ClipboardList,
    action: "bloodwork",
    shortLabel: "Blood work",
  },
  {
    id: "calendar",
    title: "Calendar",
    subtitle: "View your logged history",
    icon: CalendarDays,
    action: "route",
    href: "/calendar",
    shortLabel: "Calendar",
  },
]

/**
 * The beta "Beta notes & feedback" entry — NOT one of the six tiles. It renders
 * as a full-width **white** row below the grid, so it reads as a temporary beta
 * tool rather than a core action.
 */
export const FEEDBACK_ACTION: ShortcutItem = {
  id: "feedback",
  title: "Beta notes & feedback",
  subtitle: "Found a bug or have an idea? Tell us",
  icon: MessageSquarePlus,
  action: "feedback",
}
