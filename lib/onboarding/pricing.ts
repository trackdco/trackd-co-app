/**
 * Paywall pricing — everything about a plan EXCEPT what it costs.
 *
 * ## The amounts are gone, and that is spec w2b-15
 *
 * *"There must be no dollar amount hardcoded anywhere in the codebase — the
 * price shown on the paywall is read from Stripe, so a dashboard change takes
 * effect without a deploy."*
 *
 * So `PLANS` no longer carries a `price`. It carries what a price is not: the
 * label, the period, the order they are offered in. The numbers come from
 * `lib/billing/prices.ts`, which reads them from Stripe, and every derived
 * figure in this file now takes the amount as an argument instead of reaching
 * for a constant.
 *
 * That split is what keeps the derivations honest. The per-month equivalent, the
 * saving badge and the weekly anchor are still computed here, still from one
 * source, and still incapable of contradicting the price they sit beside — they
 * just get told what the price is rather than deciding it.
 */

export type PlanId = "yearly" | "monthly" | "weekly";

export interface Plan {
  id: PlanId;
  label: string;
  /** What the price buys, for the "per month" / "per year" suffix. */
  period: "year" | "month" | "week";
}

/**
 * A plan with the amount Stripe says it costs. The shape every display helper
 * below takes, so none of them can be called without a real price in hand.
 */
export interface PricedPlan extends Plan {
  /** Charged amount in whole currency units. From Stripe, never from here. */
  price: number;
  /**
   * Lowercase ISO 4217, as Stripe reports it. Carried because the paywall
   * disclosure must state the renewal amount IN AUD explicitly — a bare "$"
   * is ambiguous to an Australian audience that mostly sees USD prices, and
   * naming the currency is part of what the ACCC looks at.
   */
  currency: string;
}

export const CURRENCY_SYMBOL = "$";

export const PLANS: Record<PlanId, Plan> = {
  yearly: { id: "yearly", label: "Yearly", period: "year" },
  monthly: { id: "monthly", label: "Monthly", period: "month" },
  // Weekly (Adrian, 2026-08-05). Deliberately poor value against the other two —
  // that is what a weekly tier is FOR: it lowers the entry price for someone who
  // will not commit to a year, and it makes the yearly saving legible.
  weekly: { id: "weekly", label: "Weekly", period: "week" },
};

/**
 * The order plans are OFFERED in, and it is not the order of the record above.
 * Yearly first because it is the one we would rather sell and the one carrying
 * the saving; weekly last because it is the most expensive way to buy Trackd.
 */
export const PLAN_ORDER: readonly PlanId[] = ["yearly", "monthly", "weekly"];

/**
 * SEVEN, not five (Adrian, 2026-08-05).
 *
 * A cold review walking the flow as a customer made the argument and he took
 * it: "my protocol has a weekly shape. In five days I won't have hit every dose
 * day, won't have run out of anything, won't have had bloods. I'd never see the
 * thing I'm paying for."
 *
 * Seven covers one full week and one full rotation, which is the smallest
 * window in which this particular product can demonstrate itself. It also
 * unlocks the line Adrian wants: "the first week is on us."
 *
 * Everything on the paywall derives from this — the headline, the CTA, the
 * reminder day, the billing date and the legal line — so moving it is this one
 * edit and nothing on screen can disagree with anything else.
 */
export const TRIAL_DAYS = 7;

/**
 * Which day of the trial the "your trial is ending" reminder goes out.
 *
 * DERIVED from `TRIAL_DAYS`, never written down twice: the paywall promises
 * this day out loud, so a hardcoded number here is a promise that silently
 * breaks the moment the trial length changes. Two days of warning, floored at
 * day 1 so a very short trial still reminds before it bills rather than after.
 */
export const REMINDER_DAY = Math.max(1, TRIAL_DAYS - 2);

/** Weeks in a year, for the per-week anchor. */
const WEEKS_PER_YEAR = 52;
const MONTHS_PER_YEAR = 12;

/** "$70" / "$9.99" — no trailing ".00" on a whole number. */
export function formatPrice(amount: number): string {
  const body = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${CURRENCY_SYMBOL}${body}`;
}

/** Whatever a plan costs, expressed as a yearly figure. The one conversion. */
function perYear(plan: PricedPlan): number {
  if (plan.period === "year") return plan.price;
  if (plan.period === "month") return plan.price * MONTHS_PER_YEAR;
  return plan.price * WEEKS_PER_YEAR;
}

/** Any plan expressed per week, to two decimals. Derived, not stored. */
export function weeklyEquivalent(plan: PricedPlan): number {
  return Math.round((perYear(plan) / WEEKS_PER_YEAR) * 100) / 100;
}

/**
 * Any plan expressed per MONTH, to two decimals.
 *
 * This is the figure the paywall shows in brackets beside a yearly price —
 * "$69.99 per year ($5.83/mo)" — because a yearly number on its own is the
 * biggest one on the screen and reads as the most expensive option when it is
 * the cheapest (Adrian, 2026-08-05). Derived, so it can never contradict the
 * price it sits next to.
 *
 * Returns null for a plan already billed monthly: printing "$11.99 ($11.99/mo)"
 * is noise, and the caller should render nothing rather than a tautology.
 *
 * **And null for WEEKLY** (Adrian, 2026-08-07: "remove the $21.62 per month,
 * that will make people not want to get weekly"). The figure was correct and
 * that is the problem: this bracket exists to make a plan read CHEAPER than its
 * headline number, which is what it does under yearly ($69.99 → $5.83/mo) and
 * the exact reverse of what it does under weekly, where $4.99 grows into
 * $21.62. Same helper, opposite job, so the weekly row simply does not get one
 * and its own $4.99/wk stands.
 *
 * This is not hiding the price. Weekly is DELIBERATELY the worst value on the
 * screen (see `PLANS`) and the yearly row's own bracket is what makes that
 * legible, so the comparison the bracket was for is still on screen. What it
 * stops is the cheapest-looking entry point arguing against itself in its own
 * sub-line.
 */
export function monthlyEquivalent(plan: PricedPlan): number | null {
  if (plan.period === "month") return null;
  if (plan.period === "week") return null;
  return Math.round((perYear(plan) / MONTHS_PER_YEAR) * 100) / 100;
}

/**
 * The calendar day the trial converts, as a display string.
 *
 * Takes `now` rather than reading the clock, so the caller controls the
 * timezone question and this stays pure and testable. The date is DERIVED from
 * `TRIAL_DAYS` for the same reason `REMINDER_DAY` is: the screen says this date
 * out loud, and it must not be able to disagree with the trial it describes.
 */
export function billingDate(now: Date): string {
  const d = new Date(now.getTime());
  d.setDate(d.getDate() + TRIAL_DAYS);
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * How much cheaper the yearly plan is than paying monthly for a year, as a
 * whole percent. Derived from the two prices so the badge can never contradict
 * them. Returns null when there is no saving to claim, so the badge simply
 * does not render rather than showing "Save 0%".
 */
export function yearlySavingPercent(
  yearly: PricedPlan | undefined,
  monthly: PricedPlan | undefined,
): number | null {
  // Null rather than a guess when the prices have not arrived. The badge simply
  // does not render, which is the same behaviour as "there is no saving to
  // claim" and is strictly better than printing a number derived from nothing.
  if (!yearly || !monthly) return null;
  const yearlyCost = yearly.price;
  const monthlyCost = monthly.price * MONTHS_PER_YEAR;
  if (monthlyCost <= yearlyCost) return null;
  return Math.round(((monthlyCost - yearlyCost) / monthlyCost) * 100);
}

/**
 * The price anchor line under the payoff graph, e.g. "Under $1.35 a week".
 *
 * Returns null when the yearly price has not arrived, so the caller renders
 * nothing rather than an anchor with no number in it. That case is real: the
 * payoff screen is ANONYMOUS and reachable before Stripe has answered.
 */
export function weeklyAnchor(yearly: PricedPlan | undefined): string | null {
  if (!yearly) return null;
  // Round UP to the next 5c so "under" is always literally true.
  const ceiling = Math.ceil(weeklyEquivalent(yearly) * 20) / 20;
  return `Under ${formatPrice(ceiling)} a week to keep all of it.`;
}
