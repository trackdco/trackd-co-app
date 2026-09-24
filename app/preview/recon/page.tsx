import Image from "next/image";
import { notFound } from "next/navigation";

import { BottomNav } from "@/components/navigation/bottom-nav";
import { PageScrollTitle } from "@/components/layout/PageScrollTitle";
import { ReconCalculator } from "@/components/calculator/ReconCalculator";

/**
 * DEV-ONLY preview of the reconstitution calculator — the same `ReconCalculator`
 * the real `/calculator` nav tab mounts, on the same page scaffold, minus the
 * auth gate (which is the only reason this harness exists). 404 in production.
 * Try powder 5 mg, BAC 2 mL, dose 250 mcg to see the working.
 *
 * ⚠️ THE SHELL IS PART OF THE SCAFFOLD, not decoration. This route used to render
 * the calculator bare — no wordmark header, no bottom nav — while `/preview/home`,
 * `/preview/progress` and `/preview/protocol` all mirror the (app) shell. The doc
 * comment above claimed "the same page scaffold" and was the only one of the four
 * where that was untrue, which is exactly the kind of gap you only notice when a
 * screenshot of this screen has to sit beside screenshots of the other three.
 */
export default function PreviewReconPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="flex min-h-dvh flex-col pb-[calc(4rem+env(safe-area-inset-bottom)+4.5rem)]">
      <header
        className="flex items-center justify-between border-b border-border/60 px-5"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          paddingBottom: "0.75rem",
        }}
      >
        <Image
          src="/trackd-wordmark.png"
          alt="Trakabl"
          width={1044}
          height={200}
          className="h-4 w-auto"
        />
        <span className="rounded-full bg-bg-surface-raised px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">
          Preview · /calculator
        </span>
      </header>

      <main className="flex-1">
        <div
          // Same markers the real `/calculator` page carries, so the desktop
          // two-column layout (form left, reading right) is visible here too. The
          // doc comment above claims this is the same scaffold; these keep it true.
          data-screen="calculator"
          className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5"
        >
          <PageScrollTitle title="Calculator" />

          <ReconCalculator />
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
