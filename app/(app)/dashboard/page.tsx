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
 * resolved on the server as a seed so SSR + first client render match; the
 * client (HomeScreen) re-derives it from the device's local clock, since this
 * server runs in UTC and would otherwise be a day off for users ahead of/behind
 * UTC.
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

  // First name for the greeting — from Google auth metadata (display only, never
  // an access decision). Falls back to the email local-part, else null (no name).
  const fullName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    "";
  const firstName =
    fullName.trim().split(/\s+/)[0] || user?.email?.split("@")[0] || null;

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
      firstName={firstName}
    />
  );
}
