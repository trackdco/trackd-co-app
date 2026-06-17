import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { isFounder } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Waitlist · Admin — Trackd Co",
  robots: { index: false, follow: false },
};

/**
 * Founder-only waitlist dashboard. Two layers of protection:
 *  1. this page redirects anyone who isn't a founder before it renders, and
 *  2. the waitlist SELECT RLS policy (002_founder_read.sql) only returns rows
 *     to the founder accounts — so even the data can't leak.
 * Exempt from the phone-only desktop gate (components/pwa/desktop-gate.tsx) so
 * it's viewable on a laptop too.
 */
export default async function AdminWaitlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isFounder(user.email)) redirect("/dashboard");

  const [{ count, error: countErr }, bySourceRes, recentRes] = await Promise.all([
    supabase.from("waitlist").select("*", { count: "exact", head: true }),
    supabase
      .from("v_waitlist_by_source")
      .select("source, signups")
      .order("signups", { ascending: false }),
    supabase
      .from("waitlist")
      .select("email, source, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  // Before 002_founder_read.sql is applied, the founder still has no SELECT
  // grant/policy → these error. Show a clear setup notice instead of a bare 0.
  const notSetUp = Boolean(countErr) || Boolean(bySourceRes.error);

  const total = count ?? 0;
  const leaderboard = (bySourceRes.data ?? []) as {
    source: string;
    signups: number;
  }[];
  const maxN = leaderboard[0]?.signups ?? 0;
  const recent = (recentRes.data ?? []) as {
    email: string;
    source: string | null;
    created_at: string;
  }[];

  return (
    <main className="min-h-dvh bg-bg-base px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-baseline justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
            Admin
          </p>
          <Link
            href="/dashboard"
            className="text-xs text-text-muted transition-colors hover:text-foreground"
          >
            ← App
          </Link>
        </div>
        <h1 className="mt-2 font-display text-[2rem] font-medium tracking-[-0.02em] text-foreground">
          Waitlist
        </h1>

        {notSetUp ? (
          <div className="mt-6 rounded-2xl border border-border-default bg-bg-surface p-5 text-sm">
            <p className="font-medium text-foreground">One setup step left</p>
            <p className="mt-2 text-text-muted">
              Run{" "}
              <code className="text-accent-amber">
                supabase/waitlist/002_founder_read.sql
              </code>{" "}
              in the Supabase SQL editor to grant founder read access, then
              refresh this page.
            </p>
          </div>
        ) : total === 0 ? (
          <p className="mt-6 text-sm text-text-muted">
            No signups yet. Share{" "}
            <span className="text-foreground">trackdco.app/waitlist?ref=…</span>{" "}
            to start filling this up.
          </p>
        ) : (
          <>
            {/* Total */}
            <div className="mt-6 rounded-2xl border border-border-default bg-bg-surface p-6">
              <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
                Total signups
              </p>
              <p className="mt-1 font-display text-5xl font-medium tabular-nums text-foreground">
                {total.toLocaleString()}
              </p>
            </div>

            {/* By channel */}
            <h2 className="mt-8 mb-3 text-xs uppercase tracking-[0.18em] text-text-muted">
              By channel
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border-default bg-bg-surface">
              {leaderboard.map(({ source, signups }, i) => (
                <div key={source} className={i > 0 ? "border-t border-border-default" : ""}>
                  <div className="flex items-center justify-between gap-4 px-4 pt-3">
                    <span className="truncate text-sm text-foreground">{source}</span>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                      {signups.toLocaleString()}
                    </span>
                  </div>
                  <div className="mx-4 mt-2 mb-3 h-1 overflow-hidden rounded-full bg-bg-input">
                    <div
                      className="h-full rounded-full bg-accent-amber"
                      style={{ width: `${maxN ? Math.round((signups / maxN) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Recent */}
            <h2 className="mt-8 mb-3 text-xs uppercase tracking-[0.18em] text-text-muted">
              Recent
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border-default bg-bg-surface">
              {recent.map((r, i) => (
                <div
                  key={`${r.email}-${i}`}
                  className={`flex items-center justify-between gap-3 px-4 py-3 ${
                    i > 0 ? "border-t border-border-default" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {r.email}
                  </span>
                  <span className="shrink-0 text-xs text-text-muted">
                    {(r.source ?? "").trim() || "(direct)"}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-text-subtle">
                    {fmtDate(r.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="mt-8 text-center text-xs text-text-subtle">
          Founder-only · signed in as {user.email}
        </p>
      </div>
    </main>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}
