import type { Metadata } from "next";

import { HomeScreen } from "@/components/home/HomeScreen";
import { WelcomeVideoPopup } from "@/components/welcome/WelcomeVideoPopup";
import { toDateKey } from "@/lib/home/mockHomeData";
import { unitForPreference } from "@/lib/weight";
import { WELCOME_VIDEO_READY } from "@/lib/welcomeVideo";
import type { ProgressPhoto } from "@/lib/progress/photos";
import { createClient } from "@/lib/supabase/server";

const SIGNED_URL_TTL = 60 * 60; // 1h — regenerated on every load

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
    .select("units_preference, welcome_seen_at")
    .eq("id", user!.id)
    .maybeSingle();

  // Show the one-time founder welcome only when it hasn't been seen AND a video
  // link is configured (lib/welcomeVideo.ts) — so it stays dormant until then.
  const showWelcome = WELCOME_VIDEO_READY && !profile?.welcome_seen_at;

  // First name for the greeting — from Google auth metadata (display only, never
  // an access decision). Falls back to the email local-part, else null (no name).
  const fullName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    "";
  const firstName =
    fullName.trim().split(/\s+/)[0] || user?.email?.split("@")[0] || null;

  // RLS scopes both to the signed-in user. Weight: oldest → newest for the
  // sparkline. Photos: newest first — just enough to cover the latest session for
  // the Home glance peek (the full gallery lives on the Progress tab).
  const [{ data: weightData }, { data: photoData }] = await Promise.all([
    supabase
      .from("weight_logs")
      .select("logged_for, weight")
      .order("logged_for", { ascending: true })
      .limit(400),
    supabase
      .from("progress_photos")
      .select("id, pose, taken_on, created_at, storage_path")
      .order("taken_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(12),
  ]);
  const weight = (weightData ?? []).map((r) => ({
    key: r.logged_for as string,
    kg: Number(r.weight),
  }));

  // Sign the latest photos' paths for display (the bucket is private). Only the
  // glance peek uses them, so weight/note aren't needed here.
  const photoRows = photoData ?? [];
  const photoPaths = photoRows
    .map((p) => p.storage_path as string | null)
    .filter((p): p is string => Boolean(p));
  const photoSigned = new Map<string, string>();
  if (photoPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("progress-photos")
      .createSignedUrls(photoPaths, SIGNED_URL_TTL);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) photoSigned.set(s.path, s.signedUrl);
    }
  }
  const progressPhotos: ProgressPhoto[] = photoRows.map((p) => ({
    id: p.id as string,
    pose: p.pose as string,
    date:
      (p.taken_on as string | null) ??
      toDateKey(new Date(p.created_at as string)),
    url: photoSigned.get(p.storage_path as string) ?? null,
    weightKg: null,
    note: null,
  }));

  return (
    <>
      <HomeScreen
        todayKey={todayKey}
        userId={user?.id ?? "anon"}
        weight={weight}
        unit={unitForPreference(profile?.units_preference)}
        firstName={firstName}
        progressPhotos={progressPhotos}
      />
      <WelcomeVideoPopup show={showWelcome} />
    </>
  );
}
