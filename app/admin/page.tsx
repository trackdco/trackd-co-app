import type { Metadata } from "next";
import Link from "next/link";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { FeedbackList, type AdminFeedback } from "@/components/admin/FeedbackList";
import { isFounder } from "@/lib/admin";
import { getAdminMetrics } from "@/lib/db/adminMetrics";
import { createClient } from "@/lib/supabase/server";
import { CARD_EYEBROW, PAGE_TITLE } from "@/lib/ui-presets";

export const metadata: Metadata = {
  title: "Admin — Trackd Co",
  robots: { index: false, follow: false },
};

/** Signups-over-time ranges. `null` days = all time. */
const RANGES = [
  { key: "30", label: "30D", days: 30 },
  { key: "90", label: "90D", days: 90 },
  { key: "all", label: "All", days: null },
] as const;

/**
 * Founder-only operational dashboard (Spec 06 — was the waitlist view).
 *
 * ACCESS: enforced SERVER-SIDE, in three layers.
 *  1. This is a Server Component: it calls the verified `getUser()` and returns a
 *     blocked view BEFORE any query runs, so a non-founder's request never fetches
 *     and nothing reaches the client bundle.
 *  2. RLS: `waitlist` SELECT and `beta_feedback` SELECT ("own OR founder") both
 *     gate on the founder email list in the database — so even without (1), a
 *     non-founder reads zero rows.
 *  3. `getAdminMetrics` re-checks the caller against the session independently,
 *     because a server action is reachable on its own and must not trust the page.
 *
 * Self-contained so it works on desktop (exempt from the phone-only gate): a
 * logged-out visitor gets a Google sign-in here rather than a bounce to the
 * phone-only /login.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Logged out → sign in right here (no bounce to the phone-only /login).
  if (!user) {
    return (
      <Shell>
        <p className={CARD_EYEBROW}>Trackd · Admin</p>
        <h1 className={`mt-3 ${PAGE_TITLE}`}>Founder access</h1>
        <p className="mt-3 text-sm text-text-muted">
          Sign in with a founder account to continue.
        </p>
        <div className="mx-auto mt-8 w-full max-w-[20rem]">
          <GoogleSignInButton next="/admin" />
        </div>
      </Shell>
    );
  }

  // Signed in but not a founder → blocked (no data fetched, nothing leaked).
  if (!isFounder(user.email)) {
    return (
      <Shell>
        <h1 className={PAGE_TITLE}>Founders only</h1>
        <p className="mt-3 text-sm text-text-muted">
          This area is restricted. You&apos;re signed in as {user.email}.
        </p>
        <Link
          href="/dashboard"
          className="mt-8 inline-block text-sm text-text-muted transition-colors hover:text-foreground"
        >
          Go to the app →
        </Link>
      </Shell>
    );
  }

  const sp = await searchParams;
  const rawRange = typeof sp.range === "string" ? sp.range : "30";
  const range = RANGES.find((r) => r.key === rawRange) ?? RANGES[0];

  // ── Founder: load the numbers ─────────────────────────────────────────────
  // The waitlist + feedback reads stay on the founder's OWN RLS-scoped client
  // (they're the two places rows are legitimately shown). Only the cross-user
  // AGGREGATES go through `getAdminMetrics`, which never returns a row.
  const [metrics, bySourceRes, recentRes, feedbackRes] = await Promise.all([
    getAdminMetrics(range.days),
    supabase
      .from("v_waitlist_by_source")
      .select("source, signups")
      .order("signups", { ascending: false }),
    supabase
      .from("waitlist")
      .select("email, source, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("beta_feedback")
      .select("id, message, email, path, created_at, resolved_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

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
  const feedback = (feedbackRes.data ?? []) as AdminFeedback[];
  const totalSignups = metrics.signupsByDay.reduce((n, d) => n + d.count, 0);
  const peakDay = metrics.signupsByDay.reduce((n, d) => Math.max(n, d.count), 0);

  return (
    <main className="min-h-dvh bg-bg-base px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-baseline justify-between">
          <p className={CARD_EYEBROW}>Trackd</p>
          <Link
            href="/dashboard"
            className="text-xs text-text-muted transition-colors hover:text-foreground"
          >
            ← App
          </Link>
        </div>
        <h1 className={`mt-2 ${PAGE_TITLE}`}>Admin</h1>

        {metrics.unavailable && (
          <div className="mt-6 rounded-2xl bg-bg-surface p-5 text-sm">
            <p className="font-medium text-foreground">Metrics unavailable</p>
            <p className="mt-2 text-text-muted">
              Cross-user counts need <code className="text-foreground">SUPABASE_SECRET_KEY</code>{" "}
              set in this environment. The lists below still work.
            </p>
          </div>
        )}

        {/* ── 1. Users ──────────────────────────────────────────────────── */}
        <Section title="Users" />
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Active today" value={metrics.activeDaily} />
          <Stat label="Active 7 days" value={metrics.activeWeekly} />
          <Stat label="Accounts" value={metrics.totalAccounts} />
        </div>
        {/* Stated on the page deliberately, so the number is read the same way
            every time — and so nobody mistakes it for "opened the app". */}
        <p className="mt-2 px-1 text-xs text-text-subtle">
          Active = wrote something that period: a dose, weight, journal entry,
          photo or compound. It does not count opening the app to look.
        </p>

        {/* ── 2. Signups over time ──────────────────────────────────────── */}
        <div className="mt-10 flex items-baseline justify-between gap-3">
          <h2 className={CARD_EYEBROW}>Signups over time</h2>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <Link
                key={r.key}
                href={`/admin?range=${r.key}`}
                scroll={false}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  r.key === range.key
                    ? "bg-bg-surface-raised text-foreground"
                    : "text-text-muted hover:text-foreground"
                }`}
              >
                {r.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-3 rounded-2xl bg-bg-surface p-5">
          {totalSignups === 0 ? (
            <p className="text-sm text-text-muted">
              No signups in this range.
            </p>
          ) : (
            <>
              <p className="font-mono text-sm tabular-nums text-foreground">
                {totalSignups.toLocaleString()}
                <span className="text-text-muted"> in {range.label.toLowerCase()}</span>
              </p>
              {/* One bar per day. No trend arrow and no percentage change: with
                  single-digit numbers both would be noise, and a percentage over a
                  zero baseline is undefined (Spec 06 → small-number states). */}
              <div className="mt-4 flex h-16 items-end gap-px">
                {metrics.signupsByDay.map((d) => (
                  <div
                    key={d.day}
                    title={`${d.day}: ${d.count}`}
                    className="flex-1 rounded-t-sm bg-text-muted/70"
                    style={{
                      height: peakDay > 0 ? `${Math.max(2, (d.count / peakDay) * 100)}%` : "2%",
                    }}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums text-text-subtle">
                <span>{metrics.signupsByDay[0]?.day ?? ""}</span>
                <span>{metrics.signupsByDay.at(-1)?.day ?? ""}</span>
              </div>
            </>
          )}
        </div>

        {/* By channel — kept (genuinely useful), moved UNDER signups over time
            rather than heading the page. */}
        <h3 className={`mt-6 mb-3 ${CARD_EYEBROW}`}>By channel</h3>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-text-muted">No channels yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-bg-surface">
            {leaderboard.map(({ source, signups }, i) => (
              <div key={source} className={i > 0 ? "hairline-t" : ""}>
                <div className="flex items-center justify-between gap-4 px-4 pt-3">
                  <span className="truncate text-sm text-foreground">{source}</span>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
                    {signups.toLocaleString()}
                  </span>
                </div>
                <div className="mx-4 mt-2 mb-3 h-1 overflow-hidden rounded-full bg-bg-input">
                  <div
                    className="h-full rounded-full bg-text-muted"
                    style={{ width: `${maxN ? Math.round((signups / maxN) * 100) : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── 3. Usage ──────────────────────────────────────────────────── */}
        <Section title="Usage" />
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Compounds" value={metrics.compoundsLogged} />
          <Stat label="Doses" value={metrics.dosesLogged} />
          <Stat label="Running now" value={metrics.usersWithActiveCompound} />
        </div>
        <p className="mt-2 px-1 text-xs text-text-subtle">
          Compounds and doses are all-time totals across every account. Running now
          counts accounts holding at least one active compound.
        </p>

        {/* ── 4. Feedback queue ─────────────────────────────────────────── */}
        <Section title={`Feedback${feedback.length > 0 ? ` · ${feedback.length}` : ""}`} />
        <FeedbackList items={feedback} />

        {/* ── 5. Email list — a reference list, so it sits last. ─────────── */}
        <Section title={`Emails${recent.length > 0 ? ` · ${recent.length}` : ""}`} />
        {recent.length === 0 ? (
          <p className="text-sm text-text-muted">
            No signups yet. Share{" "}
            <span className="text-foreground">trackdco.app/waitlist?ref=…</span> to
            start filling this up.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-bg-surface">
            {recent.map((r, i) => (
              <div
                key={`${r.email}-${i}`}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${
                  i > 0 ? "hairline-t" : ""
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {r.email}
                </span>
                <span className="shrink-0 text-xs text-text-muted">
                  {(r.source ?? "").trim() || "(direct)"}
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-text-subtle">
                  {fmtDate(r.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="mt-10 text-center text-xs text-text-subtle">
          Founder-only · signed in as {user.email}
        </p>
      </div>
    </main>
  );
}

function Section({ title }: { title: string }) {
  return <h2 className={`mt-10 mb-3 ${CARD_EYEBROW}`}>{title}</h2>;
}

/** A metric tile. Reads correctly at zero — no percentages, no trend arrows. */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-bg-surface p-4">
      <p className="text-[10px] font-sans uppercase tracking-[0.2em] text-text-subtle">
        {label}
      </p>
      <p className="mt-1 text-[28px] font-light tracking-[-0.02em] tabular-nums text-foreground">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg-base px-6 text-center">
      <div className="w-full max-w-sm">{children}</div>
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
