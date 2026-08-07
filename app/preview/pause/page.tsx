import { notFound } from "next/navigation"

import { PauseProposals } from "./PauseProposals"

/**
 * DEV-ONLY design harness for the Pause sheet (Spec w2b-13, Step 6). Four
 * layouts of the same sheet plus three readings of the dashboard's paused row,
 * so they can be judged rendered rather than described. 404s in production.
 */
export default function PreviewPausePage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <PauseProposals />
}
