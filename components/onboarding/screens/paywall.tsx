"use client";

import { useEffect, useState } from "react";

import type { ReactNode } from "react";

import {
  Calculator,
  ChartLine,
  CircleNotch,
  Package,
  Syringe,
} from "@/components/icons";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { track } from "@/lib/onboarding/analytics";
import { validateCode, type CodeVerdict } from "@/lib/onboarding/affiliate";
import {
  formatPrice,
  PLANS,
  TRIAL_DAYS,
  weeklyEquivalent,
  yearlySavingPercent,
  type PlanId,
} from "@/lib/onboarding/pricing";
import { CARD_EYEBROW } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { FlowCta, StepFrame } from "../chrome";
import { PaywallHero } from "../paywall-hero";
import { useFlow } from "../flow-context";

/**
 * Screen 10 — Paywall. AUTH + PAYMENT (Spec 3-01 §6, §9).
 *
 * This is the only place an account or a payment is asked for, and it sits
 * AFTER the whole demo by design.
 *
 * ## What is real here and what is not
 *
 * **Real:** every screen state, the plan cards, the code capture/validate/apply
 * path, and Google OAuth (the existing `GoogleSignInButton`, threaded back to
 * `?step=welcome` so auth returns INTO the flow rather than dropping the user
 * on the dashboard).
 *
 * **Stubbed, deliberately:** the RevenueCat trial-start and the payment sheet.
 * This project has no RevenueCat integration at all (`architecture.md` lists
 * Stripe as deferred and there is no RevenueCat dependency), and wiring live
 * billing from a preview branch would create real billing objects against real
 * customers. `startTrial()` below is the single seam: it is where
 * `Purchases.purchase()` goes, and nothing else needs to move.
 *
 * The preview path is explicit rather than hidden, so nobody can mistake a
 * stubbed trial for a real one.
 */

/** Each row gets the icon of the thing it names, which reads as a contents
 *  page rather than four identical ticks (Adrian: "the ticks could be better"). */
const VALUE_STACK: { icon: ReactNode; label: string; detail: string }[] = [
  {
    icon: <Package className="h-4 w-4" />,
    label: "Unlimited cycles and stock",
    detail: "Every compound, every vial, always current",
  },
  {
    icon: <Calculator className="h-4 w-4" />,
    label: "Reconstitution calculator",
    detail: "Powder, water and dose, drawn to scale",
  },
  {
    icon: <Syringe className="h-4 w-4" />,
    label: "Injection site record",
    detail: "Your rotation, kept for you",
  },
  {
    icon: <ChartLine className="h-4 w-4" />,
    label: "Journal and bloodwork history",
    detail: "Mapped to the protocol that produced it",
  },
];

export function PaywallScreen() {
  const { session, patch, goNext, setAccountName } = useFlow();
  const [verdict, setVerdict] = useState<CodeVerdict>({ status: "none" });
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeDraft, setCodeDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const saving = yearlySavingPercent();

  useEffect(() => {
    track("paywall_viewed");
  }, []);

  // A code that arrived on the deep link is validated and applied on entry, so
  // most users never type anything. An invalid one falls through to the
  // standard price without saying a word (§6: never blocks the trial).
  useEffect(() => {
    let live = true;
    if (!session.affiliateCode) return;
    void validateCode(session.affiliateCode).then((v) => {
      if (!live) return;
      setVerdict(v);
      if (v.status === "applied") {
        track("affiliate_code_applied", { code: v.code });
        if (v.annualOnly) patch({ plan: "yearly" });
      } else if (v.status === "invalid") {
        track("affiliate_code_invalid", { code: v.code });
      }
    });
    return () => {
      live = false;
    };
  }, [session.affiliateCode, patch]);

  const applyTypedCode = async () => {
    const v = await validateCode(codeDraft);
    setVerdict(v);
    if (v.status === "applied") {
      track("affiliate_code_applied", { code: v.code });
      patch({ affiliateCode: v.code, ...(v.annualOnly ? { plan: "yearly" as const } : {}) });
      setCodeOpen(false);
    } else if (v.status === "invalid") {
      track("affiliate_code_invalid", { code: v.code });
    }
  };

  const selectPlan = (plan: PlanId) => {
    patch({ plan });
    track("plan_selected", { plan });
  };

  /**
   * THE STUB. In order, the real chain is:
   *   1. Google OAuth / email        <- already real, see the button below
   *   2. RevenueCat trial-start      <- goes here
   *   3. Apple Pay / Google Pay / card sheet, $0 authorisation
   *   4. merge the anonymous session onto the account, record attribution
   *   5. Welcome
   * Steps 2 and 3 currently resolve immediately. Step 4 has nowhere to write
   * until there is an account, so it is left for the auth integration.
   */
  const startTrial = async () => {
    setBusy(true);
    track("auth_started", { method: "preview" });
    await new Promise((r) => setTimeout(r, 700));
    track("auth_completed", { method: "preview" });
    track("trial_started", { plan: session.plan, days: TRIAL_DAYS });
    setAccountName(null);
    setBusy(false);
    goNext();
  };

  return (
    <StepFrame
      title="Unlock the full Trackd."
      footer={
        <div className="space-y-3">
          <FlowCta onClick={startTrial} disabled={busy}>
            {busy ? (
              <span className="flex items-center justify-center gap-2">
                <CircleNotch className="h-4 w-4 animate-spin" />
                Starting
              </span>
            ) : (
              `Start ${TRIAL_DAYS}-day free trial`
            )}
          </FlowCta>
          <p className="text-center text-[0.75rem] text-text-muted">
            {formatPrice(0)} today. We&apos;ll remind you before it ends.
          </p>
        </div>
      }
    >
      <div className="flex flex-1 flex-col gap-5">
        <PaywallHero />

        {/* What they are buying, as a contents page. */}
        <ul className="divide-y divide-border-default rounded-2xl bg-bg-surface px-5">
          {VALUE_STACK.map((item) => (
            <li key={item.label} className="flex items-start gap-3.5 py-3.5">
              <span className="mt-[2px] shrink-0 text-text-muted" aria-hidden>
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9rem] leading-snug text-foreground">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-[0.75rem] leading-snug text-text-subtle">
                  {item.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>

        {/* Plan cards */}
        <div
          role="radiogroup"
          aria-label="Choose a plan"
          className="grid grid-cols-2 gap-3"
        >
          {(["yearly", "monthly"] as const).map((id) => {
            const plan = PLANS[id];
            const active = session.plan === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => selectPlan(id)}
                className={cn(
                  "relative rounded-2xl p-4 text-left",
                  "transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "motion-reduce:transition-none active:scale-[0.98]",
                  active
                    ? "bg-bg-surface-raised ring-1 ring-accent-primary"
                    : "bg-bg-surface",
                )}
              >
                <p className="text-[10px] font-sans uppercase tracking-[0.18em] text-text-muted">
                  {plan.label}
                </p>
                <p className="mt-2 font-mono text-xl font-light tabular-nums text-foreground">
                  {formatPrice(plan.price)}
                  <span className="ml-1 text-[11px] text-text-muted">
                    /{plan.period === "year" ? "yr" : "mo"}
                  </span>
                </p>
                {id === "yearly" ? (
                  <p className="mt-1 font-mono text-[11px] tabular-nums text-text-muted">
                    {formatPrice(weeklyEquivalent(plan))}/wk
                  </p>
                ) : null}

                {id === "yearly" && saving !== null ? (
                  <span className="absolute -top-2 right-3 rounded-full bg-accent-amber px-2 py-0.5 text-[10px] font-medium text-bg-base">
                    Save {saving}%
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Affiliate code */}
        <div>
          {verdict.status === "applied" ? (
            <p className="text-center text-[0.8rem] text-text-muted">
              Code{" "}
              <span className="font-mono text-foreground">{verdict.code}</span>{" "}
              applied
            </p>
          ) : codeOpen ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  value={codeDraft}
                  onChange={(e) => setCodeDraft(e.target.value)}
                  placeholder="Creator code"
                  aria-label="Creator code"
                  autoCapitalize="characters"
                  className="h-11 min-w-0 flex-1 rounded-xl bg-bg-input px-4 font-mono text-sm uppercase text-foreground outline-none placeholder:font-sans placeholder:normal-case placeholder:text-text-subtle focus-visible:ring-2 focus-visible:ring-ring"
                />
                <button
                  type="button"
                  onClick={applyTypedCode}
                  className="h-11 shrink-0 rounded-xl bg-bg-surface-raised px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Apply
                </button>
              </div>
              {verdict.status === "invalid" ? (
                <p className="text-[0.75rem] text-text-muted">
                  That code is not active. The standard price applies.
                </p>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCodeOpen(true)}
              className="mx-auto block rounded-md px-3 py-2 text-xs text-text-subtle transition-colors hover:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              Have a code?
            </button>
          )}
        </div>

        {/* The real auth entry point, kept visible so the stub above can never
            be mistaken for the shipping path. */}
        <div className="rounded-2xl bg-bg-surface p-4">
          <p className={CARD_EYEBROW}>Real sign-in</p>
          <p className="mt-2 text-[0.75rem] leading-relaxed text-text-muted">
            The trial button above runs a stubbed auth and payment chain for
            preview. This is the live Google path.
          </p>
          <div className="mt-3">
            <GoogleSignInButton next="/onboarding?step=welcome" />
          </div>
        </div>
      </div>
    </StepFrame>
  );
}
