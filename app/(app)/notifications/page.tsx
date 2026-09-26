import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ListBlocks, RouteHandoff, RouteTitle } from "@/components/feel/RouteSkeletons";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { PUSHED_PAGE, PushedPageHead } from "@/components/settings/PushedPage";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Notifications · Trakabl",
};

/**
 * Notifications & reminders — the dedicated screen, opened from the App card on
 * Profile (Spec 14, re-homed by spec 09 · part two). The reminder you would get,
 * then three settings: Notifications, the daily reminder time, Hide compound
 * names (Adrian, 2026-09-26; everything else is fixed, see NotificationSettings).
 * The (app) layout enforces auth + the gate; all reads/writes are RLS-scoped to
 * the user's own rows.
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

  const [{ data: profile }, { data: prefs }, extraRes, compoundsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("notifications_enabled, timezone")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("notification_preferences")
      .select("reminder_time")
      .eq("user_id", user.id)
      .maybeSingle(),
    /**
     * The `supabase/notifications/007` switch, in its OWN read. Folded into the
     * select above, an unapplied 007 would fail it, the time would fall back to
     * its default, and the first autosave would write that default over the
     * user's real time. Apart, a missing 007 only hides the one new row.
     */
    supabase
      .from("notification_preferences")
      .select("hide_compound_names")
      .eq("user_id", user.id)
      .maybeSingle(),
    // The user's own compounds, so the preview reads in their words.
    supabase
      .from("protocol_compounds")
      .select("compounds(name)")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(3),
  ]);

  // Times come back as "HH:MM:SS"; the time inputs want "HH:MM". Every user has a
  // prefs row (signup trigger); the defaults guard an unexpected miss.
  const hhmm = (t: unknown, fallback: string) =>
    typeof t === "string" ? t.slice(0, 5) : fallback;
  const extra = extraRes.error ? null : (extraRes.data as Record<string, unknown> | null);
  const compoundNames = (compoundsRes.data ?? [])
    .map((r) => ((r as Record<string, unknown>).compounds as { name?: string } | null)?.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);

  return (
    <div
      data-screen="notifications"
      data-desktop-layout="column"
      className={PUSHED_PAGE}
    >
      {/* The way back, the title and its line fade without moving; only the
          cards rise. When the route skeleton was just on screen they were
          already there. Back is at the TOP (consistency fix #23). */}
      <RouteTitle id="notifications">
        <PushedPageHead
          back={{ href: "/profile", label: "Profile" }}
          title="Notifications"
          subtitle="Reminders for your protocol, sent to this device."
        />
      </RouteTitle>

      <RouteHandoff id="notifications">
        <ListBlocks cards={2} />
      </RouteHandoff>
      <div className="animate-home-up" style={{ animationDelay: "0ms" }}>
        <NotificationSettings
          initialEnabled={Boolean(profile?.notifications_enabled)}
          currentTimezone={(profile?.timezone as string | null) ?? null}
          compoundNames={compoundNames}
          initial={{
            reminderTime: hhmm(prefs?.reminder_time, "09:00"),
            privacyAvailable: !!extra,
            hideNames: extra?.hide_compound_names === true,
          }}
        />
      </div>
    </div>
  );
}
