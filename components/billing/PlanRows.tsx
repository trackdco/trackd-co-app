"use client";

import { Check } from "@/components/icons";
import {
  formatPrice,
  monthlyEquivalent,
  yearlySavingPercent,
  type PlanId,
  type PricedPlan,
} from "@/lib/onboarding/pricing";
import { cn } from "@/lib/utils";

/**
 * THE PLAN ROWS. One component, two callers, so the prices cannot drift.
 *
 * ## Why this was extracted
 *
 * The read-only gate's pop-up has to show the real plans and the real prices,
 * and Adrian's instruction was to reuse the paywall's rows rather than draw new
 * ones. The FIGURES were never at risk — both sides read the same Stripe prices
 * through `loadPricesSafe` — but the presentation was: the saving badge, the
 * per-month line, the currency suffix and the rounding are all decisions, and
 * two copies of them drift the first time one is edited.
 *
 * So the paywall now renders this too. It is a lift-and-shift of what was
 * inline in `screens/paywall.tsx`, comment for comment, with nothing redesigned.
 *
 * ## The decisions carried over verbatim
 *
 * **Stacked rows, not side-by-side cards** (Adrian, 2026-08-05). Three columns
 * at 390px is cramped, and it kills both the saving badge and the per-month
 * line — the two things that make the yearly plan legible as the cheapest rather
 * than the biggest number.
 *
 * **No border on any row.** Selection is carried by SURFACE plus the tick.
 * `ui-context.md` says cards are borderless, and a ring around a full-width row
 * reads as a rule across the screen.
 *
 * **The monthly equivalent, in brackets**, on anything not already billed
 * monthly. A yearly figure is the biggest number on the screen and reads as the
 * most expensive option when it is the cheapest.
 */
export function PlanRows({
  plans,
  selectedId,
  onSelect,
  ariaLabel = "Choose a plan",
}: {
  /** Already filtered to plans whose price loaded. See `pricedPlansFrom`. */
  plans: readonly PricedPlan[];
  selectedId: PlanId | null;
  onSelect: (plan: PlanId) => void;
  ariaLabel?: string;
}) {
  const saving = yearlySavingPercent(
    plans.find((p) => p.id === "yearly") ?? undefined,
    plans.find((p) => p.id === "monthly") ?? undefined,
  );

  return (
    <div role="radiogroup" aria-label={ariaLabel} className="space-y-2.5">
      {plans.map((plan) => {
        const id = plan.id;
        const active = selectedId === id;
        const perMonth = monthlyEquivalent(plan);
        const suffix =
          plan.period === "year" ? "yr" : plan.period === "month" ? "mo" : "wk";
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(id)}
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
              {perMonth !== null ? (
                <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-text-muted">
                  {/* D66: the currency suffix stays while single-currency. The
                      Billing screen and the gift row already comply; these two
                      did not, so one product showed a price two ways. */}
                  ({formatPrice(perMonth, plan.currency)}{" "}
                  {plan.currency.toUpperCase()}/mo)
                </span>
              ) : null}
            </span>

            <span className="shrink-0 text-right">
              <span className="block font-mono text-lg font-light tabular-nums text-foreground">
                {/* ⚠️ A REAL SPACE, not `ml-1`. A margin looks like a gap and is
                    not one: the text reads "$69.99USD/yr" to a screen reader and
                    to anything that copies it, which is not the "$X.XX USD" form
                    the house rule and the Billing screen both use. Caught because
                    the first assertion only checked that "USD" appeared. */}
                {formatPrice(plan.price, plan.currency)}{" "}
                <span className="text-[11px] text-text-muted">
                  {plan.currency.toUpperCase()}/{suffix}
                </span>
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
  );
}
