import { fileURLToPath } from "node:url"

import { loadEnv } from "vite"
import { defineConfig } from "vitest/config"

/**
 * ⚠️ THE LIVE DRIVE. It talks to the REAL Supabase project in `.env.local`.
 *
 * Kept in its own config, and OUT of `vitest.config.ts`'s `include`, so that
 * `npm test` and `npm run check` stay offline and deterministic. Nothing here
 * runs unless somebody names this file:
 *
 *     npx vitest run --config vitest.live.config.ts
 *
 * ## Why a live drive exists at all
 *
 * `lib/storage/sweep.test.ts` proves the sweep's LOGIC against a double, and a
 * double is written by the same person who wrote the code — so it cannot catch
 * the case where real Storage behaves differently from what the code assumes.
 * The load-bearing assumption is that `list()` distinguishes "could not read"
 * from "nothing there" by answering `error` rather than an empty `data`. That is
 * a claim about somebody else's server, and it is only worth anything measured.
 *
 * Every account it creates is on `@trackd-qa.invalid` and is torn down BY ID.
 */
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // Same reasoning as `vitest.config.ts`: a build-time marker with no runtime.
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/live/**/*.live.test.ts"],
    // Empty prefix: load every var in `.env.local`, not just VITE_ ones.
    env: loadEnv(mode, process.cwd(), ""),
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Sequential. Two drives sharing one project would race on the object counts.
    fileParallelism: false,
  },
}))
