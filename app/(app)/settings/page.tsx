import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, ChevronRight, CreditCard } from "lucide-react";

import { SettingsForm } from "@/components/settings/settings-form";
import { CARD_ICON_BADGE, CARD_TITLE, PAGE_TITLE } from "@/lib/ui-presets";
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
    <div className="animate-home-up mx-auto w-full max-w-md px-5 pt-4 pb-5">
      <h1 className={PAGE_TITLE}>Settings</h1>

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
              profile?.tier === "free" ? "Free" : "Beta — all features"
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

      {/* Notifications & reminders live on their own page (Spec 14) — a single
          tappable row here keeps Settings focused on personalisation. */}
      <Link
        href="/settings/notifications"
        className="mt-8 flex items-center gap-3 rounded-2xl border border-border bg-bg-surface p-5 transition-colors hover:bg-bg-surface-raised"
      >
        <span className={CARD_ICON_BADGE} aria-hidden="true">
          <Bell className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block ${CARD_TITLE}`}>
            Notifications &amp; reminders
          </span>
          <span className="block text-sm text-text-muted">
            Dose reminders, missed-dose nudges, low stock
          </span>
        </span>
        <ChevronRight
          className="size-5 shrink-0 text-text-muted"
          aria-hidden="true"
        />
      </Link>

      {/* Subscription & billing (Stripe) — manage plan / start a subscription. */}
      <Link
        href="/billing"
        className="mt-3 flex items-center gap-3 rounded-2xl border border-border bg-bg-surface p-5 transition-colors hover:bg-bg-surface-raised"
      >
        <span className={CARD_ICON_BADGE} aria-hidden="true">
          <CreditCard className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block ${CARD_TITLE}`}>
            Subscription
          </span>
          <span className="block text-sm text-text-muted">
            Manage your plan, billing &amp; payment method
          </span>
        </span>
        <ChevronRight
          className="size-5 shrink-0 text-text-muted"
          aria-hidden="true"
        />
      </Link>

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
