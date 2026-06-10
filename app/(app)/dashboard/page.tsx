import type { Metadata } from "next";

import { HomeScreen } from "@/components/home/HomeScreen";
import { mockWeightPoints, toDateKey } from "@/lib/home/mockHomeData";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Home — Trackd Co",
};

/**
 * Home — the default tab and the screen every daily-use session lands on: a
 * glanceable status board (pinned week strip → greeting → Today's Cycle →
 * Site rotation → Weight → Reconstitution Calculator). Cycle/site data is mock
 * this pass; the Weight card reads the user's REAL `body_metrics` history (and
 * "Log weight" persists there), falling back to mock points until they've logged.
 *
 * The (app) layout already enforced auth + the 18+/ToS gate. `todayKey` is
 * resolved once here on the server so every date renders identically on server
 * and client. The user's first name (display-only) feeds the greeting.
 */
export default async function DashboardPage() {
  const todayKey = toDateKey(new Date());

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const fullName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    null;
  const firstName = fullName?.trim().split(/\s+/)[0] ?? "";

  // RLS scopes this to the signed-in user; oldest → newest for the chart.
  const { data } = await supabase
    .from("body_metrics")
    .select("measured_on, weight_kg")
    .order("measured_on", { ascending: true })
    .limit(120);
  const rows = (data ?? []) as { measured_on: string; weight_kg: number | null }[];
  const realWeight = rows
    .filter((r) => r.weight_kg != null)
    .map((r) => ({ key: r.measured_on, kg: Number(r.weight_kg) }));
  const weight = realWeight.length > 0 ? realWeight : mockWeightPoints(new Date());

  return (
    <HomeScreen
      todayKey={todayKey}
      name={firstName}
      weight={weight}
      userId={user?.id ?? "anon"}
    />
  );
}
