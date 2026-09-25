import { notFound } from "next/navigation"

import { ProtocolPreview } from "../../preview"

/** DEV-ONLY: one compound's half-life page on the preview's mock data. */
export default async function PreviewHalfLifeCompound({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === "production") notFound()
  const { id } = await params
  return <ProtocolPreview page="half-life-compound" compoundId={decodeURIComponent(id)} />
}
