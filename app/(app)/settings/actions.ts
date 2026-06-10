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

// Storage is always metric. Imperial is a display/entry preference, so a height
// (in) / weight (lbs) submitted in imperial is converted here, then validated
// against the schema's metric CHECKs (height 100–250 cm, weight 30–300 kg).
const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;

/**
 * Saves the user's profile/personalisation settings.
 *
 * Validates server-side (never trust the client), then UPDATEs the user's own
 * profile row — RLS scopes the write to (SELECT auth.uid()) = id, so a user can
 * only ever change their own. Optional enum fields accept "" to clear (null).
 * Height/weight arrive in the user's selected units and are stored metric.
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
  const heightRaw = String(formData.get("height") ?? "").trim();
  const weightRaw = String(formData.get("weight") ?? "").trim();

  const sex = sexRaw === "" ? null : sexRaw;
  if (sex !== null && !SEXES.has(sex)) return { error: "Invalid sex selection." };

  const goal = goalRaw === "" ? null : goalRaw;
  if (goal !== null && !GOALS.has(goal)) return { error: "Invalid goal selection." };

  if (!UNITS.has(unitsRaw)) return { error: "Invalid units selection." };
  const imperial = unitsRaw === "imperial";

  let heightCm: number | null = null;
  if (heightRaw !== "") {
    const h = Number(heightRaw);
    if (!Number.isFinite(h)) return { error: "Enter a valid height." };
    const cm = imperial ? h * CM_PER_IN : h;
    // Schema CHECK height_sane: 100–250 cm (≈ 39–98 in).
    if (cm < 100 || cm > 250) {
      return {
        error: imperial
          ? "Height must be between 39 and 98 in."
          : "Height must be between 100 and 250 cm.",
      };
    }
    heightCm = Math.round(cm * 10) / 10;
  }

  let weightKg: number | null = null;
  if (weightRaw !== "") {
    const w = Number(weightRaw);
    if (!Number.isFinite(w)) return { error: "Enter a valid weight." };
    const kg = imperial ? w * KG_PER_LB : w;
    // Schema CHECK weight_sane: 30–300 kg (≈ 66–661 lbs).
    if (kg < 30 || kg > 300) {
      return {
        error: imperial
          ? "Weight must be between 66 and 661 lbs."
          : "Weight must be between 30 and 300 kg.",
      };
    }
    weightKg = Math.round(kg * 10) / 10;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      sex,
      goal,
      units_preference: unitsRaw,
      height_cm: heightCm,
      weight_kg: weightKg,
    })
    .eq("id", user.id);

  if (error) return { error: "Couldn't save your changes. Please try again." };

  // Refresh the pages that read these values, then drop the user back on the
  // dashboard (redirect() throws NEXT_REDIRECT, so nothing returns past here).
  revalidatePath("/settings");
  revalidatePath("/profile");
  redirect("/dashboard");
}
