import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

/**
 * Test config for the pure logic layer (`lib/**`) — the schedule, dose-log, and
 * date-resolution helpers that Spec 01 (Dose & Schedule Integrity) hardened.
 *
 * Scoped deliberately to `lib/`: those modules are pure by house rule
 * (`code-standards.md` → "lib/ — pure helpers and shared types (no React, no side
 * effects)"), so they run in plain Node with no DOM, no renderer, and no Supabase.
 * Component and end-to-end coverage would need a different harness and is not
 * what these regressions call for — every bug this suite pins was in the logic,
 * not the markup.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      /**
       * `server-only` is a BUILD-TIME marker with no runtime, and it is not a
       * real package outside a Next bundle. Vitest resolves imports for real, so
       * any module reaching one of the `server-only` files (`lib/billing/gate.ts`
       * is imported by the dose-log sync path, which sixteen suites pull in
       * transitively) died with "Cannot find package 'server-only'".
       *
       * Aliased to an empty module rather than removed from the source. The
       * marker is doing a real job — importing one of those files from a client
       * component FAILS THE BUILD, which is what keeps the service-role key out
       * of a browser bundle — and deleting it to make a test runner happy would
       * trade a structural guarantee for a config line.
       */
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
})
