import type { Metadata } from "next";
import { cookies } from "next/headers";

import { HomeScreen } from "@/components/home/HomeScreen";
import { EnableNotificationsStep } from "@/components/push/EnableNotificationsStep";
import { InstallHomeScreenPopup } from "@/components/pwa/InstallHomeScreenPopup";
import { toDateKey } from "@/lib/home/mockHomeData";
import { unitForPreference } from "@/lib/weight";
import type { ProgressPhoto } from "@/lib/progress/photos";
import { createClient } from "@/lib/supabase/server";
import { listInjectionSiteCatalogue } from "@/lib/db/injectionSites";

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

  // The (app) layout redirects an unauthenticated user, but layout and page
  // render concurrently in the App Router — so the page can't lean on that and
  // must guard itself, or `user!.id` below throws (and is logged server-side)
  // before the redirect lands. Render nothing; the layout's redirect is the
  // actual response.
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("units_preference, notifications_enabled")
    .eq("id", user.id)
    .maybeSingle();

  // Set by the auth callback on a fresh sign-in / sign-up — drives the one-time
  // (per-login) "Add to Home Screen" popup below.
  const cookieStore = await cookies();
  const freshSignIn = cookieStore.get("trackd-install-hint")?.value === "1";

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
  const [
    { data: weightData },
    { data: photoData },
    injectionCatalogue,
  ] = await Promise.all([
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
    listInjectionSiteCatalogue(),
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
        injectionCatalogue={injectionCatalogue}
        // Slim, persistent "Enable notifications" prompt, rendered above Today's
        // Log. Notifications are core to the app, so it stays until turned on (no
        // dismiss); self-hides when already on / not actionable.
        notificationsBanner={
          <EnableNotificationsStep
            initialEnabled={Boolean(profile?.notifications_enabled)}
          />
        }
      />

      {/* "Add to Home Screen" popup — shown on every physical sign-in / sign-up
          (iPhone + Safari). Self-hides on every other platform / in the app. */}
      <InstallHomeScreenPopup freshSignIn={freshSignIn} />
    </>
  );
}
