"use client"

import { useState } from "react"
import { Check, Loader2, MessageSquarePlus } from "lucide-react"

import { Textarea } from "@/components/ui/textarea"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useSheetDrag } from "@/components/home/useSheetDrag"
import { SHEET_TITLE } from "@/lib/ui-presets"
import { submitBetaFeedback } from "@/lib/db/feedback"

const MAX_LEN = 4000
const SUCCESS_MS = 1400

/**
 * "Beta notes & feedback" — the + menu's beta-only sheet for sending bugs and
 * ideas straight to the founders. Free-text note → one `beta_feedback` row (with
 * the route the tester was on, for context); founders read them in /admin. A
 * brief green "Thanks" state confirms, then auto-dismisses. Signed-out / `anon`
 * can't submit (no session to attribute it to). Best-effort: a failed send keeps
 * the sheet open with the typed note intact so it can be retried.
 */
export function FeedbackSheet({
  open,
  onOpenChange,
  userId,
  title = "Beta notes & feedback",
  description = "Found a bug, or have an idea? Tell us — it comes straight to the founders.",
  placeholder = "What happened, or what would make this better?",
  submitLabel = "Send to founders",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  /** Copy overrides — the + menu uses the beta defaults; Profile uses general wording. */
  title?: string
  description?: string
  placeholder?: string
  submitLabel?: string
}) {
  const { cardRef, handleProps, cardStyle } = useSheetDrag(() => onOpenChange(false), open)
  const signedOut = !userId || userId === "anon"

  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset to a clean slate each time the sheet opens.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setMessage("")
      setBusy(false)
      setSent(false)
      setError(null)
    }
  }

  const canSend = !signedOut && message.trim().length > 0 && !busy

  async function handleSend() {
    if (!canSend) return
    setBusy(true)
    setError(null)
    const res = await submitBetaFeedback(message, {
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    })
    setBusy(false)
    if (res.ok) {
      setSent(true)
      window.setTimeout(() => onOpenChange(false), SUCCESS_MS)
    } else {
      setError("Couldn't send that just now. Check your connection and try again.")
    }
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
          className="relative flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl border-t border-border-default bg-bg-surface shadow-lg"
        >
          <div
            {...handleProps}
            className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          >
            <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
          </div>

          <SheetTitle className="sr-only">{title}</SheetTitle>
          <SheetDescription className="sr-only">
            Send a bug report or idea straight to the Trackd founders.
          </SheetDescription>

          <div className="flex-1 overflow-y-auto px-6 pb-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-surface-raised text-text-muted">
                <MessageSquarePlus className="h-4 w-4" aria-hidden />
              </span>
              <h2 className={SHEET_TITLE}>
                {title}
              </h2>
            </div>
            <p className="mt-2 text-sm text-text-muted">{description}</p>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
                Your note
              </span>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_LEN))}
                disabled={signedOut || busy}
                placeholder={placeholder}
                rows={7}
                aria-label="Your feedback"
                className="min-h-[9.5rem] rounded-xl border-border-default bg-bg-input text-sm leading-relaxed dark:bg-bg-input"
              />
            </label>

            {signedOut ? (
              <p className="mt-3 px-1 text-sm text-text-muted">
                Sign in to send feedback.
              </p>
            ) : (
              error && <p className="mt-3 px-1 text-sm text-state-error">{error}</p>
            )}
            <div className="h-2" />
          </div>

          {/* Action bar */}
          <div className="flex shrink-0 gap-3 border-t border-border-default px-6 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-xl border border-border-strong py-3 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!canSend}
              className="flex flex-[1.6] items-center justify-center gap-2 rounded-xl bg-accent-primary py-3 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {busy ? "Sending…" : submitLabel}
            </button>
          </div>

          {/* Success state — the note is already saved; tapping just dismisses. */}
          {sent && (
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Feedback sent"
              className="animate-shortcut-fade absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-t-3xl bg-accent-green text-bg-base"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-base/15">
                <Check className="h-9 w-9" strokeWidth={2.5} aria-hidden />
              </span>
              <span className="text-base font-semibold">Thanks — got it</span>
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
