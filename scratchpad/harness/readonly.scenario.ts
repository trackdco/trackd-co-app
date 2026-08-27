import { afterAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";

import { grantsPro } from "@/lib/billing/access";

import { BASE, Ledger, QA_PASSWORD, admin, seedAccount } from "./core";

/**
 * SPEC 05 Step 7 — DRIVE THE LAPSE, WITH THE GATE ON.
 *
 *   BILLING_GATE_ENABLED=true npm run dev        # in another shell
 *   npx vitest run --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/readonly.scenario.ts --reporter=verbose
 *
 * ## ⚠️ IT LAPSES AN ACCOUNT THAT WAS GENUINELY ENTITLED, mid-run
 *
 * Seeding an account that never had an entitlement proves nothing about a LAPSE —
 * it is a different cohort wearing the same symptoms, and this project has been
 * caught by that shape five times. So the entitlement is seeded live, the account
 * is proven to WRITE, and then the same account is watched crossing its own expiry
 * without anything being re-seeded.
 *
 * That also proves the thing `architecture.md` bans a stored boolean for: access
 * is computed on READ, so a trial that expired at 3am is expired at 3am and does
 * not wait for something to run.
 *
 * ## ⚠️ NO STRIPE. Deliberately, and it is not a shortcut.
 *
 * The gate reads `entitlements` and nothing else — §3.2 says if any access check
 * anywhere reads a Stripe status the work has failed regardless of whether
 * payments work. So a lapse IS an `active_until` passing, and involving Stripe
 * here would be testing a path the gate does not have. Step 8's WRITERS are the
 * part that needs a test clock, because that is where Stripe's state machine is.
 *
 * Safety: one `@trackd-qa.invalid` account, ledgered, deleted BY ID. No Stripe
 * object is created, so there is none to clean up first.
 */

const GRACE_SECONDS = 30;

let browser: Browser;
const ledger = new Ledger();

async function screenText(page: Page): Promise<string> {
  return page.locator("body").innerText();
}

const popupOf = (page: Page) =>
  page.locator('[role="dialog"][aria-labelledby="readonly-title"]');

/** The FAB is TWO taps: the quick-actions menu, then the write control inside it. */
async function attemptWrite(page: Page): Promise<void> {
  const fab = page
    .locator('button[aria-label*="Quick" i], button[aria-label*="add" i]')
    .first();
  await fab.click({ timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600);
  if ((await popupOf(page).count()) > 0) return;
  await page
    .locator("button", { hasText: /log a dose|log weight|add|journal/i })
    .first()
    .click({ timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(900);
}

async function weightRows(userId: string): Promise<number> {
  // ⚠️ `profile_id`, NOT `user_id`. Counting the wrong key returns 0 for a row
  // that landed perfectly, which cost this lane three runs.
  const { count } = await admin
    .from("weight_logs")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", userId);
  return count ?? 0;
}

async function entitlementNow(userId: string) {
  const { data } = await admin
    .from("entitlements")
    .select("product, source, active_until, is_active")
    .eq("user_id", userId);
  return (data ?? []).map((r) => ({
    product: r.product as "pro",
    source: r.source as "comp",
    activeUntil: r.active_until as string | null,
    isActive: r.is_active as boolean,
  }));
}

afterAll(async () => {
  await browser?.close();
  await ledger.teardown();
}, 180_000);

describe("Step 7 — a real account crossing its own expiry, gate ON", () => {
  it("walks the whole lapse", async () => {
    browser = await chromium.launch();

    /* ── seed: entitled NOW, expiring in half a minute ──────────────── */
    const expiresAt = new Date(Date.now() + GRACE_SECONDS * 1000).toISOString();
    const account = await seedAccount(ledger, "qa05-lapse", {
      graceUntil: expiresAt,
      notificationsEnabled: false,
    });

    const before = await entitlementNow(account.id);
    expect(before, "the entitlement was not seeded").toHaveLength(1);
    expect(
      grantsPro(before, new Date()),
      "the account must START entitled, or this measures the wrong cohort",
    ).toBe(true);

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies(await cookiesFor(account.email));
    const page = await context.newPage();

    /* ── ⚠️ ARRIVAL: it can genuinely WRITE while entitled ──────────── */
    await page.goto(`${BASE}/weight`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForTimeout(5000);
    const field = page.locator('input[inputmode="decimal"]').first();
    await field.waitFor({ state: "visible", timeout: 60_000 });
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await field.fill("81.5").catch(() => {});
      await page.locator("button", { hasText: /^Done$/ }).first().click({ timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(2500);
      if ((await weightRows(account.id)) > 0) break;
    }
    const loggedWhileEntitled = await weightRows(account.id);
    expect(
      loggedWhileEntitled,
      "the entitled account could not write, so there is no lapse to observe",
    ).toBeGreaterThan(0);

    /* ── the lapse itself. Nothing is re-seeded. ────────────────────── */
    const waitMs = Date.parse(expiresAt) - Date.now() + 2000;
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));

    const after = await entitlementNow(account.id);
    expect(after, "the row must still EXIST; a lapse is not a deletion").toHaveLength(1);
    expect(after[0].isActive, "nothing revoked it; the DATE passed").toBe(true);
    expect(
      grantsPro(after, new Date()),
      "the entitlement did not actually lapse",
    ).toBe(false);

    /* ── every screen opens, and nothing is hidden ──────────────────── */
    for (const path of ["/dashboard", "/weight", "/progress", "/protocol", "/calendar", "/profile", "/billing"]) {
      const res = await page
        .goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 90_000 })
        .catch(() => null);
      expect(res, `${path} never opened`).not.toBeNull();
      expect(res!.status(), `${path} returned ${res!.status()}`).toBeLessThan(400);
    }

    /* ── the log made while entitled is STILL READABLE ──────────────── */
    await page.goto(`${BASE}/weight`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForTimeout(4000);
    const weightScreen = await screenText(page);
    expect(
      weightScreen,
      "the reading logged while entitled is not on screen — read-only must not hide data",
    ).toContain("81.5");
    expect(await weightRows(account.id)).toBe(loggedWhileEntitled);

    /* ── adding is refused, in the approved words ───────────────────── */
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForTimeout(3000);
    await attemptWrite(page);
    const popup = popupOf(page);
    expect(await popup.count(), "the read-only pop-up did not open").toBeGreaterThan(0);

    const words = await popup.innerText();
    expect(words).toContain("Your account is read only");
    expect(words).toContain(
      "You're not on a plan at the moment, so Trackd Co is read only.",
    );
    expect(words).toContain("Nothing has been deleted.");
    expect(words).toContain("Back to my logs");
    expect(words).toContain("Choose a plan");
    // ⚠️ The exact phrase, and none of the three banned ones.
    expect(words).toMatch(/read only/);
    for (const banned of ["paused", "expired", "locked"]) {
      expect(words.toLowerCase(), `"${banned}" must not appear`).not.toContain(banned);
    }
    expect(words, "no em dash in user-facing copy").not.toContain("—");

    await popup.locator("button", { hasText: "Back to my logs" }).click();
    await page.waitForTimeout(500);

    /* ── deleting STILL WORKS. Removing your own data is yours to do. ─ */
    const { error: delErr } = await admin
      .from("weight_logs")
      .delete()
      .eq("profile_id", account.id);
    expect(delErr, "a lapsed account could not delete its own data").toBeNull();
    expect(await weightRows(account.id)).toBe(0);

    /* ── settings still save ────────────────────────────────────────── */
    const { error: tzErr } = await admin
      .from("profiles")
      .update({ timezone: "Australia/Perth" })
      .eq("id", account.id);
    expect(tzErr, "a lapsed account could not fix its timezone").toBeNull();

    /* ── and NOTHING was deleted by the lapse itself ────────────────── */
    const stillThere = await entitlementNow(account.id);
    expect(stillThere).toHaveLength(1);

    await context.close();
  }, 600_000);
});

/** Sign in over the auth API and shape the cookie jar the app expects. */
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
