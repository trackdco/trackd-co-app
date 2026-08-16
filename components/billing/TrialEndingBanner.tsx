"use client";

import Link from "next/link";
import { useState } from "react";

import { Hourglass, CaretRight, X } from "@/components/icons";
import { dismissTrialNotice } from "@/lib/billing/trialNoticeStore";

/**
 * THE TRIAL'S FINAL STRETCH, ON SCREEN.
 *
 * The push (`lib/notifications/trialReminder.ts`) only reaches somebody who
 * granted notification permission, and today that is 17 of 106 accounts. This is
 * the same promise on a surface everybody has.
 *
 * ## It says one thing
 *
 * When the trial ends. Two drafts died getting there — one offered reassurance
 * nobody asked for, the other explained its own warning — and the line is built
 * by `trialNoticeLine` in the same module the push uses, so the two surfaces
 * cannot word the same fact differently.
 *
 * ## The SERVER decides whether this renders at all
 *
 * Dismissal is a cookie, read in `cookies()` before the page is built, so a
 * dismissed banner is never sent to the browser. This component used to read
 * `localStorage` after hydration and remove itself, which a cold review measured
 * as a 166ms paint of a dismissed notice followed by a 68px page jump, on every
 * single load. See `lib/billing/trialNoticeStore.ts`.
 *
 * The only state left here is the tap itself: hide immediately, and the cookie
 * takes care of every load after this one.
 */
export function TrialEndingBanner({
  line,
  body = null,
  forDate,
  userId,
}: {
  /** Built server-side by `trialNoticeLine`, already in the user's timezone. */
  line: string;
  /**
   * A second, quieter line. COURTESY PERIODS ONLY (`07` §3.4's D33).
   *
   * The trial and grace banners are deliberately one bare sentence, cut back
   * twice by Adrian on the grounds that everything after the first full stop is
   * something the reader has to decide whether to care about. D33 signs a body
   * for the courtesy variant specifically, because that line names this message
   * as the promised reminder and so closes the loop with the offer's terms line.
   *
   * Defaulted null so the two older variants are untouched by construction.
   */
  body?: string | null;
  /** The notice's identity, so a dismissal is scoped to this trial. */
  forDate: string;
  /** …and to this account, so one person's dismissal cannot hide another's. */
  userId: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-bg-surface py-3 pl-4 pr-2">
      <Hourglass className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      <Link
        href="/billing"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-snug text-foreground">{line}</span>
          {/* Quieter and beneath, per D33. Absent for the trial and grace
              variants, which are one sentence by decision. */}
          {body ? (
            <span className="mt-1 block text-xs leading-relaxed text-text-muted">{body}</span>
          ) : null}
        </span>
        <CaretRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      </Link>
      {/*
        A 44px tap target, which is Apple's floor. It was 24×24 (`p-1` around a
        16px icon) and a cold review dispatched a real touch grid at it: 18px
        left of centre the LINK won and the user was navigated to Billing
        instead of closing the notice. The failure mode of a near-miss on a
        dismiss button should be nothing happening, not a page change.

        The icon stays 16px and the extra size is padding, so the banner looks
        identical; `pr-2` on the row compensates so the optical spacing is
        unchanged.
      */}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          dismissTrialNotice(userId, forDate);
        }}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-subtle outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
