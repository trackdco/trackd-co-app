import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";

import { getSessionContext } from "@/lib/auth";
import { DEFAULT_NEXT, safeNextPath } from "@/lib/auth/nextPath";
import { GateForm } from "./gate-form";

export const metadata: Metadata = {
  title: "Welcome · Trackd Co",
};

/**
 * One-time 18+/ToS interstitial shown after first sign-in. Google gives us a
 * name and email but not age or consent, so we collect those here before any app
 * access. Guards:
 *  - no session -> /login
 *  - already passed the gate -> `next`, or /dashboard (this screen is one-time only)
 *
 * `?next=` is the deep link that started the journey, handed over by
 * `app/(app)/layout.tsx`. This screen only holds it — the form carries it and
 * `completeGate` spends it. See `lib/auth/nextPath.ts`.
 */
export default async function WelcomePage({
  searchParams,
}: {
  /** `string[]` on a repeated parameter — resolved with `[0]`, as on /login. */
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next: rawNext } = await searchParams;
  const requested = Array.isArray(rawNext) ? rawNext[0] : rawNext;
  const validated = safeNextPath(requested, "");
  const next = validated && validated !== DEFAULT_NEXT ? validated : undefined;

  const { user, passedGate } = await getSessionContext();
  if (!user) {
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  if (passedGate) redirect(next ?? DEFAULT_NEXT);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <Image
        src="/trackd-wordmark.png"
        alt="trackd co"
        width={1049}
        height={200}
        priority
        className="h-4 w-auto"
      />

      <h1 className="mt-12 text-balance text-[2rem] font-light leading-[1.05] tracking-[-0.02em] text-foreground">
        One quick thing
      </h1>
      <p className="mt-3 max-w-[18rem] text-pretty text-[0.95rem] leading-relaxed text-text-muted">
        Confirm your age and agree to the basics, then you&apos;re in.
      </p>

      <GateForm next={next} />
    </div>
  );
}
