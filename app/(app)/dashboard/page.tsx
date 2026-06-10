import type { Metadata } from "next";

import { HomeScreen } from "@/components/home/HomeScreen";
import { toDateKey } from "@/lib/home/mockHomeData";
import { unitForPreference } from "@/lib/weight";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Home — Trackd Co",
};

/**
 * Home — the default tab and the screen every daily-use session lands on: a
 * glanceable status board (date + "Dashboard" + week strip → Today's Log →
 * Weight glance → Reconstitution Calculator). Stack/dose data is device-local
 * this pass (scoped by the signed-in user); the Weight card is a display read
 * from the user's real `weight_logs` and taps through to the Weight view.
 *
 * The (app) layout already enforced auth + the 18+/ToS gate. `todayKey` is
 * resolved once here on the server so every date renders identically.
 */
export default async function DashboardPage() {
  const todayKey = toDateKey(new Date());

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("units_preference")
    .eq("id", user!.id)
    .maybeSingle();

  // RLS scopes this to the signed-in user; oldest → newest for the sparkline.
  const { data } = await supabase
    .from("weight_logs")
    .select("logged_for, weight")
    .order("logged_for", { ascending: true })
    .limit(400);
  const weight = (data ?? []).map((r) => ({
    key: r.logged_for as string,
    kg: Number(r.weight),
  }));

  return (
    <HomeScreen
      todayKey={todayKey}
      userId={user?.id ?? "anon"}
      weight={weight}
      unit={unitForPreference(profile?.units_preference)}
    />
  );
}
