"use server";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";

/**
 * "Forgot password" — sends a reset link. The email lands on /auth/confirm
 * (type=recovery), which verifies the token and forwards to /reset-password
 * where the user sets a new password.
 *
 * We always report success, even for an unknown address, so the form never
 * reveals which emails have accounts.
 */
export type ResetRequestState = { error?: string; sent?: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestPasswordReset(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { error: "Enter the email you signed up with." };
  }

  const h = await headers();
  const origin =
    h.get("origin") ??
    `https://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;

  const supabase = await createClient();
  // Errors here (rate limits, unknown address) are intentionally not surfaced —
  // we don't leak whether the account exists. The reset email template must
  // point at /auth/confirm (see the Auth setup notes).
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  });

  return { sent: true };
}
