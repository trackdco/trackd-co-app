import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GraceEndingNotice } from "@/components/billing/GraceEndingNotice";
import { BETA_GRACE_DAYS } from "@/lib/billing/betaGrace";
import { graceDaysLeft } from "@/lib/billing/graceEnding";
import { formatAccessDate, formatAccessDateShort } from "@/lib/billing/manage";

export const metadata: Metadata = {
  title: "Grace notice preview · Trackd Co",
  robots: { index: false, follow: false },
};

/**
 * DEV-ONLY preview of the seven-day grace notice, viewable WITHOUT signing in.
 *
 * ## Why the real screen cannot be looked at
 *
 * It renders for a signed-in account holding a beta-grace entitlement, once
 * ever, only while `BILLING_GATE_ENABLED` is true. There are 82 such accounts
 * and none of them is a developer, so the only ways to see the real thing are to
 * spend a real person's one-and-only sighting of it or to hand-write an
 * entitlement row. Neither is a way to check that a headline wraps.
 *
 * ## ⚠️ `?days=` DRIVES THE REAL COMPONENT, NOT A COPY OF IT
 *
 * The date is computed BACKWARDS from the requested day count through the same
 * `graceDaysLeft` the dashboard uses, so what renders is the production
 * component fed a production-shaped date. The cases worth driving:
 *
 *     /preview/grace-notice?days=7    what the cohort sees today
 *     /preview/grace-notice?days=1    "will end tomorrow"
 *     /preview/grace-notice?days=0    "will end today", and "After today"
 *     /preview/grace-notice?days=13   the count barely moves on entry
 *
 * Dismissing it here writes the real cookie for the fake user id below, which is
 * harmless: no account has that id, so no real person's notice is consumed.
 * Reload with a different `?days=` to bring it back, or clear the cookie.
 *
 * ## NOT REACHABLE IN PRODUCTION
 *
 * Gated on `VERCEL_ENV` rather than `NODE_ENV`, matching `preview/paywall` and
 * `onboarding/cost`: a Vercel preview deploy IS a production build, so a
 * `NODE_ENV` gate would 404 the exact link this exists to be reviewed through.
 */
export default async function GraceNoticePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  if (process.env.VERCEL_ENV === "production") notFound();

  const { days } = await searchParams;
  const requested = Math.min(BETA_GRACE_DAYS, Math.max(0, Number(days ?? 7) || 0));

  const tz = "Australia/Sydney";
  const now = new Date();

  /**
   * An expiry that IS `requested` local days away.
   *
   * ⚠️ FOUND BY ASKING `graceDaysLeft`, NOT BY ARITHMETIC. The first version
   * computed `Date.UTC(..., day + requested, 18:00)` on the reasoning that 18:00
   * UTC is 04:00 the next morning in Sydney, which is the real cohort's instant.
   * It was off by exactly one day, and the harness's own check caught it: asked
   * for 7, rendered 8.
   *
   * The arithmetic is easy to get wrong in two independent ways at once (the
   * next-morning roll, and the server's UTC date differing from the preview
   * zone's), and a harness that silently shows the wrong day teaches you the
   * wrong thing about the screen. So the offset is SEARCHED using the same
   * function the dashboard calls. It cannot disagree with production, because it
   * is asking production.
   *
   * ⚠️ IN HOURS, NOT DAYS, and `days=0` is why. The day-stepped version could
   * not express "ends later today": every candidate it built was 04:00 the next
   * morning somewhere, so the smallest answer it could reach was 1 and the final
   * morning was the one case the harness could not show. That is the case most
   * worth looking at, since it is the only one where the copy changes shape
   * ("will end today", "After today" rather than a date).
   */
  let activeUntil: string | null = null;
  for (let hours = 1; hours <= (BETA_GRACE_DAYS + 3) * 24; hours += 1) {
    const candidate = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
    if (graceDaysLeft(candidate, tz, now) === requested) {
      activeUntil = candidate;
      break;
    }
  }

  const resolved = activeUntil ? graceDaysLeft(activeUntil, tz, now) : null;

  return (
    <main className="min-h-dvh bg-bg-base">
      <div className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5">
        <p className="text-[10px] font-sans uppercase tracking-[0.18em] text-text-muted">
          Grace notice preview
        </p>
        <p className="font-mono text-xs tabular-nums text-text-subtle">
          asked {requested}d · resolved {String(resolved)}d · ends {activeUntil ?? "none"}
        </p>
        {resolved !== requested ? (
          <p className="text-sm text-state-error">
            The harness could not build a date {requested} days out, so nothing is
            shown. The date search above is wrong, not the component.
          </p>
        ) : null}
        {/* Stand-ins for the dashboard underneath, so the backdrop has something
            to sit over and the card can be judged in place. */}
        <div className="h-20 rounded-2xl bg-bg-surface" />
        <div className="h-32 rounded-2xl bg-bg-surface" />
        <div className="h-20 rounded-2xl bg-bg-surface" />
      </div>

      {/* ⚠️ ONLY when the harness hit the day it was asked for. A preview showing
          "8 days" to somebody who asked for 7 is worse than showing nothing: it
          is a bug report about the component that the component did not cause. */}
      {activeUntil && resolved === requested ? (
        <GraceEndingNotice
          userId="preview-not-a-real-account"
          daysLeft={resolved}
          endsOn={formatAccessDate(activeUntil, tz)}
          endsOnShort={formatAccessDateShort(activeUntil, tz)}
          countFrom={BETA_GRACE_DAYS}
        />
      ) : null}
    </main>
  );
}
