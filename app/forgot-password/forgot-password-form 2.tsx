"use client";

import { useActionState } from "react";
import { Loader2, MailCheck } from "lucide-react";

import {
  requestPasswordReset,
  type ResetRequestState,
} from "@/app/forgot-password/actions";
import { CARD_TITLE } from "@/lib/ui-presets";

const initialState: ResetRequestState = {};

const INPUT_CLASS =
  "h-12 w-full rounded-xl border border-input bg-transparent px-4 text-base text-foreground placeholder:text-text-subtle outline-none transition-[color,box-shadow] [color-scheme:dark] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Requests a password-reset email. On success we swap to a confirmation card —
 * shown for any address, so it never reveals which emails have accounts.
 */
export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  if (state.sent) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-3 rounded-2xl border border-accent-amber/30 bg-accent-amber/5 px-6 py-8 text-center"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-accent-amber/40 bg-accent-amber/10 text-accent-amber">
          <MailCheck className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <p className={CARD_TITLE}>Check your inbox</p>
        <p className="text-sm text-text-muted">
          If that email has an account, we&apos;ve sent a link to reset your
          password.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 text-left">
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
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        ) : null}
        {isPending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
