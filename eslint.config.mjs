import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Off-iCloud build cache (some local setups symlink .next here to dodge
    // iCloud sync corrupting Turbopack's rapid writes) — never lint build output.
    ".next.nosync/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Supabase Edge Functions are Deno (npm: imports, Deno globals) — not part of
    // the Next.js app's TS program; linting them here would false-positive.
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
