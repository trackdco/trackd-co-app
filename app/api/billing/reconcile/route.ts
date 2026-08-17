/**
 * STEP 6 — THE SCHEDULED ROUTE (Spec 11 §3.7, §3.8).
 *
 * Ask Stripe for the truth, compare it to our tables, and report.
 *
 * ## ⚠️ IT WRITES NOTHING TO STRIPE AND NOTHING TO THE BILLING TABLES
 *
 * §2, and it is the property that makes this safe to run against production on a
 * schedule. The only write anywhere below the surface is `alert.ts` pruning a
 * push endpoint Google or Apple has already told us is dead — no billing table,
 * no Stripe object. "It repairs nothing, cancels nothing, refunds nothing."
 *
 * ## Secured like the cron, and for the same reason
 *
 * A Bearer `CRON_SECRET`, exactly as `app/api/notifications/run/route.ts` and
 * `app/api/billing/beta-grace/route.ts` do it. §3.8: **"A server action never
 * accepts an identifier saying whose data to act on. The scheduled route takes a
 * shared secret and nothing else. It acts on everybody by design, which is why it
 * is a secret-gated route rather than a session-scoped action."**
 *
 * ⚠️ POST ONLY. No GET, deliberately, and this is a departure from the reminder
 * cron next door. A GET is reachable by a link prefetcher, a browser history
 * entry or a chat unfurler; for the reminder route that means an accidental send,
 * and the same reasoning applies here even though this one only reads. A trigger
 * should not be reachable by navigation. (That the reminder route DOES export GET
 * is recorded as `07`'s to fix.)
 *
 * ⚠️ Nothing here is exported from a `"use server"` module. A route handler is not
 * one, and `lib/billing/reconcile/*` carries `server-only` rather than
 * `"use server"`, so none of it is publicly dispatchable.
 *
 * ## The two renderings, from ONE report
 *
 *   default        `text/plain` — the launch-day surface. §3.5's "never a wall of
 *                  JSON", and what `npm run reconcile` prints.
 *   `?format=json` the same report as data, for `14`'s dashboard when it ships.
 *
 * §3.5: "One report, two renderings, so the page and the terminal can never
 * disagree about whether things are fine."
 *
 * ## The exit state, carried in the HTTP status
 *
 *   200  clean
 *   409  dirty      — findings. The run worked; the system did not.
 *   503  incomplete — it could not see everything, so it cannot say anything.
 *
 * §3.5 wants the answer available "without parsing prose", and §12's twice-clean
 * gate to be "a fact rather than a judgement". ⚠️ 503 rather than 200 for
 * incomplete is the whole point: a run that hit a limit must not satisfy a gate
 * that means "we looked and it was fine".
 */
import { NextResponse } from "next/server";

import { alertOnReport } from "@/lib/billing/reconcile/alert";
import { reconcile } from "@/lib/billing/reconcile/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A full sweep of Stripe is not a fast request. */
export const maxDuration = 300;

const STATUS_CODE = { clean: 200, dirty: 409, incomplete: 503 } as const;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let report;
  let text: string;
  try {
    ({ report, text } = await reconcile());
  } catch (err) {
    /**
     * ⚠️ A CRASH IS NOT A CLEAN RUN. §3.9: "a reconciliation script that breaks
     * silently is strictly worse than none, because the word 'clean' starts
     * meaning 'did not run'." So a thrown error answers 503 — the same code an
     * incomplete run answers with — rather than anything a gate could mistake for
     * success.
     */
    const message = err instanceof Error ? err.message : String(err);
    console.error("[reconcile] run failed:", message);
    return new NextResponse(
      `TRACKD CO — RECONCILIATION\n\n⚠️ THE RUN FAILED AND PROVED NOTHING.\n\n${message}\n`,
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  // D87: every failing run alerts. Never throws — see `alert.ts`.
  const alert = await alertOnReport(report);
  const status = STATUS_CODE[report.status];

  if (new URL(req.url).searchParams.get("format") === "json") {
    return NextResponse.json({ ...report, alert }, { status });
  }

  /**
   * The alert's own outcome is appended to the TEXT too, not just the JSON.
   * "An alerting system with no subscribed device is itself a silent failure" —
   * so if the alert reached nobody, the person reading the report is told, in the
   * same breath as the findings.
   */
  const footer =
    report.status === "clean"
      ? ""
      : `\n\nalert: ${
          alert.delivered > 0
            ? `sent to ${alert.delivered} of ${alert.devices} founder device(s)`
            : `REACHED NOBODY (${alert.reason ?? "unknown"})`
        }\n`;

  return new NextResponse(`${text}${footer}`, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
