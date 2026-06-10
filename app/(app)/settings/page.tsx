import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SettingsForm } from "@/components/settings/settings-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Settings — Trackd Co",
};

/**
 * Profile & settings. The (app) layout already enforces auth + the gate; here we
 * read the user's own profile to pre-fill the editable personalisation fields
 * and show read-only account details. All writes go through the server action
 * (RLS-scoped to the user's own row).
 */
export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "sex, date_of_birth, height_cm, goal, units_preference, tier, created_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  const fullName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;

  const dob = profile?.date_of_birth
    ? new Date(`${profile.date_of_birth}T00:00:00`)
    : null;
  const age = dob ? ageInYears(dob, new Date()) : null;
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto w-full max-w-md px-6 py-10 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ease-out motion-reduce:animate-none">
      <h1 className="font-display text-[2rem] font-medium leading-[1.1] tracking-[-0.02em] text-foreground">
        Settings
      </h1>

      {/* Account (read-only) */}
      <section className="mt-6 rounded-2xl border border-border bg-bg-surface p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
          Account
        </p>
        <dl className="mt-3 space-y-2 text-sm">
          {fullName ? <Row label="Name" value={fullName} /> : null}
          <Row label="Email" value={user.email ?? "—"} />
          <Row
            label="Plan"
            value={
              profile?.tier === "free" ? "Free" : "Beta — all features unlocked"
            }
          />
          {age !== null ? <Row label="Age" value={`${age}`} /> : null}
          {memberSince ? <Row label="Member since" value={memberSince} /> : null}
        </dl>
      </section>

      {/* Editable personalisation */}
      <h2 className="mt-8 text-xs uppercase tracking-[0.18em] text-text-muted">
        About you
      </h2>
      <SettingsForm
        initial={{
          sex: profile?.sex ?? null,
          goal: profile?.goal ?? null,
          units_preference: profile?.units_preference ?? "metric",
          height_cm: profile?.height_cm ?? null,
        }}
      />

      <div className="mt-10 flex flex-col gap-3 text-sm text-text-muted">
        <Link href="/dashboard" className="hover:text-foreground">
          ← Back to dashboard
        </Link>
        <p className="text-[0.7rem] text-text-subtle">
          <Link href="/terms" className="hover:text-text-muted">
            Terms
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="hover:text-text-muted">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link href="/medical-disclaimer" className="hover:text-text-muted">
            Medical Disclaimer
          </Link>
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right text-foreground">{value}</dd>
    </div>
  );
}

function ageInYears(dob: Date, now: Date): number {
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}
