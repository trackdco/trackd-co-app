import type { Metadata } from "next";

import { PageScrollTitle } from "@/components/layout/PageScrollTitle";

export const metadata: Metadata = { title: "Progress — Trackd Co" };

// Progress tab root. Content is built out later; the shared scroll-title preset
// (large heading → fade-in compact bar) is wired in now so it behaves like the
// other tab pages from the start.
export default function ProgressPage() {
  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5">
      <PageScrollTitle title="Progress" />
      <p className="px-1 text-sm text-text-muted">
        Your progress lives here soon.
      </p>
    </div>
  );
}
