import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth";
import { getActiveCycle } from "@/lib/db/cycles";
import { ProtocolScreen } from "@/components/protocol/ProtocolScreen";

export const metadata: Metadata = { title: "Protocol — Trackd Co" };

/**
 * Protocol tab — a single screen with an in-page Plan / Stock toggle (Protocol
 * Cutover, Step 4). Reads the active cycle server-side (RLS-scoped) for the Plan
 * header; the client screen hydrates the compound list from Postgres.
 */
export default async function ProtocolPage() {
  const user = await getCurrentUser();
  const cycle = user ? await getActiveCycle() : null;
  return <ProtocolScreen userId={user?.id ?? "anon"} initialCycle={cycle} />;
}
