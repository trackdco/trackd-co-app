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
  /**
   * A destination the CLIENT must navigate to with a full document load.
   *
   * Only ever set when the caller supplied a `next` — i.e. the onboarding
   * account screen. See `signIn` for why a server `redirect()` is wrong there.
   */
  redirectTo?: string;
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

/** Where /login sends someone once they are in. Unchanged default. */
const DEFAULT_NEXT = "/dashboard";

/**
 * Where to land after auth, read off the form.
 *
 * The onboarding account screen (Spec w2b-14) mounts this same form and needs
 * the user back at `/onboarding?step=paywall` rather than the dashboard — the
 * flow is mid-way through and the dashboard is not where it resumes.
 *
 * UNTRUSTED INPUT: a `next` is an open-redirect vector, so it is validated with
 * exactly the rule `/auth/callback` already uses — internal, single-slash paths
 * only, so neither `//evil.example` nor `https://evil.example` can get through.
 * Anything else falls back to the default rather than erroring: a mangled
 * destination must never cost someone the account they just made.
 */
function readNext(formData: FormData): string {
  const raw = formData.get("next");
  if (typeof raw !== "string") return DEFAULT_NEXT;
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : DEFAULT_NEXT;
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

  /**
   * TWO WAYS OUT, AND THE DIFFERENCE IS LOAD-BEARING.
   *
   * A server `redirect()` is a Next SOFT navigation. From /login that is exactly
   * right — the destination is a different route and it renders fresh.
   *
   * From the onboarding account screen it is WRONG, and it shipped visibly
   * broken for one measured run: the whole flow is ONE client tree mounted at
   * `/onboarding`, and it reads `?step=` at mount and on `popstate` only. A soft
   * nav to `/onboarding?step=paywall` reuses the mounted tree, so the address
   * bar said `paywall` while the account screen — with its sign-in form — stayed
   * on screen, for a user who had just signed in.
   *
   * So when a `next` was supplied, the destination is handed back and the client
   * does a FULL document load. That also makes the two auth paths identical:
   * Google (302 out of `/auth/callback`) and email confirmation (302 out of
   * `/auth/confirm`) already return through a full load, and so does this. The
   * answer handoff therefore has exactly ONE arrival to hook, not two.
   */
  const explicitNext = formData.get("next");
  if (typeof explicitNext === "string") {
    return { redirectTo: readNext(formData) };
  }
  // The (app) guard bounces to /welcome if the 18+/ToS gate isn't passed yet.
  redirect(DEFAULT_NEXT);
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
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // The confirmation email lands on /auth/confirm, which verifies the
      // token_hash and starts the session. (The email template must point
      // here — see the Auth setup notes.)
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(
        readNext(formData),
      )}`,
    },
  });
  if (error) {
    return { error: "Couldn't create your account just now. Please try again." };
  }

  // When the address already belongs to a confirmed account, Supabase sends no
  // email and obscures the fact by returning a user with an empty `identities`
  // array (anti-enumeration). A blanket "check your inbox" would then be a lie
  // — and it's the common case here, since anyone who signed in with Google has
  // no password. Nudge them to the path that works instead. This trades a
  // little enumeration-resistance for a much clearer beta experience.
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    return {
      error:
        "That email may already be registered. Try signing in, or continue with Google.",
    };
  }

  // Confirmation is ON, so there is no session yet — the user must click the
  // emailed link before they can sign in.
  return { emailSent: true, email };
}
