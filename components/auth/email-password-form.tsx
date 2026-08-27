"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { CircleNotch, EnvelopeSimpleOpen } from "@/components/icons";

import { authenticate, type AuthFormState } from "@/app/login/actions";
import { CARD_EYEBROW } from "@/lib/ui-presets";

const initialState: AuthFormState = {};

/** Matches the login/waitlist input treatment (h-12, rounded-xl, tokens only). */
const INPUT_CLASS =
  "h-12 w-full rounded-xl border border-border-default bg-transparent px-4 text-base text-foreground placeholder:text-text-subtle outline-none transition-colors [color-scheme:dark] focus-visible:border-border-strong";

/**
 * Email + password sign-in / sign-up, sitting under the Google button on the
 * login screen. A local `mode` toggles between the two and rides along as a
 * hidden `intent` field, so one server action (authenticate) handles both.
 *
 * On a successful sign-up (email confirmation is ON) there's no session yet —
 * we swap the form for a "check your inbox" card. A successful sign-in redirects
 * server-side, so this component never sees that state.
 *
 * TWO CALLERS since Spec w2b-14: /login, and the onboarding account screen.
 * The onboarding one is mid-flow, so it needs a different landing path and
 * opens on sign-UP rather than sign-in — both are props, and both default to
 * the login screen's existing behaviour so that screen is untouched. NOTHING
 * about the treatment is per-caller: the spec moves these controls, it does not
 * redesign them.
 */
export function EmailPasswordForm({
  next,
  defaultMode = "signin",
  onModeChange,
}: {
  /** Internal path to land on after auth. Validated server-side. */
  next?: string;
  /** Which half the form opens on. `/login` opens on sign-in; onboarding on sign-up. */
  defaultMode?: "signin" | "signup";
  /**
   * Told when the user flips between the two halves.
   *
   * The mode stays LOCAL — this only reports it. The onboarding account screen
   * uses it to retitle itself ("Let's get you started." becomes "Welcome
   * back."), because the heading sits outside this component and would
   * otherwise keep welcoming a returning user as a new one. `/login` passes
   * nothing and is unaffected.
   */
  onModeChange?: (mode: "signin" | "signup") => void;
} = {}) {
  const [mode, setModeState] = useState<"signin" | "signup">(defaultMode);
  const setMode = (next: "signin" | "signup") => {
    setModeState(next);
    onModeChange?.(next);
  };
  const [state, formAction, isPending] = useActionState(
    authenticate,
    initialState,
  );

  /**
   * A FULL DOCUMENT LOAD, not a router push.
   *
   * Only set when the caller supplied a `next` (the onboarding account screen).
   * `router.push` would be a soft navigation, and the onboarding flow is one
   * mounted client tree that reads `?step=` at mount — so a soft nav leaves the
   * screen showing this form with the address bar claiming otherwise. See
   * `signIn` in `app/login/actions.ts`.
   */
  const redirectTo = state.redirectTo;
  useEffect(() => {
    if (redirectTo) window.location.assign(redirectTo);
  }, [redirectTo]);

  if (state.emailSent) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-3 rounded-2xl bg-bg-surface px-6 py-8 text-center"
      >
        <EnvelopeSimpleOpen className="h-6 w-6 text-text-subtle" aria-hidden />
        <p className={CARD_EYEBROW}>Check your inbox</p>
        <p className="text-sm text-text-muted">
          We sent a confirmation link to{" "}
          <span className="text-foreground">{state.email ?? "your email"}</span>.
          Click it to finish setting up your account.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 text-left">
      <input type="hidden" name="intent" value={mode} />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <input
        type="email"
        name="email"
        required
        autoComplete="email"
        inputMode="email"
        placeholder="you@email.com"
        aria-label="Email address"
        className={INPUT_CLASS}
      />

      <input
        type="password"
        name="password"
        required
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        minLength={mode === "signup" ? 8 : undefined}
        placeholder="Password"
        aria-label="Password"
        className={INPUT_CLASS}
      />

      {mode === "signin" ? (
        <Link
          href="/forgot-password"
          className="self-end text-xs text-text-muted transition-colors hover:text-foreground"
        >
          Forgot your password?
        </Link>
      ) : (
        <p className="text-xs text-text-subtle">At least 8 characters.</p>
      )}

      {state.error ? (
        <p role="alert" className="text-sm text-[var(--state-error)]">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        aria-busy={isPending}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent-primary px-4 text-[0.95rem] font-medium text-bg-base transition-transform duration-100 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base active:scale-[0.98] disabled:opacity-60 motion-reduce:active:scale-100"
      >
        {isPending ? (
          <CircleNotch className="h-5 w-5 animate-spin" aria-hidden />
        ) : null}
        {isPending
          ? mode === "signin"
            ? "Signing in…"
            : "Creating account…"
          : mode === "signin"
            ? "Sign in"
            : "Create account"}
      </button>

      <p className="text-center text-[0.8rem] text-text-muted">
        {mode === "signin" ? (
          <>
            New to Trackd?{" "}
            <button
              type="button"
              onClick={() => setMode("signup")}
              className="text-foreground underline-offset-2 hover:underline"
            >
              Create an account
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="text-foreground underline-offset-2 hover:underline"
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </form>
  );
}
