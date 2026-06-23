// ============================================================
//  send-push — Trackd Web Push sender (Spec 14)
// ============================================================
//
//  The reusable send primitive (Spec 14 D7). Input: { userId, payload }.
//  Loads that user's push_subscriptions with the SERVICE ROLE (bypasses RLS),
//  sends `payload` to each endpoint via Web Push + VAPID, and prunes any endpoint
//  the push service reports as gone (HTTP 404/410). The Phase-2 reminder scheduler
//  will call this SAME function unchanged.
//
//  NOTE: this is the PHASE-2 (scheduler) primitive — it is NOT needed to test
//  Phase 1. The "Send test notification" button sends in-app via web-push in a
//  Node server action (lib/push/pushActions.ts sendTestNotification), which ships
//  with the Vercel deploy. Deploy this function only when the scheduler lands.
//
//  Respects intent: if the user's profiles.notifications_enabled is false, it
//  sends nothing — toggling off suppresses sends even while OS permission is still
//  "granted" (Spec 14 D6).
//
//  Auth (defence in depth): privileged callers (the scheduler, using the service
//  key as the bearer) may target any userId. A non-privileged caller (a logged-in
//  user's JWT, e.g. the "Send test notification" button) is restricted to their
//  OWN id, read from the platform-verified JWT — so a user can never push to
//  someone else, even by editing the body.
//
//  Deploy (founder step — Claude can't reach the Supabase project):
//    supabase functions deploy send-push
//    supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
//      VAPID_SUBJECT=mailto:notifications@trackdco.app
//  (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected. If the project
//  relies on the new secret key instead, also set SUPABASE_SECRET_KEY.)
//
//  If the Node-crypto path in web-push misbehaves on the Edge runtime, the
//  documented fallback is to sign the VAPID JWT with crypto.subtle and POST to the
//  endpoint directly — try web-push first (Spec 14 Step 6).
// ============================================================

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

type Payload = { title?: string; body?: string; url?: string; tag?: string };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/** Read `sub` out of a JWT payload. The platform verifies the JWT (verify_jwt is
 *  on by default), so the claim is trustworthy; we only use it to NARROW scope. */
function jwtSub(token: string): string | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    // Decode as UTF-8 — atob yields a binary string, so JSON.parse(atob(...))
    // would corrupt any non-ASCII claim. We only read `sub`, but be correct.
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const decoded = JSON.parse(new TextDecoder().decode(bytes));
    return typeof decoded.sub === "string" ? decoded.sub : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    "";
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:notifications@trackdco.app";

  if (!supabaseUrl || !serviceKey) return json({ error: "server not configured (supabase)" }, 500);
  if (!vapidPublic || !vapidPrivate) return json({ error: "server not configured (vapid)" }, 500);

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  let body: { userId?: string; payload?: Payload };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  // Resolve the target user, restricting non-privileged callers to themselves.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const isPrivileged = token.length > 0 && token === serviceKey;
  let userId = body.userId;
  if (!isPrivileged) {
    const self = jwtSub(token);
    if (!self) return json({ error: "unauthorized" }, 401);
    userId = self; // ignore any claimed userId in the body
  }
  if (!userId) return json({ error: "missing userId" }, 400);

  const payload: Payload = {
    title: body.payload?.title ?? "Trackd",
    body: body.payload?.body ?? "",
    url: body.payload?.url ?? "/dashboard",
    tag: body.payload?.tag,
  };

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Intent gate: a user opted out receives nothing (Spec 14 D6).
  const { data: profile } = await supabase
    .from("profiles")
    .select("notifications_enabled")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.notifications_enabled) {
    return json({ sent: 0, skipped: "notifications_disabled" });
  }

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error) return json({ error: error.message }, 500);
  if (!subs || subs.length === 0) return json({ sent: 0, subscriptions: 0 });

  const body_str = JSON.stringify(payload);
  let sent = 0;
  const pruned: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body_str,
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        // Endpoint gone (unsubscribed / expired) — prune the dead row.
        if (status === 404 || status === 410) pruned.push(s.endpoint);
      }
    }),
  );

  if (pruned.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .in("endpoint", pruned);
  }

  return json({ sent, subscriptions: subs.length, pruned: pruned.length });
});
