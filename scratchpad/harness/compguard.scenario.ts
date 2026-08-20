import { afterAll, describe, expect, it, vi } from "vitest";

import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";

import { Ledger, QA_PASSWORD, admin, requireStripeBudget, seedAccount, stripe } from "./core";

/**
 * ⚠️ THE ONE PATH 1.2 COULD NOT DRIVE — the save-offer comp guard's UNREADABLE
 * branch, driven for real.
 *
 *   HARNESS_ALLOW_STRIPE=1 npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/compguard.scenario.ts --reporter=verbose
 *
 * 1.2's own commit message states the gap: "NOT DRIVEN BEHAVIOURALLY ... the
 * unreadable-read path needs the entitlements read to fail for a signed-in user
 * mid-cancel". `saveOfferGuards.test.ts` asserts the SOURCE — that the branch is
 * written and correctly ordered — and says in as many words that it "does not
 * prove it executes".
 *
 * ## ⚠️ HOW THE READ IS MADE TO FAIL, AND WHY IT IS NOT A MOCK
 *
 * `rule0.scenario.ts` induced a genuine failed read with a RESTRICTED CLIENT: the
 * signed-out anon key cannot select from `entitlements` and PostgREST returns a
 * real error. Its documented limitation is that the same client cannot read
 * `profiles` either, so the runner short-circuited BEFORE the code under test and
 * the first version of that test passed vacuously.
 *
 * So the client here is REAL in every part and restricted in exactly one:
 *
 *   auth, profiles, billing_customers   a real signed-in user client
 *                                       (`signInWithPassword`, the app's own
 *                                       publishable key, through RLS)
 *   entitlements                        the signed-out anon client, whose select
 *                                       genuinely fails at the database
 *
 * Nothing fabricates an error object. The `{ ok: false }` that `readEntitlements`
 * returns is produced by PostgREST refusing a real query, and the arrival block
 * below prints its code and asserts the other three reads SUCCEED — which is the
 * assertion `rule0` had to add after a short-circuit certified nothing.
 *
 * ## ⚠️ THE ASSERTION IS ON THE STRIPE OBJECT, NOT THE RETURN VALUE
 *
 * `markOfferShown` writes `trackd_save_offer_shown_at` into the Stripe customer's
 * metadata, and THAT is the once-ever flag. The guarantee 1.2 claims is that a
 * refusal costs nobody their offer, so the proof is: after the refusal the marker
 * is ABSENT, and the SAME customer is then offered it in full.
 *
 * Phase B is the control and it is what makes Phase A mean anything: one
 * customer, one variable — whether `entitlements` can be read.
 */

const ledger = new Ledger();
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** Flipped between the two phases. Nothing else differs. */
const wiring: { user: SupabaseClient | null; anon: SupabaseClient | null; entitlementsReadable: boolean } = {
  user: null,
  anon: null,
  entitlementsReadable: true,
};

/**
 * The client `@/lib/supabase/server` hands the app. Real throughout; `from()`
 * routes ONE table to a client that genuinely cannot read it.
 */
function routed(): SupabaseClient {
  const user = wiring.user!;
  const anon = wiring.anon!;
  return new Proxy(user, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (table: string) =>
          table === "entitlements" && !wiring.entitlementsReadable
            ? anon.from(table)
            : user.from(table);
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as SupabaseClient;
}

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3100" }),
  cookies: async () => ({ getAll: () => [], setAll: () => {} }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => routed() }));

afterAll(async () => {
  await ledger.teardown();
  const left = ledger.outstanding();
  expect(left.users, "users left in the ledger").toEqual([]);
  expect(left.customers, "stripe customers left in the ledger").toEqual([]);
  expect(left.clocks, "test clocks left in the ledger").toEqual([]);
}, 300_000);

describe("⚠️ 1.2 — the save offer's unreadable-entitlement refusal, DRIVEN", () => {
  it("refuses on a failed read and burns nothing; the same customer is then offered it in full", async () => {
    requireStripeBudget("the comp guard's unreadable path");
    expect(URL_ && ANON, "supabase url/anon key missing").toBeTruthy();

    /* ── seed: a real account, a real Stripe customer, a real trialing sub ── */
    const account = await seedAccount(ledger, "qa-rv-compguard");
    const customer = await stripe.customers.create({
      email: account.email,
      metadata: { harness: "coldchat-reverify-compguard" },
    });
    ledger.customer(customer.id);
    const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: pm.id },
    });
    const price = process.env.STRIPE_PRICE_MONTHLY ?? "";
    expect(price, "STRIPE_PRICE_MONTHLY is not set").toBeTruthy();
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price }],
      trial_period_days: 7,
    });
    console.log(`  seeded ${account.email} -> ${customer.id} / ${sub.id} (${sub.status})`);
    expect(sub.status, "the seeded subscription is not trialing").toBe("trialing");

    const { data: bcRows, error: bcErr } = await admin
      .from("billing_customers")
      .insert({ user_id: account.id, stripe_customer_id: customer.id })
      .select("user_id");
    if (bcErr) throw new Error(`billing_customers insert: ${bcErr.message}`);
    expect(bcRows?.length, "the billing_customers mapping did not land").toBe(1);

    /**
     * A `stripe` pro entitlement, written the way `upsertEntitlement` writes one:
     * `active_until` from the subscription's own end, `is_active` true. NOT a
     * no-expiry comp — the comp branch must not be what refuses in Phase A.
     */
    const until = new Date((sub.trial_end ?? 0) * 1000).toISOString();
    const { data: entRows, error: entErr } = await admin
      .from("entitlements")
      .upsert(
        { user_id: account.id, product: "pro", source: "stripe", active_until: until, is_active: true },
        { onConflict: "user_id,product,source" },
      )
      .select("user_id");
    if (entErr) throw new Error(`entitlements upsert: ${entErr.message}`);
    expect(entRows?.length, "the entitlement fixture did not land").toBe(1);

    /* ── the two real clients ─────────────────────────────────────────── */
    wiring.anon = createSupabase(URL_, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signed = createSupabase(URL_, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await signed.auth.signInWithPassword({
      email: account.email,
      password: QA_PASSWORD,
    });
    if (signInError) throw new Error(`sign in: ${signInError.message}`);
    wiring.user = signed;

    /* ── ⚠️ ARRIVAL, PHASE A: exactly one read fails, and the rest do not ── */
    wiring.entitlementsReadable = false;
    const client = routed();
    const who = await client.auth.getUser();
    expect(who.data.user?.id, "the signed-in client does not resolve the seeded user").toBe(
      account.id,
    );
    const entProbe = await client.from("entitlements").select("product").eq("user_id", account.id);
    console.log(`  entitlements probe: code=${entProbe.error?.code ?? "(none)"} msg=${entProbe.error?.message ?? "-"}`);
    expect(
      entProbe.error,
      "the restricted client CAN read entitlements, so nothing below exercises a failed read",
    ).not.toBeNull();
    const bcProbe = await client.from("billing_customers").select("stripe_customer_id").eq("user_id", account.id);
    expect(
      bcProbe.error,
      "billing_customers is unreadable too, so the action short-circuits BEFORE the guard (rule0's lesson)",
    ).toBeNull();
    expect(bcProbe.data?.length, "the caller cannot see their own customer row").toBe(1);
    const pProbe = await client.from("profiles").select("timezone").eq("id", account.id);
    expect(pProbe.error, "profiles is unreadable too, so ownTimezone would not be reached honestly").toBeNull();

    /* ── ⚠️ ARRIVAL: the marker is not already there ──────────────────── */
    const before = await stripe.customers.retrieve(customer.id);
    expect(
      (before as { metadata?: Record<string, string> }).metadata?.trackd_save_offer_shown_at,
      "the once-ever marker is ALREADY set, so its absence below would prove nothing",
    ).toBeUndefined();

    /* ── PHASE A: cancel with the entitlements read failing ───────────── */
    vi.resetModules();
    const { cancelSubscription } = await import("@/app/(app)/billing/actions");
    const resultA = await cancelSubscription();
    console.log(`  PHASE A (read fails): ${JSON.stringify(resultA)}`);
    expect(resultA.ok, "the cancellation itself failed, so the guard was never reached").toBe(true);

    /* ── the cancel LANDED, so `offerAfterCancel` really was reached ──── */
    const subAfterA = await stripe.subscriptions.retrieve(sub.id);
    expect(
      subAfterA.cancel_at_period_end,
      "the subscription did not take the cancel flag, so offerAfterCancel was never called",
    ).toBe(true);

    /* ── ⚠️ THE ASSERTION THAT MATTERS: no offer, and NOTHING BURNED ──── */
    expect("offer" in resultA && resultA.offer, "an offer was shown on an unreadable read").toBeFalsy();
    const afterA = await stripe.customers.retrieve(customer.id);
    expect(
      (afterA as { metadata?: Record<string, string> }).metadata?.trackd_save_offer_shown_at,
      "the once-ever offer was BURNED by a refusal — the guard sits below markOfferShown",
    ).toBeUndefined();

    /* ── PHASE B — THE CONTROL. One variable changed. ─────────────────── */
    await stripe.subscriptions.update(sub.id, { cancel_at_period_end: false });
    wiring.entitlementsReadable = true;
    const entProbeB = await routed().from("entitlements").select("product, is_active").eq("user_id", account.id);
    expect(entProbeB.error, "the readable phase cannot read entitlements either").toBeNull();
    expect(entProbeB.data?.length, "the entitlement fixture is not visible to the user client").toBe(1);

    vi.resetModules();
    const { cancelSubscription: cancelB } = await import("@/app/(app)/billing/actions");
    const resultB = await cancelB();
    console.log(`  PHASE B (read works): ${JSON.stringify(resultB)}`);
    expect(resultB.ok).toBe(true);
    expect(
      "offer" in resultB && resultB.offer,
      "⚠️ CONTROL FAILED: no offer even with a readable entitlement, so Phase A proved nothing",
    ).toBeTruthy();

    const afterB = await stripe.customers.retrieve(customer.id);
    expect(
      (afterB as { metadata?: Record<string, string> }).metadata?.trackd_save_offer_shown_at,
      "⚠️ CONTROL FAILED: the marker is not written even on the success path",
    ).toBeTruthy();
    console.log(
      `  marker after B: ${(afterB as { metadata?: Record<string, string> }).metadata?.trackd_save_offer_shown_at}`,
    );
  }, 300_000);
});
