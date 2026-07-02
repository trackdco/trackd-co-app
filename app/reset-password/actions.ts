"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Step 2 of password reset: set the new password. The user arrives here with a
 * recovery session already established by /auth/confirm (verifyOtp). We update
 * their password on their own session — RLS/auth scope it to themselves.
 */
export type UpdatePasswordState = { error?: string };

const MIN_PASSWORD_LENGTH = 8;

export async function updatePassword(
  _prev: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`,
    };
  }
  if (password !== confirm) {
    return { error: "Those passwords don't match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: "Your reset link has expired. Request a new one to continue.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: "Couldn't update your password. Please try again." };
  }

  // Signed in on the fresh password; the (app) guard routes to the gate if
  // this account somehow hasn't passed it yet.
  redirect("/dashboard");
}
