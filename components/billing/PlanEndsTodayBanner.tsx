import Link from "next/link";

import { CaretRight, Hourglass } from "@/components/icons";

/**
 * THE FINAL ENTITLED DAY, STATED ONCE (`05` §3.6b, decided 15 Aug 2026).
 *
 * > Your plan ends today.
 *
 * Signed copy, character for character, and deliberately cohort-neutral. It does
 * NOT say "your subscription has ended", because that is false for the ~85 beta
 * accounts who reach read-only having never had a subscription — telling somebody
 * a transaction ended that never happened is the app inventing history in the
 * message explaining why they cannot log a dose.
 *
 * ## ⚠️ WHY IT EXISTS WHEN `07` ALREADY HAS A BANNER
 *
 * `07`'s reminder covers a trial or a grace running out. It returns null on its
 * first line for `cancelAtPeriodEnd` and for any status that is not `trialing`
 * (`trialReminder.ts:291`), both deliberately — its promise is "before anything
 * changes", and for somebody who already cancelled, nothing is.
 *
 * That leaves two real cohorts with no final-day warning at all, measured by
 * driving on 2026-08-17: a cancelled trialist on their last entitled day, and a
 * paying account whose cancelled period ends today. Both saw ZERO banners. This
 * is the banner they get.
 *
 * ## ⚠️ ONE DAY ONLY, AND NOT DISMISSIBLE
 *
 * §3.6b: "Not a countdown, not a week of escalating notices. The reminder before
 * the ending is `07`'s job; this is the last day, stated once." There is no
 * dismissal cookie because there is nothing to remember: it renders on one local
 * day and is gone by itself. `TrialEndingBanner` needs one because its window is
 * days long.
 *
 * ## The layout is `TrialEndingBanner`'s, not a new one
 *
 * §3.6b: "Styled per the existing banner pattern... add nothing to
 * `ui-context.md`'s exception list." Same surface, same hairline-free card, same
 * hourglass, same caret, same 44px tap target, same route to `/billing`. The only
 * differences are the line and the absence of a dismiss control, both of which
 * are decisions rather than drift.
 */
export function PlanEndsTodayBanner() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-bg-surface py-3 pl-4 pr-4">
      <Hourglass className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      <Link
        href="/billing"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* ⚠️ SIGNED COPY. `05` §3.6b, character for character. No em dash. */}
        <span className="block min-w-0 flex-1 text-sm leading-snug text-foreground">
          Your plan ends today.
        </span>
        <CaretRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      </Link>
    </div>
  );
}
