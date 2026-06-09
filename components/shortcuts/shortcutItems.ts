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
 * Single source of truth for the plus-button "Shortcuts" menu.
 *
 * One entry per action, in the fixed declaration order. The menu renders items in
 * two tiers, set by `variant`: a top row of `circle` quick-actions and a stack of
 * full-width `card`s below. Linking a placeholder to real functionality later is
 * just a matter of flipping its `action` (and giving the menu a handler for its
 * `id`) — no UI lives in this file.
 *
 * Only `add-compound` is wired to real functionality today (the existing
 * Add-to-Stack flow); every other item opens the shared placeholder sheet. Only
 * the reconstitution calculator carries a `warning`, surfaced on its placeholder
 * so the medical-disclaimer line isn't forgotten when the real tool is built.
 */
export type ShortcutAction = "route" | "placeholder"
export type ShortcutVariant = "circle" | "card"

export interface ShortcutItem {
  id: string
  title: string
  subtitle: string
  icon: LucideIcon
  action: ShortcutAction
  /** Top "circle" quick-action, or a full-width "card" in the reorderable stack. */
  variant: ShortcutVariant
  /** Short label for the circle row (the full title is too long under a circle). */
  shortLabel?: string
  /** Card that defaults to the bottom of the stack (a setup action); still reorderable. */
  pinnedBottom?: boolean
  /** Optional disclaimer shown on the placeholder (reconstitution calculator only). */
  warning?: string
}

const RECONSTITUTION_WARNING =
  "For personal tracking only — not medical or dosing advice. Always confirm " +
  "any figure with a qualified medical professional before acting on it."

export const SHORTCUT_ITEMS: ShortcutItem[] = [
  {
    id: "add-compound",
    title: "Add a compound",
    subtitle: "Add a new compound to your cycle",
    icon: Pill,
    action: "route",
    variant: "card",
    pinnedBottom: true,
  },
  {
    // The daily tracking hub — where the user logs the doses/peptides/supplements
    // they're running. Kept id stable; label/icon tuned for "this is where I track".
    id: "todays-dose",
    title: "Log a dose",
    subtitle: "Log, edit or delete today's doses",
    icon: ListChecks,
    action: "placeholder",
    variant: "circle",
    shortLabel: "Log",
  },
  {
    id: "track-weight",
    title: "Weight",
    subtitle: "Record your bodyweight",
    icon: Scale,
    action: "placeholder",
    variant: "card",
  },
  {
    id: "reconstitution-calculator",
    title: "Reconstitution calculator",
    subtitle: "Work out your reconstitution",
    icon: Calculator,
    action: "placeholder",
    variant: "circle",
    shortLabel: "Calculator",
    warning: RECONSTITUTION_WARNING,
  },
  {
    id: "journal",
    title: "Journal",
    subtitle: "Free-write and track how you feel",
    icon: NotebookPen,
    action: "placeholder",
    variant: "circle",
    shortLabel: "Journal",
  },
  {
    id: "blood-work",
    title: "Blood work",
    subtitle: "Enter and review your bloods",
    icon: ClipboardList,
    action: "placeholder",
    variant: "card",
  },
  {
    id: "calendar",
    title: "Calendar",
    subtitle: "View your logged history",
    icon: CalendarDays,
    action: "placeholder",
    variant: "circle",
    shortLabel: "Calendar",
  },
]
