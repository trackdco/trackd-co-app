/**
 * THE BETA BACKFILL. Run ONCE, by hand, on the day billing switches on.
 *
 * Grants every existing account an `entitlements` row so that turning on
 * `BILLING_GATE_ENABLED` does not put ~90 people who were promised nothing into
 * read-only overnight. See `lib/billing/betaGrace.ts` for the policy and why the
 * numbers are what they are.
 *
 *   COMP_EMAILS      comp, no expiry. Free forever.
 *   everyone else    comp, expiring in BETA_GRACE_DAYS. Then read-only.
 *
 * ## Why a route and not a SQL file
 *
 * The comp list is TypeScript, and Adrian is going to edit it (he owes a list of
 * friends). A SQL file would mean the same addresses written down twice, in two
 * languages, with no way for one to notice the other had changed — which is
 * exactly the trap `grants/003` and `004` set for `profiles` and the reason
 * `supabase/waitlist/002` has to be kept in step with `lib/admin.ts` by hand.
 *
 * One list, in one file, read by the thing that acts on it.
 *
 * ## Secured like the cron, and for the same reason
 *
 * A Bearer `CRON_SECRET`, and the SERVICE ROLE, because it writes `entitlements`
 * for other people. That is the single most dangerous table in the app: it is
 * the only one that decides access. There is no session on this route and there
 * must not be one — it acts on every account, so "is the caller allowed" cannot
 * be answered by whose session it is.
 *
 * ## Idempotent, and it never SHORTENS anybody's access
 *
 * Safe to run twice, and safe to run after somebody has already subscribed:
 *
 *   - An account that already has an ACTIVE `pro` entitlement is skipped
 *     entirely. A real subscriber must not be handed a comp, and somebody
 *     already granted the grace must not have their clock restarted (or, worse,
 *     cut short) by a second run.
 *   - `?dry=1` reports what it WOULD do and writes nothing. Run that first.
 *
 * The direction of every judgement call here is "grant more, never less". A
 * mistake that gives somebody an extra fortnight is a rounding error; one that
 * locks a paying customer out is a support queue and a refund.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  BETA_GRACE_DAYS,
  betaGrantFor,
  COMP_EMAILS,
  grantExpiry,
} from "@/lib/billing/betaGrace";
import { grantsPro } from "@/lib/billing/access";
import type { BillingDatabase } from "@/lib/billing/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Supabase's admin list endpoint pages at 1000; ours is well under it, but a
 *  loop is the difference between "works today" and "works at 1200 accounts". */
const PAGE_SIZE = 200;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) {
    return NextResponse.json({ error: "service-not-configured" }, { status: 500 });
  }

  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const supabase = createClient<BillingDatabase>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // The auth admin API is not part of the typed billing schema.
  const authAdmin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  /* ── who is there ─────────────────────────────────────────────── */

  const accounts: { id: string; email: string | null }[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await authAdmin.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const users = data?.users ?? [];
    accounts.push(...users.map((u) => ({ id: u.id, email: u.email ?? null })));
    if (users.length < PAGE_SIZE) break;
  }

  /* ── who already has access ───────────────────────────────────── */

  const { data: existing, error: entErr } = await supabase
    .from("entitlements")
    .select("user_id, product, source, active_until, is_active");
  if (entErr) {
    return NextResponse.json({ error: entErr.message }, { status: 500 });
  }

  const now = new Date();
  const activeByUser = new Map<string, boolean>();
  for (const row of existing ?? []) {
    const already = activeByUser.get(row.user_id) ?? false;
    activeByUser.set(
      row.user_id,
      already ||
        grantsPro(
          [
            {
              product: row.product,
              source: row.source,
              activeUntil: row.active_until,
              isActive: row.is_active,
            },
          ],
          now,
        ),
    );
  }

  /* ── what each one gets ───────────────────────────────────────── */

  const comp: string[] = [];
  const grace: string[] = [];
  const skipped: string[] = [];
  const rows: BillingDatabase["public"]["Tables"]["entitlements"]["Insert"][] = [];

  for (const account of accounts) {
    if (activeByUser.get(account.id)) {
      skipped.push(account.email ?? account.id);
      continue;
    }
    const grant = betaGrantFor(account.email);
    (grant.kind === "comp" ? comp : grace).push(account.email ?? account.id);
    rows.push({
      user_id: account.id,
      product: "pro",
      source: "comp",
      active_until: grantExpiry(grant, now),
      is_active: true,
    });
  }

  const summary = {
    dry,
    accounts: accounts.length,
    granted: rows.length,
    comp: comp.length,
    grace: grace.length,
    skipped: skipped.length,
    graceDays: BETA_GRACE_DAYS,
    graceEndsOn: grantExpiry({ kind: "grace", days: BETA_GRACE_DAYS }, now),
    compList: COMP_EMAILS,
    /** Named, so a dry run can be READ rather than trusted. */
    compAccounts: comp,
    skippedAccounts: skipped,
  };

  if (dry || rows.length === 0) return NextResponse.json(summary);

  /**
   * Inserted in chunks. One 90-row insert is fine today and one 5,000-row insert
   * is not, and the difference between them should not be the thing that decides
   * whether this works on the day.
   */
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from("entitlements").insert(rows.slice(i, i + 100));
    if (error) {
      return NextResponse.json(
        { ...summary, error: error.message, insertedUpTo: i },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(summary);
}
