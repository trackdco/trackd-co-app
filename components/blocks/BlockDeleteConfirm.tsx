"use client"

import { useRouter } from "next/navigation"

import { ConfirmDialog } from "@/components/feel/ConfirmDialog"
import { showToast } from "@/lib/toast"
import { blockErrorText } from "@/lib/blocks/errorText"
import { deleteBlockAction } from "@/app/(app)/blocks/actions"

/**
 * Deleting a block, permanently (Adrian, 2026-07-31).
 *
 * The ONLY hard delete in the app, and the copy has to earn that. Everything
 * else the user can remove is soft: a compound keeps its logged doses, because
 * erasing it would restate what they actually did. A block owns no such record —
 * it is a named window over data held in other tables — so removing it removes a
 * label and nothing else. The confirm's one line says exactly that, because
 * "this cannot be undone" on its own invites the reasonable fear that the doses
 * go with it.
 *
 * The one confirm (`ConfirmDialog`, consistency fix #5): the question, one
 * line, Cancel and a red "Delete block". It closes at once; the toast then
 * says it went, or that it could not (fix #29's "Couldn’t <verb>. Try again.").
 * There is no Undo: nothing can put a deleted block back.
 */
export function BlockDeleteConfirm({
  open,
  onOpenChange,
  blockId,
  blockName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  blockId: string
  blockName: string
}) {
  const router = useRouter()

  async function remove() {
    const res = await deleteBlockAction(blockId)
    if (!res.ok) {
      showToast(blockErrorText(res.error, "delete"))
      return
    }
    // Back to the list: the page behind this one is the block that no longer
    // exists, and leaving the user on it would render an empty retrospective.
    router.replace("/blocks")
    router.refresh()
    showToast(`${blockName} deleted`)
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={() => onOpenChange(false)}
      title="Delete this block?"
      line="Your doses, weights, photos and notes stay."
      confirmLabel="Delete block"
      onConfirm={() => void remove()}
    />
  )
}
