import type { Metadata } from "next"

import { getCurrentUser } from "@/lib/auth"
import { ScheduleScreen } from "@/components/protocol/pages/ScheduleScreen"

export const metadata: Metadata = { title: "Schedule · Trakabl" }

/**
 * Protocol → Schedule (build-brief-final §3.7): pushed from the Schedule card on
 * Protocol; this week, and the weeks behind it. The client screen reads the
 * device store and Postgres, so this route reads only who is signed in.
 */
export default async function ProtocolSchedulePage() {
  const user = await getCurrentUser()
  return <ScheduleScreen userId={user?.id ?? "anon"} />
}
