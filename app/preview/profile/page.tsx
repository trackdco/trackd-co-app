import Image from "next/image";
import { notFound } from "next/navigation";

import { BottomNav } from "@/components/navigation/bottom-nav";
import { QuickActionsFab } from "@/components/shortcuts/QuickActionsFab";
import { ProfileScreen } from "@/components/profile/ProfileScreen";

/**
 * DEV-ONLY preview of the rebuilt Profile (spec 09 · part two), viewable without
 * signing in or any Supabase env. 404s in production.
 *
 * WRITES DO NOT WORK HERE and are not meant to: saving the Physical card, the
 * avatar and every danger-zone action all call server actions that resolve the
 * user from a verified session, so without one they fail and say so. This
 * harness is for the LAYOUT and the states — the dimmed read card, the fade into
 * inputs, the one-treatment App rows, the outlined danger zone.
 *
 * `?state=bare` drops the name and photo, which is what a fresh signup actually
 * looks like: initials in the circle, the email as the heading, and every
 * physical row an em dash.
 */
export default async function PreviewProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state } = await searchParams;
  const bare = state === "bare";

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
          alt="trackd co"
          width={1049}
          height={200}
          className="h-4 w-auto"
        />
        <span className="rounded-full bg-bg-surface-raised px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">
          Preview · Profile
        </span>
      </header>

      <main className="flex-1">
        <ProfileScreen
          userId="preview-local"
          initials={bare ? "AS" : "AS"}
          avatarUrl={null}
          displayName={bare ? "adrian@trackdco.app" : "Adrian Schimizzi"}
          hasName={!bare}
          email="adrian@trackdco.app"
          planLabel="Beta · Pro"
          physical={
            bare
              ? {
                  displayName: null,
                  sex: null,
                  goal: null,
                  unitsPreference: "metric",
                  heightCm: null,
                  age: null,
                  weightKg: null,
                }
              : {
                  displayName: "Adrian",
                  sex: "male",
                  goal: "contest_prep",
                  unitsPreference: "metric",
                  heightCm: 180,
                  age: 31,
                  weightKg: 92.4,
                }
          }
        />
      </main>

      <BottomNav />
      <QuickActionsFab userId="preview-local" unit="kg" bodySex="male" />
    </div>
  );
}
