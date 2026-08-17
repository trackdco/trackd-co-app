import { describe, expect, it } from "vitest";

import { buildReport, exitCodeFor, renderReport } from "./report";
import type { Finding, ReconcileSnapshot } from "./types";
import { RULES } from "./types";

/**
 * STEP 3's VERIFY — "run it against deliberately broken seeded state and read the
 * output cold. If it takes more than ten seconds to understand, it is wrong."
 *
 * A test cannot measure ten seconds, so it measures the properties that make ten
 * seconds possible: the verdict is on the first screen, the account comes before
 * the evidence, one rule with hundreds of findings does not bury the rule above
 * it, and the word "clean" is unreachable unless the run really was.
 */

const RAN_AT = "2026-09-10T12:00:00.000Z";

function snapshot(over: Partial<ReconcileSnapshot> = {}): ReconcileSnapshot {
  return {
    mode: "live",
    now: new Date(RAN_AT),
    subscriptions: [],
    invoices: [],
    stripeCustomers: [],
    entitlements: [],
    customers: [],
    unstampedWebhooks: [],
    activePriceIds: ["price_1"],
    alertDevices: 1,
    completeness: { truncated: [], failed: [] },
    ...over,
  };
}

function finding(over: Partial<Finding> = {}): Finding {
  return {
    rule: "charge-inside-grace",
    account: { userId: "user-1", stripeCustomerId: "cus_1" },
    evidence: ["subscription sub_1 (trialing)", "invoice in_1 took 69.99 AUD"],
    ...over,
  };
}

describe("a clean run", () => {
  const report = buildReport(snapshot(), [], RAN_AT);

  it("says clean plainly, and says it early", () => {
    const text = renderReport(report);
    expect(report.status).toBe("clean");
    expect(text).toContain("CLEAN. Nothing to act on.");
    // On the first screen: within the first handful of lines, not buried.
    expect(text.split("\n").findIndex((l) => l.includes("CLEAN"))).toBeLessThan(5);
  });

  it("states the mode and what it checked, so `clean` has a size attached", () => {
    const text = renderReport(report);
    expect(text).toContain("LIVE MODE");
    expect(text).toContain("checked");
    expect(text).toContain("entitlements");
  });

  it("names how many rules ran, so a rule quietly not running is visible", () => {
    expect(renderReport(report)).toContain(`All ${RULES.length} rules ran`);
  });

  it("exits 0", () => {
    expect(exitCodeFor(report.status)).toBe(0);
  });
});

describe("⚠️ a test-mode run is never evidence for a live conclusion (§3.2)", () => {
  it("says so BEFORE the verdict, so skimming for `CLEAN` cannot miss it", () => {
    const text = renderReport(buildReport(snapshot({ mode: "test" }), [], RAN_AT));
    const lines = text.split("\n");
    const warning = lines.findIndex((l) => l.includes("TEST MODE"));
    const clean = lines.findIndex((l) => l.includes("CLEAN"));
    expect(warning).toBeGreaterThanOrEqual(0);
    expect(warning).toBeLessThan(clean);
  });
});

describe("a dirty run", () => {
  const report = buildReport(snapshot(), [finding()], RAN_AT);
  const text = renderReport(report);

  it("never says clean", () => {
    expect(report.status).toBe("dirty");
    expect(text).not.toContain("CLEAN");
  });

  /** §3.5's order: the account is what a person acts on. */
  it("puts the account BEFORE the evidence", () => {
    const lines = text.split("\n");
    const account = lines.findIndex((l) => l.includes("user-1"));
    const evidence = lines.findIndex((l) => l.includes("invoice in_1"));
    expect(account).toBeGreaterThanOrEqual(0);
    expect(account).toBeLessThan(evidence);
  });

  it("names the rule and the spec it came from", () => {
    expect(text).toContain("CHARGED INSIDE A PROMISED FREE PERIOD");
    expect(text).toContain("§3.1 #6");
  });

  it("is not a wall of JSON", () => {
    expect(text).not.toContain("{");
    expect(text).not.toContain('"rule":');
  });

  it("exits 1", () => {
    expect(exitCodeFor(report.status)).toBe(1);
  });
});

describe("worst first (§3.5)", () => {
  it("puts a wrong charge above a missing alert device", () => {
    const report = buildReport(
      snapshot(),
      [
        finding({ rule: "no-alert-device-subscribed", account: null, evidence: ["none"] }),
        finding({ rule: "charge-inside-grace" }),
      ],
      RAN_AT,
    );
    const text = renderReport(report);
    expect(text.indexOf("CHARGED INSIDE A PROMISED FREE PERIOD")).toBeLessThan(
      text.indexOf("NO FOUNDER DEVICE"),
    );
  });
});

describe("counted, not flooded (§3.5)", () => {
  const many = Array.from({ length: 300 }, (_, i) =>
    finding({
      rule: "webhook-unattributed",
      account: { userId: null, stripeCustomerId: `cus_${i}` },
      evidence: [`evt_${i}`],
    }),
  );
  const report = buildReport(snapshot(), [finding(), ...many], RAN_AT);
  const text = renderReport(report);

  it("says three hundred rather than printing three hundred lines", () => {
    expect(text).toContain("(300)");
    expect(text).toContain("and 297 more of the same. Not printed.");
    expect(text.split("\n").length).toBeLessThan(30);
  });

  /**
   * ⚠️ FOUND BY RENDERING IT AND LOOKING, NOT BY A TEST.
   *
   * A flat cap of ten printed 148 unattributable webhooks as ten four-line
   * entries — fifty lines of near-identical text that pushed two real findings
   * off the bottom of the screen. That is §3.5's flood arriving *under* the cap
   * meant to stop it. A large group now shows three examples and a count.
   */
  it("samples a large group rather than printing ten of the same thing", () => {
    const printed = text
      .split("\n")
      .filter((l) => l.includes("account  user UNKNOWN")).length;
    expect(printed).toBe(3);
  });

  /**
   * ⚠️ THE POINT OF THE CAP. A flood of one rule must not push the worst rule off
   * the screen — that is how a wrong charge gets missed under three hundred
   * webhook rows.
   */
  it("does not let the flood bury the worse rule above it", () => {
    expect(text.indexOf("CHARGED INSIDE A PROMISED FREE PERIOD")).toBeLessThan(
      text.indexOf("COULD NOT TIE TO AN ACCOUNT"),
    );
  });

  it("keeps every finding in the report object, so 14 and JSON still see them all", () => {
    expect(report.findings).toHaveLength(301);
  });
});

describe("⚠️ incomplete never reports clean (§3.2, §3.9)", () => {
  it("a truncated sweep is incomplete even with zero findings", () => {
    const report = buildReport(
      snapshot({ completeness: { truncated: ["subscriptions: more than 5000"], failed: [] } }),
      [],
      RAN_AT,
    );
    const text = renderReport(report);
    expect(report.status).toBe("incomplete");
    expect(text).not.toContain("CLEAN");
    expect(text).toContain("NOT EVIDENCE THAT ANYTHING IS FINE");
    expect(text).toContain("known to be partial");
  });

  it("a failed read is incomplete too, and names what could not be read", () => {
    const report = buildReport(
      snapshot({ completeness: { truncated: [], failed: ["entitlements: timeout"] } }),
      [],
      RAN_AT,
    );
    expect(report.status).toBe("incomplete");
    expect(renderReport(report)).toContain("entitlements: timeout");
  });

  /**
   * Incomplete outranks dirty: the finding list is known to be partial, so
   * "here are the 3 problems" would be a claim this run cannot support. The
   * findings are still printed — they are true, just not all of them.
   */
  it("outranks dirty, and still prints the findings it did get", () => {
    const report = buildReport(
      snapshot({ completeness: { truncated: [], failed: ["invoices: 500"] } }),
      [finding()],
      RAN_AT,
    );
    const text = renderReport(report);
    expect(report.status).toBe("incomplete");
    expect(text).toContain("The list is partial");
    expect(text).toContain("user-1");
  });

  /**
   * §12's "twice clean" gate rests on this. A run that could not see everything
   * must not satisfy a gate that means "we looked and it was fine".
   */
  it("exits 2, so it cannot satisfy a twice-clean gate", () => {
    expect(exitCodeFor("incomplete")).toBe(2);
    expect(exitCodeFor("incomplete")).not.toBe(exitCodeFor("clean"));
  });
});

describe("every rule has a title and a source", () => {
  /**
   * A rule added to `RULES` without a title would render as `undefined` in the
   * report — the finding would be there and unreadable, which for a report whose
   * entire value is being read is the same as not firing.
   */
  it("renders a real heading for every rule in RULES", () => {
    const report = buildReport(
      snapshot(),
      RULES.map((rule) => finding({ rule })),
      RAN_AT,
    );
    const text = renderReport(report);
    expect(text).not.toContain("undefined");
    for (const rule of RULES) {
      expect(text.toLowerCase()).not.toContain(`${rule} (`);
    }
    expect(text.match(/━━/g) ?? []).toHaveLength(RULES.length);
  });
});
