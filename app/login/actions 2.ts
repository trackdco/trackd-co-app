"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Email + password auth for the login screen. One action, branched on an
 * `intent` field, so the client form drives sign-in vs sign-up with a single
 * useActionState. Google OAuth keeps its own client-side flow
 * (components/auth/google-sign-in-button.tsx); this is the email path.
 *
 * All data access is server-side and RLS is the real gate — these actions only
 * hand credentials to Supabase Auth (which hashes the password and owns the
 * auth.users row; the handle_new_user trigger creates the profile). Error
 * copy is intentionally generic so we never reveal whether an email exists.
 */
export type AuthFormState = {
  error?: string;
  /** Set after a successful sign-up so the form can show "check your inbox". */
  emailSent?: boolean;
  /** Echoed back on sign-up success so the confirmation names the address. */
  email?: string;
};

const MIN_PASSWORD_LENGTH = 8;
// Deliberately loose — Supabase Auth is the real validator; this only catches
// obvious typos before the round-trip.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  return { email, password };
}

/** The site origin for this request (handles Vercel's proxy). */
async function requestOrigin() {
  const h = await headers();
  return (
    h.get("origin") ??
    `https://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`
  );
}

/**
 * Mark this as a fresh PHYSICAL sign-in so the dashboard shows the "Add to
 * Home Screen" popup once for this login — mirrors app/auth/callback/route.ts
 * (the OAuth path) so email sign-in behaves identically.
 */
async function setInstallHint() {
  const store = await cookies();
  store.set("trackd-install-hint", "1", {
    path: "/",
    maxAge: 600,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV !== "development",
  });
}

export async function authenticate(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const intent = formData.get("intent");
  return intent === "signup"
    ? signUp(formData)
    : signIn(formData);
}

async function signIn(formData: FormData): Promise<AuthFormState> {
  const { email, password } = readCredentials(formData);
  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Generic on purpose — don't reveal whether the account exists.
    return { error: "That email or password doesn't match. Please try again." };
  }

  await setInstallHint();
  // The (app) guard bounces to /welcome if the 18+/ToS gate isn't passed yet.
  redirect("/dashboard");
}

async function signUp(formData: FormData): Promise<AuthFormState> {
  const { email, password } = readCredentials(formData);
  if (!EMAIL_RE.test(email)) {
    return { error: "That email address doesn't look right." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`,
    };
  }

  const origin = await requestOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // The confirmation email lands on /auth/confirm, which verifies the
      // token_hash and starts the session. (The email template must point
      // here — see the Auth setup notes.)
      emailRedirectTo: `${origin}/auth/confirm?next=/dashboard`,
    },
  });
  if (error) {
    return { error: "Couldn't create your account just now. Please try again." };
  }

  // Confirmation is ON, so there is no session yet — the user must click the
  // emailed link. We show the same confirmation whether or not the address was
  // already registered (Supabase obscures that), so sign-up never leaks it.
  return { emailSent: true, email };
}
