import "server-only";

import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { isFounder } from "@/lib/admin";
import { COURTESY_KEY } from "@/lib/billing/saveOffer";
import { serviceClient } from "@/lib/billing/service";
import { isTestMode, PRICE_ENV, stripe } from "@/lib/billing/stripe";

import type { RevokedReason } from "../access";
import type {
  Completeness,
  CustomerLinkFact,
  EntitlementFact,
  InvoiceFact,
  ReconcileSnapshot,
  StripeCustomerFact,
  StripeMode,
  SubscriptionFact,
  UnstampedWebhookFact,
} from "./types";

/**
 * STEP 1 — THE FETCH LAYER (Spec 11 §3.2).
 *
 * Ask Stripe for the truth and our tables for what should have happened, and
 * **say whether the asking was complete**.
 *
 * ## ⚠️ IT WRITES NOTHING, AND THAT IS THE PROPERTY THAT MAKES IT SAFE
 *
 * §2: no writes, no updates, no cancels, no refunds, no deletes — not in Stripe,
 * not in the database. Every call in this file is a `list`, a `select` or a
 * `retrieve`. That is what makes it safe to run against production on a schedule,
 * and it is the thing to check first in any review of this file.
 *
 * ## Pagination is the failure this is most likely to have and least likely to
 * notice
 *
 * §3.2 names it outright. The house pattern already exists in
 * `lib/billing/subscriptionList.ts`: page to a cap, ask for **one more than the
 * cap** so overflow is detectable rather than indistinguishable from a full page,
 * and refuse to answer from a truncated list.
 *
 * ⚠️ THIS FILE DEVIATES ON THE LAST POINT, DELIBERATELY. `listAllSubscriptions`
 * THROWS on overflow, and that is right there: every one of its callers is about
 * to spend or refuse somebody's money on the answer, so a short list is a
 * confident wrong answer. Here a throw would discard every finding the run had
 * already collected — the opposite of what a reconciliation run is for. So
 * truncation is RECORDED and {@link Completeness} carries it, and `report.ts`
 * refuses to print the word "clean" when it is non-empty.
 *
 * ## Bulk, not per-account
 *
 * §3.2: "Fetch in bulk rather than per-account where the API allows it, and let
 * the run take longer rather than fan out." So this asks Stripe for every
 * subscription and every invoice on the account in two paginated sweeps, rather
 * than one round trip per customer. At ninety accounts either would work; at nine
 * hundred only this one would.
 */

/**
 * How deep a sweep goes before it reports itself incomplete.
 *
 * Higher than `SUBSCRIPTION_PAGE_CAP` (1000), because that one bounds ONE
 * customer's history and this bounds the whole account's. Fifty pages of a
 * hundred is minutes of API time, not hours, and the run is allowed to be slow —
 * §3.2 says to let it take longer rather than fan out.
 */
export const RECONCILE_PAGE_CAP = 5000;

/** Unstamped webhook rows read in one go. Healthy is zero; a flood is a finding. */
const WEBHOOK_ROW_CAP = 2000;

/**
 * Read everything the rules need, and record what could not be read.
 *
 * `now` is passed in rather than read here so the whole pipeline is testable and
 * so every rule measures against one instant. A run whose rules each called
 * `new Date()` could report a subscription as both inside and outside a period.
 */
export async function takeSnapshot(now: Date): Promise<ReconcileSnapshot> {
  const completeness: Completeness = { truncated: [], failed: [] };
  const mode: StripeMode = isTestMode() ? "test" : "live";
  const client = stripe();

  const [subscriptions, invoices, stripeCustomers] = await Promise.all([
    fetchSubscriptions(client, completeness),
    fetchInvoices(client, completeness),
    fetchStripeCustomers(client, completeness),
  ]);

  const [entitlements, customers, alertDevices] = await Promise.all([
    fetchEntitlements(completeness),
    fetchCustomerLinks(completeness),
    countAlertDevices(completeness),
  ]);

  // AFTER the customer links, because attributing a webhook needs them.
  const unstampedWebhooks = await fetchUnstampedWebhooks(mode, customers, completeness);

  return {
    mode,
    now,
    subscriptions,
    invoices,
    stripeCustomers,
    entitlements,
    customers,
    unstampedWebhooks,
    activePriceIds: configuredPriceIds(completeness),
    alertDevices,
    completeness,
  };
}

/* ── Stripe ───────────────────────────────────────────────────────── */

async function fetchSubscriptions(
  client: Stripe,
  completeness: Completeness,
): Promise<SubscriptionFact[]> {
  try {
    const all = await client.subscriptions
      .list({
        // One request per status would be several round trips that can disagree
        // with each other; the same reasoning `subscriptionList.ts` gives.
        status: "all",
        limit: 100,
      })
      // ⚠️ CAP + 1. Asking for exactly the cap makes "there are exactly N" and
      // "there are more than N" the same observation.
      .autoPagingToArray({ limit: RECONCILE_PAGE_CAP + 1 });

    if (all.length > RECONCILE_PAGE_CAP) {
      completeness.truncated.push(
        `subscriptions: more than ${RECONCILE_PAGE_CAP} exist; only the first ${RECONCILE_PAGE_CAP} were read`,
      );
    }
    return all.slice(0, RECONCILE_PAGE_CAP).map(toSubscriptionFact);
  } catch (err) {
    completeness.failed.push(`subscriptions: ${message(err)}`);
    return [];
  }
}

async function fetchInvoices(
  client: Stripe,
  completeness: Completeness,
): Promise<InvoiceFact[]> {
  try {
    const all = await client.invoices
      .list({ limit: 100 })
      .autoPagingToArray({ limit: RECONCILE_PAGE_CAP + 1 });

    if (all.length > RECONCILE_PAGE_CAP) {
      completeness.truncated.push(
        `invoices: more than ${RECONCILE_PAGE_CAP} exist; only the first ${RECONCILE_PAGE_CAP} were read`,
      );
    }
    return all.slice(0, RECONCILE_PAGE_CAP).map(toInvoiceFact);
  } catch (err) {
    completeness.failed.push(`invoices: ${message(err)}`);
    return [];
  }
}

/**
 * Every Stripe customer, for the two save-offer markers that live on them.
 *
 * ⚠️ FETCHED SEPARATELY BECAUSE THE MARKERS ARE SPLIT ACROSS TWO OBJECTS. See
 * {@link StripeCustomerFact} — `claimed_at` is customer metadata and
 * `courtesy_until` is subscription metadata, and reading either from the wrong
 * object returns null silently rather than erroring. D75's rule measures against
 * the claim instant, so getting this wrong would make it pass vacuously forever.
 *
 * Expanding the customer on each subscription would be the obvious alternative
 * and is worse: it is one expansion per subscription against §3.2's "fetch in
 * bulk rather than per-account", and Stripe caps expansion depth on list calls.
 */
async function fetchStripeCustomers(
  client: Stripe,
  completeness: Completeness,
): Promise<StripeCustomerFact[]> {
  try {
    const all = await client.customers
      .list({ limit: 100 })
      .autoPagingToArray({ limit: RECONCILE_PAGE_CAP + 1 });

    if (all.length > RECONCILE_PAGE_CAP) {
      completeness.truncated.push(
        `customers: more than ${RECONCILE_PAGE_CAP} exist; only the first ${RECONCILE_PAGE_CAP} were read`,
      );
    }
    return all.slice(0, RECONCILE_PAGE_CAP).map((c) => ({
      id: c.id,
      offerShownAt: c.metadata?.[SHOWN_KEY] ?? null,
      offerClaimedAt: c.metadata?.[CLAIMED_KEY] ?? null,
    }));
  } catch (err) {
    completeness.failed.push(`customers: ${message(err)}`);
    return [];
  }
}

function toSubscriptionFact(s: Stripe.Subscription): SubscriptionFact {
  const md = s.metadata ?? {};
  return {
    id: s.id,
    customerId: typeof s.customer === "string" ? s.customer : s.customer.id,
    status: s.status,
    priceIds: (s.items?.data ?? [])
      .map((item) => item.price?.id)
      .filter((id): id is string => Boolean(id)),
    created: s.created,
    trialEnd: s.trial_end ?? null,
    /**
     * ⚠️ `current_period_end` MOVED OFF THE SUBSCRIPTION in this API version and
     * lives on the item. Read from the item first and fall back, rather than
     * assuming either shape — a null here would make the date-agreement rule
     * silently skip every subscription instead of failing.
     */
    currentPeriodEnd:
      (s.items?.data ?? []).map((item) => item.current_period_end).find(Boolean) ??
      (s as unknown as { current_period_end?: number }).current_period_end ??
      null,
    cancelAtPeriodEnd: s.cancel_at_period_end ?? false,
    metadataUserId: md.user_id ?? null,
    graceUntil: md[GRACE_KEY] ?? null,
    courtesyUntil: md[COURTESY_KEY] ?? null,
  };
}

/**
 * The grace marker's key, written by `app/onboarding/billing-actions.ts:865`.
 *
 * Declared here rather than imported because `freeTime.ts` writes it as an inline
 * object literal and exports no constant for it. ⚠️ THAT IS A REAL FRAGILITY and
 * the marker-presence rule exists partly because of it: if the two ever drift,
 * `charge-inside-grace` goes blind rather than failing, which §3.1's warning
 * calls the worst way for a check to die. A test pins the two together.
 */
export const GRACE_KEY = "trackd_grace_until";

/**
 * `saveOffer.ts`'s two CUSTOMER-metadata markers. Both are module-private there,
 * so they are restated here and pinned to the source by a test rather than left
 * to drift. See {@link StripeCustomerFact} for why reading them off the wrong
 * object is a silent failure.
 */
export const SHOWN_KEY = "trackd_save_offer_shown_at";
export const CLAIMED_KEY = "trackd_save_offer_claimed_at";

function toInvoiceFact(i: Stripe.Invoice): InvoiceFact {
  return {
    id: i.id ?? "(no id)",
    customerId: typeof i.customer === "string" ? i.customer : (i.customer?.id ?? null),
    subscriptionId: subscriptionIdOf(i),
    status: i.status ?? "unknown",
    amountPaid: i.amount_paid ?? 0,
    total: i.total ?? 0,
    currency: i.currency ?? "",
    created: i.created,
    /**
     * WHEN MONEY ACTUALLY MOVED, not when the invoice was raised.
     *
     * The money rules turn on this. An invoice CREATED inside a free period is
     * normal — every trial start raises a zero-dollar one (`sync.ts:579`). An
     * invoice PAID inside one is the thing that must never happen.
     */
    paidAt: i.status_transitions?.paid_at ?? null,
    billingReason: i.billing_reason ?? null,
  };
}

/**
 * Which subscription an invoice belongs to.
 *
 * ⚠️ `invoice.subscription` DOES NOT EXIST in this API version. The same walk as
 * `lib/billing/sync.ts:866-877`, duplicated rather than imported because that one
 * is a private function inside a module that writes; importing it here would put
 * a writer on this file's import graph, and §2 says this path writes nothing.
 */
function subscriptionIdOf(invoice: Stripe.Invoice): string | null {
  const parent = (
    invoice as {
      parent?: { subscription_details?: { subscription?: string | { id: string } } };
    }
  ).parent;
  const viaParent = parent?.subscription_details?.subscription;
  if (typeof viaParent === "string") return viaParent;
  if (viaParent && typeof viaParent === "object") return viaParent.id;

  const legacy = (invoice as { subscription?: string | { id: string } }).subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object") return legacy.id;

  return null;
}

/**
 * The three prices this environment is configured with.
 *
 * Read from the environment rather than from Stripe: the question assertion 9
 * asks is "is this subscription on one of the prices we currently sell", and the
 * answer to "what do we currently sell" is the configuration, not the dashboard.
 * A price archived in Stripe but still configured here is a deployment fault that
 * `assertModeMatches` and `loadPrices` already surface loudly at checkout.
 */
function configuredPriceIds(completeness: Completeness): string[] {
  const ids = Object.values(PRICE_ENV)
    .map((envName) => process.env[envName])
    .filter((id): id is string => Boolean(id));

  if (ids.length !== Object.keys(PRICE_ENV).length) {
    // Not a finding about a user, so it belongs in completeness: the archived-price
    // rule cannot answer correctly against a partial list, and answering anyway
    // would report every live subscription as being on an archived price.
    completeness.failed.push(
      `price configuration: only ${ids.length} of ${Object.keys(PRICE_ENV).length} price ids are set, so the archived-price rule cannot run`,
    );
  }
  return ids;
}

/* ── our tables ───────────────────────────────────────────────────── */

async function fetchEntitlements(completeness: Completeness): Promise<EntitlementFact[]> {
  const { data, error } = await serviceClient()
    .from("entitlements")
    .select("user_id, product, source, active_until, is_active");

  if (error) {
    completeness.failed.push(`entitlements: ${error.message}`);
    return [];
  }

  const reasons = await fetchRevokedReasons(completeness);
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    product: row.product,
    source: row.source,
    activeUntil: row.active_until,
    isActive: row.is_active,
    /**
     * Only a row that is OFF has a reason. An active row is not "unknown because
     * we did not look" — there is no revocation to explain, and this is the same
     * convention `entitlementFacts` uses (`revokedReason` is always `"unknown"`
     * when `revoked` is false).
     */
    revokedReason: row.is_active
      ? ("unknown" as const)
      : (reasons.get(reasonKey(row.user_id, row.product, row.source)) ?? "unknown"),
  }));
}

const reasonKey = (userId: string, product: string, source: string) =>
  `${userId}|${product}|${source}`;

/**
 * ⚠️ WHY EACH REVOKED ROW WAS TURNED OFF, IN ITS OWN TOLERANT QUERY (D101 / Q106).
 *
 * ## ⚠️ ITS OWN QUERY, AND HERE THE REASON IS SHARPER THAN ON THE SCREENS
 *
 * `entitlements.ts` keeps `revoked_reason` out of the access select because one
 * unknown column makes PostgREST reject the WHOLE request, and a missing display
 * column would become "nobody has access". The cost here is different and worse:
 * {@link fetchEntitlements} returning `[]` does not blank a screen, it makes
 * **every live subscriber look like they have no entitlement**, and
 * `live-subscription-without-entitlement` fires on all of them. Incompleteness
 * does not suppress findings — `report.ts` says so in as many words, the status
 * is incomplete even when there are findings — so folding this column in would
 * turn one unapplied migration into a report full of invented lockouts.
 *
 * So the reason is read separately and its failure costs only detail.
 *
 * ## The two failures are NOT the same fact
 *
 *   column absent   `005` is not applied yet. An EXPECTED deploy-gap state: every
 *                   reason reads `"unknown"`, every rule still fires, and nothing
 *                   is hidden. Logged, not escalated.
 *   read failed     we could not ask. That IS "I could not see", so it goes to
 *                   `completeness.failed` and the run reports itself incomplete.
 *
 * The same split `revokedReasonFor` makes on the screen side, read the same way,
 * so the two cannot drift into disagreeing about what "unknown" means.
 */
async function fetchRevokedReasons(
  completeness: Completeness,
): Promise<Map<string, RevokedReason>> {
  const out = new Map<string, RevokedReason>();
  const { data, error } = await serviceClient()
    .from("entitlements")
    .select("user_id, product, source, revoked_reason")
    .eq("is_active", false);

  if (error) {
    /**
     * ⚠️ BOTH CODES. PostgREST answers `PGRST204` from its own schema cache and
     * Postgres answers `42703`, and which one arrives depends on which layer
     * rejects first. `sync.ts` and `runner.ts` carry the same pair for the same
     * reason; this one is deliberately narrower than `sync.ts`'s, which also
     * sniffs the message text.
     */
    if (error.code === "PGRST204" || error.code === "42703") {
      console.info(
        "[reconcile] revoked_reason is not present (005 unapplied); every revocation reads as unknown",
      );
      return out;
    }
    completeness.failed.push(`entitlements.revoked_reason: ${error.message}`);
    return out;
  }

  for (const row of data ?? []) {
    const reason = row.revoked_reason;
    out.set(
      reasonKey(row.user_id, row.product, row.source),
      reason === "dispute" || reason === "refund" ? reason : "unknown",
    );
  }
  return out;
}

async function fetchCustomerLinks(
  completeness: Completeness,
): Promise<CustomerLinkFact[]> {
  const { data, error } = await serviceClient()
    .from("billing_customers")
    .select("user_id, stripe_customer_id");

  if (error) {
    completeness.failed.push(`billing_customers: ${error.message}`);
    return [];
  }
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    stripeCustomerId: row.stripe_customer_id,
  }));
}

/**
 * The unstamped rows of the webhook ledger, SCOPED TO THIS RUN'S MODE.
 *
 * ## ⚠️ Why the mode filter is not optional
 *
 * `webhook_events` holds test-mode and live-mode events in one production table.
 * On 2026-08-17 it held **148 unstamped test-mode rows** left by QA teardown —
 * the fixtures' users were deleted, so those events can never be attributed to
 * anybody. A live run that counted them would report 148 findings on every run,
 * forever, and §3.5's whole value is that the report is quiet when things are
 * fine. This reads §3.2's "a test-mode run is never evidence for a live-mode
 * conclusion" in the direction it already points.
 *
 * ⚠️ IT FILTERS, IT DOES NOT DISCARD. A genuinely unprocessed LIVE event still
 * surfaces on a live run — that is the entire point of the assertion. The filter
 * removes the other mode's rows, never this mode's.
 *
 * ## Why attribution is re-derived rather than read
 *
 * §3.3 requires "unattributed" and "unprocessed" to be reported separately, and
 * the ledger has no column that tells them apart: both leave `processed_at` null
 * by design. So this asks the same question the handler asked — can this event be
 * tied to an account — against `billing_customers` and the payload's own
 * `metadata.user_id`.
 */
async function fetchUnstampedWebhooks(
  mode: StripeMode,
  customers: CustomerLinkFact[],
  completeness: Completeness,
): Promise<UnstampedWebhookFact[]> {
  const { data, error } = await serviceClient()
    .from("webhook_events")
    .select("stripe_event_id, type, received_at, payload")
    .is("processed_at", null)
    .order("received_at", { ascending: true })
    .limit(WEBHOOK_ROW_CAP + 1);

  if (error) {
    completeness.failed.push(`webhook_events: ${error.message}`);
    return [];
  }

  const rows = data ?? [];
  if (rows.length > WEBHOOK_ROW_CAP) {
    completeness.truncated.push(
      `webhook_events: more than ${WEBHOOK_ROW_CAP} unstamped rows; only the first ${WEBHOOK_ROW_CAP} were read`,
    );
  }

  const byCustomer = new Map(customers.map((c) => [c.stripeCustomerId, c.userId]));

  return rows
    .slice(0, WEBHOOK_ROW_CAP)
    .filter((row) => modeOfPayload(row.payload) === mode)
    .map((row) => {
      const customerId = customerOfPayload(row.payload);
      const metadataUserId = metadataUserOfPayload(row.payload);
      return {
        eventId: row.stripe_event_id,
        type: row.type,
        receivedAt: row.received_at,
        customerId,
        attributableToUserId:
          (customerId ? (byCustomer.get(customerId) ?? null) : null) ?? metadataUserId,
      };
    });
}

function modeOfPayload(payload: Record<string, unknown>): StripeMode | "unknown" {
  const live = payload?.livemode;
  if (live === true) return "live";
  if (live === false) return "test";
  return "unknown";
}

/** The Stripe customer a payload names, walked defensively. */
function customerOfPayload(payload: Record<string, unknown>): string | null {
  const object = (payload?.data as { object?: Record<string, unknown> } | undefined)
    ?.object;
  const customer = object?.customer;
  if (typeof customer === "string") return customer;
  if (customer && typeof customer === "object" && "id" in customer) {
    const id = (customer as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  // A `customer.*` event's object IS the customer.
  const id = object?.id;
  if (typeof id === "string" && id.startsWith("cus_")) return id;
  return null;
}

/** `metadata.user_id`, the webhook's documented fallback for resolving an account. */
function metadataUserOfPayload(payload: Record<string, unknown>): string | null {
  const object = (payload?.data as { object?: Record<string, unknown> } | undefined)
    ?.object;
  const md = object?.metadata;
  if (md && typeof md === "object") {
    const userId = (md as { user_id?: unknown }).user_id;
    if (typeof userId === "string" && userId) return userId;
  }
  return null;
}

/**
 * HOW MANY FOUNDER DEVICES COULD RECEIVE A PUSH ALERT (D46).
 *
 * "Push reaches a device that is subscribed, and if no founder device is
 * subscribed the alert reaches nobody. That is a state worth asserting on too —
 * an alerting system with no subscribed device is itself a silent failure."
 *
 * Read through an untyped client because `push_subscriptions` and the auth admin
 * API are not part of `BillingDatabase`, exactly as
 * `app/api/billing/beta-grace/route.ts:96-99` does it.
 */
async function countAlertDevices(completeness: Completeness): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) {
    completeness.failed.push("alert devices: Supabase service credentials are not set");
    return 0;
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const founderIds: string[] = [];
    const PAGE = 200;
    for (let page = 1; ; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE });
      if (error) {
        completeness.failed.push(`alert devices: ${error.message}`);
        return 0;
      }
      const users = data?.users ?? [];
      founderIds.push(...users.filter((u) => isFounder(u.email)).map((u) => u.id));
      if (users.length < PAGE) break;
    }
    if (founderIds.length === 0) return 0;

    const { count, error } = await admin
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .in("user_id", founderIds);

    if (error) {
      completeness.failed.push(`alert devices: ${error.message}`);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    completeness.failed.push(`alert devices: ${message(err)}`);
    return 0;
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
