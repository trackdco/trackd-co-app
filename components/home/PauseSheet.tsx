"use client"

import { useState } from "react"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Container } from "@/components/containers"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { DATA_MONO, SHEET_TITLE } from "@/lib/ui-presets"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { formatDateKeyShort, type StackCompound } from "@/lib/home/stack"
import {
  activePause,
  dayKeyFromNumber,
  resumesOn,
  type Pause,
} from "@/lib/home/pauses"

/**
 * How long, in the terms someone actually thinks in. "Two weeks" is how a
 * holiday is described.
 *
 * `days: 0` is CUSTOM — the Back-on row becomes editable rather than resolving
 * to a length. `days: null` is open-ended.
 */
const DURATIONS: { label: string; days: number | null }[] = [
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "4 weeks", days: 28 },
  { label: "Pick a date", days: 0 },
  { label: "Indefinite", days: null },
]

/** `YYYY-MM-DD` n days from `key`, in UTC so no local offset applies. */
function shift(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number)
  return dayKeyFromNumber(Math.floor(Date.UTC(y, m - 1, d + n) / 86_400_000))
}

/**
 * One hairline row: label left, value right.
 *
 * Structure inside this sheet comes from hairlines and nothing else — no nested
 * boxes, no borders inside borders (`ui-context.md` → "cards are borderless;
 * hairlines live inside"). The first version of this sheet put a raised card
 * inside a sheet, which is what made it read as generic.
 */
function Row({
  label,
  value,
  onClick,
  expanded,
  pressed,
  children,
}: {
  label: string
  value?: string
  onClick?: () => void
  expanded?: boolean
  /** For a row acting as a SWITCH. Its visual state lives in an `aria-hidden`
   *  span, so without this a screen reader hears the same thing on and off. */
  pressed?: boolean
  children?: React.ReactNode
}) {
  const inner = (
    <>
      <span className="text-sm text-text-primary">{label}</span>
      {children ?? (
        <span className={cn(DATA_MONO, expanded && "text-foreground")}>{value}</span>
      )}
    </>
  )
  if (!onClick) {
    return (
      <div className="hairline-t flex min-h-12 w-full items-center justify-between gap-3 border-border-default">
        {inner}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
      className="hairline-t flex min-h-12 w-full items-center justify-between gap-3 border-border-default text-left"
    >
      {inner}
    </button>
  )
}

/**
 * A row's control, sliding open and shut.
 *
 * The grid-rows `0fr` ↔ `1fr` transition is the app's ONE expand mechanic —
 * the week strip and a stack's member list both use it — so this is the same
 * idiom rather than a second one. It stays MOUNTED so it can animate both ways;
 * `overflow-hidden` clips it while closed and `inert` keeps a keyboard user out
 * of a control they cannot see.
 */
function Drawer({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div className="overflow-hidden" inert={!open}>
        {children}
      </div>
    </div>
  )
}

/**
 * Pause a compound, or the stack it belongs to.
 *
 * A LEDGER OF ROWS (Adrian, 2026-08-07, choosing proposal B from
 * `/preview/pause`). Each row states its value and opens its own control in
 * place; nothing is a nested card, and the compound's own container sits in the
 * header so you can see what you are pausing.
 *
 * **Opening this on something already paused EDITS that pause.** It is never
 * additive — two overlapping pauses would double-count in the cycle arithmetic.
 */
export function PauseSheet({
  open,
  onOpenChange,
  compound,
  todayKey,
  referenceKey,
  stackMembers,
  onPause,
  onResume,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  compound: StackCompound | null
  todayKey: string
  /** The day the caller is LOOKING at. The sheet judges "already paused"
   *  against this, not against today — scrubbing the strip back into a finished
   *  pause and tapping it otherwise offered a blank NEW-pause form, and saving
   *  created a second overlapping pause starting today. */
  referenceKey?: string
  /** The other compounds in this one's stack, when it is in one. Empty = the
   *  whole-stack row does not appear. */
  stackMembers?: StackCompound[]
  /** `ids` is every compound to pause — one, or a stack's ticked members. */
  onPause: (ids: string[], range: { startedOn: string; endsOn: string | null }) => void
  onResume: (compound: StackCompound, on: string) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl border-border-default bg-bg-surface"
      >
        {/* The visible heading lives in `PauseHeader` beside the container, so
            the accessible one here is off-screen rather than duplicated. */}
        <SheetHeader className="sr-only">
          <SheetTitle>{compound ? `Pause ${compound.name}` : "Pause"}</SheetTitle>
        </SheetHeader>
        {open && compound && (
          <PauseBody
            key={compound.id}
            compound={compound}
            todayKey={todayKey}
            referenceKey={referenceKey ?? todayKey}
            stackMembers={stackMembers ?? []}
            onPause={onPause}
            onResume={onResume}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

/**
 * The header: the compound's OWN container, then what is being done to it
 * (Adrian, 2026-08-07). A vial for an injectable, a bottle for tablets, a tub
 * for a powder — the same artwork the dashboard row shows, so you can see what
 * you are pausing rather than only reading its name.
 */
function PauseHeader({
  compound,
  sub,
}: {
  compound: StackCompound
  sub?: string
}) {
  return (
    <div className="flex items-center gap-3 px-4 pt-3 pb-2">
      <Container
        name={compound.name}
        inventoryType={inventoryTypeForCompound(
          compound.name,
          compound.method,
          compound.inventoryForm
        )}
        category={compound.category}
        size={44}
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <h2 className={cn(SHEET_TITLE, "truncate")}>Pause {compound.name}</h2>
        {sub && <p className={cn(DATA_MONO, "mt-0.5 truncate")}>{sub}</p>}
      </div>
    </div>
  )
}

function PauseBody({
  compound,
  todayKey,
  referenceKey,
  stackMembers,
  onPause,
  onResume,
  onClose,
}: {
  compound: StackCompound
  todayKey: string
  referenceKey: string
  stackMembers: StackCompound[]
  onPause: (ids: string[], range: { startedOn: string; endsOn: string | null }) => void
  onResume: (compound: StackCompound, on: string) => void
  onClose: () => void
}) {
  const existing = activePause(compound.pauses, referenceKey)
  const [duration, setDuration] = useState<number | null>(14)
  const [customEnd, setCustomEnd] = useState("")
  const [startedOn, setStartedOn] = useState(todayKey)
  /** Which row has opened its control. One at a time, so the sheet never grows
   *  into a wall of inputs. */
  const [openRow, setOpenRow] = useState<"length" | "starts" | "back" | null>(null)
  const [stackMode, setStackMode] = useState(false)
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set([compound.id, ...stackMembers.map((m) => m.id)])
  )
  const [newEnd, setNewEnd] = useState(existing?.endsOn ?? "")

  const endsOn =
    duration === null
      ? null
      : duration === 0
        ? customEnd || null
        : shift(startedOn, duration - 1)
  const resumeDate = endsOn === null ? null : shift(endsOn, 1)
  // "Pick a date" with nothing picked is an unfinished form, not an open-ended
  // pause — saving it would quietly create the one kind nobody asked for.
  const awaitingDate = duration === 0 && !customEnd
  /** The whole range sits in the past, so pausing would change nothing today. */
  const alreadyOver = endsOn !== null && endsOn < todayKey
  const lengthLabel = DURATIONS.find((d) => d.days === duration)?.label ?? "2 weeks"

  const chip = (active: boolean) =>
    cn(
      "rounded-full px-3 py-1.5 text-sm transition-colors",
      active
        ? "bg-accent-primary text-bg-base"
        : "bg-bg-surface-raised text-text-muted hover:text-foreground"
    )

  const toggle = (on: boolean) => (
    <span
      aria-hidden
      className={cn(
        "flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors",
        // Amber marks what is LIVE (`ui-context.md` → "a switch that is ON is amber").
        on ? "bg-accent-amber" : "bg-bg-surface-raised"
      )}
    >
      <span
        className={cn(
          "h-4 w-4 rounded-full bg-bg-surface transition-transform",
          on && "translate-x-4"
        )}
      />
    </span>
  )

  /* ------------------------------------------------------- already paused */
  if (existing) {
    const back = resumesOn(compound.pauses, referenceKey)
    return (
      <>
        <PauseHeader
          compound={compound}
          sub={
            back
              ? `Paused since ${formatDateKeyShort(existing.startedOn)}`
              : "Paused, no end date set"
          }
        />
        <div className="mt-3 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          <Row label="Started" value={formatDateKeyShort(existing.startedOn)} />
          <Row
            label="Back on"
            value={back ? formatDateKeyShort(back) : "When I resume it"}
            expanded={openRow === "back"}
            onClick={() => setOpenRow((r) => (r === "back" ? null : "back"))}
          />
          <Drawer open={openRow === "back"}>
            <div className="py-2">
              <Input
                type="date"
                value={newEnd ? shift(newEnd, 1) : ""}
                min={shift(existing.startedOn, 1)}
                onChange={(e) =>
                  setNewEnd(e.target.value ? shift(e.target.value, -1) : "")
                }
                className="h-11 w-full rounded-xl border-border-default bg-bg-input px-3 font-mono text-base dark:bg-bg-input"
              />
            </div>
          </Drawer>
          <span aria-hidden className="hairline-t block border-border-default" />

          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                // Resuming TODAY makes today due: the pause ends yesterday,
                // because both of its ends are inclusive.
                onResume(compound, todayKey)
                onClose()
              }}
              className="rounded-xl bg-accent-primary px-4 py-3 text-sm font-medium text-bg-base transition-opacity hover:opacity-90"
            >
              Resume now
            </button>
            {/* `!== undefined`, not truthy: clearing the field is how a bounded
                pause becomes indefinite, and testing truthiness made the save
                button vanish at exactly that moment. */}
            {newEnd !== existing.endsOn && (
              <button
                type="button"
                onClick={() => {
                  // The same write as a fresh pause: the range is absorbed into
                  // the existing row rather than added beside it.
                  onPause([compound.id], {
                    startedOn: existing.startedOn,
                    // "" means the user cleared it — an INDEFINITE pause, which
                    // is a real choice and not an empty field.
                    endsOn: newEnd || null,
                  })
                  onClose()
                }}
                className="rounded-xl border border-border-default px-4 py-3 text-sm font-medium text-text-primary hover:bg-bg-surface-raised"
              >
                Save the new date
              </button>
            )}
          </div>
        </div>
      </>
    )
  }

  /* ------------------------------------------------------------ a new pause */
  const targets = stackMode ? [...ticked] : [compound.id]

  return (
    <>
      <PauseHeader compound={compound} />
      <div className="mt-3 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <Row
          label="How long"
          value={lengthLabel}
          expanded={openRow === "length"}
          onClick={() => setOpenRow((r) => (r === "length" ? null : "length"))}
        />
        <Drawer open={openRow === "length"}>
          <div className="flex flex-wrap gap-2 py-2.5">
            {DURATIONS.map((d) => (
              <button
                key={d.label}
                type="button"
                onClick={() => {
                  setDuration(d.days)
                  // Leaving the Back-on drawer open for a duration that does not
                  // use it left the row `expanded` (brightened) with nothing
                  // under it and no way to close it.
                  if (d.days !== 0 && openRow === "back") setOpenRow(null)
                  // The drawer STAYS OPEN on select (Adrian, 2026-08-07). It
                  // closes when the next row is opened, because `openRow` holds
                  // one row at a time — so changing your mind about the length
                  // does not make the chips vanish under your finger.
                  // "Pick a date" is the one exception: it hands straight over
                  // to the row that takes one.
                  if (d.days === 0) setOpenRow("back")
                }}
                className={chip(duration === d.days)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </Drawer>

        <Row
          label="Starts"
          value={startedOn === todayKey ? "Today" : formatDateKeyShort(startedOn)}
          expanded={openRow === "starts"}
          onClick={() => setOpenRow((r) => (r === "starts" ? null : "starts"))}
        />
        <Drawer open={openRow === "starts"}>
          <div className="py-2">
            {/* Backdating is supported and costs nothing: nothing derived from a
                pause is stored, so past days reclassify at the next render. */}
            <Input
              type="date"
              value={startedOn}
              max={todayKey}
              onChange={(e) => setStartedOn(e.target.value || todayKey)}
              className="h-11 w-full rounded-xl border-border-default bg-bg-input px-3 font-mono text-base dark:bg-bg-input"
            />
          </div>
        </Drawer>

        <Row
          label="Back on"
          value={
            // `awaitingDate` FIRST. Testing `endsOn === null` first made an
            // unfinished "Pick a date" read as an indefinite pause — the one
            // thing it is not — while the save button below simultaneously said
            // "Pick a date" and sat disabled.
            //
            // Not "Indefinite" for the open-ended case either: the chip is
            // already labelled that, and as a VALUE under "Back on" it answers a
            // different question than the one asked. This says who ends it.
            awaitingDate
              ? "Pick a date"
              : endsOn === null
                ? "When I resume it"
                : formatDateKeyShort(resumeDate ?? startedOn)
          }
          expanded={openRow === "back"}
          onClick={
            duration === 0
              ? () => setOpenRow((r) => (r === "back" ? null : "back"))
              : undefined
          }
        />
        <Drawer open={openRow === "back" && duration === 0}>
          <div className="py-2">
            {/* Asks for the day you are BACK and stores the day before. "The last
                paused day" is the honest internal framing and the wrong thing to
                ask a person. */}
            <Input
              type="date"
              value={customEnd ? shift(customEnd, 1) : ""}
              min={shift(startedOn, 1)}
              onChange={(e) =>
                setCustomEnd(e.target.value ? shift(e.target.value, -1) : "")
              }
              className="h-11 w-full rounded-xl border-border-default bg-bg-input px-3 font-mono text-base dark:bg-bg-input"
            />
          </div>
        </Drawer>

        {stackMembers.length > 0 && (
          <Row
            label={`Whole stack · ${stackMembers.length + 1}`}
            pressed={stackMode}
            onClick={() => setStackMode((v) => !v)}
          >
            {toggle(stackMode)}
          </Row>
        )}
        <Drawer open={stackMode}>
          <div className="py-1.5">
            {/* All ticked by default: the common case is "I am away, none of
                this is happening". Unticking one leaves it running, and a member
                paused separately keeps its own pause when this one resumes. */}
            {[compound, ...stackMembers].map((m) => (
              <label key={m.id} className="flex items-center gap-3 py-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={ticked.has(m.id)}
                  onChange={(e) =>
                    setTicked((prev) => {
                      const next = new Set(prev)
                      if (e.target.checked) next.add(m.id)
                      else next.delete(m.id)
                      return next
                    })
                  }
                  className="h-4 w-4 accent-[var(--accent-primary)]"
                />
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {m.name}
                </span>
              </label>
            ))}
          </div>
        </Drawer>
        <span aria-hidden className="hairline-t block border-border-default" />

        {/* A backdated start with a fixed length can land ENTIRELY in the past —
            "Starts 1 June, 2 weeks" writes a pause that ended in June, the sheet
            closes, and nothing on screen changes. Named rather than silently
            allowed. */}
        {alreadyOver && (
          <p className="text-sm leading-relaxed text-accent-amber">
            That pause would already be over. Move the start date, or choose a
            longer stretch.
          </p>
        )}

        <button
          type="button"
          disabled={targets.length === 0 || awaitingDate || alreadyOver}
          onClick={() => {
            onPause(targets, { startedOn, endsOn })
            onClose()
          }}
          className="mt-5 w-full rounded-xl bg-accent-primary px-4 py-3 text-sm font-medium text-bg-base transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {awaitingDate ? "Pick a date" : "Pause"}
        </button>
      </div>
    </>
  )
}

/** Re-exported so a caller can name the type without reaching into the module. */
export type { Pause }
