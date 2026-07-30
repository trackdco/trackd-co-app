import type { Metadata } from "next";

import { PageScrollTitle } from "@/components/layout/PageScrollTitle";

export const metadata: Metadata = { title: "Blocks — Trackd Co" };

/**
 * Blocks — the live block and the look-back list (Adrian, 2026-07-30).
 *
 * A real route rather than a sheet, following `/weight`: this is a canonical,
 * deep view, and a retrospective is long enough to want a page it can scroll
 * rather than a sheet's height to fight.
 *
 * SCAFFOLD ONLY. The banner on Progress links here so the navigation is real
 * from the first commit; the live detail, the retrospective and the create flow
 * land next. See `Context/Feature Specs/proposals/blocks.md`.
 */
export default function BlocksPage() {
  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5">
      <div className="animate-home-up" style={{ animationDelay: "0ms" }}>
        <PageScrollTitle title="Blocks" />
      </div>
      <div
        className="animate-home-up rounded-2xl bg-bg-surface p-5"
        style={{ animationDelay: "55ms" }}
      >
        <p className="text-sm text-text-muted">
          Blocks are being built. The banner on Progress already reads a live
          block; this is where you will start one and look back on the ones you
          have finished.
        </p>
      </div>
    </div>
  );
}
