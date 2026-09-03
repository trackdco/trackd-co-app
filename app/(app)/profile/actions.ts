"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { firstNameOf } from "@/lib/profile/name";
import { createClient } from "@/lib/supabase/server";

/**
 * Profile avatar server actions (Context/Feature Specs/08 → B3). The cropped,
 * resized image is uploaded client-side straight to the private `avatars` bucket
 * (storage RLS enforces the `<auth.uid()>/…` path); these actions just record /
 * clear the chosen object path on the user's own profile row. RLS scopes every
 * write to the signed-in user; we also re-check the path's owner segment here as
 * defence in depth, and never trust the client for ownership.
 */
export type AvatarResult = { ok: boolean; error?: string };

export async function setAvatarPath(path: string): Promise<AvatarResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  // The path must live in this user's own folder (matches the storage policy).
  if (typeof path !== "string" || !path.startsWith(`${user.id}/`)) {
    return { ok: false, error: "Invalid avatar path." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", user.id);
  if (error) return { ok: false, error: "Couldn't save your photo." };

  revalidatePath("/profile");
  return { ok: true };
}

export async function clearAvatar(): Promise<AvatarResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .maybeSingle();

  // Best-effort remove of the stored object (RLS scopes it to the owner anyway).
  const path = profile?.avatar_path as string | null | undefined;
  if (path) {
    await supabase.storage.from("avatars").remove([path]);
  }

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_path: null })
    .eq("id", user.id);
  if (error) return { ok: false, error: "Couldn't remove your photo." };

  revalidatePath("/profile");
  return { ok: true };
}

/* ── Physical details ─────────────────────────────────────────────── */

export type PhysicalState = {
  error?: string;
  success?: boolean;
  /**
   * A token that CHANGES on every successful save.
   *
   * `useActionState` holds the last result until the next one, so `success: true`
   * stays true forever after the first save. The card watched that boolean to
   * return itself to read state, which therefore worked exactly once: every save
   * after the first left the form open, with no success signal of any kind, and
   * the only way out was Cancel or a reload.
   */
  savedAt?: number;
};

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
 * Saves the user's physical details, edited in place on Profile (spec 09 · part
 * two moved this here when Settings was dissolved; the validation is the old
 * `updateSettings` unchanged, because the rules did not change with the screen).
 *
 * Validates server-side (never trust the client), then UPDATEs the user's own
 * profile row — RLS scopes the write to (SELECT auth.uid()) = id, so a user can
 * only ever change their own. Optional enum fields accept "" to clear (null).
 * Height arrives in the user's selected units and is stored metric. (Bodyweight
 * is tracked in the Weight view / `weight_logs`, not here.)
 *
 * Unlike the old Settings version it does NOT redirect to the dashboard. The
 * card is edited in place, so the user stays exactly where they are and the card
 * returns to its read state.
 */
export async function updatePhysical(
  _prev: PhysicalState,
  formData: FormData,
): Promise<PhysicalState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  /**
   * The preferred name — what Home greets you with (`profiles.display_name`).
   *
   * FIRST TOKEN, NORMALISED, SERVER-SIDE. The input's `maxLength` is a courtesy
   * and not the enforcement: a paste, a direct call to this action, or anyone
   * with the publishable key walks straight around it, and the column's CHECK is
   * 1..24, so an over-long value would fail the whole save rather than the field.
   * `firstNameOf` is the same function the onboarding claim seeds with, so the
   * two entry points cannot drift.
   *
   * Empty clears it (null) rather than erroring. Clearing your preferred name is
   * a legitimate thing to want: the greeting then falls back to the Google name.
   */
  const displayName = firstNameOf(formData.get("display_name"));

  const sexRaw = String(formData.get("sex") ?? "").trim();
  const goalRaw = String(formData.get("goal") ?? "").trim();
  const unitsRaw = String(formData.get("units_preference") ?? "").trim();
  const heightRaw = String(formData.get("height") ?? "").trim();

  // Sex is required — it decides which body the injection-site map draws and
  // which markers the journal offers, and the welcome quiz makes everyone
  // choose. Profiles that predate the quiz have none, so the form shows them a
  // placeholder and they pick one on their next save; "" is rejected rather
  // than stored as null.
  const sex = sexRaw;
  if (!SEXES.has(sex)) return { error: "Select male or female." };

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

  const { data: saved, error } = await supabase
    .from("profiles")
    .update({
      sex,
      goal,
      units_preference: unitsRaw,
      height_cm: heightCm,
      display_name: displayName,
    })
    .eq("id", user.id)
    .select("id")
    .maybeSingle();

  if (error) return { error: "Couldn't save your changes. Please try again." };
  // A zero-row update raises no error in PostgREST, so without this the card
  // closed back to its dimmed read state reporting a save that never happened.
  if (saved == null) {
    return { error: "Couldn't save your changes. Please try again." };
  }

  // Every screen that reads these values. Progress is in the list because `sex`
  // decides which markers its journal dialer offers (Spec 04, wave 2 pt one),
  // and the dashboard because the injection-site map draws the matching body.
  // Every screen that reads any of these. `units_preference` reaches the weight
  // and calculator views, and the (app) layout itself reads `sex` for the body
  // map, so the layout's own path is revalidated too.
  revalidatePath("/profile");
  revalidatePath("/progress");
  revalidatePath("/dashboard");
  revalidatePath("/weight");
  revalidatePath("/protocol");
  revalidatePath("/calendar");
  revalidatePath("/calculator");
  revalidatePath("/(app)", "layout");
  return { success: true, savedAt: Date.now() };
}
