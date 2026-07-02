"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import {
  updatePassword,
  type UpdatePasswordState,
} from "@/app/reset-password/actions";

const initialState: UpdatePasswordState = {};

const INPUT_CLASS =
  "h-12 w-full rounded-xl border border-input bg-transparent px-4 text-base text-foreground placeholder:text-text-subtle outline-none transition-[color,box-shadow] [color-scheme:dark] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Sets a new password on the recovery session, then redirects into the app. */
export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    updatePassword,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 text-left">
      <input
        type="password"
        name="password"
        required
        autoComplete="new-password"
        minLength={8}
        placeholder="New password"
        aria-label="New password"
        className={INPUT_CLASS}
      />
      <input
        type="password"
        name="confirm"
        required
        autoComplete="new-password"
        minLength={8}
        placeholder="Confirm new password"
        aria-label="Confirm new password"
        className={INPUT_CLASS}
      />

      <p className="text-xs text-text-subtle">At least 8 characters.</p>

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
        {isPending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
