/**
 * ⚠️ THE ORDER, PROVEN BY BREAKING EACH STEP.
 *
 * `16-account-deletion.md` §5 does not ask whether the four steps exist in the
 * right order — it asks that a failure at each one stops everything after it and
 * leaves the account recoverable. A happy-path test cannot show that. So every
 * step is broken in turn and what matters is what did NOT run.
 *
 * The recoverable direction is the whole point of §3.2's ordering:
 *
 *     cancelled but not deleted   -> a person with no subscription, data intact
 *     deleted but not cancelled   -> a person being billed with nothing in the
 *                                    database connecting the charge to them
 *
 * The first is a support email. The second is a chargeback nobody can trace.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

import {
  deleteAccountFor,
  DELETION_ORDER,
  type DeletionStep,
  type DeletionSteps,
} from "./deleteAccount";

const USER = "11111111-2222-4333-8444-555555555555";

/** Records what actually ran, and can be told to fail at one named step. */
function recorder(failAt?: DeletionStep, failWith = "boom") {
  const ran: DeletionStep[] = [];
  const step = (name: DeletionStep) => async () => {
    if (name === failAt) throw new Error(failWith);
    ran.push(name);
  };
  const steps: DeletionSteps = {
    cancelStripe: step("cancel-stripe"),
    sweepStorage: step("sweep-storage"),
    deleteRows: step("delete-rows"),
    deleteAuthUser: step("delete-auth-user"),
  };
  return { ran, steps };
}

describe("the happy path", () => {
  it("runs all four, in the spec's order", async () => {
    const { ran, steps } = recorder();
    const out = await deleteAccountFor(USER, steps);

    expect(out).toEqual({ ok: true, stepsRun: [...DELETION_ORDER] });
    expect(ran).toEqual(["cancel-stripe", "sweep-storage", "delete-rows", "delete-auth-user"]);
  });

  it("⚠️ Stripe is cancelled BEFORE anything is deleted", async () => {
    const { ran, steps } = recorder();
    await deleteAccountFor(USER, steps);
    expect(ran.indexOf("cancel-stripe")).toBeLessThan(ran.indexOf("delete-rows"));
    expect(ran.indexOf("cancel-stripe")).toBeLessThan(ran.indexOf("sweep-storage"));
  });

  it("⚠️ storage objects go BEFORE any database row — the rows are the map", async () => {
    const { ran, steps } = recorder();
    await deleteAccountFor(USER, steps);
    expect(ran.indexOf("sweep-storage")).toBeLessThan(ran.indexOf("delete-rows"));
  });

  it("the auth user is removed LAST", async () => {
    const { ran, steps } = recorder();
    await deleteAccountFor(USER, steps);
    expect(ran[ran.length - 1]).toBe("delete-auth-user");
  });
});

describe("⚠️ BREAKING EACH STEP — nothing after it may run", () => {
  it("a failed CANCELLATION stops the deletion entirely, account intact", async () => {
    const { ran, steps } = recorder("cancel-stripe", "stripe is down");
    const out = await deleteAccountFor(USER, steps);

    expect(out).toMatchObject({ ok: false, failedAt: "cancel-stripe", error: "stripe is down" });
    // Nothing at all was destroyed. This is the state the ordering exists for.
    expect(ran).toEqual([]);
    expect(out.ok === false && out.stepsRun).toEqual([]);
  });

  it("a failed SWEEP stops the row delete, account intact", async () => {
    const { ran, steps } = recorder("sweep-storage");
    const out = await deleteAccountFor(USER, steps);

    expect(out).toMatchObject({ ok: false, failedAt: "sweep-storage" });
    // ⚠️ Cancelled, but the rows and the auth user survive - so the person still
    // has their account and their data, and only their subscription has ended.
    expect(ran).toEqual(["cancel-stripe"]);
    expect(ran).not.toContain("delete-rows");
    expect(ran).not.toContain("delete-auth-user");
  });

  it("a failed ROW DELETE stops the auth-user delete", async () => {
    const { ran, steps } = recorder("delete-rows");
    const out = await deleteAccountFor(USER, steps);

    expect(out).toMatchObject({ ok: false, failedAt: "delete-rows" });
    expect(ran).toEqual(["cancel-stripe", "sweep-storage"]);
    expect(ran).not.toContain("delete-auth-user");
  });

  it("a failed AUTH-USER delete is reported rather than swallowed", async () => {
    const { ran, steps } = recorder("delete-auth-user");
    const out = await deleteAccountFor(USER, steps);

    expect(out).toMatchObject({ ok: false, failedAt: "delete-auth-user" });
    expect(ran).toEqual(["cancel-stripe", "sweep-storage", "delete-rows"]);
  });

  it.each([...DELETION_ORDER])("failing at %s never reports ok", async (failAt) => {
    const { steps } = recorder(failAt);
    const out = await deleteAccountFor(USER, steps);
    expect(out.ok).toBe(false);
  });

  it("⚠️ stepsRun EXCLUDES the step that failed", async () => {
    // The caller uses this to tell the user what was destroyed. Counting a
    // failed step as run would say the sweep happened when it did not.
    const { steps } = recorder("sweep-storage");
    const out = await deleteAccountFor(USER, steps);
    expect(out.ok === false && out.stepsRun).not.toContain("sweep-storage");
  });
});

describe("a retry after a partial failure completes cleanly", () => {
  it("resumes and finishes when the broken step recovers", async () => {
    const first = recorder("sweep-storage");
    expect((await deleteAccountFor(USER, first.steps)).ok).toBe(false);
    expect(first.ran).toEqual(["cancel-stripe"]);

    // Storage is back. Every step is idempotent, so the retry re-runs the cancel
    // (which now finds nothing billable) and carries on through.
    const second = recorder();
    const out = await deleteAccountFor(USER, second.steps);

    expect(out).toEqual({ ok: true, stepsRun: [...DELETION_ORDER] });
    expect(second.ran).toEqual([...DELETION_ORDER]);
  });
});

describe("⚠️ BY ID ONLY", () => {
  it.each(["", "%", "*", "a@b.com", "trackd-qa.invalid", "11111111-2222-4333-8444-55555555555"])(
    "refuses %j without running a single step",
    async (bad) => {
      const { ran, steps } = recorder();
      await expect(deleteAccountFor(bad, steps)).rejects.toThrow(/bare UUID/);
      expect(ran).toEqual([]);
    },
  );
});

/**
 * ⚠️ SOURCE ASSERTIONS ON THE PUBLIC ENDPOINT.
 *
 * `app/(app)/profile/delete-account-action.ts` is a `"use server"` module, so
 * every export is a dispatchable HTTP endpoint. These pin the three properties
 * that make that safe, because none of them can be exercised from this pure-lib
 * suite — the module's imports (`next/navigation`, the cookie-bound Supabase
 * client) do not run here. Same shape and same reasoning as
 * `deleteIsNeverGated.test.ts`.
 */
describe("the server action", () => {
  const path = "app/(app)/profile/delete-account-action.ts";
  const raw = readFileSync(path, "utf8");

  /**
   * ⚠️ COMMENTS STRIPPED, AND THAT IS THE POINT OF THIS HELPER.
   *
   * These assertions are about what the module DOES. Run against the raw file
   * they fail on their own documentation — this file explains that it uses
   * `getUser()` and not `getSession()`, that it is not gated by `canWriteData`,
   * and that it lands with no `?next=`, so every one of those greps hit the
   * prose describing the correct behaviour.
   *
   * The wrong repair is to reword the comments until a grep passes, which makes
   * the documentation worse to keep a test green and leaves the test asserting
   * something it was never about.
   */
  const source = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("has EXACTLY ONE export", () => {
    // A second export here is a second public endpoint, and the helpers this
    // flow attracts are exactly the ones that would take a user id.
    const exports = source.match(/^export\s+(async\s+)?function\s+(\w+)/gm) ?? [];
    expect(exports).toHaveLength(1);
    expect(exports[0]).toContain("deleteMyAccount");
  });

  it("⚠️ TAKES NO USER ID", () => {
    expect(source).toMatch(/export async function deleteMyAccount\(\s*confirmation: string,?\s*\)/);
    // Nothing resembling an id may be a parameter.
    const signature = source.slice(
      source.indexOf("export async function deleteMyAccount"),
      source.indexOf("): Promise<"),
    );
    expect(signature).not.toMatch(/userId|user_id|accountId|id:/);
  });

  it("resolves the account from the verified session, not from an argument", () => {
    expect(source).toContain("supabase.auth.getUser()");
    expect(source).not.toContain("getSession()");
    expect(source).toContain("deleteAccountFor(user.id)");
  });

  it("⚠️ IS NOT GATED — a lapsed user can always leave", () => {
    // 05 exempts this whole flow. A future session tidying a gate call in here
    // would turn the exit into data held hostage.
    expect(source).not.toContain("canWriteData");
    expect(source).not.toContain("refuseWrite");
    expect(source).not.toContain("requireWriteAccess");
  });

  it("checks the confirmation phrase server-side, exactly", () => {
    expect(source).toContain('const CONFIRMATION = "DELETE"');
    expect(source).toMatch(/confirmation !== CONFIRMATION/);
    // No case folding: `delete` must not pass.
    expect(source).not.toMatch(/confirmation\.(toUpperCase|toLowerCase|trim)\(\)/);
  });

  it("signs out only AFTER a successful deletion, then lands on the homepage", () => {
    const signOutAt = source.indexOf("supabase.auth.signOut()");
    const failureReturn = source.indexOf("if (!outcome.ok)");
    expect(signOutAt).toBeGreaterThan(failureReturn);
    expect(source).toContain('redirect("/")');
    // Not /login, and no destination carried into it.
    expect(source).not.toMatch(/redirect\("\/login/);
    expect(source).not.toContain("?next=");
  });
});
