import { notFound } from "next/navigation"

import { DbSyncHarness } from "./harness"

/**
 * DEV-ONLY, THROWAWAY verification harness for the Protocol Cutover Step 1 data +
 * sync layer (`lib/db/*`, `lib/sync/*`). Returns 404 in production so it never
 * ships, and is to be REMOVED before the Home flip (Step 3).
 *
 * Unlike the other `/preview/*` harnesses this one talks to the REAL data layer,
 * so it only does anything useful when you are signed in locally (the `lib/db/*`
 * server actions derive identity from the session cookie). It round-trips
 * create/read/update for cycles + protocol_compounds + dose_logs and exercises an
 * offline → online sync (queue while "offline", then flush).
 */
export default function PreviewDbSyncPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <DbSyncHarness />
}
