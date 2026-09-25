import type { Metadata } from "next"

import { getCurrentUser } from "@/lib/auth"
import { HalfLifeCompoundScreen } from "@/components/protocol/pages/HalfLifeCompoundScreen"

export const metadata: Metadata = { title: "Half-life · Trakabl" }

/**
 * Half-life → a compound (build-brief-final §3.11). The client screen reads
 * the device store, so this route reads only who is signed in and which
 * compound was tapped.
 */
export default async function HalfLifeCompoundPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()])
  return <HalfLifeCompoundScreen userId={user?.id ?? "anon"} compoundId={decodeURIComponent(id)} />
}
