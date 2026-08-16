import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * THE TEST-CLOCK HARNESS. Deliberately a SEPARATE runner from the committed suite.
 *
 * `vitest.config.ts` includes `lib/**│*.test.ts` and nothing else, because that
 * suite is the pure-logic layer: no network, no Supabase, no Stripe, runnable by
 * anybody at any time. These scenarios are the opposite of that — they touch the
 * PRODUCTION database and (when explicitly permitted) real Stripe test objects —
 * so they must never be picked up by `npm test`, by a pre-commit hook, or by CI.
 *
 * A different `include` and a different file suffix (`.scenario.ts`) keep the two
 * apart by construction rather than by remembering.
 *
 * Run:  npx vitest run --config scratchpad/harness/vitest.harness.config.ts
 *
 * The aliases are copied from the root config, including the `server-only` stub:
 * `lib/notifications/runner.ts` reaches `lib/billing/gate.ts`, which carries the
 * marker, and without the stub every scenario dies on "Cannot find package
 * 'server-only'".
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("../../test/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["scratchpad/harness/**/*.scenario.ts"],
    /** ⚠️ Must run before any module under test is imported. See `setup.ts`. */
    setupFiles: [fileURLToPath(new URL("./setup.ts", import.meta.url))],
    /**
     * ⚠️ ONE FILE AT A TIME. Scenarios seed accounts, Stripe customers and test
     * clocks and tear them down in a `finally`. Two files running concurrently
     * would interleave those teardowns, and the failure mode is an orphaned
     * Stripe customer on a production-linked account rather than a red test.
     */
    fileParallelism: false,
    sequence: { concurrent: false },
    /** A Stripe test clock advance is not fast, and neither is a courtesy period. */
    testTimeout: 300_000,
    hookTimeout: 120_000,
  },
});
