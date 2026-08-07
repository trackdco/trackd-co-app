"use client"

import { useState } from "react"
import {
  Package,
  Pause,
  PencilSimple,
  Prohibit,
  Trash,
} from "@/components/icons"

import { inventoryTypeForCompound } from "@/lib/containers/form"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { useSheetDrag } from "@/components/home/useSheetDrag"
import { Container } from "@/components/containers"
import { CARD_EYEBROW } from "@/lib/ui-presets"
import {
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
} from "@/lib/compound-categories"
import {
  cadenceLabel,
  formatDateKeyShort,
  formatTimeLabel,
  methodLabel,
  upcomingDoseDates,
  type StackCompound,
} from "@/lib/home/stack"
import { activePause } from "@/lib/home/pauses"
import { toDateKey } from "@/lib/home/mockHomeData"

interface CompoundDetailSheetProps {
  open: boolean
  compound: StackCompound | null
  onOpenChange: (open: boolean) => void
  /** Where the sheet is opened from. "plan" (the Protocol builder) has no day-logging,
   *  so the primary action becomes "Edit dose & schedule" and the redundant "today's
   *  dose" path is dropped. Defaults to the dashboard behaviour. */
  context?: "dashboard" | "plan"
  /** Whether the day being viewed is today — drives the primary action's label.
   *  Dashboard only. */
  isToday?: boolean
  /** The day being viewed. Every other read on this sheet is selected-day
   *  scoped; the pause label was the one asking about today. */
  dateKey?: string
  /** Edit the dose for the viewed day — the white action; opens the Log sheet.
   *  Dashboard only (omitted in the plan context). */
  onEditTodaysDose?: (compound: StackCompound) => void
  /** Edit the compound GOING FORWARD — opens the add sheet pre-filled (under More). */
  onEdit: (compound: StackCompound) => void
  /** Pause it for a stretch (Spec w2b-13, Step 6). Optional so the plan context
   *  and the preview harnesses can omit it. */
  onPause?: (compound: StackCompound) => void
  /** Skip today's dose — record that it was deliberately not taken. */
  onSkip?: (compound: StackCompound) => void
  /** Add or refill this compound's stock. */
  onAddStock?: (compound: StackCompound) => void
  /** Correct what is left in the container (the "I miscounted" path). */
  onCorrectStock?: (compound: StackCompound) => void
  /**
   * The container's REAL fill and remaining, from `v_inventory_math`
   * (Spec w2b-13, Step 7). Omitted where the caller has no stock figure, and
   * then the artwork falls back to the illustrative level rather than implying
   * a number nobody has.
   */
  stock?: {
    fill: number | null
    remaining: number | null
    unit: string | null
    /** Does a container EXIST for this compound? Distinct from `remaining`,
     *  which is a display figure and legitimately null on an item that exists —
     *  branching on it sent a compound with a vial to the ADD form. */
    exists?: boolean
  }
  /**
   * What is already recorded for the day being viewed, if anything.
   *
   * The primary button words itself from this (Adrian, 2026-08-07): "Log" while
   * there is nothing on the day, "Edit" once there is. It used to say "Log or
   * edit", which covered both because it did not know which — a label doing the
   * work the caller should have done.
   */
  todaysLog?: { status?: "taken" | "skipped" } | null
  /** Delete — stop future doses, keep every logged dose (Spec 02: the one verb). */
  onArchive: (id: string) => void
}

function formatDose(dose: number): string {
  return Number.isInteger(dose) ? String(dose) : String(dose)
}

/**
 * The sheet that opens when a compound row on the Home card is tapped (the row
 * plays the spread-from-touch glow as it opens). Read-only detail — dose and
 * schedule — with Edit (reopens the add sheet pre-filled) and Remove from log.
 */
export function CompoundDetailSheet({
  open,
  compound,
  onOpenChange,
  context = "dashboard",
  isToday = false,
  dateKey,
  onEditTodaysDose,
  onEdit,
  onPause,
  onSkip,
  onAddStock,
  onCorrectStock,
  stock,
  todaysLog,
  onArchive,
}: CompoundDetailSheetProps) {
  // Retain through the close animation so the body doesn't blank.
  const [shown, setShown] = useState<StackCompound | null>(compound)
  if (compound !== null && compound !== shown) setShown(compound)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 border-t-0 bg-transparent p-0 shadow-none"
      >
        {shown ? (
          <DetailBody
            key={shown.id}
            compound={shown}
            onClose={() => onOpenChange(false)}
            context={context}
            isToday={isToday}
            dateKey={dateKey}
            onEditTodaysDose={onEditTodaysDose}
            onEdit={onEdit}
            onPause={onPause}
            onSkip={onSkip}
            onAddStock={onAddStock}
            onCorrectStock={onCorrectStock}
            stock={stock}
            todaysLog={todaysLog}
            onArchive={onArchive}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function DetailBody({
  compound,
  onClose,
  context,
  isToday,
  dateKey,
  onEditTodaysDose,
  onEdit,
  onPause,
  onSkip,
  onAddStock,
  onCorrectStock,
  stock,
  todaysLog,
  onArchive,
}: {
  compound: StackCompound
  onClose: () => void
  context: "dashboard" | "plan"
  isToday: boolean
  dateKey?: string
  onEditTodaysDose?: (compound: StackCompound) => void
  onEdit: (compound: StackCompound) => void
  onPause?: (compound: StackCompound) => void
  onSkip?: (compound: StackCompound) => void
  onAddStock?: (compound: StackCompound) => void
  onCorrectStock?: (compound: StackCompound) => void
  stock?: {
    fill: number | null
    remaining: number | null
    unit: string | null
    exists?: boolean
  }
  todaysLog?: { status?: "taken" | "skipped" } | null
  onArchive: (id: string) => void
}) {
  const { cardRef, handleProps, cardStyle } = useSheetDrag(onClose)
  // A pending DELETE confirmation (drops down before it happens).
  const [confirmArchive, setConfirmArchive] = useState(false)
  const meta = CATEGORY_META[compound.category] ?? FALLBACK_CATEGORY_META
  // "Next" means the next doses from NOW. It walked from the schedule's START
  // date, so a compound begun in March listed three days in March under the word
  // "Next" and never changed. `upcomingDoseDates` clamps forward to the start
  // date itself, so a compound that has not begun yet still lists its first
  // doses, which is the one case where the two readings coincide.
  // Paused today? Derived, never stored — the sheet asks the interval list on
  // every render rather than reading a flag someone has to keep in step.
  const paused = activePause(compound.pauses, dateKey ?? toDateKey(new Date())) !== null
  /**
   * The button says what tapping it will DO, not everything it could do.
   *
   * A dose that was SKIPPED is not a dose that was taken, so the action there is
   * still to log one — "Edit" would suggest correcting an amount that was never
   * recorded.
   */
  const taken = todaysLog != null && todaysLog.status !== "skipped"
  const primaryLabel =
    context === "plan"
      ? "Edit dose & schedule"
      : taken
        ? isToday
          ? "Edit today's dose"
          : "Edit this dose"
        : isToday
          ? "Log today's dose"
          : "Log this dose"
  // The pauses go in, or the Next line names three dates that fall inside a
  // pause the user deliberately set (Spec w2b-13, Step 6).
  const upcoming = upcomingDoseDates(
    compound.schedule,
    new Date(),
    3,
    compound.cycle,
    compound.pauses,
  )

  return (
    <div
      ref={cardRef}
      style={cardStyle}
      className="flex flex-col overflow-hidden rounded-t-3xl hairline-t bg-bg-surface shadow-lg"
    >
      {/* Grab handle — drag down to dismiss. */}
      <div
        {...handleProps}
        className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
      >
        <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
      </div>

      <SheetTitle className="sr-only">{compound.name}</SheetTitle>
      <SheetDescription className="sr-only">
        Dose and schedule for {compound.name}.
      </SheetDescription>

      <div className="space-y-5 px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        {/* Header — the compound's CONTAINER rather than the small type icon
            (Adrian's call). At sheet size the drawn vial / bottle / tub is the
            thing that identifies the compound at a glance, and a 14px glyph was
            doing nothing the name did not already do. Specs 10 and 11 call for
            this same header on the add and log forms, so this is the pattern they
            reuse rather than a one-off. */}
        <div className="flex items-center gap-4">
          <Container
            name={compound.name}
            inventoryType={inventoryTypeForCompound(compound.name, compound.method, compound.inventoryForm)}
            category={compound.category}
            // THE REAL FILL (Spec w2b-13, Step 7). This was hardcoded to 0.7 —
            // a decorative number sitting next to real ones, on the one screen
            // where the container is largest. `undefined` when the caller has no
            // stock figure, which falls back to the illustrative level rather
            // than drawing an empty container beside the words "Add stock".
            fill={stock?.fill ?? undefined}
            size={72}
          />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className={CARD_EYEBROW}>
              {meta.label} · {methodLabel(compound.method)}
            </p>
            <p className="text-lg leading-tight font-medium text-foreground">
              {compound.name}
            </p>
            <p className="font-mono text-sm tabular-nums text-text-muted">
              {formatDose(compound.dose)} {compound.unit}
              {stock?.remaining != null && (
                <span className="text-text-subtle">
                  {" · "}
                  {stock.remaining}
                  {stock.unit ? ` ${stock.unit}` : ""} left
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Dose + schedule */}
        <div className="grid grid-cols-2 gap-3">
          {/* The dose leads the header now, so repeating it here would waste the
              slot. Started-on was previously nowhere on the sheet. */}
          <Stat label="Started">
            <span className="font-mono">
              {formatDateKeyShort(compound.schedule.startDate)}
            </span>
          </Stat>
          <Stat label="Schedule">
            {cadenceLabel(compound.schedule.cadence)}
            <span className="text-text-muted">
              {" "}
              · <span className="font-mono">{formatTimeLabel(compound.schedule.timeOfDay)}</span>
            </span>
          </Stat>
        </div>

        {upcoming.length > 0 && (
          <p className="px-1 text-xs text-text-subtle">
            Next:{" "}
            <span className="font-mono text-text-muted">
              {upcoming.map(formatDateKeyShort).join(", ")}
            </span>
          </p>
        )}

        {/* EVERY ACTION AT ONE LEVEL (Spec w2b-13, Step 7). The `More`
            disclosure is gone: it hid Alter dose, Pause and Delete behind a tap
            that told you nothing about what was under it, on a sheet whose whole
            job is to be the place where every edit lives.

            One filled button for the day-to-day action, then quiet rows
            (Adrian's proposal 2 from `/preview/detail`, 2026-08-07). There is
            also no Close button — the sheet drags away like every other one.

            **The rows state no values.** An earlier pass railed the cadence and
            the remaining stock down the right-hand side; he cut them, and the
            readout above already says both. A row here is a DOOR, and a door
            does not need to tell you what is behind it when the wall already
            has. */}
        <button
          type="button"
          onClick={() =>
            context === "plan" ? onEdit(compound) : onEditTodaysDose?.(compound)
          }
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-primary py-3 text-sm font-medium text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99]"
        >
          {/* NO ICON. The filled button is already the loudest thing on the
              sheet and its label says exactly what it does — a glyph beside it
              was decoration, and the pencil in particular now belongs to the
              row that actually edits (Adrian, 2026-08-07). */}
          {primaryLabel}
        </button>

        <div>
          {/* Skip only where there is a DAY in play. In the plan context there
              is no "this dose" to skip. */}
          {/* Hidden once the day is already dealt with — skipped (offering it
              again is a no-op dressed as a choice) or TAKEN (skipping would
              overwrite a dose the user actually recorded). */}
          {context !== "plan" && onSkip && todaysLog == null && (
            <ActionRow
              icon={<Prohibit className="h-4 w-4" aria-hidden />}
              onClick={() => {
                onSkip(compound)
                onClose()
              }}
            >
              Skip this dose
            </ActionRow>
          )}
          {/* ONE button, not two. Alter dose and Schedule opened the same form;
              two rows for one destination was the tell that this list had been
              written from the code rather than from the task (Adrian,
              2026-08-07). Hidden in the plan context, where the filled button
              above already is it. */}
          {context !== "plan" && (
            <ActionRow
              // A PENCIL, not a calendar: this row edits the dose as well as the
              // schedule, and a calendar named only half of it.
              icon={<PencilSimple className="h-4 w-4" aria-hidden />}
              onClick={() => onEdit(compound)}
            >
              Edit dose &amp; schedule
            </ActionRow>
          )}
          {/* Pause — a break, not an ending. The SECOND and last lifecycle verb:
              a paused compound is still live, still in its stack and still
              holding stock, which is exactly what Delete is not. */}
          {onPause && (
            <ActionRow
              icon={<Pause className="h-4 w-4" aria-hidden />}
              onClick={() => onPause(compound)}
            >
              {paused ? "Change or resume the pause" : "Pause"}
            </ActionRow>
          )}
          {/* Also ONE button. Which door it opens depends on whether there is
              anything to correct yet: with stock recorded it goes to the
              amounts, without it goes to adding some. Both are "Stock" to the
              person tapping. */}
          {(onAddStock || onCorrectStock) && (
            <ActionRow
              icon={<Package className="h-4 w-4" aria-hidden />}
              onClick={() => {
                // Existence, not a display figure. `remaining` is nullable on an
                // item that genuinely exists.
                const hasStock = stock?.exists ?? stock?.remaining != null
                if (hasStock && onCorrectStock) onCorrectStock(compound)
                else if (onAddStock) onAddStock(compound)
                else onCorrectStock?.(compound)
              }}
            >
              Stock
            </ActionRow>
          )}
        </div>

        {/* Delete confirm — drops down before it happens. Styled to match the
            Sign out treatment in Profile: a red OUTLINE on the card and a solid
            red confirm. Amber is the app's accent and reads as emphasis, not
            danger; `--accent-destructive` is the token reserved for deliberate
            destructive actions (Spec 02 → Warning styling). This override is for
            destructive confirmation ONLY — red is not a general accent. */}
        {confirmArchive ? (
          <div className="animate-shortcut-in rounded-xl border border-accent-destructive/50 bg-accent-destructive/10 p-3">
            <p className="text-sm text-foreground">
              Delete “{compound.name}”? It stops being dosed from here on, every
              logged dose is kept, and you can add it back from search any time.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmArchive(false)}
                className="flex-1 rounded-lg border border-border-strong py-2 text-sm text-text-muted transition-colors hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onArchive(compound.id)
                  onClose()
                }}
                className="flex-1 rounded-lg bg-accent-destructive py-2 text-sm font-medium text-text-primary transition-opacity hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          // Below a divider, alone. Delete and Pause are the ONLY lifecycle
          // verbs (Spec 02 and Spec w2b-13): Delete stops future doses and keeps
          // every logged dose. There is no permanent erase anywhere in the app,
          // and no separate archived state to leave.
          <div className="hairline-t border-border-default pt-3">
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              className="flex w-full items-center gap-3 py-2 text-left text-sm text-text-muted transition-colors hover:text-accent-destructive"
            >
              <Trash className="h-4 w-4 shrink-0" aria-hidden />
              Delete {compound.name}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * One action: an icon, a label, and nothing else.
 *
 * It deliberately states NO value on the right. An earlier pass railed the
 * cadence and the remaining stock down that edge, and Adrian cut them
 * (2026-08-07) — the readout above the actions already says both, and a row
 * here is a door rather than a fact.
 */
function ActionRow({
  children,
  icon,
  onClick,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hairline-t flex min-h-12 w-full items-center gap-3 border-border-default text-left text-foreground transition-colors hover:text-accent-primary"
    >
      <span className="shrink-0 text-text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{children}</span>
    </button>
  )
}

function Stat({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl bg-bg-surface-raised px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm text-foreground">{children}</p>
    </div>
  )
}

