"use client"

import { useState } from "react"
import { CaretRight, ChatCircleDots } from "@/components/icons"

import { FeedbackSheet } from "@/components/feedback/FeedbackSheet"

/**
 * The permanent "Send feedback" row at the bottom of Profile → App. Styled to
 * match the section's `LinkRow`s but it's a button, since it opens the feedback
 * sheet rather than navigating. Reuses `FeedbackSheet` (→ `beta_feedback` table,
 * founder-read in /admin) with general, non-beta wording. This stays after the
 * beta-only + menu entry is removed, so testers and real users always have a way
 * to reach us.
 */
export function ProfileFeedbackRow({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left outline-none transition-colors hover:bg-bg-surface-raised active:bg-bg-surface-raised focus-visible:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <ChatCircleDots className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        <span className="flex-1 text-sm text-foreground">Send feedback</span>
        <CaretRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      </button>

      <FeedbackSheet
        open={open}
        onOpenChange={setOpen}
        userId={userId}
        title="Send feedback"
        description="Spotted a bug or have an idea? We read every message — thanks for helping make Trackd better."
        placeholder="What's on your mind?"
        submitLabel="Send feedback"
      />
    </>
  )
}
