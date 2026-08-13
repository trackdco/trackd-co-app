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
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
})
