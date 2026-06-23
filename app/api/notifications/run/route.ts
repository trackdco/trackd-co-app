/**
 * Scheduled reminder runner (Spec 14, Phase 2). The cron hits this endpoint every
 * ~15 min; it resolves the founder accounts (founders-first rollout) and runs each
 * through the reminder engine, which itself respects each user's reminder time,
 * quiet hours, and once-per-day dedupe (lib/notifications/runner.ts).
 *
 * Secured by a shared CRON_SECRET (Bearer). Uses the Supabase SERVICE ROLE to read
 * other users' due doses + subscriptions (the only place the app needs elevated
 * DB access) — so this needs SUPABASE_SECRET_KEY + CRON_SECRET set in the env.
 *
 * Node runtime (web-push needs Node crypto). Wire-up: a Supabase pg_cron job
 * POSTs here on a schedule (see Context/next-tasks.md / architecture.md).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { isFounder } from "@/lib/admin";
import { runForUser } from "@/lib/notifications/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Founders-first: flip to false to open scheduled reminders to all opted-in users.
const FOUNDERS_ONLY = true;

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    return NextResponse.json({ error: "service-not-configured" }, { status: 500 });
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // TEMP diagnostic (?debug=1): surfaces whether the service client can actually
  // read past RLS + which key TYPE was set, without leaking the secret. Remove once
  // the scheduler is confirmed.
  if (new URL(req.url).searchParams.get("debug") === "1") {
    const prof = await supabase
      .from("profiles")
      .select("id, notifications_enabled")
      .limit(3);
    return NextResponse.json({
      debug: true,
      keyHint: key ? key.slice(0, 10) : "(none)",
      profErr: prof.error?.message ?? null,
      profCount: prof.data?.length ?? 0,
    });
  }

  // Resolve the target accounts. Founders-first reads the small founder list;
  // opening up later would page through all users with notifications_enabled.
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }
  const targets = (list?.users ?? []).filter((u) =>
    FOUNDERS_ONLY ? isFounder(u.email) : Boolean(u.email),
  );

  let sent = 0;
  const results: Array<{ id: string; sent: number; reason?: string }> = [];
  for (const u of targets) {
    try {
      const r = await runForUser(supabase, u.id, { force: false });
      sent += r.sent;
      results.push({ id: u.id, sent: r.sent, reason: r.reason });
    } catch (e) {
      console.error("[cron] runForUser failed", u.id, e);
      results.push({ id: u.id, sent: 0, reason: "error" });
    }
  }

  return NextResponse.json({ ran: targets.length, sent, results });
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
