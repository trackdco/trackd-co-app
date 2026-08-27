import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ⚠️ D79's GUARD, AND THE DIRECTION IT FAILS IN (1.2). CRITICAL.
 *
 * The guard refusing a save offer to a free-for-life comp read
 * `currentEntitlement()`, which answered `null` both for "not a comp" and for
 * "the entitlements table would not answer". Only the first is a reason to
 * continue. On a failed read the guard **stepped aside**, the offer was shown,
 * and accepting it LIFTS the cancellation and re-arms a real charge — on
 * somebody promised in writing they would never be charged, who read D78's
 * "your free access carries on as it always has" one screen earlier.
 *
 * Standing Law 1 makes the direction non-negotiable: nobody is ever charged
 * after being told they would not be. A read that failed cannot rule out that
 * this is that person.
 *
 * ## ⚠️ WHY THESE ARE SOURCE ASSERTIONS, AND WHAT THAT DOES NOT PROVE
 *
 * `offerAfterCancel` lives in a `"use server"` module reached through
 * `next/headers`; it cannot be called from this pure `lib/**` suite, and mocking
 * `cookies()`, the Supabase server client and Stripe wholesale would be testing
 * the mock. The house already uses this shape where the risk is a silent
 * OMISSION rather than a wrong answer — see `failureDirections.test.ts` and
 * `deleteIsNeverGated.test.ts`, which pin the same class of rule the same way.
 *
 * **This proves the refusal is written and correctly ordered. It does not prove
 * it executes.** Before 1.2 there was no test of this guard at all, in either
 * direction, which is how a `null` meaning two things survived beneath it.
 *
 * ⚠️ AND EVERY ASSERTION RUNS AGAINST CODE WITH THE COMMENTS STRIPPED. This
 * function carries long comments that legitimately NAME the calls they explain —
 * `markOfferShown`, `currentEntitlement` — and a raw substring test reads those
 * as the code. That is exactly the defect item 5.5 records about `graceCopyPin`,
 * and it is not repeated here.
 */

const SOURCE = "app/(app)/billing/actions.ts";
const source = readFileSync(SOURCE, "utf8");

/** The body of a named function, up to the next top-level declaration. */
function bodyOf(name: string): string {
  const start = source.search(new RegExp(`^(export )?(async )?function ${name}\\(`, "m"));
  expect(start, `${name} not found in ${SOURCE} — was it renamed?`).toBeGreaterThan(-1);
  const rest = source.slice(start + 1);
  const next = rest.search(/^(export )?(async )?function /m);
  return next === -1 ? rest : rest.slice(0, next);
}

const codeOnly = (body: string) =>
  body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("⚠️ the save-offer guard refuses on an UNREADABLE entitlement read", () => {
  const body = codeOnly(bodyOf("offerAfterCancel"));

  it("⚠️ CONTROL: the comment-stripped body is not empty and still holds the guard", () => {
    // Without this, a renamed function or a regex that matched nothing would make
    // every assertion below vacuous — the exact shape 5.5 is about.
    expect(body.length).toBeGreaterThan(200);
    expect(body).toContain("entitlementFacts");
    expect(body).toContain("markOfferShown");
  });

  it("asks whether the read WORKED, and returns rather than continuing", () => {
    const at = body.search(/if \(!access\.known\)/);
    expect(at, "the unreadable-read guard is not present at all").toBeGreaterThan(-1);
    /**
     * Sliced to THIS branch only — up to the next `if (` — rather than matched
     * with a wide `[\s\S]{0,N}` window, which would happily find a
     * `return undefined;` belonging to some later guard and call it a pass.
     */
    const rest = body.slice(at + 4);
    const next = rest.search(/\bif \(/);
    const branch = next === -1 ? rest : rest.slice(0, next);
    expect(branch).toContain("return undefined;");
  });

  it("⚠️ still refuses a free-for-life comp — the fix did not replace one guard with another", () => {
    expect(body).toMatch(/entitlement\?\.source === "comp" && entitlement\.activeUntil === null/);
  });

  it("⚠️ BOTH refusals sit ABOVE markOfferShown, so neither burns the once-ever flag", () => {
    // The ordering IS the guarantee. A check below this write would refuse the
    // offer and consume it in the same breath.
    const burn = body.indexOf("markOfferShown");
    const unreadable = body.search(/if \(!access\.known\)/);
    const comp = body.indexOf('entitlement?.source === "comp"');
    expect(burn, "markOfferShown not found — was it renamed?").toBeGreaterThan(-1);
    expect(unreadable, "the unreadable-read refusal is missing").toBeGreaterThan(-1);
    expect(comp, "the comp refusal is missing").toBeGreaterThan(-1);
    expect(unreadable).toBeLessThan(burn);
    expect(comp).toBeLessThan(burn);
  });

  it("⚠️ no longer reads a collapsing entitlement helper at all", () => {
    // currentEntitlement and entitlementEndDate are gone from the codebase (1.1).
    // If either returns, this guard is the first place it would do damage.
    expect(body).not.toContain("currentEntitlement");
    expect(body).not.toContain("listEntitlements");
  });
});
