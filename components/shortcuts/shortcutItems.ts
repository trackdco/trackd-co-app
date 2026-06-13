import {
  Pill,
  ListChecks,
  Scale,
  Calculator,
  NotebookPen,
  ClipboardList,
  CalendarDays,
  type LucideIcon,
} from "lucide-react"

/**
 * Single source of truth for the plus-button "Shortcuts" menu
 * (Context/Feature Specs/08 → A10).
 *
 * The menu is a primary "Log a dose" action over one consistent grid of six
 * tiles. Each item declares what it does via `action`:
 *  - `route`       → navigate (Log a dose → the home log)
 *  - `add-stack`   → the existing, unchanged Add-to-Stack flow
 *  - `calculator`  → the reconstitution calculator sheet (A8)
 *  - `weight`      → the quick log-today's-weight popup (the full Weight view,
 *                    with the graph + history, is reached by tapping the home
 *                    Weight card)
 *  - `journal`     → go to Progress and open the journal compose (Write / Markers)
 *  - `bloodwork`   → go to Progress and open the bloodwork gallery (view + add)
 *  - `placeholder` → the shared not-yet-built sheet (only Calendar now)
 *
 * No UI lives in this file. Only the reconstitution calculator carries a
 * `warning` (its placeholder is gone now that the real tool exists, but the line
 * is kept here in case it's reused).
 */
export type ShortcutAction =
  | "route"
  | "add-stack"
  | "calculator"
  | "weight"
  | "journal"
  | "bloodwork"
  | "placeholder"

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
  /** Optional disclaimer (reconstitution calculator). */
  warning?: string
}

const RECONSTITUTION_WARNING =
  "For personal tracking only — not medical or dosing advice. Always confirm " +
  "any figure with a qualified medical professional before acting on it."

/** The prominent primary action at the top of the menu. */
export const PRIMARY_ITEM: ShortcutItem = {
  id: "log-dose",
  title: "Log a dose",
  subtitle: "Log, edit or delete today's doses",
  icon: ListChecks,
  action: "route",
  href: "/dashboard",
}

/** The consistent six-tile grid, in display order (A10). */
export const GRID_ITEMS: ShortcutItem[] = [
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
    id: "calculator",
    title: "Reconstitution calculator",
    subtitle: "Work out your reconstitution",
    icon: Calculator,
    action: "calculator",
    shortLabel: "Calculator",
    warning: RECONSTITUTION_WARNING,
  },
  {
    id: "calendar",
    title: "Calendar",
    subtitle: "View your logged history",
    icon: CalendarDays,
    action: "placeholder",
    shortLabel: "Calendar",
  },
]

/** Every item, for callers that need a flat lookup. */
export const SHORTCUT_ITEMS: ShortcutItem[] = [PRIMARY_ITEM, ...GRID_ITEMS]
