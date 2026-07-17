import { notFound } from "next/navigation";

import { ReconCalculator } from "@/components/home/ReconCalculator";
import { PAGE_TITLE } from "@/lib/ui-presets";

/**
 * DEV-ONLY preview of the reconstitution calculator — the same `ReconCalculator`
 * the real `/calculator` nav tab mounts, on the same page scaffold, minus the
 * auth gate (which is the only reason this harness exists). 404 in production.
 * Try powder 5 mg, BAC 2 mL, dose 250 mcg to see the working.
 */
export default function PreviewReconPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5">
      <span className="rounded-full bg-bg-surface-raised px-2.5 py-1 text-[11px] font-medium tracking-wider text-text-muted uppercase">
        Preview · /calculator
      </span>
      <header className="px-1">
        <h1 className={PAGE_TITLE}>Calculator</h1>
        <p className="mt-0.5 text-sm text-text-muted">
          Work out your concentration and the volume to draw.
        </p>
      </header>

      <ReconCalculator />
    </div>
  );
}
