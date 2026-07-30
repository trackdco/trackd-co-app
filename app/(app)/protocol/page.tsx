import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth";
import { getActiveCycle } from "@/lib/db/cycles";
import { ProtocolScreen } from "@/components/protocol/ProtocolScreen";

export const metadata: Metadata = { title: "Protocol — Trackd Co" };

/**
 * Protocol tab — ONE scrolling page (Spec 04): Compounds, Stacks, Schedule,
 * Cycles. The Plan / Stock segmented control is gone, and with it the `?tab=`
 * param, since there is no longer a tab to land on. Reads the active cycle
 * server-side (RLS-scoped); the client screen hydrates the rest from Postgres.
 */
export default async function ProtocolPage() {
  const user = await getCurrentUser();
  const cycle = user ? await getActiveCycle() : null;
  return (
    <ProtocolScreen
      userId={user?.id ?? "anon"}
      initialCycle={cycle}
    />
  );
}
