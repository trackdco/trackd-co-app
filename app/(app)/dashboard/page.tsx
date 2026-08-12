import type { Metadata } from "next";
import { cookies } from "next/headers";

import { HomeScreen } from "@/components/home/HomeScreen";
import { TrialEndingBanner } from "@/components/billing/TrialEndingBanner";
import { EnableNotificationsStep } from "@/components/push/EnableNotificationsStep";
import { InstallHomeScreenPopup } from "@/components/pwa/InstallHomeScreenPopup";
import { trialNoticeFor, trialNoticeLine } from "@/lib/notifications/trialReminder";
import { toDateKey } from "@/lib/home/mockHomeData";
import { createClient } from "@/lib/supabase/server";
import { listInjectionSiteCatalogue } from "@/lib/db/injectionSites";
import { bodySexFor } from "@/lib/db/types";
import { sitesForSex } from "@/lib/home/siteCatalog";


export const metadata: Metadata = {
  title: "Home · Trackd Co",
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
    // `timezone` rides along for the trial notice below: the day a trial ends is
    // a CALENDAR day and it is a different one either side of midnight, so the
    // server must resolve it in the user's own zone rather than in Vercel's.
    .select("units_preference, notifications_enabled, sex, timezone")
    .eq("id", user.id)
    .maybeSingle();

  /**
   * THE TRIAL'S FINAL STRETCH.
   *
   * The push only reaches the minority who granted notification permission, so
   * the same promise is stated on the one surface everybody has. Decided by
   * `trialNoticeFor`, which shares its date maths with the push so the two
   * cannot disagree about which day was promised.
   *
   * `dismissedFor` is null here on purpose: dismissal is a DEVICE preference and
   * the server cannot read `localStorage`. The banner component asks the device
   * and hides itself. That means the server does this small read for a dismissed
   * banner too, which is one indexed lookup on a table with eleven rows.
   */
  const trialTz = (profile?.timezone as string | null) || "Australia/Sydney";
  const { data: trialRows } = await supabase
    .from("subscriptions")
    .select("status, trial_ends_at, cancel_at_period_end")
    .eq("user_id", user.id)
    .eq("status", "trialing")
    // SOONEST-ENDING first, matching the runner and the Billing screen. Ordered
    // by `updated_at` it named a stale trial's date while a real one was about
    // to bill.
    .order("trial_ends_at", { ascending: true })
    .limit(1);
  const trialRow = trialRows?.[0];
  const trialNotice = trialNoticeFor(
    trialRow
      ? {
          status: trialRow.status as string,
          trialEndsAt: (trialRow.trial_ends_at as string | null) ?? null,
          cancelAtPeriodEnd: Boolean(trialRow.cancel_at_period_end),
        }
      : null,
    trialTz,
    // The INSTANT, not the local day. The banner must vanish the moment the
    // charge lands, not at the end of the calendar day it landed on: a trial
    // ending 01:39 local otherwise showed "Your free trial ends today" for the
    // rest of a day on which the money had already moved.
    new Date(),
    null,
  );

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

  // Spec 02 moved weight and progress photos OFF the dashboard, so their queries
  // and the photo URL signing are gone with them — the data is untouched and lives
  // on the Progress tab. That drops two table reads and a Storage signing round-trip
  // from every dashboard load.
  const injectionCatalogue = await listInjectionSiteCatalogue();

  // Which body the site map draws, and the catalogue narrowed to the sites that
  // exist on it (the female IM art has no pecs). Filtered here, server-side, so
  // every downstream consumer — glance card, sites sheet, log flow — sees one
  // consistent set. A profile with no sex gets the male body (legacy rows only:
  // the welcome quiz now requires a choice).
  const bodySex = bodySexFor(profile?.sex);
  const injectionCatalogueForSex = sitesForSex(injectionCatalogue, bodySex);


  return (
    <>
      <HomeScreen
        todayKey={todayKey}
        userId={user?.id ?? "anon"}
        firstName={firstName}
        injectionCatalogue={injectionCatalogueForSex}
        bodySex={bodySex}
        // Keyed for the same reason `notificationsBanner` is: this element
        // crosses the server/client boundary, so React counts it as an unkeyed
        // list child and warns on every load.
        trialBanner={
          trialNotice ? (
            <TrialEndingBanner
              key="trial-ending"
              line={trialNoticeLine(trialNotice)}
              forDate={trialNotice.forDate}
            />
          ) : null
        }
        // Slim, persistent "Enable notifications" prompt, rendered above Today's
        // Log. Notifications are core to the app, so it stays until turned on (no
        // dismiss); self-hides when already on / not actionable.
        // The `key` is load-bearing despite there being no list here: this
        // element crosses the server/client boundary, so it reaches HomeScreen
        // unvalidated and React counts it as an unkeyed list child, logging a
        // `key` warning on every dashboard load. Keying it here is the only fix
        // that costs no DOM — wrapping it in an element would give `space-y-5`
        // something to space against even when the banner renders null.
        notificationsBanner={
          <EnableNotificationsStep
            key="enable-notifications"
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
