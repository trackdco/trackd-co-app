/**
 * ⚠️ LOADS `.env.local` INTO `process.env` BEFORE ANY MODULE UNDER TEST IS IMPORTED.
 *
 * This has to be a `setupFiles` entry and cannot live in `core.ts`. ESM imports
 * are hoisted, so `lib/notifications/runner.ts` executes its module body — which
 * captures `VAPID_PUBLIC`, `VAPID_PRIVATE` and `VAPID_SUBJECT` into consts at the
 * top level — before any statement in `core.ts` runs. Parsing the env after that
 * point is too late, and the symptom is silent and misleading: `runForUser`
 * returns `{ reason: "vapid-unconfigured" }` and every reminder assertion fails
 * with `trialReminder: undefined`, which reads exactly like "the runner refused
 * to send" rather than "the harness never configured it".
 *
 * Measured, not theorised: that was the first run of `monday.scenario.ts`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

for (const file of [".env.local", ".env"]) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    // Never overwrite something already exported: an explicit shell variable is
    // the operator being deliberate, and the file is only the fallback.
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

// `web-push` refuses to sign without a subject, and `.env.local` may legitimately
// omit it because the app defaults it in code.
process.env.VAPID_SUBJECT ??= "mailto:notifications@trackdco.app";
process.env.VAPID_PUBLIC_KEY ??= process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/**
 * ⚠️ HARNESS PROCESS ONLY. The push sink presents a self-signed certificate for
 * 127.0.0.1, and `web-push` speaks TLS unconditionally (see `PushSink`). Without
 * this, every captured delivery fails verification and the scenarios misreport a
 * correct verdict as a dead reminder.
 *
 * Scoped to this vitest process. It is set nowhere in the app, and this config is
 * excluded from the committed suite by `include`.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
