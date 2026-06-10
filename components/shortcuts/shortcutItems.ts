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
 *  - `route`       → navigate (Log a dose → the home log; Weight → the Weight view)
 *  - `add-stack`   → the existing, unchanged Add-to-Stack flow
 *  - `calculator`  → the reconstitution calculator sheet (A8)
 *  - `placeholder` → the shared not-yet-built sheet
 *
 * No UI lives in this file. Only the reconstitution calculator carries a
 * `warning` (its placeholder is gone now that the real tool exists, but the line
 * is kept here in case it's reused).
 */
export type ShortcutAction =
  | "route"
  | "add-stack"
  | "calculator"
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
    action: "placeholder",
    shortLabel: "Journal",
  },
  {
    id: "weight",
    title: "Weight",
    subtitle: "Track your bodyweight",
    icon: Scale,
    action: "route",
    href: "/weight",
    shortLabel: "Weight",
  },
  {
    id: "blood-work",
    title: "Blood work",
    subtitle: "Enter and review your bloods",
    icon: ClipboardList,
    action: "placeholder",
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
