import Link from "next/link";

import { CaretRight, Hourglass } from "@/components/icons";

/**
 * A DECLINED PAYMENT, ON THE ONE SURFACE EVERYBODY OPENS (Group D).
 *
 * The push reaches only the minority who granted notification permission, and
 * `DeclinedCard` reaches only somebody who opens `/billing`. With push off and no
 * reason to open Billing, a customer's first news of a failed payment is being
 * locked out of logging a dose. This is the same fact on the home screen.
 *
 * ## ⚠️ NOT A POP-UP. FOUNDER'S RULING.
 *
 * The read-only pop-up already interrupts on a blocked write, and two dialogs
 * about one problem is how people stop reading both.
 *
 * ## The layout is `PlanEndsTodayBanner`'s, which is `TrialEndingBanner`'s
 *
 * Same surface, same hairline-free card, same hourglass, same caret, same 44px
 * tap target, same route to `/billing`. `ui-context.md`'s exception list gains
 * nothing. Not amber and not a tinted container: `08` §2 is explicit that this
 * state is recoverable by design and must not be dressed as an alarm, and
 * `DeclinedCard` follows the same rule on the screen this taps through to.
 *
 * ## ⚠️ NO DISMISS CONTROL, AND THAT IS A DECISION
 *
 * `TrialEndingBanner` has one because its window is days long and nothing is
 * wrong. This one describes a problem that is still true and still costing the
 * user something, and `DeclinedCard` already records the reasoning for its own
 * "Not now" persisting nothing: a warning somebody can wave away permanently is
 * one they can walk into read-only having been told once. It disappears when the
 * payment goes through, which is the only thing that should remove it.
 *
 * ## The words are not here
 *
 * `lib/billing/pastDueBannerCopy.ts` holds both signed sentences and decides which
 * one applies; this renders whichever it was handed. That split is
 * `signed/README.md`'s standing rule — copy that cannot be reached from `lib/`
 * cannot be pinned, and the read-only pop-up's first clause was reverted to a
 * wording D98 had ruled false with all 1573 tests green.
 */
export function PaymentFailedBanner({ line }: { line: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-bg-surface py-3 pl-4 pr-4">
      <Hourglass className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      <Link
        href="/billing"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* ⚠️ SIGNED COPY, built in `lib/billing/pastDueBannerCopy.ts` and pinned
            by `signedCopyPin.test.ts`. No em dash. */}
        <span className="block min-w-0 flex-1 text-sm leading-snug text-foreground">
          {line}
        </span>
        <CaretRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      </Link>
    </div>
  );
}
