import { notFound } from "next/navigation"

import { ProtocolPreview } from "../preview"

/** DEV-ONLY: Protocol's Stock, Stacks and Cycles pages on the preview's mock data. */
export default async function PreviewProtocolSubpage({ params }: { params: Promise<{ page: string }> }) {
  if (process.env.NODE_ENV === "production") notFound()
  const { page } = await params
  if (page !== "stock" && page !== "stacks" && page !== "cycles") notFound()
  return <ProtocolPreview page={page} />
}
