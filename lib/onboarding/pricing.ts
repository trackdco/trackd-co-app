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

export type PlanId = "yearly" | "monthly" | "weekly";

export interface Plan {
  id: PlanId;
  label: string;
  /** Charged amount in whole currency units. */
  price: number;
  /** What the price buys, for the "per month" / "per year" suffix. */
  period: "year" | "month" | "week";
}

export const CURRENCY_SYMBOL = "$";

/** Placeholder figures. D-4: not final. */
export const PLANS: Record<PlanId, Plan> = {
  yearly: { id: "yearly", label: "Yearly", price: 69.99, period: "year" },
  monthly: { id: "monthly", label: "Monthly", price: 11.99, period: "month" },
  // Weekly added 2026-08-05 (Adrian). Deliberately poor value against the other
  // two — that is what a weekly tier is FOR: it lowers the entry price for
  // someone who will not commit to a year, and it makes the yearly saving
  // legible. Nothing derives from it, so it cannot skew the badge.
  weekly: { id: "weekly", label: "Weekly", price: 4.99, period: "week" },
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
function perYear(plan: Plan): number {
  if (plan.period === "year") return plan.price;
  if (plan.period === "month") return plan.price * MONTHS_PER_YEAR;
  return plan.price * WEEKS_PER_YEAR;
}

/** Any plan expressed per week, to two decimals. Derived, not stored. */
export function weeklyEquivalent(plan: Plan): number {
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
 */
export function monthlyEquivalent(plan: Plan): number | null {
  if (plan.period === "month") return null;
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
