import "server-only";

import { takeSnapshot } from "./fetch";
import { buildReport, renderReport } from "./report";
import { runRules } from "./rules";
import type { ReconcileReport } from "./types";

/**
 * THE WHOLE RUN, in one place: read, decide, report.
 *
 * ⚠️ SERVER-ONLY, and deliberately NOT a `"use server"` module. §3.8: "Every
 * export of a `use server` module is publicly dispatchable, so none of this
 * belongs in one." The only caller is the secret-gated route.
 *
 * It fixes ONE instant for the whole run and passes it down, so every rule
 * measures against the same moment. A pipeline whose rules each called
 * `new Date()` could report a subscription as both inside and outside a period.
 */
export async function reconcile(): Promise<{
  report: ReconcileReport;
  text: string;
}> {
  const ranAt = new Date();
  const snapshot = await takeSnapshot(ranAt);
  const findings = runRules(snapshot);
  const report = buildReport(snapshot, findings, ranAt.toISOString());
  return { report, text: renderReport(report) };
}
