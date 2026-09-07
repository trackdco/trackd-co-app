/**
 * Scheduled reminder runner (Spec 14, Phase 2). The cron hits this endpoint every
 * ~15 min; it resolves the target accounts (all opted-in users — see FOUNDERS_ONLY)
 * and runs each through the reminder engine, which itself respects each user's
 * reminder time, quiet hours, and once-per-day dedupe (lib/notifications/runner.ts).
 *
 * Secured by a shared CRON_SECRET (Bearer). Uses the Supabase SERVICE ROLE to read
 * other users' due doses + subscriptions (the only place the app needs elevated
 * DB access) — so this needs SUPABASE_SECRET_KEY + CRON_SECRET set in the env.
 *
 * Node runtime (web-push needs Node crypto). Wire-up: a Supabase pg_cron job
 * POSTs here on a schedule (see Context/next-tasks.md / architecture.md).
 */
import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { isFounder } from "@/lib/admin";
import { runForUser } from "@/lib/notifications/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Open to all opted-in users (beta). Set back to true to fall back to founders-only.
const FOUNDERS_ONLY = false;

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const auth = req.headers.get("authorization") ?? "";
  // Constant-time compare so the Bearer token can't be recovered byte-by-byte
  // from response timing. Still fails closed when CRON_SECRET is unset. The
  // length check is required (timingSafeEqual throws on unequal lengths) and
  // leaks only the token's length, which is not secret.
  const expected = `Bearer ${secret}`;
  const authBuf = Buffer.from(auth);
  const expectedBuf = Buffer.from(expected);
  const authorized =
    secret.length > 0 &&
    authBuf.length === expectedBuf.length &&
    timingSafeEqual(authBuf, expectedBuf);
  if (!authorized) {
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

  // Resolve the target user IDs.
  let targetIds: string[];
  if (FOUNDERS_ONLY) {
    // Small founder list: read accounts and filter by founder email.
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) {
      return NextResponse.json({ error: listErr.message }, { status: 500 });
    }
    targetIds = (list?.users ?? [])
      .filter((u) => isFounder(u.email))
      .map((u) => u.id);
  } else {
    // Everyone who opted into notifications — scales past the 200-account
    // listUsers cap and skips non-subscribers. runForUser re-checks the intent
    // flag + subscriptions, so this is only the candidate set. (Batch/paginate
    // if the opted-in count ever gets large enough to strain one invocation.)
    const { data: profs, error: profErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("notifications_enabled", true);
    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }
    targetIds = (profs ?? []).map((p) => p.id as string);
  }

  /**
   * DIAGNOSTIC MODE: `?dryRun=1`, optionally with `&userId=<uuid>`.
   *
   * Reads and decides exactly as a live run does, and sends nothing. It exists
   * because this endpoint's response was the only window into the runner and it
   * had been painted over: `dueCount` and `lowCount` were computed on every tick
   * and dropped on the floor here, so a night the runner announced three
   * unlogged doses that were all sitting logged in the database left no trace
   * anywhere. `userId` narrows it to one account, which is what you want when
   * reproducing a report rather than surveying everybody.
   */
  const params = new URL(req.url).searchParams;
  const dryRun = params.get("dryRun") === "1";
  const onlyUser = params.get("userId");
  if (onlyUser) {
    targetIds = targetIds.filter((id) => id === onlyUser);
  }

  let sent = 0;
  const results: Array<{
    id: string;
    sent: number;
    dueCount?: number;
    loggedCount?: number;
    lowCount?: number;
    unreadable?: string[];
    reason?: string;
    trialReminder?: string;
  }> = [];
  for (const id of targetIds) {
    try {
      const r = await runForUser(supabase, id, { force: false, dryRun });
      sent += r.sent;
      // `trialReminder` rides along because this response is the ONLY output the
      // cron has, and the trial reminder is a promise two screens make out loud.
      // Without it, "nobody was reminded" and "the reminder is broken" look
      // identical from outside — which is how the promise went unkept for four
      // days without anything noticing.
      /**
       * `dueCount` and `loggedCount` RIDE ALONG, and they are the pair that
       * makes this response falsifiable.
       *
       * They were computed and discarded, which meant "the user was nagged
       * because they logged nothing" and "the user was nagged because we could
       * not read what they logged" produced byte-identical output. The second of
       * those happened. `unreadable` names the failed read when there was one,
       * so the two can never be confused again.
       */
      results.push({
        id,
        sent: r.sent,
        dueCount: r.dueCount,
        loggedCount: r.loggedCount,
        lowCount: r.lowCount,
        ...(r.unreadable?.length ? { unreadable: r.unreadable } : {}),
        reason: r.reason,
        trialReminder: r.trialReminder,
      });
    } catch (e) {
      console.error("[cron] runForUser failed", id, e);
      results.push({ id, sent: 0, reason: "error" });
    }
  }

  return NextResponse.json({ ran: targetIds.length, sent, dryRun, results });
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
