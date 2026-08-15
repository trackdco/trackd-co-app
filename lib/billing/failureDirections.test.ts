/**
 * ⚠️ WHICH WAY EACH CHECK FAILS (spec 01 §3.5) — pinned so it cannot be tidied
 * into consistency.
 *
 * Every check on the trial-eligibility path errs towards GRANTING free time.
 * That looks like sloppiness and is not. Being wrong in the generous direction
 * costs seven days. Being wrong the other way charges a first-time customer
 * immediately, on a screen that just promised them seven free days — which is a
 * chargeback, and dispute rate is the number that closes payment processor
 * accounts.
 *
 * ## The one asymmetry, which is the thing most likely to be "fixed"
 *
 * When Stripe cannot be reached, `trialEligibility()` falls into its outer catch
 * and the SCREEN PROMISES A TRIAL, while `startTrial` returns an error and the
 * BUTTON REFUSES. Those two look inconsistent side by side and a future session
 * will be tempted to make them agree. They must not agree:
 *
 *   screen over-promises + server refuses  =  a bad minute
 *   screen over-promises + server charges  =  a dispute
 *
 * ## Why these are source assertions
 *
 * Both functions live in a `"use server"` module whose imports (`next/headers`,
 * the Supabase server client, the Stripe SDK) cannot be exercised in this pure
 * `lib/**` suite, and mocking them wholesale would test the mock. The house
 * already uses this shape where the risk is a silent omission rather than a
 * wrong answer — see `deleteIsNeverGated.test.ts`, which pins the same class of
 * rule the same way.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const SOURCE = "app/onboarding/billing-actions.ts";
const source = readFileSync(SOURCE, "utf8");

/** The body of a named function, up to the next top-level declaration. */
function bodyOf(name: string): string {
  // `hasValidatedCard` is sync, the rest are async.
  const start = source.search(new RegExp(`^(export )?(async )?function ${name}\\(`, "m"));
  expect(start, `${name} not found in ${SOURCE} — was it renamed?`).toBeGreaterThan(-1);
  const rest = source.slice(start + 1);
  const next = rest.search(/^(export )?(async )?function /m);
  return next === -1 ? rest : rest.slice(0, next);
}

/**
 * Everything from a function's LAST `catch` onwards — its outermost one.
 *
 * `lastIndexOf`, not `indexOf`: `startTrial` opens an inner try/catch around
 * `findOrCreateCustomer` long before the outer one, and slicing from that
 * caught the whole happy path — including the legitimate `status: "ok"` of the
 * abandoned-attempt resume — inside what was supposed to be the failure tail.
 */
const outerCatch = (body: string) => body.slice(body.lastIndexOf("} catch"));

describe("trialEligibility errs towards SAYING YES", () => {
  const body = bodyOf("trialEligibility");

  it("declares a generous fallback that grants a full trial", () => {
    // `eligible: true`, `reason: "new"`, the full TRIAL_DAYS. If this ever
    // becomes `eligible: false`, a Stripe outage starts telling first-time
    // customers they are being charged today.
    expect(body).toMatch(/const fallback = \{[\s\S]*?eligible: true/);
    expect(body).toMatch(/const fallback = \{[\s\S]*?days: TRIAL_DAYS/);
  });

  it("still has the outer catch, and it returns the fallback", () => {
    // The catch is what turns "Stripe is down" into "you get a trial" rather
    // than into an unhandled rejection on a payment screen.
    const tail = outerCatch(body);
    expect(tail).toContain("return fallback");
  });

  it("returns the fallback for an anonymous caller rather than throwing", () => {
    expect(body).toMatch(/if \(!user\) return fallback/);
  });
});

describe("startTrial errs towards REFUSING", () => {
  const body = bodyOf("startTrial");

  it("returns an error, never a subscription, when anything throws", () => {
    // The asymmetry itself. A catch here that granted anything — a trial, a
    // subscription, an optimistic success — is the defect this pins.
    const tail = outerCatch(body);
    expect(tail).toMatch(/status: "error"/);
    expect(tail).not.toMatch(/status: "ok"/);
  });

  it("refuses an anonymous caller", () => {
    expect(body).toMatch(/if \(!user\) return \{ status: "error"/);
  });

  it("still enforces the age gate before creating anything", () => {
    // Carried in from w2b-14: rendering the paywall does not re-check the age,
    // so this endpoint is where it is actually enforced.
    expect(body).toContain("passedGate");
    expect(body.indexOf("passedGate")).toBeLessThan(body.indexOf("subscriptions.create"));
  });
});

describe("the entitlements read reports failure rather than guessing", () => {
  const body = bodyOf("compEntitlement");

  it("returns `unknown` on a Postgres error, never `none`", () => {
    // `none` means "an ordinary user, verified". Reporting a failed read as
    // `none` is a guess dressed as a fact, and it is what let a beta user be
    // handed a 7-day trial inside their 14-day grace.
    const onError = body.slice(body.indexOf("if (error)"), body.indexOf("const row"));
    expect(onError).toMatch(/return \{ kind: "unknown" \}/);
    expect(onError).not.toMatch(/return \{ kind: "none" \}/);
  });

  it("returns `unknown` from the catch as well", () => {
    const tail = outerCatch(body);
    expect(tail).toMatch(/return \{ kind: "unknown" \}/);
    expect(tail).not.toMatch(/return \{ kind: "none" \}/);
  });

  it("still returns `none` for a genuine absence of any comp row", () => {
    expect(body).toMatch(/if \(!row\) return \{ kind: "none" \}/);
  });

  it("never throws its way out", () => {
    expect(body).toContain("try {");
    expect(body).toContain("} catch");
  });

  it("filters on the kill switch", () => {
    // A revoked comp must not answer this question. Without it, a withdrawn
    // comp reads as `forever` and can never buy its way out of read-only.
    expect(body).toContain('.eq("is_active", true)');
  });
});

describe("the comp refusal happens before any Stripe object exists", () => {
  const body = bodyOf("startTrial");

  it("checks the comp entitlement before resolving the Stripe customer", () => {
    // §3.7. If this order inverts, a free-for-life comp gets a Stripe customer
    // minted for them on the way to being refused — clutter in the account of
    // record, generated by an account that must never transact at all.
    const refusal = body.indexOf('comp.kind === "forever"');
    const customer = body.indexOf("findOrCreateCustomer");
    expect(refusal).toBeGreaterThan(-1);
    expect(customer).toBeGreaterThan(-1);
    expect(refusal).toBeLessThan(customer);
  });
});

describe("an abandoned attempt never burns the trial", () => {
  /**
   * ⚠️ MEASURED AGAINST REAL STRIPE, 2026-08-15. A first-timer abandoned a 3D
   * Secure challenge, came back, picked a different plan — `startTrial`
   * cancelled the abandoned one, and the cancelled attempt (no payment method,
   * no source, `pending_setup_intent` still pending) read as a used trial. They
   * were charged today against a screen that had just promised seven free days.
   *
   * The rule that stops it: for a status where the card step may never have
   * finished, ASK, rather than inferring "validated" from the status alone.
   */
  const source = readFileSync(SOURCE, "utf8");

  it("treats a cancelled attempt as a status where the card step may be unfinished", () => {
    const set = source.match(/CARD_STEP_MAY_BE_UNFINISHED[\s\S]*?\]\);/)?.[0] ?? "";
    expect(set).toContain('"trialing"');
    expect(set).toContain('"canceled"');
    expect(set).toContain('"incomplete_expired"');
  });

  it("no longer short-circuits every non-trialing status to validated", () => {
    // `if (sub.status !== "trialing") return true;` is the exact line that
    // burned the trial. It must not come back.
    expect(source).not.toMatch(/if \(sub\.status !== "trialing"\) return true;/);
  });

  it("still reads the pending setup intent as the proof a card step finished", () => {
    // This is what keeps the refunded-but-previously-active case counting as a
    // used trial: confirming clears the intent, so a subscription that genuinely
    // ran has none and still reads as validated.
    const body = bodyOf("hasValidatedCard");
    expect(body).toContain("return !sub.pending_setup_intent;");
  });

  it("still refuses to call `incomplete` a validated card", () => {
    const body = bodyOf("hasValidatedCard");
    expect(body).toMatch(/if \(sub\.status === "incomplete"\) return false;/);
  });
});

describe("an unreadable entitlement refuses on the money path", () => {
  /**
   * ⚠️ THE ONE PLACE THE GENEROUS DEFAULT IS THE WRONG ANSWER, and it is subtle
   * enough that a future session will try to "restore" §3.5 here.
   *
   * §3.5's flat rule — a failed entitlements read grants the trial — was reasoned
   * about first-timers, for whom seven free days beats zero. For the ~85 beta
   * accounts the grace is FOURTEEN days, so falling back to seven charges them a
   * week INSIDE a fortnight the app promised in writing, and writes no
   * `trackd_grace_until`, so reconciliation cannot see it happened. Seven cannot
   * be both generous against nothing and fair against fourteen.
   */
  const body = bodyOf("startTrial");

  it("keeps a failed read distinguishable from 'no comp row'", () => {
    // Collapsing `unknown` into `none` is the exact move that makes a beta user
    // chargeable inside their own fortnight.
    expect(source).toMatch(/\|\s*\{ kind: "unknown" \}/);
    const read = bodyOf("compEntitlement");
    const onError = read.slice(read.indexOf("if (error)"), read.indexOf("const row"));
    expect(onError).toMatch(/return \{ kind: "unknown" \}/);
  });

  it("refuses to create anything when the entitlement cannot be read", () => {
    const guard = body.slice(body.indexOf('comp.kind === "unknown"'));
    expect(body).toContain('comp.kind === "unknown"');
    expect(guard).toMatch(/status: "error"/);
    expect(body.indexOf('comp.kind === "unknown"')).toBeLessThan(
      body.indexOf("subscriptions.create"),
    );
  });

  it("leaves the SCREEN generous, which is what makes the pair correct", () => {
    // trialEligibility must NOT copy this refusal. The asymmetry is the point:
    // a screen that over-promises beside a server that will not charge is a bad
    // minute; beside a server that charges it is a dispute.
    const screen = bodyOf("trialEligibility");
    expect(screen).not.toMatch(/kind === "unknown"[\s\S]{0,120}status: "error"/);
    expect(outerCatch(screen)).toContain("return fallback");
  });
});

describe("a comp is refused by two independent authorities", () => {
  const body = bodyOf("startTrial");

  it("also refuses on the in-memory comp list, which cannot fail", () => {
    // The entitlements read is a network call, so the refusal fails OPEN: a
    // Postgres blip at the wrong moment lets one of the five people promised
    // Trackd for life confirm a card. `betaGrantFor` has no failure mode.
    expect(body).toContain("betaGrantFor(user.email)");
    expect(body.indexOf("betaGrantFor(user.email)")).toBeLessThan(
      body.indexOf("findOrCreateCustomer"),
    );
  });
});

describe("a stale abandoned attempt is replaced, not resumed", () => {
  /**
   * ⚠️ MEASURED, 2026-08-15. Abandon a 3DS challenge, return days later on the
   * SAME plan: the old rule handed back the original subscription, whose
   * `trial_end` had not moved, while the screen recomputes its promise as today
   * plus TRIAL_DAYS. Driven: the screen said "first charge 22 Aug" and the card
   * was set to be hit on 17 Aug, five days early, with a payment method
   * attached.
   */
  const body = bodyOf("startTrial");

  it("judges the attempt against what a fresh one would give", () => {
    expect(body).toContain("freshFreeUntil");
    expect(body).toContain("RESUME_STALENESS_TOLERANCE");
  });

  it("decides the free time BEFORE choosing whether to resume", () => {
    // The resume branch cannot judge staleness without knowing what a fresh
    // subscription would be worth, and a mid-grace user's yardstick is their
    // grace end rather than today plus seven.
    expect(body.indexOf("resolveFreeTime")).toBeLessThan(body.indexOf("const resumable"));
  });

  it("still requires the plan to match and a confirmable intent", () => {
    const find = body.slice(body.indexOf("const resumable"), body.indexOf("for (const other"));
    expect(find).toContain("wantedPrice");
    // Spec 02a §3.6 widened this from `setupSecret` to the resolver, so a PAID
    // attempt is resumable too. Before that, a paid attempt was cancelled and
    // replaced on every return, raising a fresh invoice each time.
    expect(find).toContain("confirmableIntent(sub)");
  });

  it("only resumes an attempt of the kind a fresh create would produce", () => {
    // Otherwise a user owed a trial could be handed back an old PAID attempt's
    // PaymentIntent, which is a charge against a screen promising free days.
    const find = body.slice(body.indexOf("const resumable"), body.indexOf("for (const other"));
    expect(find).toContain("intent.kind !== wantedKind");
  });

  it("exempts a paid attempt from the staleness rule, explicitly", () => {
    /**
     * A paid attempt has no `trial_end`, so the staleness comparison has nothing
     * to measure. Written as a null test rather than `?? 0`, which would have
     * made every paid attempt look infinitely stale and replaced it — raising a
     * second invoice on every return, which is the defect §3.6 exists to stop.
     */
    const find = body.slice(body.indexOf("const resumable"), body.indexOf("for (const other"));
    expect(find).toContain("sub.trial_end === null");
    expect(find).not.toContain("(sub.trial_end ?? 0)");
  });

  it("keeps the tolerance far below a day", () => {
    // A day-sized tolerance re-admits the one-calendar-day error this fixes.
    const declared =
      source.match(/const RESUME_STALENESS_TOLERANCE = ([^;]+);/)?.[1]?.trim() ?? "";
    // Digits and multiplication only, so the factors can be multiplied out
    // without evaluating anything.
    expect(declared).toMatch(/^[\d\s*]+$/);
    const ms = declared.split("*").reduce((total, n) => total * Number(n.trim()), 1);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThan(6 * 60 * 60 * 1000);
  });
});

describe("the eligibility answer is copy, and gates nothing", () => {
  it("no access check anywhere reads trialEligibility", () => {
    // Out of Scope forbids making it a gate. Access is decided by entitlements
    // alone; this only decides what a screen SAYS.
    const gate = readFileSync("lib/billing/gate.ts", "utf8");
    const access = readFileSync("lib/billing/access.ts", "utf8");
    const entitlements = readFileSync("lib/billing/entitlements.ts", "utf8");
    for (const file of [gate, access, entitlements]) {
      expect(file).not.toContain("trialEligibility");
    }
  });
});
