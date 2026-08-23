"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { createPortal } from "react-dom";

import { Confetti } from "@/components/onboarding/confetti";
import { Mascot } from "@/components/onboarding/mascot";
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
   * ⚠️ IF IT CANNOT NAME THE DATE, IT DOES NOT RENDER. The fallback is DELETED,
   * not weakened.
   *
   * This read `{endsOn ? \`until ${endsOn}\` : "two weeks"}` — a `??`-shaped
   * fallback that converts "I could not resolve this account's expiry" into a
   * confident claim about how long they have. That is standing rule 0's exact
   * syntax, and `04` §3.2 already ruled the class: the dateless terms variant was
   * DELETED rather than kept, because "a version that cannot name the date is not
   * a weaker acceptable variant, it is a version that must not render".
   *
   * Not rendering is a known-acceptable outcome rather than a new one: somebody
   * who never opens the app gets no notice at all, and the founder accepted that.
   *
   * ⚠️ The comp variant states no date, so it is unaffected — a free-for-life
   * account HAS no expiry, which is the whole distinction `isComp` carries.
   */
  const cannotNameTheDate = !isComp && !endsOn;
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

  const close = useCallback(() => {
    markBetaNoticeSeen(userId);
    setOpen(false);
  }, [userId]);

  /**
   * D31's second control, and Q84's destination: the PRICE LIST.
   *
   * ⚠️ THE SAME DESTINATION `05`'s "Choose a plan" uses (D28, "one shared
   * destination"), so the two surfaces cannot drift into sending people to two
   * different places to do one thing. Not the card screen: no plan has been
   * chosen, and asking for a card for a plan nobody picked is the wrong question.
   *
   * ⚠️ IT DISMISSES FIRST. The notice shows once, and somebody who taps through
   * and comes back should not meet it again — `08` carries the standing route via
   * its subscribe row (D31), which is what makes a one-shot notice safe.
   *
   * ⚠️ A FULL DOCUMENT LOAD. The onboarding flow reads `?step=` and its session at
   * mount and on `popstate` only, so a soft navigation would change the address
   * bar and leave this app's tree on screen — the defect spec w2b-14 records.
   */
  const setUpMyPlan = useCallback(() => {
    markBetaNoticeSeen(userId);
    /**
     * ⚠️ `/plans`, NOT `/onboarding?step=plans` (Adrian, 2026-08-23).
     *
     * D28's "one shared destination" is unchanged — every surface that offers a
     * plan still points at ONE place. That place is now the billing-side route,
     * because everybody arriving from these surfaces ALREADY HAS AN ACCOUNT and
     * the onboarding flow was showing them a sign-up progress bar.
     *
     * Still a full document load: the flow reads its step at mount, so a soft
     * navigation would change the address bar and leave this tree on screen.
     */
    window.location.assign("/plans");
  }, [userId]);

  if (!mounted || !open || cannotNameTheDate || typeof document === "undefined") {
    return null;
  }

  /**
   * ⚠️ THE DIALOG IS ITS OWN COMPONENT, AND THAT IS THE FIX (4.2).
   *
   * The focus contract used to live in an effect HERE, with deps `[open, close]`.
   * It never ran against a real node:
   *
   *   `open` starts `true`, so it never changes;
   *   `mounted` is false until hydration, so the first render returns null;
   *   `dialogRef.current` is therefore null when the effect fires;
   *   and the deps never change again, so it never re-runs.
   *
   * The result was a `role="dialog" aria-modal="true"` that never took focus and
   * never trapped Tab — focus stayed on `<body>` and Tab walked the dashboard
   * behind the backdrop. This component's own contract calls that "a lie told to
   * assistive tech", and it is the once-ever modal every comp and beta account
   * meets on launch morning.
   *
   * ⚠️ SPLIT RATHER THAN ADDING `mounted` TO THE DEPS, which would also have
   * worked. This removes the CLASS instead of the instance: an effect that
   * depends on a ref existing cannot fire before the ref exists if the component
   * holding it only mounts when the ref will be rendered. Three of the four
   * billing portals already prove the shape — `ReadOnlyGate`'s `ReadOnlyPopup` is
   * the closest, and this is deliberately the same arrangement.
   */
  return (
    <BetaLaunchDialog
      isComp={isComp}
      endsOn={endsOn}
      close={close}
      setUpMyPlan={setUpMyPlan}
    />
  );
}

/**
 * The portal body. **Mounted only when the notice is open**, so its focus effect
 * runs on mount with a live ref — see the note in {@link BetaLaunchNotice}.
 */
function BetaLaunchDialog({
  isComp,
  endsOn,
  close,
  setUpMyPlan,
}: {
  isComp: boolean;
  endsOn: string | null;
  close: () => void;
  setUpMyPlan: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  /**
   * The same focus contract `CancelSubscription` and the read-only pop-up both
   * carry, and for the same reason: `aria-modal="true"` beside no focus
   * management is a lie told to assistive tech about a dialog it never
   * announced.
   */
  useEffect(() => {
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
  }, [close]);

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
        /* `relative` + `overflow-hidden` so the confetti is clipped to the card
           rather than raining down the whole viewport. It is a gift inside a
           box, not weather. */
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-border-default bg-bg-surface p-5 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
      >
        {/* ⚠️ ONLY FOR THE COMP VARIANT, and that is the whole point.
            The other variant tells somebody their free access is ending in a
            fortnight. Confetti over THAT would be the app celebrating at
            somebody it is about to charge, which is the single worst thing this
            screen could do.

            The shared `Confetti` from the onboarding flow, unchanged: one shot
            over ~2.2s, `pointer-events-none`, and it collapses to nothing under
            `prefers-reduced-motion` through the opt-out in `globals.css`.
            `ui-context.md` bans ambient particles; the line is whether it keeps
            going after you have looked at it, and this does not. */}
        {isComp ? <Confetti /> : null}

        {/**
          * ⚠️ KYLE, FLEX POSE — AND THE SIGNED COPY IS UNTOUCHED BY HIM
          * (Adrian, 2026-08-23).
          *
          * The ask was "bigger title, and Kyle somewhere if we can", chosen over
          * emoji. That distinction is load-bearing: the BODY of this notice is
          * signed prose pinned character for character by `graceCopyPin.test.ts`,
          * so emoji in the text would have needed re-signing. Kyle is an IMAGE
          * beside the text, so every signed line is byte-identical and the pin
          * keeps passing untouched.
          *
          * Flex rather than thumbs: this notice tells early users they were here
          * first and have two more weeks on us. Flex reads as celebrating them.
          *
          * ⚠️ HE IS A VIAL, NEVER A JAR — and he appears ONLY here among the
          * billing surfaces. Not on the read-only pop-up, the declined banner or
          * the cancel dialog: a mascot beside "your card failed" reads as mockery.
          */}
        <div className="relative mb-2 flex justify-center">
          <Mascot pose="flex" size={96} />
        </div>

        {/* ⚠️ APPROVED COPY, CHARACTER FOR CHARACTER (06 §3.6). A fix WITHHOLDS a
            line, it never rewords one. No em dash. Kyle is a vial, never a jar.
            "Read only" is the exact phrase. */}
        <h2
          id="beta-notice-title"
          className="relative text-lg font-medium text-foreground"
        >
          {isComp ? "Trackd Co is yours. For life." : "Trackd Co is going paid"}
        </h2>

        {isComp ? (
          <div className="relative">
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              Adrian and Angus have given you free access for life.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              It costs money for everyone else from today. Not for you, not now
              and not later. No card, no renewal, nothing to cancel.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              You were here for the version that barely worked, and you stayed.
              That&apos;s worth more than a subscription.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              You&apos;ve been using it free while we built it, and everything
              you&apos;ve logged is yours to keep. That doesn&apos;t change.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              {/**
               * ⚠️ THE DATE COMES FROM THE ENTITLEMENT ROW AND IS COMPUTED FROM
               * NOTHING. `dashboard/page.tsx` formats `activeUntil` server-side
               * in the user's stored timezone and hands it here.
               *
               * D86 sets that row at apply time on launch morning, so a notice
               * that READS it is automatically right whenever launch happens,
               * and one that computed anything would be wrong the moment the
               * date moved. This is the single place the re-dating migration and
               * the copy could silently disagree.
               *
               * ⚠️ AND IT MUST NEVER SHOW THE CLAMPED INSTANT.
               * `app/onboarding/page.tsx` deliberately runs `resolveFreeTime`
               * and shows the clamp, because that screen states a CHARGE date
               * and has to match what Stripe will hold. The clamp only moves
               * LATER, so showing it here would promise access up to 48 hours
               * beyond `active_until` — and `05`'s gate lapses AT
               * `active_until`. Charge date is clamped; access-ends date is the
               * row.
               *
               * "two more weeks" is SIGNED PROSE and does not derive from
               * `BETA_GRACE_DAYS` (Adrian, 2026-08-17). Deriving it would mean
               * generating unsigned wording for values nobody approved. The
               * constant is PINNED to it by a test instead, so it cannot drift
               * away from the sentence silently.
               */}
              From today it&apos;s a paid app, and because you were here early
              you&apos;ve got two more weeks on us, until{" "}
              <span className="text-foreground">{endsOn}</span>.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              After that your account goes read only. You&apos;ll still see
              everything you&apos;ve logged, you just can&apos;t add to it.
              Nothing gets deleted.
            </p>
          </>
        )}

        {/**
         * D32, counsel-advised and founder-signed, carried character for
         * character, on BOTH variants — a comped account is still a user bound
         * by the terms.
         *
         * ⚠️ NOTHING HERE IS AN ACCEPT BUTTON. Acceptance is continued use after
         * notice, so neither control changes its label, behaviour or meaning,
         * and neither may be styled as one.
         */}
        <p className="relative mt-4 text-[11px] leading-relaxed text-text-subtle">
          By continuing to use Trackd, you agree to the updated{" "}
          <Link
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-2 hover:text-text-muted"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline underline-offset-2 hover:text-text-muted"
          >
            Privacy Policy
          </Link>
          .
        </p>

        {/**
         * D31, re-decided: BOTH controls ship on the beta variant.
         *
         * ⚠️ THE HIERARCHY IS THE DECISION, NOT THE BUTTON COUNT (§3.6). The
         * screen's credibility rests on applying no pressure, so the DISMISSAL
         * reads as the expected action and the route to checkout is available
         * without being urged. A secondary control is never amber.
         *
         * The comp variant keeps one button and it is not "Got it": that is what
         * you say to a warning, and this is not a warning.
         */}
        <div className="relative mt-5 flex gap-3">
          <button
            type="button"
            onClick={close}
            /* `relative` on the row, so it stacks above the confetti layer. The
               burst is `pointer-events-none` so it could never have swallowed a
               tap, but a button drawn UNDER falling pieces reads as decoration. */
            className={`${isComp ? "w-full" : "flex-1"} rounded-2xl bg-accent-primary py-3 text-sm font-medium text-bg-base outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring`}
          >
            {isComp ? "Thank you" : "Got it"}
          </button>
          {isComp ? null : (
            <button
              type="button"
              onClick={setUpMyPlan}
              className="flex-1 rounded-2xl border border-border-default py-3 text-sm text-foreground outline-none transition-colors hover:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring"
            >
              Set up my plan
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
