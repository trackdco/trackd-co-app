import type { Metadata } from "next"

import { getCurrentUser } from "@/lib/auth"
import { CyclesScreen } from "@/components/protocol/pages/CyclesScreen"

export const metadata: Metadata = { title: "Cycles · Trakabl" }

/**
 * Protocol → Cycles (Adrian, 2026-09-24): pushed from its foot tile on Protocol.
 * The client screen reads the device store and Postgres, so this route reads
 * only who is signed in.
 */
export default async function ProtocolCyclesPage() {
  const user = await getCurrentUser()
  return <CyclesScreen userId={user?.id ?? "anon"} />
}
