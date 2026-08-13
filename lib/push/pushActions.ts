"use server";

/**
 * Server actions for Web Push subscription state (Spec 14, Phase 1).
 *
 * House pattern (mirrors lib/home/syncActions.ts): identity is ALWAYS derived from
 * the verified session (auth.getUser()), never trusted from the client; RLS is the
 * backstop ((SELECT auth.uid()) = user_id on push_subscriptions). These return
 * { ok } and avoid throwing — a network blip when (un)subscribing should surface a
 * clean failure to the toggle, not crash.
 *
 * The push_subscriptions table + its RLS/grant already existed in the base schema
 * (the "deferred Web Push storage"); this only writes it. The intent flag
 * profiles.notifications_enabled (added in supabase/notifications/001) records
 * whether the user wants push AT ALL, so send-push can skip an opted-out user even
 * while the OS permission is still "granted".
 */

import { revalidatePath } from "next/cache";
import webpush from "web-push";

import { createClient } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/lib/notifications/reminders";

type Ok = { ok: boolean };

// Server-side VAPID config for the in-app Phase-1 sender (the "Send test
// notification" path). To keep deploy simple, the public key is reused from the
// SAME NEXT_PUBLIC value the client uses (NEXT_PUBLIC vars are also readable
// server-side) — so Vercel only needs TWO new settings:
// NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (the private key stays
// server-only, never in the bundle). VAPID_PUBLIC_KEY is an optional override.
// VAPID_SUBJECT defaults below. The Phase-2 scheduler uses the same secrets via
// the send-push Edge Function (supabase/functions/send-push).
const VAPID_PUBLIC =
  process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:notifications@trackdco.app";

/** The decomposed PushSubscription the client extracts and sends up. */
export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
  /** The device's IANA timezone, so the scheduler fires in the user's local time. */
  timezone?: string | null;
};

/** Verified session + user id, or null when signed out. Not exported, so it is
 *  exempt from "use server" serialisation rules and may return a client. */
async function sessionCtx() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

/**
 * Upsert this device's push subscription and flip the user's intent flag ON.
 * Conflict key is (user_id, endpoint) — re-subscribing the same device refreshes
 * last_seen_at instead of duplicating. Validates the three required fields at the
 * boundary before the write.
 */
export async function savePushSubscription(
  sub: PushSubscriptionInput,
): Promise<Ok> {
  try {
    if (!sub?.endpoint || !sub?.p256dh || !sub?.auth) return { ok: false };
    const ctx = await sessionCtx();
    if (!ctx) return { ok: false };

    const { error: subError } = await ctx.supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: ctx.userId,
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
          user_agent: sub.userAgent ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,endpoint" },
      );
    if (subError) return { ok: false };

    // Flip the intent flag on, and capture the device timezone in the same write
    // so reminders fire in the user's local time (validated; skipped if bad).
    const profileUpdate: { notifications_enabled: boolean; timezone?: string } = {
      notifications_enabled: true,
    };
    if (isValidTimeZone(sub.timezone)) profileUpdate.timezone = sub.timezone;
    const { error: flagError } = await ctx.supabase
      .from("profiles")
      .update(profileUpdate)
      .eq("id", ctx.userId);

    revalidatePath("/notifications");
    revalidatePath("/dashboard");
    return { ok: !flagError };
  } catch (e) {
    console.error("savePushSubscription failed", e);
    return { ok: false };
  }
}

/**
 * RE-REGISTER AN EXISTING SUBSCRIPTION AND NOTHING ELSE.
 *
 * The row, and only the row: no intent flag, no timezone. `savePushSubscription`
 * writes all three because it backs a deliberate tap on Enable, where all three
 * are what the user just asked for. This backs an automatic mount-time resync
 * (see `resyncSubscription`), where they are not.
 *
 * ## The two writes it deliberately does not make
 *
 * **The timezone.** `profiles.timezone` is the clock the entire reminder engine
 * runs on — it decides the local day, the fire times and quiet hours. Carrying
 * the device's zone into an automatic resync meant that opening the app once on
 * a laptop in another region silently moved a Sydney user's 08:00 reminder to
 * 08:00 New York, and back again when they next opened their phone. The zone is
 * still captured on a real subscribe and editable in Settings, which are the two
 * places the user is actually saying where they are.
 *
 * **The intent flag.** `removePushSubscription` is a GLOBAL opt-out that deletes
 * only the calling device's row, so another device can still hold one. Setting
 * `notifications_enabled = true` from a mount-time resync would let stale server
 * state on that second device reverse the opt-out by navigation alone.
 */
export async function refreshDeviceSubscription(
  sub: PushSubscriptionInput,
): Promise<Ok> {
  try {
    if (!sub?.endpoint || !sub?.p256dh || !sub?.auth) return { ok: false };
    const ctx = await sessionCtx();
    if (!ctx) return { ok: false };
    const { error } = await ctx.supabase.from("push_subscriptions").upsert(
      {
        user_id: ctx.userId,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        user_agent: sub.userAgent ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" },
    );
    // No `revalidatePath` either: this runs on mount, and invalidating the route
    // that invoked it would re-run the dashboard's server work on every load.
    return { ok: !error };
  } catch (e) {
    console.error("refreshDeviceSubscription failed", e);
    return { ok: false };
  }
}

/**
 * Remove this device's subscription (by endpoint) and flip the intent flag OFF.
 * Toggling notifications off is a global opt-out per Spec 14 (suppresses sends
 * even while OS permission is still granted).
 */
export async function removePushSubscription(endpoint: string): Promise<Ok> {
  try {
    const ctx = await sessionCtx();
    if (!ctx) return { ok: false };

    if (endpoint) {
      await ctx.supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", ctx.userId)
        .eq("endpoint", endpoint);
    }

    const { error: flagError } = await ctx.supabase
      .from("profiles")
      .update({ notifications_enabled: false })
      .eq("id", ctx.userId);

    revalidatePath("/notifications");
    revalidatePath("/dashboard");
    return { ok: !flagError };
  } catch (e) {
    console.error("removePushSubscription failed", e);
    return { ok: false };
  }
}

/**
 * RELEASE THIS DEVICE ON SIGN-OUT — delete the row, keep the intent flag.
 *
 * ## The failure this closes
 *
 * A browser's `PushSubscription` belongs to the service-worker registration and
 * the origin, not to the session. Signing out cleared the Supabase cookies and
 * left the `push_subscriptions` row standing, so the cron went on posting to that
 * endpoint under the DEPARTED user's id. Sign in as somebody else on the same
 * phone — a beta tester, a second account, a handed-over device — and their phone
 * receives the first user's compound names, their missed-dose nudges, and their
 * trial notice, which deep-links into the NEW user's billing screen. The runner
 * then reads the successful send as delivery and stamps the trial reminder as
 * sent, so the person whose card is about to be charged is never warned.
 *
 * `supabase/trackd_schema_v0_4_2.sql` already specified this: delete the row "when
 * a send returns HTTP 404/410 **or the user logs out on a device**". Only the
 * first half was built.
 *
 * ## Why the intent flag is deliberately left alone
 *
 * `removePushSubscription` is the user saying "stop sending me things" and turns
 * `notifications_enabled` off. Signing out says nothing of the kind, and clearing
 * it would silently disarm reminders on the user's OTHER devices, and on this one
 * when they sign back in — a notification outage nobody asked for, discovered
 * only by the doses that went un-nudged. The row is what makes a send reach this
 * phone; removing it is exactly enough.
 *
 * Best-effort by design: it runs immediately before a sign-out that must proceed
 * regardless. A failure here is logged, not surfaced.
 */
export async function releaseDeviceSubscription(endpoint: string): Promise<Ok> {
  try {
    if (!endpoint) return { ok: false };
    const ctx = await sessionCtx();
    if (!ctx) return { ok: false };
    const { error } = await ctx.supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", ctx.userId)
      .eq("endpoint", endpoint);
    if (error) {
      console.error("releaseDeviceSubscription failed", error.message);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.error("releaseDeviceSubscription failed", e);
    return { ok: false };
  }
}

/**
 * Fire a real test push to the CURRENT user's devices — the "Send test
 * notification" affordance in Settings, and the proof the pipeline works
 * end-to-end. Sends in-app via web-push (Node), so it ships with the Vercel
 * deploy: once the app is pushed with the VAPID env vars set, the test works with
 * no separate Edge Function deploy (Phase 1). It reads the user's OWN
 * subscriptions under RLS (userId from the verified session, never the client) and
 * prunes any dead endpoint (404/410) — so a user can only ever test-send to
 * themselves. The Phase-2 scheduler will use the send-push Edge Function (same
 * VAPID secrets, service role) to reach arbitrary users.
 *
 * Returns { ok: false } (surfaced cleanly, never throws) when VAPID isn't
 * configured or there's no live subscription yet.
 */
export async function sendTestNotification(): Promise<Ok> {
  try {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return { ok: false };
    const ctx = await sessionCtx();
    if (!ctx) return { ok: false };

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

    const { data: subs, error } = await ctx.supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", ctx.userId);
    if (error || !subs || subs.length === 0) return { ok: false };

    const body = JSON.stringify({
      title: "Trackd",
      body: "Test notification. Push is working.",
      url: "/dashboard",
      tag: "trackd-test",
    });

    const dead: string[] = [];
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint as string,
              keys: { p256dh: s.p256dh as string, auth: s.auth as string },
            },
            body,
            // Socket timeout (ms) so a stalled push endpoint can't pin the server
            // action open to the platform's max function duration.
            { timeout: 5000 },
          );
          sent += 1;
        } catch (err) {
          const code = (err as { statusCode?: number })?.statusCode;
          // Endpoint gone (unsubscribed / expired) — prune the dead row.
          if (code === 404 || code === 410) dead.push(s.endpoint as string);
        }
      }),
    );

    if (dead.length > 0) {
      await ctx.supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", ctx.userId)
        .in("endpoint", dead);
    }

    return { ok: sent > 0 };
  } catch (e) {
    console.error("sendTestNotification failed", e);
    return { ok: false };
  }
}
