"use server";

/**
 * Save the user's reminder preferences (Spec 14, Phase 2) — the per-type toggles
 * (reusing the schema's existing booleans), the daily reminder time, and the quiet
 * window. RLS scopes the write to the user's own notification_preferences row;
 * identity comes from the verified session, never the client.
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
    return { ok: !error };
  } catch (e) {
    console.error("saveTimezone failed", e);
    return { ok: false };
  }
}

export interface ReminderPrefsInput {
  doseRemindersOn: boolean;
  missedOn: boolean;
  lowStockOn: boolean;
  reminderTime: string; // "HH:MM"
  quietStart: string; // "HH:MM"
  quietEnd: string; // "HH:MM"
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const toDbTime = (v: string, fallback: string) =>
  TIME_RE.test(v) ? `${v}:00` : fallback;

export async function saveReminderPrefs(
  input: ReminderPrefsInput,
): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false };

    const { error } = await supabase
      .from("notification_preferences")
      .update({
        dose_reminders_on: Boolean(input.doseRemindersOn),
        unlogged_alert_on: Boolean(input.missedOn),
        low_inventory_alert_on: Boolean(input.lowStockOn),
        reminder_time: toDbTime(input.reminderTime, "09:00:00"),
        quiet_start: toDbTime(input.quietStart, "22:00:00"),
        quiet_end: toDbTime(input.quietEnd, "08:00:00"),
      })
      .eq("user_id", user.id);
    if (error) return { ok: false };

    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    console.error("saveReminderPrefs failed", e);
    return { ok: false };
  }
}
