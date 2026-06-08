"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeGate, type GateState } from "./actions";

const initialState: GateState = {};

/**
 * The 18+/ToS gate form. Date of birth (validated server-side — the client never
 * decides age) plus a single acceptance covering all three legal documents, each
 * opening in a new tab so reading them doesn't drop the form. On success the
 * action redirects to /dashboard.
 */
export function GateForm() {
  const [state, formAction, isPending] = useActionState(
    completeGate,
    initialState,
  );

  return (
    <form action={formAction} className="mt-10 w-full max-w-[20rem] text-left">
      <label
        htmlFor="date_of_birth"
        className="block text-xs uppercase tracking-[0.18em] text-text-muted"
      >
        Date of birth
      </label>
      <Input
        id="date_of_birth"
        name="date_of_birth"
        type="date"
        required
        autoComplete="bday"
        className="mt-2 h-12 rounded-xl [color-scheme:dark]"
      />
      <p className="mt-2 text-[0.7rem] text-text-subtle">
        Trackd is for adults 18 and over. We use this to confirm your age.
      </p>

      <label className="mt-6 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="agree"
          className="mt-0.5 size-5 shrink-0 rounded accent-[var(--accent-amber)]"
        />
        <span className="text-[0.8rem] leading-relaxed text-text-muted">
          I confirm I&apos;m 18 or older and I agree to Trackd&apos;s{" "}
          <DocLink href="/terms">Terms of Service</DocLink>,{" "}
          <DocLink href="/privacy">Privacy Policy</DocLink>, and{" "}
          <DocLink href="/medical-disclaimer">Medical Disclaimer</DocLink>.
        </span>
      </label>

      {state.error ? (
        <p role="alert" className="mt-4 text-sm text-[var(--state-error)]">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={isPending}
        aria-busy={isPending}
        className="mt-6 h-12 w-full touch-manipulation select-none rounded-xl text-[0.95rem] transition-transform duration-100 active:scale-[0.98] motion-reduce:active:scale-100"
      >
        {isPending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : null}
        {isPending ? "Setting up…" : "Enter Trackd"}
      </Button>
    </form>
  );
}

function DocLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-foreground underline underline-offset-2 hover:text-text-muted"
    >
      {children}
    </Link>
  );
}
