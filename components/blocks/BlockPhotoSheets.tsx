"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { ProgressPhotoGallerySheet } from "@/components/progress/ProgressPhotoGallerySheet"
import { ProgressPhotoViewer } from "@/components/progress/ProgressPhotoViewer"
import { ComparePhotosSheet } from "@/components/progress/ComparePhotosSheet"
import { requestProgressAction } from "@/lib/progress/progressAction"
import { formatPhotoDateShort, type ProgressPhoto } from "@/lib/progress/photos"
import type { WeightUnit } from "@/lib/weight"

/**
 * The block's photos, opened from its retrospective.
 *
 * It is the SAME gallery, viewer and compare the Progress screen uses, handed
 * only the photos inside the block's window. Reusing them is the point: a second
 * gallery would be a second set of month grouping, thumbnail sizing and
 * before/after logic to keep in step, and `ui-context.md`'s "new screens reuse
 * the system" rule exists precisely to stop that. What the block adds is scope,
 * not chrome.
 *
 * **You can delete from here, but not add** (Adrian, 2026-09-03). Deleting is a
 * correction to something already in the block, so it belongs wherever you are
 * looking at the photo. Adding does not: a new photo lands on TODAY, which for a
 * closed block sits outside the window, so it would be taken and then
 * immediately vanish from the gallery that took it. The day-edit pencil goes
 * with the add, since the sheet behind it offers both.
 *
 * **Saying which photos these are is the feature.** Every surface carries the
 * block's name and its date range, because three photos shown without that line
 * read as every photo the user has. The DATES are not decoration either: block
 * names are not unique, so someone on their third comp prep has three blocks
 * called "Comp prep" and only the range tells them apart (Adrian, 2026-09-03).
 */
export function BlockPhotoSheets({
  open,
  onOpenChange,
  photos,
  blockName,
  from,
  to,
  unit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Only the photos inside the block's window. */
  photos: ProgressPhoto[]
  blockName: string
  from: string
  to: string
  unit: WeightUnit
}) {
  const router = useRouter()
  const [compareOpen, setCompareOpen] = useState(false)
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null)
  /** Where the viewer came from, so closing it returns there rather than to the
   *  retrospective. Same idiom as `ProgressPhotoSection`'s `Return`. */
  const [viewReturn, setViewReturn] = useState<"gallery" | "compare" | "none">("none")

  const range = `${formatPhotoDateShort(from)} to ${formatPhotoDateShort(to)}`
  /* Compare keeps the app's own title ("Compare"), so its scope line has to
     carry the block's name itself. The gallery's title already does. */
  const compareCaption = `${blockName} · ${range}`

  function returnFromViewer() {
    if (viewReturn === "gallery") onOpenChange(true)
    else if (viewReturn === "compare") setCompareOpen(true)
    setViewReturn("none")
  }

  return (
    <>
      <ProgressPhotoGallerySheet
        open={open}
        onOpenChange={onOpenChange}
        photos={photos}
        onView={(p) => {
          onOpenChange(false)
          setViewReturn("gallery")
          setViewing(p)
        }}
        onCompare={() => {
          onOpenChange(false)
          setCompareOpen(true)
        }}
        scope={{
          eyebrow: "Block photos",
          title: blockName,
          caption: range,
          onSeeAll: () => {
            onOpenChange(false)
            // The same deep link the Calendar's Photos row uses, so "see all"
            // lands on the real gallery rather than the top of /progress.
            requestProgressAction("photos-gallery")
            router.push("/progress")
          },
        }}
      />

      <ComparePhotosSheet
        open={compareOpen}
        onOpenChange={(o) => {
          setCompareOpen(o)
          if (!o) onOpenChange(true)
        }}
        photos={photos}
        caption={compareCaption}
      />

      <ProgressPhotoViewer
        open={viewing !== null}
        onOpenChange={(o) => {
          if (!o) {
            setViewing(null)
            returnFromViewer()
          }
        }}
        photo={viewing}
        unit={unit}
        onDeleted={() => {
          setViewing(null)
          returnFromViewer()
        }}
      />
    </>
  )
}
