import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import { BASE, Ledger, QA_PASSWORD, admin, seedAccount } from "./core";

/**
 * SPEC 07 STEP 5 — THE NO-DOUBLE-BANNER RULE, DRIVEN FROM BOTH SPECS' SIDES.
 *
 *   BILLING_GATE_ENABLED=true npm run dev        # in another shell
 *   npx vitest run --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/banner.scenario.ts --reporter=verbose
 *
 * ## The rule
 *
 * `07` §3.7, stated absolutely: "on any day a user is eligible for both `05`'s
 * final-day banner and a pair-2 reminder banner, the reminder renders and the
 * final-day banner is suppressed. The promised reminder always wins."
 * `05` §3.6b carries the reciprocal instruction and adds the other half: the
 * final-day banner renders "on the user's final entitled day, and on that day
 * only", reading **"Your plan ends today."**
 *
 * ## ⚠️ WHAT DRIVING IT ACTUALLY FOUND
 *
 * **`05`'s final-day banner does not exist.** The string "Your plan ends today."
 * appears nowhere in the tree, and `05`'s Steps 1-8 contain no step that builds
 * it — the decision is recorded in §3.6b and §7 and was never given an
 * implementation step. So the suppression half of the rule is satisfied
 * VACUOUSLY, and `05` §5's box "the final-day banner renders on the last entitled
 * day only" is false in the other direction: it never renders at all.
 *
 * That is why the cases below are not just "count the banners on the overlap
 * day". Two of them exist to show which real people get NOTHING, because
 * `07`'s banner deliberately excludes them and `05`'s is not there to catch them.
 *
 * Safety: `@trackd-qa.invalid` accounts, ledgered, deleted BY ID. No Stripe.
 */

let browser: Browser;
const ledger = new Ledger();

/** Only `TrialEndingBanner` links to /billing from the dashboard. Counting the
 *  links counts the banners. */
const BANNER = 'a[href="/billing"]';
/** ⚠️ CONTROL. "No banner" and "the page never rendered" are otherwise the same
 *  observation, and this project has already paid for that once. */
const SHELL = 'nav[aria-label="Primary"]';
/** `05` §3.6b's signed line, character for character. */
const FINAL_DAY_LINE = "Your plan ends today.";

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

interface Seen {
  page: Page;
  context: BrowserContext;
  bannerCount: number;
  bannerText: string[];
  finalDayLinePresent: boolean;
  bodyText: string;
}

async function openDashboard(email: string): Promise<Seen> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies(await cookiesFor(email));
  const page = await context.newPage();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  // ⚠️ Waits for the SHELL, not for `networkidle`, which never settles here.
  await page.waitForSelector(SHELL, { timeout: 60_000 });
  await page.waitForTimeout(3000);
  const banners = page.locator(BANNER);
  const bannerCount = await banners.count();
  const bannerText: string[] = [];
  for (let i = 0; i < bannerCount; i += 1) bannerText.push(await banners.nth(i).innerText());
  const bodyText = await page.locator("body").innerText();
  return {
    page,
    context,
    bannerCount,
    bannerText,
    finalDayLinePresent: bodyText.includes(FINAL_DAY_LINE),
    bodyText,
  };
}

/** Three hours from now. The stored zone is UTC and the run is nowhere near
 *  23:00 UTC, so "later today" is the same calendar day in that zone — which is
 *  what makes `daysLeft === 0` and puts the account on the OVERLAP DAY. */
function laterToday(): string {
  return new Date(Date.now() + 3 * 3_600_000).toISOString();
}

beforeAll(async () => {
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await ledger.teardown();
}, 300_000);

describe("07 Step 5 — exactly one banner on the overlap day, and it is 07's", () => {
  /**
   * ⚠️ THE PRECONDITION, ASSERTED RATHER THAN ASSUMED. Every case below is about
   * which banner wins; if `05`'s line were in the tree under some other
   * condition, "absent" would mean something different in each one.
   */
  it("05's final-day banner is not in the tree at all", async () => {
    const { execFileSync } = await import("node:child_process");
    const root = new URL("../../", import.meta.url).pathname;
    let hits = "";
    try {
      hits = execFileSync(
        "grep",
        ["-rn", "--include=*.ts", "--include=*.tsx", FINAL_DAY_LINE, "app", "components", "lib"],
        { cwd: root, encoding: "utf8" },
      );
    } catch {
      hits = ""; // grep exits 1 on no match
    }
    // CONTROL: the same grep finds a line that IS there, so an empty result is
    // "not present" rather than "grep did not run".
    const control = execFileSync(
      "grep",
      ["-rln", "--include=*.ts", "Your free trial ends", "lib"],
      { cwd: root, encoding: "utf8" },
    );
    expect(control.trim().length, "the control grep found nothing, so the search is broken").toBeGreaterThan(0);
    console.log(`  control grep hit: ${control.trim()}`);
    console.log(`  "${FINAL_DAY_LINE}" hits: ${hits.trim() || "(none)"}`);
    expect(hits.trim(), "05 §3.6b's banner exists after all — rewrite these cases").toBe("");
  }, 60_000);

  it("A trialing account on its FINAL DAY gets one banner, and it is 07's", async () => {
    const endsAt = laterToday();
    const account = await seedAccount(ledger, "qa07-overlap-trial", {
      trialEndsAt: endsAt,
      status: "trialing",
      timezone: "UTC",
      notificationsEnabled: false,
    });

    /* ── ⚠️ ARRIVAL: the mirror really holds the overlap-day shape ────── */
    const row = await admin
      .from("subscriptions")
      .select("status, trial_ends_at, cancel_at_period_end")
      .eq("user_id", account.id)
      .maybeSingle();
    expect(row.data?.status).toBe("trialing");
    expect(row.data?.cancel_at_period_end).toBe(false);

    const seen = await openDashboard(account.email);
    console.log(`  banners: ${seen.bannerCount} -> ${JSON.stringify(seen.bannerText)}`);

    // Exactly one, and it is the reminder.
    expect(seen.bannerCount, "not exactly one banner on the overlap day").toBe(1);
    expect(seen.bannerText[0]).toContain("Your free trial ends today.");
    // ...and 05's is not beside it. Vacuous today; it is the assertion that
    // fails the moment somebody builds 05's banner without the suppression.
    expect(seen.finalDayLinePresent, "two banners about one ending").toBe(false);

    await seen.context.close();
  }, 300_000);

  it("A beta grace on its FINAL DAY gets one banner, and it never says trial", async () => {
    const endsAt = laterToday();
    const account = await seedAccount(ledger, "qa07-overlap-grace", {
      graceUntil: endsAt,
      timezone: "UTC",
      notificationsEnabled: false,
    });

    /* ── ⚠️ ARRIVAL ───────────────────────────────────────────────────── */
    const row = await admin
      .from("entitlements")
      .select("source, active_until")
      .eq("user_id", account.id)
      .maybeSingle();
    expect(row.data?.source).toBe("comp");
    expect(row.data?.active_until).not.toBeNull();

    const seen = await openDashboard(account.email);
    console.log(`  banners: ${seen.bannerCount} -> ${JSON.stringify(seen.bannerText)}`);

    expect(seen.bannerCount, "not exactly one banner on the overlap day").toBe(1);
    /**
     * ⚠️ LAW 5, ON THE COHORT IT WAS WRITTEN FOR. The fortnight is "14 days on
     * us" and NEVER a trial. `07` §5 asks for this checked with the gate ON,
     * "which is the only state in which the defect in §3.1b was reachable".
     */
    expect(seen.bannerText[0]).toContain("Your free access ends today.");
    expect(seen.bannerText[0], "a beta account is being told it is on a trial").not.toContain("trial");
    expect(seen.finalDayLinePresent).toBe(false);

    await seen.context.close();
  }, 300_000);
});

describe("07 Step 5 — and the days 07's reminder does NOT cover", () => {
  /**
   * ⚠️ `05` §5: "the final-day banner still renders on days this spec's reminder
   * does not". These two cases are those days, and NOTHING renders on them.
   *
   * `trialNoticeFor` returns null on its first line for `cancelAtPeriodEnd` and
   * for any status that is not `trialing` (`trialReminder.ts:291`), both
   * deliberately — `07`'s promise is "before anything changes", and for somebody
   * who already cancelled, nothing is. That is exactly the hole `05` §3.6b's
   * banner was decided to fill, in a cohort-neutral sentence that works for
   * somebody who never had a subscription.
   *
   * It is not a money defect: nobody is charged and no promise is contradicted.
   * It is a decided screen that was never built, recorded here by observation.
   */
  it("GAP: a cancelled trialist on their final entitled day sees NOTHING", async () => {
    const endsAt = laterToday();
    const account = await seedAccount(ledger, "qa07-cancelled-final", {
      trialEndsAt: endsAt,
      status: "trialing",
      cancelAtPeriodEnd: true,
      timezone: "UTC",
      notificationsEnabled: false,
    });

    /* ── ⚠️ ARRIVAL: they really are cancelled and really end today ───── */
    const row = await admin
      .from("subscriptions")
      .select("status, cancel_at_period_end, trial_ends_at")
      .eq("user_id", account.id)
      .maybeSingle();
    expect(row.data?.cancel_at_period_end, "not actually cancelled, so this proves nothing").toBe(true);
    expect(row.data?.status).toBe("trialing");

    const seen = await openDashboard(account.email);
    console.log(`  banners: ${seen.bannerCount} -> ${JSON.stringify(seen.bannerText)}`);

    // CONTROL: the page rendered. Asserted inside `openDashboard` by waiting for
    // the shell before reading anything.
    expect(seen.bannerCount, "07's reminder is reaching a cancelled account").toBe(0);
    expect(
      seen.finalDayLinePresent,
      "05's final-day banner is present after all — the gap is closed",
    ).toBe(false);

    await seen.context.close();
  }, 300_000);

  it("GAP: a paying account whose plan ends today sees NOTHING", async () => {
    const endsAt = laterToday();
    const account = await seedAccount(ledger, "qa07-active-final", {
      currentPeriodEnd: endsAt,
      status: "active",
      cancelAtPeriodEnd: true,
      timezone: "UTC",
      notificationsEnabled: false,
    });

    /* ── ⚠️ ARRIVAL ───────────────────────────────────────────────────── */
    const row = await admin
      .from("subscriptions")
      .select("status, cancel_at_period_end, current_period_end")
      .eq("user_id", account.id)
      .maybeSingle();
    expect(row.data?.status).toBe("active");
    expect(row.data?.cancel_at_period_end).toBe(true);
    expect(row.data?.current_period_end).not.toBeNull();

    const seen = await openDashboard(account.email);
    console.log(`  banners: ${seen.bannerCount} -> ${JSON.stringify(seen.bannerText)}`);

    expect(seen.bannerCount).toBe(0);
    expect(seen.finalDayLinePresent).toBe(false);

    await seen.context.close();
  }, 300_000);
});
