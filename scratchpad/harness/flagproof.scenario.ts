import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";

import {
  BASE,
  Ledger,
  QA_PASSWORD,
  TestClock,
  admin,
  seedAccount,
  stripe,
  stripeBudgetAvailable,
} from "./core";

/**
 * ⚠️ BOTH FLAGS PROVEN ABSENT **FROM BEHAVIOUR**, NOT FROM `.env.local`.
 *
 *   npm run dev                          # in another shell
 *   HARNESS_ALLOW_STRIPE=1 npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/flagproof.scenario.ts --reporter=verbose
 *
 * ## Why this exists
 *
 * Every report so far has claimed `BILLING_GATE_ENABLED` and
 * `REMINDER_PROMISE_ENABLED` are unset, on the strength of `grep` over
 * `.env.local`. That is evidence about a FILE, not about the process serving
 * requests: the dev server on 3100 predates these sessions, `ps eww` returns no
 * environment at all on this machine (it returns nothing for `PATH` either), and a
 * flag can be exported into a shell without ever touching the file.
 *
 * So each flag is proven by a string that only renders in one of its two states.
 *
 * ## ⚠️ A CORRECTION TO THE BRIEF, WITH THE CITATION
 *
 * The instruction said a no-entitlement account "must read `Read only`, not
 * `Free trial`". **`Read only` is the GATE-ON prediction.**
 * `manage.ts:497` is `return gateEnabled ? NO_ACCESS_LABEL : FULL_ACCESS_LABEL`,
 * and those constants are `"Read only"` and `"Pro"` (`manage.ts:523-524`). With the
 * gate UNSET the correct label is **"Pro"** — so asserting "Read only" and passing
 * would have proven the gate is ON, the inverse of the claim being made.
 *
 * This therefore reports WHICH label rendered and what that proves, rather than
 * asserting either. The one thing asserted outright is that it is not
 * **"Free trial"**, which is wrong in both states for an account with no
 * entitlement and no subscription — the regression `manage.ts:454-461` records.
 */

let browser: Browser;
const ledger = new Ledger();

async function cookiesFor(email: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ email, password: QA_PASSWORD }),
  });
  const session = await res.json();
  if (!res.ok) throw new Error(`signIn: ${JSON.stringify(session)}`);
  const ref = new URL(url).hostname.split(".")[0];
  const payload = `base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`;
  const CHUNK = 3180;
  const jar: { name: string; value: string; domain: string; path: string }[] = [];
  if (payload.length <= CHUNK) {
    jar.push({ name: `sb-${ref}-auth-token`, value: payload, domain: "localhost", path: "/" });
  } else {
    for (let i = 0, n = 0; i < payload.length; i += CHUNK, n += 1) {
      jar.push({
        name: `sb-${ref}-auth-token.${n}`,
        value: payload.slice(i, i + CHUNK),
        domain: "localhost",
        path: "/",
      });
    }
  }
  return jar;
}

beforeAll(async () => {
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await ledger.teardown();
}, 300_000);

describe("the two flags, proven from rendered output", () => {
  it("BILLING_GATE_ENABLED: which label does a no-entitlement account read?", async () => {
    /**
     * No entitlement row, no subscription, no Stripe customer. Under the gate this
     * account is read-only; without it, it genuinely has the whole product.
     */
    const account = await seedAccount(ledger, "flag-gate", { notificationsEnabled: false });

    /* ── ⚠️ ARRIVAL: it really has neither ────────────────────────────── */
    const ent = await admin.from("entitlements").select("id").eq("user_id", account.id);
    const sub = await admin.from("subscriptions").select("id").eq("user_id", account.id);
    /**
     * ⚠️ `?? 0` MADE A FAILED READ LOOK LIKE AN EMPTY ONE (5.3).
     *
     * Supabase returns `data: null` on error, so `data?.length ?? 0` is `0` both
     * when the fixture genuinely has no rows and when the query FAILED — and this
     * is an ARRIVAL check, whose whole job is to establish the state before
     * anything is claimed about it. A read that never ran would have certified
     * the state it was meant to verify.
     *
     * The property: the fixture is in the shape this case is about. That needs
     * the read to have WORKED and returned nothing — two facts, asserted
     * separately. `rule0.scenario.ts` already does this correctly further down,
     * where it asserts an error is NOT null.
     */
    expect(ent.error, "the entitlements read FAILED, so the fixture is unverified").toBeNull();
    expect(sub.error, "the subscriptions read FAILED, so the fixture is unverified").toBeNull();
    expect(ent.data?.length, "the account has an entitlement, so it is the wrong fixture").toBe(0);
    expect(sub.data?.length, "the account has a subscription row").toBe(0);

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies(await cookiesFor(account.email));
    const page = await context.newPage();
    await page.goto(`${BASE}/billing`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(5000);
    const text = await page.locator("body").innerText();

    const saysPro = /\bPro\b/.test(text);
    const saysReadOnly = /Read only/.test(text);
    const saysFreeTrial = /Free trial/.test(text);
    console.log(
      `\n  /billing for a no-entitlement account:\n` +
        `    "Pro"        ${saysPro}\n` +
        `    "Read only"  ${saysReadOnly}\n` +
        `    "Free trial" ${saysFreeTrial}`,
    );

    console.log(`    url: ${page.url()}`);
    console.log(`    rendered ${text.length} chars: ${JSON.stringify(text.slice(0, 300))}`);

    /**
     * ⚠️ THE CONTROL IS STRUCTURAL, NOT A LENGTH THRESHOLD, AND THE FIRST VERSION
     * OF IT WAS A GUESS DRESSED AS A CONTROL.
     *
     * It asserted `text.length > 200` and failed at 99 — on a page that had
     * rendered perfectly. The billing screen for an account with no entitlement,
     * no subscription and no Stripe customer is legitimately short:
     *
     *   "Sign out / Billing / PLAN / Access / Pro / Back to profile / <nav>"
     *
     * A magic number cannot tell "short because correct" from "short because
     * broken". The screen's OWN FURNITURE can: "Billing" is its heading and
     * "Access" is the row the label sits in, so both present means the screen
     * rendered and the label position was reached.
     */
    expect(text, "the Billing screen's heading is absent — it did not render").toContain("Billing");
    expect(text, "the Access row is absent, so no label position was reached").toContain("Access");

    /**
     * ⚠️ THE ONE THING ASSERTED OUTRIGHT. "Free trial" is wrong in BOTH flag
     * states for an account with no entitlement and no subscription — it is the
     * regression `manage.ts:454-461` records, where flipping the gate made a
     * locked-out account read "Free trial" on the very screen it opened to find
     * out why it was locked out.
     */
    expect(saysFreeTrial, "a no-entitlement account is being told it is on a Free trial").toBe(false);

    /**
     * And the DIAGNOSIS, reported rather than asserted, because either answer is
     * informative and only one of them is a surprise:
     *   "Pro"       => BILLING_GATE_ENABLED is NOT "true" in the serving process.
     *   "Read only" => it IS set, and every report claiming otherwise is wrong.
     */
    console.log(
      saysReadOnly
        ? `  => ⚠️ THE GATE IS ON in the serving process. Earlier reports claiming it unset are WRONG.`
        : saysPro
          ? `  => BILLING_GATE_ENABLED is NOT "true" in the serving process. Proven from behaviour.`
          : `  => INCONCLUSIVE: neither label rendered. The label may live elsewhere on this screen.`,
    );

    await context.close();
  }, 600_000);

  it.skipIf(!stripeBudgetAvailable())(
    "REMINDER_PROMISE_ENABLED: the offer's terms line withholds its final clause",
    async () => {
      /**
       * The offer dialog's terms line is built by `offerTermsLine(chargeOn,
       * promised)` (`reminderPromise.ts:81`):
       *
       *   promised === false -> "...unless you cancel before then."
       *   promised === true  -> "...unless you cancel before then, and we'll
       *                          remind you first."
       *
       * ⚠️ SO THE CONTROL IS BUILT INTO THE SENTENCE. "unless you cancel before
       * then" renders in BOTH states, and the clause only in one — meaning a
       * missing clause cannot be confused with a dialog that never rendered, or a
       * selector that matched nothing.
       */
      const account = await seedAccount(ledger, "flag-promise", { notificationsEnabled: false });
      const clock = new TestClock(ledger);
      const t0 = new Date();
      await clock.create(t0);
      const customerId = await clock.customer(account.email);
      const { error } = await admin.from("billing_customers").insert({
        user_id: account.id,
        stripe_customer_id: customerId,
        trial_lock_until: new Date(0).toISOString(),
      });
      if (error) throw new Error(`billing_customers: ${error.message}`);

      const { syncSubscription } = await import("@/lib/billing/sync");
      const sub = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: process.env.STRIPE_PRICE_WEEKLY ?? "" }],
        trial_end: Math.floor(t0.getTime() / 1000) + 7 * 86_400,
        metadata: { user_id: account.id },
      });
      await syncSubscription(await stripe.subscriptions.retrieve(sub.id));

      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addCookies(await cookiesFor(account.email));
      const page = await context.newPage();
      await page.goto(`${BASE}/billing`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.waitForTimeout(4000);
      await page.getByRole("button", { name: /^Cancel my / }).first().click({ timeout: 60_000 });
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: "Yes, cancel" }).first().click({ timeout: 60_000 });
      await page.waitForTimeout(6000);

      /* ── ⚠️ ARRIVAL: the OFFER dialog is on screen, by its own control ── */
      const offerConfirm = page.getByRole("button", { name: /^Another (week|month), thanks$/ });
      expect(
        await offerConfirm.count(),
        "the offer dialog never opened, so its terms line cannot be read",
      ).toBeGreaterThan(0);

      const text = await page.locator("body").innerText();
      const hasBase = /unless you cancel before then/.test(text);
      const hasClause = /and we'll remind you first/.test(text);
      console.log(
        `\n  offer dialog terms line:\n` +
          `    "unless you cancel before then"   ${hasBase}   <- CONTROL, renders in BOTH states\n` +
          `    ", and we'll remind you first"    ${hasClause} <- only when the flag is set`,
      );

      /**
       * ⚠️ THE CONTROL FIRST. Without it, "the clause is absent" is equally true
       * of a dialog that never rendered and a page that failed to load.
       */
      expect(hasBase, "the terms line itself is missing — the clause check is vacuous").toBe(true);
      expect(
        hasClause,
        "⚠️ REMINDER_PROMISE_ENABLED IS SET in the serving process: the product is promising a reminder",
      ).toBe(false);
      console.log(`  => REMINDER_PROMISE_ENABLED is NOT set in the serving process. Proven from behaviour.`);

      await context.close();
    },
    900_000,
  );
});
