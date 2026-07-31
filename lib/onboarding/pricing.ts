/**
 * Paywall pricing (Spec 3-01 · §15 step 5 and Open Decision D-4).
 *
 * **These figures are PLACEHOLDERS pending a pricing lock.** They live here,
 * once, so changing them is one edit and no screen carries a hardcoded price.
 * The spec's "Check When Done" requires prices to render from config rather
 * than being hardcoded as final, which is what this file is.
 *
 * The weekly figure is DERIVED, never written down twice: a hand-typed
 * "$1.35/wk" beside a $70 annual price is one pricing change away from being a
 * lie, and the two disagreeing is exactly the class of bug this project keeps
 * finding.
 */

export type PlanId = "yearly" | "monthly";

export interface Plan {
  id: PlanId;
  label: string;
  /** Charged amount in whole currency units. */
  price: number;
  /** What the price buys, for the "per month" / "per year" suffix. */
  period: "year" | "month";
}

export const CURRENCY_SYMBOL = "$";

/** Placeholder figures. D-4: not final. */
export const PLANS: Record<PlanId, Plan> = {
  yearly: { id: "yearly", label: "Yearly", price: 70, period: "year" },
  monthly: { id: "monthly", label: "Monthly", price: 9.99, period: "month" },
};

export const TRIAL_DAYS = 5;

/** Weeks in a year, for the per-week anchor. */
const WEEKS_PER_YEAR = 52;
const MONTHS_PER_YEAR = 12;

/** "$70" / "$9.99" — no trailing ".00" on a whole number. */
export function formatPrice(amount: number): string {
  const body = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${CURRENCY_SYMBOL}${body}`;
}

/** The yearly plan expressed per week, to two decimals. Derived, not stored. */
export function weeklyEquivalent(plan: Plan): number {
  const perYear = plan.period === "year" ? plan.price : plan.price * MONTHS_PER_YEAR;
  return Math.round((perYear / WEEKS_PER_YEAR) * 100) / 100;
}

/**
 * How much cheaper the yearly plan is than paying monthly for a year, as a
 * whole percent. Derived from the two prices so the badge can never contradict
 * them. Returns null when there is no saving to claim, so the badge simply
 * does not render rather than showing "Save 0%".
 */
export function yearlySavingPercent(): number | null {
  const yearlyCost = PLANS.yearly.price;
  const monthlyCost = PLANS.monthly.price * MONTHS_PER_YEAR;
  if (monthlyCost <= yearlyCost) return null;
  return Math.round(((monthlyCost - yearlyCost) / monthlyCost) * 100);
}

/** The price anchor line under the payoff graph, e.g. "Under $1.35 a week". */
export function weeklyAnchor(): string {
  const weekly = weeklyEquivalent(PLANS.yearly);
  // Round UP to the next 5c so "under" is always literally true.
  const ceiling = Math.ceil(weekly * 20) / 20;
  return `Under ${formatPrice(ceiling)} a week to keep all of it.`;
}
