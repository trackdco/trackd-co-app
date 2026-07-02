import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown } from "lucide-react";

import { ManageSubscriptionButton } from "@/components/billing/manage-subscription-button";
import { PricingPlans, type PricingData } from "@/components/billing/pricing-plans";
import { isFounder } from "@/lib/admin";
import { PRICE_ID, TRIAL_DAYS } from "@/lib/stripe/config";
import { stripe, stripeConfigured } from "@/lib/stripe/server";
import { createClient } from "@/lib/supabase/server";
import { CARD_ICON_BADGE, CARD_TITLE, PAGE_TITLE } from "@/lib/ui-presets";

export const metadata: Metadata = {
  title: "Subscription — Trackd Co",
};

// Statuses that mean "currently has a plan" — show manage UI rather than pricing.
const ACTIVE_STATUSES = new Set(["trialing", "active", "past_due"]);

/** Pull live amounts from Stripe so the page always matches the dashboard. */
async function loadPricing(): Promise<PricingData> {
  if (!stripeConfigured || !PRICE_ID.monthly || !PRICE_ID.annual) {
    return { monthly: null, annual: null };
  }
  try {
    const [m, a] = await Promise.all([
      stripe.prices.retrieve(PRICE_ID.monthly),
      stripe.prices.retrieve(PRICE_ID.annual),
    ]);
    return {
      monthly:
        m.unit_amount != null
          ? { cents: m.unit_amount, currency: m.currency }
          : null,
      annual:
        a.unit_amount != null
          ? { cents: a.unit_amount, currency: a.currency }
          : null,
    };
  } catch (err) {
    console.error("[billing] failed to load prices:", err);
    return { monthly: null, annual: null };
  }
}

/**
 * Subscription screen (gated by the (app) layout). Founders get Pro free by
 * email allowlist — no Stripe. Everyone else sees "Manage subscription" when
 * they have an active/trialing/past_due sub, or the pricing card otherwise.
 * Entitlement itself is read from profiles.tier (+ isFounder) elsewhere — this
 * page is the buy/manage surface, not a gate.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { checkout } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const founder = isFounder(user.email);

  // Founders are free by allowlist, so they never carry a subscription — skip
  // the read and the Stripe price fetch entirely.
  let sub: {
    status: string;
    cadence: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null = null;
  if (!founder) {
    const res = await supabase
      .from("subscriptions")
      .select("status, cadence, current_period_end, cancel_at_period_end")
      .eq("user_id", user.id)
      .maybeSingle();
    sub = res.data;
  }

  const hasActive = sub ? ACTIVE_STATUSES.has(sub.status) : false;
  const pricing =
    founder || hasActive ? { monthly: null, annual: null } : await loadPricing();

  return (
    <div className="animate-home-up mx-auto w-full max-w-md px-5 pt-4 pb-5">
      {checkout === "success" ? (
        <p className="mb-4 rounded-xl border border-accent-green/40 bg-accent-green/10 px-4 py-3 text-sm text-foreground">
          You&rsquo;re subscribed. Your plan may take a moment to appear here.
        </p>
      ) : null}
      {checkout === "cancel" ? (
        <p className="mb-4 rounded-xl border border-border bg-bg-surface px-4 py-3 text-sm text-text-muted">
          Checkout canceled — you weren&rsquo;t charged.
        </p>
      ) : null}

      {founder ? (
        <FounderPlan />
      ) : hasActive && sub ? (
        <>
          <h1 className={PAGE_TITLE}>Subscription</h1>
          <ActivePlan sub={sub} />
        </>
      ) : (
        <PricingPlans pricing={pricing} trialDays={TRIAL_DAYS} />
      )}

      <div className="mt-10 text-sm text-text-muted">
        <Link href="/settings" className="hover:text-foreground">
          ← Back to settings
        </Link>
      </div>
    </div>
  );
}

/** Founder comp — Pro on the house, no Stripe involved. */
function FounderPlan() {
  return (
    <>
      <h1 className={PAGE_TITLE}>Subscription</h1>
      <section className="mt-6 rounded-2xl border border-accent-amber/40 bg-bg-surface p-5">
        <div className="flex items-center gap-3">
          <span className={CARD_ICON_BADGE} aria-hidden="true">
            <Crown className="size-5" />
          </span>
          <span className={CARD_TITLE}>Founder access</span>
        </div>
        <p className="mt-3 text-sm text-text-muted">
          Full Pro access, free — no subscription needed.
        </p>
      </section>
    </>
  );
}

function ActivePlan({
  sub,
}: {
  sub: {
    status: string;
    cadence: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  };
}) {
  const cadenceLabel =
    sub.cadence === "annual"
      ? "Yearly"
      : sub.cadence === "monthly"
        ? "Monthly"
        : "Plan";
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;
  const statusLabel =
    sub.status === "trialing"
      ? "Free trial"
      : sub.status === "past_due"
        ? "Payment overdue"
        : "Active";

  return (
    <section className="mt-6">
      <div className="rounded-2xl border border-border bg-bg-surface p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
          Current plan
        </p>
        <p className={`mt-2 ${CARD_TITLE}`}>
          {cadenceLabel} &middot; {statusLabel}
        </p>
        {periodEnd ? (
          <p className="mt-1 text-sm text-text-muted">
            {sub.cancel_at_period_end
              ? `Ends ${periodEnd}`
              : sub.status === "trialing"
                ? `Trial ends ${periodEnd}`
                : `Renews ${periodEnd}`}
          </p>
        ) : null}
      </div>

      <div className="mt-4">
        <ManageSubscriptionButton />
      </div>
    </section>
  );
}
