"use server";

/**
 * Save the user's reminder preferences — since 2026-09-26 just the daily reminder
 * time and Hide compound names (see `ReminderPrefsInput`). RLS scopes the write
 * to the user's own notification_preferences row; identity comes from the
 * verified session, never the client.
 *
 * ## ⚠️ TWO THINGS THIS ROW WILL NOT LET YOU DO
 *
 * Both arrive with `supabase/notifications/005`, and both will surface as a bare
 * `42501` if a later change walks into them:
 *
 *   1. **`trial_reminder_sent_for` cannot be written from here.** A BEFORE
 *      trigger refuses any change to it from the `authenticated` role. It is the
 *      reminder cron's dedupe stamp: clearing it fires the trial reminder every
 *      fifteen minutes (~96 pushes a day about somebody's money) and setting it
 *      forward silences a notice the paywall and the checkout disclosure both
 *      promise out loud. The runner writes it as the service role.
 *   2. **The row cannot be DELETED from here.** DELETE is revoked for
 *      `authenticated`, the same way `profiles` already is. A "reset my
 *      notification settings" feature has to UPDATE the columns back to their
 *      defaults; deleting the row would silence the trial reminder outright,
 *      because the claim is a conditional UPDATE and against a missing row it
 *      matches nothing and reports no error at all.
 */
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/lib/notifications/reminders";

/**
 * Store the user's device timezone (IANA, e.g. "Europe/London") so the scheduler
 * fires reminders in THEIR local time, not a default. Captured automatically from
 * the browser (Intl) when they manage notifications — best-effort, RLS-scoped to
 * the user's own profile. Validated before write so a bad value can't be stored.
 */
export async function saveTimezone(tz: string): Promise<{ ok: boolean }> {
  try {
    if (!isValidTimeZone(tz)) return { ok: false };
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false };

    const { error } = await supabase
      .from("profiles")
      .update({ timezone: tz })
      .eq("id", user.id);
    if (error) console.error("saveTimezone: cloud write failed", error);
    return { ok: !error };
  } catch (e) {
    console.error("saveTimezone failed", e);
    return { ok: false };
  }
}

/**
 * What the Notifications page sets, and all it sets (Adrian, 2026-09-26): the
 * daily reminder time and whether to hide compound names. The reminder types,
 * the don't-forget wait and quiet hours are no longer settings; the runner reads
 * none of their columns.
 */
export interface ReminderPrefsInput {
  reminderTime: string; // "HH:MM"
  /**
   * The `supabase/notifications/007` switch. OPTIONAL, and written in its own
   * update below: the page leaves it out when it could not read it (007 not
   * applied), so a missing column can never fail the time's save.
   */
  hideNames?: boolean;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveReminderPrefs(
  input: ReminderPrefsInput,
): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false };

    if (!TIME_RE.test(input.reminderTime)) return { ok: false };
    const { error } = await supabase
      .from("notification_preferences")
      .update({ reminder_time: `${input.reminderTime}:00` })
      .eq("user_id", user.id);
    if (error) return { ok: false };

    if (input.hideNames !== undefined) {
      const { error: privacyError } = await supabase
        .from("notification_preferences")
        .update({ hide_compound_names: Boolean(input.hideNames) })
        .eq("user_id", user.id);
      if (privacyError) return { ok: false };
    }

    revalidatePath("/notifications");
    return { ok: true };
  } catch (e) {
    console.error("saveReminderPrefs failed", e);
    return { ok: false };
  }
}
