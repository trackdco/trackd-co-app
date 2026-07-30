import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth";
import { ProtocolScreen } from "@/components/protocol/ProtocolScreen";

export const metadata: Metadata = { title: "Protocol — Trackd Co" };

/**
 * Protocol tab — ONE scrolling page (Spec 04): Compounds, Stacks, Schedule,
 * Cycles. The Plan / Stock segmented control is gone, and with it the `?tab=`
 * param, since there is no longer a tab to land on. Reads the active cycle
 * client screen hydrates everything from the device store and Postgres, so this
 * route reads nothing itself.
 */
export default async function ProtocolPage() {
  const user = await getCurrentUser();
  return (
    <ProtocolScreen
      userId={user?.id ?? "anon"}
    />
  );
}
