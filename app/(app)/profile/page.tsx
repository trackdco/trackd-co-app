import type { Metadata } from "next";

import { ProfileScreen } from "@/components/profile/ProfileScreen";
import { courtesyUntilFor } from "@/lib/billing/courtesy";
import { entitlementFacts } from "@/lib/billing/entitlements";
import { billingGateEnabled } from "@/lib/billing/gate";
import { planLabelFor } from "@/lib/billing/manage";
import { accountNameFor } from "@/lib/profile/name";
import { hasOpenRefundRequest } from "@/lib/account/openRefundRequest";
import { BILLABLE_STATUSES } from "@/lib/billing/cancel";
import { SIGNED_URL_TTL } from "@/lib/storage/signedUrl";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profile · Trakabl" };

/**
 * Profile tab — the data wrapper. Reads only the caller's own profiles row
 * (RLS-scoped) and hands it to `ProfileScreen`. The (app) layout has already
 * enforced auth + the 18+/ToS gate, so `user` is guaranteed here; user_metadata
 * is used for display only, never for access decisions.
 *
 * Settings was dissolved into this screen by spec 09 · part two — its route,
 * page, form and server action are gone, and `updatePhysical` in
 * `./actions.ts` is the old `updateSettings` with its validation unchanged.
 */
export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The (app) layout redirects an unauthenticated user, but layout and page
  // render concurrently in the App Router — so the page can't lean on that and
  // must guard itself, or `user.id` below throws (and is logged server-side)
  // before the redirect lands. Render nothing; the layout's redirect is the
  // actual response. Same pattern as `dashboard/page.tsx:65-70`.
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    // `tier` is no longer read: the plan label comes from `entitlements`.
    .select(
      "created_at, sex, date_of_birth, height_cm, weight_kg, goal, units_preference, avatar_path, display_name",
    )
    .eq("id", user.id)
    .maybeSingle();

  // The avatar bucket is private — display via a short-lived signed URL. A fresh
  // URL is minted each render (the page revalidates), so it never reads stale.
  let avatarUrl: string | null = null;
  if (profile?.avatar_path) {
    const { data: signed } = await supabase.storage
      .from("avatars")
      .createSignedUrl(profile.avatar_path, SIGNED_URL_TTL);
    avatarUrl = signed?.signedUrl ?? null;
  }

  // The displayed weight follows the Weight view: the latest logged reading,
  // falling back to the onboarding snapshot, then "—". So logging in the weight
  // section updates here too.
  const { data: latestWeight } = await supabase
    .from("weight_logs")
    .select("weight")
    // Scoped explicitly, like every other read on this page. RLS already answers
    // for it; defence in depth is the house pattern and this was the one query
    // that relied on the backstop alone.
    .eq("profile_id", user.id)
    .order("logged_for", { ascending: false })
    .limit(1)
    .maybeSingle();
  const displayWeightKg = latestWeight?.weight ?? profile?.weight_kg ?? null;

  /* ----- display identity (display only; never an access decision) ---------
   *
   * TWO NAMES ON THIS SCREEN, ON PURPOSE (Adrian, 2026-09-03).
   *
   *  - The HEADING answers "whose account is this", so it is Google's first +
   *    last and it sits directly above the email, which is the same kind of
   *    fact.
   *  - The "Display name" row in the details card answers "what does the app
   *    call you". It is one token, it is the thing Home greets you with, and it
   *    is the only one of the two the user can edit.
   *
   * The label on the row is what stops that reading as a bug rather than as a
   * decision: a row simply called "Name" sitting under a two-word heading looks
   * like it ought to match it.
   *
   * The heading's fallback changed with it. It used to go straight from "Google
   * has no name" to the raw EMAIL, so an account that told us its name on the
   * first screen of onboarding was still titled "adrianschimizzi1". It now falls
   * back to the display name first; the email is printed underneath either way.
   */
  const authFullName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    null;
  const email = user?.email ?? "";
  const displayName = (profile?.display_name as string | null | undefined) ?? null;
  const accountName = accountNameFor({ authFullName, displayName });
  const hasName = accountName !== null;

  /**
   * THE PLAN LABEL COMES FROM `entitlements` NOW, NOT `profiles.tier`.
   *
   * This read `tier` and hardcoded "Beta · Pro" while `/billing` read the
   * entitlement, so one user could be told two different things on two screens.
   * `tier` is historical — `grants/003` locked it to the service role and
   * `architecture.md` makes `entitlements` the only table that decides anything
   * — and `planLabelFor` is now the single answer both screens ask for.
   *
   * The "Beta ·" prefix is gone on Adrian's call (2026-08-12): "we won't be in
   * beta by then." What somebody with no entitlement is told is a named constant
   * in `manage.ts`, with the reason it is currently "Pro" written next to it.
   */
  /**
   * ⚠️ THE WHOLE ENTITLEMENT, AND THE COURTESY MARKER. TWO DEFECTS, ONE CALL.
   *
   * This passed `entitlement?.source ?? null` and a bare `{status}`, and both
   * halves under-supplied the shared function:
   *
   *   - Without `activeUntil`, a founder's comp and a beta fortnight two days
   *     from ending both arrive as the string `"comp"` and read identically.
   *     That is `08-billing-screen.md` §3.6's defect, and fixing it only on
   *     Billing would have left it standing here.
   *   - Without `courtesyUntil`, a customer of two years on a free month read
   *     **"Free trial"** on this pill while `/billing` read **"Pro"**. That is a
   *     Q88 state disagreement and it was live.
   *
   * Only the ARGUMENTS change. The pill, the layout and the rendering are
   * untouched, and no date, timezone or formatter enters `planLabelFor` — the
   * date belongs to Billing's Access row, which has a formatter and a full-width
   * value. This pill still shows one short label (Adrian, 2026-08-18).
   *
   * ⚠️ `courtesyUntilFor` IS ITS OWN TOLERANT QUERY, matching `/billing` rather
   * than folding the column into the select below. Folded, an unapplied `003`
   * would kill the STATUS read alongside it and flip a genuine trialist's pill
   * from "Free trial" to "Pro" — a wrong label in the over-promising direction,
   * caused by nothing but a migration gap. See `lib/billing/courtesy.ts`.
   */
  /**
   * ⚠️ DISPLAY ONLY, so an unreadable read and an absent row may collapse HERE —
   * the pill renders the lapsed label either way and asserts nothing about why.
   * The collapse is written out rather than implied, because the same `null` on
   * the dashboard and in the save-offer guard feeds DECISIONS and may not.
   */
  const access = await entitlementFacts();
  const entitlement = access.known ? access.entitlement : null;
  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1);
  /**
   * ⚠️ D59's MONEY LINE ASKS ITS OWN QUESTION, AND FAILS OPEN.
   *
   * ## Not `subRow`, and that is the fix
   *
   * `subRow` above is ordered by `updated_at` and takes ONE row, because the
   * plan-label pill wants the most recently touched subscription. **"Does a
   * billable subscription exist" is a different question**, and answering it
   * from that row is precisely the defect `cancel.ts:28-46` records as
   * MEASURED: the mirror write bumped `updated_at` on the row it had just
   * cancelled, so `limit(1)` pinned to the dead one while a live subscription
   * was still running. A user holding a live yearly plus an older `canceled`
   * trial would see NO money line, type DELETE, and forfeit paid time never
   * having read the sentence D59 exists to show them.
   *
   * So it asks the narrow question directly, the way `screenFacts.ts:200`
   * already does on the billing screen.
   *
   * ## ⚠️ A FAILED READ SHOWS THE LINE
   *
   * `error` was discarded here, which collapsed "there is no subscription"
   * into "I could not check" and hid a money disclosure from somebody who may
   * be about to forfeit paid time. **Absent is not unknown.** The direction that
   * costs less when wrong is showing the sentence to somebody who has no
   * subscription - the same ruling, for the same reason, as
   * `openRefundRequest.ts:64-69` twenty lines below. A null `data` with no
   * error is a read that did not happen and takes the same branch.
   *
   * The cancel itself still asks Stripe. This only decides one sentence.
   */
  const { data: billableRows, error: billableError } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .in("status", [...BILLABLE_STATUSES])
    .limit(1);

  if (billableError) {
    console.error(
      "[delete] billable-subscription check failed, showing the money line anyway:",
      billableError.message,
    );
  }

  const hasBillableSubscription =
    billableError || !billableRows ? true : billableRows.length > 0;

  // D56. Through the caller OWN RLS-scoped client - a user may select their own
  // beta_feedback rows, so this needs no service role.
  const openRefundRequest = await hasOpenRefundRequest(supabase, user.id);

  const courtesyUntil = await courtesyUntilFor(user.id);
  const planLabel = planLabelFor(
    entitlement,
    subRow?.[0]
      ? { status: subRow[0].status as string, courtesyUntil }
      : null,
    // The gate's switch decides this too. With it off, an account with no
    // entitlement genuinely has the whole product and the pill says "Pro"; with
    // it on, the same account is read-only and saying "Pro" would be a lie on
    // the screen somebody opened to find out why. See `lib/billing/manage.ts`.
    billingGateEnabled(),
  );

  return (
    <ProfileScreen
      userId={user.id}
      initials={getInitials(accountName, email)}
      avatarUrl={avatarUrl}
      displayName={accountName ?? (email || "Your account")}
      hasName={hasName}
      email={email}
      planLabel={planLabel}
      hasBillableSubscription={hasBillableSubscription}
      hasOpenRefundRequest={openRefundRequest}
      physical={{
        displayName,
        sex: profile?.sex ?? null,
        goal: profile?.goal ?? null,
        unitsPreference: profile?.units_preference ?? "metric",
        heightCm: profile?.height_cm ?? null,
        age: ageFromDob(profile?.date_of_birth),
        weightKg: displayWeightKg == null ? null : Number(displayWeightKg),
      }}
    />
  );
}

/* ── Pure formatting helpers ─────────────────────────────────────── */

// First Unicode code point (not UTF-16 unit) so astral chars / emoji in a
// display name don't split a surrogate pair into mojibake.
function firstCodePoint(s: string | undefined): string {
  return s ? ([...s][0] ?? "") : "";
}

function getInitials(name: string | null, email: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    const first = firstCodePoint(parts[0]);
    const last = parts.length > 1 ? firstCodePoint(parts[parts.length - 1]) : "";
    return (first + last || first || "?").toUpperCase();
  }
  const local = email.split("@")[0] ?? "";
  return ([...local].slice(0, 2).join("") || "?").toUpperCase();
}

function ageFromDob(iso?: string | null): number | null {
  if (!iso) return null;
  const dob = new Date(iso);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  // Guard nonsensical values (future / bad DOB) so the row falls back to "—"
  // like every other field, rather than rendering e.g. "-4 yrs".
  return age >= 0 && age < 150 ? age : null;
}
