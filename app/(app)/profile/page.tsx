import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronRight,
  FileText,
  Settings,
  ShieldCheck,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { signOut } from "../actions";

export const metadata: Metadata = { title: "Profile — Trackd Co" };

/**
 * Profile tab — the bottom-nav "Profile" destination. An identity + account
 * hub, NOT an editor: every edit affordance points at /settings. Reads only the
 * caller's own profiles row (RLS-scoped). The (app) layout has already enforced
 * auth + the 18+/ToS gate, so `user` is guaranteed here; user_metadata is used
 * for display only, never for access decisions.
 */
export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "tier, created_at, sex, date_of_birth, height_cm, weight_kg, goal, units_preference",
    )
    .eq("id", user!.id)
    .maybeSingle();

  // ----- display identity (auth metadata only; never an access decision) -----
  const fullName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    null;
  const hasName = Boolean(fullName?.trim());
  const email = user?.email ?? "";
  const displayName = hasName ? fullName!.trim() : email || "Your account";
  const initials = getInitials(fullName, email);

  // BETA: tier defaults to 'paid'. A missing profile row falls back to Pro and
  // renders "—" for the data rows rather than throwing.
  const isPaid = (profile?.tier ?? "paid") === "paid";
  const planLabel = isPaid ? "Beta · Pro" : "Free";
  const memberSince = formatMemberSince(profile?.created_at);
  const age = ageFromDob(profile?.date_of_birth);

  return (
    <div className="mx-auto w-full max-w-md px-6 py-10 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ease-out motion-reduce:animate-none">
      {/* ── Identity hero ─────────────────────────────────────────── */}
      <section className="flex flex-col items-center text-center">
        <div
          aria-hidden
          className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border border-border-strong bg-bg-surface-raised font-display text-2xl text-foreground"
        >
          {initials}
        </div>

        <h1
          className={
            hasName
              ? "mt-5 text-balance font-display text-[1.75rem] font-medium leading-[1.15] tracking-[-0.02em] text-foreground"
              : "mt-5 font-display text-xl font-medium leading-[1.2] tracking-[-0.01em] break-all text-foreground"
          }
        >
          {displayName}
        </h1>
        {hasName ? (
          <p className="mt-1 max-w-full truncate text-sm text-text-muted">
            {email}
          </p>
        ) : null}

        {/* The single amber accent on this screen. */}
        <span className="mt-4 inline-flex items-center rounded-full border border-border-default bg-bg-surface-raised px-3 py-1 text-xs font-medium text-accent-amber">
          {planLabel}
        </span>
      </section>

      {/* ── Account ───────────────────────────────────────────────── */}
      <Eyebrow>Account</Eyebrow>
      <div className="overflow-hidden rounded-2xl border border-border-default bg-bg-surface">
        <InfoRow label="Member since" value={memberSince} />
        <Divider />
        <InfoRow label="Plan" value={planLabel} />
        <Divider />
        <InfoRow label="Email" value={email || "—"} truncate />
      </div>

      {/* ── Physical (read-only glance; editing lives in /settings) ── */}
      <div className="mt-8 mb-3 flex items-baseline justify-between">
        <p className="text-xs font-medium tracking-[0.18em] text-text-muted uppercase">
          Physical
        </p>
        <Link
          href="/settings"
          className="-m-2 rounded-md p-2 text-xs text-text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          Edit in Settings
        </Link>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border-default bg-bg-surface">
        <InfoRow label="Sex" value={fmtCapital(profile?.sex)} />
        <Divider />
        <InfoRow label="Age" value={age != null ? `${age} yrs` : "—"} />
        <Divider />
        <InfoRow label="Height" value={fmtNum(profile?.height_cm, "cm")} />
        <Divider />
        <InfoRow label="Weight" value={fmtNum(profile?.weight_kg, "kg")} />
        <Divider />
        <InfoRow label="Goal" value={fmtGoal(profile?.goal)} />
        <Divider />
        <InfoRow label="Units" value={fmtUnits(profile?.units_preference)} />
      </div>

      {/* ── App & legal ───────────────────────────────────────────── */}
      <Eyebrow>App</Eyebrow>
      <div className="overflow-hidden rounded-2xl border border-border-default bg-bg-surface">
        <LinkRow href="/settings" icon={Settings}>
          Settings
        </LinkRow>
        <Divider />
        <LinkRow href="/terms" icon={FileText}>
          Terms of Service
        </LinkRow>
        <Divider />
        <LinkRow href="/privacy" icon={ShieldCheck}>
          Privacy Policy
        </LinkRow>
        <Divider />
        <LinkRow href="/medical-disclaimer" icon={Stethoscope}>
          Medical Disclaimer
        </LinkRow>
      </div>

      {/* ── Sign out ──────────────────────────────────────────────── */}
      <form action={signOut} className="mt-8">
        <button
          type="submit"
          className="flex w-full items-center justify-center rounded-2xl border border-border-strong bg-transparent py-3.5 text-sm font-medium text-text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
        >
          Sign out
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-text-subtle">
        Trackd Co · v0.4 (Beta)
      </p>
    </div>
  );
}

/* ── Co-located, server-safe presentational pieces ───────────────── */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-8 mb-3 text-xs font-medium tracking-[0.18em] text-text-muted uppercase">
      {children}
    </p>
  );
}

function Divider() {
  return <div className="mx-4 border-t border-border-default" aria-hidden />;
}

function InfoRow({
  label,
  value,
  truncate = false,
}: {
  label: string;
  value: string;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <span className="shrink-0 text-sm text-text-muted">{label}</span>
      <span
        className={
          "text-sm font-medium text-foreground tabular-nums" +
          (truncate ? " truncate" : "")
        }
      >
        {value}
      </span>
    </div>
  );
}

function LinkRow({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3.5 outline-none transition-colors hover:bg-bg-surface-raised active:bg-bg-surface-raised focus-visible:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <Icon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
      <span className="flex-1 text-sm text-foreground">{children}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
    </Link>
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

function formatMemberSince(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
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

const fmtCapital = (v?: string | null) =>
  v ? v[0].toUpperCase() + v.slice(1) : "—";

const fmtUnits = (v?: string | null) =>
  v === "imperial" ? "Imperial" : v === "metric" ? "Metric" : "—";

const GOAL_LABELS: Record<string, string> = {
  bulk: "Bulk",
  cut: "Cut",
  recomp: "Recomp",
  contest_prep: "Contest prep",
  first_cycle: "First cycle",
  blast_cruise: "Blast & cruise",
  trt: "TRT",
  other: "Other",
};

const fmtGoal = (v?: string | null) =>
  v ? (GOAL_LABELS[v] ?? fmtCapital(v)) : "—";

const fmtNum = (
  v: number | string | null | undefined,
  unit: string,
): string => {
  if (v == null) return "—";
  const n = Number(v);
  return Number.isNaN(n) ? "—" : `${n % 1 === 0 ? n : n.toFixed(1)} ${unit}`;
};
