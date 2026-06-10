import type { Metadata } from "next";

import { WeightView } from "@/components/weight/WeightView";
import { createClient } from "@/lib/supabase/server";
import { toDateKey } from "@/lib/home/mockHomeData";

export const metadata: Metadata = { title: "Weight — Trackd Co" };

/**
 * The Weight view — reached only from the + menu's Weight tile (A10). A full
 * bodyweight tracker: log today or back-date a past day, a Trend/Scale graph
 * with a time-range selector, and the full entry log. Reads the user's own
 * `weight_logs` (RLS-scoped) and their unit preference; storage is metric, the
 * view shows kg or lbs to taste. The (app) layout already enforced auth + gate.
 */
export default async function WeightPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("units_preference")
    .eq("id", user!.id)
    .maybeSingle();

  // RLS scopes this to the signed-in user; oldest → newest for the chart.
  const { data } = await supabase
    .from("weight_logs")
    .select("logged_for, weight")
    .order("logged_for", { ascending: true })
    .limit(2000);
  const entries = (data ?? []).map((r) => ({
    key: r.logged_for as string,
    kg: Number(r.weight),
  }));

  return (
    <WeightView
      entries={entries}
      unitPreference={profile?.units_preference ?? "metric"}
      todayKey={toDateKey(new Date())}
    />
  );
}
