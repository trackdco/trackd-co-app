import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CancelSubscription } from "@/components/billing/CancelSubscription";
import { ManagePaymentRow } from "@/components/billing/ManagePaymentRow";
import { STAYING_NOTICE_SLOT } from "@/components/billing/StayingNotice";
import { currentEntitlement } from "@/lib/billing/entitlements";
import { billingGateEnabled } from "@/lib/billing/gate";
import {
  formatAccessDate,
  manageActionFor,
  planLabelFor,
} from "@/lib/billing/manage";
import { loadPricesSafe } from "@/lib/billing/prices";
import { formatPrice } from "@/lib/onboarding/pricing";
import { CARD_EYEBROW, PAGE_TITLE } from "@/lib/ui-presets";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Billing · Trackd Co" };

/**
 * Billing — what you're on, when it renews, and how to stop it.
 *
 * Opened from the App card on Profile, at its own route for the same reason
 * `/notifications` has one: it is a subject with its own controls, not a value
 * that fits on a row.
 *
 * ## It cannot start billing, and that is structural
 *
 * There is no link to `/onboarding` on this page and no upgrade control. A user
 * with no subscription is told what they are on and nothing else. That is not a
 * gap to be filled in later without a decision: Adrian's standing rule is that
 * nothing may route a user at the paywall until he says so, and a "Subscribe"
 * button here would be exactly that route.
 *
 * ## What it reads
 *
 * `entitlements` decides what access rests on, because that is the only table
 * that decides anything. `subscriptions` supplies the DATES and the cancel flag,
 * which is the mirror doing the job it exists for — stating "renews on the 14th"
 * without a network call. Nothing here gates on the mirror.
 */
export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: subs }, { data: customer }, entitlement] =
    await Promise.all([
      supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle(),
      // ⚠️ FILTERED AND ORDERED THE SAME WAY THE ACTION DECIDES.
      //
      // This had NO status filter and ordered by `updated_at`, while the action
      // filtered to live statuses. A cold review put a dead `incomplete_expired`
      // row (which `startTrial` creates when it cancels an abandoned attempt)
      // beside a live trial: the page rendered "This one can't be changed from
      // here. Email support@trackdco.app" and offered no cancel control, for a
      // user whose trial Stripe said was perfectly live and about to bill.
      //
      // Soonest-ending first, so an imminent charge is what the screen shows.
      supabase
        .from("subscriptions")
        .select(
          "status, trial_ends_at, current_period_end, cancel_at_period_end, stripe_price_id",
        )
        .eq("user_id", user.id)
        .in("status", ["trialing", "active", "past_due"])
        .order("current_period_end", { ascending: true })
        .limit(1),
      // Whether there is anything for the Stripe portal to open onto. A user can
      // legitimately have a customer row and no live subscription (they
      // cancelled and it lapsed), and their invoices are still theirs to read.
      supabase
        .from("billing_customers")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle(),
      currentEntitlement(),
    ]);
  const hasStripeCustomer = Boolean(customer?.stripe_customer_id);

  const tz = (profile?.timezone as string | null) || "Australia/Sydney";
  const row = subs?.[0];

  /**
   * ⚠️ READ IN ITS OWN QUERY, and its failure is swallowed.
   *
   * `courtesy_until` arrives with `supabase/billing/003`, which Adrian applies
   * by hand. Folding it into the select above would mean an unapplied migration
   * takes down the WHOLE billing screen -- PostgREST rejects the entire request
   * for one unknown column -- so somebody trying to see what they are paying
   * would get nothing at all.
   *
   * Exactly the shape `notifications/004` uses for the same reason, and the same
   * lesson `trialLease.ts` paid for: the deploy and the migration do not land in
   * the same instant, and the code has to be correct in the gap.
   *
   * Unapplied, this is null and the label falls back to today's behaviour.
   */
  const courtesyUntil = await courtesyUntilFor(user.id);
  const subscription = row
    ? {
        status: row.status as string,
        trialEndsAt: (row.trial_ends_at as string | null) ?? null,
        currentPeriodEnd: (row.current_period_end as string | null) ?? null,
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
        courtesyUntil,
      }
    : null;

  // The entitlement's own end date goes in as well: it is the table that
  // DECIDES access, and where it and the mirror disagree the screen must state
  // the earlier of the two. See `manageActionFor` — a `past_due` user was being
  // promised twenty-seven days past the day they actually go read only.
  const action = manageActionFor(
    entitlement?.source ?? null,
    subscription,
    entitlement?.activeUntil ?? null,
  );

  // The plan's name and amount, matched by price id. `loadPricesSafe` returns an
  // empty list when Stripe is unconfigured (which is production today), so every
  // consumer below is written to render nothing rather than a blank number.
  const prices = await loadPricesSafe();
  const price = row?.stripe_price_id
    ? prices.find((p) => p.priceId === row.stripe_price_id)
    : undefined;

  return (
    <div className="animate-home-up mx-auto w-full max-w-md px-5 pt-4 pb-5">
      {/* NO SUBTITLE. It read "Your plan and when it renews." and Adrian cut it
          (2026-08-12): the Plan card underneath already says the plan and the
          date, so the line was a caption for something that captions itself.
          `/notifications` keeps its subtitle because it introduces a screen full
          of switches whose purpose is not self-evident; this one does not. */}
      <h1 className={PAGE_TITLE}>Billing</h1>

      {/**
       * WHERE THE "Glad you're staying." CARD LANDS, and why it is a slot.
       *
       * `03-cancel-flow.md` §3.10 puts that card at the TOP of Billing, while
       * the state it follows from belongs to the resume action, which runs in
       * `CancelSubscription` further down the page. The card is portaled up into
       * this element rather than lifting the whole screen into a client
       * component: the state stays in the component that took the action (§3.10
       * forbids persisting it anywhere), this file stays a Server Component, and
       * `08-billing-screen.md` can move one empty div when it places things.
       *
       * Empty until a resume happens, so it costs nothing in every other state.
       */}
      {/* `role="status"` sits on the SLOT, not on the card. A live region
          inserted into the document at the same instant as its text is the
          classic case a screen reader skips; this one is in the server-rendered
          markup long before there is anything to announce. */}
      <div id={STAYING_NOTICE_SLOT} role="status" />

      <section className="mt-6">
        <p className={`mb-3 ${CARD_EYEBROW}`}>Plan</p>
        <div className="overflow-hidden rounded-2xl bg-bg-surface">
          <Row
            label="Access"
            value={planLabelFor(
              entitlement?.source ?? null,
              subscription,
              // See `planLabelFor`: the same switch that decides the read-only
              // gate decides whether "no entitlement" reads as "Pro" or
              // "Read only". They cannot be allowed to disagree.
              billingGateEnabled(),
            )}
          />
          {price ? (
            <>
              <Divider />
              <Row
                label="Price"
                value={`${formatPrice(price.amount, price.currency)} ${price.currency.toUpperCase()} / ${price.interval}`}
              />
            </>
          ) : null}
          {subscription?.trialEndsAt && subscription.status === "trialing" ? (
            <>
              <Divider />
              <Row
                label="Trial ends"
                value={formatAccessDate(subscription.trialEndsAt, tz)}
              />
            </>
          ) : null}
          {renewalRow(action, subscription, tz)}
        </div>
      </section>

      {/* The control, quiet and in its own block so it is neither buried nor
          competing with the summary above it. */}
      {action.kind === "cancel" || action.kind === "resume" ? (
        <section className="mt-6">
          <div className="rounded-2xl bg-bg-surface px-4 py-1">
            <CancelSubscription
              mode={action.kind}
              endsOn={formatAccessDate(action.endsOn, tz)}
              isTrial={action.isTrial}
              userId={user.id}
            />
          </div>
          {action.kind === "resume" ? (
            <p className="mt-3 px-1 text-xs leading-relaxed text-text-muted">
              {/* The tail used to end "unless you restart it", which named a
                  control that no longer says restart. It now states the two
                  facts and stops: what you keep, and that nothing is coming. */}
              You&apos;ll keep everything until{" "}
              {formatAccessDate(action.endsOn, tz)}, and nothing more will be
              charged. You can change your mind until then.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Handing card details to Stripe rather than touching them. Shown only to
          someone who HAS a Stripe customer, since there is nothing to manage
          otherwise. Not shown for an App Store subscription: Apple holds the
          payment method there, and a Stripe portal would be about a customer
          that has no card on it. */}
      {hasStripeCustomer && action.kind !== "store" ? (
        <section className="mt-6">
          <div className="overflow-hidden rounded-2xl bg-bg-surface">
            <ManagePaymentRow />
          </div>
        </section>
      ) : null}

      {action.kind === "store" ? (
        <p className="mt-6 px-1 text-sm leading-relaxed text-text-muted">
          This subscription is managed by{" "}
          {action.store === "apple" ? "the App Store" : "Google Play"}, so it can
          only be changed there.
        </p>
      ) : null}

      {/**
        * ⚠️ A LIVE SUBSCRIPTION THE MIRROR HAS NOT HEARD OF IS NOT "NO
        * SUBSCRIPTION", AND IT MUST NOT RENDER AS SILENCE.
        *
        * A cold review deleted the mirror row while Stripe still said
        * `trialing` — the `unattributed` state the webhook route deliberately
        * leaves unprocessed, plus any 500'd handler or in-flight window — and
        * the whole screen came back as "Access / Pro / Payment method and
        * invoices". No price, no date, no cancel control, and no signpost. The
        * ACTION would have worked (it asks Stripe, not the mirror); only the
        * screen could not reach it.
        *
        * So a user who has a Stripe customer but no readable subscription gets
        * the same support line as any other subscription we can see but cannot
        * act on. Same string, one more way to arrive at it.
        */}
      {action.kind === "unavailable" ||
      (action.kind === "none" &&
        action.reason === "no-subscription" &&
        hasStripeCustomer) ? (
        <p className="mt-6 px-1 text-sm leading-relaxed text-text-muted">
          This one can&apos;t be changed from here. Email{" "}
          <a className="text-foreground" href="mailto:support@trackdco.app">
            support@trackdco.app
          </a>{" "}
          and we&apos;ll sort it out.
        </p>
      ) : null}

      <div className="mt-10 text-sm text-text-muted">
        <Link href="/profile" className="hover:text-foreground">
          ← Back to profile
        </Link>
      </div>
    </div>
  );
}

/**
 * The save-offer courtesy end, or null if there isn't one (or if `003` has not
 * been applied yet).
 *
 * Its own query, its own try, and it can only ever change one word on the
 * screen. See the note at the call site.
 */
async function courtesyUntilFor(userId: string): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("subscriptions")
      .select("courtesy_until")
      .eq("user_id", userId)
      .in("status", ["trialing", "active", "past_due"])
      .not("courtesy_until", "is", null)
      .order("courtesy_until", { ascending: false })
      .limit(1);
    if (error) return null;
    return (data?.[0]?.courtesy_until as string | null) ?? null;
  } catch {
    return null;
  }
}

/* ── Pure display helpers ────────────────────────────────────────── */

/** "Renews on" / "Ends on", depending on whether a cancellation is scheduled. */
function renewalRow(
  action: ReturnType<typeof manageActionFor>,
  subscription: { currentPeriodEnd: string | null } | null,
  tz: string,
) {
  if (action.kind !== "cancel" && action.kind !== "resume") return null;
  const when = formatAccessDate(action.endsOn, tz);
  if (!when) return null;
  /**
   * On a trial the date is already stated above as "Trial ends", so this row
   * would repeat it. The guard covered `cancel` only, and a cold review loaded
   * the RESUME screen and got the same date three times:
   *
   *     Trial ends  13 Aug 2026
   *     Ends on     13 Aug 2026
   *     "You'll keep everything until 13 Aug 2026."
   *
   * Two rows, two labels, one date, read as two different deadlines to somebody
   * who has just cancelled and is re-reading the screen to be sure.
   */
  if (action.isTrial) return null;
  /**
   * ⚠️ "Renews on" IS A CLAIM ABOUT WHAT HAPPENS NEXT, AND IT HAS TO BE TRUE.
   *
   * `action.endsOn` is the earlier of the mirror's period end and the
   * entitlement's, which is right for the dialog and wrong under this label the
   * moment the two disagree — and they disagree exactly when the subscription is
   * `past_due`. A cold review measured "Renews on 26 Aug 2026" for an account
   * whose access dies on the 26th and whose next Stripe attempt is the 29th.
   * Nothing renews on that date, so the row says what the date actually is.
   */
  const label =
    action.kind === "resume" || action.accessEndsEarly ? "Ends on" : "Renews on";
  return (
    <>
      <Divider />
      <Row label={label} value={when} />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="flex-1 text-sm text-foreground">{label}</span>
      <span className="shrink-0 text-sm text-text-muted">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="mx-4 hairline-t" aria-hidden />;
}
