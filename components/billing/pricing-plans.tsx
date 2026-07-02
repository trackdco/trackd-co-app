"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Crown, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { startCheckout, startSampleCheckout } from "@/lib/stripe/actions";
import type { Cadence } from "@/lib/stripe/config";
import { PAGE_TITLE } from "@/lib/ui-presets";

/** Raw price (minor units / cents) so the client can compute savings + /mo. */
export type Money = { cents: number; currency: string };
export type PricingData = { monthly: Money | null; annual: Money | null };

const CADENCE_TABS: { value: Cadence; label: string }[] = [
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
 * Paid-only pricing: one Pro plan, billed Monthly or Yearly. There's no free
 * plan — everyone starts a free trial, then pays. A "Have a beta code?" field
 * passes an optional code to checkout (a valid beta code extends the trial to
 * two weeks). Amber is the single accent (chrome/identity, per ui-context);
 * micro-interactions throughout, all disabled under reduced-motion.
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
  const [cadence, setCadence] = useState<Cadence>("annual");
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { monthly, annual } = pricing;
  const currency = annual?.currency ?? monthly?.currency ?? "usd";
  const isAnnual = cadence === "annual";

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

  const indicatorTranslate = isAnnual ? "translate-x-full" : "translate-x-0";

  function subscribe() {
    setError(null);
    const trimmed = code.trim();
    startTransition(async () => {
      const res = await (sample ? startSampleCheckout : startCheckout)(
        cadence,
        trimmed || undefined,
      );
      if (res.url) {
        window.location.href = res.url;
        return;
      }
      setError(res.error ?? "Something went wrong. Please try again.");
    });
  }

  return (
    <div>
      {/* Hero */}
      <h1 className={PAGE_TITLE}>Unlock the full Trackd</h1>
      <p className="mt-2 text-sm text-text-muted">
        Every tool to plan, run and dial in your protocol — in one place.
      </p>

      {/* Monthly / Yearly selector (sliding pill) + yearly-only savings */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Billing period"
          className="relative inline-grid grid-cols-2 rounded-full border border-border bg-bg-surface p-1"
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-1 left-1 w-[calc((100%_-_0.5rem)/2)] rounded-full bg-accent-amber shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none ${indicatorTranslate}`}
          />
          {CADENCE_TABS.map((t) => {
            const on = cadence === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setCadence(t.value)}
                className={`relative z-10 rounded-full px-5 py-1.5 text-sm font-medium transition-colors duration-300 ${
                  on ? "text-bg-base" : "text-text-muted hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        {isAnnual && savings ? (
          <span className="animate-in fade-in-0 zoom-in-90 duration-300 ease-out rounded-full bg-accent-amber/15 px-2.5 py-1 text-xs font-semibold text-accent-amber motion-reduce:animate-none">
            Save {savings.pct}%
          </span>
        ) : null}
      </div>

      {/* Pro card */}
      <div className="group relative mt-5 overflow-hidden rounded-2xl border border-accent-amber/40 bg-bg-surface transition-colors duration-300 hover:border-accent-amber/60">
        <div className="p-5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2">
              <span className="font-display text-xl font-medium tracking-[-0.01em] text-foreground">
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
                  {annual ? <>Billed {money(annual.cents, currency)}/year</> : null}
                  {savings ? (
                    <>
                      {" · "}
                      <span className="font-medium text-accent-amber">
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

              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-amber/15 px-3 py-1 text-xs font-medium text-accent-amber">
                {trialDays}-day free trial included
              </p>
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
            Start {trialDays}-day free trial
          </Button>

          <p className="mt-2.5 text-center text-xs text-text-subtle">
            Free for {trialDays} days, then{" "}
            {active ? money(active.cents, currency) : ""}/
            {isAnnual ? "year" : "month"}. Cancel anytime.
          </p>

          {/* Have a beta code? — optional; a valid code extends the trial. */}
          <div className="mt-4 border-t border-border/60 pt-4">
            {showCode ? (
              <div className="animate-in fade-in-0 slide-in-from-top-1 duration-200 motion-reduce:animate-none">
                <label
                  htmlFor="beta-code"
                  className="text-xs font-medium text-text-muted"
                >
                  Beta code
                </label>
                <input
                  id="beta-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Enter your code"
                  className="mt-1.5 h-11 w-full rounded-xl border border-border bg-bg-input px-3.5 text-sm text-foreground outline-none transition-colors placeholder:text-text-subtle focus:border-accent-amber/60"
                />
                <p className="mt-1.5 text-xs text-text-subtle">
                  Applied at checkout.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCode(true)}
                className="text-xs font-medium text-text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                Have a beta code?
              </button>
            )}
          </div>
        </div>

        {/* Pro value stack — staggered reveal */}
        <div className="border-t border-border/60 bg-bg-surface-raised/40 p-5">
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
                  className="mt-0.5 size-4 shrink-0 text-accent-amber"
                  aria-hidden="true"
                />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
