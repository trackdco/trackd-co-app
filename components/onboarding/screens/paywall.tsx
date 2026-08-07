"use client";

import { useEffect, useState } from "react";

import { Bell, CaretDown, Check, CircleNotch, Crown, Lock } from "@/components/icons";
import { track } from "@/lib/onboarding/analytics";
import { validateCode, type CodeVerdict } from "@/lib/onboarding/affiliate";
import {
  billingDate,
  formatPrice,
  monthlyEquivalent,
  PLAN_ORDER,
  PLANS,
  REMINDER_DAY,
  TRIAL_DAYS,
  yearlySavingPercent,
  type PlanId,
} from "@/lib/onboarding/pricing";
import { cn } from "@/lib/utils";

import { FlowCta, StepFrame } from "../chrome";
import { useFlow } from "../flow-context";

/**
 * Screen 10 — Paywall. AUTH + PAYMENT (Spec 3-01 §6, §9).
 *
 * This is the only place an account or a payment is asked for, and it sits
 * AFTER the whole demo by design.
 *
 * ## What is real here and what is not
 *
 * **Real:** every screen state, the plan cards, and the code
 * capture/validate/apply path.
 *
 * **There is now NO auth on this screen at all.** The `GoogleSignInButton` was
 * removed 2026-08-05 at Adrian's call, pending a decision on the billing
 * provider. It was the only thing here that ever authenticated, so the screen
 * cannot currently produce an account — which is fine while `startTrial()` is a
 * stub and is a blocker the moment it is not.
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

/**
 * THE TRIAL TIMELINE (Adrian, 2026-08-05, from a reference paywall he sent).
 *
 * Three beats saying exactly what happens and when. It is the single highest
 * trust-per-pixel thing on a paywall: the fear being answered is "am I about to
 * be charged without noticing", and a timeline answers it more plainly than any
 * reassurance copy can.
 *
 * The first two beats are AMBER and the last is white — Adrian's call, and it
 * is the right way round. Amber means "live / this is happening for you"
 * throughout the app; the billing beat is the one that has NOT happened, so
 * lighting it would say the opposite of what it means. It also keeps the amber
 * count on this screen honest.
 *
 * Every figure is derived from `TRIAL_DAYS`. The screen says these days out
 * loud, so a hardcoded number is a promise that silently breaks the moment the
 * trial length changes.
 *
 * NOTE: the reminder beat is a COMMITMENT, not decoration. It promises a
 * notification before billing, and nothing currently sends one — the trial
 * reminder is built after billing is wired, because it needs a real trial end
 * date to fire against. Do not ship this screen to paying users until that
 * exists, or the paywall is making a promise the product does not keep.
 */
function trialTimeline(now: Date) {
  return [
    {
      id: "today",
      icon: Lock,
      title: "Today",
      body: "Get the whole of Trackd. Every compound, every log, every screen.",
      lit: true,
    },
    {
      id: "reminder",
      icon: Bell,
      title: `Day ${REMINDER_DAY} · Reminder`,
      body: "We'll notify you that your trial is ending, before anything changes.",
      lit: true,
    },
    {
      id: "billing",
      icon: Crown,
      title: `Day ${TRIAL_DAYS} · Billing starts`,
      body: `You'll be charged on ${billingDate(now)} unless you cancel any time before.`,
      lit: false,
    },
  ];
}

export function PaywallScreen() {
  const { session, patch, goNext, setAccountName } = useFlow();
  const [verdict, setVerdict] = useState<CodeVerdict>({ status: "none" });
  const [codeDraft, setCodeDraft] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const saving = yearlySavingPercent();
  // Resolved ONCE on mount. Reading the clock during render would let the
  // billing date change under the user mid-session, and the whole point of
  // printing it is that it is a fixed commitment.
  const [timeline] = useState(() => trialTimeline(new Date()));

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
    // A network failure here must never be an unhandled rejection or a dead
    // Apply button: an invalid code already falls through to standard price,
    // so an unreachable validator does the same.
    const v = await validateCode(codeDraft).catch(
      () => ({ status: "invalid", code: codeDraft.toUpperCase() }) as const,
    );
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
    /**
     * NO PINNED FOOTER (Adrian, 2026-08-05). The headline states the offer and
     * you scroll to the button.
     *
     * This is the second screen in the flow to leave the pinned model, and like
     * the founder letter it is deliberate: a pinned trial CTA is committable
     * from the moment the screen opens, which is how this screen previously
     * shipped a defect where the price could be paid without ever having been
     * on screen. That was patched by reordering the blocks so the plan cards
     * came first; unpinning removes the possibility rather than the instance,
     * because the CTA is now BELOW the price by construction and cannot be
     * reached without it having been scrolled past.
     */
    <StepFrame title={`Start your ${TRIAL_DAYS}-day free trial.`}>
      <div className="flex flex-1 flex-col gap-5">
        {/* THE TIMELINE IS THE ONLY GRAPHIC ON THIS SCREEN NOW (Adrian,
            2026-08-07). The carousel moved to the `free` screen, which is the
            one selling what the week contains; this screen asks for a decision,
            and a ring turning above the prices was competing with it.
            "Slightly bigger, since the carousel won't be there" — so the beats
            get the room the ring was using: 40px discs instead of 32, the type
            up one step each, and the rhythm opened from `space-y-5` to `-7`. It
            is the same component, not a redesign. */}
        <ol className="relative space-y-7 py-2">
          {timeline.map((beat, i) => {
            const Icon = beat.icon;
            const last = i === timeline.length - 1;
            return (
              <li key={beat.id} className="relative flex gap-4">
                {/* The connector, drawn from THIS beat down to the next. It
                    takes the colour of the beat it leaves, so the amber run
                    stops exactly where the trial does. */}
                {!last ? (
                  <span
                    aria-hidden
                    /* `left-[19px]` centres the rail under a 40px disc, and
                       `top-10` starts it below one. Both were sized for the
                       32px disc and would have drawn the rail off-centre. */
                    className={cn(
                      "absolute left-[19px] top-10 h-[calc(100%+0.75rem)] w-[2px] rounded-full",
                      beat.lit ? "bg-accent-amber/45" : "bg-bg-surface-raised",
                    )}
                  />
                ) : null}

                <span
                  aria-hidden
                  className={cn(
                    "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                    beat.lit
                      ? "bg-accent-amber text-bg-base"
                      : "bg-bg-surface-raised text-text-muted",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>

                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-[1.05rem] text-foreground">{beat.title}</p>
                  <p className="mt-1 text-[0.875rem] leading-relaxed text-text-muted">
                    {beat.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {/* PLANS AS STACKED ROWS, not side-by-side cards (Adrian, 2026-08-05).
            Three columns at 390px is cramped, and it kills both the saving badge
            and the per-month line — the two things that make the yearly plan
            legible as the cheapest rather than the biggest number. Rows scale to
            any number of plans and give each one space for its own sub-line. */}
        <div role="radiogroup" aria-label="Choose a plan" className="space-y-2.5">
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            const active = session.plan === id;
            const perMonth = monthlyEquivalent(plan);
            const suffix =
              plan.period === "year" ? "yr" : plan.period === "month" ? "mo" : "wk";
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => selectPlan(id)}
                /* No border on any row. Selection is carried by SURFACE plus
                   the tick — `ui-context.md` says cards are borderless, and a
                   ring around a full-width row reads as a rule across the
                   screen (which is what Adrian saw with the old two-up grid). */
                className={cn(
                  "relative flex w-full items-center gap-4 rounded-2xl px-4 py-3.5 text-left",
                  "transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "motion-reduce:transition-none active:scale-[0.99]",
                  active ? "bg-bg-surface-raised" : "bg-bg-surface/40",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors duration-[var(--motion-fast)] motion-reduce:transition-none",
                    active
                      ? "bg-accent-primary text-bg-base"
                      : "border border-border-strong",
                  )}
                >
                  {active ? <Check className="h-3 w-3" weight="bold" /> : null}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-[0.95rem] text-foreground">
                    {plan.label}
                  </span>
                  {/* The monthly equivalent, in brackets, on anything not
                      already billed monthly (Adrian). A yearly figure is the
                      biggest number on the screen and reads as the most
                      expensive option when it is the cheapest. */}
                  {perMonth !== null ? (
                    <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-text-muted">
                      ({formatPrice(perMonth)}/mo)
                    </span>
                  ) : null}
                </span>

                <span className="shrink-0 text-right">
                  <span className="block font-mono text-lg font-light tabular-nums text-foreground">
                    {formatPrice(plan.price)}
                    <span className="ml-1 text-[11px] text-text-muted">/{suffix}</span>
                  </span>
                </span>

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
            height being known up front.

            DIRECTLY UNDER THE PRICE (Adrian, 2026-08-05), not under the feature
            ticks where it used to sit. A code changes what you pay, so it
            belongs beside the thing it changes: someone who arrived on a
            creator's link is looking for it at the price, and finding it three
            blocks further down reads as it not being there. */}
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

        {/* THE FEATURE TICKS ARE GONE (Adrian, 2026-08-05).
            Three lines of "everything you run, tracked in one place" sat under
            the code field, restating what the carousel above had just shown and
            what the demo had already made them do. By this screen the argument
            is made; what is left to say is what it costs and when. */}

        {/* IMMEDIATELY ABOVE THE BUTTON (Adrian, 2026-08-05). It sat under the
            plan rows, which put the code field between it and the thing it is
            reassuring about — and the fear it answers ("am I being charged
            right now?") is felt at the moment of pressing, not three blocks
            earlier. */}
        <p className="flex items-center justify-center gap-2 text-[0.85rem] text-foreground">
          <Check className="h-3.5 w-3.5 text-accent-amber" weight="bold" aria-hidden />
          No payment due now, and no card required
        </p>

        {/* The commitment, at the end of what it commits to. `pt-1` rather than
            relying on the column gap: this is the end of the argument, not the
            next item in a list of blocks. */}
        <div className="space-y-3 pt-1">
          <FlowCta onClick={startTrial} disabled={busy}>
            {busy ? (
              <span className="flex items-center justify-center gap-2">
                <CircleNotch className="h-4 w-4 animate-spin" />
                Starting
              </span>
            ) : (
              `Start my ${TRIAL_DAYS}-day free trial`
            )}
          </FlowCta>
          {/* The legal line, in the shape Adrian asked for: "N days free, then
              $X per period ($Y/mo)". The bracketed monthly figure is DERIVED
              from the selected plan, so it can never contradict the price
              beside it, and it is omitted on the monthly plan where it would
              just repeat itself.

              Every gap around an expression is an explicit {" "}. JSX drops
              whitespace between an expression and text across a line break, and
              this file has now produced "5days", "$0today" and "day 5unless"
              that way. Explicit is the only thing that holds. */}
          {/* TWO LINES, not one wrapped paragraph (Adrian, 2026-08-05: "add a
              line for the before day 5 sentence so it's all lined up").
              The price and the cancellation terms are two different statements,
              and running them together let the second half wrap into a ragged
              tail under the first. A block each keeps both centred on their own
              line at every width. */}
          <div className="space-y-1 text-center text-[0.75rem] leading-relaxed text-text-muted">
            <p>
              {TRIAL_DAYS}{" "}days free, then{" "}
              {formatPrice(PLANS[session.plan].price)}{" "}per{" "}
              {PLANS[session.plan].period}
              {monthlyEquivalent(PLANS[session.plan]) !== null ? (
                <>
                  {" "}({formatPrice(monthlyEquivalent(PLANS[session.plan])!)}/mo)
                </>
              ) : null}
              .
            </p>
            <p>
              Cancel any time before day{" "}
              {TRIAL_DAYS}.
            </p>
          </div>
        </div>

        {/* AUTH GOES HERE, and nothing renders in the slot yet (Adrian,
            2026-08-05: "remove the Continue with Google thing for now. We will
            insert the area where we will do Google").
            The button was real and worked — it is the ONLY thing on this screen
            that ever authenticated — so taking it out means the screen now has
            no auth path at all until billing is wired. That is deliberate: a
            live Google button beside a stubbed trial CTA taught people the
            wrong thing about which one starts the trial, and a cold reviewer
            reading this screen as a customer said pressing the CTA with no
            payment sheet would make him assume it was broken.
            `startTrial()` above is the seam; whichever provider wins renders
            its own auth here. `GoogleSignInButton` still exists and is still
            used by /login — nothing was deleted, only unmounted from here. */}
      </div>
    </StepFrame>
  );
}
