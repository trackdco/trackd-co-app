"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Crown, Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { startCheckout, startSampleCheckout } from "@/lib/stripe/actions";
import type { Cadence } from "@/lib/stripe/config";

/** Raw price (minor units / cents) so the client can compute savings + /mo. */
export type Money = { cents: number; currency: string };
export type PricingData = { monthly: Money | null; annual: Money | null };

type Plan = "free" | "monthly" | "annual";
const PLAN_TABS: { value: Plan; label: string }[] = [
  { value: "free", label: "Free" },
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Yearly" },
];

// Pro value stack — real Trackd Co capabilities. Easy to tweak.
const PRO_FEATURES = [
  "Unlimited cycles & protocols",
  "Full compound, peptide & supplement library",
  "Dose logging with injection-site rotation",
  "Inventory & stock tracking with runway",
  "Bloodwork upload & biomarker trends",
  "Dose reminders & low-stock alerts",
  "Journal, weight & progress photos",
];

// PLACEHOLDER free-tier content — the free/paid split isn't decided yet. These
// are deliberately thin so Free reads as "limited". Replace after the brainstorm.
const FREE_PLACEHOLDER = {
  included: ["Track 1 active cycle", "Basic dose logging", "Core compound list"],
  locked: [
    "Bloodwork & biomarker trends",
    "Reminders & low-stock alerts",
    "Unlimited cycles & full library",
  ],
};

function money(cents: number, currency: string): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Conversion-focused pricing with a 3-way Free / Monthly / Yearly selector. Free
 * shows a deliberately understated (placeholder) card; Monthly/Yearly show the
 * Pro plan with a per-month price that cross-fades on switch and a yearly-only
 * savings badge. Micro-interactions throughout; disabled under reduced-motion.
 */
export function PricingPlans({
  pricing,
  trialDays,
  sample = false,
}: {
  pricing: PricingData;
  trialDays: number;
  /** DEV preview only: route "Subscribe" through the no-auth sample checkout. */
  sample?: boolean;
}) {
  const [plan, setPlan] = useState<Plan>("annual");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { monthly, annual } = pricing;
  const currency = annual?.currency ?? monthly?.currency ?? "usd";
  const isFree = plan === "free";
  const isAnnual = plan === "annual";
  const cadence: Cadence = isAnnual ? "annual" : "monthly";

  const savings = useMemo(() => {
    if (!monthly || !annual) return null;
    const annualized = monthly.cents * 12;
    if (annualized <= annual.cents) return null;
    const amountCents = annualized - annual.cents;
    const pct = Math.round((amountCents / annualized) * 100);
    return pct > 0 ? { pct, amountCents } : null;
  }, [monthly, annual]);

  const active = isAnnual ? annual : monthly;
  const perMonthCents = isAnnual
    ? annual
      ? Math.round(annual.cents / 12)
      : null
    : (monthly?.cents ?? null);

  const indicatorTranslate =
    plan === "free"
      ? "translate-x-0"
      : plan === "monthly"
        ? "translate-x-full"
        : "translate-x-[200%]";

  function subscribe() {
    setError(null);
    startTransition(async () => {
      const res = await (sample ? startSampleCheckout : startCheckout)(cadence);
      if (res.url) {
        window.location.href = res.url;
        return;
      }
      setError(res.error ?? "Something went wrong. Please try again.");
    });
  }

  return (
    <div className="animate-in fade-in-0 duration-500 ease-out motion-reduce:animate-none">
      {/* Hero */}
      <h1 className="font-display text-[2rem] font-medium leading-[1.1] tracking-[-0.02em] text-foreground">
        Unlock the full Trackd
      </h1>
      <p className="mt-2 text-sm text-text-muted">
        Every tool to plan, run and dial in your protocol — in one place.
      </p>

      {/* Free / Monthly / Yearly selector (sliding pill) + yearly-only savings */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Plan"
          className="relative inline-grid grid-cols-3 rounded-full border border-border bg-bg-surface p-1"
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-1 left-1 w-[calc((100%_-_0.5rem)/3)] rounded-full bg-accent-primary shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none ${indicatorTranslate}`}
          />
          {PLAN_TABS.map((t) => {
            const on = plan === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setPlan(t.value)}
                className={`relative z-10 rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-300 ${
                  on ? "text-bg-base" : "text-text-muted hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        {isAnnual && savings ? (
          <span className="animate-in fade-in-0 zoom-in-90 duration-300 ease-out rounded-full bg-accent-green/15 px-2.5 py-1 text-xs font-semibold text-accent-green motion-reduce:animate-none">
            Save {savings.pct}%
          </span>
        ) : null}
      </div>

      {/* Card — Free OR Pro. Keyed by free/pro so the swap animates, but toggling
          monthly<->yearly keeps the "pro" key (only the price block re-animates). */}
      {isFree ? (
        <div
          key="free"
          className="mt-5 rounded-3xl border border-border bg-bg-surface/60 p-6 animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ease-out motion-reduce:animate-none"
        >
          <div className="flex items-center gap-2">
            <span className="font-display text-xl font-medium text-text-muted">
              Free
            </span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-subtle">
              Draft
            </span>
          </div>

          <div className="mt-4 flex items-end gap-1.5">
            <span className="font-display text-5xl font-medium leading-none text-text-muted tabular-nums">
              {money(0, currency)}
            </span>
            <span className="mb-1 text-sm text-text-subtle">/mo</span>
          </div>
          <p className="mt-2 text-sm text-text-subtle">
            The basics to get started. Final contents TBD.
          </p>

          <Button
            type="button"
            variant="outline"
            disabled
            className="mt-5 h-12 w-full rounded-xl text-[0.95rem] text-text-muted"
          >
            Current plan
          </Button>

          <div className="mt-6 border-t border-border/60 pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
              What&rsquo;s included
            </p>
            <ul className="mt-3 space-y-2">
              {FREE_PLACEHOLDER.included.map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-2.5 text-sm text-text-muted"
                >
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-text-muted"
                    aria-hidden="true"
                  />
                  <span>{f}</span>
                </li>
              ))}
              {FREE_PLACEHOLDER.locked.map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-2.5 text-sm text-text-subtle"
                >
                  <Lock
                    className="mt-0.5 size-4 shrink-0 text-text-subtle"
                    aria-hidden="true"
                  />
                  <span>
                    {f} <span className="text-[11px]">· Pro</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div
          key="pro"
          className="group relative mt-5 overflow-hidden rounded-3xl border border-accent-amber/40 bg-bg-surface transition-colors duration-300 hover:border-accent-amber/60 animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ease-out motion-reduce:animate-none"
        >
          <div className="p-6">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2">
                <span className="font-display text-xl font-medium text-foreground">
                  Pro
                </span>
                <span className="rounded-full bg-accent-amber/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-amber">
                  Most popular
                </span>
              </span>
              <Crown
                className="size-5 text-accent-amber transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 motion-reduce:transform-none"
                aria-hidden="true"
              />
            </div>

            {active ? (
              <div
                key={cadence}
                className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ease-out motion-reduce:animate-none"
              >
                <div className="mt-4 flex items-end gap-1.5">
                  <span className="font-display text-5xl font-medium leading-none text-foreground tabular-nums">
                    {perMonthCents != null ? money(perMonthCents, currency) : "—"}
                  </span>
                  <span className="mb-1 text-sm text-text-muted">/mo</span>
                </div>

                {isAnnual ? (
                  <p className="mt-2 text-sm text-text-muted">
                    {annual ? (
                      <>Billed {money(annual.cents, currency)}/year</>
                    ) : null}
                    {savings ? (
                      <>
                        {" · "}
                        <span className="font-medium text-accent-green">
                          save {money(savings.amountCents, currency)}/yr
                        </span>
                      </>
                    ) : null}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-text-muted">
                    Billed monthly
                    {monthly && annual ? <> · switch to yearly to save</> : null}
                  </p>
                )}

                {isAnnual ? (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-green/15 px-3 py-1 text-xs font-medium text-accent-green">
                    {trialDays}-day free trial included
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-sm text-text-muted">
                Pricing is unavailable right now.
              </p>
            )}

            {error ? (
              <p
                role="alert"
                className="animate-in fade-in-0 slide-in-from-top-1 duration-200 mt-4 text-sm text-[var(--state-error)] motion-reduce:animate-none"
              >
                {error}
              </p>
            ) : null}

            <Button
              onClick={subscribe}
              size="lg"
              disabled={pending || !active}
              aria-busy={pending}
              className="mt-5 h-12 w-full rounded-xl text-[0.95rem] duration-100 hover:brightness-105 active:scale-[0.98] motion-reduce:active:scale-100"
            >
              {pending ? (
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              ) : null}
              {isAnnual ? `Start ${trialDays}-day free trial` : "Subscribe"}
            </Button>

            <p className="mt-2.5 text-center text-xs text-text-subtle">
              {isAnnual
                ? `Free for ${trialDays} days, then ${annual ? money(annual.cents, currency) : ""}/year. Cancel anytime.`
                : "Cancel anytime."}
            </p>
          </div>

          {/* Pro value stack — staggered reveal */}
          <div className="border-t border-border/60 bg-bg-surface-raised/40 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
              With Pro, unlock
            </p>
            <ul className="mt-3 space-y-2.5">
              {PRO_FEATURES.map((f, i) => (
                <li
                  key={f}
                  style={{ animationDelay: `${150 + i * 55}ms` }}
                  className="flex items-start gap-2.5 text-sm text-foreground animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
                >
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-accent-green"
                    aria-hidden="true"
                  />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
