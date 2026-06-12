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
// (in) submitted in imperial is converted here, then validated (120–230 cm).
const CM_PER_IN = 2.54;

/**
 * Saves the user's profile/personalisation settings.
 *
 * Validates server-side (never trust the client), then UPDATEs the user's own
 * profile row — RLS scopes the write to (SELECT auth.uid()) = id, so a user can
 * only ever change their own. Optional enum fields accept "" to clear (null).
 * Height arrives in the user's selected units and is stored metric. (Bodyweight
 * is tracked in the Weight view / `weight_logs`, not here.)
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
    // Realistic-but-generous adult range: 120–230 cm (≈ 47–91 in), integer with
    // a single decimal tolerated. Stored at the column's 1-decimal precision.
    if (cm < 120 || cm > 230) {
      return {
        error: imperial
          ? "Height must be between 47 and 91 in."
          : "Height must be between 120 and 230 cm.",
      };
    }
    heightCm = Math.round(cm * 10) / 10;
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

  // Refresh the pages that read these values, then drop the user back on the
  // dashboard (redirect() throws NEXT_REDIRECT, so nothing returns past here).
  revalidatePath("/settings");
  revalidatePath("/profile");
  redirect("/dashboard");
}
