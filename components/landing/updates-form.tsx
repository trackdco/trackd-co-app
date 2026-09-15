"use client";

import { useActionState } from "react";

import { joinWaitlist, type WaitlistState } from "@/app/waitlist/actions";
import { DATA_MONO } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

const initialState: WaitlistState = {};

/**
 * THE FOOTER'S EMAIL FIELD (spec 3-02 §Implementation 9).
 *
 * Posts to the SAME `joinWaitlist` server action and the same `waitlist` table
 * as `/waitlist`, tagged `source: "landing"` so the two can be told apart. No
 * new table, no new action, no new grant.
 *
 * ## ⚠️ WHY NOT JUST REUSE `components/waitlist/waitlist-form.tsx`
 *
 * Its copy is a waitlist's: "You're on the list", "we'll email you the moment
 * your spot opens up". That was true of a private beta and is false on a page
 * where the button beside it starts a trial today. Reusing the component would
 * have put an untrue sentence on the live page to save a file, so this is the
 * same plumbing with honest words, kept deliberately small.
 */
export function UpdatesForm() {
  const [state, formAction, isPending] = useActionState(joinWaitlist, initialState);

  if (state.ok) {
    return (
      <p role="status" aria-live="polite" className="text-sm text-text-secondary">
        Thanks. We&apos;ll write when there is something worth reading.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {/* Honeypot: off-screen and not tabbable. Bots fill it, people do not. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-9999px] h-0 w-0 overflow-hidden"
      >
        <label>
          Company
          <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <input type="hidden" name="source" value="landing" />
      <div className="flex gap-2">
        <label htmlFor="landing-email" className="sr-only">
          Email address
        </label>
        <input
          id="landing-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@email.com"
          className={cn(
            "h-11 min-w-0 flex-1 rounded-xl border border-border-default bg-bg-input px-4",
            "text-sm text-foreground placeholder:text-text-muted",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        />
        <button
          type="submit"
          disabled={isPending}
          className={cn(
            "h-11 shrink-0 rounded-xl border border-border-strong px-4 text-sm text-foreground",
            "transition-opacity hover:opacity-80 disabled:opacity-50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "motion-reduce:transition-none",
          )}
        >
          {isPending ? "Sending" : "Sign up"}
        </button>
      </div>
      {state.error ? (
        <p className={cn(DATA_MONO, "text-state-error")} role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
