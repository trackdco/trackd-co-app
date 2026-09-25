/**
 * The first-run hint (build-brief-final §3.1): a bubble under the first dose,
 * its arrow pointing up at the circle, with a tiny looping preview of a tap on
 * a circle. It goes after the first tap and never comes back (the caller owns
 * that). Words are the brief's; he picked the bubble.
 *
 * Reduced motion: the preview holds still, the words do the teaching.
 */
export function FirstRunBubble() {
  return (
    <div className="first-run-bubble relative mt-1 mb-1.5 ml-[-2px] flex w-fit max-w-full items-center gap-2.5 rounded-xl bg-bg-surface-raised py-2 pr-3.5 pl-2.5 text-[13px] text-foreground" role="note">
      {/* The arrow, pointing up at the circle it is about. */}
      <span aria-hidden className="absolute -top-[5px] left-[11px] h-2.5 w-2.5 rotate-45 rounded-[2px] bg-bg-surface-raised" />
      <span aria-hidden className="first-run-preview relative flex h-[22px] w-[22px] shrink-0 items-center justify-center">
        <span className="first-run-ring absolute inset-0 rounded-full border border-text-primary" />
        <span className="first-run-tap h-2.5 w-2.5 rounded-full bg-text-primary" />
      </span>
      Tap the circle to log it.
    </div>
  )
}
