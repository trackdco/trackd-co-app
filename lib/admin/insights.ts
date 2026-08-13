import { dayKey } from "./aggregate"
import type { Delta } from "./deltas"
import { PLANS, type PlanId } from "@/lib/onboarding/pricing"

/**
 * The derived headline figures: records, biggest movers, the one sentence at the
 * top of the page, and revenue normalised to a monthly number.
 *
 * Pure, and that is load-bearing rather than tidy. Every function here turns
 * numbers the dashboard already has into a CLAIM about them — "best day ever",
 * "up 34%", "$412 a month" — and a claim that nothing can unit-test is a claim
 * that will eventually be wrong in front of the only two people who believe it.
 * `vitest.config.ts` collects `lib/**`, so all of this runs in plain Node with
 * no Supabase, no Stripe and no clock.
 *
 * The counts-only invariant in `lib/db/admin/core.ts` still applies to
 * everything that reaches here: these functions take day-series, counts and
 * opaque join keys, and they hand back counts, percentages and words.
 */

/** One point of a zero-filled day series, as `seriesByDay` produces it. */
export interface DayCount {
  /** "YYYY-MM-DD", UTC. */
  day: string
  count: number
}

// ── Records & bests ──────────────────────────────────────────────────────────

/** The day a record was set, and what it was. */
export interface BestDay {
  day: string
  count: number
}

/**
 * The highest day in a series, or null when there is no record to claim.
 *
 * Null — never `{ count: 0 }` — for an empty or entirely quiet series. "Best
 * day: 0" is not a record, it is the absence of one, and the same reasoning
 * `percent()` uses for an empty denominator applies: the dashboard should print
 * "—" rather than a number that reads like an achievement.
 *
 * Ties go to the EARLIEST day. A record has a first holder, and resolving ties
 * to "whichever the sort happened to put last" makes the date under the number
 * jump around between refreshes of identical data.
 */
export function bestDay(series: DayCount[]): BestDay | null {
  let best: BestDay | null = null
  for (const point of series) {
    if (!Number.isFinite(point.count) || point.count <= 0) continue
    if (!best || point.count > best.count || (point.count === best.count && point.day < best.day)) {
      best = { day: point.day, count: point.count }
    }
  }
  return best
}

/** The UTC day before a "YYYY-MM-DD" key. */
function previousDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return day
  d.setUTCDate(d.getUTCDate() - 1)
  return dayKey(d)
}

/**
 * Consecutive days up to and including today with at least one event.
 *
 * TWO judgements are baked in, and both are the difference between a streak
 * number that means something and one that insults the reader:
 *
 *  1. **Today being empty does not break the streak.** The day is not over. A
 *     founder opening the dashboard at 9am would otherwise watch a 40-day streak
 *     read as 0 until somebody logged a dose, then jump back to 41. Yesterday
 *     being empty DOES break it, because that day is finished and the answer is
 *     settled.
 *  2. **A gap in the series is an inactive day, not a skipped one.**
 *     `seriesByDay` zero-fills, so a well-formed series has no holes — but this
 *     function is also handed series built elsewhere, and walking backwards by
 *     array index rather than by DATE would silently treat 1 Jan and 1 Mar as
 *     consecutive and report a two-day streak across a two-month silence.
 *
 * Days after `today` are ignored rather than counted, so a future-dated row
 * cannot inflate the number.
 */
export function activityStreak(series: DayCount[], today: string): number {
  const days = series
    .filter((p) => p.day <= today)
    .sort((a, b) => a.day.localeCompare(b.day))
  if (days.length === 0) return 0

  let i = days.length - 1
  // Judgement (1): an empty today is "not yet", not "no".
  if (days[i].day === today && days[i].count <= 0) i -= 1

  let streak = 0
  // Judgement (2): walk by date, and stop the moment the series skips one.
  let expected = i >= 0 ? days[i].day : ""
  for (; i >= 0; i--) {
    if (days[i].day !== expected) break
    if (!Number.isFinite(days[i].count) || days[i].count <= 0) break
    streak += 1
    expected = previousDay(expected)
  }
  return streak
}

/** The all-time bests, and the streak that is running right now. */
export interface Records {
  /** Best day ever for waitlist signups. */
  bestSignupDay: BestDay | null
  /** Best day ever for doses logged. */
  bestDoseDay: BestDay | null
  /** The largest single-day gain in accounts. */
  biggestAccountDay: BestDay | null
  /**
   * Consecutive days, ending today, on which somebody wrote something.
   *
   * A FLOOR, not a total. Activity is read over a bounded window (see
   * `activityWindow` in `lib/db/admin/index.ts`), so a streak that runs off the
   * back of that window is reported as the length of the window. That is the
   * same "this figure is a floor" honesty `columnValues` applies to a truncated
   * read, and it is why `streakWindowDays` sits beside it.
   */
  activityStreak: number
  /** How many days of activity the streak could see. */
  streakWindowDays: number
}

export function buildRecords(input: {
  signupsByDay: DayCount[]
  dosesByDay: DayCount[]
  accountsByDay: DayCount[]
  activityByDay: DayCount[]
  streakWindowDays: number
  today: string
}): Records {
  return {
    bestSignupDay: bestDay(input.signupsByDay),
    bestDoseDay: bestDay(input.dosesByDay),
    biggestAccountDay: bestDay(input.accountsByDay),
    activityStreak: activityStreak(input.activityByDay, input.today),
    streakWindowDays: input.streakWindowDays,
  }
}

// ── Biggest movers, and the one sentence ─────────────────────────────────────

/**
 * How a change is expressed. `count` moves by things; `points` moves by
 * percentage POINTS, because it was already a percentage — see `pointsDelta`.
 */
export type MoverUnit = "count" | "points"

export interface MoverInput {
  key: string
  /**
   * Sentence-ready subject, capitalised: "Doses logged", "Waitlist signups".
   *
   * The generator never conjugates a verb against it — the sentence is written
   * headline-style ("Doses logged up 34% …") precisely so this file does not
   * have to know whether a label is singular or plural.
   */
  label: string
  /** Null when there is no comparable previous period. Dropped, not ranked. */
  delta: Delta | null
  unit?: MoverUnit
  /**
   * What this metric was compared AGAINST, in the reader's words — "the previous
   * week", "yesterday".
   *
   * Per-mover rather than one label for the whole page, because the windows are
   * genuinely different: "active today" is measured against yesterday whatever
   * the range control says, and weekly retention is always week-on-week. A
   * single page-level label would put "vs the previous 90 days" after a sentence
   * about a seven-day window — a wrong statement of fact dressed as a caption.
   */
  previousLabel?: string
}

export interface Mover {
  key: string
  label: string
  delta: Delta
  unit: MoverUnit
  previousLabel?: string
  /** Ranking score only — never rendered. See {@link rankMovers}. */
  magnitude: number
  /** Big enough to be worth a sentence. Only these are eligible for the headline. */
  significant: boolean
}

/**
 * ── THE THRESHOLDS, AND WHY THERE ARE FOUR OF THEM ──────────────────────────
 *
 * At beta size almost everything is a huge percentage of almost nothing. Two
 * doses becoming six is "+200%", and a headline that says so every Tuesday
 * trains the only two readers to ignore the headline — which is worse than
 * having no headline at all. So a change has to clear a percentage bar AND an
 * absolute bar AND have started from a baseline big enough for the percentage to
 * mean anything.
 */

/** Below this, a percentage move is inside the week-to-week wobble. */
export const MIN_PCT = 10
/** …and it has to be this many actual things, so 1 → 3 is not news. */
export const MIN_ABSOLUTE = 3
/** …off a baseline at least this big, or the percentage describes noise. */
export const MIN_BASELINE = 5
/** Rates move in points, and 1–2 points of retention is a rounding artefact. */
export const MIN_POINTS = 5

/**
 * A from-nothing rise has no percentage, so it needs a ranking score anyway.
 *
 * 100 rather than Infinity: going 0 → 4 is genuinely notable and should beat a
 * 12% wobble, but it should NOT automatically outrank a real, measured
 * tripling elsewhere on the page.
 */
const FROM_NOTHING_MAGNITUDE = 100

function isSignificant(delta: Delta, unit: MoverUnit): boolean {
  if (delta.direction === "flat") return false
  if (unit === "points") return Math.abs(delta.absolute) >= MIN_POINTS
  if (Math.abs(delta.absolute) < MIN_ABSOLUTE) return false
  // No baseline: the only claim available is the absolute one, and the absolute
  // bar above has already been cleared.
  if (delta.pct === null) return true
  return delta.previous >= MIN_BASELINE && Math.abs(delta.pct) >= MIN_PCT
}

function magnitudeOf(delta: Delta, unit: MoverUnit): number {
  // Points are ranked on the same scale as percent deliberately: a 12-point
  // retention move and a 12% volume move are worth about the same amount of a
  // founder's attention, and inventing a conversion factor between them would be
  // a made-up number sitting in front of every other number on the page.
  if (unit === "points") return Math.abs(delta.absolute)
  return delta.pct === null ? FROM_NOTHING_MAGNITUDE : Math.abs(delta.pct)
}

/**
 * Rank the changes, biggest first.
 *
 * Movers with no comparable previous period are DROPPED rather than ranked as
 * zero — "we could not measure this" and "this did not move" are different
 * facts and only one of them belongs in a list of things that moved.
 *
 * Significant movers always sort above insignificant ones, so the list can be
 * rendered whole (a founder wants to see the quiet numbers too) while the
 * headline only ever reads from the top.
 */
export function rankMovers(inputs: MoverInput[]): Mover[] {
  return inputs
    .flatMap((input) => {
      if (!input.delta) return []
      const unit = input.unit ?? "count"
      return [
        {
          key: input.key,
          label: input.label,
          delta: input.delta,
          unit,
          previousLabel: input.previousLabel,
          magnitude: magnitudeOf(input.delta, unit),
          significant: isSignificant(input.delta, unit),
        },
      ]
    })
    .sort(
      (a, b) =>
        Number(b.significant) - Number(a.significant) ||
        b.magnitude - a.magnitude ||
        // Ties break on the key so equal movers hold a stable order between
        // refreshes of the same data, exactly as `tally()` does.
        a.key.localeCompare(b.key)
    )
}

/** Thousands separators, pinned to one locale so the string is deterministic. */
function fmt(n: number): string {
  return n.toLocaleString("en-AU")
}

/**
 * ONE plain-English sentence naming the most significant change, or null.
 *
 * ── WHAT THIS REFUSES TO SAY, AND WHY ──────────────────────────────────────
 *  - **Nothing moved meaningfully → null.** The caller renders no sentence at
 *    all. A dashboard that manufactures a headline out of a flat week is a
 *    dashboard whose headline stops being read.
 *  - **No percentage over a zero baseline.** "Up ∞%" and "up 100%" are both
 *    false when the previous period was 0; the sentence switches to the absolute
 *    phrasing ("up from none to 12") instead, which is true and just as useful.
 *  - **Rates move in points, never percent.** See `pointsDelta` — "retention up
 *    33%" when it went 30% → 40% is the classic overclaim.
 *
 * The comparison window is named in the reader's terms ("the previous 30 days"),
 * because "up 34%" against an unnamed period is not a measurement. The winning
 * mover's own `previousLabel` is used when it has one — see {@link MoverInput} —
 * and `fallbackLabel` only covers the movers that do not.
 */
export function headline(
  movers: Mover[],
  fallbackLabel = "the previous period"
): string | null {
  const top = movers.find((m) => m.significant)
  if (!top) return null

  const { label, delta, unit } = top
  const previousLabel = top.previousLabel ?? fallbackLabel
  const direction = delta.direction === "up" ? "up" : "down"

  if (unit === "points") {
    const points = Math.abs(Math.round(delta.absolute))
    return `${label} ${direction} ${points} points on ${previousLabel} (${Math.round(delta.current)}% vs ${Math.round(delta.previous)}%).`
  }

  if (delta.pct === null) {
    // Only reachable rising: a count cannot fall below a baseline of zero.
    return `${label} up from none to ${fmt(delta.current)} on ${previousLabel}.`
  }

  return `${label} ${direction} ${Math.abs(delta.pct)}% on ${previousLabel} (${fmt(delta.current)} vs ${fmt(delta.previous)}).`
}

// ── Revenue, normalised to a month ───────────────────────────────────────────

/**
 * WHY MONEY MATHS LIVES IN A PURE FILE AND NOT BESIDE THE QUERY THAT FEEDS IT.
 *
 * The subscription rows come from Postgres and the AMOUNTS come from Stripe, so
 * the join happens in `lib/db/admin/billing.ts` — which is `server-only` and
 * therefore unreachable from the test runner. Leaving the arithmetic there would
 * make MRR the one number on the dashboard with no test behind it, and MRR is
 * the number most likely to be quoted at somebody outside the building. The
 * data layer fetches; this decides what the fetched things add up to.
 */

/** A Stripe price, reduced to the four fields MRR needs. Mirrors `PlanPrice`. */
export interface PriceLike {
  priceId: string
  plan: string
  /** Whole currency units — 69.99, not 6999. */
  amount: number
  /** Lowercase ISO 4217, as Stripe reports it. */
  currency: string
  /** "year" | "month" | "week" | "day". */
  interval: string
  /**
   * How many intervals one charge covers. Optional so a caller that predates
   * the field still type-checks; `monthlyAmount` defaults it to 1, which is
   * every price Stripe is configured with today.
   */
  intervalCount?: number
}

/** One live subscription, reduced to its join key and its owner. */
export interface SubscriptionLike {
  priceId: string | null
  /**
   * An opaque per-account key, used to count distinct payers and then dropped.
   * Never returned — see the invariant in `lib/db/admin/core.ts`.
   */
  account: string | null
}

export interface PlanRevenue {
  key: string
  label: string
  mrr: number
  subscriptions: number
}

export interface RevenueTotals {
  /** Monthly recurring revenue, in whole currency units. 0 when nothing is live. */
  mrr: number
  /** `mrr × 12`. Named annual RUN RATE, never "revenue we have". */
  arr: number
  /**
   * Lowercase ISO 4217, from Stripe. **Null when there is nothing to price** —
   * which is the state today, with zero subscriptions.
   *
   * Carried rather than assumed because nothing in this codebase hardcodes a
   * currency: the prices are read from Stripe precisely so a dashboard change
   * takes effect without a deploy, and `currencySymbol()` derives the symbol
   * from the code. A dashboard that prints "$" over a EUR price is the same bug
   * `lib/onboarding/pricing.ts` already has a comment about.
   */
  currency: string | null
  /** Subscriptions actually counted toward `mrr`. */
  subscriptions: number
  /** Distinct accounts behind them. */
  payingAccounts: number
  /** `mrr / payingAccounts`, or null when nobody is paying. */
  arpu: number | null
  /** MRR split by plan, ranked. */
  byPlan: PlanRevenue[]
  /**
   * Live subscriptions whose `stripe_price_id` Stripe did not return a price
   * for — a retired price, or Stripe being unreachable. EXCLUDED from `mrr` and
   * reported separately, because a subscription silently worth $0 understates
   * revenue with no sign that it did.
   */
  unpriced: number
  /**
   * Live subscriptions priced in a currency other than the headline one.
   *
   * Also excluded. Adding 10 EUR to 10 USD gives 20 of nothing, and a single
   * summed figure is the one output that cannot express "these are different
   * moneys". A non-zero number here means the dashboard is showing part of the
   * picture and needs a per-currency breakdown.
   */
  otherCurrency: number
}

const MONTHS_PER_YEAR = 12
const WEEKS_PER_YEAR = 52
const DAYS_PER_YEAR = 365

/**
 * One recurring charge expressed per month.
 *
 * Returns **null** for an interval this does not recognise rather than guessing.
 * A price whose interval is a word we have never seen is a price we cannot
 * normalise, and folding it in at face value would quietly report a yearly
 * amount as a monthly one — a 12× overstatement of the number most likely to be
 * repeated out loud.
 *
 * Weeks and days convert through the YEAR rather than through "4 weeks" or "30
 * days": a month is not 4 weeks, and the 8.6% error that assumption introduces
 * compounds straight into ARR.
 */
export function monthlyAmount(
  amount: number,
  interval: string,
  /**
   * How many intervals one charge covers. Stripe writes "every 3 months" as
   * `interval: "month"` + `interval_count: 3`, so ignoring this prices a
   * quarterly plan as monthly and overstates MRR by exactly that factor.
   * Defaults to 1, which is every price configured today.
   */
  intervalCount = 1
): number | null {
  if (!Number.isFinite(amount)) return null
  if (!Number.isFinite(intervalCount) || intervalCount < 1) return null
  const perInterval = (() => {
    switch (interval) {
      case "month":
        return amount
      case "year":
        return amount / MONTHS_PER_YEAR
      case "week":
        return (amount * WEEKS_PER_YEAR) / MONTHS_PER_YEAR
      case "day":
        return (amount * DAYS_PER_YEAR) / MONTHS_PER_YEAR
      default:
        return null
    }
  })()
  return perInterval === null ? null : perInterval / intervalCount
}

/** Money, rounded to the minor unit ONCE — at the end, never per row. */
function toCents(value: number): number {
  return Math.round(value * 100) / 100
}

const EMPTY_REVENUE: RevenueTotals = {
  mrr: 0,
  arr: 0,
  currency: null,
  subscriptions: 0,
  payingAccounts: 0,
  arpu: null,
  byPlan: [],
  unpriced: 0,
  otherCurrency: 0,
}

/**
 * MRR from live subscriptions joined to the prices Stripe returned.
 *
 * ── DESIGN NOTES THE NAIVE VERSION GETS WRONG ──────────────────────────────
 *  - **Rows, not accounts.** Everything else in `billing.ts` counts distinct
 *    accounts, because one person holding two subscription rows is one customer.
 *    Revenue is the exception: `stripe_subscription_id` is UNIQUE, so two rows
 *    are two real subscriptions that Stripe will bill twice, and de-duplicating
 *    by account would under-report the money.
 *  - **Rounded once.** Each subscription is summed at full precision and the
 *    TOTAL is rounded. Rounding every $69.99/12 to $5.83 first loses a cent per
 *    subscription per month, which is invisible at 3 customers and embarrassing
 *    at 3,000.
 *  - **Zero is a clean answer.** With no subscriptions this returns zeros, a
 *    null currency and an empty split — never a throw, and never a made-up
 *    currency to hang the zero off.
 */
export function monthlyRevenue(
  subscriptions: SubscriptionLike[],
  prices: PriceLike[]
): RevenueTotals {
  if (subscriptions.length === 0) return EMPTY_REVENUE

  const byId = new Map<string, PriceLike>()
  for (const price of prices) if (price.priceId) byId.set(price.priceId, price)

  /** Per-currency, because the totals may not legitimately be added together. */
  interface Bucket {
    mrr: number
    subscriptions: number
    accounts: Set<string>
    byPlan: Map<string, { mrr: number; subscriptions: number }>
  }
  const buckets = new Map<string, Bucket>()
  let unpriced = 0

  for (const sub of subscriptions) {
    const price = sub.priceId ? byId.get(sub.priceId) : undefined
    const monthly = price
      ? monthlyAmount(price.amount, price.interval, price.intervalCount)
      : null
    if (!price || monthly === null) {
      unpriced += 1
      continue
    }

    let bucket = buckets.get(price.currency)
    if (!bucket) {
      bucket = { mrr: 0, subscriptions: 0, accounts: new Set(), byPlan: new Map() }
      buckets.set(price.currency, bucket)
    }
    bucket.mrr += monthly
    bucket.subscriptions += 1
    if (sub.account) bucket.accounts.add(sub.account)

    const plan = bucket.byPlan.get(price.plan) ?? { mrr: 0, subscriptions: 0 }
    plan.mrr += monthly
    plan.subscriptions += 1
    bucket.byPlan.set(price.plan, plan)
  }

  if (buckets.size === 0) {
    return { ...EMPTY_REVENUE, unpriced }
  }

  // The headline currency is the one carrying the most money. Ties break on the
  // code so the page does not swap currencies between two identical reads.
  const [headlineCurrency, top] = [...buckets.entries()].sort(
    (a, b) => b[1].mrr - a[1].mrr || a[0].localeCompare(b[0])
  )[0]

  let otherCurrency = 0
  for (const [currency, bucket] of buckets) {
    if (currency !== headlineCurrency) otherCurrency += bucket.subscriptions
  }

  const mrr = toCents(top.mrr)
  const payingAccounts = top.accounts.size

  return {
    mrr,
    arr: toCents(top.mrr * MONTHS_PER_YEAR),
    currency: headlineCurrency,
    subscriptions: top.subscriptions,
    payingAccounts,
    // Null, not 0, when there is nobody to average over — the same refusal
    // `percent()` makes for an empty denominator.
    arpu: payingAccounts > 0 ? toCents(top.mrr / payingAccounts) : null,
    byPlan: [...top.byPlan.entries()]
      .map(([key, value]) => ({
        key,
        // Named the way the paywall names it, from the same source, so the
        // dashboard and the checkout screen cannot drift apart.
        label: PLANS[key as PlanId]?.label ?? key,
        mrr: toCents(value.mrr),
        subscriptions: value.subscriptions,
      }))
      .sort((a, b) => b.mrr - a.mrr || a.key.localeCompare(b.key)),
    unpriced,
    otherCurrency,
  }
}
