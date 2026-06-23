import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { NotificationsToggle } from "@/components/settings/NotificationsToggle";
import { ReminderSettings } from "@/components/settings/ReminderSettings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Notifications — Trackd Co",
};

/**
 * Notifications & reminders — the dedicated screen, opened from a row on Settings
 * so it has room to grow (Spec 14). The enable toggle + test send, then the
 * reminder preferences (types, daily time, quiet hours). The (app) layout enforces
 * auth + the gate; all reads/writes are RLS-scoped to the user's own rows.
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
      .select("notifications_enabled")
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
    <div className="mx-auto w-full max-w-md px-6 py-10 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ease-out motion-reduce:animate-none">
      <h1 className="font-display text-[2rem] font-medium leading-[1.1] tracking-[-0.02em] text-foreground">
        Notifications
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">
        Reminders for your protocol, sent to this device.
      </p>

      <div className="mt-6">
        <NotificationsToggle
          initialEnabled={Boolean(profile?.notifications_enabled)}
        />
      </div>
      <ReminderSettings
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
        <Link href="/settings" className="hover:text-foreground">
          ← Back to settings
        </Link>
      </div>
    </div>
  );
}
