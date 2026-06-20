"use client"

import { useRef, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { markWelcomeSeen } from "@/lib/db/welcome"
import {
  WELCOME_MESSAGE,
  WELCOME_TITLE,
  WELCOME_VIDEO_EMBED_URL,
} from "@/lib/welcomeVideo"

/**
 * The one-time founder welcome shown on first sign-in: a short message + an
 * embedded (unlisted) founder video, in a centered modal. `show` is decided
 * server-side (`profiles.welcome_seen_at` is null AND a video link is set), so
 * this opens at most once per account, across devices. Dismissing it — the
 * "Let's go" button, the X, or the backdrop — stamps `welcome_seen_at` so it
 * never returns. Renders nothing until a video URL is configured in
 * `lib/welcomeVideo.ts`, so it can ship dormant.
 */
export function WelcomeVideoPopup({ show }: { show: boolean }) {
  const [open, setOpen] = useState(show)
  const marked = useRef(false)

  if (!WELCOME_VIDEO_EMBED_URL) return null // dormant until a video is set

  function dismiss() {
    setOpen(false)
    if (!marked.current) {
      marked.current = true
      void markWelcomeSeen() // best-effort; reappears next session if it fails
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) dismiss()
      }}
    >
      <DialogContent className="gap-4 rounded-2xl border-border-default bg-bg-surface p-5 sm:max-w-md">
        <DialogTitle className="font-display text-2xl font-medium text-foreground">
          {WELCOME_TITLE}
        </DialogTitle>
        <DialogDescription className="text-sm leading-relaxed text-text-muted">
          {WELCOME_MESSAGE}
        </DialogDescription>

        <div className="aspect-video w-full overflow-hidden rounded-xl border border-border-default bg-black">
          <iframe
            src={WELCOME_VIDEO_EMBED_URL}
            title="Welcome from the founders"
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="w-full rounded-xl bg-accent-primary py-3 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99]"
        >
          Let&apos;s go
        </button>
      </DialogContent>
    </Dialog>
  )
}
