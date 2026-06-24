"use client"

import { useState } from "react"
import {
  Archive,
  CalendarClock,
  ChevronDown,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { useSheetDrag } from "@/components/home/useSheetDrag"
import {
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
} from "@/lib/compound-categories"
import { dateKeyToDate } from "@/lib/home/mockHomeData"
import {
  cadenceLabel,
  formatDateKeyShort,
  formatTimeLabel,
  isInjectable,
  methodLabel,
  nextSiteId,
  upcomingDoseDates,
  type StackCompound,
} from "@/lib/home/stack"
import { siteLabel } from "@/lib/home/siteCatalog"

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
  /** Archive — stop dosing, keep history (reversible). */
  onArchive: (id: string) => void
  /** Reactivate an archived compound. */
  onReactivate: (id: string) => void
  /** Permanently delete the compound + all its logged history. */
  onDelete: (id: string) => void
}

function formatDose(dose: number): string {
  return Number.isInteger(dose) ? String(dose) : String(dose)
}

/**
 * The sheet that opens when a compound row on the Home card is tapped (the row
 * plays the spread-from-touch glow as it opens). Read-only detail — dose,
 * schedule and the injection-site rotation — with Edit (reopens the add sheet
 * pre-filled) and Remove from log.
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
  onReactivate,
  onDelete,
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
            onReactivate={onReactivate}
            onDelete={onDelete}
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
  onReactivate,
  onDelete,
}: {
  compound: StackCompound
  onClose: () => void
  context: "dashboard" | "plan"
  isToday: boolean
  onEditTodaysDose?: (compound: StackCompound) => void
  onEdit: (compound: StackCompound) => void
  onArchive: (id: string) => void
  onReactivate: (id: string) => void
  onDelete: (id: string) => void
}) {
  const { cardRef, handleProps, cardStyle } = useSheetDrag(onClose)
  const [moreOpen, setMoreOpen] = useState(false)
  // A pending archive/reactivate confirmation (drops down before it happens).
  const [confirmArchive, setConfirmArchive] = useState<
    "archive" | "reactivate" | null
  >(null)
  // 0 = not started, 1 = first confirm, 2 = final confirm (the destructive path).
  const [deleteStep, setDeleteStep] = useState(0)
  const meta = CATEGORY_META[compound.category] ?? FALLBACK_CATEGORY_META
  const injectable = isInjectable(compound.method)
  const nextSite = nextSiteId(compound)
  const upcoming = upcomingDoseDates(
    compound.schedule,
    dateKeyToDate(compound.schedule.startDate),
    3
  )

  return (
    <div
      ref={cardRef}
      style={cardStyle}
      className="flex flex-col overflow-hidden rounded-t-3xl border-t border-border-default bg-bg-surface shadow-lg"
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
        Dose, schedule and injection-site rotation for {compound.name}.
      </SheetDescription>

      <div className="space-y-5 px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-full", meta.dot)} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-medium text-foreground">
              {compound.name}
            </p>
            <p className="truncate text-sm text-text-muted">
              {meta.label} · {methodLabel(compound.method)}
            </p>
          </div>
        </div>

        {/* Dose + schedule */}
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Dose">
            <span className="font-mono">
              {formatDose(compound.dose)} {compound.unit}
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

        {/* Rotation — read-only; the next site is marked. Editing happens in Edit. */}
        {injectable && compound.rotationSites.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
              Rotation (next is highlighted)
            </p>
            <ol className="flex flex-wrap gap-2">
              {compound.rotationSites.map((id) => {
                const isNext = id === nextSite
                return (
                  <li
                    key={id}
                    className={cn(
                      "rounded-full border px-3 py-1.5 font-mono text-sm",
                      isNext
                        ? "border-accent-amber bg-accent-amber/15 text-foreground"
                        : "border-border-default bg-bg-input text-text-muted"
                    )}
                  >
                    {isNext && <span className="text-accent-amber">▸ </span>}
                    {siteLabel(id)}
                  </li>
                )
              })}
            </ol>
          </div>
        )}

        {/* Primary actions. The white button is the day-to-day action — edit
            TODAY'S logged dose (opens the Log sheet); editing the dose going
            forward lives under More. For an archived compound it's Reactivate. */}
        <div className="flex gap-3 pt-1">
          <SheetClose className="flex-1 rounded-xl border border-border-strong py-3 text-sm font-medium text-text-muted transition-colors hover:text-text-primary">
            Close
          </SheetClose>
          {compound.archived ? (
            <button
              type="button"
              onClick={() => setConfirmArchive("reactivate")}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-primary py-3 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99]"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Reactivate
            </button>
          ) : context === "plan" ? (
            <button
              type="button"
              onClick={() => onEdit(compound)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-primary py-3 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99]"
            >
              <Pencil className="h-4 w-4" aria-hidden />
              Edit dose &amp; schedule
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onEditTodaysDose?.(compound)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-primary py-3 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99]"
            >
              <Pencil className="h-4 w-4" aria-hidden />
              {isToday ? "Edit today's dose" : "Edit this dose"}
            </button>
          )}
        </div>

        {/* Archive / reactivate confirm — drops down before it happens. */}
        {confirmArchive && deleteStep === 0 ? (
          <div className="animate-shortcut-in rounded-xl border border-accent-amber/40 bg-accent-amber/10 p-3">
            <p className="text-sm text-foreground">
              {confirmArchive === "archive"
                ? `Archive “${compound.name}”? You can change it any time, just unarchive it from your Profile.`
                : `Add “${compound.name}” back to your log? You can archive it again any time.`}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmArchive(null)}
                className="flex-1 rounded-lg border border-border-strong py-2 text-sm text-text-muted transition-colors hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmArchive === "archive") onArchive(compound.id)
                  else onReactivate(compound.id)
                  onClose()
                }}
                className="flex-1 rounded-lg bg-accent-amber py-2 text-sm font-medium text-bg-base transition-opacity hover:opacity-90"
              >
                {confirmArchive === "archive" ? "Archive" : "Add back"}
              </button>
            </div>
          </div>
        ) : deleteStep === 0 ? (
          <div>
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border-strong py-3 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
            >
              More
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  moreOpen && "rotate-180"
                )}
                aria-hidden
              />
            </button>
            {moreOpen && (
              <div className="animate-shortcut-in mt-2 overflow-hidden rounded-xl border border-border-default bg-bg-surface-raised">
                {!compound.archived && (
                  <>
                    {/* In the plan context the primary button already edits dose &
                        schedule, so this row would be redundant — show it only on
                        the dashboard, where the primary is "Edit today's dose". */}
                    {context !== "plan" && (
                      <MenuRow
                        icon={<CalendarClock className="h-4 w-4" aria-hidden />}
                        sub="Changes upcoming doses · today's logged dose stays as-is"
                        onClick={() => {
                          setMoreOpen(false)
                          onEdit(compound)
                        }}
                      >
                        Alter dose &amp; schedule
                      </MenuRow>
                    )}
                    <MenuRow
                      icon={<Archive className="h-4 w-4" aria-hidden />}
                      sub="Hides it going forward · keeps all past entries · reversible"
                      onClick={() => {
                        setMoreOpen(false)
                        setConfirmArchive("archive")
                      }}
                    >
                      Stop logging
                    </MenuRow>
                  </>
                )}
                <MenuRow
                  destructive
                  icon={<Trash2 className="h-4 w-4" aria-hidden />}
                  sub="Erases this compound and ALL its logged history"
                  onClick={() => {
                    setMoreOpen(false)
                    setDeleteStep(1)
                  }}
                >
                  Delete all
                </MenuRow>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-state-error/40 bg-state-error/10 p-3">
            <p className="text-sm text-foreground">
              {deleteStep === 1
                ? `Delete “${compound.name}” and ALL of its logged history? This can't be undone. Archive instead if you just want to stop dosing it.`
                : `Last check. This permanently erases every logged dose for “${compound.name}”.`}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteStep(0)}
                className="flex-1 rounded-lg border border-border-strong py-2 text-sm text-text-muted transition-colors hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteStep === 1) {
                    setDeleteStep(2)
                  } else {
                    onDelete(compound.id)
                    onClose()
                  }
                }}
                className="flex-1 rounded-lg bg-state-error py-2 text-sm font-medium text-text-primary transition-opacity hover:opacity-90"
              >
                {deleteStep === 1 ? "Continue" : "Delete forever"}
              </button>
            </div>
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
  destructive,
}: {
  children: React.ReactNode
  sub?: string
  icon: React.ReactNode
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-input/50",
        destructive ? "text-state-error" : "text-foreground"
      )}
    >
      <span className={cn("shrink-0", destructive ? "text-state-error" : "text-text-muted")}>
        {icon}
      </span>
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
