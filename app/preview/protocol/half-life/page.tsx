import { notFound } from "next/navigation"

import { ProtocolPreview } from "../preview"

/** DEV-ONLY: Protocol's Half-life list on the preview's mock data. */
export default function PreviewHalfLife() {
  if (process.env.NODE_ENV === "production") notFound()
  return <ProtocolPreview page="half-life" />
}
