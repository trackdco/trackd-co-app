import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { WaitlistForm } from "@/components/waitlist/waitlist-form";

export const metadata: Metadata = {
  title: "Join the waitlist — Trackd Co",
  description:
    "Trackd is the private app for tracking your whole protocol — gear, peptides, supps, bloodwork, outcomes. Join the waitlist for early access.",
  openGraph: {
    title: "Join the Trackd waitlist",
    description:
      "The private app for tracking your whole protocol. Be first in when spots open.",
    type: "website",
    url: "https://trackdco.app/waitlist",
    siteName: "Trackd Co",
  },
  twitter: {
    card: "summary_large_image",
    title: "Join the Trackd waitlist",
    description: "The private app for tracking your whole protocol.",
  },
};

/**
 * Public, unauthenticated waitlist. Exempt from the phone-only desktop gate
 * (see components/pwa/desktop-gate.tsx) so it also converts the desktop social
 * traffic a hard promo brings in. `?ref=` / `?src=` is captured as the source.
 */
export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  // A repeated query key (?ref=a&ref=b) arrives as an array in Next 16 — take
  // the first so the stored source is always a clean single string.
  const pick = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const source = pick(sp.ref) ?? pick(sp.src) ?? pick(sp.source) ?? undefined;

  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-bg-base px-6 py-12">
      {/* Warm corner glow — decorative, matches the desktop interstitial. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 90% 0%, color-mix(in srgb, var(--accent-amber) 7%, transparent), transparent 72%)",
        }}
      />

      <div className="relative z-10 w-full max-w-md animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ease-out motion-reduce:animate-none">
        <Image
          src="/trackd-wordmark.png"
          alt="trackd co"
          width={1049}
          height={200}
          priority
          className="mx-auto h-5 w-auto"
        />

        <p className="mt-10 flex items-center justify-center gap-1.5 text-[0.7rem] uppercase tracking-[0.22em] text-text-muted">
          <span className="size-1 rounded-full bg-accent-amber" aria-hidden />
          Private beta · invite only
        </p>

        <h1 className="mt-3 text-balance text-center font-display text-[2.5rem] font-medium leading-[1.05] tracking-[-0.02em] text-foreground">
          Track the whole <em className="font-medium italic">protocol</em>.
        </h1>

        <p className="mx-auto mt-4 max-w-sm text-pretty text-center text-[0.95rem] leading-relaxed text-text-muted">
          Gear, peptides, supps, ancillaries, bloodwork, outcomes — in one
          private place you&apos;ll actually open. We&apos;re letting people in a
          wave at a time. Join the waitlist and you&apos;ll be first in.
        </p>

        <div className="mt-8">
          <WaitlistForm source={source} />
        </div>

        <p className="mx-auto mt-4 text-center text-[0.7rem] text-text-subtle">
          Free while it&apos;s in beta · 18+ ·{" "}
          <Link href="/terms" className="transition-colors hover:text-text-muted">
            Terms
          </Link>{" "}
          ·{" "}
          <Link
            href="/privacy"
            className="transition-colors hover:text-text-muted"
          >
            Privacy
          </Link>
        </p>

        <p className="mt-8 text-center text-sm text-text-muted">
          Already have access?{" "}
          <Link
            href="/login"
            className="text-foreground underline-offset-4 transition-colors hover:text-text-muted hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
