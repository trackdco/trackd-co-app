"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { CaretRight, CreditCard, FileText } from "@/components/icons";
import { openBillingPortal } from "@/app/(app)/billing/actions";

/**
 * THE STRIPE HANDOFF — the rows that leave, and the dialog that says so first.
 *
 * `08-billing-screen.md` §3.4. Nobody should arrive on another company's domain
 * without being told they are going, and this is the only place in the app that
 * hands a user to one.
 *
 * ## ⚠️ ONE COMPONENT OWNS BOTH THE ROWS AND THE CALL, AND THAT IS THE POINT
 *
 * §3.3 splits the single "Payment method and invoices" row into **Card** and
 * **Receipts**, and warns in the same breath: "That row is also the only caller
 * of the portal action; splitting it must not create a second caller that skips
 * the handoff dialog in §3.4."
 *
 * So the split is a longer `rows` array, not a second component. There is
 * exactly ONE `openBillingPortal` call site in the app and it is below, behind
 * the dialog's Continue button — **it is not reachable without passing through
 * the dialog**, by construction rather than by everybody remembering. A row
 * added here inherits the handoff; a row added elsewhere has no way to reach the
 * action at all.
 *
 * §3.4: "This is reachable only from the payment rows. Not from the plan card,
 * not from a lapsed state, not from anywhere else."
 *
 * ## The action returns a URL and THIS navigates
 *
 * ⚠️ Not a `redirect()` inside the server action: that throws a control-flow
 * signal which any `try/catch` around the call swallows, and the failure mode is
 * a button that silently does nothing. §3.4 says so explicitly.
 *
 * `window.location.assign`, not `router.push` — the destination is Stripe's
 * origin, so a client-side navigation is not an option, and a full document load
 * is also what brings the user back cleanly through `return_url`.
 *
 * ## ⚠️ The second line is only true because the portal was narrowed
 *
 * Per D14 the customer portal has cancel and plan switching turned OFF, so it
 * genuinely offers card and receipts and nothing else. **If either toggle is ever
 * turned back on, this copy becomes false.** `12-go-live.md` verifies both are off
 * in live mode before go-live.
 */

/** ⚠️ SIGNED COPY, §3.4. Character for character. No em dash. */
const TITLE = "You're off to Stripe";
const BODY = "Stripe handles payments for Trackd Co, so your card details never touch us.";
const BODY_TWO =
  "Their page is where you change your card or download receipts. You'll come straight back here after.";
const DISMISS = "Not now";
const CONTINUE = "Continue";

/**
 * The failure. It states the FACT and the NEXT ACTION, which is what
 * `ui-context.md` asks of error copy, and it never strands somebody wondering
 * whether they are mid-flight to another site.
 */
const HANDOFF_FAILED = "We couldn't open Stripe just now. Please try again.";

/** Which row, which words. `08` decides the labels; the icons follow the row. */
export type HandoffRowKey = "both" | "card" | "receipts";

const ROW_ICON = {
  both: CreditCard,
  card: CreditCard,
  receipts: FileText,
} as const;

export interface HandoffRow {
  key: HandoffRowKey;
  label: string;
  /**
   * The quieter line under a row. §3.3: Receipts "leaves only until `19` builds
   * the in-app list", and §5 requires that be stated on the screen rather than
   * implied.
   */
  note?: string;
}

/** Never changes, so the snapshot below is stable for the lifetime of the app. */
const subscribeNever = () => () => {};

export function StripeHandoff({ rows }: { rows: readonly HandoffRow[] }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const continueRef = useRef<HTMLButtonElement | null>(null);
  /**
   * ⚠️ THE TRIGGER, SO FOCUS CAN GO BACK TO IT. §5 requires it by name: "focus
   * returns to the trigger". With several rows it must be the row that was
   * actually pressed, not the first one, or a keyboard user pressing Receipts
   * and dismissing lands on Card.
   */
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  /**
   * ⚠️ A PORTAL RENDERS NOTHING ON THE SERVER, so the dialog is only drawn after
   * mount and the server render and the first client render agree on "nothing".
   *
   * `useSyncExternalStore` rather than state set in an effect — the same idiom
   * `CancelSubscription` and `BetaLaunchNotice` both use, and the cost of the
   * effect version is documented there: React discards the hydration and rebuilds
   * the app shell.
   */
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    // Back to the row they pressed. Deferred a tick: the portal is unmounting in
    // this same commit and focusing a node inside it would be undone.
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  /**
   * ⚠️ FOCUS IN, TAB TRAPPED, ESCAPE OUT — and every branch of it is a §5
   * checkbox rather than a nicety.
   *
   * The `pending` window matters as much as the idle one. `CancelSubscription`
   * carries a long note about what happens when every button goes `disabled`
   * mid-request: `button:not([disabled])` matches zero, a naive handler stands
   * aside, and Tab walks straight out of a dialog still claiming
   * `aria-modal="true"`. The same shape would be the same defect here, so the
   * empty case focuses the dialog itself, which is `tabIndex={-1}`.
   */
  useEffect(() => {
    if (!open) return;
    const node = dialogRef.current;
    (continueRef.current ?? node)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) {
        close();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const focusable = Array.from(
        node.querySelectorAll<HTMLElement>("button:not([disabled])"),
      );
      if (focusable.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const outside = !node.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, close]);

  const go = async () => {
    setError(null);
    setPending(true);
    try {
      const result = await openBillingPortal();
      if (result.ok && result.url) {
        // Another origin, so a full document load. The dialog is deliberately
        // left standing and `pending` left true: the page is on its way out, and
        // resetting to an idle dialog would flash a re-armed Continue button
        // during the navigation.
        window.location.assign(result.url);
        return;
      }
      setError(result.error ?? HANDOFF_FAILED);
      setPending(false);
    } catch {
      setError(HANDOFF_FAILED);
      setPending(false);
    }
  };

  return (
    <>
      {rows.map((row, i) => {
        const Icon = ROW_ICON[row.key];
        return (
          <div key={row.key}>
            {i > 0 ? <div className="mx-4 hairline-t" aria-hidden /> : null}
            <button
              type="button"
              onClick={(e) => {
                triggerRef.current = e.currentTarget;
                setError(null);
                setOpen(true);
              }}
              /* `min-h-11` outright rather than padding arithmetic on a line box:
                 44px is Apple's floor and a row with a two-line note must not be
                 the only one that passes. */
              className="flex w-full min-h-11 items-center gap-3 px-4 py-3.5 text-left outline-none transition-colors hover:bg-bg-surface-raised active:bg-bg-surface-raised focus-visible:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <Icon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-foreground">{row.label}</span>
                {row.note ? (
                  <span className="mt-0.5 block text-xs leading-relaxed text-text-muted">
                    {row.note}
                  </span>
                ) : null}
              </span>
              <CaretRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
            </button>
          </div>
        );
      })}

      {open && mounted && typeof document !== "undefined"
        ? createPortal(
            <div
              /* ⚠️ `pointer-events-auto`. Radix sets `pointer-events: none` on
                 `<body>` while a sheet is open, and anything portaled above one
                 inherits it — every button here would render and do nothing. */
              className="pointer-events-auto fixed inset-0 z-[60] grid place-items-center bg-overlay-backdrop p-6 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
              onClick={() => {
                if (!pending) close();
              }}
            >
              <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="handoff-title"
                /* The body carries the reassurance the title only hints at, so a
                   screen-reader user gets "your card details never touch us"
                   rather than a bare destination and two buttons. */
                aria-describedby="handoff-body"
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-xs overflow-hidden rounded-3xl border border-border-default bg-bg-surface p-5 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
              >
                <h2 id="handoff-title" className="text-base font-medium text-foreground">
                  {TITLE}
                </h2>
                <p
                  id="handoff-body"
                  className="mt-1.5 text-sm leading-relaxed text-text-muted"
                >
                  {BODY}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{BODY_TWO}</p>

                {error ? (
                  <p role="alert" className="mt-3 text-sm text-accent-destructive">
                    {error}
                  </p>
                ) : null}

                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={close}
                    className="flex-1 rounded-2xl border border-border-default py-3 text-sm text-foreground outline-none transition-colors hover:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    {DISMISS}
                  </button>
                  <button
                    type="button"
                    ref={continueRef}
                    disabled={pending}
                    onClick={go}
                    className="flex-1 rounded-2xl border border-border-default bg-bg-surface-raised py-3 text-sm text-foreground outline-none transition-colors hover:bg-bg-surface focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    {pending ? "Opening…" : CONTINUE}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
