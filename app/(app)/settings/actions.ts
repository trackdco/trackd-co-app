"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type SettingsState = { error?: string; success?: boolean };

const SEXES = new Set(["male", "female"]);
const GOALS = new Set([
  "bulk",
  "cut",
  "recomp",
  "contest_prep",
  "first_cycle",
  "blast_cruise",
  "trt",
  "other",
]);
const UNITS = new Set(["metric", "imperial"]);

/**
 * Saves the user's profile/personalisation settings.
 *
 * Validates server-side (never trust the client), then UPDATEs the user's own
 * profile row — RLS scopes the write to (SELECT auth.uid()) = id, so a user can
 * only ever change their own. Optional enum fields accept "" to clear (null).
 */
export async function updateSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sexRaw = String(formData.get("sex") ?? "").trim();
  const goalRaw = String(formData.get("goal") ?? "").trim();
  const unitsRaw = String(formData.get("units_preference") ?? "").trim();
  const heightRaw = String(formData.get("height_cm") ?? "").trim();

  const sex = sexRaw === "" ? null : sexRaw;
  if (sex !== null && !SEXES.has(sex)) return { error: "Invalid sex selection." };

  const goal = goalRaw === "" ? null : goalRaw;
  if (goal !== null && !GOALS.has(goal)) return { error: "Invalid goal selection." };

  if (!UNITS.has(unitsRaw)) return { error: "Invalid units selection." };

  let heightCm: number | null = null;
  if (heightRaw !== "") {
    const h = Number(heightRaw);
    // Matches the schema CHECK (height_sane: 100–250) + numeric(5,1).
    if (!Number.isFinite(h) || h < 100 || h > 250) {
      return { error: "Height must be between 100 and 250 cm." };
    }
    heightCm = Math.round(h * 10) / 10;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      sex,
      goal,
      units_preference: unitsRaw,
      height_cm: heightCm,
    })
    .eq("id", user.id);

  if (error) return { error: "Couldn't save your changes. Please try again." };

  revalidatePath("/settings");
  return { success: true };
}
