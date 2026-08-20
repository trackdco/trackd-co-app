import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { StripeHandoff } from "@/components/billing/StripeHandoff";
import { formatAccessDate } from "@/lib/billing/manage";
import { manageSummaryFor } from "@/lib/billing/manageSummary";
import { loadBillingFacts } from "@/lib/billing/screenFacts";
import { formatPrice } from "@/lib/onboarding/pricing";
import { CARD_EYEBROW, PAGE_TITLE } from "@/lib/ui-presets";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Manage · Trackd Co" };

/**
 * MANAGE — the sentence, then Card, then Receipts.
 *
 * `08-billing-screen.md` §3.3, and D39: **`/billing/manage`, the first nested
 * route in this app.**
 *
 * ## ⚠️ Why a nested route here when every other route is one segment deep
 *
 * Q89 established that no sub-route pattern exists; §3.3 makes it a decision
 * rather than a discovery. "Every authenticated route is one segment deep today,
 * and the flat-sibling precedent was set because a parent was being REMOVED —
 * which is not this situation. A sub-page with a working back button is both the
 * correct shape here and consistent with why that precedent existed."
 *
 * ## The house shape, followed rather than invented (§3.3)
 *
 * Its own metadata title, a bare page-title heading with no chevron and no app
 * bar, the fixed bottom nav still visible, and a plain text back link at the foot.
 * **The back link reads back to Billing rather than to Profile, because that is
 * where the user came from.**
 *
 * ## ⚠️ IT READS THE SAME FACTS AS `/billing`, FROM THE SAME FUNCTION
 *
 * `loadBillingFacts` resolves the row this screen is about, and `/billing` calls
 * it too. Two screens one tap apart describing the same subscription must not be
 * able to pick different rows — that is the $69.99 defect with a second chance to
 * happen. See `lib/billing/screenFacts.ts`.
 */
export default async function ManagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const facts = await loadBillingFacts(user.id);

  /**
   * ⚠️ EVERY SUBSTITUTION IS FORMATTED HERE, ON THE SERVER, IN THE USER'S OWN
   * TIMEZONE — and `manageSummaryFor` receives strings it cannot have computed.
   *
   * §0: "Every number and date on this screen comes from the server, formatted in
   * the user's stored timezone before it reaches the client. Nothing here computes
   * or formats a date in the browser."
   *
   * The INTERVAL is the price's own `recurring.interval`, never the literal
   * "year": a monthly subscriber reads "a month" because that is what their price
   * says. The AMOUNT carries its currency, per D25.
   */
  const summary = manageSummaryFor({
    entitlement: facts.entitlement,
    subscription: facts.subscription,
    actionKind: facts.action.kind,
    namesATrial:
      facts.action.kind === "cancel" || facts.action.kind === "resume"
        ? facts.action.namesATrial
        : false,
    endsOn:
      facts.action.kind === "cancel" || facts.action.kind === "resume"
        ? formatAccessDate(facts.action.endsOn, facts.tz)
        : null,
    graceEndsOn: facts.entitlement?.activeUntil
      ? formatAccessDate(facts.entitlement.activeUntil, facts.tz)
      : null,
    /**
     * ⚠️ THE RUNNING PERIOD, NOT THE RECORDED ONE (Group C). `courtesy_until` is
     * never cleared, so this read the raw marker and told a customer whose free
     * month ended in July that their plan is free until a date in the past.
     * `facts.courtesyRunningUntil` is `/billing`'s own value, so the "Free until"
     * row there and this sentence cannot disagree about whether it is running.
     */
    courtesyEndsOn: facts.courtesyRunningUntil
      ? formatAccessDate(facts.courtesyRunningUntil, facts.tz)
      : null,
    courtesyRunning: facts.courtesyRunningUntil !== null,
    price: facts.price
      ? `${formatPrice(facts.price.amount, facts.price.currency)} ${facts.price.currency.toUpperCase()}`
      : null,
    interval: facts.price?.interval ?? null,
    gateEnabled: facts.gateEnabled,
    /**
     * ⚠️ FROM `entitlements`, THE TABLE THAT DECIDES ACCESS (1.3, 1.4) — not from
     * the two dates disagreeing, which they do not on a real revocation.
     *
     * `accessEndsEarly` used to be threaded in here and is deliberately NOT any
     * more: this sentence never wanted "will anything renew on this date", and
     * asking it is why the signed suspended sentence could not fire.
     * `/billing`'s "Renews on" vs "Ends on" verb still takes it, unchanged, and
     * that reader is correct.
     */
    accessLive: facts.accessLive,
    accessRevoked: facts.accessRevoked,
    accessRevokedReason: facts.accessRevokedReason,
  });

  return (
    <div className="animate-home-up mx-auto w-full max-w-md px-5 pt-4 pb-5">
      <h1 className={PAGE_TITLE}>Manage</h1>

      {/**
        * ⚠️ THE ONE SENTENCE (§3.3, D84 re-decided 2026-08-18).
        *
        * D84 was resolved against a sentence describing what the SCREEN DOES
        * rather than what the user is ON — a different job, which §3.3 itself
        * flagged as a change of purpose. The signed per-state set is what the
        * brief originally asked for, and it REPLACES that line, so Manage still
        * carries exactly one summary. Nothing is lost: §3.4's handoff dialog says
        * "Stripe handles payments for Trackd Co, so your card details never touch
        * us" to the same person one tap later, at the moment it matters.
        *
        * ⚠️ IT CAN BE ABSENT, AND ABSENT IS CORRECT. `paused`, `unpaid` and
        * `incomplete` have no signed sentence and get none (R5(b)) — Billing's
        * D83 support line is what speaks for them. A state whose date or price
        * cannot be read gets none either, rather than a sentence with a gap in it.
        */}
      {summary ? (
        <p className="mt-2 text-sm leading-relaxed text-text-muted">{summary}</p>
      ) : null}

      <section className="mt-6">
        <p className={`mb-3 ${CARD_EYEBROW}`}>Payment</p>
        <div className="overflow-hidden rounded-2xl bg-bg-surface">
          {/**
            * ⚠️ THE SPLIT §3.3 ASKS FOR, AND IT IS ONE COMPONENT.
            *
            * "The existing single row does both jobs and is replaced by two. That
            * row is also the only caller of the portal action; splitting it must
            * not create a second caller that skips the handoff dialog in §3.4."
            *
            * So this is a longer `rows` array on the SAME component, which still
            * owns the only `openBillingPortal` call in the app. Two rows, one
            * dialog, one call site.
            *
            * ⚠️ Receipts states that it hands off, per §5's checkbox and §3.3:
            * "Receipts leaves only until `19` builds the in-app list." Stated on
            * the screen rather than implied, so nobody is surprised by the origin
            * they land on.
            */}
          <StripeHandoff
            rows={[
              { key: "card", label: "Card" },
              {
                key: "receipts",
                label: "Receipts",
                note: "Opens your receipts at Stripe until we build them in here.",
              },
            ]}
          />
        </div>
      </section>

      {/* ⚠️ BACK TO BILLING, NOT TO PROFILE (§3.3) — that is where they came
          from. Same 44px shell as Billing's own back link: `min-h-11` outright
          rather than padding arithmetic on a line box, with the negative inline
          margin keeping the text optically where it was. */}
      <div className="mt-10 text-sm text-text-muted">
        <Link
          href="/billing"
          className="-ml-2 inline-flex min-h-11 items-center rounded-md px-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          ← Back to billing
        </Link>
      </div>
    </div>
  );
}
