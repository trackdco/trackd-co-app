"use client"

import { useState } from "react"
import {
  CalendarDot,
  CaretDown,
  PencilSimple,
  Trash,
} from "@/components/icons"

import { cn } from "@/lib/utils"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import {
  Sheet,
  SheetClose,
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
  /** Edit the dose for the viewed day — the white action; opens the Log sheet.
   *  Dashboard only (omitted in the plan context). */
  onEditTodaysDose?: (compound: StackCompound) => void
  /** Edit the compound GOING FORWARD — opens the add sheet pre-filled (under More). */
  onEdit: (compound: StackCompound) => void
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
  onEditTodaysDose,
  onEdit,
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
            onEditTodaysDose={onEditTodaysDose}
            onEdit={onEdit}
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
  onEditTodaysDose,
  onEdit,
  onArchive,
}: {
  compound: StackCompound
  onClose: () => void
  context: "dashboard" | "plan"
  isToday: boolean
  onEditTodaysDose?: (compound: StackCompound) => void
  onEdit: (compound: StackCompound) => void
  onArchive: (id: string) => void
}) {
  const { cardRef, handleProps, cardStyle } = useSheetDrag(onClose)
  const [moreOpen, setMoreOpen] = useState(false)
  // A pending DELETE confirmation (drops down before it happens).
  const [confirmArchive, setConfirmArchive] = useState(false)
  const meta = CATEGORY_META[compound.category] ?? FALLBACK_CATEGORY_META
  // "Next" means the next doses from NOW. It walked from the schedule's START
  // date, so a compound begun in March listed three days in March under the word
  // "Next" and never changed. `upcomingDoseDates` clamps forward to the start
  // date itself, so a compound that has not begun yet still lists its first
  // doses, which is the one case where the two readings coincide.
  const upcoming = upcomingDoseDates(compound.schedule, new Date(), 3, compound.cycle)

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
            inventoryType={inventoryTypeForCompound(compound.name, compound.method)}
            category={compound.category}
            fill={0.7}
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

        {/* Primary actions. The white button is the day-to-day action — edit
            TODAY'S logged dose (opens the Log sheet); editing the dose going
            forward lives under More. */}
        <div className="flex gap-3 pt-1">
          <SheetClose className="flex-1 rounded-xl border border-border-strong py-3 text-sm font-medium text-text-muted transition-colors hover:text-text-primary">
            Close
          </SheetClose>
          {context === "plan" ? (
            <button
              type="button"
              onClick={() => onEdit(compound)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-primary py-3 text-sm font-medium text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99]"
            >
              <PencilSimple className="h-4 w-4" aria-hidden />
              Edit dose &amp; schedule
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onEditTodaysDose?.(compound)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-primary py-3 text-sm font-medium text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99]"
            >
              <PencilSimple className="h-4 w-4" aria-hidden />
              {isToday ? "Edit today's dose" : "Edit this dose"}
            </button>
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
          <div>
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border-strong py-3 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
            >
              More
              <CaretDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  moreOpen && "rotate-180"
                )}
                aria-hidden
              />
            </button>
            {moreOpen && (
              <div className="animate-shortcut-in mt-2 overflow-hidden rounded-xl border border-border-default bg-bg-surface-raised">
                {/* In the plan context the primary button already edits dose &
                    schedule, so this row would be redundant — show it only on
                    the dashboard, where the primary is "Edit today's dose". */}
                {context !== "plan" && (
                  <MenuRow
                    icon={<CalendarDot className="h-4 w-4" aria-hidden />}
                    sub="Changes upcoming doses · today's logged dose stays as-is"
                    onClick={() => {
                      setMoreOpen(false)
                      onEdit(compound)
                    }}
                  >
                    Alter dose &amp; schedule
                  </MenuRow>
                )}
                {/* Delete is the ONLY lifecycle verb (Spec 02): it stops future
                    doses and keeps every logged dose. There is no permanent erase
                    anywhere in the app, and no separate archived state to leave. */}
                <MenuRow
                  icon={<Trash className="h-4 w-4" aria-hidden />}
                  sub="Removes it going forward · keeps all your logged history"
                  onClick={() => {
                    setMoreOpen(false)
                    setConfirmArchive(true)
                  }}
                >
                  Delete
                </MenuRow>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MenuRow({
  children,
  sub,
  icon,
  onClick,
}: {
  children: React.ReactNode
  sub?: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left text-foreground transition-colors hover:bg-bg-input/50"
    >
      <span className="shrink-0 text-text-muted">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{children}</span>
        {sub && <span className="block text-xs text-text-subtle">{sub}</span>}
      </span>
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

