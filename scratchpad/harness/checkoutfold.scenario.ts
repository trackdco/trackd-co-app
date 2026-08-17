import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";

import { BASE, Ledger, QA_PASSWORD, admin, seedAccount } from "./core";

/**
 * SPEC 09 STEP 1 — THE BASELINE, AND THE OUTSTANDING HIGH IT IS ABOUT.
 *
 *   npm run dev                                  # in another shell, NO gate flag
 *   npx vitest run --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/checkoutfold.scenario.ts --reporter=verbose
 *
 * ## The requirement, which is `02b`'s and not this spec's to soften
 *
 * `09` §3.5: the four required facts are the trial length, the exact renewal
 * amount with its currency, the date of the first charge, and that it renews
 * until cancelled. **"All four must be visible at the same time as the button,
 * without scrolling, at 390x844 and at 320x568."** A previous audit found this
 * screen could be paid on with the price scrolled out of view.
 *
 * A cold review reported the defect is live at 320x568 in every variant. `09`
 * Step 1 says baseline it before changing anything, and §3.5 says **"measure, do
 * not eyeball"** — so this measures, and every later step is compared to it.
 *
 * ## ⚠️ WHAT "VISIBLE WITHOUT SCROLLING" IS MEASURED AS
 *
 * The element's bottom edge, in page coordinates, against the viewport height,
 * **with the page scrolled to the top**. Not `isVisible()`, which is true of
 * anything rendered whether or not it is below the fold, and not a screenshot.
 *
 * Both disclosure paragraphs are measured, because the four facts are split
 * across them: paragraph one carries the trial length and the amount, paragraph
 * two the first-charge date and the renewal statement.
 *
 * ## ⚠️ WALLET ABSENT IS THE MEASURED CASE, AND IT IS THE RIGHT ONE
 *
 * `09` §3.6: the express-checkout row "renders nothing at all on a device with no
 * wallet configured", and "its absence is the layout case that produces the worst
 * gap". Headless Chromium has no wallet, so that is what this measures. The
 * wallet-present case needs a device that has one and is named as not measured
 * rather than assumed equivalent.
 *
 * Safety: `@trackd-qa.invalid` accounts, ledgered, deleted BY ID. No Stripe
 * objects are created — the Payment Element only needs a client secret, and the
 * screen is never submitted.
 */

let browser: Browser;
const ledger = new Ledger();

const WIDTHS = [
  { label: "390x844", width: 390, height: 844 },
  { label: "320x568", width: 320, height: 568 },
];

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

interface FoldReading {
  variantLine: string;
  viewportHeight: number;
  pageScrollable: boolean;
  scrollHeight: number;
  /** Bottom edge of each measured element, in page coordinates from the top. */
  bottoms: Record<string, number | null>;
  /** Which of them fall below the fold with the page at the top. */
  belowFold: string[];
  /** The nearest ancestor of the button that can actually scroll, if any. */
  scrollerInfo: { tag: string; cls: string; scrollH: number; clientH: number } | null;
  bodyOverflowY: string;
}

/**
 * Measure the disclosure and the button against the fold.
 *
 * ⚠️ IT ASSERTS THE PAGE IS AT THE TOP FIRST. Every number below is meaningless
 * if something has already scrolled — and an autofocused field inside the Stripe
 * iframe is exactly the sort of thing that scrolls a short screen.
 */
async function readFold(page: Page): Promise<FoldReading> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const scrollTop = window.scrollY;
    const vh = window.innerHeight;

    const paragraphs = Array.from(
      document.querySelectorAll<HTMLElement>("p"),
    ).filter((p) => /then renews until you cancel|then\s/.test(p.innerText));

    // The disclosure's two paragraphs: the one naming the amount, and the one
    // naming the first charge. Located by their SIGNED TEXT rather than by a
    // class, so a restyle in a later step cannot silently stop measuring them.
    const amountP =
      paragraphs.find((p) => /\/(yr|mo|wk)/.test(p.innerText)) ?? null;
    const chargeP =
      paragraphs.find((p) => /renews until you cancel/.test(p.innerText)) ?? null;

    const button =
      Array.from(document.querySelectorAll<HTMLElement>("button")).find((b) =>
        /start|subscribe|pay|confirm/i.test(b.innerText),
      ) ?? null;

    const bottomOf = (el: HTMLElement | null): number | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return Math.round(r.bottom + scrollTop);
    };

    const bottoms: Record<string, number | null> = {
      "fact 1+2 (length, amount)": bottomOf(amountP),
      "fact 3+4 (first charge, renews)": bottomOf(chargeP),
      button: bottomOf(button),
    };

    const belowFold = Object.entries(bottoms)
      .filter(([, b]) => b !== null && b > vh)
      .map(([k]) => k);

    /**
     * ⚠️ IS THE BUTTON REACHABLE AT ALL, OR ONLY BELOW THE FOLD?
     *
     * The first run measured the document as NOT scrollable (`scrollHeight`
     * equal to the viewport) while the button's bottom sat 286px past it. Those
     * two facts together mean the overflow is inside an inner container, and
     * whether that container scrolls is the difference between two completely
     * different findings: "the price can be scrolled out of view while paying"
     * (the audited disclosure defect) and "the button cannot be reached at all"
     * (a broken payment screen). Reporting the wrong one would be worse than
     * reporting neither, so the nearest scrollable ancestor is walked and named.
     */
    let scroller: HTMLElement | null = button;
    let scrollerInfo: { tag: string; cls: string; scrollH: number; clientH: number } | null = null;
    while (scroller && scroller !== document.body) {
      const st = getComputedStyle(scroller);
      const canScroll =
        /auto|scroll/.test(st.overflowY) && scroller.scrollHeight > scroller.clientHeight + 1;
      if (canScroll) {
        scrollerInfo = {
          tag: scroller.tagName.toLowerCase(),
          cls: scroller.className.toString().slice(0, 80),
          scrollH: scroller.scrollHeight,
          clientH: scroller.clientHeight,
        };
        break;
      }
      scroller = scroller.parentElement;
    }

    return {
      variantLine: amountP?.innerText ?? "(disclosure not found)",
      viewportHeight: vh,
      pageScrollable: document.documentElement.scrollHeight > vh + 1,
      scrollHeight: document.documentElement.scrollHeight,
      bottoms,
      belowFold,
      scrollerInfo,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
    };
  });
}

/** Sign in, pick a plan the way a user does, and land on the card screen. */
async function openCheckout(
  email: string,
  size: { width: number; height: number },
): Promise<Page> {
  const context = await browser.newContext({ viewport: size });
  await context.addCookies(await cookiesFor(email));
  const page = await context.newPage();

  await page.goto(`${BASE}/onboarding?step=plans`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  /**
   * The price list, then the plan, then the CTA. Driven rather than deep-linked,
   * because `selected` comes from the onboarding SESSION
   * (`priceFor(session.plan)`) and a deep link would measure a screen with no
   * plan on it and therefore no disclosure.
   *
   * ⚠️ TWO TAPS, NOT ONE. A driver fault cost a run here: `PlanRows`'s
   * `onSelect` only SELECTS (`paywall.tsx:388`), and a separate CTA advances
   * (`paywall.tsx:484`), whose label differs by variant — "Start my {n}-day free
   * trial" on the trial path and "Subscribe" otherwise. Clicking the plan alone
   * waits forever for a navigation nothing was going to perform.
   */
  await page.getByText(/\/\s*mo|month/i).first().click({ timeout: 60_000 });
  await page.waitForTimeout(500);
  await page
    .getByRole("button", { name: /free trial|Subscribe/i })
    .first()
    .click({ timeout: 60_000 });
  await page.waitForURL("**step=start*", { timeout: 120_000 });
  // The Payment Element is an iframe and takes a moment to mount. The layout is
  // not final until it has.
  await page.waitForSelector("iframe", { timeout: 120_000 });
  await page.waitForTimeout(6000);
  return page;
}

beforeAll(async () => {
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await ledger.teardown();
}, 300_000);

describe("09 Step 1 — baseline: are the four facts and the button above the fold?", () => {
  it("measures the TRIAL variant at both widths", async () => {
    const account = await seedAccount(ledger, "qa09-trial", { notificationsEnabled: false });

    for (const size of WIDTHS) {
      const page = await openCheckout(account.email, size);
      const r = await readFold(page);

      /* ── ⚠️ ARRIVAL: the disclosure is on screen and this is the variant ── */
      expect(
        r.variantLine,
        "the disclosure was never found, so every number here is meaningless",
      ).not.toBe("(disclosure not found)");

      console.log(
        `\n  === TRIAL @ ${size.label} ===\n` +
          `  variant line: ${JSON.stringify(r.variantLine)}\n` +
          `  viewport ${r.viewportHeight}px, page ${r.scrollHeight}px, scrollable=${r.pageScrollable}\n` +
          `  bottoms: ${JSON.stringify(r.bottoms)}\n` +
          `  BELOW THE FOLD: ${r.belowFold.length ? r.belowFold.join(", ") : "(none)"}\n` +
          `  scrollable ancestor of the button: ${JSON.stringify(r.scrollerInfo)}\n` +
          `  body overflow-y: ${r.bodyOverflowY}`,
      );

      await page.context().close();
    }
  }, 600_000);

  it("measures the PAID variant (returning customer, no trial) at both widths", async () => {
    const account = await seedAccount(ledger, "qa09-paid", { notificationsEnabled: false });
    /**
     * A returning customer: the trial lease is held into the future, which is
     * what `01` uses to refuse a second trial. The disclosure's first fact then
     * reads "Starts today" instead of "{n} days free".
     */
    const { error } = await admin.from("billing_customers").insert({
      user_id: account.id,
      stripe_customer_id: `cus_qa09_${Date.now()}`,
      trial_lock_until: new Date(Date.now() + 365 * 86_400_000).toISOString(),
    });
    if (error) throw new Error(`billing_customers: ${error.message}`);

    for (const size of WIDTHS) {
      const page = await openCheckout(account.email, size);
      const r = await readFold(page);
      expect(r.variantLine).not.toBe("(disclosure not found)");

      console.log(
        `\n  === PAID @ ${size.label} ===\n` +
          `  variant line: ${JSON.stringify(r.variantLine)}\n` +
          `  viewport ${r.viewportHeight}px, page ${r.scrollHeight}px, scrollable=${r.pageScrollable}\n` +
          `  bottoms: ${JSON.stringify(r.bottoms)}\n` +
          `  BELOW THE FOLD: ${r.belowFold.length ? r.belowFold.join(", ") : "(none)"}\n` +
          `  scrollable ancestor of the button: ${JSON.stringify(r.scrollerInfo)}\n` +
          `  body overflow-y: ${r.bodyOverflowY}`,
      );

      await page.context().close();
    }
  }, 600_000);

  it("measures the MID-GRACE variant, which §3.5 calls the tightest case", async () => {
    /**
     * ⚠️ §3.5: "The mid-grace variant is the tightest case and is measured
     * specifically. Its lines carry a DATE where the other variants carry the
     * word 'today', so it is the longest the disclosure ever gets."
     */
    const account = await seedAccount(ledger, "qa09-grace", {
      graceUntil: "2026-11-20T04:00:00.000Z",
      notificationsEnabled: false,
    });

    for (const size of WIDTHS) {
      const page = await openCheckout(account.email, size);
      const r = await readFold(page);
      expect(r.variantLine).not.toBe("(disclosure not found)");

      console.log(
        `\n  === MID-GRACE @ ${size.label} ===\n` +
          `  variant line: ${JSON.stringify(r.variantLine)}\n` +
          `  viewport ${r.viewportHeight}px, page ${r.scrollHeight}px, scrollable=${r.pageScrollable}\n` +
          `  bottoms: ${JSON.stringify(r.bottoms)}\n` +
          `  BELOW THE FOLD: ${r.belowFold.length ? r.belowFold.join(", ") : "(none)"}\n` +
          `  scrollable ancestor of the button: ${JSON.stringify(r.scrollerInfo)}\n` +
          `  body overflow-y: ${r.bodyOverflowY}`,
      );

      await page.context().close();
    }
  }, 600_000);
});

/* ══════════════════════════════════════════════════════════════════════════
   09 STEPS 3 AND 4 — THE ELEMENT'S OWN COMPUTED STYLES
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ READ THE LIVE IFRAME, NOT THE APPEARANCE OBJECT.
 *
 * `09` Step 3: "read the live iframe's computed styles and confirm the real token
 * values are applied, rather than judging from a screenshot." Step 4 wants the
 * same for the tab. And §3.3 carries the reason it matters: **"A selector that
 * does not exist is ignored silently."** An appearance rule can be perfectly
 * spelled, committed, reviewed, and do nothing at all — so the only evidence worth
 * having is what the rendered control actually computes.
 *
 * This is also the check that tells us whether the tab rules are REACHABLE: the
 * Element is in `accordion` layout with wallets suppressed and card as the only
 * method (`payment-sheet.tsx:442-446`), so if no `.Tab` renders, `.Tab--selected`
 * is dead configuration rather than a fixed violation.
 */
describe("09 Steps 3 and 4 — what the Element actually computes", () => {
  it("reports the Tab and Input computed styles from inside the frame", async () => {
    const account = await seedAccount(ledger, "qa09-styles", { notificationsEnabled: false });
    const page = await openCheckout(account.email, { width: 390, height: 844 });

    const frames = page.frames().filter((f) => /stripe/i.test(f.url()));
    console.log(`\n  stripe frames: ${frames.length}`);
    expect(frames.length, "no Stripe frame, so nothing below is measurable").toBeGreaterThan(0);

    let sawAnyTab = false;
    for (const f of frames) {
      const found = await f
        .evaluate(() => {
          const pick = (el: Element | null) => {
            if (!el) return null;
            const s = getComputedStyle(el);
            return {
              borderColor: s.borderColor,
              borderWidth: s.borderWidth,
              color: s.color,
              backgroundColor: s.backgroundColor,
              borderRadius: s.borderRadius,
              fontFamily: s.fontFamily.slice(0, 40),
            };
          };
          const tabs = Array.from(document.querySelectorAll(".Tab"));
          const selected =
            document.querySelector(".Tab--selected") ??
            tabs.find((t) => t.className.includes("selected")) ??
            null;
          const icon =
            document.querySelector(".Tab--selected .TabIcon") ??
            document.querySelector(".TabIcon--selected") ??
            null;
          return {
            tabCount: tabs.length,
            blockCount: document.querySelectorAll(".Block").length,
            inputCount: document.querySelectorAll(".Input").length,
            selectedTab: pick(selected),
            selectedIcon: pick(icon),
            firstInput: pick(document.querySelector(".Input")),
            label: pick(document.querySelector(".Label")),
          };
        })
        .catch(() => null);
      if (!found) continue;
      if (found.tabCount > 0 || found.inputCount > 0 || found.blockCount > 0) {
        sawAnyTab = sawAnyTab || found.tabCount > 0;
        console.log(`  frame ${f.url().slice(0, 60)}...`);
        console.log(`  ${JSON.stringify(found, null, 2)}`);
      }
    }

    /**
     * No assertion on the colours here. This test's job is to REPORT what the
     * Element computes so Step 4's fix can be aimed and then re-checked; pinning
     * a colour before knowing whether the selector renders at all would be
     * pinning a guess.
     */
    console.log(`  any .Tab rendered anywhere: ${sawAnyTab}`);

    /**
     * ⚠️ THE CONTROL FOR STEP 4, and Step 4's verify line asks for it by name:
     * "the selected tab is not amber, **the input focus ring still is**".
     *
     * Without this, a fix that stripped the accent from everything — or simply
     * removed the amber token — would satisfy the not-amber half perfectly. The
     * accent is meant to survive on FOCUS and only lose selection.
     */
    for (const f of frames) {
      const ring = await f
        .evaluate(async () => {
          const input = document.querySelector<HTMLElement>(".Input");
          if (!input) return null;
          const field = input.querySelector<HTMLElement>("input") ?? input;
          field.focus();
          await new Promise((r) => setTimeout(r, 300));
          const focused = document.querySelector<HTMLElement>(".Input--focus") ?? input;
          const s = getComputedStyle(focused);
          return {
            matchedFocusClass: Boolean(document.querySelector(".Input--focus")),
            borderColor: s.borderColor,
            boxShadow: s.boxShadow,
          };
        })
        .catch(() => null);
      if (ring) {
        console.log(`  FOCUS RING: ${JSON.stringify(ring)}`);
        break;
      }
    }

    await page.context().close();
  }, 600_000);
});

/* ══════════════════════════════════════════════════════════════════════════
   09 STEP 5 — THE HEIGHT BUDGET, so the stop-and-ask has numbers in it
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ THIS DOES NOT MOVE THE DISCLOSURE. It measures why it cannot be moved yet.
 *
 * §3.5: "If the four facts cannot be kept on screen below the button at 320x568,
 * say so and ask. Do not shrink a fact out of legibility, do not drop one, and do
 * not move one back above the button unilaterally."
 *
 * Step 1's baseline already shows all four facts and the button BELOW the fold at
 * 320x568 with the disclosure still ABOVE the button — so moving it below can only
 * push it further down. The condition to stop and ask is met before the change.
 *
 * "It does not fit" is a weak thing to hand somebody, though. This breaks the
 * scroll port's content into its parts so the question becomes "here is the
 * budget, here is what would have to give", which is answerable.
 */
describe("09 Step 5 — the height budget at 320x568", () => {
  it("breaks down what fills the scroll port", async () => {
    const account = await seedAccount(ledger, "qa09-budget", {
      graceUntil: "2026-11-20T04:00:00.000Z",
      notificationsEnabled: false,
    });
    const page = await openCheckout(account.email, { width: 320, height: 568 });

    const budget = await page.evaluate(() => {
      const port = Array.from(document.querySelectorAll<HTMLElement>("div")).find((d) =>
        d.className.includes("flow-scroll-fade"),
      );
      if (!port) return null;

      /**
       * ⚠️ DESCEND PAST WRAPPERS. The port's only child is a full-height column,
       * so listing one level reports "670px, one div" and answers nothing. Walk
       * down while a node is the sole child carrying its parent's whole height.
       */
      let level: HTMLElement = port;
      for (let i = 0; i < 6; i += 1) {
        const kids = Array.from(level.children) as HTMLElement[];
        if (kids.length !== 1) break;
        level = kids[0];
      }
      const rows = Array.from(level.children).map((c) => {
        const el = c as HTMLElement;
        return {
          height: Math.round(el.getBoundingClientRect().height),
          tag: el.tagName.toLowerCase(),
          text: el.innerText.replace(/\s+/g, " ").slice(0, 54),
        };
      });

      const iframes = Array.from(document.querySelectorAll("iframe")).map((f) =>
        Math.round(f.getBoundingClientRect().height),
      );

      return {
        portClientHeight: port.clientHeight,
        portScrollHeight: port.scrollHeight,
        overflow: port.scrollHeight - port.clientHeight,
        rows,
        iframeHeights: iframes.filter((h) => h > 0),
      };
    });

    expect(budget, "the scroll port was not found, so there is no budget to report").not.toBeNull();
    console.log(`\n  === 320x568 HEIGHT BUDGET (mid-grace, the tightest variant) ===`);
    console.log(`  port ${budget!.portClientHeight}px visible, ${budget!.portScrollHeight}px of content`);
    console.log(`  ⚠️ OVERFLOW TO RECLAIM: ${budget!.overflow}px`);
    for (const r of budget!.rows) {
      console.log(`    ${String(r.height).padStart(4)}px  <${r.tag}>  ${JSON.stringify(r.text)}`);
    }
    console.log(`  visible iframe heights: ${JSON.stringify(budget!.iframeHeights)}`);

    await page.context().close();
  }, 600_000);
});
