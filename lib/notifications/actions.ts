"use server";

/**
 * Notification server actions (Spec 14, Phase 2).
 *
 * The TEST HARNESS Adrian asked for: sendMyRemindersNow runs the real reminder
 * engine for the CURRENT user with force = true — it ignores the time-of-day,
 * quiet hours, and dedupe gating, so tapping the button immediately sends whatever
 * is genuinely due (doses due today + low stock), or a friendly "nothing due"
 * confirmation if there's nothing. Identity is the verified session; the runner
 * reads only this user's own rows under RLS.
 */
import { createClient } from "@/lib/supabase/server";
import { runForUser } from "@/lib/notifications/runner";

export async function sendMyRemindersNow(): Promise<{ ok: boolean; sent: number }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, sent: 0 };

    const result = await runForUser(supabase, user.id, { force: true });
    return { ok: result.ok && result.sent > 0, sent: result.sent };
  } catch (e) {
    console.error("sendMyRemindersNow failed", e);
    return { ok: false, sent: 0 };
  }
}
