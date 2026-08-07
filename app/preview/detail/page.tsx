import { notFound } from "next/navigation"

import { DetailProposals } from "./DetailProposals"

/**
 * DEV-ONLY design harness for the compound detail sheet (Spec w2b-13, Step 7).
 * Six layouts of the same sheet, static. 404s in production.
 */
export default function PreviewDetailPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <DetailProposals />
}
