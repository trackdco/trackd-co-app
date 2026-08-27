"use client";

import { useEffect, useRef } from "react";

import { X } from "@/components/icons";
import { STAYING_NOTICE_TITLE } from "@/lib/billing/noticeCopy";

/**
 * The element at the top of `/billing` this card is portaled into.
 *
 * Declared beside the card rather than beside the page so the two cannot drift:
 * a renamed slot with a stale portal target is a card that silently never
 * appears, and nothing would fail to compile.
 */
export const STAYING_NOTICE_SLOT = "billing-staying-notice";

/**
 * "Glad you're staying." — the confirmation after somebody changes their mind.
 *
 * ## It is a response to a moment, and it lives exactly as long as the moment
 *
 * Held in `CancelSubscription`'s own state and rendered into the slot at the top
 * of Billing. It is NOT persisted, not stored in a cookie, and not derived from
 * the subscription: leaving the screen unmounts the owner and the card is gone,
 * which is the approved behaviour rather than a limitation to work around. If it
 * ever needs `sessionStorage` to survive something, the something is the bug.
 *
 * ## The amber, and its limits
 *
 * `03-cancel-flow.md` §3.10 permits amber here and only here: a confirmation of
 * a live state change is what `ui-context.md` says amber is for. It is carried
 * by the hairline and the wash — the same treatment the in-app amber callout
 * already uses — and by nothing else. **The text is not amber and the dismiss
 * control is not amber**, because a wash plus a border plus amber text on one
 * element is the blanket amber the style guide names as the vibe-coded tell.
 * There is no amber button, no amber call to action and no amber tab in here.
 *
 * `role="status"` rather than `alert`: nothing is wrong, and an assertive live
 * region would interrupt a screen reader to say so.
 */
export function StayingNotice({
  /** Drives the one-word branch in the second line. §3.10, decided with D21/D22. */
  isTrial,
  onDismiss,
}: {
  isTrial: boolean;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  /**
   * ⚠️ IT SCROLLS ITSELF INTO VIEW, OR ON A SMALL PHONE NOBODY SEES IT.
   *
   * The card sits at the top of Billing (§3.10) while the control that produces
   * it sits below the plan card. At 320x568 the screen is 805px tall, so
   * "Keep my Pro plan" is below the fold and scrolling down to it is the
   * ordinary path — and a cold review measured where the card then landed:
   * `top: -129`, entirely above the viewport. The only feedback the user got was
   * the trigger relabelling itself to "Cancel my trial", which reads like the
   * resume failed, or worse like they had just cancelled. A confirmation nobody
   * can see is not a confirmation.
   *
   * `block: "nearest"` so it is the least movement that shows the card, and at
   * 390x844 it is already in view and this does nothing at all. §3.10 fixes
   * WHERE the card sits; it does not require the screen to stay put while the
   * card appears somewhere the reader is not looking.
   *
   * An effect, and legitimately so: this is a DOM side effect on mount, not
   * state derived during render.
   */
  useEffect(() => {
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "nearest" });
  }, []);

  return (
    <div
      ref={ref}
      /* The fade collapses to nothing under `prefers-reduced-motion`, the same
         idiom the cancel dialog uses two files over. */
      /* `mt-6` and no bottom margin: the plan card's own `mt-6` supplies the gap
         below, so the slot above is weightless when there is no card in it. */
      /**
       * ⚠️ `scroll-mt` KEEPS THE SCROLL CLEAR OF THE STATUS BAR.
       *
       * The app is `viewportFit: "cover"`, so the OS draws its own bar over the
       * top of the page. `block: "nearest"` parks the card at exactly viewport
       * top 0, and a cold review measured the result at 320x568: the headline
       * sat at y 15-35, entirely inside a 47px band (59px standalone), with the
       * dismiss control under it too. Scrolling it into view is only useful if
       * what it scrolls to is not covered.
       *
       * `scroll-margin-top` is respected by `scrollIntoView`, so the stop lands
       * the inset plus a little short of the band.
       */
      className="mt-6 flex items-start gap-3 rounded-2xl border border-accent-amber/40 bg-accent-amber/10 px-4 py-3.5 scroll-mt-[calc(env(safe-area-inset-top)+2.5rem)] animate-in fade-in-0 duration-200 motion-reduce:animate-none"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{STAYING_NOTICE_TITLE}</p>
        <p className="mt-0.5 text-sm text-text-muted">
          Your {isTrial ? "trial" : "subscription"} will carry on as usual.
        </p>
      </div>
      {/* 44px, like every other tap target, and pulled back into the padding so
          the target is bigger than the glyph without moving the layout. */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-my-1.5 -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
