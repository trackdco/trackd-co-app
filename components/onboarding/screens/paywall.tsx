"use client";

import { useEffect, useState } from "react";

import { Bell, CaretDown, Crown, Lock } from "@/components/icons";
import { track } from "@/lib/onboarding/analytics";
import { validateCode, type CodeVerdict } from "@/lib/onboarding/affiliate";
import {
  billingDate,
  formatPrice,
  intervalSuffix,
  PLAN_ORDER,
  REMINDER_DAY,
  TRIAL_DAYS,
  type PlanId,
} from "@/lib/onboarding/pricing";
import { cn } from "@/lib/utils";

import { PlanRows } from "@/components/billing/PlanRows";

import { FlowCta, StepFrame } from "../chrome";
import { useFlow } from "../flow-context";

/**
 * The paywall — THE DECISION (Spec 3-01 §6, §9, amended by w2b-14 and w2b-15).
 *
 * ## There is no auth here, and there is no longer meant to be
 *
 * Account creation moved to its own step immediately before this one
 * (`screens/account.tsx`). So this screen may ASSUME A SIGNED-IN USER — the
 * route refuses to render it otherwise, server-side, in
 * `app/onboarding/page.tsx`. That assumption is what spec w2b-15 builds a
 * Stripe Payment Element on.
 *
 * The `GoogleSignInButton` that used to sit at the bottom of this file is gone
 * for good, and its empty placeholder slot with it. Auth navigating the browser
 * away and back is a full page load, which destroys any payment UI mounted
 * beside it; that bug class cannot exist once the two are on different screens.
 *
 * ## THE CARD IS NOT HERE (Adrian, 2026-08-08)
 *
 * It was, briefly, and the screen was doing two jobs at once: make the argument
 * and pick a plan, AND take a card. Measured at 320x568 that put the commit
 * button roughly 1,400px down — timeline, three plan rows, code field, card
 * form, disclosure, button. Payment moved to `screens/checkout.tsx`, which the
 * CTA below advances to.
 *
 * Nothing about the spec's rules changed: the user still never reaches a
 * stripe.com domain, and Apple Pay and Google Pay still sit above the card
 * fields — one screen further on.
 *
 * ## One button
 *
 * Exactly one call to action. The plan rows are radios and the code field is a
 * disclosure, so there is nothing else here a user could mistake for the thing
 * that starts their trial.
 *
 * ## The prices come from Stripe
 *
 * Never from the codebase — a dashboard change lands without a deploy. A plan
 * whose price did not load is dropped rather than rendered blank, and if none
 * load the screen says so instead of offering an empty picker.
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
 * NOTE: the reminder beat is a COMMITMENT, not decoration, and as of 2026-08-12
 * it is kept. `lib/notifications/trialReminder.ts` decides the day and the
 * existing reminder cron sends the push, off `subscriptions.trial_ends_at`, on
 * day `REMINDER_DAY` in the user's own timezone and outside their quiet hours.
 * Stripe's `trial_will_end` fires on day 4 and is deliberately not the trigger.
 *
 * It still rests on two things outside this file, both in `next-tasks.md`:
 * `supabase/notifications/004_trial_reminder.sql` being applied, and the user
 * having granted notification permission, since a push is the only channel.
 */
/**
 * ⚠️ TAKES THE FORMATTED DATE, rather than a clock to compute one from.
 *
 * It was handed a `Date` and called `billingDate` on it — the browser's clock,
 * in the DEVICE's timezone — while the checkout screen one step later uses the
 * date resolved on the SERVER in the user's STORED zone. A user in Los Angeles
 * with a Sydney profile read one date here and another there, for the same
 * subscription (spec 02b §3.5, and the §0 seam requiring both screens to print
 * the same day).
 *
 * Only where the value comes from changes. §2 forbids rewriting this screen's
 * wording and nothing here touches it.
 */
function trialTimeline(firstChargeOn: string, trial: boolean) {
  /**
   * ⚠️ THE WHOLE TIMELINE IS A TRIAL CLAIM, so it is withheld rather than
   * reworded for somebody charged today.
   *
   * Every beat describes a seven-day trial: "Day 5 · Reminder … your trial is
   * ending", "Day 7 · Billing starts — You'll be charged on {date}". Shown to a
   * returning customer it names a date a week after the one they are actually
   * charged on, which is the invariant this triple exists to protect. There is
   * no honest subset, so it returns none.
   */
  if (!trial) return [];
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
      body: `You'll be charged on ${firstChargeOn} unless you cancel any time before.`,
      lit: false,
    },
  ];
}

export function PaywallScreen() {
  const { session, patch, goNext, priceFor,
    /**
     * ⚠️ SERVER-RESOLVED, in the user's stored timezone (spec 02b §3.5 and the
     * §0 seam: "§3.5's fix necessarily feeds both, so the two screens cannot
     * disagree by a day").
     *
     * This screen computed its own with `billingDate(new Date())` on ITS mount,
     * in the DEVICE's zone, while checkout used the stored one — so a user in
     * Los Angeles with a Sydney profile read 22 Aug here and 23 Aug one step
     * later, for the same subscription. Only the SOURCE of the date changes;
     * §2 forbids rewriting this screen's wording and nothing here does.
     */
    firstChargeOn,
    /**
     * ⚠️ THE SAME SERVER ANSWER THE CHECKOUT SCREEN READS (spec 02b §3.6).
     *
     * A cold review found this screen promising "7 days free" and a day-7
     * charge date to EVERY cohort, one step before `02a` charges a returning
     * customer today. Before `02a` that promise was merely false; the paid path
     * errored, so nobody could be charged. Making it work is what turned it
     * into a written promise immediately before a same-day charge.
     *
     * §2 forbids REWRITING this screen's copy, and nothing here does: the
     * trial-specific lines are SHOWN OR WITHHELD, never reworded. Adrian's
     * call, 2026-08-15.
     */
    eligibility,
  } = useFlow();

  /**
   * Is this person actually getting free days? `undefined` means no server
   * behind the flow (the preview harness), where the generous default stands —
   * the same fallback direction every other surface takes.
   */
  const trial = eligibility?.eligible ?? true;
  const [verdict, setVerdict] = useState<CodeVerdict>({ status: "none" });
  const [codeDraft, setCodeDraft] = useState("");
  const [codeOpen, setCodeOpen] = useState(false);


  /**
   * THE PRICES, FROM STRIPE. Never from the codebase — spec w2b-15 forbids a
   * hardcoded amount so a dashboard change lands without a deploy.
   *
   * A plan with no price is DROPPED from the list rather than rendered with a
   * blank figure. If none load at all the screen says so instead of offering an
   * empty picker: this is the one screen where silently showing nothing would
   * be worse than an honest error, because the user is trying to pay.
   */
  const pricedPlans = PLAN_ORDER.map((id) => priceFor(id)).filter(
    (p): p is NonNullable<typeof p> => Boolean(p),
  );
  const selected = pricedPlans.find((p) => p.id === session.plan) ?? pricedPlans[0];
  // Resolved ONCE on mount. Reading the clock during render would let the
  // billing date change under the user mid-session, and the whole point of
  // printing it is that it is a fixed commitment.
  /**
   * Derived, not held in state: the value is a prop now, so there is nothing to
   * freeze. The old `useState` initialiser existed to stop the browser clock
   * moving the date mid-session, which the server-resolved value cannot do.
   */
  const timeline = trialTimeline(firstChargeOn ?? billingDate(new Date()), trial);
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
   * THE PRICE LINE, on the DECISION screen.
   *
   * The full four-part disclosure lives on `checkout`, beside the button that
   * actually takes the card — that is where the commit is and where the ACCC
   * requirement bites. But picking a plan is a commitment too, and a price that
   * only appears one screen later would mean choosing before seeing. So the
   * amount, the currency and the trial length are stated here as well, derived
   * from the same selected plan so the two screens cannot disagree.
   */
  /**
   * "yr" / "mo" / "wk", FROM STRIPE (spec 02b §3.3, permitted onto this screen
   * by D73), and null where the price cannot be stated correctly — a quarterly
   * plan, or an interval this app has no suffix for.
   *
   * This line previously read the unit off the static `PLANS` table while the
   * amount beside it came from Stripe, so changing an interval in the dashboard
   * moved the number and left the unit behind. Worse, the old ternary had no
   * null case: anything that was not `year` or `month` fell through to "wk", so
   * a quarterly plan priced at three months would have rendered as a weekly one.
   */
  const suffix = selected ? intervalSuffix(selected) : null;

  const priceLine = selected && suffix ? (
    <p className="text-center text-[0.75rem] leading-relaxed text-text-muted">
      {/* ⚠️ The trial half is WITHHELD for somebody charged today, and the price
          half is untouched. Both clauses named a trial they are not getting:
          "N days free" and "cancel any time before day N". What is left is the
          amount, which is the fact this line exists to state and which is true
          for every cohort. */}
      {trial ? (
        <>
          {TRIAL_DAYS}{" "}days free, then{" "}
        </>
      ) : null}
      <span className="text-foreground">
        {formatPrice(selected.price, selected.currency)}{" "}
        {selected.currency.toUpperCase()}/
        {suffix}
      </span>
      {trial ? (
        <>
          . Cancel any time before day{" "}
          {TRIAL_DAYS}.
        </>
      ) : (
        <>. Cancel any time.</>
      )}
    </p>
  ) : null;

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
    <StepFrame
      /* Withheld, not reworded: a returning customer gets the plan question
         without a trial claim above it. "Choose your plan." is this screen's
         own existing job stated plainly and promises nothing. */
      /**
       * ⚠️ CENTRED, AND SITTING CLOSER TO THE ROWS (Adrian, 2026-08-25). It was
       * left-aligned with a full section gap beneath, so the heading read as
       * belonging to the screen rather than to the plans directly under it.
       */
      center
      title={trial ? `Start your ${TRIAL_DAYS}-day free trial.` : "Choose your plan."}
    >
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
            The rows moved to `components/billing/PlanRows.tsx` so the read-only
            gate's pop-up can render THE SAME ONES. The figures were never at
            risk (both read the same Stripe prices) but the saving badge, the
            per-month line and the currency suffix are decisions, and two copies
            of a decision drift the first time one is edited. Lift and shift,
            nothing redesigned. */}
        <PlanRows
          plans={pricedPlans}
          selectedId={selected?.id ?? null}
          onSelect={selectPlan}
        />

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

        {/* THE COMMITMENT. One button, and it goes to the card screen rather
            than taking a card here — see `checkout.tsx` for why the two were
            split. `disabled` when no price loaded: a plan cannot be chosen if
            none is on screen, and letting someone through to a payment form
            with nothing behind it is worse than stopping here. */}
        <div className="space-y-3 pt-1">
          {selected ? (
            <>
              {/* "Subscribe" is `02b` §3.2's APPROVED no-trial button, reused
                  rather than invented — the same move D17 made when it reused
                  the trial title for the mid-grace cohort. */}
              <FlowCta onClick={goNext}>
                {trial ? `Start my ${TRIAL_DAYS}-day free trial` : "Subscribe"}
              </FlowCta>
              {priceLine}
            </>
          ) : (
            <p
              role="alert"
              className="text-center text-[0.8rem] text-[var(--state-error)]"
            >
              We couldn&apos;t load our prices just now. Please try again
              shortly.
            </p>
          )}
        </div>
      </div>
    </StepFrame>
  );
}
