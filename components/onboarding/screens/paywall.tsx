"use client";

import { useEffect, useState } from "react";

import { CaretDown, CircleNotch } from "@/components/icons";
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

export function PaywallScreen() {
  const { session, patch, goNext, setAccountName } = useFlow();
  const [verdict, setVerdict] = useState<CodeVerdict>({ status: "none" });
  const [codeDraft, setCodeDraft] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
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
            Stay free for five days. We&apos;ll remind you before it ends.
          </p>
        </div>
      }
    >
      <div className="flex flex-1 flex-col gap-5">
        <PaywallHero />

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

        {/* Affiliate code. A card you can see, that unfolds when tapped
            (Adrian, 2026-08-01) — a bare link was too quiet for the one action
            a creator's audience is explicitly told to take, and a permanently
            open field was noise for everyone else. Grid-rows rather than
            height, so it animates from nothing to its natural size without the
            height being known up front. */}
        {verdict.status === "applied" ? (
          <div className="flow-card flex items-center justify-between gap-3 rounded-2xl bg-accent-amber/10 px-5 py-4">
            <span className="text-[0.85rem] text-accent-amber">Code applied</span>
            <span className="font-mono text-sm uppercase tracking-[0.08em] text-accent-amber">
              {verdict.code}
            </span>
          </div>
        ) : (
          <div className="flow-card overflow-hidden rounded-2xl bg-bg-surface">
            <button
              type="button"
              onClick={() => setCodeOpen((o) => !o)}
              aria-expanded={codeOpen}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <span className="text-[0.9rem] text-foreground">Have a code?</span>
              <CaretDown
                className={cn(
                  "h-4 w-4 shrink-0 text-text-subtle transition-transform duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none",
                  codeOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>

            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-[420ms] ease-[var(--motion-ease)] motion-reduce:transition-none",
                codeOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <div className="space-y-2 px-5 pb-5">
                  <div className="flex gap-2">
                    <input
                      value={codeDraft}
                      onChange={(e) => setCodeDraft(e.target.value)}
                      placeholder="Creator code"
                      aria-label="Creator code"
                      autoCapitalize="characters"
                      autoComplete="off"
                      className="h-12 min-w-0 flex-1 rounded-xl bg-bg-input px-4 font-mono text-sm uppercase text-foreground outline-none placeholder:font-sans placeholder:normal-case placeholder:text-text-subtle focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <button
                      type="button"
                      onClick={applyTypedCode}
                      disabled={!codeDraft.trim()}
                      className="h-12 shrink-0 rounded-xl bg-bg-surface-raised px-5 text-sm text-foreground transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              </div>
            </div>
          </div>
        )}

        {/* The real auth entry point, kept visible so the stub above can never
            be mistaken for the shipping path. */}
        <div className="flow-card rounded-2xl bg-bg-surface p-4">
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
