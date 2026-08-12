import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CancelSubscription } from "@/components/billing/CancelSubscription";
import { ManagePaymentRow } from "@/components/billing/ManagePaymentRow";
import { currentEntitlement } from "@/lib/billing/entitlements";
import { formatAccessDate, manageActionFor, planLabelFor } from "@/lib/billing/manage";
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
      supabase
        .from("subscriptions")
        .select(
          "status, trial_ends_at, current_period_end, cancel_at_period_end, stripe_price_id",
        )
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
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
  const subscription = row
    ? {
        status: row.status as string,
        trialEndsAt: (row.trial_ends_at as string | null) ?? null,
        currentPeriodEnd: (row.current_period_end as string | null) ?? null,
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      }
    : null;

  const action = manageActionFor(entitlement?.source ?? null, subscription);

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

      <section className="mt-6">
        <p className={`mb-3 ${CARD_EYEBROW}`}>Plan</p>
        <div className="overflow-hidden rounded-2xl bg-bg-surface">
          <Row label="Access" value={planLabelFor(entitlement?.source ?? null, subscription)} />
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
            />
          </div>
          {action.kind === "resume" ? (
            <p className="mt-3 px-1 text-xs leading-relaxed text-text-muted">
              You&apos;ll keep everything until{" "}
              {formatAccessDate(action.endsOn, tz)}. Nothing more will be charged
              unless you restart it.
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

      {action.kind === "unavailable" ? (
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
  // On a trial the date is already stated above as "Trial ends", so this row
  // would repeat it. What changes is only the WORD, so only the word is shown.
  if (action.isTrial && action.kind === "cancel") return null;
  return (
    <>
      <Divider />
      <Row
        label={action.kind === "resume" ? "Ends on" : "Renews on"}
        value={when}
      />
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
