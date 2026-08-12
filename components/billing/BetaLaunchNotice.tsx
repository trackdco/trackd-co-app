"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import { markBetaNoticeSeen } from "@/lib/billing/betaNoticeStore";

/**
 * THE ONE-TIME NOTICE. What happens to the people who were already here.
 *
 * ~90 accounts have used the whole of Trackd for free, some for two months, and
 * agreed to nothing. This is the only thing that tells them the arrangement has
 * changed, so it is a modal rather than a banner: a banner is a glance, and this
 * is the one message that must not be glanced past.
 *
 * It appears ONCE, ever (see `betaNoticeStore.ts`), and it appears whether the
 * account got the comp or the fortnight — a friend who has been given Trackd for
 * good should be told that, not left to work out from silence that nothing
 * happened to them.
 *
 * ## It is rendered by the SERVER's decision, from a cookie
 *
 * The dashboard reads the cookie in `cookies()` and does not render this at all
 * if it has been seen. The alternative — mount it always and let the client hide
 * it — is what the trial banner did, and a cold review measured that as a
 * ~166ms paint of an already-dismissed billing notice on every load. As a MODAL
 * that would be a dialog flashing across the screen every time the app opened.
 *
 * ## Nothing here can be got wrong by dismissing it
 *
 * There is one button and it closes. The notice is information, not a decision:
 * nothing is bought, nothing is agreed, and the grace period runs whether it is
 * read or not. Escape and the backdrop close it too, and all three mark it seen,
 * because a notice that reappears until it is dismissed the "right" way is a
 * notice that reappears.
 *
 * ## ⚠️ ONE PERSON THIS NEVER REACHES, and it is accepted
 *
 * Somebody who does not open the app AT ALL during their fourteen days. It
 * renders only for an ACTIVE entitlement, so once the grace has lapsed there is
 * nothing left to announce and they meet the read-only pop-up instead, cold.
 *
 * Keeping it alive past the expiry would mean telling somebody "you've got until
 * 27 Aug to decide" on 3 Sep, which is worse than saying nothing. The pop-up
 * explains the state they are actually in and offers the way out, which is what
 * that person needs. Email is the right channel for reaching somebody who is not
 * opening the app, and there is none wired for this.
 */
/** Never notifies: whether a browser exists cannot change after hydration. */
const subscribeNever = () => () => {};

export function BetaLaunchNotice({
  userId,
  /** Formatted server-side in the user's own timezone. Null for a comp. */
  endsOn,
  /** True when this account has been given Trackd for good. */
  isComp,
}: {
  userId: string;
  endsOn: string | null;
  isComp: boolean;
}) {
  const [open, setOpen] = useState(true);
  /**
   * ⚠️ NOTHING RENDERS UNTIL AFTER MOUNT, AND THIS IS NOT A STYLE CHOICE.
   *
   * This component returns `null` on the server (there is no `document`) and a
   * PORTAL on the client. Those are different trees at the same position, and a
   * cold review measured what React does about it: it discards the hydration and
   * REBUILDS THE WHOLE APP SHELL.
   *
   *     control (notice suppressed)  <main> created ONCE,  t=818ms, 0 errors
   *     treatment (notice renders)   <main> created TWICE, t=629ms and t=847ms,
   *                                  1 hydration error naming <BetaLaunchNotice>
   *
   * Every dashboard load, for every one of the ~90 beta accounts, until they
   * dismiss it. That is the same class of defect as the trial banner's 166ms
   * paint and 68px jump that this branch already paid to fix, and larger: the
   * banner re-rendered itself, this re-renders the entire application.
   *
   * A mount flag makes the server render and the FIRST client render agree
   * (both nothing), and the portal appears on the second.
   *
   * `useSyncExternalStore` rather than `useState` + an effect: setState in an
   * effect body is a cascading render and the lint rule rightly refuses it. This
   * is the same idiom `components/onboarding/flow.tsx` uses for exactly the same
   * question, and it is the sanctioned way to ask "is there a browser yet"
   * without a setState in an effect.
   */
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    markBetaNoticeSeen(userId);
    setOpen(false);
  }, [userId]);

  /**
   * The same focus contract `CancelSubscription` and the read-only pop-up both
   * carry, and for the same reason: `aria-modal="true"` beside no focus
   * management is a lie told to assistive tech about a dialog it never
   * announced.
   */
  useEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    // An ENABLED button, falling back to the dialog. `querySelector("button")`
    // returned a disabled one during the pending window, and `.focus()` on a
    // disabled button is a no-op — so focus stayed wherever the click left it.
    (node?.querySelector<HTMLElement>("button:not([disabled])") ?? node)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const focusable = Array.from(
        node.querySelectorAll<HTMLElement>("button:not([disabled])"),
      );
      /**
       * ⚠️ NOTHING ENABLED IS NOT PERMISSION TO LEAVE.
       *
       * This used to `return`, and a cold review measured what that cost during
       * the ~2s "Working…" window: both buttons go `disabled`, the clicked one
       * drops focus to `<body>`, `button:not([disabled])` matches ZERO, and the
       * handler stood aside. Five Tab presses then walked out of a dialog still
       * claiming `aria-modal="true"` — onto the trigger behind the backdrop, the
       * Stripe portal row, "Back to profile" and the Dashboard tab.
       *
       * That is the exact defect this effect's own comment says was fixed. It
       * was fixed for the IDLE state only.
       *
       * Focus goes to the dialog itself instead, which is `tabIndex={-1}` and so
       * is a legitimate focus target. It comes back to a button the moment one
       * is enabled again.
       */
      if (focusable.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!mounted || !open || typeof document === "undefined") return null;

  /**
   * `z-[60]` is THE APP'S MODAL LAYER — the same one `SignOutConfirm`,
   * `BlockDeleteConfirm`, `PhysicalCard`, `FirstRunDisclaimer` and the read-only
   * pop-up all use, above the `z-40` nav and the FAB's `z-45` scrim.
   *
   * It was briefly `z-[70]`, which is the TOAST layer (`amber-notice`), and
   * would have put a modal in front of the notifications it is meant to sit
   * above.
   *
   * It cannot collide with the read-only pop-up: this renders only for an
   * entitlement whose source is `comp`, and `currentEntitlement` returns only
   * ACTIVE ones, so anybody seeing this can still write and the pop-up has
   * nothing to fire on.
   */
  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[60] grid place-items-center bg-overlay-backdrop p-6 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
      onClick={close}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="beta-notice-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl border border-border-default bg-bg-surface p-5 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
      >
        <h2 id="beta-notice-title" className="text-base font-medium text-foreground">
          {isComp ? "Trackd is yours, for good" : "Trackd is going paid"}
        </h2>

        {isComp ? (
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            Trackd now costs money for new users. Yours doesn&apos;t, and it
            won&apos;t. Thanks for being here early.
          </p>
        ) : (
          <>
            {/* WHAT THEY KEEP, FIRST. Somebody reading this is asking "am I
                about to lose two months of logs", and answering that before
                anything about money is the only order that is not a threat. */}
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              You&apos;ve been using Trackd for free while we built it, and
              everything you&apos;ve logged is yours to keep. That doesn&apos;t
              change.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              {/* THE DATE, PLAINLY. It is the only fact here that requires an
                  action, so it is the only one in the foreground colour. */}
              From now on Trackd is a paid app. You&apos;ve got{" "}
              <span className="text-foreground">
                {endsOn ? `until ${endsOn}` : "two weeks"}
              </span>{" "}
              on us to decide.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              {/* AND WHAT "no" COSTS, said out loud rather than discovered.
                  Somebody who reads this and does nothing should not be
                  surprised by anything that happens next. */}
              After that you can still open Trackd and read everything in it. You
              just won&apos;t be able to log anything new until you subscribe.
              Nothing gets deleted.
            </p>
          </>
        )}

        <button
          type="button"
          onClick={close}
          className="mt-5 w-full rounded-2xl border border-border-default bg-bg-surface-raised py-3 text-sm text-foreground outline-none transition-colors hover:bg-bg-surface focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* One button, and it is not "Subscribe". This is a notice, and
              putting the ask on it would make the notice a sales pitch and the
              date a threat. The pop-up with the prices is one blocked action
              away, and /billing is on Profile. */}
          Got it
        </button>
      </div>
    </div>,
    document.body,
  );
}
