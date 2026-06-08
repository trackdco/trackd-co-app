"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type GateState = { error?: string };

/**
 * Whole years between `dob` and `now`, decrementing if this year's birthday
 * hasn't happened yet. Computed server-side — the client never decides age.
 */
function ageInYears(dob: Date, now: Date): number {
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Completes the one-time 18+/ToS gate.
 *
 * Validates (server-authoritatively) that the user is signed in, has agreed to
 * the documents, and is 18+, then UPDATEs their own profile row (RLS scopes the
 * write to (SELECT auth.uid()) = id). Records the date of birth, the 18+ flag,
 * the acceptance timestamp, and which ToS version was accepted (read live from
 * legal_documents so it stays correct after the launch-day bump to 1.0).
 *
 * Returns a field error for the form on rejection; redirects to /dashboard on
 * success.
 */
export async function completeGate(
  _prev: GateState,
  formData: FormData,
): Promise<GateState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const agreed = formData.get("agree") === "on";
  const dobRaw = String(formData.get("date_of_birth") ?? "").trim();

  if (!agreed) {
    return {
      error:
        "Please confirm you're 18+ and agree to the documents to continue.",
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dobRaw)) {
    return { error: "Please enter your date of birth." };
  }

  const dob = new Date(`${dobRaw}T00:00:00`);
  const now = new Date();
  if (Number.isNaN(dob.getTime()) || dob > now || dob.getFullYear() < 1900) {
    return { error: "That date of birth doesn't look right." };
  }
  if (ageInYears(dob, now) < 18) {
    return { error: "You must be 18 or older to use Trackd." };
  }

  // Which ToS version are they accepting? Read the live one (public read).
  const { data: tos } = await supabase
    .from("legal_documents")
    .select("version")
    .eq("doc_type", "terms_of_service")
    .eq("is_current", true)
    .maybeSingle();

  const { error } = await supabase
    .from("profiles")
    .update({
      date_of_birth: dobRaw,
      is_18_plus: true,
      tos_accepted_at: now.toISOString(),
      tos_version: tos?.version ?? null,
    })
    .eq("id", user.id);

  if (error) {
    return { error: "Couldn't save that just now. Please try again." };
  }

  redirect("/dashboard");
}
