"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CaretRight, CircleNotch } from "@/components/icons"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useSheetDrag } from "@/components/home/useSheetDrag"
import { SHEET_TITLE } from "@/lib/ui-presets"
import { closeBlockAction, extendBlockAction } from "@/app/(app)/blocks/actions"
import { localToday } from "@/lib/blocks/block"
import type { Block } from "@/lib/blocks/block"

/** What the user answered. The caller owns what to remember about it. */
export type EndPromptOutcome = "extended" | "closed" | "left-running"

const REFLECTION_MAX = 4000 // matches the CHECK on blocks.reflection

/**
 * The end-date prompt (Adrian, 2026-07-30: "On the end date, ASK").
 *
 * There is deliberately **no auto-close**. Closing a block on its end date
 * without asking would silently decide it finished on schedule, and — the part
 * that actually matters — you would never get the reflection, which is the one
 * thing in the whole retrospective the data cannot produce on its own. So the
 * app asks, and all three answers are legitimate:
 *
 *  - **Extend** — it is still running, and the user picks the new date. Not "add
 *    four weeks": a prep moves because a show moved, and the user knows the date.
 *  - **Close** — it is done. This is where the reflection is written.
 *  - **Leave running** — it is done being planned but not done being run. The
 *    block simply carries on past its end, and the dot stops asking on this
 *    device so a supported choice is not turned into a nag.
 *
 * Nothing here judges the block. There is no "did you make it?", no verdict on
 * a target, and no wording that implies the block should have ended.
 */
export function BlockEndPrompt({
  open,
  onOpenChange,
  block,
  todayKey,
  reachedEnd = true,
  onResolved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  block: Block
  todayKey: string
  /**
   * True when the sheet was raised BY the end date arriving (the dot on the
   * banner), false when the user opened it themselves from the block. It only
   * changes the wording and whether "leave running" is offered — the writes are
   * identical either way.
   */
  reachedEnd?: boolean
  /**
   * Told what the user chose, once the write has landed. Remembering a
   * "leave running" is the CALLER's job, not this sheet's: the component that
   * owns the dot owns whether the dot shows, and storage only ever remembers a
   * decision the UI has already made (`architecture.md` — device preferences are
   * best-effort, and reading one back to learn what was just tapped is the bug
   * spec 07 shipped briefly).
   */
  onResolved: (outcome: EndPromptOutcome) => void
}) {
  const router = useRouter()
  const { cardRef, handleProps, cardStyle } = useSheetDrag(() => onOpenChange(false), open)

  const [mode, setMode] = useState<"choose" | "extend" | "close">("choose")
  const [newEnd, setNewEnd] = useState("")
  const [reflection, setReflection] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setMode("choose")
      // Blank rather than pre-filled with today: today is the one date that
      // cannot be an extension, so pre-filling it would offer a value that is
      // never right.
      setNewEnd("")
      setReflection("")
      setBusy(false)
      setError(null)
    }
  }

  // An extension must land after the day the block is already past. `todayKey`
  // rather than `endsOn`, because by the time this prompt appears the end date
  // has been reached and extending to it would change nothing.
  const extendValid = newEnd !== "" && newEnd > todayKey

  async function doExtend() {
    if (!extendValid || busy) return
    setBusy(true)
    setError(null)
    const res = await extendBlockAction(block.id, newEnd)
    if (!res.ok) {
      setError(res.error ?? "Could not extend the block.")
      setBusy(false)
      return
    }
    setBusy(false)
    onOpenChange(false)
    // Extending answers the question, so any earlier dismissal must be cleared:
    // the prompt has to come back when the NEW end date arrives.
    onResolved("extended")
    router.refresh()
  }

  async function doClose() {
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await closeBlockAction(block.id, localToday(), { reflection })
    if (!res.ok) {
      setError(res.error ?? "Could not close the block.")
      setBusy(false)
      return
    }
    setBusy(false)
    onOpenChange(false)
    onResolved("closed")
    // Straight to the look-back. Closing a block is the moment its retrospective
    // becomes the thing worth seeing, and it is the whole reason the app asked.
    router.push("/blocks")
    router.refresh()
  }

  function leaveRunning() {
    onOpenChange(false)
    onResolved("left-running")
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 border-t-0 bg-transparent p-0 shadow-none"
      >
        <div
          ref={cardRef}
          style={cardStyle}
          className="flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl border-t border-border-default bg-bg-surface shadow-lg"
        >
          <div
            {...handleProps}
            className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          >
            <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
          </div>

          <SheetTitle className="sr-only">
            {reachedEnd ? `${block.name} has reached its end date` : `Change ${block.name}`}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {reachedEnd
              ? "Extend the block, close it and write a reflection, or leave it running."
              : "Move the block's end date, or close it and write a reflection."}
          </SheetDescription>

          <div className="flex-1 overflow-y-auto px-6 pb-4">
            <h2 className={SHEET_TITLE}>
              {mode === "extend"
                ? "Extend the block"
                : mode === "close"
                  ? "Close the block"
                  : reachedEnd
                    ? "This block has reached its end date"
                    : block.name}
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              {mode === "extend"
                ? `Pick the new end date for ${block.name}.`
                : mode === "close"
                  ? "It keeps everything you logged while it ran. Write something now if you want to, or later."
                  : reachedEnd
                    ? `${block.name} was set to end ${formatDate(block.endsOn)}.`
                    : "Move its end date, or close it and look back on it."}
            </p>

            {mode === "choose" && (
              <div className="mt-5 space-y-2">
                <ChoiceRow
                  title={block.endsOn ? "Extend" : "Set an end date"}
                  detail="Still running. Pick a new end date."
                  onClick={() => setMode("extend")}
                />
                <ChoiceRow
                  title="Close"
                  detail="Done. Write a reflection and look back on it."
                  onClick={() => setMode("close")}
                />
                {/* Only offered when the block has actually reached its end.
                    Opened deliberately from the block itself, "leave running"
                    would be a button that does nothing — it is the answer to a
                    question nobody asked. */}
                {reachedEnd && (
                  <ChoiceRow
                    title="Leave running"
                    detail="Carry on with no end date in mind. Nothing changes."
                    onClick={leaveRunning}
                  />
                )}
              </div>
            )}

            {mode === "extend" && (
              <label className="mt-5 block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
                  New end date
                </span>
                <Input
                  type="date"
                  value={newEnd}
                  min={todayKey}
                  onChange={(e) => setNewEnd(e.target.value)}
                  aria-label="New end date"
                  className="h-12 rounded-xl border-border-default bg-bg-input px-3 font-mono text-sm [color-scheme:dark] dark:bg-bg-input"
                />
                {newEnd !== "" && !extendValid && (
                  <span className="mt-1.5 block text-xs text-state-error">
                    Pick a date after today.
                  </span>
                )}
              </label>
            )}

            {mode === "close" && (
              <label className="mt-5 block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
                  Reflection{" "}
                  <span className="normal-case text-text-subtle">(optional)</span>
                </span>
                <Textarea
                  value={reflection}
                  onChange={(e) => setReflection(e.target.value)}
                  rows={5}
                  maxLength={REFLECTION_MAX}
                  placeholder="What worked, what you would change, how it felt."
                  className="rounded-xl border-border-default bg-bg-input text-sm dark:bg-bg-input"
                />
              </label>
            )}

            {error && <p className="mt-3 px-1 text-sm text-state-error">{error}</p>}
          </div>

          {mode !== "choose" && (
            <div className="flex shrink-0 gap-3 hairline-t px-6 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <button
                type="button"
                onClick={() => setMode("choose")}
                className="rounded-xl border border-border-strong px-4 py-3 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
              >
                Back
              </button>
              <button
                type="button"
                onClick={mode === "extend" ? doExtend : doClose}
                disabled={busy || (mode === "extend" && !extendValid)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-primary py-3 text-sm font-medium text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
              >
                {busy && <CircleNotch className="h-4 w-4 animate-spin" aria-hidden />}
                {mode === "extend"
                  ? busy
                    ? "Extending…"
                    : "Extend"
                  : busy
                    ? "Closing…"
                    : "Close block"}
              </button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ChoiceRow({
  title,
  detail,
  onClick,
}: {
  title: string
  detail: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border border-border-default px-4 py-3.5 text-left transition-colors",
        "hover:bg-bg-surface-raised/60 active:scale-[0.99]",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs text-text-muted">{detail}</span>
      </span>
      <CaretRight className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
    </button>
  )
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

function formatDate(key: string | null): string {
  if (!key) return "with no end date"
  const [y, m, d] = key.split("-").map(Number)
  if (!y || !m || !d) return key
  return `on ${d} ${MONTHS_SHORT[m - 1] ?? ""}`
}
