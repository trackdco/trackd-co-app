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
 * ## ⚠️ IT SKIPS ANY ACCOUNT THAT HAS AN ENTITLEMENT ROW AT ALL, active or not
 *
 * The first version skipped only accounts with an ACTIVE one, which is the
 * obvious reading and is wrong on the second run. Adrian will re-run this — he
 * is going to add a friend to `COMP_EMAILS` after go-live, and re-running is the
 * only way to grant them. With an "active" test, that second run would hand a
 * fresh fourteen days to **everybody whose grace had already expired**, silently
 * un-locking every lapsed account in the process. A month later it would do it
 * again.
 *
 * "Has a row" is the correct backfill predicate. A row means this account has
 * already been answered — by the first run, by a subscription, or by a comp —
 * and being answered once is the whole point.
 *
 * A lapsed grace is therefore left lapsed, which is right: they had their
 * fortnight and the answer to what happens next is the subscribe pop-up, not
 * another fortnight nobody told them about.
 *
 * ## The rest of the safety
 *
 *   - `?dry=1` reports what it WOULD do and writes nothing. Run that first, and
 *     READ it: `compAccounts` names every address about to be given Trackd for
 *     good, so a typo in the comp list is visible before it is permanent.
 *   - A real subscriber is never handed a comp.
 *   - Nobody's clock is restarted, or cut short.
 *
 * Every other judgement here runs "grant more, never less". A mistake that gives
 * somebody an extra fortnight is a rounding error; one that locks a paying
 * customer out is a support queue and a refund.
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

  /* ── who has already been answered ────────────────────────────── */

  const { data: existing, error: entErr } = await supabase
    .from("entitlements")
    .select("user_id, product, source, active_until, is_active");
  if (entErr) {
    return NextResponse.json({ error: entErr.message }, { status: 500 });
  }

  const now = new Date();
  /**
   * ANY row, not just an active one. See the note at the top of this file: an
   * "active" test would re-grant a fresh fortnight to everybody whose grace had
   * expired, every time this is re-run.
   */
  const answered = new Set<string>((existing ?? []).map((row) => row.user_id));
  /**
   * Accounts whose ONLY entitlement is a `comp` with an expiry — the shape the
   * first run writes for everybody not on the comp list. These are the ones a
   * later addition to `COMP_EMAILS` can be upgraded from.
   *
   * A `stripe`/`apple`/`google` row disqualifies: somebody who has actually
   * subscribed is not a beta account waiting to be comped, and turning them into
   * one would stop billing them.
   */
  const timeLimitedComp = new Set<string>(
    (existing ?? [])
      .filter((row) => {
        const rows = (existing ?? []).filter((r) => r.user_id === row.user_id);
        return (
          rows.every((r) => r.source === "comp") &&
          rows.some((r) => r.active_until !== null)
        );
      })
      .map((row) => row.user_id),
  );
  /** Kept separately, so the summary can distinguish "already paying" from
   *  "already had their fortnight and it ran out". */
  const stillActive = new Set<string>(
    (existing ?? [])
      .filter((row) =>
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
      )
      .map((row) => row.user_id),
  );

  /* ── what each one gets ───────────────────────────────────────── */

  const comp: string[] = [];
  const grace: string[] = [];
  const skipped: string[] = [];
  const skippedLapsed: string[] = [];
  const upgraded: string[] = [];
  const rows: BillingDatabase["public"]["Tables"]["entitlements"]["Insert"][] = [];

  for (const account of accounts) {
    const grant = betaGrantFor(account.email);

    /**
     * ⚠️ SOMEBODY ADDED TO `COMP_EMAILS` AFTER THE FIRST RUN IS UPGRADED, NOT
     * SKIPPED.
     *
     * This is the case Adrian will actually hit: he owes a list of friends, he
     * will add one after go-live, and re-running this is the only way to grant
     * them. With a plain "has a row" skip they would be skipped forever, because
     * the first run already gave them a fourteen-day grace — so the friend he
     * meant to give Trackd to for good would quietly lapse instead.
     *
     * A cold review found the same thing from the other end and called it "the
     * comp list does nothing on a re-run", which it did.
     *
     * Only ever LENGTHENS. It clears `active_until` on a row that has one; it
     * never shortens anybody, never touches a `stripe`/`apple`/`google` row, and
     * never turns a paying customer into a comp.
     */
    if (grant.kind === "comp" && timeLimitedComp.has(account.id)) {
      upgraded.push(account.email ?? account.id);
      if (!dry) {
        const { error } = await supabase
          .from("entitlements")
          .update({ active_until: null, is_active: true })
          .eq("user_id", account.id)
          .eq("source", "comp");
        if (error) {
          return NextResponse.json(
            { error: `upgrade failed for ${account.id}: ${error.message}` },
            { status: 500 },
          );
        }
      }
      continue;
    }

    if (answered.has(account.id)) {
      (stillActive.has(account.id) ? skipped : skippedLapsed).push(
        account.email ?? account.id,
      );
      continue;
    }
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
    /** Already answered, and their answer has since run out. Left alone on
     *  purpose: they had their fortnight, and the answer to what comes next is
     *  the subscribe pop-up rather than another fortnight nobody told them
     *  about. */
    skippedLapsed: skippedLapsed.length,
    /** On the comp list, and their time-limited grace was lifted to forever. */
    upgraded: upgraded.length,
    graceDays: BETA_GRACE_DAYS,
    graceEndsOn: grantExpiry({ kind: "grace", days: BETA_GRACE_DAYS }, now),
    compList: COMP_EMAILS,
    /**
     * ⚠️ EMAIL ADDRESSES, AND ONLY ON A DRY RUN.
     *
     * A dry run exists to be READ before anything is permanent — `compAccounts`
     * is how a typo in the comp list becomes visible before somebody is given
     * Trackd for good by accident, and `upgradedAccounts` is how you check the
     * right friend was upgraded. That needs names.
     *
     * A cold review pointed out that the live run was returning the same thing:
     * every account's address, in one response, behind one shared secret. The
     * live run does not need them — its job is done by then — so it returns
     * counts only. Same reasoning as any other log that could become a dump.
     */
    ...(dry
      ? {
          compAccounts: comp,
          upgradedAccounts: upgraded,
          skippedAccounts: skipped,
          skippedLapsedAccounts: skippedLapsed,
        }
      : {}),
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
