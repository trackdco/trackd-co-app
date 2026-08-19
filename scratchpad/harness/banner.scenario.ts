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
  it("05's final-day banner IS in the tree — the precondition, inverted on 2026-08-18", async () => {
    /**
     * ⚠️ THIS TEST USED TO ASSERT THE OPPOSITE, and its own failure message said
     * "05 §3.6b's banner exists after all — rewrite these cases". It does now:
     * `05` Step 9 built it. So the same grep is kept and the expectation flipped,
     * rather than the test being deleted — it is the precondition every case in
     * this file depends on, and the day it silently stops being true is the day
     * the suppression cases start passing for the wrong reason.
     */
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
    console.log(`  "${FINAL_DAY_LINE}" hits:\n${hits.trim() || "(none)"}`);
    expect(
      hits.trim().length,
      "05 §3.6b's banner is NOT in the tree — Step 9 was reverted, and every suppression case below is vacuous",
    ).toBeGreaterThan(0);
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

/**
 * ⚠️ SUPERSEDED BY `05` STEP 9, AND KEPT ONLY AS A REGRESSION FENCE.
 *
 * These two cases were the EVIDENCE for the gap: on 2026-08-17 a cancelled
 * trialist and a cancelled paying account each saw ZERO banners on their final
 * entitled day, because `07`'s reminder excludes them and `05` §3.6b's banner had
 * never been built.
 *
 * **`05` Step 9 built it on 2026-08-18, so the gap is closed** — and these two
 * still pass, which is the part worth saying out loud: their fixtures have NO
 * entitlement row at all, so there is no final day to announce and the banner is
 * correctly silent. They no longer measure the gap they were named for.
 *
 * Retitled rather than deleted, because what they now prove is worth keeping:
 * **absent is not today.** A missing entitlement must never be read as "ends
 * today", which is standing rule 0 in the direction that would put a false banner
 * on somebody's dashboard. The cohorts that DO have a final day are covered by the
 * `05` Step 9 block below.
 */
describe("07 Step 5 — a cancelled account with NO entitlement announces nothing", () => {
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
  it("a cancelled trialist with no entitlement row sees no banner", async () => {
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
    /**
     * ⚠️ NOT "the gap is still open" any more. `05` Step 9's banner exists now;
     * this fixture has no entitlement, so there is no final day and silence is
     * correct. A missing row read as "today" would be the defect.
     */
    expect(
      seen.finalDayLinePresent,
      "a missing entitlement was announced as a final day",
    ).toBe(false);

    await seen.context.close();
  }, 300_000);

  it("a cancelled paying account with no entitlement row sees no banner", async () => {
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

/* ══════════════════════════════════════════════════════════════════════════
   05 STEP 9 — THE FINAL-DAY BANNER, BUILT AND DRIVEN
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ REQUIRES THE GATE ON: `BILLING_GATE_ENABLED=true npm run dev`.
 *
 * `05` §3.6b's banner is gated for the reason `dashboard/page.tsx` already gives
 * about `graceTrial`: "With the switch off nothing ends. Warning somebody about a
 * deadline that is not enforced is the same lie as not warning them about one that
 * is." With the gate off this renders for nobody, by design — so a gate-off run
 * would report every case below as a pass while testing nothing.
 */
const FINAL_DAY = "Your plan ends today.";

/** Later today in UTC, which is the account's stored zone in these fixtures. */
function laterTodayUtc(): string {
  return new Date(Date.now() + 3 * 3_600_000).toISOString();
}

describe("05 Step 9 — the final entitled day, stated once", () => {
  /**
   * ⚠️ THE TWO COHORTS THAT PREVIOUSLY SAW NOTHING. Measured on 2026-08-17 as
   * ZERO banners each: `trialNoticeFor` returns null on its first line for
   * `cancelAtPeriodEnd` and for any status that is not `trialing`
   * (`trialReminder.ts:291`). This is the gap §3.6b was decided to fill.
   */
  it("a CANCELLED trialist on their final entitled day now gets exactly one banner", async () => {
    const endsAt = laterTodayUtc();
    const account = await seedAccount(ledger, "qa05-cancelled-final", {
      trialEndsAt: endsAt,
      status: "trialing",
      cancelAtPeriodEnd: true,
      graceUntil: endsAt,
      timezone: "UTC",
      notificationsEnabled: false,
    });

    /* ── ⚠️ ARRIVAL: cancelled, and an entitlement that really ends today ── */
    const sub = await admin
      .from("subscriptions")
      .select("cancel_at_period_end, status")
      .eq("user_id", account.id)
      .maybeSingle();
    expect(sub.data?.cancel_at_period_end, "not cancelled, so 07's banner might cover it").toBe(true);
    const ent = await admin
      .from("entitlements")
      .select("active_until, is_active")
      .eq("user_id", account.id)
      .maybeSingle();
    expect(ent.data?.active_until, "no entitlement date, so there is no final day").not.toBeNull();
    expect(ent.data?.is_active).toBe(true);

    const seen = await openDashboard(account.email);
    console.log(`  cancelled trialist: banners=${seen.bannerCount} -> ${JSON.stringify(seen.bannerText)}`);

    expect(seen.finalDayLinePresent, "05 §3.6b's banner did not render for the cohort it is FOR").toBe(true);
    /**
     * ⚠️ EXACTLY ONE. Two banners about one ending is worse than either alone
     * (§3.7), so the count matters as much as the presence.
     */
    expect(seen.bannerCount, "not exactly one banner on the final entitled day").toBe(1);
    expect(seen.bannerText[0]).toContain(FINAL_DAY);
    // It must not have acquired 07's wording, which would be the wrong promise.
    expect(seen.bannerText[0], "the final-day banner is describing a trial").not.toContain("trial");

    await seen.context.close();
  }, 300_000);

  it("a PAYING account whose cancelled period ends today now gets exactly one banner", async () => {
    const endsAt = laterTodayUtc();
    const account = await seedAccount(ledger, "qa05-active-final", {
      currentPeriodEnd: endsAt,
      status: "active",
      cancelAtPeriodEnd: true,
      timezone: "UTC",
      notificationsEnabled: false,
    });

    /**
     * ⚠️ A `stripe` ENTITLEMENT, NOT A COMP — and the first version of this
     * fixture got it wrong in a way that read as a product defect.
     *
     * It used `graceUntil`, which is the only entitlement `seedAccount` writes and
     * which writes `source: "comp"`. A comp WITH an expiry is by definition the
     * beta grace (`06` §3.2), so `graceAsTrial` described this paying account as a
     * grace, `07`'s reminder fired "Your free access ends today.", and that
     * SUPPRESSED the banner under test. The failure looked like 05 Step 9 not
     * rendering; it was the fixture describing the wrong cohort.
     *
     * A paying subscriber's entitlement is `source: "stripe"`, which
     * `graceAsTrial`'s comp test deliberately excludes — the same guard `06` §3.5
     * calls load-bearing.
     */
    const { error } = await admin.from("entitlements").insert({
      user_id: account.id,
      product: "pro",
      source: "stripe",
      active_until: endsAt,
      is_active: true,
    });
    if (error) throw new Error(`stripe entitlement: ${error.message}`);

    /* ── ⚠️ ARRIVAL: the entitlement is stripe-sourced and ends today ──── */
    const ent = await admin
      .from("entitlements")
      .select("source, active_until")
      .eq("user_id", account.id)
      .maybeSingle();
    expect(ent.data?.source, "not a stripe entitlement, so this is the grace cohort again").toBe(
      "stripe",
    );

    const seen = await openDashboard(account.email);
    console.log(`  paying, ends today: banners=${seen.bannerCount} -> ${JSON.stringify(seen.bannerText)}`);
    expect(seen.finalDayLinePresent).toBe(true);
    expect(seen.bannerCount).toBe(1);
    expect(seen.bannerText[0]).toContain(FINAL_DAY);
    await seen.context.close();
  }, 300_000);

  /**
   * ⚠️ THE NO-DOUBLE-BANNER RULE, FROM `07`'s SIDE. On the overlap day the
   * reminder wins and this banner is suppressed. Driven rather than reasoned
   * about, because the two used to be independent predicates and the whole point
   * of the ternary is that they cannot both fire.
   */
  it("on the OVERLAP day the reminder wins and the final-day line is suppressed", async () => {
    const endsAt = laterTodayUtc();
    const account = await seedAccount(ledger, "qa05-overlap", {
      // Trialing, NOT cancelled, so 07's reminder is eligible...
      trialEndsAt: endsAt,
      status: "trialing",
      // ...and an entitlement ending today, so 05's banner is eligible too.
      graceUntil: endsAt,
      timezone: "UTC",
      notificationsEnabled: false,
    });

    const seen = await openDashboard(account.email);
    console.log(`  overlap day: banners=${seen.bannerCount} -> ${JSON.stringify(seen.bannerText)}`);

    /* ── ⚠️ ARRIVAL: 07's reminder really is the one on screen ─────────── */
    expect(seen.bannerCount, "not exactly one banner on the overlap day").toBe(1);
    expect(seen.bannerText[0], "07's reminder is not the banner that rendered").toContain("ends today");
    expect(
      seen.finalDayLinePresent,
      "BOTH banners rendered — the promised reminder did not win",
    ).toBe(false);

    await seen.context.close();
  }, 300_000);

  /**
   * ⚠️ ONE DAY ONLY. §3.6b: "Not a countdown, not a week of escalating notices."
   * An entitlement ending in three days must produce nothing from this banner —
   * and the CONTROL is that the same fixture one day later does produce it, which
   * the cases above already establish.
   */
  it("does NOT render before the final day", async () => {
    const account = await seedAccount(ledger, "qa05-notyet", {
      currentPeriodEnd: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      status: "active",
      cancelAtPeriodEnd: true,
      graceUntil: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      timezone: "UTC",
      notificationsEnabled: false,
    });

    const seen = await openDashboard(account.email);
    console.log(`  three days out: banners=${seen.bannerCount}, final-day line=${seen.finalDayLinePresent}`);
    expect(seen.finalDayLinePresent, "the final-day banner rendered three days early").toBe(false);
    await seen.context.close();
  }, 300_000);

  /**
   * ⚠️ AND ABSENT IS NOT TODAY. An account with no active entitlement at all has
   * no final day to announce, and a missing row must never be read as "today" —
   * standing rule 0, in the direction that would put a false banner on screen.
   */
  it("does NOT render for an account with no entitlement at all", async () => {
    const account = await seedAccount(ledger, "qa05-noent", {
      timezone: "UTC",
      notificationsEnabled: false,
    });
    const ent = await admin.from("entitlements").select("id").eq("user_id", account.id);
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
    expect(ent.data?.length, "the fixture has an entitlement after all").toBe(0);

    const seen = await openDashboard(account.email);
    console.log(`  no entitlement: banners=${seen.bannerCount}, final-day line=${seen.finalDayLinePresent}`);
    expect(seen.finalDayLinePresent, "a missing entitlement was read as 'ends today'").toBe(false);
    await seen.context.close();
  }, 300_000);
});
