/**
 * STEP 2 — THE RULES (Spec 11 §3.1). One pure function per assertion.
 *
 * ⚠️ THIS SPEC INVENTS NO BUSINESS RULE. Every function below names the spec or
 * decision that made the rule it enforces, in a comment, so a failing assertion
 * can be traced to the thing it protects. §0: "Where an assertion and a spec
 * disagree, the spec is right and this is wrong."
 *
 * Pure — every fact arrives in the {@link ReconcileSnapshot}, `now` included — so
 * the rules are testable under the house rule that tests cover pure logic, and so
 * each rule can be read on its own.
 *
 * ## The ordering question these rules exist to ask correctly
 *
 * The two rules that have caught more on this project than anything else are
 * "ask the money question first, the status question second" and "verify from the
 * cohort, not from the function". Both apply here. A rule that asks "is this
 * cancelled" instead of "can this still take money" is the shape of three
 * separate CRITICALs, so where a status set is needed this imports
 * {@link BILLABLE_STATUSES} — the set that answers "what could still take this
 * person's money" — rather than restating a list.
 */

import { isEntitlementActive } from "@/lib/billing/access";
import { BILLABLE_STATUSES } from "@/lib/billing/cancel";

import type {
  EntitlementFact,
  Finding,
  InvoiceFact,
  ReconcileSnapshot,
  StripeCustomerFact,
  SubscriptionFact,
} from "./types";
import { severityOf } from "./types";

/**
 * Statuses where the app has PROMISED access — either paid for or given free.
 *
 * ⚠️ NARROWER THAN `BILLABLE_STATUSES`, and the difference is the point.
 * `incomplete` is billable (its first invoice stays payable for ~23 hours) but it
 * has promised nothing and paid nothing, so a brand-new `incomplete` subscription
 * legitimately has no entitlement — that is every checkout, for its first
 * seconds. Requiring one here would make the report fire on normal traffic, and a
 * report that is never quiet is the failure §3.5 exists to prevent.
 *
 * `incomplete` gets its own rule instead ({@link incompletePastWindow}), which is
 * where §3.1 #8 puts it.
 */
const ACCESS_PROMISED: ReadonlySet<string> = new Set(["trialing", "active"]);

/**
 * Statuses where money we hold is paying for access, or recently was.
 *
 * `past_due` is included because `access.ts` deliberately leaves access standing
 * on a declined card until the date passes naturally — "cards decline for boring
 * reasons". So a `past_due` subscription is a legitimate source for an active
 * entitlement, and treating it as dead would report every declined renewal.
 */
const MONEY_BEHIND_ACCESS: ReadonlySet<string> = new Set([
  "trialing",
  "active",
  "past_due",
]);

/**
 * How long an `incomplete` subscription may sit before it is anomalous.
 *
 * ⚠️ MEASURED, NOT ASSUMED — and the spec's own number is wrong here. §3.1 #8
 * says "fifteen days on this account". It is not: driven on a test clock
 * (`scratchpad/harness/clockwindow.scenario.ts`, commit `e8dc9b0`),
 *
 *     +22h   incomplete           invoice open
 *     +23h   incomplete_expired   invoice void
 *
 * The fifteen-day figure was the DUNNING schedule for a `past_due` subscription
 * after Smart Retries exhausts — a different subscription in a different state,
 * on an unrelated window. `cancel.ts:143-170` carries the same measurement.
 *
 * 24 hours rather than 23: the extra hour is margin against Stripe expiring a
 * subscription a few minutes late, and it costs nothing, because an entitlement
 * attached to an unpaid subscription is ALSO caught by
 * {@link entitlementWithoutSource} at any age.
 */
const INCOMPLETE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Slack when comparing two instants that came from different systems.
 *
 * `freeTime.ts` rounds a trial end UP to whole seconds (`Math.ceil`, never floor:
 * rounding down would land the charge up to 999ms before the promised instant).
 * A minute absorbs that and any clock skew, and is far tighter than any real
 * divergence a person would care about.
 */
const INSTANT_TOLERANCE_MS = 60 * 1000;

/**
 * How far LATER than the promise Stripe's clamp can legitimately push a trial end.
 *
 * `STRIPE_MIN_TRIAL_END_OFFSET` is 48 hours (`freeTime.ts:65`), and the clamp only
 * ever moves the end later, so a grace-aligned trial can sit up to two days past
 * the promised instant and be perfectly correct.
 */
const CLAMP_WINDOW_MS = 48 * 60 * 60 * 1000 + INSTANT_TOLERANCE_MS;

/* ── the index ────────────────────────────────────────────────────── */

interface Index {
  userByCustomer: Map<string, string>;
  subsByCustomer: Map<string, SubscriptionFact[]>;
  invoicesBySub: Map<string, InvoiceFact[]>;
  entitlementsByUser: Map<string, EntitlementFact[]>;
  stripeCustomerById: Map<string, StripeCustomerFact>;
}

function indexOf(s: ReconcileSnapshot): Index {
  const userByCustomer = new Map(s.customers.map((c) => [c.stripeCustomerId, c.userId]));

  const subsByCustomer = new Map<string, SubscriptionFact[]>();
  for (const sub of s.subscriptions) push(subsByCustomer, sub.customerId, sub);

  const invoicesBySub = new Map<string, InvoiceFact[]>();
  for (const inv of s.invoices) {
    if (inv.subscriptionId) push(invoicesBySub, inv.subscriptionId, inv);
  }

  const entitlementsByUser = new Map<string, EntitlementFact[]>();
  for (const e of s.entitlements) push(entitlementsByUser, e.userId, e);

  return {
    userByCustomer,
    subsByCustomer,
    invoicesBySub,
    entitlementsByUser,
    stripeCustomerById: new Map(s.stripeCustomers.map((c) => [c.id, c])),
  };
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

/**
 * Which user a subscription belongs to.
 *
 * `billing_customers` first, `metadata.user_id` second — the same order and the
 * same fallback the webhook uses (`billing-actions.ts:838-843`), because Stripe
 * fires webhooks concurrently with the call that creates the link row, so an
 * event can outrun it. Null when neither answers, which is itself reportable.
 */
function userOf(sub: SubscriptionFact, ix: Index): string | null {
  return ix.userByCustomer.get(sub.customerId) ?? sub.metadataUserId ?? null;
}

function activeEntitlements(
  userId: string | null,
  ix: Index,
  now: Date,
): EntitlementFact[] {
  if (!userId) return [];
  return (ix.entitlementsByUser.get(userId) ?? []).filter((e) =>
    isEntitlementActive({ isActive: e.isActive, activeUntil: e.activeUntil }, now),
  );
}

/** Invoices on this subscription where money actually moved. */
function paidInvoices(subId: string, ix: Index): InvoiceFact[] {
  return (ix.invoicesBySub.get(subId) ?? []).filter(
    (i) => i.paidAt !== null && i.amountPaid > 0,
  );
}

function iso(unixSeconds: number | null): string {
  return unixSeconds === null ? "(none)" : new Date(unixSeconds * 1000).toISOString();
}

/** Minor units to a readable amount. DISPLAY ONLY — never fed back to Stripe. */
function money(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

/* ── 1. charge inside a promised grace (§3.1 #6, from 01 and 06) ──── */

/**
 * ⚠️ INVARIANT 1. **Nobody is ever charged after being told they would not be.**
 *
 * The machine-checkable form of "a beta user was never charged inside the
 * fortnight they were promised". The marker carries the PROMISE — `freeTime.ts`
 * writes `trackd_grace_until` from `entitlements.active_until` rather than from
 * the `trial_end` actually sent, because the two differ when the minimum-offset
 * clamp fires and the question here is about the promise.
 *
 * ⚠️ IT READS `paidAt`, NOT `created`. An invoice CREATED inside a free period is
 * normal — every trial start raises a zero-dollar one (`sync.ts:579`). Money
 * MOVING inside one is the thing that must never happen.
 */
export function chargeInsideGrace(s: ReconcileSnapshot, ix: Index): Finding[] {
  const out: Finding[] = [];
  for (const sub of s.subscriptions) {
    if (!sub.graceUntil) continue;
    const promisedEnd = Date.parse(sub.graceUntil);
    if (!Number.isFinite(promisedEnd)) continue;

    for (const inv of paidInvoices(sub.id, ix)) {
      const paidMs = (inv.paidAt as number) * 1000;
      if (paidMs < promisedEnd - INSTANT_TOLERANCE_MS) {
        out.push({
          rule: "charge-inside-grace",
          account: {
            userId: userOf(sub, ix),
            stripeCustomerId: sub.customerId,
          },
          evidence: [
            `subscription ${sub.id} (${sub.status})`,
            `promised free until ${sub.graceUntil} (trackd_grace_until)`,
            `invoice ${inv.id} took ${money(inv.amountPaid, inv.currency)} at ${iso(inv.paidAt)}`,
            `that is INSIDE the promised period by ${hours(promisedEnd - paidMs)}`,
          ],
        });
      }
    }
  }
  return out;
}

/* ── 2. charge inside a courtesy period (§3.1 #7, from 04) ────────── */

/**
 * ⚠️ INVARIANT 1 again, for the save offer's free time.
 *
 * The courtesy period runs from the moment it was CLAIMED to
 * `trackd_courtesy_until`. The claim instant is on the CUSTOMER
 * (`saveOffer.ts:407`) and the end is on the SUBSCRIPTION (`saveOffer.ts:506`).
 *
 * ⚠️ WITHOUT THE CLAIM INSTANT THIS RULE DOES NOT GUESS — it skips, and
 * {@link freePeriodMarkerMissing} reports the missing marker as its own finding.
 * §3.1's warning is explicit that a removed marker must fail LOUDLY rather than
 * blind an assertion, and a rule that invented a lower bound would be doing
 * exactly the blinding it was written to prevent. A charge legitimately taken
 * before the courtesy began must not be reported as one taken inside it.
 */
export function chargeInsideCourtesy(s: ReconcileSnapshot, ix: Index): Finding[] {
  const out: Finding[] = [];
  for (const sub of s.subscriptions) {
    if (!sub.courtesyUntil) continue;
    const end = Date.parse(sub.courtesyUntil);
    if (!Number.isFinite(end)) continue;

    const claimedAt = ix.stripeCustomerById.get(sub.customerId)?.offerClaimedAt ?? null;
    const start = claimedAt ? Date.parse(claimedAt) : NaN;
    if (!Number.isFinite(start)) continue; // reported by the marker rule instead

    for (const inv of paidInvoices(sub.id, ix)) {
      const paidMs = (inv.paidAt as number) * 1000;
      if (paidMs >= start - INSTANT_TOLERANCE_MS && paidMs < end - INSTANT_TOLERANCE_MS) {
        out.push({
          rule: "charge-inside-courtesy",
          account: { userId: userOf(sub, ix), stripeCustomerId: sub.customerId },
          evidence: [
            `subscription ${sub.id} (${sub.status})`,
            `courtesy claimed ${claimedAt}, free until ${sub.courtesyUntil}`,
            `invoice ${inv.id} took ${money(inv.amountPaid, inv.currency)} at ${iso(inv.paidAt)}`,
            `that is INSIDE the courtesy period`,
          ],
        });
      }
    }
  }
  return out;
}

/* ── 3. courtesy granted while unpaid (§3.1 #11, D75) ─────────────── */

/**
 * D75, and the seam `04` §3.3 handed back.
 *
 * **D70 prevents the state; this catches a regression that reintroduced it.** The
 * two are not redundant: a rule enforced in one code path and asserted in another
 * is the only arrangement that survives somebody refactoring the first.
 *
 * "Unpaid at the moment of the grant" is machine-checked as: an invoice on this
 * subscription that was raised before the claim, carried a real amount, and had
 * not been paid by the claim instant. That is the state D70 refuses to grant on.
 */
export function courtesyGrantedWhileUnpaid(
  s: ReconcileSnapshot,
  ix: Index,
): Finding[] {
  const out: Finding[] = [];
  for (const sub of s.subscriptions) {
    if (!sub.courtesyUntil) continue;
    const claimedAt = ix.stripeCustomerById.get(sub.customerId)?.offerClaimedAt ?? null;
    if (!claimedAt) continue; // the marker rule reports the absence
    const claimMs = Date.parse(claimedAt);
    if (!Number.isFinite(claimMs)) continue;

    const owedAtGrant = (ix.invoicesBySub.get(sub.id) ?? []).filter(
      (i) =>
        i.total > 0 &&
        i.created * 1000 <= claimMs &&
        i.status !== "void" &&
        i.status !== "draft" &&
        (i.paidAt === null || i.paidAt * 1000 > claimMs),
    );

    for (const inv of owedAtGrant) {
      out.push({
        rule: "courtesy-granted-while-unpaid",
        account: { userId: userOf(sub, ix), stripeCustomerId: sub.customerId },
        evidence: [
          `subscription ${sub.id}`,
          `courtesy granted at ${claimedAt} (trackd_courtesy_until ${sub.courtesyUntil})`,
          `invoice ${inv.id} (${inv.status}) for ${money(inv.total, inv.currency)} was raised ${iso(inv.created)} and was NOT paid at the grant instant`,
          `D70 makes an unpaid period ineligible for the save offer`,
        ],
      });
    }
  }
  return out;
}

/* ── 4. the markers themselves (§3.1 ⚠️) ──────────────────────────── */

/**
 * ⚠️ ASSERT THE MARKERS ARE PRESENT WHERE THEY SHOULD BE.
 *
 * §3.1: "If either marker is ever removed, its assertion goes blind rather than
 * failing loudly, which is the worst way for a check to die."
 *
 * Three detectors, each finding a free period that SHOULD carry a marker and does
 * not. None of them needs the marker it is looking for, which is the whole point:
 * a rule that detected a missing marker by reading the marker would detect
 * nothing.
 */
export function freePeriodMarkerMissing(s: ReconcileSnapshot, ix: Index): Finding[] {
  const out: Finding[] = [];

  for (const sub of s.subscriptions) {
    const account = { userId: userOf(sub, ix), stripeCustomerId: sub.customerId };
    const customer = ix.stripeCustomerById.get(sub.customerId);

    // (a) A courtesy end with no claim instant. Blinds rules 2 and 3 above.
    if (sub.courtesyUntil && !customer?.offerClaimedAt) {
      out.push({
        rule: "free-period-marker-missing",
        account,
        evidence: [
          `subscription ${sub.id} carries trackd_courtesy_until=${sub.courtesyUntil}`,
          `but customer ${sub.customerId} carries no trackd_save_offer_claimed_at`,
          `charge-inside-courtesy and courtesy-granted-while-unpaid CANNOT RUN on this subscription`,
        ],
      });
    }

    if (sub.status !== "trialing") continue;

    // (b) A paying customer inside a free period is a courtesy by definition —
    //     a first trial cannot have taken money before it. So a `trialing`
    //     subscription with a paid invoice behind it must carry the marker.
    if (!sub.courtesyUntil && paidInvoices(sub.id, ix).length > 0) {
      const paid = paidInvoices(sub.id, ix);
      out.push({
        rule: "free-period-marker-missing",
        account,
        evidence: [
          `subscription ${sub.id} is trialing but has ${paid.length} paid invoice(s) behind it`,
          `a first trial cannot have taken money, so this is a courtesy period`,
          `it carries NO trackd_courtesy_until, so charge-inside-courtesy is blind to it`,
          `most recent payment: ${paid.map((i) => `${i.id} at ${iso(i.paidAt)}`).slice(-1)[0]}`,
        ],
      });
    }

    // (c) A trial aligned to a beta grace must carry the grace marker. Detected
    //     WITHOUT the marker: the user holds a dated comp entitlement and the
    //     trial ends at that date, give or take the 48h clamp.
    if (!sub.graceUntil && !sub.courtesyUntil && sub.trialEnd !== null) {
      const user = userOf(sub, ix);
      const datedComp = (user ? (ix.entitlementsByUser.get(user) ?? []) : []).filter(
        (e) => e.source === "comp" && e.activeUntil !== null,
      );
      const trialEndMs = sub.trialEnd * 1000;
      const aligned = datedComp.find((e) => {
        const compMs = Date.parse(e.activeUntil as string);
        return (
          Number.isFinite(compMs) &&
          trialEndMs >= compMs - INSTANT_TOLERANCE_MS &&
          trialEndMs <= compMs + CLAMP_WINDOW_MS
        );
      });
      if (aligned) {
        out.push({
          rule: "free-period-marker-missing",
          account,
          evidence: [
            `subscription ${sub.id} is trialing until ${iso(sub.trialEnd)}`,
            `which matches this account's beta grace ending ${aligned.activeUntil}`,
            `but it carries NO trackd_grace_until, so charge-inside-grace is blind to it`,
          ],
        });
      }
    }
  }
  return out;
}

/* ── 5. two billable subscriptions (§3.1 #1) ──────────────────────── */

/**
 * Nobody holds more than one billable subscription at any moment.
 *
 * ⚠️ COUNTED WITH {@link BILLABLE_STATUSES}, WHICH INCLUDES `incomplete`. §3.1 #1
 * says so explicitly: "Counting every status the app treats as billable,
 * including the incomplete one." An `incomplete` subscription keeps its first
 * invoice payable for ~23 hours, so a second subscription created alongside one
 * is two things that can both take money — which is the failure, whatever the
 * statuses are called.
 */
export function twoBillableSubscriptions(s: ReconcileSnapshot, ix: Index): Finding[] {
  const out: Finding[] = [];
  for (const [customerId, subs] of ix.subsByCustomer) {
    const billable = subs.filter((sub) => BILLABLE_STATUSES.has(sub.status));
    if (billable.length <= 1) continue;
    out.push({
      rule: "two-billable-subscriptions",
      account: {
        userId: ix.userByCustomer.get(customerId) ?? billable[0].metadataUserId ?? null,
        stripeCustomerId: customerId,
      },
      evidence: [
        `${billable.length} billable subscriptions on one customer`,
        ...billable.map(
          (sub) => `  ${sub.id}  ${sub.status}  created ${iso(sub.created)}`,
        ),
      ],
    });
  }
  return out;
}

/* ── 6. a live subscription with no entitlement (§3.1 #3) ─────────── */

/**
 * Somebody is paying, or inside a period we promised, and the app is giving them
 * nothing. The worst customer-facing state in the system that is not a wrong
 * charge.
 *
 * Restricted to {@link ACCESS_PROMISED} rather than `BILLABLE_STATUSES`: see that
 * constant for why `incomplete` is excluded and where it is handled instead.
 */
export function liveSubscriptionWithoutEntitlement(
  s: ReconcileSnapshot,
  ix: Index,
): Finding[] {
  const out: Finding[] = [];
  for (const sub of s.subscriptions) {
    if (!ACCESS_PROMISED.has(sub.status)) continue;
    const user = userOf(sub, ix);

    if (!user) {
      out.push({
        rule: "live-subscription-without-entitlement",
        account: { userId: null, stripeCustomerId: sub.customerId },
        evidence: [
          `subscription ${sub.id} is ${sub.status} but could not be tied to any account`,
          `no billing_customers row for ${sub.customerId} and no metadata.user_id`,
          `nobody can be granted access for this, and nobody is being told`,
        ],
      });
      continue;
    }

    if (activeEntitlements(user, ix, s.now).length === 0) {
      out.push({
        rule: "live-subscription-without-entitlement",
        account: { userId: user, stripeCustomerId: sub.customerId },
        evidence: [
          `subscription ${sub.id} is ${sub.status}`,
          `account ${user} holds NO active entitlement`,
          `the app decides access from entitlements alone, so this account is locked out while paying`,
        ],
      });
    }
  }
  return out;
}

/* ── 7. an entitlement with nothing behind it (§3.1 #2) ───────────── */

/**
 * Every active entitlement traces to a live subscription or a comp.
 *
 * ⚠️ THE MONEY QUESTION, NOT THE STATUS QUESTION. The test is "is money we still
 * hold paying for this access", which is {@link MONEY_BEHIND_ACCESS}, not "is
 * there a subscription row". An entitlement backed only by an `incomplete`
 * subscription has nothing behind it: nothing has been paid.
 *
 * A `comp` is its own source and needs nothing behind it — that is what a comp
 * is, and `001_billing_tables.sql` calls it the cheapest possible proof that the
 * read path never asks Stripe. `apple` and `google` are skipped: RevenueCat will
 * write those rows and this script has no store receipts to check them against,
 * so asserting on them would report every future mobile subscriber. Named rather
 * than silently dropped, because a skip nobody wrote down becomes a hole.
 */
export function entitlementWithoutSource(s: ReconcileSnapshot, ix: Index): Finding[] {
  const out: Finding[] = [];
  const customerByUser = new Map<string, string>();
  for (const c of s.customers) customerByUser.set(c.userId, c.stripeCustomerId);

  for (const e of s.entitlements) {
    if (!isEntitlementActive({ isActive: e.isActive, activeUntil: e.activeUntil }, s.now)) {
      continue;
    }
    if (e.source === "comp") continue;
    if (e.source === "apple" || e.source === "google") continue;

    const customerId = customerByUser.get(e.userId);
    const subs = customerId ? (ix.subsByCustomer.get(customerId) ?? []) : [];
    const behind = subs.filter((sub) => MONEY_BEHIND_ACCESS.has(sub.status));

    if (behind.length === 0) {
      out.push({
        rule: "entitlement-without-source",
        account: { userId: e.userId, stripeCustomerId: customerId ?? null },
        evidence: [
          `account ${e.userId} holds an ACTIVE ${e.source} entitlement for ${e.product}`,
          `active_until ${e.activeUntil ?? "(never expires)"}`,
          customerId
            ? `customer ${customerId} has ${subs.length} subscription(s), none of them trialing, active or past_due`
            : `no billing_customers row, so no Stripe subscription can be behind it`,
          ...subs.map((sub) => `  ${sub.id}  ${sub.status}`),
        ],
      });
    }
  }
  return out;
}

/* ── 8. charge date vs entitlement date (§3.1 #5, D72) ────────────── */

/**
 * A charge date and an entitlement date that disagree.
 *
 * ## ⚠️ D72 — the tolerance runs ONE WAY ONLY
 *
 * §3.1b: a trial end sitting slightly LATER than the arithmetic predicts, in the
 * direction that favours the user, is **clean**. "Later is honoured, earlier is a
 * finding, because earlier means somebody is charged before the date they were
 * shown."
 *
 * That is not leniency, it is the `freeTime.ts` clamp working as designed: a beta
 * user in the last hours of their fortnight gets their trial end pushed out to
 * Stripe's minimum offset, so Stripe's date is legitimately later than the
 * promise. **A check that flags the product keeping its word is a check that
 * trains its reader to ignore findings.**
 *
 * ⚠️ KNOWN GAP, DELIBERATELY NOT CLOSED: because later is always honoured, an
 * arbitrarily large later divergence — access granted far beyond what will ever
 * be charged for — is not reported here. D72 states the one-way tolerance without
 * a ceiling, and §2 forbids inventing a rule no spec states. Raised for the spec
 * chat rather than decided here; {@link entitlementWithoutSource} still catches
 * the case where nothing is behind the access at all.
 */
export function chargeAndEntitlementDatesDisagree(
  s: ReconcileSnapshot,
  ix: Index,
): Finding[] {
  const out: Finding[] = [];
  for (const sub of s.subscriptions) {
    if (!ACCESS_PROMISED.has(sub.status)) continue;
    const user = userOf(sub, ix);
    if (!user) continue; // reported by liveSubscriptionWithoutEntitlement

    // What Stripe will actually charge on.
    const chargeAtSec = sub.status === "trialing" ? sub.trialEnd : sub.currentPeriodEnd;
    if (chargeAtSec === null) continue;
    const chargeMs = chargeAtSec * 1000;

    // What the app tells this user their access runs to.
    const stripeRow = (ix.entitlementsByUser.get(user) ?? []).find(
      (e) => e.source === "stripe" && e.activeUntil !== null,
    );
    if (!stripeRow) continue;
    const shownMs = Date.parse(stripeRow.activeUntil as string);
    if (!Number.isFinite(shownMs)) continue;

    if (chargeMs < shownMs - INSTANT_TOLERANCE_MS) {
      out.push({
        rule: "charge-and-entitlement-dates-disagree",
        account: { userId: user, stripeCustomerId: sub.customerId },
        evidence: [
          `subscription ${sub.id} (${sub.status})`,
          `Stripe will charge at ${iso(chargeAtSec)}`,
          `the app shows access running to ${stripeRow.activeUntil}`,
          `the charge lands ${hours(shownMs - chargeMs)} BEFORE the date the user was shown`,
        ],
      });
    }
  }
  return out;
}

/* ── 9. incomplete past the window, with access (§3.1 #8, from 02a) ─ */

/**
 * An `incomplete` subscription that has outlived Stripe's cancellation window and
 * still has an entitlement attached — access granted for a payment that never
 * completed. See {@link INCOMPLETE_WINDOW_MS} for why the window is 24 hours and
 * not the fifteen days the spec text states.
 */
export function incompletePastWindow(s: ReconcileSnapshot, ix: Index): Finding[] {
  const out: Finding[] = [];
  for (const sub of s.subscriptions) {
    if (sub.status !== "incomplete") continue;
    const age = s.now.getTime() - sub.created * 1000;
    if (age <= INCOMPLETE_WINDOW_MS) continue;

    const user = userOf(sub, ix);
    const active = activeEntitlements(user, ix, s.now);
    if (active.length === 0) continue;

    out.push({
      rule: "incomplete-past-window-with-entitlement",
      account: { userId: user, stripeCustomerId: sub.customerId },
      evidence: [
        `subscription ${sub.id} has been incomplete for ${hours(age)} (created ${iso(sub.created)})`,
        `Stripe expires an incomplete subscription at ~23h (measured, e8dc9b0)`,
        `account ${user ?? "(unresolved)"} still holds ${active.length} active entitlement(s): ${active
          .map((e) => e.source)
          .join(", ")}`,
        `nothing has been paid for this access`,
      ],
    });
  }
  return out;
}

/* ── 10. a zero-dollar invoice nobody granted (§3.1 #12, from 19) ─── */

/**
 * D69 / §3.1 #12: "A free period raises an invoice, and every one of them should
 * trace to a courtesy grant or a grace-aligned start."
 *
 * ⚠️ A THIRD EXPLANATION IS ACCEPTED, AND IT IS NOT AN INVENTED RULE. §3.4 names
 * **three** things that wear Stripe's trial status: a real first-time trial, a
 * courtesy period, and a grace-aligned start. The spec sentence for this
 * assertion names only the last two, but a genuine first trial also raises a
 * zero-dollar invoice (`sync.ts:579`) and is a free period spec `01` deliberately
 * granted. Reporting every first trial would make the report permanently noisy,
 * which §3.5 forbids outright.
 *
 * So a zero invoice is explained by a trial end as well as by either marker, and
 * this divergence from the literal sentence is routed to the spec chat rather
 * than settled here.
 */
export function unexplainedZeroInvoice(s: ReconcileSnapshot, ix: Index): Finding[] {
  const out: Finding[] = [];
  const subById = new Map(s.subscriptions.map((sub) => [sub.id, sub]));

  for (const inv of s.invoices) {
    if (inv.total !== 0) continue;
    if (inv.status === "draft" || inv.status === "void") continue;

    const sub = inv.subscriptionId ? subById.get(inv.subscriptionId) : undefined;
    const explained =
      sub !== undefined &&
      (sub.graceUntil !== null || sub.courtesyUntil !== null || sub.trialEnd !== null);
    if (explained) continue;

    out.push({
      rule: "unexplained-zero-invoice",
      account: {
        userId: sub ? userOf(sub, ix) : null,
        stripeCustomerId: inv.customerId,
      },
      evidence: [
        `invoice ${inv.id} (${inv.status}) is for ${money(0, inv.currency)} and raised ${iso(inv.created)}`,
        sub
          ? `subscription ${sub.id} (${sub.status}) carries no grace marker, no courtesy marker and no trial end`
          : `it is not attached to any subscription this run could see`,
        `a free period nobody granted; treated as unattributed, per §3.1 #12`,
      ],
    });
  }
  return out;
}

/* ── 11 & 12. the webhook ledger (§3.1 #4, §3.3) ──────────────────── */

/**
 * ⚠️ TWO STATES, REPORTED SEPARATELY, because they have different causes and
 * different fixes (§3.3).
 *
 *   **unattributed** — we could not work out whose it was. A paying customer with
 *     no entitlement and nobody being told.
 *   **unprocessed**  — we knew whose it was and a handler did not finish.
 *
 * The ledger cannot tell them apart on its own: both leave `processed_at` null,
 * deliberately, because stamping an unattributable event made the partial index
 * permanently empty and the failure invisible. So `fetch.ts` re-derives the
 * attribution and this splits on it.
 *
 * ⚠️ EVERY ROW HERE HAS FAILED MORE THAN ONCE. `claimEvent` treats a row left
 * unprocessed for more than a minute as a crashed attempt and lets the next
 * delivery retry it (`webhook/route.ts:161-202`), so a row still unstamped when
 * this runs is not a first failure. §3.3 asks for that to be said rather than
 * counted.
 */
export function webhookLedger(s: ReconcileSnapshot): Finding[] {
  return s.unstampedWebhooks.map((w) => {
    const ageMs = s.now.getTime() - Date.parse(w.receivedAt);
    const retried = Number.isFinite(ageMs) && ageMs > 60_000;
    return w.attributableToUserId === null
      ? {
          rule: "webhook-unattributed" as const,
          account: { userId: null, stripeCustomerId: w.customerId },
          evidence: [
            `${w.type} (${w.eventId}) received ${w.receivedAt}`,
            w.customerId
              ? `names customer ${w.customerId}, which maps to no account`
              : `names no customer at all`,
            retried
              ? `unstamped for ${hours(ageMs)} — it has been retried and failed again`
              : `received in the last minute; a delivery may still be working on it`,
          ],
        }
      : {
          rule: "webhook-unprocessed" as const,
          account: { userId: w.attributableToUserId, stripeCustomerId: w.customerId },
          evidence: [
            `${w.type} (${w.eventId}) received ${w.receivedAt}`,
            `attributable to account ${w.attributableToUserId}, so a handler did not finish`,
            retried
              ? `unstamped for ${hours(ageMs)} — it has been retried and failed again`
              : `received in the last minute; a delivery may still be working on it`,
          ],
        };
  });
}

/* ── 13. an archived price (§3.1 #9) ──────────────────────────────── */

/**
 * Every live subscription's price is one of the three we currently sell, not an
 * archived iteration left on the product. From the dashboard review.
 */
export function subscriptionOnArchivedPrice(
  s: ReconcileSnapshot,
  ix: Index,
): Finding[] {
  // With no configured prices the rule cannot answer, and answering anyway would
  // report every subscription. `fetch.ts` has already recorded that as a failed
  // read, so the run cannot report clean either.
  if (s.activePriceIds.length === 0) return [];

  const active = new Set(s.activePriceIds);
  const out: Finding[] = [];
  for (const sub of s.subscriptions) {
    if (!BILLABLE_STATUSES.has(sub.status)) continue;
    const archived = sub.priceIds.filter((id) => !active.has(id));
    if (archived.length === 0) continue;

    out.push({
      rule: "subscription-on-archived-price",
      account: { userId: userOf(sub, ix), stripeCustomerId: sub.customerId },
      evidence: [
        `subscription ${sub.id} (${sub.status}) is on ${archived.join(", ")}`,
        `the configured prices are ${s.activePriceIds.join(", ")}`,
        `a dashboard price change does not migrate existing subscriptions`,
      ],
    });
  }
  return out;
}

/* ── 14. two entitlements from one source (§3.1 #10) ──────────────── */

/**
 * The `entitlements_one_per_source` unique constraint should make this
 * impossible. §3.1 #10: "asserting it is how we find out if it ever wasn't."
 */
export function duplicateEntitlementSource(s: ReconcileSnapshot): Finding[] {
  const seen = new Map<string, EntitlementFact[]>();
  for (const e of s.entitlements) {
    push(seen, `${e.userId}|${e.product}|${e.source}`, e);
  }
  const out: Finding[] = [];
  for (const [key, rows] of seen) {
    if (rows.length <= 1) continue;
    const [userId] = key.split("|");
    out.push({
      rule: "duplicate-entitlement-source",
      account: { userId, stripeCustomerId: null },
      evidence: [
        `${rows.length} entitlement rows share (user, product, source) = ${key}`,
        `the entitlements_one_per_source unique constraint should have refused this`,
        ...rows.map(
          (r) => `  active_until ${r.activeUntil ?? "(never)"}  is_active ${r.isActive}`,
        ),
      ],
    });
  }
  return out;
}

/* ── 15. nowhere to send an alert (D46) ───────────────────────────── */

/**
 * D46, resolved: "push plus dashboard, **and a missing subscription fails the
 * clean run**".
 *
 * Push reaches a founder's phone in seconds and only if that device is
 * subscribed. An alerting system with no subscribed device is itself a silent
 * failure, so it is asserted rather than assumed — otherwise the first time
 * anybody learns the alerts go nowhere is the night a rule breaks.
 */
export function noAlertDeviceSubscribed(s: ReconcileSnapshot): Finding[] {
  if (s.alertDevices > 0) return [];
  return [
    {
      rule: "no-alert-device-subscribed",
      account: null,
      evidence: [
        `no founder device is subscribed to web push`,
        `every alert this script raises would reach nobody`,
        `open Trackd Co on a founder account and enable notifications`,
      ],
    },
  ];
}

/* ── the whole set ────────────────────────────────────────────────── */

/**
 * Run every rule and return the findings worst first.
 *
 * The order comes from `RULES` in `types.ts`, where the first three are the ones
 * that mean money moved after somebody was told it would not.
 */
export function runRules(s: ReconcileSnapshot): Finding[] {
  const ix = indexOf(s);
  const findings = [
    ...chargeInsideGrace(s, ix),
    ...chargeInsideCourtesy(s, ix),
    ...courtesyGrantedWhileUnpaid(s, ix),
    ...freePeriodMarkerMissing(s, ix),
    ...twoBillableSubscriptions(s, ix),
    ...liveSubscriptionWithoutEntitlement(s, ix),
    ...entitlementWithoutSource(s, ix),
    ...chargeAndEntitlementDatesDisagree(s, ix),
    ...incompletePastWindow(s, ix),
    ...unexplainedZeroInvoice(s, ix),
    ...webhookLedger(s),
    ...subscriptionOnArchivedPrice(s, ix),
    ...duplicateEntitlementSource(s),
    ...noAlertDeviceSubscribed(s),
  ];
  return findings.sort((a, b) => severityOf(a.rule) - severityOf(b.rule));
}

/** Test seam: build the index without running anything. */
export function buildIndex(s: ReconcileSnapshot): Index {
  return indexOf(s);
}

function hours(ms: number): string {
  const h = ms / (60 * 60 * 1000);
  if (h < 1) return `${Math.round(ms / 60000)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)} days`;
}
