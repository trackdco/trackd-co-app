/**
 * ⚠️ THE CANCEL-BEFORE-DELETE FUNCTION, AND WHERE ITS IDEMPOTENCE ACTUALLY
 * COMES FROM.
 *
 * `16-account-deletion.md` Step 3 asks for one thing: "running it twice is
 * harmless". Proving that against live Stripe would need a real subscription,
 * and the only Supabase project available is PRODUCTION — so a driven proof
 * would write a test-mode `stripe_customer_id` into the same
 * `billing_customers` table `/api/billing/reconcile` reads. That trade was
 * refused (Adrian, 2026-09-04), and these two suites are what replace it.
 *
 * ## ⚠️ THE SECOND RUN NEVER CALLS STRIPE, WHICH IS THE OPPOSITE OF WHAT THE
 * DOC COMMENT USED TO CLAIM
 *
 * It said Stripe returns a `canceled` object rather than erroring. True, and
 * irrelevant: `liveSubscriptionsForUser` filters on `BILLABLE_STATUSES`, and
 * `canceled` is not in it. So the subscription this function ended on run one is
 * **filtered out of run two's list** and `subscriptions.cancel()` is never
 * reached for it.
 *
 * That matters because it says where a future regression would come from. If
 * somebody widened `BILLABLE_STATUSES` to include a terminal status, every retry
 * would re-issue a cancel and the only thing left standing between that and an
 * error would be a vendor behaviour nobody here has measured. So the status set
 * is pinned as a source assertion, not just exercised.
 *
 * ## Two suites, deliberately
 *
 * BEHAVIOUR, against fakes: drives the real function twice and counts the calls.
 * SOURCE, against the file: pins the two facts a fake cannot see — that the set
 * omits the terminal statuses, and that the function never grew a caller-supplied
 * status argument that would let a caller reintroduce them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

const USER = "11111111-2222-4333-8444-555555555555";
const CUSTOMER = "cus_test_deleteme";

/** Stripe subscriptions this fake customer holds, mutated by `cancel`. */
let subs: { id: string; status: string }[] = [];
let cancelCalls: string[] = [];
let listCalls = 0;

vi.mock("./service", () => ({
  serviceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: customerRow === null ? null : { stripe_customer_id: customerRow },
            error: readError,
          }),
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

vi.mock("./stripe", () => ({
  stripe: () => ({
    subscriptions: {
      cancel: async (id: string) => {
        cancelCalls.push(id);
        const s = subs.find((x) => x.id === id);
        if (!s) throw new Error(`No such subscription: ${id}`);
        // Stripe's real behaviour on a repeat cancel is NOT what this suite
        // rests on - see the module comment. Modelled here only so the race
        // case below can be driven.
        s.status = "canceled";
        return { id, status: "canceled" };
      },
    },
  }),
}));

/** When set, what Stripe REPORTS - which can differ from what the store holds,
 *  so a cancel can be driven to fail for one id while another succeeds. */
let listOverride: { id: string; status: string }[] | null = null;

vi.mock("./subscriptionList", () => ({
  listAllSubscriptions: async () => {
    listCalls += 1;
    return (listOverride ?? subs).map((s) => ({ ...s }));
  },
}));

let customerRow: string | null = CUSTOMER;
let readError: { message: string } | null = null;

const { cancelNowForUser, BILLABLE_STATUSES } = await import("./cancel");

beforeEach(() => {
  subs = [];
  cancelCalls = [];
  listCalls = 0;
  customerRow = CUSTOMER;
  readError = null;
  listOverride = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("⚠️ running it twice is harmless — Step 3's requirement", () => {
  it("cancels on the first run and calls Stripe ZERO times on the second", async () => {
    subs = [{ id: "sub_a", status: "active" }];

    const first = await cancelNowForUser(USER);
    expect(first).toEqual({ cancelled: ["sub_a"], failed: [] });
    expect(cancelCalls).toEqual(["sub_a"]);

    const second = await cancelNowForUser(USER);

    // ⚠️ THE POINT. Not "the second call succeeded" - the second call was never
    // made. `sub_a` is `canceled` now, and `canceled` is not billable.
    expect(second).toEqual({ cancelled: [], failed: [] });
    expect(cancelCalls, "the retry must not re-issue a cancel").toEqual(["sub_a"]);
  });

  it("a third and fourth run are the same, so a retried deletion converges", async () => {
    subs = [{ id: "sub_a", status: "trialing" }];
    await cancelNowForUser(USER);
    for (let i = 0; i < 3; i++) {
      expect(await cancelNowForUser(USER)).toEqual({ cancelled: [], failed: [] });
    }
    expect(cancelCalls).toEqual(["sub_a"]);
  });

  it("takes EVERY billable subscription, not the first", async () => {
    // The $69.99 defect: `limit(1)` off the mirror cancelled one of two.
    subs = [
      { id: "sub_a", status: "active" },
      { id: "sub_b", status: "past_due" },
      { id: "sub_c", status: "paused" },
      { id: "sub_d", status: "unpaid" },
      { id: "sub_e", status: "incomplete" },
      { id: "sub_f", status: "trialing" },
    ];
    const r = await cancelNowForUser(USER);
    expect(r.cancelled.sort()).toEqual(["sub_a", "sub_b", "sub_c", "sub_d", "sub_e", "sub_f"]);
    expect(r.failed).toEqual([]);
  });

  it("leaves terminal subscriptions alone on the FIRST run too", async () => {
    subs = [
      { id: "sub_live", status: "active" },
      { id: "sub_dead", status: "canceled" },
      { id: "sub_expired", status: "incomplete_expired" },
    ];
    await cancelNowForUser(USER);
    expect(cancelCalls).toEqual(["sub_live"]);
  });
});

describe("an account with no Stripe customer", () => {
  it("returns an empty list without contacting Stripe at all", async () => {
    // The real-world shape for all 87 comp accounts: measured 2026-09-03, not
    // one of them holds a `billing_customers` row.
    customerRow = null;
    subs = [{ id: "sub_should_not_be_touched", status: "active" }];

    const r = await cancelNowForUser(USER);
    expect(r).toEqual({ cancelled: [], failed: [] });
    expect(listCalls, "Stripe must not be listed when there is no customer").toBe(0);
    expect(cancelCalls).toEqual([]);
  });

  it("is idempotent for that account too", async () => {
    customerRow = null;
    expect(await cancelNowForUser(USER)).toEqual({ cancelled: [], failed: [] });
    expect(await cancelNowForUser(USER)).toEqual({ cancelled: [], failed: [] });
  });
});

describe("⚠️ IT THROWS RATHER THAN LET A DELETION PROCEED", () => {
  it("throws when the billing_customers read fails, so the deletion STOPS", async () => {
    // Absent is not unknown. A read that failed is not "no customer".
    readError = { message: "connection reset" };
    await expect(cancelNowForUser(USER)).rejects.toThrow(/billing_customers read failed/);
  });

  it("throws when a cancel fails, naming the subscriptions still live", async () => {
    // `sub_bad` is in the list but not in the store, so the fake `cancel`
    // throws for it - Stripe refusing one id while another succeeds.
    subs = [{ id: "sub_ok", status: "active" }];
    listOverride = [
      { id: "sub_ok", status: "active" },
      { id: "sub_bad", status: "active" },
    ];

    await expect(cancelNowForUser(USER)).rejects.toThrow(
      /must NOT be deleted until these are ended/,
    );
    // ⚠️ The one that COULD be cancelled still was. Leaving a cancellable
    // subscription live because a sibling failed would bill somebody twice over.
    expect(cancelCalls).toContain("sub_ok");
  });

  it("names the still-live subscription in the message, so it can be found by hand", async () => {
    subs = [];
    listOverride = [{ id: "sub_bad", status: "active" }];
    await expect(cancelNowForUser(USER)).rejects.toThrow(/sub_bad/);
  });
});

/**
 * ⚠️ SOURCE ASSERTIONS. What a fake cannot see.
 *
 * The house already uses this shape where the risk is a silent omission rather
 * than a wrong answer - see `deleteIsNeverGated.test.ts` and the
 * `PC_REMINDER_SELECT` pin.
 */
describe("the status set is the mechanism, so it is pinned", () => {
  const source = readFileSync("lib/billing/cancel.ts", "utf8");

  it("omits every terminal status", () => {
    // If either of these is ever added, the retry stops being a no-op and starts
    // re-issuing cancels against Stripe.
    expect(BILLABLE_STATUSES.has("canceled"), "canceled must not be billable").toBe(false);
    expect(BILLABLE_STATUSES.has("incomplete_expired")).toBe(false);
  });

  it("holds exactly the six statuses that can still take money", () => {
    expect([...BILLABLE_STATUSES].sort()).toEqual(
      ["active", "incomplete", "past_due", "paused", "trialing", "unpaid"],
    );
  });

  it("cancelNowForUser takes ONE argument and it is the user id", () => {
    // A `statuses` parameter here would let a caller reintroduce a terminal
    // status and break the retry, from outside this file.
    expect(source).toMatch(/export async function cancelNowForUser\(userId: string\): Promise</);
  });

  it("asks Stripe rather than the mirror", () => {
    // A cold review measured what the mirror costs: {cancelled:[one], failed:[]}
    // with a live subscription still billing.
    const body = source.slice(source.indexOf("export async function cancelNowForUser("));
    expect(body).toContain("liveSubscriptionsForUser(userId)");
    expect(body).not.toMatch(/from\("subscriptions"\)/);
  });

  it("throws on any failure so a deletion can STOP", () => {
    const body = source.slice(source.indexOf("export async function cancelNowForUser("));
    expect(body).toMatch(/if \(failed\.length > 0\)/);
    expect(body).toContain("throw new Error(");
  });
});
