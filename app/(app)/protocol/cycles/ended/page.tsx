import type { Metadata } from "next"

import { getCurrentUser } from "@/lib/auth"
import { EndedCyclesScreen } from "@/components/protocol/pages/EndedCyclesScreen"

export const metadata: Metadata = { title: "Ended cycles · Trakabl" }

/**
 * Cycles → Ended (build-brief-final §3.10), pushed from "Ended N ›" at the foot
 * of Cycles. The client screen reads the device store, so this route reads only
 * who is signed in.
 */
export default async function EndedCyclesPage() {
  const user = await getCurrentUser()
  return <EndedCyclesScreen userId={user?.id ?? "anon"} />
}
