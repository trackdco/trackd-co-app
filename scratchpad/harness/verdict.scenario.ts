/**
 * ⚠️ THE CONTROL FOR `Checks.assertAllPassed`. Not part of the arc.
 *
 * A harness assertion nobody has watched fail is a claim. This drives all three
 * branches — green, soft-red, and nothing-measured — through the REAL runner, so
 * the exit code is observed rather than reasoned about.
 *
 * ⚠️ TRACKED AND PERMANENT, NOT A THROWAWAY. A control that lives on one machine
 * is the claim-not-evidence failure D89 exists for — the same reason
 * `qa-audit-controls.mjs` is tracked. With no `VERDICT_CASE` it runs the green
 * case and exits 0, so it costs nothing and re-proves on every harness run that
 * the verdict is still wired up.
 *
 *   VERDICT_CASE=green   1 check, passing        exit 0   (the default)
 *   VERDICT_CASE=red     1 SOFT-FAILED check     exit 1
 *   VERDICT_CASE=empty   no checks at all        exit 1   (Rule 0)
 *
 * ⚠️ THE RESIDUE THIS MAKES VISIBLE. In the `red` case vitest still prints
 * `Tests 1 passed` — because `check()` does not throw, by design, so the `it()`
 * block really did return normally. What changed is `Test Files 1 failed` and the
 * EXIT CODE. The per-test line is not the run's verdict and never was; this is.
 */
import { afterAll, describe, it } from "vitest";

import { Checks } from "./lifetime";

const c = new Checks();
const CASE = process.env.VERDICT_CASE ?? "green";

afterAll(() => {
  c.assertAllPassed(`VERDICT (${CASE})`);
});

describe("the verdict itself", () => {
  it("records whatever this case is about", () => {
    c.at("CONTROL");
    if (CASE === "green") {
      c.check("a check that passes", true, "expected clean, exit 0");
    } else if (CASE === "red") {
      c.check("a check that passes", true);
      c.check("a SOFT-FAILED check — the whole point", false, "must fail the run");
    }
    // CASE === "empty" records nothing at all: the Rule 0 branch.
  });
});
