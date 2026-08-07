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
import { DATA_MONO, PRIMARY_BUTTON, SHEET_TITLE } from "@/lib/ui-presets"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { formatDateKeyShort, type StackCompound } from "@/lib/home/stack"
import {
  activePause,
  dayKeyFromNumber,
  resumeLabel,
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
  title,
  defaultStackMode,
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
  /**
   * Head the sheet with THIS instead of the compound's name.
   *
   * Set when a collapsed STACK row is tapped: the sheet acts on `compound`,
   * which is the stack's first member, and headed itself "Resume Creatine" — a
   * compound the user never tapped (Adrian, 2026-08-07). The container beside it
   * is still the first member's, because a stack has no artwork of its own.
   */
  title?: string
  /** Open on the stack checklist, ticked. Same trigger as `title`: tapping the
   *  stack row means the stack, so the sheet should not need a toggle first. */
  defaultStackMode?: boolean
  /** `ids` is every compound to pause — one, or a stack's ticked members. */
  onPause: (ids: string[], range: { startedOn: string; endsOn: string | null }) => void
  /**
   * `onlyThis` ends THIS compound's pause and nothing else.
   *
   * The default resumes the whole GROUP, which is right from a single row: the
   * other members would otherwise stay paused with no obvious way back. In the
   * stack checklist it is wrong — the sheet lists every paused member, so an
   * unticked one is a deliberate "leave this paused", and a group resume would
   * bring it back anyway.
   */
  onResume: (compound: StackCompound, on: string, onlyThis?: boolean) => void
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
          <SheetTitle>
            {compound
              ? `${activePause(compound.pauses, referenceKey ?? todayKey) ? "Resume" : "Pause"} ${title ?? compound.name}`
              : "Pause"}
          </SheetTitle>
        </SheetHeader>
        {open && compound && (
          <PauseBody
            key={compound.id}
            compound={compound}
            todayKey={todayKey}
            referenceKey={referenceKey ?? todayKey}
            stackMembers={stackMembers ?? []}
            title={title}
            defaultStackMode={defaultStackMode ?? false}
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
  name,
  sub,
  /** What this sheet is DOING. It said "Pause X" even on the resume branch,
   *  where the only buttons are Resume and Save (Adrian, 2026-08-07). */
  verb = "Pause",
}: {
  compound: StackCompound
  /** Overrides the compound's own name — the stack's, when a stack was tapped. */
  name?: string
  sub?: string
  verb?: string
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
        <h2 className={cn(SHEET_TITLE, "truncate")}>
          {verb} {name ?? compound.name}
        </h2>
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
  title,
  defaultStackMode,
  onPause,
  onResume,
  onClose,
}: {
  compound: StackCompound
  todayKey: string
  referenceKey: string
  stackMembers: StackCompound[]
  title?: string
  defaultStackMode: boolean
  onPause: (ids: string[], range: { startedOn: string; endsOn: string | null }) => void
  /**
   * `onlyThis` ends THIS compound's pause and nothing else.
   *
   * The default resumes the whole GROUP, which is right from a single row: the
   * other members would otherwise stay paused with no obvious way back. In the
   * stack checklist it is wrong — the sheet lists every paused member, so an
   * unticked one is a deliberate "leave this paused", and a group resume would
   * bring it back anyway.
   */
  onResume: (compound: StackCompound, on: string, onlyThis?: boolean) => void
  onClose: () => void
}) {
  const existing = activePause(compound.pauses, referenceKey)
  const [duration, setDuration] = useState<number | null>(14)
  const [customEnd, setCustomEnd] = useState("")
  const [startedOn, setStartedOn] = useState(todayKey)
  /** Which row has opened its control. One at a time, so the sheet never grows
   *  into a wall of inputs. */
  const [openRow, setOpenRow] = useState<"length" | "starts" | "back" | null>(null)
  // Opens ALREADY ON when a stack row was tapped: that tap already said "the
  // stack", so making the user flip a toggle to confirm it is a second answer to
  // a question they have answered.
  const [stackMode, setStackMode] = useState(defaultStackMode)
  const [ticked, setTicked] = useState<Set<string>>(
    () =>
      new Set(
        // Pre-tick everything EXCEPT members already on their own pause — those
        // are not re-pausable and start out of the set, not merely unticked.
        [compound, ...stackMembers]
          .filter((m) => activePause(m.pauses, referenceKey) === null)
          .map((m) => m.id)
      )
  )
  const [newEnd, setNewEnd] = useState(existing?.endsOn ?? "")
  /** Stack mates that are ALSO paused right now — the resume branch's list. */
  const pausedMates = stackMembers.filter(
    (m) => activePause(m.pauses, referenceKey) !== null
  )
  /** Everything the resume list offers: this compound, then its paused mates. */
  const resumeAll = [compound, ...pausedMates]
  const [resumeTicked, setResumeTicked] = useState<Set<string>>(
    () =>
      // Opened from the STACK row → everything. Opened from one compound → just
      // that one, so resuming what you tapped needs no unticking first.
      new Set(
        defaultStackMode
          ? [compound.id, ...pausedMates.map((m) => m.id)]
          : [compound.id],
      )
  )
  const allTicked =
    resumeAll.length > 0 && resumeAll.every((m) => resumeTicked.has(m.id))

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
        "flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors",
        // Amber marks what is LIVE (`ui-context.md` → "a switch that is ON is amber").
        //
        // OFF now carries a border and a lighter track. `bg-bg-surface-raised`
        // on `bg-bg-surface` is a few points apart, so the switch was nearly
        // invisible until it was on — you could not tell it was a control
        // (Adrian, 2026-08-07). Bigger too: 5x9 was under the tap-target floor.
        on
          ? "bg-accent-amber"
          : "border border-border-strong bg-bg-input"
      )}
    >
      <span
        className={cn(
          "h-5 w-5 rounded-full transition-transform",
          on ? "translate-x-5 bg-bg-base" : "bg-text-muted"
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
          name={title}
          verb="Resume"
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

          {/* WHOLE STACK, on the resume side too — it only existed on the pause
              side, so a stack paused in one action had to be brought back one
              compound at a time (Adrian, 2026-08-07).

              Every CURRENTLY-PAUSED member is tickable, whatever pause it is on
              (his call). "Resume the stack" means bring it all back; whether two
              members happen to share a pause action is bookkeeping the user
              never asked about. */}
          {pausedMates.length > 0 && (
            <>
              {/* A SELECT-ALL, not a mode (Adrian, 2026-08-07). It was a toggle
                  that hid the list when off, which made "resume the whole stack"
                  a thing you could switch off and then have nothing to tick.

                  It now READS the ticks rather than gating them: untick one and
                  it goes off, tick them all and it comes back on, switch it off
                  and everything unticks. The list is always here, because the
                  toggle can no longer be what reveals it. */}
              <Row
                label={`Resume the whole stack · ${resumeAll.length}`}
                pressed={allTicked}
                onClick={() =>
                  setResumeTicked(
                    allTicked ? new Set() : new Set(resumeAll.map((m) => m.id)),
                  )
                }
              >
                {toggle(allTicked)}
              </Row>
              <div className="pb-1.5">
                {resumeAll.map((m) => (
                  <label key={m.id} className="flex items-center gap-3 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={resumeTicked.has(m.id)}
                      onChange={(e) =>
                        setResumeTicked((prev) => {
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
                    <span className={cn(DATA_MONO, "shrink-0")}>
                      {resumeLabel(m.pauses, referenceKey, formatDateKeyShort) ?? ""}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              // Nothing ticked is a real state now that the select-all can clear
              // the list, and it has no action behind it.
              disabled={pausedMates.length > 0 && resumeTicked.size === 0}
              onClick={() => {
                // Resuming TODAY makes today due: the pause ends yesterday,
                // because both of its ends are inclusive.
                //
                // Whatever is TICKED, and nothing else — one call each, with
                // `onlyThis` every time. Members may be on different stretches,
                // so a single group write would only end the ones sharing a
                // group id; and the list already shows every paused member, so
                // an unticked one is a decision a group resume would undo.
                if (pausedMates.length > 0) {
                  for (const m of resumeAll) {
                    if (resumeTicked.has(m.id)) onResume(m, todayKey, true)
                  }
                } else {
                  onResume(compound, todayKey)
                }
                onClose()
              }}
              className={PRIMARY_BUTTON}
            >
              {/* Says HOW MANY, because the ticks decide it now and the button
                  is the last chance to notice you left one behind. */}
              {resumeTicked.size > 1
                ? `Resume ${resumeTicked.size} now`
                : "Resume now"}
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
  const targets = stackMode
    ? [...ticked].filter(
        (id) =>
          activePause(
            [compound, ...stackMembers].find((m) => m.id === id)?.pauses,
            referenceKey
          ) === null
      )
    : [compound.id]

  return (
    <>
      <PauseHeader compound={compound} name={title} />
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
              className="block h-11 w-full min-w-0 rounded-xl border-border-default bg-bg-input px-3 font-mono text-base dark:bg-bg-input"
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
              className="block h-11 w-full min-w-0 rounded-xl border-border-default bg-bg-input px-3 font-mono text-base dark:bg-bg-input"
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
            {[compound, ...stackMembers].map((m) => {
              // ALREADY PAUSED, on its own stretch. Not tickable, and dimmed
              // (Adrian, 2026-08-07): pausing it again is not additive — it
              // would absorb the existing pause and silently change dates the
              // user set deliberately. Its own row is where you edit it.
              const own = activePause(m.pauses, referenceKey)
              return (
                <label
                  key={m.id}
                  className={cn(
                    "flex items-center gap-3 py-1.5 text-sm",
                    own && "opacity-45"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={!own && ticked.has(m.id)}
                    disabled={Boolean(own)}
                    onChange={(e) =>
                      setTicked((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(m.id)
                        else next.delete(m.id)
                        return next
                      })
                    }
                    className="h-4 w-4 accent-[var(--accent-primary)] disabled:opacity-50"
                  />
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {m.name}
                  </span>
                  {own && (
                    <span className={cn(DATA_MONO, "shrink-0")}>Paused</span>
                  )}
                </label>
              )
            })}
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
          className={cn(PRIMARY_BUTTON, "mt-5 w-full")}
        >
          {awaitingDate ? "Pick a date" : "Pause"}
        </button>
      </div>
    </>
  )
}

/** Re-exported so a caller can name the type without reaching into the module. */
export type { Pause }
