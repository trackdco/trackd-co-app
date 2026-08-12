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

import { PlanRows } from "@/components/billing/PlanRows";
import { readSession, writeSession } from "@/lib/onboarding/session";
import { PLANS, TRIAL_DAYS, type PlanId, type PricedPlan } from "@/lib/onboarding/pricing";

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
 * ## The prices are the REAL prices
 *
 * `PlanRows`, the same component the paywall renders, fed from the same
 * `loadPricesSafe` read. Not a hardcoded figure and not a second copy of the
 * presentation. A price that disagreed with the checkout screen would be the
 * worst possible thing to put in front of somebody deciding whether to pay.
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
  prices,
  children,
}: {
  /** Server-computed, in `app/(app)/layout.tsx`. */
  canWrite: boolean;
  /**
   * What Stripe says each plan costs. Empty when the gate is off (nothing to
   * sell) or when Stripe could not be reached, which the pop-up handles rather
   * than rendering blank figures.
   */
  prices: readonly StripePlanPrice[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const show = useCallback(() => setOpen(true), []);

  const guard = useCallback(
    (action: () => void) => {
      if (canWrite) {
        action();
        return true;
      }
      setOpen(true);
      return false;
    },
    [canWrite],
  );

  const value = useMemo<ReadOnlyContextValue>(
    () => ({ canWrite, guard, show }),
    [canWrite, guard, show],
  );

  return (
    <ReadOnlyContext.Provider value={value}>
      {children}
      {open ? (
        <SubscribePopup prices={prices} onClose={() => setOpen(false)} />
      ) : null}
    </ReadOnlyContext.Provider>
  );
}

/** The shape `lib/billing/prices.ts` returns, declared structurally because that
 *  module is `server-only` and this is a client component. Same reason
 *  `components/onboarding/flow.tsx` declares its own copy. */
export interface StripePlanPrice {
  plan: PlanId;
  priceId: string;
  amount: number;
  currency: string;
  interval: string;
}

/* ── the pop-up ──────────────────────────────────────────────────── */

function SubscribePopup({
  prices,
  onClose,
}: {
  prices: readonly StripePlanPrice[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [leaving, setLeaving] = useState(false);

  const pricedPlans: PricedPlan[] = useMemo(
    () =>
      prices
        .map((p) => ({ ...PLANS[p.plan], price: p.amount, currency: p.currency }))
        .filter((p): p is PricedPlan => Boolean(p)),
    [prices],
  );

  /**
   * Opens on the plan the user last chose, falling back to the first on offer.
   *
   * A LAZY INITIALISER, not an effect. An effect that setStates in its own body
   * is a cascading render (the lint rule says so, and it is right), and there is
   * no reason for one here: this component is only ever mounted by a click, so
   * it always has a browser and `readSession` can be read straight away. The
   * same idiom `flow.tsx` uses for exactly this reason.
   */
  const [selected, setSelected] = useState<PlanId | null>(() => {
    if (pricedPlans.length === 0) return null;
    const remembered = readSession().plan;
    return pricedPlans.some((p) => p.id === remembered)
      ? remembered
      : pricedPlans[0].id;
  });

  /**
   * The same focus contract `CancelSubscription` documents at length, and for
   * the same reason: `aria-modal="true"` beside no focus management is a lie
   * told to assistive tech about a dialog it never announced.
   */
  useEffect(() => {
    const node = dialogRef.current;
    node?.querySelector<HTMLElement>("button")?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const focusable = Array.from(
        node.querySelectorAll<HTMLElement>("button:not([disabled])"),
      );
      if (focusable.length === 0) return;
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
   * TO THE CARD SCREEN, carrying the plan.
   *
   * The chosen plan is written into the onboarding session (`localStorage`)
   * because that is where `CheckoutScreen` reads it from, then the browser is
   * navigated with a FULL DOCUMENT LOAD rather than a router push. The
   * onboarding flow reads `?step=` and its session at mount and on `popstate`
   * only, so a soft navigation would change the address bar and leave this app's
   * tree on screen — the exact defect spec w2b-14 records and fixed by making
   * every auth return a full load.
   *
   * It goes to the CARD screen and not the price list: the plan has just been
   * chosen here, and sending somebody to choose it again would be asking the
   * same question twice.
   */
  const subscribe = () => {
    if (!selected || leaving) return;
    setLeaving(true);
    try {
      writeSession({ ...readSession(), plan: selected });
    } catch {
      // A refused `localStorage` write must not brick the button. The checkout
      // screen falls back to its own default plan, which is the same one this
      // list opens on. Same rule as the calculator's syringe choice.
    }
    window.location.assign("/onboarding?step=start");
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-overlay-backdrop p-6 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
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
        <h2 id="readonly-title" className="text-base font-medium text-foreground">
          Subscribe to keep logging
        </h2>
        {/* The reassurance is FIRST and it is the true one. Somebody who has
            just been stopped mid-action is asking "have I lost my data", and
            answering that before asking for money is the only order that is not
            a threat. */}
        <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
          Everything you&apos;ve logged is still here and always will be. Trackd
          is read only until you subscribe.
        </p>

        {pricedPlans.length > 0 ? (
          <div className="mt-5">
            <PlanRows
              plans={pricedPlans}
              selectedId={selected}
              onSelect={setSelected}
              ariaLabel="Choose a plan to subscribe"
            />
          </div>
        ) : (
          /* The honest failure, not a blank picker. Same call the paywall
             makes: this is a screen where showing nothing silently would be
             worse than an error, because the user is trying to pay. */
          <p className="mt-5 text-sm leading-relaxed text-text-muted">
            We couldn&apos;t load our prices just now. Please try again in a
            moment.
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-border-default py-3 text-sm text-foreground outline-none transition-colors hover:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* "Not now" and not "Cancel". The user is already reading their own
                data and can carry on doing it; this dismisses an offer rather
                than abandoning a task. */}
            Not now
          </button>
          <button
            type="button"
            disabled={!selected || pricedPlans.length === 0 || leaving}
            onClick={subscribe}
            className="flex-1 rounded-2xl border border-border-default bg-bg-surface-raised py-3 text-sm text-foreground outline-none transition-colors hover:bg-bg-surface focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {leaving ? "Opening…" : "Subscribe"}
          </button>
        </div>

        {/* No price repeated here. The rows above state it, and a second figure
            beside the button is one more thing that can contradict the first.
            The full four-part disclosure is on the card screen, which is where
            the commit actually happens and where the requirement bites. */}
        <p className="mt-3 text-center text-[11px] leading-relaxed text-text-subtle">
          {TRIAL_DAYS}-day free trials are for new accounts.
        </p>
      </div>
    </div>,
    document.body,
  );
}
