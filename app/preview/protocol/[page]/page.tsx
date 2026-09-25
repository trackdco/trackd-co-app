import { notFound } from "next/navigation"

import { ProtocolPreview } from "../preview"

/**
 * DEV-ONLY: Protocol's Stacks, Cycles, Ended and Schedule pages on the
 * preview's mock data. `?n=12` or `?n=50` adds that many cycles, to see the
 * Cycles page hold at scale (build-brief-final §3.10).
 */
export default async function PreviewProtocolSubpage({
  params,
  searchParams,
}: {
  params: Promise<{ page: string }>
  searchParams: Promise<{ n?: string }>
}) {
  if (process.env.NODE_ENV === "production") notFound()
  const { page } = await params
  const { n } = await searchParams
  if (page !== "stacks" && page !== "cycles" && page !== "ended" && page !== "schedule") notFound()
  const demo = Math.max(0, Math.min(60, Number.parseInt(n ?? "0", 10) || 0))
  return <ProtocolPreview page={page} demo={demo} />
}
