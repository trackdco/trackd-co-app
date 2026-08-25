import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { StripeHandoff } from "@/components/billing/StripeHandoff";
import { CaretRight, CreditCard } from "@/components/icons";
import { formatAccessDate } from "@/lib/billing/manage";
import { manageSummaryFor, splitSummary } from "@/lib/billing/manageSummary";
import { loadBillingFacts } from "@/lib/billing/screenFacts";
import { cardOnFile } from "@/lib/billing/cardOnFile";
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
  /** Brand + last four for the Card row. Null on absent OR unreadable; see `cardOnFile`. */
  const card = await cardOnFile(user.id);

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

  /**
   * ⚠️ ONE ACTION, MATCHED TO THE STATE — and null is a real answer.
   *
   * Derived from the SAME `facts.action` the rest of billing reads, so this card
   * and `/billing`'s own controls cannot disagree about what this account can do.
   * Nothing new is computed here.
   */
  const manageAction: { label: string; href: string } | null =
    facts.action.kind === "resume"
      ? { label: "Keep my Pro plan", href: "/billing" }
      : facts.action.kind === "none" && !facts.accessLive
        ? { label: "Choose a plan", href: "/plans" }
        : null;

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
      {/**
        * ⚠️ IT IS A CARD NOW, NOT SUBTEXT (Adrian, 2026-08-23).
        *
        * It rendered as `text-sm text-text-muted` directly under the heading, and
        * on the contact sheet Adrian's reaction was that it *"just looks like a
        * weird subtext I wouldn't actually read"* — which is a problem, because
        * this sentence is the whole point of the screen. It is the one place that
        * says a payment failed, or that there is no plan, or that access is free
        * for life. A line nobody reads is a line that may as well be withheld.
        *
        * So it takes the same raised surface the billing pop-ups use, which is
        * the visual language this app already reserves for "read this".
        *
        * ## The action, and where it is deliberately absent
        *
        * One action, matched to the state, and ONLY where it opens a route that
        * is not already on this screen:
        *
        *   no plan      "Choose a plan"      -> `/plans`, which nothing else here
        *                                        offers
        *   cancelled    "Keep my Pro plan"   -> `/billing`, which owns the resume
        *                                        control (D22's label, unchanged)
        *   past due     none                 -> the Card row is the very next
        *                                        element. A button pointing at
        *                                        something 60px below it is noise,
        *                                        not help.
        *   healthy/comp none                 -> there is nothing to do
        */}
      {summary ? (
        /**
         * ⚠️ FORMAT B, CHOSEN FROM RENDERED ALTERNATIVES (Adrian, 2026-08-25).
         *
         * Title, subtext, then a CONTAINED button inset from the card. Three
         * formats were mocked on all three real situations; this one was picked
         * for a structural reason rather than a visual one:
         *
         * a full-width action row INHERITS whatever padding its card has, so the
         * same control came out wide on Billing and narrow on Manage and kept
         * drifting every time either card's padding moved. An INSET button is a
         * fixed distance from the card edge, so it is the same width wherever it
         * appears regardless of the card around it. That is the "universal
         * spacing rule" the review kept asking for, enforced by construction.
         *
         * ⚠️ THE TITLE IS THE SIGNED SENTENCE'S OWN FIRST HALF. `splitSummary`
         * is proven lossless against all fifteen signed lines — no word is
         * rewritten, reordered or dropped, only weighted differently.
         */
        <div className="mt-3 rounded-2xl bg-bg-surface">
          <div className="px-4 pt-3.5 pb-3">
            <p className="text-[15px] font-medium leading-snug text-pretty text-foreground">
              {splitSummary(summary).title}
            </p>
            {splitSummary(summary).rest ? (
              <p className="mt-1.5 text-[13px] leading-relaxed text-pretty text-text-muted">
                {splitSummary(summary).rest}
              </p>
            ) : null}
          </div>
          {manageAction ? (
            <div className="px-4 pb-3.5">
              <Link
                href={manageAction.href}
                /**
                 * ⚠️ THE CHEVRON RULE (Adrian, 2026-08-25).
                 *
                 * Amber ONLY inside an amber-tinted action; grey on every grey
                 * surface. That keeps ui-context's "one or two beats" intact —
                 * the tinted button and its chevron are ONE beat, not two,
                 * because they are one object. A chevron amber on a grey row
                 * would be the second, unearned beat the doc names as the
                 * vibe-coded tell.
                 */
                className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-accent/45 bg-accent/[0.09] px-3.5 text-sm font-medium text-accent outline-none transition-colors hover:bg-accent/[0.14] focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex-1">{manageAction.label}</span>
                <CaretRight className="h-4 w-4 shrink-0 text-accent" aria-hidden />
              </Link>
            </div>
          ) : null}
        </div>
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
          {/**
            * ⚠️ RECEIPTS IS WITHHELD UNTIL `19` BUILDS THE IN-APP LIST
            * (Adrian, 2026-08-23).
            *
            * It used to hand off to Stripe's portal with a note saying so. Two
            * reasons it is gone rather than reworded:
            *
            *   · Nobody has a receipt yet. Billing has never been switched on, so
            *     the row's only destination is an empty portal page — a surface
            *     that can only disappoint whoever taps it.
            *   · `19` is the real answer and is already specced: a list in the
            *     app, newest first, tapping through to the invoice itself. A
            *     half-built route to somebody else's origin is not a smaller
            *     version of that, it is a different thing wearing its label.
            *
            * The subtext went with it. It existed to explain the handoff, and
            * with no handoff there is nothing to explain.
            *
            * ⚠️ RESTORE THIS ROW WHEN `19` SHIPS — pointing at the in-app list,
            * NOT at the portal. `19` §5 keeps the portal only as the fallback for
            * a failed fetch, and `08`'s Card row keeps its own handoff either way.
            */}
          {/**
            * ⚠️ WITH NO STRIPE CUSTOMER THE CARD ROW STATES THE FACT AND DOES
            * NOTHING (Adrian, 2026-08-23).
            *
            * Manage is now reachable with no plan, and the only thing behind it is
            * a portal session — `billingPortal.sessions.create({ customer })` —
            * which has no customer id to open for somebody who has never paid.
            * A tappable row that cannot work is worse than a row that says so:
            * the user cannot tell it from a broken app, which is the same reason
            * the read-only signal is deliberately never throttled.
            *
            * So the row still appears, in the same place, at the same height. It
            * carries "None on file" instead of a chevron, and it is a `div`
            * rather than a button — not a disabled button, which would still take
            * focus and still invite the tap.
            */}
          {facts.hasStripeCustomer ? (
            <StripeHandoff
              rows={[
                {
                  key: "card",
                  label: "Card",
                  /**
                   * ⚠️ THE DIGITS, NOT A BARE "Card ›" (Adrian, 2026-08-25).
                   * Null when there is no card AND when Stripe could not be
                   * read — see `cardOnFile` for why those two are deliberately
                   * collapsed, and the condition under which they must not be.
                   */
                  note: card ? `${card.brand} •••• ${card.last4}` : "None on file",
                },
              ]}
            />
          ) : (
            <div className="flex w-full min-h-11 items-center gap-3 px-4 py-3.5 text-left">
              <CreditCard className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              <span className="flex-1 text-sm text-foreground">Card</span>
              <span className="text-sm text-text-muted">None on file</span>
            </div>
          )}
        </div>
      </section>

      {/* ⚠️ BACK TO BILLING, NOT TO PROFILE (§3.3) — that is where they came
          from. Same 44px shell as Billing's own back link: `min-h-11` outright
          rather than padding arithmetic on a line box, with the negative inline
          margin keeping the text optically where it was. */}
      <div className="mt-6 text-sm text-text-muted">
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
