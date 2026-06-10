"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { toDateKey } from "@/lib/home/mockHomeData";

/**
 * Persist today's bodyweight to `body_metrics`. The table is one-row-per-day
 * (UNIQUE user_id, measured_on), so re-logging today UPDATES that row (upsert).
 * RLS gates every row to the signed-in user; we still set `user_id` from the
 * verified session and never trust the client. The amount range mirrors the
 * table's CHECK (30–300 kg). (A "use server" module may only export async
 * functions, so the result shape is structural, not a named export.)
 */
export async function logBodyWeight(
  weightKg: number
): Promise<{ ok: boolean; error?: string }> {
  const kg = Math.round(weightKg * 10) / 10; // numeric(5,1)
  if (!Number.isFinite(kg) || kg < 30 || kg > 300) {
    return { ok: false, error: "Enter a weight between 30 and 300 kg." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const { error } = await supabase.from("body_metrics").upsert(
    { user_id: user.id, weight_kg: kg, measured_on: toDateKey(new Date()) },
    { onConflict: "user_id,measured_on" }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  return { ok: true };
}
