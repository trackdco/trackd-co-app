import type { Metadata } from "next"

import { getCurrentUser } from "@/lib/auth"
import { StacksScreen } from "@/components/protocol/pages/StacksScreen"

export const metadata: Metadata = { title: "Stacks · Trakabl" }

/**
 * Protocol → Stacks (Adrian, 2026-09-24): pushed from its foot tile on Protocol.
 * The client screen reads the device store and Postgres, so this route reads
 * only who is signed in.
 */
export default async function ProtocolStacksPage() {
  const user = await getCurrentUser()
  return <StacksScreen userId={user?.id ?? "anon"} />
}
