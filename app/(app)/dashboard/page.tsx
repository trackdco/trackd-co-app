import type { Metadata } from "next";
import { cookies } from "next/headers";

import { HomeScreen } from "@/components/home/HomeScreen";
import { BetaLaunchNotice } from "@/components/billing/BetaLaunchNotice";
import { TrialEndingBanner } from "@/components/billing/TrialEndingBanner";
import { EnableNotificationsStep } from "@/components/push/EnableNotificationsStep";
import { InstallHomeScreenPopup } from "@/components/pwa/InstallHomeScreenPopup";
import { graceAsTrial } from "@/lib/billing/betaGrace";
import { BETA_NOTICE_COOKIE, betaNoticeSeen } from "@/lib/billing/betaNoticeStore";
import { billingGateEnabled } from "@/lib/billing/gate";
import { formatAccessDate } from "@/lib/billing/manage";
import { currentEntitlement } from "@/lib/billing/entitlements";
import { dismissedTrialNoticeDate } from "@/lib/billing/trialNoticeStore";
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
   * DISMISSAL IS RESOLVED HERE, on the server, from a cookie. It used to be
   * `localStorage` read by the component after hydration, which meant the server
   * rendered the banner every time and the client removed it — measured at a
   * 166ms paint of a dismissed notice and a 68px page jump, on every load, for
   * the whole trial window. A dismissed banner is now never sent to the browser.
   */
  const cookieStore = await cookies();
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
  /**
   * THE BETA GRACE PERIOD DRIVES THIS BANNER TOO.
   *
   * The ~90 accounts that were here before billing get an `entitlements` row and
   * no Stripe subscription, so the mirror read above finds nothing and the one
   * in-app warning that their access is about to end would never appear — the
   * exact silence the grace period exists to avoid.
   *
   * `graceAsTrial` describes it as the trial it functionally is, which costs the
   * banner and the push nothing: both already take
   * `{status, trialEndsAt, cancelAtPeriodEnd}` and neither cares where it came
   * from. It returns null for anything that is not a grace, and that guard is
   * load-bearing rather than defensive — a PAID subscriber's entitlement also
   * carries an `active_until`, so without the `comp` test their dashboard would
   * announce "Your free trial ends 13 Aug 2027".
   *
   * A real trialing subscription WINS. Somebody on the grace who then subscribes
   * has both, and the one about to take money is the one worth naming.
   */
  const trialRow = trialRows?.[0];
  const graceTrial = trialRow ? null : graceAsTrial(await currentEntitlement());
  // Scoped to the account here, where the user id is known, rather than inside
  // the pure date module which deliberately knows nothing about accounts.
  const dismissedFor = dismissedTrialNoticeDate(
    cookieStore.get("trackd_trial_notice_dismissed")?.value,
    user.id,
  );
  const trialNotice = trialNoticeFor(
    trialRow
      ? {
          status: trialRow.status as string,
          trialEndsAt: (trialRow.trial_ends_at as string | null) ?? null,
          cancelAtPeriodEnd: Boolean(trialRow.cancel_at_period_end),
        }
      : graceTrial,
    trialTz,
    // The INSTANT, not the local day. The banner must vanish the moment the
    // charge lands, not at the end of the calendar day it landed on: a trial
    // ending 01:39 local otherwise showed "Your free trial ends today" for the
    // rest of a day on which the money had already moved.
    new Date(),
    dismissedFor,
  );

  /**
   * THE ONE-TIME BETA NOTICE. Once ever, per account, decided on the server.
   *
   * Only shown once the gate is switched on: before that nothing has changed for
   * anybody and announcing a change would be announcing nothing. Only shown to
   * somebody whose access rests on a `comp` row, which is exactly what the beta
   * backfill writes and is nobody who has actually subscribed.
   *
   * Read from a COOKIE, so a notice already seen is never sent to the browser at
   * all. The trial banner learned this the expensive way — `localStorage` meant
   * the server rendered it every time and the client removed it after hydration,
   * measured at a 166ms paint and a 68px page jump on every load. As a MODAL
   * that would be a dialog flashing across the screen on every app open.
   */
  const betaEntitlement = await currentEntitlement();
  const showBetaNotice =
    billingGateEnabled() &&
    betaEntitlement?.source === "comp" &&
    !betaNoticeSeen(cookieStore.get(BETA_NOTICE_COOKIE)?.value, user.id);

  // Set by the auth callback on a fresh sign-in / sign-up — drives the one-time
  // (per-login) "Add to Home Screen" popup below.
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
      {showBetaNotice ? (
        <BetaLaunchNotice
          userId={user.id}
          // Formatted here, in the user's own timezone, for the same reason
          // every other date on this screen is: the server renders in whatever
          // region Vercel chose, and this is a deadline.
          endsOn={
            betaEntitlement?.activeUntil
              ? formatAccessDate(betaEntitlement.activeUntil, trialTz)
              : null
          }
          // A comp with NO expiry is free forever. With one, it is the grace.
          isComp={!betaEntitlement?.activeUntil}
        />
      ) : null}
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
              userId={user.id}
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
