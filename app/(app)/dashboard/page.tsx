import type { Metadata } from "next";
import { cookies } from "next/headers";

import { HomeScreen } from "@/components/home/HomeScreen";
import { BetaLaunchNotice } from "@/components/billing/BetaLaunchNotice";
import { PaymentFailedBanner } from "@/components/billing/PaymentFailedBanner";
import { PlanEndsTodayBanner } from "@/components/billing/PlanEndsTodayBanner";
import { TrialEndingBanner } from "@/components/billing/TrialEndingBanner";
import { EnableNotificationsStep } from "@/components/push/EnableNotificationsStep";
import { InstallHomeScreenPopup } from "@/components/pwa/InstallHomeScreenPopup";
import { graceAsTrial } from "@/lib/billing/betaGrace";
import { BETA_NOTICE_COOKIE, betaNoticeSeen } from "@/lib/billing/betaNoticeStore";
import { billingGateEnabled } from "@/lib/billing/gate";
import { loadPricesSafe } from "@/lib/billing/prices";
import { formatAccessDate } from "@/lib/billing/manage";
import { pastDueBannerFor } from "@/lib/billing/pastDueBannerCopy";
import { entitlementFacts } from "@/lib/billing/entitlements";
import { dismissedTrialNoticeDate } from "@/lib/billing/trialNoticeStore";
import { localParts } from "@/lib/notifications/reminders";
import {
  resolveEnding,
  trialNoticeBody,
  trialNoticeFor,
  trialNoticeLine,
} from "@/lib/notifications/trialReminder";
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
  /**
   * ⚠️ AND ONLY WHEN THE GATE IS ACTUALLY ON.
   *
   * A cold review found the ordering hazard: the grace banner and the day-5 push
   * both fire off the entitlement regardless of `BILLING_GATE_ENABLED`, while
   * the NOTICE that explains them requires it. So a backfill run before the
   * switch is flipped — which is exactly the documented go-live order — gives
   * every beta account "Your free trial ends tomorrow" and a push about billing,
   * with the one screen that explains any of it suppressed.
   *
   * With the switch off nothing ends. Warning somebody about a deadline that is
   * not enforced is the same lie as not warning them about one that is.
   */
  /**
   * ⚠️ AND AN UNREADABLE READ IS NOT "NOTHING IS ENDING" (1.7).
   *
   * This keyed on `currentEntitlement()`, which answered null both for "no
   * active entitlement" and for "the entitlements table would not answer" — so a
   * failed read silently produced no banner, and an account days from losing
   * access got no warning at all.
   *
   * ⚠️ IT STILL RENDERS NO BANNER, AND THAT IS NOT THE SAME THING. The banner
   * names a DATE and an unreadable read has none, so there is nothing truthful to
   * render; no signed undated variant exists and inventing one is forbidden. What
   * changes is that the state is now NAMED and LOGGED rather than being
   * indistinguishable from the ordinary no-entitlement case — an account silently
   * lapsing with no warning is exactly the kind of thing that has to be visible
   * somewhere. The dashboard is re-rendered constantly, so a transient failure
   * corrects itself on the next load.
   */
  const access = await entitlementFacts();
  if (!access.known) {
    console.error(
      `[dashboard] the entitlement read failed for ${user.id}; no ending banner and no ` +
        `beta notice can be rendered this load — absent is NOT unknown, and neither is warned about`,
    );
  }
  const graceTrial =
    trialRow || !billingGateEnabled()
      ? null
      : graceAsTrial(access.known ? access.entitlement : null);
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
   * ⚠️ WHICH OF THE THREE ENDINGS THE BANNER IS ABOUT (`07` §3.4).
   *
   * This banner had ONE variant while the push had two, and the dashboard feeds
   * it `graceAsTrial(...)` — so a beta-grace account read **"Your free trial ends
   * 28 Aug."** on the surface `07` §3.6 says reaches everybody who opens the app.
   * They were never on a trial and have no card. It is the same falsehood the
   * push's grace variant already existed to prevent.
   *
   * Latent rather than live: `graceTrial` is only built when the gate is on, so
   * it would have surfaced for ~90 real accounts on launch morning.
   *
   * `courtesyUntil` is read in its OWN tolerant query for the reason `07` §3.4
   * gives: a column from an unapplied migration breaks the whole request it sits
   * in, and this must never be able to take the dashboard down. Unreadable
   * degrades to the neutral wording, never to the trial wording.
   */
  const courtesy = trialRow
    ? await courtesyForBanner(user.id)
    : { courtesyUntil: null as string | null | undefined, noun: null };
  const bannerEnding = resolveEnding({
    isBetaGrace: Boolean(graceTrial),
    courtesyUntil: courtesy.courtesyUntil,
    noun: courtesy.noun,
  });

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
  const betaEntitlement = access.known ? access.entitlement : null;

  /**
   * ⚠️ `05` §3.6b — THE FINAL ENTITLED DAY, AND THE NO-DOUBLE-BANNER RULE.
   *
   * Three conditions, and each one is a decision:
   *
   * **1. `trialNotice` must be null.** `07` §3.7, stated absolutely: "on any day a
   * user is eligible for both `05`'s final-day banner and a pair-2 reminder
   * banner, the reminder renders and the final-day banner is suppressed. The
   * promised reminder always wins." `05` §3.6b carries the reciprocal. It is
   * expressed as a ternary below rather than as two independent conditions, so
   * there is no state in which both can render — the rule holds by construction
   * rather than by two predicates agreeing.
   *
   * **2. The gate must be ON**, for the reason this file already gives about
   * `graceTrial` twenty lines up: "With the switch off nothing ends. Warning
   * somebody about a deadline that is not enforced is the same lie as not warning
   * them about one that is." Not a condition invented here — the same hazard, and
   * with the gate off it is a large one: the 86 beta graces are dated 31 August,
   * so an ungated version would tell 86 real accounts their plan ended on a day
   * nothing happened to them.
   *
   * **3. The entitlement's own `activeUntil` must fall on today**, in the user's
   * stored timezone, compared as LOCAL DATE KEYS. `05` §3.6b is "on the user's
   * final entitled day, and on that day only", and the date comes from the row
   * that governs access rather than from a subscription — which is what makes it
   * true for the beta cohort, who have no subscription at all.
   *
   * ⚠️ THE PARAGRAPH THAT STOOD HERE ASSERTED A FALSE PREMISE, AND IT IS
   * CORRECTED RATHER THAN DELETED (1.7).
   *
   * It read: "Absent is NOT unknown here, and the direction is deliberate:
   * `currentEntitlement()` returning null means no active entitlement, so there
   * is no final day to announce and the banner does not render."
   *
   * **The reasoning was sound and the premise was false.** `currentEntitlement`
   * routed through `listEntitlements`, which returns `[]` on a FAILED read, so
   * its null meant "no active entitlement" OR "we could not ask" — and the
   * comment claimed the distinction had been made when nothing had made it. It
   * was written down where the next reader would reuse it, which is the reason it
   * is quoted here rather than quietly replaced.
   *
   * The distinction is now real: `entitlementFacts()` says whether the read
   * worked, and `access.known` is checked above and logged when false.
   *
   * The rule the old paragraph was reaching for still holds and still governs
   * this line: a missing row must never be read as "today". `betaEntitlement` is
   * null in BOTH states, so the banner does not render in either — but only one
   * of them is a claim about the account, and only that one is silent by design.
   */
  /**
   * ⚠️ A DECLINED PAYMENT, ON THE HOME SCREEN (Group D).
   *
   * ## Its own query, and the reason is `trialRow`
   *
   * Widening the mirror read above to `.in("status", ["trialing", "past_due"])`
   * would change which row `limit(1)` returns for the trial banner, which is the
   * class of defect `screenFacts` carries three separate corrections for. One
   * narrow question, one narrow read, and `trialRow`'s selection is byte-identical
   * to what it was.
   *
   * ## ⚠️ AND ONLY WHEN THE GATE IS ACTUALLY ON
   *
   * The same condition `graceTrial` and the final-day banner both take, for the
   * reason this file already states twenty lines up: "With the switch off nothing
   * ends. Warning somebody about a deadline that is not enforced is the same lie
   * as not warning them about one that is." Both sentences make a claim about
   * ACCESS — "to keep access", "your account is read only" — and with the gate off
   * neither is true of anybody. `/billing`'s `DeclinedCard` is deliberately
   * ungated and is right to be: it answers a question that was asked, and its
   * first two sentences are about the CARD rather than about access.
   */
  const pastDueRow = billingGateEnabled()
    ? (
        await supabase
          .from("subscriptions")
          .select("status")
          .eq("user_id", user.id)
          .eq("status", "past_due")
          .limit(1)
      ).data?.[0]
    : null;
  /**
   * ⚠️ THE DATE IS THE ENTITLEMENT'S, NOT THE MIRROR'S. `08` §3.5, and
   * `DeclinedCard` carries the same warning: `access.endDate` is the value
   * `markPastDue` writes and the table that decides access, whereas the mirror's
   * period end on a past-due subscription is the end of a period nobody paid for.
   * Formatted here, on the server, in the user's own zone, like every other date
   * on this screen.
   */
  const pastDueLine = pastDueBannerFor({
    isPastDue: Boolean(pastDueRow),
    accessKnown: access.known,
    accessLive: access.known ? access.accessLive : false,
    graceEndsOn:
      access.known && access.endDate ? formatAccessDate(access.endDate, trialTz) : null,
  });

  const finalDayEntitlement = billingGateEnabled() && !trialNotice ? betaEntitlement : null;
  const planEndsToday = Boolean(
    finalDayEntitlement?.activeUntil &&
      localParts(new Date(finalDayEntitlement.activeUntil), trialTz).dateKey ===
        localParts(new Date(), trialTz).dateKey,
  );

  /**
   * ⚠️ AND THE NOTICE IS WITHHELD ON AN UNREADABLE READ, WHICH IS THE SAFE
   * DIRECTION FOR THIS ONE SPECIFICALLY (1.7).
   *
   * It shows ONCE, ever, and it is the screen that explains what happens to a
   * beta account's access. Rendering it from a read that failed would risk
   * spending somebody's only sighting of it on a load that could not confirm they
   * are even in the cohort. `access.known` is required rather than inferred from
   * `betaEntitlement` being null, so the withhold is a decision rather than a
   * side effect — and nothing is burned: the cookie is written only on dismissal,
   * so the next load shows it.
   */
  const showBetaNotice =
    billingGateEnabled() &&
    access.known &&
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
        // ⚠️ ONE SLOT, ONE TERNARY, so `07` §3.7's no-double-banner rule cannot be
        // broken by two predicates drifting apart: the reminder wins, and `05`
        // §3.6b's final-day line is only ever the ELSE branch.
        /**
         * ⚠️ THE DECLINED-PAYMENT LINE SITS BETWEEN THE TWO, and the order is a
         * decision each way.
         *
         * BELOW the reminder, because `07` §3.7 is absolute: "the promised
         * reminder always wins". The two are close to mutually exclusive anyway —
         * `trialReminderVerdict` returns null for any status that is not
         * `trialing`, and a `past_due` row is not one — so this can only bind on
         * an account holding both, which is the anomaly `startTrial`'s lease
         * exists to prevent.
         *
         * ABOVE the final-day line, which they CAN both be eligible for: a
         * past-due account whose grace ends today satisfies both conditions.
         * "Your plan ends today." says neither why nor what to do; the declined
         * line says both and taps through to the screen that fixes it.
         *
         * Still one ternary, so `07` §3.7's no-double-banner rule holds by
         * construction rather than by three predicates agreeing.
         */
        trialBanner={
          trialNotice ? (
            <TrialEndingBanner
              key="trial-ending"
              line={trialNoticeLine(trialNotice, bannerEnding)}
              body={trialNoticeBody(bannerEnding)}
              forDate={trialNotice.forDate}
              userId={user.id}
            />
          ) : pastDueLine ? (
            <PaymentFailedBanner key="payment-failed" line={pastDueLine} />
          ) : planEndsToday ? (
            <PlanEndsTodayBanner key="plan-ends-today" />
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

/**
 * The courtesy period behind this banner, and the noun for its copy.
 *
 * ⚠️ ITS OWN QUERY, TOLERATING AN UNAPPLIED MIGRATION (`07` §3.4, and the same
 * shape `/billing` uses). `courtesy_until` arrives with
 * `supabase/billing/003_courtesy_until.sql`, applied by hand, and **a column from
 * an unapplied migration breaks the ENTIRE PostgREST request it appears in** — so
 * folding this into the dashboard's main reads would take the whole screen down
 * in the window between a deploy and the SQL being pasted.
 *
 * ⚠️ `undefined` (unreadable) is NOT `null` (read, absent). `resolveEnding`
 * degrades the first to the neutral wording and reads the second as a real trial.
 * Collapsing them would tell a courtesy customer their TRIAL was ending.
 *
 * The noun comes from the PLAN's interval, never from the status: during a
 * courtesy period Stripe reports `trialing`, which is exactly why the grant works
 * at all, so a status-based noun would call every courtesy month a "free week".
 * Unresolvable returns null and the copy falls back to neutral rather than
 * guessing between "week" and "month" in a billing notice.
 */
async function courtesyForBanner(
  userId: string,
): Promise<{ courtesyUntil: string | null | undefined; noun: "week" | "month" | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("courtesy_until, stripe_price_id")
    .eq("user_id", userId)
    .eq("status", "trialing")
    .order("trial_ends_at", { ascending: true })
    .limit(1);
  if (error) return { courtesyUntil: undefined, noun: null };

  const row = data?.[0] as Record<string, unknown> | undefined;
  const courtesyUntil = (row?.courtesy_until as string | null) ?? null;
  if (!courtesyUntil) return { courtesyUntil: null, noun: null };

  const priceId = (row?.stripe_price_id as string | null) ?? null;
  if (!priceId) return { courtesyUntil, noun: null };
  const interval = (await loadPricesSafe()).find((p) => p.priceId === priceId)?.interval;
  const noun = interval === "month" || interval === "year" ? "month" : interval === "week" ? "week" : null;
  return { courtesyUntil, noun };
}
