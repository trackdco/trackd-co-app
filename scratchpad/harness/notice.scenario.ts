import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

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

const DIALOG = '[role="dialog"][aria-labelledby="beta-notice-title"]';
/** The app shell itself. A CONTROL: "the notice is absent" means nothing if the
 *  page never rendered, and a failed load is absent in exactly the same way. */
const SHELL = 'nav[aria-label="Primary"]';

/** Open the dashboard in a FRESH context, so the seen-cookie never carries over. */
async function openNotice(
  email: string,
  opts: { reducedMotion?: "reduce" | "no-preference"; deviceTimezone?: string } = {},
): Promise<{ page: Page; text: string | null }> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: opts.reducedMotion ?? "no-preference",
    ...(opts.deviceTimezone ? { timezoneId: opts.deviceTimezone } : {}),
  });
  await context.addCookies(await cookiesFor(email));
  const page = await context.newPage();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(4000);
  const dialog = page.locator(DIALOG);
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

/**
 * ⚠️ LAUNCHED IN A HOOK, NOT IN THE FIRST `it`. Steps 4 and 5 below are separate
 * describes: with the launch inside test one, running any of them with `-t` left
 * `browser` undefined and every later scenario died on `newContext of undefined`
 * — a driver fault that reads exactly like a broken feature.
 */
beforeAll(async () => {
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await ledger.teardown();
}, 300_000);

describe("06 — the notice's date comes from the row, not from arithmetic", () => {
  it("moves when the row moves", async () => {
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

  /**
   * ⚠️ STEP 3'S OTHER HALF: THE STORED TIMEZONE WINS, NOT THE DEVICE'S.
   *
   * §5: "with the device timezone set well away from the stored one, the notice's
   * date matches the entitlement row". The move-the-row test above proves the
   * notice READS; this proves it reads in the RIGHT ZONE, which is a separate
   * failure — a correctly-read instant formatted in the browser's zone is still
   * a wrong date on screen, and it is wrong by a whole day for half of every day.
   *
   * The instant is chosen so the two zones DISAGREE ON THE CALENDAR DATE, which
   * is the only kind of instant that can tell them apart:
   *
   *     2026-09-30T16:00Z  ->  Sydney (+10): 1 Oct 2026   <- stored, expected
   *                        ->  Los Angeles:  30 Sep 2026  <- device, must NOT win
   *
   * A same-date instant would pass whichever zone the formatter used.
   */
  it("formats in the account's STORED timezone, not the device's", async () => {
    const STRADDLES_MIDNIGHT = "2026-09-30T16:00:00.000Z";
    const account = await seedAccount(ledger, "qa06-tz", {
      graceUntil: STRADDLES_MIDNIGHT,
      timezone: "Australia/Sydney",
      notificationsEnabled: false,
    });

    /* ── ⚠️ ARRIVAL: the row and the profile really hold what this rests on ── */
    const row = await admin
      .from("entitlements")
      .select("active_until")
      .eq("user_id", account.id)
      .maybeSingle();
    expect(sameInstant(row.data?.active_until as string, STRADDLES_MIDNIGHT)).toBe(true);
    const prof = await admin
      .from("profiles")
      .select("timezone")
      .eq("id", account.id)
      .maybeSingle();
    expect(prof.data?.timezone, "the stored zone is not what this test assumes").toBe(
      "Australia/Sydney",
    );

    const { page, text } = await openNotice(account.email, {
      deviceTimezone: "America/Los_Angeles",
    });
    expect(text, "the notice did not open").not.toBeNull();

    // CONTROL: the browser really is in the far-away zone. Without this, a
    // matching date could just mean the emulation never took.
    const deviceZone = await page.evaluate(
      () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    console.log(`  device zone: ${deviceZone}\n  notice:\n${text}`);
    expect(deviceZone).toBe("America/Los_Angeles");

    expect(text, "the notice is formatting in the DEVICE's zone — a day early").not.toContain(
      "30 Sept 2026",
    );
    expect(text, "the notice is not showing the stored zone's date").toContain("1 Oct 2026");

    await page.context().close();
  }, 300_000);
});

/* ══════════════════════════════════════════════════════════════════════════
   STEP 4 — THE CONFETTI IS SCOPED TO THE COMP VARIANT
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * What the page can actually be seen to be doing with the burst.
 *
 * ⚠️ IT READS THE RENDERED DOM AND THE COMPUTED STYLE, NEVER THE SOURCE. A
 * source scan for `<Confetti />` would find the JSX and tell you nothing about
 * whether the media query hid it, which is the entire question in two of the
 * four cells below.
 *
 * ⚠️ AND IT REPORTS `pieceCount`, WHICH IS THE CONTROL. "No confetti animating"
 * is true of a correctly-suppressed burst and equally true of a notice that
 * never opened, a renamed class and a typo in the selector. Every assertion
 * below that expects a suppression is paired with one that proves this function
 * found the thing it is claiming to have found.
 */
async function readConfetti(page: Page) {
  return page.evaluate((sel) => {
    const dialog = document.querySelector(sel);
    if (!dialog) return null;
    const pieces = Array.from(dialog.querySelectorAll<HTMLElement>(".animate-flow-confetti"));
    const container = pieces[0]?.parentElement ?? null;
    // Scoped to the confetti's own keyframe. The dialog's `animate-in` entrance
    // also lives in this subtree and would otherwise be counted as a burst.
    const bursts = dialog
      .getAnimations({ subtree: true })
      .filter((a) => (a as CSSAnimation).animationName === "flow-confetti");
    return {
      pieceCount: pieces.length,
      dialogText: (dialog as HTMLElement).innerText,
      containerDisplay: container ? getComputedStyle(container).display : null,
      containerPointerEvents: container ? getComputedStyle(container).pointerEvents : null,
      pieceDisplays: [...new Set(pieces.map((p) => getComputedStyle(p).display))],
      pieceIterationCounts: [...new Set(pieces.map((p) => getComputedStyle(p).animationIterationCount))],
      burstCount: bursts.length,
      burstIterations: [...new Set(bursts.map((a) => a.effect?.getComputedTiming().iterations ?? null))],
      burstStates: [...new Set(bursts.map((a) => a.playState))],
      prefersReducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  }, DIALOG);
}

describe("06 Step 4 — confetti on the comp variant only, and gone under reduced motion", () => {
  /**
   * ⚠️ THE DECISION THIS PROTECTS IS NOT A STYLING PREFERENCE (§3.6).
   *
   * The beta variant tells somebody their free access ends in a fortnight.
   * Confetti over that is the app celebrating at a person it is about to start
   * charging, which §3.6 names as the single worst thing this screen could do.
   *
   * Four cells, because two of them are only meaningful next to the other two:
   *
   *                  motion normal            reduced motion
   *     comp         18 pieces, animating     18 pieces, display:none, 0 running
   *     beta         0 pieces                 0 pieces
   *
   * The comp row is the control for the beta row (the burst exists at all, so
   * zero on the beta variant is scoping rather than breakage) and the normal
   * column is the control for the reduce column (the burst runs at all, so
   * stopped under reduce is the opt-out rather than a dead component).
   */
  it("fires on the comp variant, and is one shot", async () => {
    const account = await seedAccount(ledger, "qa06-confetti-comp", {
      comp: true,
      notificationsEnabled: false,
    });
    const { page, text } = await openNotice(account.email);

    /* ── ⚠️ ARRIVAL: this really is the comp variant ─────────────────── */
    expect(text, "the comp notice did not open").not.toBeNull();
    expect(text).toContain("Trackd Co is yours. For life.");

    const c = await readConfetti(page);
    console.log(`  comp / motion normal: ${JSON.stringify(c, null, 2)}`);
    expect(c).not.toBeNull();
    expect(c!.prefersReducedMotion, "the browser is not in the motion state claimed").toBe(false);

    // It is there, and it is visible.
    expect(c!.pieceCount, "no confetti on the variant that is supposed to have it").toBe(18);
    expect(c!.containerDisplay).not.toBe("none");
    expect(c!.pieceDisplays).not.toContain("none");

    /**
     * ⚠️ `pointer-events-none` IS NOT DECORATION-POLICING, IT IS THE TAP.
     * The burst covers the whole card, "Thank you" included. An overlay that
     * accepted a tap would swallow the only control on the screen.
     */
    expect(c!.containerPointerEvents).toBe("none");

    // ONE SHOT: eighteen animations, each with exactly one iteration.
    expect(c!.burstCount, "the pieces are not actually animating").toBe(18);
    expect(c!.burstIterations, "the burst repeats — it is ambient motion, which ui-context bans").toEqual([1]);
    expect(c!.pieceIterationCounts).toEqual(["1"]);

    /**
     * ...and it ENDS. `iterations: 1` is the declaration; this is the
     * observation. The longest piece is delay 1140ms + duration 4600ms, so at
     * 8s every one of them must have finished and none may have restarted.
     */
    await page.waitForTimeout(8000);
    const after = await readConfetti(page);
    console.log(`  comp / after 8s: burstStates=${JSON.stringify(after!.burstStates)}`);
    expect(after!.pieceCount, "the pieces vanished from the DOM, so this proves nothing").toBe(18);
    expect(after!.burstStates, "the burst is still going after 8s").toEqual(["finished"]);

    await page.context().close();
  }, 300_000);

  it("fires NOTHING on the beta variant", async () => {
    const account = await seedAccount(ledger, "qa06-confetti-beta", {
      graceUntil: "2026-09-30T04:00:00.000Z",
      notificationsEnabled: false,
    });
    const { page, text } = await openNotice(account.email);

    /* ── ⚠️ ARRIVAL: the beta notice is on screen, so zero means SCOPED ── */
    expect(text, "the beta notice did not open, so 'no confetti' proves nothing").not.toBeNull();
    expect(text).toContain("Trackd Co is going paid");
    expect(text).toContain("After that your account goes read only.");

    const c = await readConfetti(page);
    console.log(`  beta / motion normal: ${JSON.stringify(c, null, 2)}`);
    expect(c!.prefersReducedMotion).toBe(false);
    expect(c!.pieceCount, "THE APP IS CELEBRATING AT SOMEBODY IT IS ABOUT TO CHARGE").toBe(0);
    expect(c!.burstCount).toBe(0);

    await page.context().close();
  }, 300_000);

  it("collapses to nothing under reduced motion, rather than to stranded dots", async () => {
    const account = await seedAccount(ledger, "qa06-confetti-reduce", {
      comp: true,
      notificationsEnabled: false,
    });
    const { page, text } = await openNotice(account.email, { reducedMotion: "reduce" });

    /* ── ⚠️ ARRIVAL, twice over: the right variant AND the right media state ── */
    expect(text, "the comp notice did not open under reduced motion").not.toBeNull();
    expect(text).toContain("Trackd Co is yours. For life.");

    const c = await readConfetti(page);
    console.log(`  comp / reduced motion: ${JSON.stringify(c, null, 2)}`);
    expect(
      c!.prefersReducedMotion,
      "the emulation never took, so anything below would be measuring the normal case",
    ).toBe(true);

    /**
     * ⚠️ THE PIECES ARE STILL IN THE DOM, AND THAT IS THE CONTROL.
     *
     * React renders them either way; CSS is what removes them. Eighteen present
     * and hidden is a proof; zero present would have passed the display check
     * for the wrong reason and told us nothing about the opt-out.
     */
    expect(c!.pieceCount, "nothing to hide, so 'hidden' is vacuous").toBe(18);

    /**
     * ⚠️ HIDDEN, NOT MERELY STILLED. `confetti.tsx` records the measurement:
     * the shared `animation: none` opt-out alone strands eighteen amber dots
     * pinned along the top edge at `opacity: 0.59`, permanently, because these
     * keyframes animate TO invisibility. `motion-reduce:hidden` is the collapse.
     */
    expect(c!.containerDisplay, "the burst is stilled but still visible — stranded dots").toBe("none");
    expect(c!.burstCount, "an animation is still running under prefers-reduced-motion").toBe(0);

    await page.context().close();
  }, 300_000);

  it("shows nothing on the beta variant under reduced motion either", async () => {
    const account = await seedAccount(ledger, "qa06-confetti-beta-reduce", {
      graceUntil: "2026-09-30T04:00:00.000Z",
      notificationsEnabled: false,
    });
    const { page, text } = await openNotice(account.email, { reducedMotion: "reduce" });

    expect(text, "the beta notice did not open").not.toBeNull();
    expect(text).toContain("Trackd Co is going paid");

    const c = await readConfetti(page);
    console.log(`  beta / reduced motion: pieceCount=${c!.pieceCount} rm=${c!.prefersReducedMotion}`);
    expect(c!.prefersReducedMotion).toBe(true);
    expect(c!.pieceCount).toBe(0);

    await page.context().close();
  }, 300_000);
});

/* ══════════════════════════════════════════════════════════════════════════
   STEP 5 — ONCE, AND WHOSE NOTICE THE SECOND ACCOUNT GETS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Sign a different account into the SAME browser, the way a shared device does.
 *
 * ⚠️ IT DROPS ONLY THE SUPABASE SESSION COOKIES. `trackd_beta_notice_seen` is
 * the mechanism under test and must survive, exactly as it does in the app:
 * `supabase.auth.signOut()` clears its own cookies and nothing else
 * (`app/(app)/actions.ts:12`), so the seen-flag outlives a sign-out.
 */
async function signInInstead(context: BrowserContext, email: string): Promise<void> {
  const keep = (await context.cookies()).filter((c) => !c.name.startsWith("sb-"));
  await context.clearCookies();
  await context.addCookies(keep);
  await context.addCookies(await cookiesFor(email));
}

async function seenCookie(context: BrowserContext): Promise<string | null> {
  const c = (await context.cookies()).find((x) => x.name === "trackd_beta_notice_seen");
  return c ? decodeURIComponent(c.value) : null;
}

describe("06 Step 5 — the notice shows once, and a second account gets its own", () => {
  /**
   * Two beta accounts with DELIBERATELY DIFFERENT DATES, rather than one beta
   * and one comp. Two different variants would be told apart by their headline
   * and would prove nothing about scoping; two accounts on the same variant are
   * distinguishable only by the date each one's own row holds, so "B saw its
   * own notice" cannot pass by accident.
   */
  it("dismisses once, survives reload and navigation, and does not leak between accounts", async () => {
    const A_UNTIL = "2026-09-30T04:00:00.000Z"; // "30 Sep 2026"
    const B_UNTIL = "2026-11-20T04:00:00.000Z"; // "20 Nov 2026"

    const a = await seedAccount(ledger, "qa06-once-a", {
      graceUntil: A_UNTIL,
      notificationsEnabled: false,
    });
    const b = await seedAccount(ledger, "qa06-once-b", {
      graceUntil: B_UNTIL,
      notificationsEnabled: false,
    });

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies(await cookiesFor(a.email));
    const page = await context.newPage();
    const dialog = page.locator(DIALOG);

    /* ── 1. ⚠️ ARRIVAL: A's notice is on screen, and it is A's ──────── */
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForSelector(SHELL, { timeout: 60_000 });
    await page.waitForTimeout(3000);
    expect(await dialog.count(), "A's notice never opened, so nothing below means anything").toBe(1);
    const aText = await dialog.innerText();
    console.log(`  A's notice:\n${aText}`);
    expect(aText).toContain("Sep");
    expect(aText).not.toContain("Nov");
    expect(await seenCookie(context), "the seen-cookie exists before it was dismissed").toBeNull();

    /* ── 2. dismiss ─────────────────────────────────────────────────── */
    await page.getByRole("button", { name: "Got it" }).click();
    await dialog.waitFor({ state: "detached", timeout: 15_000 });
    expect(
      await seenCookie(context),
      "the cookie holds something other than A's id, so it is not account-scoped",
    ).toBe(a.id);

    /* ── 3. reload ──────────────────────────────────────────────────── */
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForSelector(SHELL, { timeout: 60_000 });
    await page.waitForTimeout(3000);
    // ⚠️ CONTROL: the shell above proves the page rendered. Without it, a dead
    // page and a suppressed notice are the same observation.
    expect(await dialog.count(), "the notice came back on reload").toBe(0);

    /* ── 4. navigate away and back, as a soft push ──────────────────── */
    await page.getByRole("link", { name: "Protocol" }).click();
    await page.waitForURL("**/protocol", { timeout: 60_000 });
    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.waitForURL("**/dashboard", { timeout: 60_000 });
    await page.waitForTimeout(3000);
    expect(await page.locator(SHELL).count(), "the app shell is gone").toBe(1);
    expect(await dialog.count(), "the notice came back on navigation").toBe(0);

    /* ── 5. a SECOND ACCOUNT in the same browser ────────────────────── */
    await signInInstead(context, b.email);
    // ⚠️ CONTROL: if the swap wiped the seen-cookie, B seeing a notice would be
    // trivially true and would say nothing about scoping.
    expect(
      await seenCookie(context),
      "the seen-cookie did not survive the account swap; the test below is vacuous",
    ).toBe(a.id);

    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForSelector(SHELL, { timeout: 60_000 });
    await page.waitForTimeout(3000);
    expect(await dialog.count(), "B was silently dismissed by A's cookie").toBe(1);
    const bText = await dialog.innerText();
    console.log(`  B's notice:\n${bText}`);
    /**
     * ⚠️ B SEES ITS OWN, NOT A'S. §3.7: keyed on nothing, a shared browser shows
     * one person's notice being dismissed by another's — the exact defect the
     * trial banner's first fix failed to close by matching on a date suffix.
     */
    expect(bText, "B is being shown A's date").not.toContain("Sep");
    expect(bText, "B is not being shown its own row's date").toContain("Nov");

    await context.close();
  }, 600_000);

  /**
   * ⚠️ STOP-LIST S4 — A STATE THE SPEC DOES NOT RULE ON. Observed, pinned, and
   * flagged for the founder rather than decided here.
   *
   * §3.7 says two things that are both true and that pull apart in exactly one
   * case. It says the flag "is scoped to the ACCOUNT, by storing the user id as
   * the value", and it says "a cookie is per-browser", listing the re-show cases
   * it accepts: clearing cookies, a second device, a private window. Two
   * accounts alternating in one browser is not in that list.
   *
   * The cookie is ONE SLOT holding ONE id, so it is account-scoped in the sense
   * that matters most — B never inherits A's dismissal — but it cannot remember
   * two dismissals at once. When B dismisses, A's is overwritten, and A meets
   * the notice again on its next load. §5's box says "the notice shows once per
   * account and does not return on reload or navigation"; for A, after B, it
   * returns.
   *
   * Not a defect on its face. `04`'s offer store is account-scoped and D30's
   * cookie is per-browser, deliberately, so the two disagree by design — and a
   * re-shown going-paid notice is the harmless direction (§7: "a re-shown notice
   * is a second notice, which is harmless, while a never-shown one is the real
   * gap"). It is recorded because it is a real observable behaviour on a shared
   * device that no line of the spec names.
   */
  it("OBSERVATION (S4): after B dismisses, A's dismissal is overwritten", async () => {
    const a = await seedAccount(ledger, "qa06-slot-a", {
      graceUntil: "2026-09-30T04:00:00.000Z",
      notificationsEnabled: false,
    });
    const b = await seedAccount(ledger, "qa06-slot-b", {
      graceUntil: "2026-11-20T04:00:00.000Z",
      notificationsEnabled: false,
    });

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies(await cookiesFor(a.email));
    const page = await context.newPage();
    const dialog = page.locator(DIALOG);

    // A dismisses.
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForSelector(SHELL, { timeout: 60_000 });
    await page.waitForTimeout(3000);
    expect(await dialog.count(), "A's notice never opened").toBe(1);
    await page.getByRole("button", { name: "Got it" }).click();
    await dialog.waitFor({ state: "detached", timeout: 15_000 });
    expect(await seenCookie(context)).toBe(a.id);

    // B signs in and dismisses.
    await signInInstead(context, b.email);
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForSelector(SHELL, { timeout: 60_000 });
    await page.waitForTimeout(3000);
    expect(await dialog.count(), "B's notice never opened, so the overwrite never happened").toBe(1);
    await page.getByRole("button", { name: "Got it" }).click();
    await dialog.waitFor({ state: "detached", timeout: 15_000 });
    expect(await seenCookie(context), "B's dismissal did not reach the cookie").toBe(b.id);

    // A comes back to the same browser.
    await signInInstead(context, a.email);
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForSelector(SHELL, { timeout: 60_000 });
    await page.waitForTimeout(3000);
    const returned = await dialog.count();
    console.log(`  A's notice after B dismissed in the same browser: ${returned === 1 ? "SHOWN AGAIN" : "still gone"}`);
    /**
     * The single slot means A's dismissal is gone. Pinned so the behaviour is a
     * recorded fact rather than a guess — if the founder rules the other way,
     * this failing is the point.
     */
    expect(returned, "one slot, one id: A's dismissal was overwritten by B's").toBe(1);
    if (returned === 1) {
      const t = await dialog.innerText();
      expect(t, "and it is A's own notice, not B's").toContain("Sep");
    }

    await context.close();
  }, 600_000);
});
