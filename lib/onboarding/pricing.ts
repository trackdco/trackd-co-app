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
   * ⚠️ THE SAME AMOUNT IN STRIPE'S MINOR UNITS, for the CHARGE rather than the
   * display (spec 02a §3.4).
   *
   * Payment-mode Elements needs an integer amount at mount, and it must be
   * Stripe's own `unit_amount` rather than {@link price} multiplied by 100.
   * Measured on this account: `69.99 * 100` is `6998.999999999999`, so the
   * yearly plan would be handed a non-integer and either error or round down to
   * $69.98. This is the one number on the screen that is also the number taken
   * from a card.
   *
   * Optional because the preview harnesses build a `PricedPlan` from mock data
   * and never mount a payment sheet.
   */
  amountMinor?: number;
  /**
   * ⚠️ THE INTERVAL AS STRIPE REPORTS IT, and the suffix on screen derives from
   * THIS rather than from {@link period} (spec 02b §3.3).
   *
   * `period` comes from the static `PLANS` table, so the amount followed Stripe
   * and the unit did not: change the interval in the dashboard and the screen
   * kept printing the old one, next to the new amount, above a button that
   * charges.
   */
  interval?: string;
  /**
   * ⚠️ A COUNT OTHER THAN ONE MUST NOT RENDER A PRICE LINE AT ALL.
   *
   * Every price is configured at one today, which is exactly why a quarterly
   * plan added in the dashboard would have printed "/mo" silently. A screen that
   * cannot state a price correctly states nothing.
   */
  intervalCount?: number;
  /**
   * Lowercase ISO 4217, as Stripe reports it.
   *
   * Carried so the disclosure can NAME the currency rather than printing a bare
   * "$". Prices are in USD (Adrian, 2026-08-08) and the audience is largely
   * Australian, so an unlabelled dollar sign is genuinely ambiguous — and what
   * the ACCC looks at on a free-trial conversion is whether the amount was
   * stated unambiguously.
   *
   * Deliberately NOT converted to AUD anywhere. Stripe charges the USD amount
   * and the card issuer converts at its own rate on its own day, so any AUD
   * figure we printed would be one we invented — the exact broken promise
   * `cost-variants.tsx` already warns about.
   */
  currency: string;
}

/**
 * The symbol for a currency, from the currency itself.
 *
 * This was a hardcoded `"$"` while `PricedPlan.currency` was data-driven, and a
 * cold review named the consequence: change the Stripe price to EUR — exactly
 * the "dashboard change without a deploy" this whole design is built around —
 * and every plan row, the per-month bracket, the saving badge and the cost
 * screen would read `$` while only the disclosure named the real currency.
 *
 * `Intl` already knows. Formatting 0 and stripping the digits is the reliable
 * way to get just the symbol, since the position differs by locale.
 */
export function currencySymbol(currency: string): string {
  try {
    return (
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: currency.toUpperCase(),
        /**
         * NARROW, and this is the whole trick.
         *
         * The default `currencyDisplay` disambiguates against the locale's own
         * currency, so an `en-AU` formatter renders USD as the literal string
         * "USD" — which produced "USD69.99 USD/yr (USD5.83/mo)" on the checkout
         * screen. Narrow gives the bare symbol ("$", "€", "£") and lets the
         * disclosure name the currency exactly once, beside the price, which is
         * where it belongs.
         */
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
        .format(0)
        .replace(/[\d\s.,]/g, "") || "$"
    );
  } catch {
    // An unknown code. A bare "$" beside an explicitly named currency is still
    // honest, and throwing on a price screen is not an option.
    return "$";
  }
}

/** @deprecated Use `currencySymbol(plan.currency)`. Kept for the anchor line. */
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

/**
 * How many days BEFORE the charge the reminder goes out. The same promise as
 * {@link REMINDER_DAY}, expressed from the other end.
 *
 * Both are needed and neither is redundant. The SCREENS count forward from day
 * one, because that is how a person reads a timeline. The SENDER counts back
 * from the trial end, because that is the only anchor it actually holds: what it
 * has is `subscriptions.trial_ends_at`, and it never sees the day the trial
 * started.
 *
 * Counting back is also the more honest of the two if the two ever disagree. If
 * Stripe's trial is not exactly `TRIAL_DAYS` long — a coupon, a support
 * extension, a subscription made by hand in the dashboard — then "day 5" is a
 * number about a schedule that no longer exists, while "two days before you are
 * charged" is still exactly the thing the screen promised. So the sender uses
 * this, and it is DERIVED, so the paywall's number and the push's timing cannot
 * drift apart.
 */
export const TRIAL_REMINDER_LEAD_DAYS = TRIAL_DAYS - REMINDER_DAY;

/** Weeks in a year, for the per-week anchor. */
const WEEKS_PER_YEAR = 52;
const MONTHS_PER_YEAR = 12;

/**
 * "$70" / "$9.99" — no trailing ".00" on a whole number.
 *
 * Takes the currency so the symbol follows the price rather than being assumed.
 * It defaults to AUD/USD's `$` for the handful of callers that have no plan in
 * hand (the weekly anchor, the cost comparison), which are all rendering our own
 * price in the one currency we sell in.
 */
export function formatPrice(amount: number, currency?: string): string {
  const body = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${currency ? currencySymbol(currency) : CURRENCY_SYMBOL}${body}`;
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
 * **And null for WEEKLY** (Adrian, 2026-08-07: "remove the per-month figure,
 * that will make people not want to get weekly"). The figure was correct and
 * that is the problem: this bracket exists to make a plan read CHEAPER than its
 * headline number, which is what it does under yearly and the exact reverse of
 * what it does under weekly, where a small weekly price grows into a large
 * monthly one. Same helper, opposite job, so the weekly row does not get one and
 * its own per-week price stands. (No amounts here — they live in Stripe now, and
 * the ones this comment used to quote went stale the day weekly moved to $3.99.)
 *
 * This is not hiding the price. Weekly is DELIBERATELY the worst value on the
 * screen (see `PLANS`) and the yearly row's own bracket is what makes that
 * legible, so the comparison the bracket was for is still on screen. What it
 * stops is the cheapest-looking entry point arguing against itself in its own
 * sub-line.
 */
export function monthlyEquivalent(plan: PricedPlan): number | null {
  /**
   * ⚠️ FROM STRIPE'S INTERVAL, not the static `PLANS` table (spec 02b §3.3).
   *
   * A cold review found this bracket still keyed on the hardcoded `period`
   * while the suffix beside it had moved to Stripe. Change the yearly price's
   * interval to monthly in the dashboard — the exact change §3.3 exists for —
   * and the line rendered "then $69.99 USD/mo ($5.83/mo)": a price line
   * contradicting itself above a charge button, with §3.3's loud refusal not
   * firing because `month` is a suffix it accepts.
   *
   * Falls back to `period` only where no Stripe interval is present, which is
   * the preview harness.
   */
  const interval = plan.interval ?? plan.period;
  if (interval !== "year") return null;
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

/**
 * THE INTERVAL SUFFIX, FROM STRIPE (spec 02b §3.3).
 *
 * "yr" / "mo" / "wk", derived from the price's own recurring interval rather
 * than from the static `PLANS` table. The amount followed Stripe and the unit
 * did not, so changing an interval in the dashboard kept the old suffix on
 * screen beside the new amount, above a button that charges.
 *
 * ⚠️ RETURNS NULL WHERE THE SCREEN MUST NOT PRINT A PRICE LINE AT ALL:
 *
 *   - an interval count other than one. Stripe expresses "every three months"
 *     as `month` with a count of three, so a screen reading only the interval
 *     prices a quarterly plan as monthly. Every price is at one today, which is
 *     precisely why this would go unnoticed until somebody added a quarterly
 *     plan in the dashboard and the screen quietly understated it by a factor
 *     of three.
 *   - an interval this app has no suffix for.
 *
 * The caller renders its existing "couldn't load your plan" error instead, and
 * the button does not proceed. A screen that cannot state a price correctly
 * states nothing rather than stating it wrongly — and it does so LOUDLY, which
 * is the point: a wrong suffix is silent, and silence is the failure mode this
 * project keeps paying for.
 */
export function intervalSuffix(plan: {
  interval?: string;
  intervalCount?: number;
}): string | null {
  if (plan.intervalCount !== undefined && plan.intervalCount !== 1) return null;
  switch (plan.interval) {
    case "year":
      return "yr";
    case "month":
      return "mo";
    case "week":
      return "wk";
    default:
      return null;
  }
}
