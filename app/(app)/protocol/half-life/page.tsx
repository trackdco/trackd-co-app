import type { Metadata } from "next"

import { getCurrentUser } from "@/lib/auth"
import { HalfLifeScreen } from "@/components/protocol/pages/HalfLifeScreen"

export const metadata: Metadata = { title: "Half-life · Trakabl" }

/**
 * Protocol → Half-life (build-brief-final §3.11): pushed from the third tile.
 * The client screen reads the device store, so this route reads only who is
 * signed in.
 */
export default async function ProtocolHalfLifePage() {
  const user = await getCurrentUser()
  return <HalfLifeScreen userId={user?.id ?? "anon"} />
}
