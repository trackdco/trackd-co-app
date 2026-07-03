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
  // The client sends its LOCAL date; this server runs in UTC. A user ahead of UTC
  // (e.g. UTC+10) legitimately logs a date up to a day ahead of the server's UTC
  // date, so only treat dates more than one day ahead as "future" — that still
  // blocks fat-fingered future entries while never rejecting the user's real
  // "today". (Max real offset is UTC+14, i.e. at most one calendar day ahead.)
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const logged = new Date(`${dateKey}T00:00:00Z`).getTime();
  return logged > todayUtc.getTime() + 86_400_000;
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

  // Atomic insert-or-preserve (supabase/weight/002_log_weight_rpc.sql): log_weight()
  // stamps the user's single active cycle ONLY when creating the day's first row;
  // re-logging/correcting a day updates the weight but NEVER re-derives cycle_id, so
  // the stamp stays the cycle (or NULL) it was first written under. One statement —
  // no read-modify-write race. Identity + RLS enforced inside via auth.uid(). (Spec 15.)
  const { error } = await supabase.rpc("log_weight", {
    p_weight: kg,
    p_logged_for: loggedFor,
  });
  if (error) return { ok: false, error: error.message };

  // Refresh both the Weight view and the home Weight glance card (the + menu's
  // quick log writes the same row).
  revalidatePath("/weight");
  revalidatePath("/dashboard");
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
  revalidatePath("/dashboard");
  return { ok: true };
}
