import Link from "next/link";

import { CaretRight, Warning } from "@/components/icons";

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
    <div className="flex items-center gap-2.5 rounded-2xl bg-bg-surface py-3 pl-3.5 pr-3">
      {/* Warning, not Hourglass (Adrian, 2026-08-25). An hourglass says "this is
          taking a while", which is the wrong sentence for a failed payment:
          nothing is in progress, something has gone wrong and needs them.
          The TRIAL-ending banner keeps its hourglass deliberately -- nothing is
          wrong for that person, time is genuinely passing and they have a
          decision to make, which is what an hourglass means. */}
      <Warning className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      <Link
        href="/billing"
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* ⚠️ SIGNED COPY, built in `lib/billing/pastDueBannerCopy.ts` and pinned
            by `signedCopyPin.test.ts`. No em dash. */}
        {/**
          * ⚠️ `text-pretty` PLUS A MEASURE, because `text-pretty` ALONE DID NOT
          * FIX IT (Adrian, 2026-08-25).
          *
          * The signed line is "Your payment didn't go through. Update your card
          * by {date} to keep access." — long enough that at 390 it broke to
          * three lines with "access." alone on the last one. `text-pretty` asks
          * the browser to avoid an orphan but it cannot invent horizontal room:
          * the icon, the chevron and the padding left a very narrow column, so
          * every break point was forced.
          *
          * `leading-snug` -> `leading-relaxed` and a slightly smaller size widen
          * nothing, so the real fix is the CONTAINER: the chevron and icon gaps
          * were eating ~56px of a 350px card. Tightening those gives the sentence
          * the width to break two-and-two instead of two-and-one.
          *
          * ⚠️ NOT ONE CHARACTER OF THE COPY CHANGES. It is signed and pinned.
          */}
        <span className="block min-w-0 flex-1 text-sm leading-relaxed text-pretty text-foreground">
          {line}
        </span>
        <CaretRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      </Link>
    </div>
  );
}
