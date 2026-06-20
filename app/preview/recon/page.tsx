import { notFound } from "next/navigation";

import { ReconPreview } from "./recon-preview";

/**
 * DEV-ONLY preview of the reconstitution calculator (Spec 12, Steps 3–4) — the
 * persistent warning copy + the step-by-step working. 404 in production. Try
 * powder 5 mg, BAC 2 mL, dose 250 mcg to see the working.
 */
export default function PreviewReconPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <span className="rounded-full bg-bg-surface-raised px-2.5 py-1 text-[11px] font-medium tracking-wider text-text-muted uppercase">
        Preview · reconstitution calculator
      </span>
      <p className="mt-6 mb-6 text-sm text-text-muted">
        The sheet opens automatically. Try powder 5 mg, BAC 2 mL, dose 250 mcg.
      </p>
      <ReconPreview />
    </div>
  );
}
