import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth";
import { ProtocolScreen } from "@/components/protocol/ProtocolScreen";

export const metadata: Metadata = { title: "Protocol · Trackd Co" };

/**
 * Protocol tab — ONE scrolling page (Spec 04): Compounds, Stacks, Schedule,
 * Cycles. The Plan / Stock segmented control is gone, and with it the `?tab=`
 * param, since there is no longer a tab to land on. Reads the active cycle
 * client screen hydrates everything from the device store and Postgres, so this
 * route reads nothing itself.
 */
export default async function ProtocolPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // `?stock=<compoundId>` — the dashboard's "add stock" tap on a dose row with no
  // vial. Without it the tap discarded which compound it came from and dropped the
  // user at the top of a horizontally-scrolling row to find it again.
  const { stock } = await searchParams;
  const user = await getCurrentUser();
  return (
    <ProtocolScreen
      userId={user?.id ?? "anon"}
      initialStockFor={typeof stock === "string" ? stock : null}
    />
  );
}
