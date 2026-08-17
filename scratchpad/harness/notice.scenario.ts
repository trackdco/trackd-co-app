import { afterAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";

import { BASE, Ledger, QA_PASSWORD, admin, sameInstant, seedAccount } from "./core";

/**
 * SPEC 06 — THE NOTICE READS THE ENTITLEMENT ROW AND COMPUTES NOTHING.
 *
 *   BILLING_GATE_ENABLED=true npm run dev        # in another shell
 *   npx vitest run --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/notice.scenario.ts --reporter=verbose
 *
 * ## ⚠️ WHY THIS EXISTS AT ALL
 *
 * D86 sets the grace row at APPLY TIME on launch morning, so a notice that READS
 * the row is automatically right whenever launch happens, and one that COMPUTES
 * anything is wrong the moment the date moves. **That is the whole reason D86
 * works**, and until now it rested on reading the code rather than on observation.
 *
 * So the property is driven directly, and the shape is the point:
 *
 *     seed a dated comp row  ->  drive the notice, read the date it shows
 *     CHANGE THE ROW'S DATE  ->  drive again, confirm the notice MOVED WITH IT
 *
 * A notice that computed from `BETA_GRACE_DAYS` and `now` would show the SAME
 * date both times and pass any single-observation test. Only moving the row
 * separates reading from computing.
 *
 * ## ⚠️ IT NEVER CALLS THE BACKFILL ROUTE
 *
 * `/api/billing/beta-grace` is banned in every mode (Adrian, 2026-08-17) because
 * driving it once already ran the backfill against production. The row is seeded
 * directly, which is what the route would have done and needs no route.
 *
 * `06` Steps 6 and 7 are written for a database with ZERO entitlement rows. There
 * are ninety. Their premise is dead, and this drives the property they were
 * reaching for instead.
 *
 * Safety: one `@trackd-qa.invalid` account, ledgered, deleted BY ID. No Stripe.
 */

let browser: Browser;
const ledger = new Ledger();

/** Cookie jar for a seeded account, shaped the way the app expects. */
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

/** Open the dashboard in a FRESH context, so the seen-cookie never carries over. */
async function openNotice(email: string): Promise<{ page: Page; text: string | null }> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies(await cookiesFor(email));
  const page = await context.newPage();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(4000);
  const dialog = page.locator('[role="dialog"][aria-labelledby="beta-notice-title"]');
  const text = (await dialog.count()) > 0 ? await dialog.innerText() : null;
  return { page, text };
}

async function setExpiry(userId: string, iso: string | null): Promise<void> {
  const { error } = await admin
    .from("entitlements")
    .update({ active_until: iso })
    .eq("user_id", userId)
    .eq("product", "pro")
    .eq("source", "comp");
  if (error) throw new Error(`setExpiry: ${error.message}`);
}

afterAll(async () => {
  await browser?.close();
  await ledger.teardown();
}, 180_000);

describe("06 — the notice's date comes from the row, not from arithmetic", () => {
  it("moves when the row moves", async () => {
    browser = await chromium.launch();

    // Far enough out that no clamp or rounding could be mistaken for the effect.
    const first = "2026-09-30T04:00:00.000Z";
    const second = "2026-11-20T04:00:00.000Z";

    const account = await seedAccount(ledger, "qa06-notice", {
      graceUntil: first,
      notificationsEnabled: false,
    });

    /* ── ⚠️ ARRIVAL: the row really holds the first date ─────────────── */
    const seeded = await admin
      .from("entitlements")
      .select("active_until, source")
      .eq("user_id", account.id)
      .maybeSingle();
    expect(seeded.data?.source).toBe("comp");
    expect(sameInstant(seeded.data?.active_until as string, first)).toBe(true);

    /* ── observation one ────────────────────────────────────────────── */
    const one = await openNotice(account.email);
    expect(one.text, "the notice did not open at all").not.toBeNull();
    console.log(`  notice #1:\n${one.text}`);

    // The approved sentence, and the date the row holds.
    expect(one.text).toContain("Trackd Co is going paid");
    expect(one.text).toContain("two more weeks on us, until");
    expect(one.text).toContain("After that your account goes read only.");
    expect(one.text).toContain("Got it");
    expect(one.text).toContain("Set up my plan");
    expect(one.text, "the notice is not showing SEPTEMBER, which the row holds").toContain("Sep");
    await one.page.context().close();

    /* ── move the row, and NOTHING else ─────────────────────────────── */
    await setExpiry(account.id, second);
    const moved = await admin
      .from("entitlements")
      .select("active_until")
      .eq("user_id", account.id)
      .maybeSingle();
    expect(
      sameInstant(moved.data?.active_until as string, second),
      "the row did not actually move, so observation two proves nothing",
    ).toBe(true);

    /* ── observation two ────────────────────────────────────────────── */
    const two = await openNotice(account.email);
    expect(two.text, "the notice did not open the second time").not.toBeNull();
    console.log(`  notice #2:\n${two.text}`);

    /**
     * ⚠️ THE ASSERTION THE WHOLE SCENARIO IS FOR.
     *
     * A notice computing from `BETA_GRACE_DAYS` and `now` would print the same
     * date both times. Only a notice that READS the row can move with it.
     */
    expect(two.text, "the notice did not move with the row — it is COMPUTING").toContain("Nov");
    expect(two.text).not.toContain("Sep");
    await two.page.context().close();
  }, 600_000);

  /**
   * ⚠️ IF IT CANNOT NAME THE DATE, IT DOES NOT RENDER (standing rule 0).
   *
   * The deleted fallback said "two weeks" when the expiry could not be resolved —
   * turning "I do not know" into a confident claim. `04` §3.2 ruled the class:
   * a version that cannot name the date must not render.
   *
   * A comp with a NULL expiry is the free-for-life variant and states no date, so
   * it is the control: the same null must produce a notice here and none there.
   */
  it("a comp with no expiry still renders, because it names no date", async () => {
    const account = await seedAccount(ledger, "qa06-comp", {
      comp: true,
      notificationsEnabled: false,
    });
    const row = await admin
      .from("entitlements")
      .select("active_until")
      .eq("user_id", account.id)
      .maybeSingle();
    expect(row.data?.active_until, "a free-for-life comp must have NO expiry").toBeNull();

    const seen = await openNotice(account.email);
    expect(seen.text, "the comp variant did not open").not.toBeNull();
    console.log(`  comp notice:\n${seen.text}`);

    expect(seen.text).toContain("Trackd Co is yours. For life.");
    expect(seen.text).toContain("Adrian and Angus have given you free access for life.");
    expect(seen.text).toContain("You were here for the version that barely worked");
    expect(seen.text).toContain("Thank you");
    // One button on this variant, and it is not "Got it".
    expect(seen.text).not.toContain("Got it");
    expect(seen.text).not.toContain("Set up my plan");
    await seen.page.context().close();
  }, 300_000);
});
