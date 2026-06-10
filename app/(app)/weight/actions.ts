"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Server actions for the Weight view (Context/Feature Specs/08 → C). All writes
 * go to `weight_logs`, one row per (profile_id, logged_for) — re-logging a day
 * UPSERTs (last write wins). RLS scopes every row to the signed-in user; we set
 * `profile_id` from the verified session and never trust the client. Weight
 * arrives already converted to kilograms (the client knows the display unit);
 * the 30–300 kg range is re-checked here as the write-side guardrail.
 *
 * A "use server" module may only export async functions, so the result shape is
 * structural rather than a named export.
 */
export type WeightResult = { ok: boolean; error?: string };

function isValidDateKey(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
}

function isFuture(dateKey: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${dateKey}T00:00:00`).getTime() > today.getTime();
}

export async function logWeight(
  weightKg: number,
  loggedFor: string,
): Promise<WeightResult> {
  const kg = Math.round(weightKg * 100) / 100; // numeric(5,2)
  if (!Number.isFinite(kg) || kg < 30 || kg > 300) {
    return { ok: false, error: "Enter a weight between 30 and 300 kg." };
  }
  if (!isValidDateKey(loggedFor)) return { ok: false, error: "Invalid date." };
  if (isFuture(loggedFor)) {
    return { ok: false, error: "You can't log a future date." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const { error } = await supabase.from("weight_logs").upsert(
    { profile_id: user.id, weight: kg, logged_for: loggedFor },
    { onConflict: "profile_id,logged_for" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/weight");
  return { ok: true };
}

export async function deleteWeight(loggedFor: string): Promise<WeightResult> {
  if (!isValidDateKey(loggedFor)) return { ok: false, error: "Invalid date." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const { error } = await supabase
    .from("weight_logs")
    .delete()
    .eq("profile_id", user.id)
    .eq("logged_for", loggedFor);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/weight");
  return { ok: true };
}
