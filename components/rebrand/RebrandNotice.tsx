"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

import { recordDocumentAcceptance } from "@/app/(app)/legal-acceptance";
import {
  markRebrandNoticeSeen,
  shouldRecordAcceptance,
} from "@/lib/rebrand/rebrandNotice";
import { ACN, LEGAL_ENTITY, PRODUCT_NAME } from "@/lib/brand";

/**
 * THE ONE TIME ANYBODY IS TOLD THE NAME CHANGED.
 *
 * Trackd Co is now Trakabl. This is a modal rather than a banner for the same
 * reason `BetaLaunchNotice` is: a banner is a glance, and someone who has
 * trusted this app with two months of bloodwork should not have to infer a
 * rebrand from a logo quietly changing under them.
 *
 * ## ⚠️ THE SERVER DECIDES, FROM A COOKIE, BEFORE THIS IS SENT
 *
 * The dashboard reads the cookie in `cookies()` and does not render this at all
 * once it has been dismissed. That is not an optimisation — `betaNoticeStore.ts`
 * records what the alternative cost when the trial banner tried it on the
 * client: a ~166ms paint of an already-dismissed notice on every single load.
 * As a MODAL that would be a dialog flashing across the app on every launch.
 *
 * ## ⚠️ WHO SEES IT: existing accounts only
 *
 * Gated in `shouldShowRebrandNotice` on the account's creation date, not just on
 * dismissal. Somebody who signs up next week has never heard of Trackd, and
 * telling them the name changed would make a new product feel like a renamed old
 * one.
 *
 * ## ⚠️ WHAT THE FINE PRINT MAY AND MAY NOT SAY
 *
 * It names the Terms of Service and the Privacy Policy, and NOTHING else —
 * `legal-acceptance.ts` sets that boundary and the reasons are load-bearing:
 * Privacy v2.0 §17 forbids treating continued use as consent to health-data
 * processing, so writing a health-data consent from a dismissed pop-up would be
 * the worst thing this component could do. The Medical Disclaimer is not named
 * either, because recording an acceptance nobody was told they were giving is
 * the defect that whole file exists to close.
 *
 * It also states the trading relationship. Trakabl is a BUSINESS NAME; the
 * company is still Trackd Co Pty Ltd, and a user who sees that entity on a card
 * statement after the app renamed itself needs the connection made somewhere
 * they actually saw it. This modal is the one place everybody sees.
 */
/** Never changes, so the store never notifies. */
const subscribeNever = () => () => {};

export function RebrandNotice({ userId }: { userId: string }) {
  const [open, setOpen] = useState(true);
  const router = useRouter();

  /**
   * "Is there a browser yet?" — `useSyncExternalStore` rather than `useState`
   * plus an effect, because a setState in an effect body is a cascading render
   * and the lint rule rightly refuses it. Same idiom as `BetaLaunchNotice` and
   * `onboarding/flow.tsx`, for the same question.
   */
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  const dismiss = useCallback(() => {
    setOpen(false);
    markRebrandNoticeSeen(userId);
    /**
     * ⚠️ THE COOKIE ALONE DOES NOT STOP IT COMING BACK.
     *
     * `next.config.ts` sets `staleTimes.dynamic = 300`, so this route's RSC
     * payload stays in the CLIENT router cache for five minutes. The payload was
     * rendered when the cookie was absent, and it carries this notice inside it.
     * Writing the cookie changes what the SERVER would say; it does nothing to
     * the copy the client already holds. Move to another tab and back within
     * that window and the cached tree — notice included — is replayed, so a
     * notice that is shown "once, ever" reappears on every soft navigation until
     * the cache expires. A hard reload skips the cache and looks fine, which is
     * what makes this easy to miss.
     *
     * `router.refresh()` re-fetches this route from the server, which now sees
     * the cookie. The staleTimes comment says the cache is cleared by the
     * `revalidatePath` in every server action behind a figure — dismissing a
     * notice is not one of those, so it has to ask for itself.
     */
    router.refresh();
    /**
     * ⚠️ NOT AWAITED, and a failure here is silent by design.
     * `recordDocumentAcceptance` returns quietly on every error path: a database
     * problem must never stop somebody dismissing a notice, and it must never
     * leave a row claiming an acceptance we could not actually write.
     *
     * ⚠️ AND IT IS GUARDED, because it takes NO userId — it resolves the
     * account from the session, so the preview harness mounting this with a
     * fake id would still write REAL consent rows against whoever is signed in.
     * See `shouldRecordAcceptance`.
     */
    if (shouldRecordAcceptance(userId)) void recordDocumentAcceptance();
  }, [userId, router]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[60] grid place-items-center bg-overlay-backdrop p-6 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rebrand-notice-title"
    >
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-border-default bg-bg-surface p-5 animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none">
        {/*
          THE SWAP. The old mark is clipped away left-to-right behind a flat
          amber bar and the new one is revealed in its wake — one pass, ~1.3s,
          then the bar is gone.

          ⚠️ The old wordmark is a REAL ASSET, not type. `public/legacy-wordmark.png`
          is the actual pre-rename logo, kept for this one surface because the
          display serif it was set in was retired from the UI and cannot be
          rendered live any more. Do not "tidy" it away: the moment only works
          if the thing leaving is the thing people recognise.
        */}
        <div
          className="relative mb-4 grid h-14 place-items-center overflow-hidden"
          aria-hidden
        >
          <span className="animate-rebrand-old absolute inset-0 grid place-items-center">
            <Image
              src="/legacy-wordmark.png"
              alt=""
              // ⚠️ 1049, NOT 1044, and that is not a typo. The two marks are
              // genuinely different widths: the retired serif is 1049x200 and
              // the new sans is 1044x200. This is the only place both appear,
              // so it is the only place the numbers must disagree.
              width={1049}
              height={200}
              className="h-6 w-auto"
              priority
            />
          </span>
          <span className="animate-rebrand-new absolute inset-0 grid place-items-center">
            <Image
              src="/trackd-wordmark.png"
              alt=""
              width={1044}
              height={200}
              className="h-6 w-auto"
              priority
            />
          </span>
          <span className="animate-rebrand-bar absolute inset-y-1 w-[3px] bg-accent-amber" />
        </div>

        <h2
          id="rebrand-notice-title"
          className="text-center text-lg font-medium text-foreground"
        >
          The name changed. Nothing else did.
        </h2>

        <p className="mt-2 text-center text-sm leading-relaxed text-pretty text-text-muted">
          You&apos;re now using {PRODUCT_NAME} — same app, same account, same
          everything you&apos;ve logged.
        </p>

        <p className="mt-4 text-[11px] leading-relaxed text-text-muted">
          By tapping OK you accept the updated{" "}
          <Link
            href="/terms"
            className="text-foreground underline underline-offset-2 hover:text-text-muted"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="text-foreground underline underline-offset-2 hover:text-text-muted"
          >
            Privacy Policy
          </Link>
          . {PRODUCT_NAME} is a business name of {LEGAL_ENTITY} (ACN {ACN}),
          which remains the company behind the app.
        </p>

        <button
          type="button"
          onClick={dismiss}
          className="mt-5 w-full inst-btn py-3 text-sm font-medium text-bg-base outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
        >
          OK
        </button>
      </div>
    </div>,
    document.body,
  );
}
