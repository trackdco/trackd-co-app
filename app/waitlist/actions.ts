"use server";

import { createClient } from "@/lib/supabase/server";

export type WaitlistState = { ok?: boolean; error?: string };

// Pragmatic shape check — not RFC-perfect (the real proof is a delivered email),
// just enough to reject obvious junk before the insert.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Adds an email to the public waitlist.
 *
 * Runs as the `anon` role (visitors have no session). The table's RLS + GRANT
 * allow INSERT only, so this can write a row but can never read the list back —
 * emails can't be enumerated. A duplicate email is treated as success (an
 * idempotent join; also avoids leaking who's already signed up). A hidden
 * honeypot field catches the simplest bots.
 */
export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  // Honeypot: humans never fill this hidden field. Pretend success, store nothing.
  if (String(formData.get("company") ?? "").trim() !== "") {
    return { ok: true };
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { error: "Please enter a valid email address." };
  }

  const sourceRaw = String(formData.get("source") ?? "").trim();
  const source = sourceRaw ? sourceRaw.slice(0, 120) : null;

  const supabase = await createClient();
  const { error } = await supabase.from("waitlist").insert({ email, source });

  if (error) {
    // 23505 = unique violation = already on the list → idempotent success.
    if (error.code === "23505") return { ok: true };
    return { error: "Something went wrong — please try again." };
  }

  return { ok: true };
}
