import Image from "next/image";
import { notFound } from "next/navigation";

import { PricingPlans, type PricingData } from "@/components/billing/pricing-plans";
import { PRICE_ID, TRIAL_DAYS } from "@/lib/stripe/config";
import { stripe, stripeConfigured } from "@/lib/stripe/server";

/**
 * DEV-ONLY preview of the Subscription / billing screen, viewable without signing
 * in. Shows the real pricing UI with live test-mode amounts, and — via sample
 * mode — lets "Subscribe" launch real Stripe-hosted Checkout WITHOUT an account
 * so the flow can be sampled. No tier flips (no user is attached). 404s in prod.
 */
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
  } catch {
    return { monthly: null, annual: null };
  }
}

export default async function PreviewBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { checkout } = await searchParams;
  const pricing = await loadPricing();

  return (
    <div className="flex min-h-dvh flex-col">
      <header
        className="flex items-center justify-between border-b border-border/60 px-5"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          paddingBottom: "0.75rem",
        }}
      >
        <Image
          src="/trackd-wordmark.png"
          alt="trackd co"
          width={1049}
          height={200}
          className="h-4 w-auto"
        />
        <span className="rounded-full bg-bg-surface-raised px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">
          Preview · Subscription
        </span>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-6 py-10">
        {checkout === "success" ? (
          <p className="mb-4 rounded-xl border border-accent-green/40 bg-accent-green/10 px-4 py-3 text-sm text-foreground">
            Sample checkout complete — that&rsquo;s the real Stripe flow. (No
            account was upgraded; this is a preview.)
          </p>
        ) : null}
        {checkout === "cancel" ? (
          <p className="mb-4 rounded-xl border border-border bg-bg-surface px-4 py-3 text-sm text-text-muted">
            Sample checkout canceled — nothing was charged.
          </p>
        ) : null}

        <PricingPlans pricing={pricing} trialDays={TRIAL_DAYS} sample />

        <p className="mt-6 text-xs text-text-subtle">
          Preview — &ldquo;Subscribe&rdquo; here runs a real test-mode Stripe
          checkout (use card 4242 4242 4242 4242), but won&rsquo;t upgrade a real
          account.
        </p>
      </main>
    </div>
  );
}
