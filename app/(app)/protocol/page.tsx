import type { Metadata } from "next";

import { PageScrollTitle } from "@/components/layout/PageScrollTitle";

export const metadata: Metadata = { title: "My Protocol — Trackd Co" };

// Protocol tab root. Content is built out later; the shared scroll-title preset
// (large heading → fade-in compact bar) is wired in now so it behaves like the
// other tab pages from the start.
export default function ProtocolPage() {
  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5">
      <PageScrollTitle title="Protocol" />
      <p className="px-1 text-sm text-text-muted">
        Your protocol lives here soon.
      </p>
    </div>
  );
}
