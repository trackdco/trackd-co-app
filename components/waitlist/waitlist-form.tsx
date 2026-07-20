"use client";

import { useActionState } from "react";
import { Check, CircleNotch } from "@/components/icons";

import { SHEET_TITLE } from "@/lib/ui-presets";
import { joinWaitlist, type WaitlistState } from "@/app/waitlist/actions";

const initialState: WaitlistState = {};

/**
 * Public waitlist capture. Posts to the joinWaitlist server action (runs as
 * anon; INSERT-only by RLS). `source` is the ?ref= channel tag, threaded from
 * the page's searchParams. On success the form is replaced by a confirmation.
 */
export function WaitlistForm({ source }: { source?: string }) {
  const [state, formAction, isPending] = useActionState(
    joinWaitlist,
    initialState,
  );

  if (state.ok) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-3 rounded-2xl bg-bg-surface px-6 py-8 text-center"
      >
        <span className="flex h-11 w-11 items-center justify-center text-text-subtle">
          <Check className="h-5 w-5" aria-hidden />
        </span>
        <p className={SHEET_TITLE}>You&apos;re on the list.</p>
        <p className="text-sm text-text-muted">
          We&apos;ll email you the moment your spot opens up — keep an eye on
          your inbox.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {/* Honeypot — off-screen, not tabbable; bots fill it, humans don't. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-9999px] h-0 w-0 overflow-hidden"
      >
        <label>
          Company
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
          />
        </label>
      </div>

      <input type="hidden" name="source" value={source ?? ""} />

      <input
        type="email"
        name="email"
        required
        autoComplete="email"
        inputMode="email"
        placeholder="you@email.com"
        aria-label="Email address"
        className="h-12 w-full rounded-xl border border-input bg-transparent px-4 text-base text-foreground placeholder:text-text-subtle outline-none transition-colors [color-scheme:dark] focus-visible:border-border-strong"
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
          <CircleNotch className="h-5 w-5 animate-spin" aria-hidden />
        ) : null}
        {isPending ? "Joining…" : "Join the waitlist"}
      </button>
    </form>
  );
}
