"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { READ_ONLY_POPUP } from "@/lib/billing/readOnlyCopy";
import { subscribeReadOnlyRefused } from "@/lib/home/syncStatus";

/**
 * ⚠️ THE READ-ONLY GATE, CENTRALLY.
 *
 * One provider around the whole logged-in app, one hook every write entry point
 * calls, one pop-up. Adrian's instruction was explicit about the shape: "do it
 * centrally (a provider + hook) so nothing leaks past."
 *
 * ## What it gates, and what it never touches
 *
 * A lapsed account can open every screen and read everything it has ever logged.
 * Doses, photos, readings, blocks, history: all of it stays exactly where it
 * was. What stops is ADDING to it. Nothing is hidden and nothing is deleted.
 *
 * This is health data somebody entered about their own body, and withholding it
 * to apply commercial pressure is the one thing this product must never do.
 *
 * ## A POP-UP, not a bottom sheet
 *
 * Adrian, 2026-08-13: "a sheet but i dont want a bottom sheet i want a pop up."
 * So: a centred modal, portaled to `<body>`, with the same treatment
 * `CancelSubscription` uses and for the same measured reason — inside a
 * transformed ancestor, `position: fixed` is contained by it and the modal lands
 * behind the fixed bottom nav.
 *
 * ## ⚠️ NO PRICES, NO SELECTOR (D28)
 *
 * The built version embedded a live plan list with real Stripe prices and
 * subscribed from inside the modal. **D28 resolved: the selector goes, and there
 * is one shared destination.** So this is a plain notice with a button that goes
 * to the paywall, and the price list is stated in exactly one place.
 *
 * That also removes a network call — `loadPricesSafe` — from the layout of every
 * logged-in page, and removes the two unsigned strings the selector needed: the
 * footnote about trials being for new accounts, and the no-prices error. Both
 * disappear as a consequence of D28 rather than as an omission, which `05` §7
 * asked to be made explicit.
 *
 * ## THIS IS NOT THE ENFORCEMENT
 *
 * A client-side guard is a UX affordance. The enforcement is
 * `requireWriteAccess()` on the server actions (`lib/billing/gate.ts`), because
 * a server action is a public HTTP endpoint and anything a browser decides can
 * be decided differently by a browser somebody has modified.
 *
 * What this layer buys, which the server layer cannot: the user sees the real
 * reason instead of a silent failure, and the DEVICE STORE is never written for
 * something that will never sync. That second part matters more than it sounds —
 * the home and protocol domain writes `localStorage` first and mirrors to
 * Postgres afterwards, so a client that skipped this guard would leave a dose on
 * the phone that the cloud has refused, which is exactly the two-sources-of-truth
 * state the whole sync layer exists to avoid.
 */

interface ReadOnlyContextValue {
  /** False when the account is in read-only. */
  canWrite: boolean;
  /**
   * Run `action` if writing is allowed; otherwise open the pop-up and run
   * nothing. The return value says which happened, for the rare caller that
   * needs to know (an async handler that would otherwise carry on).
   */
  guard: (action: () => void) => boolean;
  /** Open the pop-up directly, for a surface that wants to explain itself. */
  show: () => void;
}

const ReadOnlyContext = createContext<ReadOnlyContextValue>({
  /**
   * ⚠️ THE DEFAULT IS `canWrite: true`, AND THAT IS DELIBERATE.
   *
   * A component rendered outside the provider — a preview harness, a test, a
   * screen somebody adds under a different layout — must behave exactly as it
   * did before this file existed. Defaulting to false would silently put every
   * unwrapped surface into read-only, which is a lockout arriving as a
   * refactoring accident.
   *
   * The gate that actually decides is on the server. This default cannot grant
   * anybody anything: it only decides whether a pop-up appears.
   */
  canWrite: true,
  guard: (action) => {
    action();
    return true;
  },
  show: () => {},
});

/** The hook every write entry point calls. */
export function useWriteAccess(): ReadOnlyContextValue {
  return useContext(ReadOnlyContext);
}

export function ReadOnlyProvider({
  canWrite,
  children,
}: {
  /** Server-computed, in `app/(app)/layout.tsx`. */
  canWrite: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  /**
   * WHERE FOCUS CAME FROM, so it can be given back.
   *
   * `CancelSubscription` holds a `triggerRef` because it owns its own trigger.
   * This one does not: it is opened by `guard()` from nine different call sites,
   * and the control that fired it may be a FAB tile, a row inside a sheet, or a
   * tick on the dashboard. So the trigger is whatever had focus at the moment it
   * opened, which is exactly what the browser already knows.
   *
   * A cold review measured the version without it: after Escape,
   * `document.activeElement` was `<body>`, so a keyboard or switch-control user
   * was dropped at the top of the document having lost their place entirely.
   */
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const openPopup = useCallback(() => {
    returnFocusTo.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }, []);

  const closePopup = useCallback(() => {
    setOpen(false);
    // `isConnected`, because the control that opened this can legitimately be
    // gone: `guard()` often fires from inside a sheet, and closing the pop-up
    // can leave a trigger that has since unmounted.
    const target = returnFocusTo.current;
    if (target?.isConnected) target.focus();
    returnFocusTo.current = null;
  }, []);

  const show = useCallback(() => openPopup(), [openPopup]);

  /**
   * ⚠️ A REFUSED WRITE OPENS THIS POP-UP, FROM ONE SUBSCRIPTION (05 §3.9, Q85).
   *
   * `guard()` covers the entry points that ASK before writing. It cannot cover
   * the fire-and-forget path: the home and protocol domains write `localStorage`
   * first and push to Postgres afterwards, so the refusal arrives asynchronously,
   * after the tap has already been handled.
   *
   * Those pushes all funnel through `trackSync`, which used to send every one of
   * them to the syncing notice — telling a lapsed user their dose was "saved on
   * your device, still syncing, we'll keep trying", when nothing was saved and
   * nothing would ever be retried.
   *
   * So `trackSync` now routes a KNOWN read-only refusal here instead. One
   * subscription, one decision, fifteen surfaces fixed without any of them
   * knowing about the gate.
   */
  useEffect(() => subscribeReadOnlyRefused(openPopup), [openPopup]);

  const guard = useCallback(
    (action: () => void) => {
      if (canWrite) {
        action();
        return true;
      }
      openPopup();
      return false;
    },
    [canWrite, openPopup],
  );

  const value = useMemo<ReadOnlyContextValue>(
    () => ({ canWrite, guard, show }),
    [canWrite, guard, show],
  );

  return (
    <ReadOnlyContext.Provider value={value}>
      {children}
      {open ? <ReadOnlyPopup onClose={closePopup} /> : null}
    </ReadOnlyContext.Provider>
  );
}

/* ── the pop-up ──────────────────────────────────────────────────── */

function ReadOnlyPopup({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [leaving, setLeaving] = useState(false);

  /**
   * The same focus contract `CancelSubscription` documents at length, and for
   * the same reason: `aria-modal="true"` beside no focus management is a lie
   * told to assistive tech about a dialog it never announced.
   */
  useEffect(() => {
    const node = dialogRef.current;
    // An ENABLED button, falling back to the dialog. `querySelector("button")`
    // returned a disabled one during the pending window, and `.focus()` on a
    // disabled button is a no-op — so focus stayed wherever the click left it.
    (node?.querySelector<HTMLElement>("button:not([disabled])") ?? node)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
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
  }, [onClose]);

  /**
   * TO THE PRICE LIST (D28).
   *
   * ⚠️ THE PRICE LIST, NOT THE CARD SCREEN, and the change of destination is the
   * other half of D28. The old pop-up chose the plan itself and so went straight
   * to `?step=start` — "the plan has just been chosen here, and sending somebody
   * to choose it again would be asking the same question twice". With the
   * selector gone, no plan has been chosen, so the card screen would be asking
   * for a card for a plan nobody picked.
   *
   * `?step=plans` is the price list (`app/onboarding/page.tsx:114`), and it is
   * the SAME destination `06`'s "Set up my plan" uses — D28's "one shared
   * destination", so the two surfaces cannot drift into sending people to two
   * different places to do one thing.
   *
   * ⚠️ A FULL DOCUMENT LOAD rather than a router push. The onboarding flow reads
   * `?step=` and its session at mount and on `popstate` only, so a soft
   * navigation would change the address bar and leave this app's tree on screen —
   * the exact defect spec w2b-14 records.
   */
  const choosePlan = () => {
    if (leaving) return;
    setLeaving(true);
    window.location.assign("/onboarding?step=plans");
  };

  if (typeof document === "undefined") return null;

  /**
   * ⚠️ `pointer-events-auto` ON THE BACKDROP IS LOAD-BEARING, NOT DEFENSIVE.
   *
   * A Radix modal Dialog sets an inline `pointer-events: none` on `<body>` for
   * as long as it is open, and re-enables it only on its own overlay. This
   * portals to `document.body`, so without the class it INHERITS that and every
   * control inside it goes dead.
   *
   * A cold review measured the result on a phone: lapsed user, Progress,
   * "Attach bloodwork", "Attach" — the pop-up paints correctly on top (z-60 over
   * Radix's z-50, stacking verified independently) and NOTHING in it can be
   * touched. `elementFromPoint` at each button returned the sheet underneath;
   * zero hit-testable elements inside the dialog; real taps on "Not now" and
   * "Subscribe" both timed out. Escape still worked, and **a phone has no
   * Escape key**, so the only way out was to reload the app.
   *
   * Every guarded control that lives inside an already-open sheet reaches this:
   * bloodwork attach, the calendar's one-off add, Skip on the dose detail sheet,
   * add-stock on Protocol. The same class is applied to the other two modals for
   * the same reason.
   */
  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[60] grid place-items-center bg-overlay-backdrop p-6 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="readonly-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl border border-border-default bg-bg-surface p-5 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
      >
        {/* ⚠️ APPROVED COPY, CHARACTER FOR CHARACTER (05 §3.6). A fix WITHHOLDS a
            line, it never rewords one. No em dash. "Read only" is the exact
            phrase; never "paused", "expired" or "locked". */}
        <h2 id="readonly-title" className="text-base font-medium text-foreground">
          {READ_ONLY_POPUP.title}
        </h2>
        {/* ⚠️ THE STATE LEADS, AND THE ORDERING IS THE DECISION. The built version
            led with reassurance, which is defensible and is not what was signed
            off: somebody who has just been blocked needs to know what is
            happening before they are told what it would cost to undo it.

            ⚠️ AND IT IS NOT BRANCHED. This one body is true of a lapsed grace, a
            lapsed trial, a lapsed subscription AND a revoked account alike —
            they differ in origin and are identical in what they can do, which is
            nothing but read. Adrian, 2026-08-17: if a second variant ever seems
            necessary, that is the signal to stop and ask rather than write one.

            ⚠️ THE INSTRUCTION ABOVE FIRED, AND THIS IS ITS ANSWER (D98).

            The first clause read "You're not on a plan at the moment", which is
            FALSE for a past-due customer who IS on a plan Stripe is still
            charging — two taps from a screen reading "Renews on" and offering
            Cancel. That looked like the case for a second variant. It is not:
            THE ANSWER IS NOT TO BRANCH. The clause is reworded so it is true of
            every cohort, and the pop-up stays as one body.

            ⚠️ AND THE FIRST REWORDING WAS ALSO WRONG, which is why this note
            names both. "Your access has ended" is a statement about HISTORY, and
            it is false for somebody who never had access — anyone signing up
            after the 17 Aug backfill holds no entitlement row, so at P13 that is
            exactly who reads this. It inverted which cohort the sentence failed.

            What is signed is a statement about NOW, true of all six: never had
            access, lapsed grace, lapsed trial, lapsed subscription, revoked, and
            past-due after the lapse.

            ⚠️ THE WORDS NOW LIVE IN `lib/billing/readOnlyCopy.ts` AND ARE PINNED
            BY CODEPOINT against `lib/billing/signed/read-only-popup.txt`. They
            moved because this file is unreachable from the committed suite, so
            reverting the clause below used to leave all 1573 tests green. Do not
            inline them back. */}
        <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
          {READ_ONLY_POPUP.body}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          {READ_ONLY_POPUP.reassurance}
        </p>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-border-default py-3 text-sm text-foreground outline-none transition-colors hover:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring"
          >
            {READ_ONLY_POPUP.dismiss}
          </button>
          <button
            type="button"
            disabled={leaving}
            onClick={choosePlan}
            className="flex-1 rounded-2xl border border-border-default bg-bg-surface-raised py-3 text-sm text-foreground outline-none transition-colors hover:bg-bg-surface focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {leaving ? "Opening…" : READ_ONLY_POPUP.action}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
