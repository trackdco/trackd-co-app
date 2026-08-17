/**
 * RUN RECONCILIATION AND PRINT IT (Spec 11, Q94).
 *
 *   npm run reconcile                    # against http://localhost:3100
 *   BASE=https://trackdco.app npm run reconcile
 *
 * Exit code carries the answer, so `12`'s twice-clean gate is a fact:
 *
 *   0  clean
 *   1  dirty      — findings
 *   2  incomplete — it could not see everything, so it proved nothing
 *
 * ## ⚠️ Why this wraps the route instead of being its own implementation
 *
 * Q94 asked for the repo's script-runner convention. There isn't one that reaches
 * both Stripe and Supabase: `scripts/gate-audit.mjs` only reads files and loads no
 * environment, and there is no `tsx` or `ts-node` in devDependencies. The only
 * thing that runs TypeScript against both is the test-clock harness, through its
 * own vitest config.
 *
 * So rather than invent a second implementation that can drift from the route —
 * and §3.5 is explicit that the terminal and the dashboard must never disagree
 * about whether things are fine — this is a thin client for the one that exists.
 * Same code, same report, same answer, whether it is a cron, a dashboard or a
 * person at a terminal.
 *
 * ⚠️ IT READS `CRON_SECRET` FROM `.env.local` AND SENDS IT AS A BEARER TOKEN.
 * Point `BASE` only at hosts you control. The secret is what stands between this
 * endpoint and anybody.
 */
import { readFileSync } from "node:fs";

// The app does NOT hydrate on 127.0.0.1, only on localhost. Irrelevant to a fetch,
// kept identical to every other harness default so nobody has two habits.
const BASE = process.env.BASE ?? "http://localhost:3100";

if (!process.env.CRON_SECRET) {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // No .env.local is fine if CRON_SECRET is already exported.
  }
}

const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("CRON_SECRET is not set, and no .env.local supplied one.");
  process.exit(2);
}

const url = `${BASE.replace(/\/$/, "")}/api/billing/reconcile`;

let res;
try {
  res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
} catch (err) {
  // ⚠️ Unreachable is NOT clean. §3.9: the word "clean" must never come to mean
  // "did not run".
  console.error(`TRACKD CO — RECONCILIATION\n\n⚠️ COULD NOT REACH ${url}\n`);
  console.error(err instanceof Error ? err.message : String(err));
  console.error("\nIs the dev server running? `npm run dev`");
  process.exit(2);
}

console.log(await res.text());

if (res.status === 200) process.exit(0);
if (res.status === 409) process.exit(1);
if (res.status === 401) {
  console.error("\n⚠️ 401 — the CRON_SECRET does not match the server's.");
  process.exit(2);
}
process.exit(2);
