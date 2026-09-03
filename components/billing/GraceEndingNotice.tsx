"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { createPortal } from "react-dom";

import { recordDocumentAcceptance } from "@/app/(app)/legal-acceptance";
import { markGraceNoticeSeen } from "@/lib/billing/betaNoticeStore";
import { GRACE_CONTINUED_USE_PARTS, GRACE_NOTICE_PARTS } from "@/lib/billing/noticeCopy";

/**
 * THE SEVEN-DAY NOTICE. The beta grace is running out and nobody said so.
 *
 * `06`'s launch notice announced the fortnight. `07`'s reminder opens two days
 * out. Between them sat a twelve-day silence, and on 3 Sep 2026 the whole beta
 * cohort was in it: 82 accounts dated `2026-09-10T04:00:11Z`, one week from
 * read-only, five of whom had ever seen a screen about billing at all.
 *
 * Adrian, 2026-09-03: a one-time popup, telling them.
 *
 * ## It is deliberately the launch notice's twin
 *
 * Same portal, same `z-[60]`, same mount flag, same focus contract, same
 * dismissal semantics, same acceptance write. Every one of those was paid for by
 * a measured defect on `BetaLaunchNotice`, and the reasoning is recorded there
 * in full rather than copied here. What differs is the copy, the icon and the
 * entrance.
 *
 * ## ⚠️ IT SUPERSEDES THE LAUNCH NOTICE, IT DOES NOT QUEUE BEHIND IT
 *
 * 77 of the 82 never dismissed the launch notice, so both were pending for
 * almost the whole cohort. The dashboard renders this INSTEAD (see
 * `showGraceNotice`), for two reasons:
 *
 *   - two modals across two loads is a bad morning, and
 *   - the older one says "you've got two more weeks on us, until 10 Sep 2026",
 *     which on 3 Sep is a fortnight of goodwill announced with a week left in
 *     it, and on 9 Sep is "two more weeks" about tomorrow.
 *
 * ⚠️ Superseding is only safe because this carries the acceptance too. Terms
 * v2.0 §25 makes continued use after notice the acceptance, and skipping the
 * older screen must not skip recording it. See {@link close}.
 *
 * ## ⚠️ IT DOES NOT CANCEL THE FINAL-STRETCH REMINDER (Adrian, 2026-09-03)
 *
 * Dismissing this leaves `07`'s two-days-out banner and push completely alone,
 * so somebody who reads this today still gets the last call on the 8th. This is
 * the heads-up; that is the deadline. Nothing here writes the trial notice's
 * cookie, and the two have separate jars for exactly that reason.
 */
/** Never notifies: whether a browser exists cannot change after hydration. */
const subscribeNever = () => () => {};

export function GraceEndingNotice({
  userId,
  /** Whole local days until the grace ends, resolved server-side in their zone. */
  daysLeft,
  /** The full date, formatted server-side. "10 Sept 2026" (en-AU renders four letters). */
  endsOn,
  /** The same date without the year, for the second paragraph. "10 Sept". */
  endsOnShort,
  /** The full grace length, so the count can animate down onto what is left. */
  countFrom,
}: {
  userId: string;
  daysLeft: number;
  endsOn: string;
  endsOnShort: string;
  countFrom: number;
}) {
  const [open, setOpen] = useState(true);

  /**
   * ⚠️ IF IT CANNOT NAME THE DATE, IT DOES NOT RENDER, and the fallback is
   * DELETED rather than weakened.
   *
   * The same rule the launch notice carries, and `04` §3.2 already ruled the
   * class: "a version that cannot name the date is not a weaker acceptable
   * variant, it is a version that must not render". A notice whose entire
   * content is a deadline has nothing truthful to say without one.
   *
   * The server should never construct this component without them, so reaching
   * here means something upstream is wrong. Not rendering is the known-acceptable
   * outcome; inventing a vague "soon" is not.
   */
  const cannotNameTheDate = !endsOn || !endsOnShort || !Number.isFinite(daysLeft);

  /**
   * ⚠️ NOTHING RENDERS UNTIL AFTER MOUNT. `BetaLaunchNotice` documents what the
   * alternative measured: a server render of `null` beside a client render of a
   * portal made React discard the hydration and REBUILD THE WHOLE APP SHELL,
   * `<main>` created twice, on every dashboard load for every account holding
   * the notice.
   *
   * `useSyncExternalStore` rather than `useState` + an effect, because setState
   * in an effect body is a cascading render and the lint rule refuses it.
   */
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  const close = useCallback(() => {
    /**
     * ⚠️ THE ACCEPTANCE IS RECORDED, AND IT IS NOT AWAITED.
     *
     * Load-bearing here in a way it is not on the launch notice: this notice
     * SUPERSEDES that one, so for 77 accounts this is the only screen that will
     * ever give them notice of the v2.0 documents. If it did not write, those
     * accounts would keep a 1.3 record for ever and the supersede would have
     * quietly dropped a legal step.
     *
     * ⚠️ NOT AWAITED, AND THE ORDER MATTERS. The dismissal happens regardless. A
     * database problem must never stop somebody closing a notice, and the action
     * swallows its own failures for the same reason: a failed write leaves NO
     * row, which is the honest result rather than one claiming an acceptance we
     * could not record.
     *
     * ⚠️ It writes the Terms and the Privacy Policy ONLY. Never the health-data
     * consent: Privacy v2.0 §17 says continued use is never treated as consent
     * to health-data processing, which is exactly why the sentence this notice
     * shows says the other two documents have CHANGED rather than that they are
     * accepted. See {@link GRACE_CONTINUED_USE_PARTS}.
     */
    void recordDocumentAcceptance();
    markGraceNoticeSeen(userId);
    setOpen(false);
  }, [userId]);

  /**
   * ⚠️ `/plans`, AND IT DISMISSES FIRST.
   *
   * The same destination `05`'s pop-up, `06`'s notice and `/billing`'s subscribe
   * row all use (D28, "one shared destination"), so no two surfaces send people
   * to different places to do one thing. Not `/checkout`: no plan has been
   * chosen, and asking for a card for a plan nobody picked is the wrong question.
   *
   * ⚠️ A FULL DOCUMENT LOAD, deliberately. The plan screen mounts the shared
   * billing flow, which reads its step at mount, so a soft navigation would
   * change the address bar and leave this tree on screen (spec w2b-14).
   *
   * ⚠️ Adrian has approved turning this into a second face of the card instead,
   * so nobody is thrown off a modal about losing access. That is a separate
   * piece: it reverses D28's selector removal, touches `ReadOnlyGate` (the
   * provider above the whole logged-in app) and needs the 3D Secure return path
   * built rather than discovered. It is NOT in this change.
   */
  const choosePlan = useCallback(() => {
    markGraceNoticeSeen(userId);
    window.location.assign("/plans");
  }, [userId]);

  if (!mounted || !open || cannotNameTheDate || typeof document === "undefined") {
    return null;
  }

  /**
   * ⚠️ THE DIALOG IS ITS OWN COMPONENT, and that is not a tidy-up.
   *
   * `BetaLaunchNotice` shipped its focus contract as an effect in the outer
   * component, where it could never run against a real node: `open` starts true,
   * `mounted` is false on the first render, so the ref was null when the effect
   * fired and the deps never changed again. The result was a `role="dialog"
   * aria-modal="true"` that never took focus and never trapped Tab.
   *
   * A component holding the ref cannot mount before the ref will be rendered, so
   * the class of defect is absent rather than the instance fixed.
   */
  return (
    <GraceEndingDialog
      daysLeft={daysLeft}
      endsOn={endsOn}
      endsOnShort={endsOnShort}
      countFrom={countFrom}
      close={close}
      choosePlan={choosePlan}
    />
  );
}

/**
 * The portal body. **Mounted only when the notice is open**, so its focus effect
 * runs on mount with a live ref.
 */
function GraceEndingDialog({
  daysLeft,
  endsOn,
  endsOnShort,
  countFrom,
  close,
  choosePlan,
}: {
  daysLeft: number;
  endsOn: string;
  endsOnShort: string;
  countFrom: number;
  close: () => void;
  choosePlan: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  /**
   * ⚠️ A CLOSE NEEDS THE PRESS TO HAVE STARTED OUTSIDE THE CARD.
   *
   * Selecting the headline and dragging off the edge dispatches `click` on the
   * common ancestor, so the card's `stopPropagation` never sees it and the
   * backdrop's handler fired. That matters more here than on an ordinary modal:
   * `close()` writes the once-ever cookie AND records the legal acceptance, so
   * an accidental text-selection drag spends the only sighting of the only
   * screen 77 accounts are going to get.
   */
  const pressStartedOutside = useRef(false);

  /**
   * The count settles onto the real figure instead of appearing.
   *
   * ⚠️ IT STARTS AT THE TRUTH AND STAYS THERE IF ANYTHING GOES WRONG. `shown`
   * initialises to `daysLeft`, so a reduced-motion user, a browser without
   * `requestAnimationFrame` firing, and an unmount mid-animation all leave the
   * correct number on screen. The animation can only ever be an embellishment on
   * top of an already-correct render, never the thing that produces it.
   *
   * ⚠️ NO setState IN THE EFFECT BODY. The first value is written inside the rAF
   * callback, which is why this is a frame-driven interpolation rather than the
   * obvious `setShown(countFrom)` followed by an interval.
   */
  const [shown, setShown] = useState(daysLeft);

  useEffect(() => {
    /**
     * ⚠️ NOT ON THE LAST TWO DAYS, and this was MEASURED (cold review).
     *
     * The count starts at `countFrom` (14), so on the final morning the headline
     * read "Your free run will end in 14 days" for 625ms above a paragraph
     * already saying "After today your account will become read only". The card
     * contradicting itself about its own deadline is the exact thing
     * `graceEnding.ts` exists to prevent, and the wrong half is the one
     * PROMISING MORE TIME, which is the direction this project never allows.
     *
     * Nothing is lost: at 0 and 1 the headline is "today" and "tomorrow", which
     * carry no figure for a count to settle onto anyway.
     */
    if (daysLeft <= 1) return;
    if (countFrom <= daysLeft) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const DURATION = 900;
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / DURATION);
      // Eased, so it decelerates onto the figure rather than stopping dead.
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(countFrom - (countFrom - daysLeft) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [countFrom, daysLeft]);

  /**
   * The same focus contract `CancelSubscription`, the read-only pop-up and the
   * launch notice all carry: `aria-modal="true"` beside no focus management is a
   * lie told to assistive tech about a dialog it never announced.
   */
  useEffect(() => {
    const node = dialogRef.current;
    /**
     * ⚠️ THE DIALOG TAKES FOCUS, NOT THE FIRST BUTTON, and this was MEASURED
     * rather than reasoned about.
     *
     * The launch notice focuses its first enabled button, and copying that put
     * an amber `focus-visible` ring around "Got it" the instant the card opened
     * (seen at 402x700 and 360x560 in `/preview/grace-notice`). Two things wrong
     * with it, and the second is the serious one:
     *
     *   - it is a SECOND amber element on a card `ui-context.md` allows one live
     *     beat, and that beat is the count in the headline;
     *   - it rings the SECONDARY control, so the outlined dismiss reads as the
     *     selected one. That is precisely the hierarchy Adrian reversed.
     *
     * The modal opens on page load rather than on a tap, so there is no pointer
     * interaction for the browser's `:focus-visible` heuristic to suppress the
     * ring against. It shows on a real phone, not just under Playwright.
     *
     * Focusing the dialog itself satisfies the same contract: focus moves into
     * the modal, `aria-labelledby` announces it, and the Tab trap below keeps it
     * there. `tabIndex={-1}` is what makes it a legitimate target.
     */
    /**
     * ⚠️ `preventScroll`. The backdrop is a scroll container now, so focusing the
     * dialog asked the browser to scroll it into view and the card opened 5px
     * off the top at 360x560, clipping the icon on arrival. Focus still moves and
     * the trap is unaffected.
     */
    node?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const focusable = Array.from(
        node.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href]",
        ),
      );
      // ⚠️ NOTHING FOCUSABLE IS NOT PERMISSION TO LEAVE. The launch notice
      // measured five Tab presses walking out of a dialog still claiming
      // `aria-modal` while its buttons were disabled. The dialog is
      // `tabIndex={-1}` and so is a legitimate target.
      if (focusable.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      /**
       * ⚠️ `active === node` IS THE OPENING STATE AND IT COUNTS AS "AT THE START".
       *
       * Initial focus is the dialog itself, which is deliberately NOT in
       * `focusable`. So on the very first Shift+Tab neither `active === first`
       * nor `!node.contains(active)` matched (a node contains itself), nothing
       * was prevented, and the browser walked backwards out of the portal onto a
       * real dashboard control behind the backdrop, while `aria-modal="true"`
       * claimed nothing outside existed. Driven in Chromium at 402x700.
       *
       * The forward branch needs no equivalent: from the dialog, a plain Tab
       * lands on the first control by itself.
       */
      if (e.shiftKey && (active === first || active === node || !node.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !node.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const P = GRACE_NOTICE_PARTS;
  const L = GRACE_CONTINUED_USE_PARTS;

  /**
   * ⚠️ THE COUNT IS INTERPOLATED, NEVER TYPED, and the three forms are separate
   * sentences rather than a plural hack.
   *
   * "in 1 days" and "in 0 days" are both things a naive `${n} days` produces, and
   * the second is not even wrong so much as meaningless: zero days left is
   * TODAY, which is a different sentence. `graceDaysLeft` can return 0, and the
   * final morning is the single most important one to get right.
   */
  const headline =
    shown === 0 ? (
      <>
        {P.headLead} <span className="text-accent-amber">{P.headToday}</span>.
      </>
    ) : shown === 1 ? (
      <>
        {P.headLead} <span className="text-accent-amber">{P.headTomorrow}</span>.
      </>
    ) : (
      <>
        {P.headLead} {P.headIn}{" "}
        {/* Only the DIGITS are mono. "days" is sans, so the join is an ordinary
            word space rather than a mono advance width against a sans one, which
            is what made "8 days left" sit oddly. The AMBER spans both: it is one
            phrase, and it is this card's single live beat. */}
        <span className="text-accent-amber">
          <span className="font-mono tabular-nums tracking-[-0.01em]">{shown}</span> days
        </span>
        .
      </>
    );

  /**
   * `z-[60]` is THE APP'S MODAL LAYER, the same one `SignOutConfirm`,
   * `BlockDeleteConfirm`, `FirstRunDisclaimer`, the launch notice and the
   * read-only pop-up all use: above the `z-40` nav and the FAB's `z-45` scrim,
   * and deliberately BELOW `z-[70]`, which is the toast layer.
   *
   * ⚠️ It cannot collide with the read-only pop-up. This renders only for an
   * ACTIVE grace whose expiry is still ahead, so anybody seeing it can still
   * write and that pop-up has nothing to fire on.
   */
  return createPortal(
    /**
     * ⚠️ IT SCROLLS. `grid place-items-center` CLIPPED IT, and the clip was
     * invisible on a desktop.
     *
     * Measured in `/preview/grace-notice` at 360x560, which `ui-context.md` names
     * as one of the two sizes this has to be driven at: the card is taller than
     * that viewport, a centred grid item overflows equally top and bottom, and
     * the whole legal footer was cut off with no way to reach it. On the one
     * screen in the app whose small print is a Terms acceptance.
     *
     * `overflow-y-auto` on the backdrop with a `min-h-full` flex child centres
     * the card when it fits and scrolls it when it does not, which is the only
     * arrangement that is correct at both sizes. `overscroll-contain` stops the
     * dashboard behind it scrolling once the card's own scroll is exhausted.
     *
     * ⚠️ The insets are `max()`ed against the padding rather than added to it. A
     * notched iPhone reports ~59px at the top, and `p-6` PLUS that is 83px of
     * dead space above a card that is already too tall.
     */
    <div
      className="pointer-events-auto fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-overlay-backdrop px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] animate-in fade-in-0 duration-300 motion-reduce:animate-none"
      onPointerDown={(e) => {
        pressStartedOutside.current = !dialogRef.current?.contains(e.target as Node);
      }}
      onClick={() => {
        if (pressStartedOutside.current) close();
      }}
    >
      {/* Clicks here bubble to the backdrop above, so tapping beside the card
          still closes it exactly as it did when this was a centred grid. */}
      <div className="flex min-h-full items-center justify-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="grace-notice-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        /**
         * ⚠️ `outline-none` ON THE DIALOG, and only on the dialog.
         *
         * `globals.css` keeps every keyboard focus ring by suppressing outlines
         * only for `:focus:not(:focus-visible)`. A PROGRAMMATIC focus on page
         * load matches `:focus-visible`, so moving focus here (see the effect
         * above) simply moved the amber ring off "Got it" and onto the card's
         * whole edge, which was worse: a full amber outline on a card allowed one
         * live beat.
         *
         * Suppressing it here is safe because this element is `tabIndex={-1}` and
         * is never reachable by Tab. Every control INSIDE keeps its
         * `focus-visible:ring-2`, so a keyboard user still sees exactly where
         * they are. This is the container, not a control.
         */
        className="relative w-full max-w-sm outline-none rounded-3xl border border-border-default bg-bg-surface p-5 pb-4 shadow-lg animate-in fade-in-0 slide-in-from-bottom-2 duration-300 motion-reduce:animate-none"
      >
        {/**
          * ⚠️ THE APP ICON, NOT THE FEATHERED MASCOT (Adrian, 2026-09-03).
          *
          * The launch notice uses `Mascot pose="flex"`, which is Kyle cut out of
          * his plate with a radial feather. Adrian asked for the icon itself:
          * "the black Kyle the vial flexing", the thing already sitting on their
          * home screen. On a notice telling somebody their access is ending, the
          * app identifying itself plainly reads better than a mascot posing.
          *
          * ⚠️ NO CONFETTI, and that is not an omission. The launch notice fires
          * it because that screen is GIVING somebody two free weeks. The same
          * burst over a countdown would be the app celebrating at somebody whose
          * access is running out.
          */}
        <div className="mb-2.5 flex justify-center">
          <span className="relative inline-flex h-[84px] w-[84px] items-center justify-center">
            <span
              aria-hidden
              className="animate-grace-bloom pointer-events-none absolute left-1/2 top-1/2 h-[116px] w-[116px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
              style={{
                background:
                  "radial-gradient(circle, color-mix(in srgb, var(--accent-amber) 26%, transparent), transparent 70%)",
              }}
            />
            <Image
              src="/icon-192.png"
              alt="Trackd Co"
              width={192}
              height={192}
              className="animate-grace-icon relative h-[84px] w-[84px] rounded-[20px]"
            />
            {/* A single band of light crossing the icon once, from the top left.
                Clipped to the icon's own radius and gone when it has passed. */}
            <span aria-hidden className="grace-glint absolute inset-0 rounded-[20px]" />
          </span>
        </div>

        <h2
          id="grace-notice-title"
          className="text-lg font-medium tracking-[-0.005em] text-foreground"
        >
          {headline}
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-pretty text-text-muted">
          {P.runEnds} <span className="text-foreground">{endsOn}</span>. {P.thanks}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-pretty text-text-muted">
          {/* On the final day "After 10 Sep" would be telling somebody about a
              date that is today. The two forms are signed separately. */}
          {daysLeft === 0 ? (
            P.afterToday
          ) : (
            <>
              {P.after} <span className="text-foreground">{endsOnShort}</span>
            </>
          )}{" "}
          {P.readOnly}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-pretty text-text-muted">{P.cta}</p>

        {/**
          * ⚠️ "CHOOSE A PLAN" IS THE FILLED BUTTON AND IT SITS ON THE RIGHT
          * (Adrian, 2026-09-03).
          *
          * This REVERSES the hierarchy `06` §3.6 set on the launch notice, where
          * the dismissal was primary because "the screen's credibility rests on
          * applying no pressure". Recorded rather than slipped in: that notice
          * was GIVING somebody a fortnight and had nothing to ask for, while this
          * one is the last in-app word most of this cohort will get before the
          * gate closes. Adrian made the call twice, explicitly.
          *
          * ⚠️ NEITHER CONTROL IS AN ACCEPT BUTTON. Acceptance is continued use
          * after notice, so neither may be labelled or styled as one, and closing
          * by any route records the same thing.
          */}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={close}
            className="flex-1 rounded-2xl border border-border-default py-3 text-sm text-foreground outline-none transition-colors hover:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring"
          >
            {P.dismiss}
          </button>
          <button
            type="button"
            onClick={choosePlan}
            className="flex-1 rounded-2xl bg-accent-primary py-3 text-sm font-medium text-bg-base outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {P.choose}
          </button>
        </div>

        {/**
          * ⚠️ BELOW THE BUTTONS, BEHIND A HAIRLINE, AT 10px (Adrian, 2026-09-03:
          * "make it go below the actual buttons").
          *
          * It is legal notice rather than something to read on the way to a
          * decision, and above the buttons it sat in the middle of the argument.
          * Moving and resizing it changes no wording, so it needed nobody's
          * approval; the WORDING did, and it has it. See
          * {@link GRACE_CONTINUED_USE_PARTS} for why all four documents are named
          * and only two are described as accepted.
          */}
        <div className="mt-4 border-t border-border-default pt-3">
          <p className="text-[10px] leading-relaxed text-text-subtle">
            {L.lead} <LegalLink href="/terms">{L.terms}</LegalLink> {L.join}{" "}
            <LegalLink href="/privacy">{L.privacy}</LegalLink>
            {L.mid} <LegalLink href="/medical-disclaimer">{L.disclaimer}</LegalLink> {L.join2}{" "}
            <LegalLink href="/consumer-health-data">{L.chd}</LegalLink> {L.end}
          </p>
        </div>
      </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * ⚠️ FOUR LINKS, TWO MEANINGS, ONE STYLE, and the style carries no meaning.
 *
 * The Terms and the Privacy Policy are ACCEPTED by continued use. The Medical
 * Disclaimer and the Consumer Health Data Privacy Policy are named because they
 * changed and are here to be READ. The sentence draws that distinction in words;
 * the links must not draw a second, weaker version of it in styling, because a
 * reader cannot tell "styled differently" from "matters less".
 */
function LegalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-text-muted underline underline-offset-2 hover:text-foreground"
    >
      {children}
    </Link>
  );
}
