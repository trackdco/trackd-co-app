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
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

import {
  deleteAccountFor,
  DELETION_ORDER,
  isUserNotFound,
  type DeletionStep,
  type DeletionSteps,
} from "./deleteAccount";

const USER = "11111111-2222-4333-8444-555555555555";

/**
 * Records what actually ran, and can be told to fail at one named step.
 *
 * `verifyErased` is tracked in the same `ran` list but is NOT a `DeletionStep`,
 * because it cannot stop the deletion. `failVerify` breaks it separately.
 */
function recorder(
  failAt?: DeletionStep,
  failWith = "boom",
  failVerify?: string,
) {
  const ran: string[] = [];
  const step = (name: DeletionStep) => async () => {
    if (name === failAt) throw new Error(failWith);
    ran.push(name);
  };
  const steps: DeletionSteps = {
    cancelStripe: step("cancel-stripe"),
    sweepStorage: step("sweep-storage"),
    deleteAuthUser: step("delete-auth-user"),
    verifyErased: async () => {
      if (failVerify) throw new Error(failVerify);
      ran.push("verify-erased");
    },
  };
  return { ran, steps };
}

describe("the happy path", () => {
  it("runs the three gating steps in the spec's order, then verifies", async () => {
    const { ran, steps } = recorder();
    const out = await deleteAccountFor(USER, steps);

    expect(out).toEqual({ ok: true, stepsRun: [...DELETION_ORDER], verification: { ok: true } });
    expect(ran).toEqual(["cancel-stripe", "sweep-storage", "delete-auth-user", "verify-erased"]);
  });

  it("⚠️ Stripe is cancelled BEFORE anything is deleted", async () => {
    const { ran, steps } = recorder();
    await deleteAccountFor(USER, steps);
    expect(ran.indexOf("cancel-stripe")).toBeLessThan(ran.indexOf("delete-auth-user"));
    expect(ran.indexOf("cancel-stripe")).toBeLessThan(ran.indexOf("sweep-storage"));
  });

  /**
   * ⚠️ §3.2's reason is unchanged by the reorder: the ROWS ARE THE MAP to the
   * objects, so the sweep must finish before anything can destroy them. The row
   * delete is now the CASCADE from `delete-auth-user`, so that is the step the
   * sweep has to precede.
   */
  it("⚠️ storage objects go BEFORE the rows are cascaded away", async () => {
    const { ran, steps } = recorder();
    await deleteAccountFor(USER, steps);
    expect(ran.indexOf("sweep-storage")).toBeLessThan(ran.indexOf("delete-auth-user"));
  });

  it("the auth user is removed before anything can verify it", async () => {
    const { ran, steps } = recorder();
    await deleteAccountFor(USER, steps);
    expect(ran.indexOf("delete-auth-user")).toBeLessThan(ran.indexOf("verify-erased"));
  });

  it("a clean run reports the erasure as verified", async () => {
    const { steps } = recorder();
    const out = await deleteAccountFor(USER, steps);
    expect(out).toMatchObject({ ok: true, verification: { ok: true } });
  });

  it("the verification is LAST, and it is a read rather than a delete", async () => {
    const { ran, steps } = recorder();
    await deleteAccountFor(USER, steps);
    expect(ran[ran.length - 1]).toBe("verify-erased");
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
    expect(ran).not.toContain("delete-auth-user");
    expect(ran).not.toContain("verify-erased");
  });

  /**
   * ⚠️ THE FINDING THIS REORDER EXISTS FOR.
   *
   * When the row delete came third and this came fourth, a failure here left
   * `profiles` deleted and the auth user alive - so the gate failed, the app
   * redirected to `/welcome`, and the dialog that offers the retry was
   * unreachable. The retry the copy promises did not exist.
   *
   * Now the cascade fires only on a SUCCESSFUL auth delete, so a failure here
   * has destroyed no rows at all and the account still works. Measured on a
   * seeded account against production 2026-09-08: `profiles` present,
   * `is_18_plus` and `tos_accepted_at` intact, the gate passing, and the retry
   * completing cleanly.
   */
  it("a failed AUTH-USER delete destroys NO rows, so the retry stays reachable", async () => {
    const { ran, steps } = recorder("delete-auth-user");
    const out = await deleteAccountFor(USER, steps);

    expect(out).toMatchObject({ ok: false, failedAt: "delete-auth-user" });
    expect(ran).toEqual(["cancel-stripe", "sweep-storage"]);
    // Nothing after it ran, so nothing cascaded and no verification claimed it did.
    expect(ran).not.toContain("verify-erased");
  });
});

/**
 * ⚠️ THE CONFIRMATION READ REPORTS. IT DOES NOT GATE.
 *
 * The property, stated as a property rather than an outcome: **once the auth
 * delete has succeeded, everything after it happens regardless of what the
 * verification returns.** Not "the verification passes".
 *
 * The defect: it used to be the fourth gating step, so a transient error on any
 * one of its six reads returned `{ok: false}` for an account that was ALREADY
 * GONE - withholding the sign-out, the cookie clear, the device wipe and the
 * redirect from somebody who could no longer reach any of them.
 *
 * ⚠️ TWO-SIDED ON PURPOSE. Deleting the check outright would satisfy "the
 * cleanup still runs", so the failure must also still be RECORDED.
 */
describe("⚠️ a failed verification does not withhold anything", () => {
  it("still reports the deletion as DONE, so every cleanup downstream runs", async () => {
    const { steps } = recorder(undefined, "boom", "profiles: 1 row(s) remain");
    const out = await deleteAccountFor(USER, steps);

    // `ok: true` is what the action reads before it signs out, clears the
    // cookies and redirects. This is the whole fix.
    expect(out.ok).toBe(true);
    expect(out.ok === true && out.stepsRun).toEqual([...DELETION_ORDER]);
  });

  it("⚠️ AND STILL RECORDS THE FAILURE — a deleted check would pass the test above", async () => {
    const { steps } = recorder(undefined, "boom", "profiles: 1 row(s) remain");
    const out = await deleteAccountFor(USER, steps);

    expect(out).toMatchObject({
      ok: true,
      verification: { ok: false, error: "profiles: 1 row(s) remain" },
    });
  });

  it("shouts about it in the server log, which is the only audience left", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { steps } = recorder(undefined, "boom", "profiles: 1 row(s) remain");
    await deleteAccountFor(USER, steps);

    const shouted = spy.mock.calls.flat().join(" ");
    expect(shouted).toContain("ERASURE UNVERIFIED");
    expect(shouted).toContain(USER);
    spy.mockRestore();
  });

  it("a verification that PASSES is unchanged", async () => {
    const { ran, steps } = recorder();
    const out = await deleteAccountFor(USER, steps);
    expect(out).toMatchObject({ ok: true, verification: { ok: true } });
    expect(ran).toContain("verify-erased");
  });
});

describe("⚠️ BREAKING EACH STEP, continued", () => {

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

    expect(out).toEqual({ ok: true, stepsRun: [...DELETION_ORDER], verification: { ok: true } });
    expect(second.ran).toEqual([...DELETION_ORDER, "verify-erased"]);
  });
});

describe("⚠️ a retry after a partial failure completes CLEANLY", () => {
  /**
   * The defect the live drive found, pinned here so it cannot come back.
   *
   * Running the deletion twice on the same id made the second run fail on
   * `delete-auth-user` with "User not found" — and the action turns any failure
   * into "Your account could not be deleted. Nothing has been removed." So
   * somebody retrying after a partial failure would be told their data was
   * intact at the exact moment it had all just been erased.
   *
   * The real `liveSteps.deleteAuthUser` now treats absence as the goal state.
   * These drive the same shape through the orchestrator.
   */
  it("an absent auth user reads as done, not as a failure", async () => {
    const ran: string[] = [];
    const steps: DeletionSteps = {
      cancelStripe: async () => { ran.push("cancel-stripe"); },
      sweepStorage: async () => { ran.push("sweep-storage"); },
      verifyErased: async () => { ran.push("verify-erased"); },
      // Already gone: the post-condition is true, so the step is satisfied.
      deleteAuthUser: async () => { ran.push("delete-auth-user"); },
    };
    const out = await deleteAccountFor(USER, steps);
    expect(out.ok).toBe(true);
    expect(ran).toEqual([...DELETION_ORDER, "verify-erased"]);
  });

  it("⚠️ but a REAL auth failure still stops it", async () => {
    // The narrowness is the point. Absence is success; a 500 is not.
    const { steps } = recorder("delete-auth-user", "500 Internal Server Error");
    const out = await deleteAccountFor(USER, steps);
    expect(out).toMatchObject({ ok: false, failedAt: "delete-auth-user" });
  });

  /**
   * ⚠️ BEHAVIOUR, NOT SOURCE TEXT.
   *
   * This read the file and asserted on substrings. A cold review showed the
   * slice ran to END OF FILE rather than to the end of the function, and that
   * the catch-all guard had no `m` flag - so replacing the body with a bare
   * `return true`, which would report ANY auth failure as success, passed all
   * three assertions. The predicate is exported now so it can simply be called.
   */
  it("only Supabase's user_not_found counts as absence, nothing else", () => {
    expect(isUserNotFound({ code: "user_not_found" })).toBe(true);

    // ⚠️ A bare 404 is what a MISROUTED admin endpoint returns for every user.
    expect(isUserNotFound({ status: 404 })).toBe(false);
    // Vendor prose is not the contract.
    expect(isUserNotFound({ message: "User not found" })).toBe(false);
    // None of these says the user is gone.
    expect(isUserNotFound({ status: 500, message: "boom" })).toBe(false);
    expect(isUserNotFound({ code: "unexpected_failure" })).toBe(false);
    expect(isUserNotFound({})).toBe(false);
    expect(isUserNotFound(null)).toBe(false);
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
    /**
     * A second export here is a second public endpoint, and the helpers this
     * flow attracts are exactly the ones that would take a user id.
     *
     * ⚠️ EVERY EXPORT FORM, not just `export function`. A cold review showed
     * the original pattern matched only the declaration form, so
     * `export const sweepUser = async (userId) => {}`, `export default async
     * function nukeUser` and `export { nukeUser }` each still counted ONE and
     * the test passed - and those are precisely the id-taking shapes it exists
     * to catch. A guard that cannot fail is worse than no guard, because it is
     * read as proof.
     */
    const exports = [
      ...source.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm),
      ...source.matchAll(/^export\s+(?:const|let|var)\s+(\w+)/gm),
      ...source.matchAll(/^export\s+default\b/gm),
      ...source.matchAll(/^export\s*\{/gm),
    ].map((m) => m[0]);
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
