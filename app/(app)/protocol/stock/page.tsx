import type { Metadata } from "next"

import { getCurrentUser } from "@/lib/auth"
import { StockScreen } from "@/components/protocol/pages/StockScreen"

export const metadata: Metadata = { title: "Stock · Trakabl" }

/**
 * Protocol → Stock (Adrian, 2026-09-24): pushed from its foot tile on Protocol.
 * The client screen reads the device store and Postgres, so this route reads
 * only who is signed in.
 */
export default async function ProtocolStockPage() {
  const user = await getCurrentUser()
  return <StockScreen userId={user?.id ?? "anon"} />
}
