import Image from "next/image";
import { notFound } from "next/navigation";

import { BottomNav } from "@/components/navigation/bottom-nav";
import { ArchiveManager } from "@/components/home/ArchiveManager";

/**
 * DEV-ONLY preview of the Profile → Archive menu, viewable without signing in.
 * Uses the same `preview-local` user as the home preview so a compound archived
 * on /preview/home shows up here. Returns 404 in production.
 */
export default function PreviewProfilePage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="flex min-h-dvh flex-col pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <header
        className="flex items-center justify-between border-b border-border/60 px-5"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
          paddingBottom: "0.75rem",
        }}
      >
        <Image
          src="/trackd-wordmark.png"
          alt="trackd co"
          width={1049}
          height={200}
          className="h-4 w-auto"
        />
        <span className="rounded-full bg-bg-surface-raised px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">
          Preview · Profile
        </span>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 space-y-8 px-5 py-6">
        <h1 className="font-display text-3xl font-medium tracking-[-0.01em] text-foreground">
          My Profile
        </h1>
        <section>
          <h2 className="font-display text-xl font-medium text-foreground">
            Archive
          </h2>
          <p className="mt-1 mb-4 text-sm text-text-muted">
            Stop logging a compound to move it here; reactivate to put it back.
            Your past entries are always kept.
          </p>
          <ArchiveManager userId="preview-local" />
        </section>
      </main>

      <BottomNav userId="preview-local" unit="kg" />
    </div>
  );
}
