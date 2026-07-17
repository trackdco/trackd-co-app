import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth";
import { getActiveCycle } from "@/lib/db/cycles";
import { ProtocolScreen } from "@/components/protocol/ProtocolScreen";

export const metadata: Metadata = { title: "Protocol — Trackd Co" };

/**
 * Protocol tab — a single screen with an in-page Plan / Stock toggle (Protocol
 * Cutover, Step 4). Reads the active cycle server-side (RLS-scoped) for the Plan
 * header; the client screen hydrates the compound list from Postgres.
 *
 * `?tab=stock` opens on Stock — the Home draw slot's "add stock" tap (Spec 21)
 * lands on the add-flow rather than on Plan. Anything else falls back to Plan, so
 * the param can't be used to reach a state the toggle can't.
 */
export default async function ProtocolPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  const cycle = user ? await getActiveCycle() : null;
  const { tab } = await searchParams;
  return (
    <ProtocolScreen
      userId={user?.id ?? "anon"}
      initialCycle={cycle}
      initialTab={tab === "stock" ? "stock" : "plan"}
    />
  );
}
