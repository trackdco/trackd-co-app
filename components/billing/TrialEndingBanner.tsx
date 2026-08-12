"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { Hourglass, CaretRight, X } from "@/components/icons";
import {
  dismissTrialNotice,
  getTrialNoticeDismissed,
  getTrialNoticeServerSnapshot,
  subscribeTrialNotice,
} from "@/lib/billing/trialNoticeStore";

/**
 * THE TRIAL'S FINAL STRETCH, ON SCREEN.
 *
 * The push (`lib/notifications/trialReminder.ts`) only reaches somebody who
 * granted notification permission, and today that is 17 of 106 accounts. This is
 * the same promise on a surface everybody has.
 *
 * ## It says two things and stops
 *
 * When the trial ends, and that billing starts then. No reassurance, no "your
 * data is safe", no "cancel now" — a first draft carried a second sentence about
 * everything being kept and Adrian cut it on sight (2026-08-12): it answers a
 * question nobody asked, and softening a billing notice is how a billing notice
 * stops being believed.
 *
 * The line itself is built by `trialNoticeLine` in the same module the push uses,
 * so the two surfaces cannot word the same fact differently.
 *
 * ## Dismissal is per-trial, and lives on the device
 *
 * Keyed by the notice's own `forDate`, so closing it closes THIS trial's notice
 * and a returning customer's second trial is announced again. It is a display
 * preference, so it lives on the device (`lib/billing/trialNoticeStore.ts`) and
 * is read through `useSyncExternalStore` rather than an effect: the server gets
 * its own snapshot, so SSR and the first client render agree and a dismissed
 * banner never flashes in before hiding itself.
 */
export function TrialEndingBanner({
  line,
  forDate,
}: {
  /** Built server-side by `trialNoticeLine`, already in the user's timezone. */
  line: string;
  /** The notice's identity, so a dismissal is scoped to this trial. */
  forDate: string;
}) {
  const dismissedFor = useSyncExternalStore(
    subscribeTrialNotice,
    getTrialNoticeDismissed,
    getTrialNoticeServerSnapshot,
  );

  // Only a dismissal of THIS trial hides it. A stale key from a previous trial
  // is simply a different date and does not match.
  if (dismissedFor === forDate) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-bg-surface px-4 py-3">
      <Hourglass className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      <Link
        href="/billing"
        className="flex flex-1 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex-1 text-sm leading-snug text-foreground">{line}</span>
        <CaretRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismissTrialNotice(forDate)}
        className="-mr-1 shrink-0 rounded-md p-1 text-text-subtle outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
