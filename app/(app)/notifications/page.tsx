import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { NotificationsToggle } from "@/components/settings/NotificationsToggle";
import { ReminderSettings } from "@/components/settings/ReminderSettings";
import { PAGE_TITLE } from "@/lib/ui-presets";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Notifications — Trackd Co",
};

/**
 * Notifications & reminders — the dedicated screen, opened from the App card on
 * Profile (Spec 14, re-homed by spec 09 · part two). The enable toggle + test
 * send, then the reminder preferences (types, daily time, quiet hours). The
 * (app) layout enforces auth + the gate; all reads/writes are RLS-scoped to the
 * user's own rows.
 *
 * It lives at `/notifications` rather than under `/settings` because Settings is
 * gone: spec 09 dissolved it into Profile, route and all. A child route of a
 * removed parent would have kept the word alive in the URL bar and in every
 * future reader's mental model.
 */
export default async function NotificationsSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: prefs }] = await Promise.all([
    supabase
      .from("profiles")
      .select("notifications_enabled, timezone")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("notification_preferences")
      .select(
        "dose_reminders_on, unlogged_alert_on, low_inventory_alert_on, reminder_time, quiet_start, quiet_end",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  // Times come back as "HH:MM:SS"; the time inputs want "HH:MM". Every user has a
  // prefs row (signup trigger); the defaults guard an unexpected miss.
  const hhmm = (t: unknown, fallback: string) =>
    typeof t === "string" ? t.slice(0, 5) : fallback;

  return (
    <div className="animate-home-up mx-auto w-full max-w-md px-5 pt-4 pb-5">
      <h1 className={PAGE_TITLE}>Notifications</h1>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">
        Reminders for your protocol, sent to this device.
      </p>

      <div className="mt-6">
        <NotificationsToggle
          initialEnabled={Boolean(profile?.notifications_enabled)}
        />
      </div>
      <ReminderSettings
        currentTimezone={(profile?.timezone as string | null) ?? null}
        initial={{
          doseRemindersOn: prefs?.dose_reminders_on ?? true,
          missedOn: prefs?.unlogged_alert_on ?? true,
          lowStockOn: prefs?.low_inventory_alert_on ?? true,
          reminderTime: hhmm(prefs?.reminder_time, "09:00"),
          quietStart: hhmm(prefs?.quiet_start, "22:00"),
          quietEnd: hhmm(prefs?.quiet_end, "08:00"),
        }}
      />

      <div className="mt-10 text-sm text-text-muted">
        <Link href="/profile" className="hover:text-foreground">
          ← Back to profile
        </Link>
      </div>
    </div>
  );
}
