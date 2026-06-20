import { notFound } from "next/navigation";

import { GateForm } from "@/app/welcome/gate-form";

/**
 * DEV-ONLY preview of the signup 18+/consent gate (Spec 12, Step 1) — the three
 * separate consents + the date-of-birth fields, viewable without signing in.
 * 404 in production. Visual only: the submit action requires a real session, so
 * "Enter Trackd" won't complete here — it's for reviewing the layout/copy.
 */
export default function PreviewLegalConsentPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center px-6 py-16 text-center">
      <span className="rounded-full bg-bg-surface-raised px-2.5 py-1 text-[11px] font-medium tracking-wider text-text-muted uppercase">
        Preview · signup consent
      </span>
      <h1 className="mt-8 font-display text-2xl tracking-[-0.02em] text-foreground">
        Welcome to Trackd
      </h1>
      <p className="mt-2 text-sm text-text-muted">
        Confirm your age and agree to the documents to continue.
      </p>
      <GateForm />
    </div>
  );
}
