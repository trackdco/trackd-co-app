import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { stripeBudgetAvailable } from "./core";

/**
 * ⚠️ WHAT DID NOT RUN, SAID OUT LOUD (5.8).
 *
 * With `HARNESS_ALLOW_STRIPE` unset — **which is the required default state** —
 * every Stripe-touching block in this directory skips and vitest says nothing
 * about it. **Every money assertion in the harness is silently absent from a
 * default run**, and a reader seeing "N passed" has no way to know that the half
 * which touches real money was never among them.
 *
 * ## ⚠️ THE SKIPPING IS CORRECT. THE SILENCE IS THE DEFECT.
 *
 * This is deliberately NOT `rule0.scenario.ts`'s refusal. That file refuses
 * because its assertions would be VACUOUS with the gate off — a pass that means
 * nothing is worse than no pass. Here the tests are ABSENT rather than vacuous,
 * and absent is the right answer when no Stripe budget has been granted: these
 * create real objects on a production-linked account and must not run because a
 * variable happened to be set. So this does not turn a correct default state red.
 *
 * What it does is make the gap impossible to miss, and — more importantly —
 * **impossible to GROW unnoticed**. The block count is pinned. Add a fifteenth
 * guarded file or a twenty-third guarded block and this fails, pointing at the
 * coverage note, exactly the way `gate-audit`'s manifest works one directory
 * across. Silence that can quietly widen is the thing worth catching; silence
 * that is stated and bounded is a decision.
 */

const HARNESS_DIR = fileURLToPath(new URL(".", import.meta.url));

/** ⚠️ Pinned. See the note above: raise it in the same commit that adds a block. */
const EXPECTED_GUARDED_FILES = 14;
const EXPECTED_GUARDED_BLOCKS = 22;

function guardedBlocks(): { file: string; blocks: number }[] {
  const out: { file: string; blocks: number }[] = [];
  for (const name of readdirSync(HARNESS_DIR).sort()) {
    if (!name.endsWith(".scenario.ts")) continue;
    const src = readFileSync(HARNESS_DIR + name, "utf8");
    const blocks =
      (src.match(/describe\.skipIf\(!stripeBudgetAvailable\(\)\)\(/g) ?? []).length +
      (src.match(/^guarded\(/gm) ?? []).length;
    if (blocks > 0) out.push({ file: name, blocks });
  }
  return out;
}

describe("⚠️ harness coverage — what a default run does NOT execute", () => {
  it("states the Stripe budget and what it costs, every run", () => {
    const found = guardedBlocks();
    const total = found.reduce((n, f) => n + f.blocks, 0);
    const on = stripeBudgetAvailable();

    console.log(
      `\n  HARNESS_ALLOW_STRIPE=${process.env.HARNESS_ALLOW_STRIPE ?? "(unset)"} — ` +
        `${on ? "Stripe blocks RAN" : "Stripe blocks DID NOT RUN"}`,
    );
    if (!on) {
      console.log(
        `  ⚠️ ${total} guarded block(s) across ${found.length} file(s) were SKIPPED.\n` +
          `     Every assertion that touches real money is absent from this run.\n` +
          `     To include them:  HARNESS_ALLOW_STRIPE=1 npx vitest run --config ` +
          `scratchpad/harness/vitest.harness.config.ts\n` +
          `     Set it ONLY when no other session is spending Stripe test objects.`,
      );
      for (const f of found) console.log(`       · ${f.file}  (${f.blocks})`);
    }
    // Always true. This case reports; it does not judge the default state.
    expect(found.length).toBeGreaterThan(0);
  });

  /**
   * ⚠️ THE PROPERTY: the amount of silence is a DECISION somebody made, so it
   * cannot change without somebody saying so. Not "these particular files are
   * guarded" — which files carry money assertions legitimately changes — but that
   * the total is the number last agreed.
   */
  it("⚠️ the amount that skips cannot grow unnoticed", () => {
    const found = guardedBlocks();
    const total = found.reduce((n, f) => n + f.blocks, 0);
    expect(
      found.length,
      `${found.length} guarded FILES, expected ${EXPECTED_GUARDED_FILES}. If that is ` +
        `intended, raise EXPECTED_GUARDED_FILES in the same commit — the point is ` +
        `that silence does not widen without a reviewer seeing it.`,
    ).toBe(EXPECTED_GUARDED_FILES);
    expect(
      total,
      `${total} guarded BLOCKS, expected ${EXPECTED_GUARDED_BLOCKS}. Same rule.`,
    ).toBe(EXPECTED_GUARDED_BLOCKS);
  });

  /**
   * ⚠️ CONTROL: the counter can actually count. A regex that matched nothing
   * would report zero guarded blocks and satisfy nothing above except by
   * accident — and would then never fire again.
   */
  it("⚠️ CONTROL: the counter finds a block it is known to contain", () => {
    const found = guardedBlocks();
    const dispute = found.find((f) => f.file === "dispute.scenario.ts");
    expect(dispute, "dispute.scenario.ts is guarded and must be counted").toBeDefined();
    expect(dispute!.blocks).toBe(2);
  });
});

/**
 * ⚠️ AN INSTRUMENT THAT CANNOT REPORT FAILURE (5.9).
 *
 * Drivers print ✅/❌ and an N/N summary and then exit 0 regardless. None is in
 * `npm run check`, so no gate is affected — but a driver run from a terminal, or
 * from a script, or by a future session reading only the exit status, reports
 * SUCCESS while printing failures. A summary that is fully green because nobody
 * looked at it is the same class as every other item in this group.
 *
 * ⚠️ THE TRACKED SET IS ALREADY CORRECT. Every `.mjs` in the clone that carries a
 * `check()` helper sets `process.exitCode`. The ~49 that do not are UNTRACKED
 * one-off cold-review drivers, in nobody's clone and never re-run; editing files
 * that cannot be verified from a checkout would be a claim rather than a fix.
 *
 * So this pins the PROPERTY instead of patching the instances: a tracked driver
 * that can report a failure must be able to report it in its exit status. A new
 * driver copied from an old one fails here rather than in six months.
 */
describe("⚠️ every tracked driver that can fail can SAY it failed", () => {
  const DRIVERS = fileURLToPath(new URL("..", import.meta.url));

  /**
   * ⚠️ TRACKED IS READ FROM `.gitignore`, NOT FROM THE DIRECTORY.
   *
   * The first version walked the folder and caught 37 UNTRACKED cold-review
   * drivers — which really do have the defect, but do not exist in a clone. The
   * assertion would then have passed on a fresh checkout and failed only on the
   * machine that happened to hold them: an environment-dependent test, which is
   * worse than no test.
   *
   * `scratchpad/*` is ignored with explicit `!` negations for the files that are
   * tracked, so that list IS the repo's own answer to "what is in the clone".
   */
  const TRACKED = readFileSync(fileURLToPath(new URL("../../.gitignore", import.meta.url)), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("!/scratchpad/") && l.endsWith(".mjs"))
    .map((l) => l.slice("!/scratchpad/".length));

  it("each tracked .mjs with a check() helper sets process.exitCode", () => {
    const offenders: string[] = [];
    let examined = 0;
    for (const name of TRACKED.slice().sort()) {
      const src = readFileSync(DRIVERS + name, "utf8");
      // A driver is something that RECORDS VERDICTS. A probe that only prints
      // facts has no failure to report and is correctly silent about its status.
      if (!/const check = /.test(src)) continue;
      examined += 1;
      if (!/process\.exitCode|process\.exit\(/.test(src)) offenders.push(name);
    }
    /**
     * ⚠️ CONTROL: it examined something. Without this, a renamed helper would
     * make the loop skip every file and report zero offenders — the vacuous pass
     * this whole group is about.
     */
    expect(
      TRACKED.length,
      "no tracked .mjs drivers were found in .gitignore's negations — the list moved",
    ).toBeGreaterThan(5);
    expect(examined, "no drivers were examined, so this proves nothing").toBeGreaterThan(4);
    expect(
      offenders,
      `these record verdicts but exit 0 regardless: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
