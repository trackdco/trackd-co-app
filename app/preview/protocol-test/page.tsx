import { notFound } from "next/navigation"

import { ProtocolTestHarness } from "./harness"

/**
 * DEV-ONLY end-to-end test page for the Protocol Cutover (Steps 1–3). Shows the
 * device-local cache (what Home renders) and the canonical Postgres state SIDE BY
 * SIDE, and drives the REAL store mutators (`upsertStack` / `logDose` / …) so you
 * can confirm the flip: adds/logs write `protocol_compounds` / `dose_logs`, the
 * migration backfills, clearing the local cache restores from Postgres, and
 * customs stay device-local.
 *
 * 404s in production. Sign in locally first (the data-layer server actions derive
 * identity from your session cookie). Throwaway — remove when the cutover settles.
 */
export default function ProtocolTestPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <ProtocolTestHarness />
}
