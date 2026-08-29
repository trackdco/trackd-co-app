"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { DEFAULT_NEXT, safeNextPath } from "@/lib/auth/nextPath";
import { ensureCompEntitlement } from "@/lib/billing/betaGrace";
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

/**
 * Where to land after auth, read off the form.
 *
 * Two callers supply one: the onboarding account screen (Spec w2b-14), which is
 * mid-flow and needs the user back at `/onboarding?step=account` rather than the
 * dashboard — and now `/login` itself, which forwards the deep link that sent an
 * unauthenticated visitor there in the first place.
 *
 * ## ⚠️ THE PARSER MOVED, AND THE REASON IS THE SECOND CALLER
 *
 * The hardened version of this check used to live here, with a note saying it
 * was not remotely triggerable — `next` was a constant in `account.tsx`, and
 * Next rejects a cross-origin Server Action POST — but that *"the guarantee goes
 * live the first time anything reads `next` off a URL."*
 *
 * `/login` now does exactly that. And the same value travels on from here to
 * `/auth/callback` and `/auth/confirm`, both of which were still running the
 * `startsWith` test this one was written to replace, and both of which that test
 * lets `/\evil.com` straight through.
 *
 * So the parse is in `lib/auth/nextPath.ts` and all four doorways call it. The
 * bypasses it blocks — and the two the prefix test did not — are pinned in
 * `lib/auth/nextPath.test.ts`.
 *
 * Anything unusable falls back to the default rather than erroring: a mangled
 * destination must never cost somebody the account they just made.
 */
function readNext(formData: FormData): string {
  return safeNextPath(formData.get("next"));
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

  /**
   * ⚠️ D71 — the comp list's members get their row here too.
   *
   * `/auth/callback` and `/auth/confirm` cover the two SIGNUP paths, and this
   * covers the one that reaches neither: an ordinary password sign-in never
   * touches either route. Without it, a comp-list member who signed up before
   * this shipped and only ever signs in with a password would hold no row and
   * be held read-only once the gate goes on.
   *
   * Idempotent, service-role, and a no-op string comparison for everybody not on
   * the list — it never throws, so a sign-in cannot fail because of it.
   */
  {
    const {
      data: { user: signedIn },
    } = await supabase.auth.getUser();
    if (signedIn) await ensureCompEntitlement(signedIn.id, signedIn.email);
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
   * nav to a different `?step=` reuses the mounted tree, so the address bar said
   * one thing while a stale screen — sign-in form and all — stayed on display
   * for a user who had just signed in.
   *
   * So when a `next` was supplied, the destination is handed back and the client
   * does a FULL document load, which is also what Google (302 out of
   * `/auth/callback`) and email confirmation (302 out of `/auth/confirm`) do. One
   * arrival shape for all three, so the handoff has one place to hook.
   *
   * ⚠️ A cold review measured `location.assign` being called ZERO times on this
   * path: the Server Action's automatic RSC re-render of the current route
   * reaches `app/onboarding/page.tsx`'s own redirect first, and the router
   * applies that as a soft REPLACE. So the full load is the fallback, not the
   * mechanism, and the account history entry is replaced rather than pushed.
   * Both routes end on the right screen; only which one gets there first varies.
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
