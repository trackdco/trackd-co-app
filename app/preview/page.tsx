import Image from "next/image";
import { notFound } from "next/navigation";

import { BottomNav } from "@/components/navigation/bottom-nav";

/**
 * DEV-ONLY preview of the bottom nav + Add to Stack sheet, viewable without
 * signing in or any Supabase env. Returns 404 in production so it never ships.
 * Remove once the real (logged-in) app is the review surface.
 */
export default function PreviewPage() {
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
        <span className="rounded-full bg-bg-surface-raised px-2.5 py-1 text-[11px] font-medium tracking-wider text-text-muted uppercase">
          Preview
        </span>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-6 py-10">
        <p className="text-xs tracking-[0.18em] text-text-muted uppercase">
          Dev preview
        </p>
        <h1 className="mt-2 font-display text-[2rem] leading-[1.1] font-medium tracking-[-0.02em] text-foreground">
          Bottom nav &amp; Add to Stack
        </h1>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-text-muted">
          Tap the white <span className="text-foreground">+</span> to open Add to
          Stack. Search by name or alias — try{" "}
          <span className="text-foreground">deca</span>,{" "}
          <span className="text-foreground">aromasin</span>, or{" "}
          <span className="text-foreground">npp</span>. Search something that
          doesn&apos;t exist to see{" "}
          <span className="text-foreground">Make your own</span>.
        </p>
        <ul className="mt-6 space-y-2 text-sm text-text-muted">
          <li>• Drag the grab handle down to dismiss the sheet.</li>
          <li>• Custom compounds you create are saved on this device.</li>
          <li>• The bottom tabs route into the real (signed-in) app.</li>
        </ul>
      </main>

      <BottomNav userId="preview-local" />
    </div>
  );
}
