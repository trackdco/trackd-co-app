"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CircleNotch, EnvelopeSimpleOpen } from "@/components/icons";

import { authenticate, type AuthFormState } from "@/app/login/actions";
import { CARD_TITLE } from "@/lib/ui-presets";

const initialState: AuthFormState = {};

/** Matches the login/waitlist input treatment (h-12, rounded-xl, tokens only). */
const INPUT_CLASS =
  "h-12 w-full rounded-xl border border-input bg-transparent px-4 text-base text-foreground placeholder:text-text-subtle outline-none transition-[color,box-shadow] [color-scheme:dark] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Email + password sign-in / sign-up, sitting under the Google button on the
 * login screen. A local `mode` toggles between the two and rides along as a
 * hidden `intent` field, so one server action (authenticate) handles both.
 *
 * On a successful sign-up (email confirmation is ON) there's no session yet —
 * we swap the form for a "check your inbox" card. A successful sign-in redirects
 * server-side, so this component never sees that state.
 */
export function EmailPasswordForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [state, formAction, isPending] = useActionState(
    authenticate,
    initialState,
  );

  if (state.emailSent) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-3 rounded-2xl border border-accent-amber/30 bg-accent-amber/5 px-6 py-8 text-center"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-accent-amber/40 bg-accent-amber/10 text-accent-amber">
          <EnvelopeSimpleOpen className="h-5 w-5" aria-hidden />
        </span>
        <p className={CARD_TITLE}>Check your inbox</p>
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
