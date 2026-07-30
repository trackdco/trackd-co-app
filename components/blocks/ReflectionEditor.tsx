"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CircleNotch, NotePencil } from "@/components/icons"

import { Textarea } from "@/components/ui/textarea"
import { CARD_EYEBROW } from "@/lib/ui-presets"
import { saveReflectionAction } from "@/app/(app)/blocks/actions"
import type { Block } from "@/lib/blocks/block"

const REFLECTION_MAX = 4000 // matches the CHECK on blocks.reflection

/**
 * The user's own note on a block — the only part of the retrospective the data
 * cannot produce. Everything else on that screen is a query; this is the bit
 * that says what it was like.
 *
 * Editable after the fact on purpose. The reflection is offered at close, when
 * the block is freshest, but the useful sentence about a sixteen-week prep often
 * arrives a fortnight later, and a note you cannot revise is one people stop
 * writing.
 *
 * Writable on a LIVE block too. There is no rule that a thought worth keeping
 * has to wait for the block to end.
 */
export function ReflectionEditor({ block }: { block: Block }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(block.reflection ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The saved value is the source of truth. If the block reloads with a
  // different reflection (another device, or the close sheet wrote one), a
  // draft that is not being edited must follow it rather than pin the old text.
  const [lastSaved, setLastSaved] = useState(block.reflection ?? "")
  if (!editing && (block.reflection ?? "") !== lastSaved) {
    setLastSaved(block.reflection ?? "")
    setDraft(block.reflection ?? "")
  }

  async function save() {
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await saveReflectionAction(block.id, draft)
    setBusy(false)
    if (!res.ok) {
      setError("Could not save that. Try again.")
      return
    }
    setLastSaved(draft.trim())
    setEditing(false)
    router.refresh()
  }

  if (!editing) {
    return (
      <section className="rounded-2xl bg-bg-surface p-5">
        <p className={CARD_EYEBROW}>Your note</p>
        {block.reflection ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
            {block.reflection}
          </p>
        ) : (
          <p className="mt-2 text-sm text-text-muted">
            Nothing written yet. What worked, what you would change, how it felt.
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setDraft(block.reflection ?? "")
            setEditing(true)
          }}
          className="mt-3 flex items-center gap-2 rounded-xl border border-border-strong px-4 py-2.5 min-h-11 text-sm font-medium text-text-muted transition-colors hover:text-foreground"
        >
          <NotePencil className="h-4 w-4" aria-hidden />
          {block.reflection ? "Edit note" : "Write a note"}
        </button>
      </section>
    )
  }

  return (
    <section className="rounded-2xl bg-bg-surface p-5">
      <p className={CARD_EYEBROW}>Your note</p>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={6}
        maxLength={REFLECTION_MAX}
        placeholder="What worked, what you would change, how it felt."
        aria-label="Your note on this block"
        className="mt-2 rounded-xl border-border-default bg-bg-input text-sm dark:bg-bg-input"
      />
      {error && <p className="mt-2 text-sm text-state-error">{error}</p>}
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={() => {
            setDraft(block.reflection ?? "")
            setEditing(false)
            setError(null)
          }}
          className="rounded-xl border border-border-strong px-4 py-2.5 min-h-11 text-sm font-medium text-text-muted transition-colors hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-primary py-2.5 min-h-11 text-sm font-medium text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
        >
          {busy && <CircleNotch className="h-4 w-4 animate-spin" aria-hidden />}
          {busy ? "Saving…" : "Save note"}
        </button>
      </div>
    </section>
  )
}
