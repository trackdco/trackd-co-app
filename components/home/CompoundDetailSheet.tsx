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
import { BottomSheet } from "@/components/layout/BottomSheet"
import { ConfirmDialog } from "@/components/feel/ConfirmDialog"
import { CARD_EYEBROW, HIT_30, PRESS, PRIMARY_BUTTON } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"
import {
  cadenceLabel,
  formatTimeLabel,
  methodLabel,
  type StackCompound,
} from "@/lib/home/stack"
import { formatDose } from "@/lib/format/dose"
import { dayLong } from "@/lib/format/date"
import { activePause } from "@/lib/home/pauses"
import { toDateKey } from "@/lib/home/mockHomeData"
import { SolidIcon } from "@/components/feel/SolidIcon"
import { halfLifeOf } from "@/lib/halflife/compoundCurve"
import { formatHalfLife } from "@/lib/halflife/model"
import { isBlend } from "@/lib/compound-blends"
import { containerNounTitle } from "@/lib/containers/labels"
import { setStockArchived, type StockItem } from "@/lib/db/inventory"
import { showToast } from "@/lib/toast"
import { GHOST_BUTTON } from "@/lib/ui-presets"
import { nextDoseKey, nextDoseText, stockPicture } from "@/lib/protocol/compoundSheet"
import { StockPicture } from "@/components/protocol/stock/StockPicture"
import { StockContainer } from "@/components/protocol/stock/StockContainer"

/** Protocol's stock, in the sheet (build-brief-final §3.7, W17). */
export interface CompoundStockSection {
  /** The container in use (the oldest open one, else the first spare), with
   *  its OWN figures. */
  inUse: StockItem | null
  /** Containers held beyond it. */
  others: number
  /** A spare still to mix: "Mix one" shows while there is one. */
  drySpare: StockItem | null
  /**
   * Everything held beyond the one in use (`CompoundStockView.extras`, W17).
   * With it the sheet draws those containers under the one in use (mixed,
   * unmixed, sealed); without it, the one in use and "+N vials" alone.
   */
  extras?: readonly StockItem[] | null
  onAddStock: () => void
  onMix: (spare: StockItem) => void
  onCorrect: (item: StockItem) => void
  onChanged: () => void
}

interface CompoundDetailSheetProps {
  open: boolean
  compound: StackCompound | null
  onOpenChange: (open: boolean) => void
  /** Where the sheet is opened from. "plan" (the Protocol builder) has no day-logging,
   *  so the primary action becomes "Edit dose & schedule" and the redundant "today's
   *  dose" path is dropped. Defaults to the dashboard behaviour. */
  /** "row" is the ⋯ on a Today's Log row (Flow B): the open row logs, so
   *  the filled button edits the dose and schedule instead. */
  context?: "dashboard" | "plan" | "row"
  /** Whether the day being viewed is today — drives the primary action's label.
   *  Dashboard only. */
  isToday?: boolean
  /** The day being viewed. Every other read on this sheet is selected-day
   *  scoped; the pause label was the one asking about today. */
  dateKey?: string
  /** Edit the dose for the viewed day — the white action in the "dashboard"
   *  context only. Home uses "row" (the row logs), Protocol "plan". */
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
    /** The amount left, ALREADY WORDED — "8.5 mL left", "60 caps left", "1 kg
     *  left". A pre-built string rather than a number and a unit, because both
     *  callers used to assemble it themselves and both got it wrong: a tub had
     *  no unit ("990 left") and an oral used the raw stored one ("60 capsule
     *  left"). Built by the shared `remainingLabel`. Null when there is no
     *  figure to state. */
    label: string | null
    /** Does a container EXIST for this compound? Distinct from `label`, which is
     *  a display figure and legitimately null on an item that exists —
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
  /**
   * How many of TODAY's doses of this compound are already logged or skipped.
   * "Next dose" skips today once they all are (F14). Omitted, it is read from
   * `todaysLog` when the sheet is on today, else taken as none.
   */
  loggedToday?: number
  /** Delete — stop future doses, keep every logged dose (Spec 02: the one verb). */
  onArchive: (id: string) => void
  /**
   * Protocol's stock, in the sheet (build-brief-final §3.7; W17): the
   * container in use drawn at its level with its figure and "+N vials", what
   * else is held drawn under it, Add stock, and Mix one when a spare is still
   * dry; Correct and Discard behind the ⋯.
   */
  stockSection?: CompoundStockSection
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
  loggedToday,
  onArchive,
  stockSection,
}: CompoundDetailSheetProps) {
  // Retain through the close animation so the body doesn't blank.
  const [shown, setShown] = useState<StackCompound | null>(compound)
  if (compound !== null && compound !== shown) setShown(compound)

  // The one sheet frame (consistency fix #1). Its header is the compound's
  // container and name, drawn in the body, so the title is for screen readers.
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={shown?.name ?? "Compound"}
      hideTitle
      description={shown ? `Dose and schedule for ${shown.name}.` : undefined}
      desktop="rail"
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
            loggedToday={loggedToday}
            onArchive={onArchive}
            stockSection={stockSection}
          />
        ) : null}
    </BottomSheet>
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
  loggedToday,
  onArchive,
  stockSection,
}: {
  compound: StackCompound
  onClose: () => void
  context: "dashboard" | "plan" | "row"
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
    label: string | null
    exists?: boolean
  }
  todaysLog?: { status?: "taken" | "skipped" } | null
  loggedToday?: number
  onArchive: (id: string) => void
  stockSection?: CompoundStockSection
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  // A pending Discard of the container in use: it asks first (fix #5).
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const hl = isBlend(compound.name) ? null : halfLifeOf(compound.name, compound.method)
  // A pending DELETE confirmation (drops down before it happens).
  const [confirmArchive, setConfirmArchive] = useState(false)
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
    context === "plan" || context === "row"
      ? "Edit dose & schedule"
      : taken
        ? isToday
          ? "Edit today's dose"
          : "Edit this dose"
        : isToday
          ? "Log today's dose"
          : "Log this dose"
  // ONE next dose (D13), skipping today once today's doses are all dealt
  // with (F14), and skipping pauses and weeks off (Spec w2b-13, Step 6).
  const now = new Date()
  const doneToday = loggedToday ?? (isToday && todaysLog != null ? 1 : 0)
  const nextKey = nextDoseKey(compound, now, doneToday)
  // The stock, drawn (W17).
  const picture = stockSection
    ? stockPicture({
        inUse: stockSection.inUse,
        extras: stockSection.extras,
        others: stockSection.others,
        naming: { category: compound.category, name: compound.name },
      })
    : null

  return (
    <div>
      <div className="space-y-5 pb-1">
        {/* Header — the compound's CONTAINER rather than the small type icon
            (Adrian's call). At sheet size the drawn vial / bottle / tub is the
            thing that identifies the compound at a glance, and a 14px glyph was
            doing nothing the name did not already do. Specs 10 and 11 call for
            this same header on the add and log forms, so this is the pattern they
            reuse rather than a one-off. */}
        <div className="flex items-center gap-3">
          {/* A compound holding only dry vials is drawn dry, with its powder,
              as its stock below is (W17). */}
          <StockContainer
            name={compound.name}
            inventoryType={inventoryTypeForCompound(compound.name, compound.method, compound.inventoryForm)}
            category={compound.category}
            fill={picture?.lead.powder ? 0 : (stock?.fill ?? undefined)}
            powder={picture?.lead.powder ?? false}
            size={58}
          />
          <p className="min-w-0 flex-1 text-[17px] leading-snug text-foreground">{compound.name}</p>
        </div>

        {/* ONE long card: the half-life mark in the compound's colour, the
            half-life, the dose, the route, split by hairlines (round three).
            No half-life (Vitamin D3) or a blend: that part is simply absent.
            Tight, as the mockup draws it (W14, r6/extra9.css .sfact9): about
            36px tall, 12.5px figures. */}
        <div className="inst-rows flex items-stretch overflow-hidden">
          {hl ? (
            <span className="flex items-center gap-2 px-3 py-2">
              <SolidIcon name="halfLife" size={15} hue={`var(--cat-${compound.category})`} />
              <span className="font-mono text-[12.5px] text-foreground">{formatHalfLife(hl.halfLifeH)}</span>
              {hl.estimated ? <span className="text-[11px] text-text-muted">est.</span> : null}
            </span>
          ) : null}
          <span className={cn("flex items-center px-3 py-2 font-mono text-[12.5px] text-foreground", hl && "fact-sep")}>
            {formatDose(compound.dose, compound.unit)}
          </span>
          <span className="fact-sep flex items-center px-3 py-2 text-[12.5px] text-foreground">
            {methodLabel(compound.method)}
          </span>
        </div>

        {/* Everything under the header rises in as the sheet lands (feel pass
            §4). The header is the sheet's title, so it lands with the sheet. */}
        <div data-sheet-body className="space-y-5">
          {/* Dose + schedule */}
          <div className="grid grid-cols-2 gap-3">
            {/* The dose leads the header now, so repeating it here would waste the
                slot. Started-on was previously nowhere on the sheet. */}
            <Stat label="Started">
              <span className="font-mono">
                {dayLong(compound.schedule.startDate)}
              </span>
            </Stat>
            <Stat label="Schedule">
              {cadenceLabel(compound.schedule.cadence)}
              <span className="text-text-muted">
                {" "}
                {/* The time never splits ("8:00 / AM" at 375, D26): it moves
                    to the next line whole. */}
                · <span className="font-mono whitespace-nowrap">{formatTimeLabel(compound.schedule.timeOfDay)}</span>
              </span>
            </Stat>
          </div>

          {nextKey ? (
            <p className="px-1 text-xs text-text-muted">
              Next dose{" "}
              <span className="font-mono text-foreground">{nextDoseText(nextKey, now)}</span>
            </p>
          ) : null}

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
          {stockSection ? (
            <div>
              <p className={cn(CARD_EYEBROW, "mb-2 px-1")}>Stock</p>
              {stockSection.inUse && picture ? (
                <StockPicture
                  picture={picture}
                  name={compound.name}
                  category={compound.category}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setMoreOpen((o) => !o)}
                      aria-expanded={moreOpen}
                      aria-label="More stock actions"
                      className={cn(PRESS.icon, HIT_30, "-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted")}
                    >
                      <span aria-hidden className="text-[18px] leading-none">⋯</span>
                    </button>
                  }
                  footer={
                    moreOpen ? (
                      <div className="animate-shortcut-in flex gap-2 px-3.5 py-2.5">
                        <button type="button" onClick={() => stockSection.onCorrect(stockSection.inUse!)} className={cn(GHOST_BUTTON, "flex-1 py-2 text-[13px]")}>
                          Correct
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDiscard(true)}
                          className={cn(GHOST_BUTTON, "flex-1 py-2 text-[13px] text-accent-destructive-on-surface")}
                        >
                          Discard
                        </button>
                      </div>
                    ) : null
                  }
                />
              ) : (
                <p className="px-1 text-[13px] text-text-muted">Nothing on hand yet.</p>
              )}
              <div className="mt-2.5 flex gap-2">
                <button type="button" onClick={stockSection.onAddStock} className={cn(GHOST_BUTTON, "flex-1 py-2.5 text-[13px]")}>
                  <SolidIcon name="add" size={16} />
                  Add stock
                </button>
                {stockSection.drySpare ? (
                  <button type="button" onClick={() => stockSection.onMix(stockSection.drySpare!)} className={cn(GHOST_BUTTON, "flex-1 py-2.5 text-[13px]")}>
                    <SolidIcon name="mixOne" size={16} />
                    Mix one
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() =>
              context === "plan" || context === "row" ? onEdit(compound) : onEditTodaysDose?.(compound)
            }
            className={cn(PRIMARY_BUTTON, "w-full")}
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
            {context === "dashboard" && (
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
            {!stockSection && (onAddStock || onCorrectStock) && (
              <ActionRow
                icon={<Package className="h-4 w-4" aria-hidden />}
                onClick={() => {
                  // Existence, not a display figure. `label` is nullable on an
                  // item that genuinely exists.
                  const hasStock = stock?.exists ?? stock?.label != null
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
          <div className="hairline-t border-border-default pt-3">
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              className="flex w-full items-center gap-3 py-2 text-left text-sm text-accent-destructive-on-surface transition-opacity hover:opacity-80"
            >
              <Trash className="h-4 w-4 shrink-0" aria-hidden />
              Delete {compound.name}
            </button>
          </div>
          {/* THE ONE CONFIRM (consistency fix #5). */}
          <ConfirmDialog
            open={confirmArchive}
            onClose={() => setConfirmArchive(false)}
            title={`Delete ${compound.name}?`}
            line="It stops from today. Every dose you logged is kept."
            confirmLabel="Delete"
            onConfirm={() => {
              onArchive(compound.id)
              onClose()
            }}
          />
          {stockSection?.inUse ? (
            <ConfirmDialog
              open={confirmDiscard}
              onClose={() => setConfirmDiscard(false)}
              title={`Discard this ${containerNounTitle({ inventoryType: stockSection.inUse.inventoryType, totalAmountUnit: stockSection.inUse.totalAmountUnit, category: compound.category, name: compound.name }).toLowerCase()}?`}
              line="It comes off your stock."
              confirmLabel="Discard"
              onConfirm={() => {
                const item = stockSection.inUse!
                setMoreOpen(false)
                void setStockArchived(item.id, true).then((r) => {
                  if (!r.ok) {
                    showToast("Couldn’t discard. Try again.")
                    return
                  }
                  stockSection.onChanged()
                  showToast("Discarded", {
                    undo: () => void setStockArchived(item.id, false).then(() => stockSection.onChanged()),
                  })
                })
              }}
            />
          ) : null}
        </div>
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
      <p className={CARD_EYEBROW}>{label}</p>
      <p className="mt-1 text-sm text-foreground">{children}</p>
    </div>
  )
}

