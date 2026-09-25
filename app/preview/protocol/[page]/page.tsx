import { notFound } from "next/navigation"

import { ProtocolPreview } from "../preview"

/** DEV-ONLY: Protocol's Stacks, Cycles and Schedule pages on the preview's mock data. */
export default async function PreviewProtocolSubpage({ params }: { params: Promise<{ page: string }> }) {
  if (process.env.NODE_ENV === "production") notFound()
  const { page } = await params
  if (page !== "stacks" && page !== "cycles" && page !== "schedule") notFound()
  return <ProtocolPreview page={page} />
}
