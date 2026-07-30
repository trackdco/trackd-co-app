import Image from "next/image";
import { notFound } from "next/navigation";

import { BottomNav } from "@/components/navigation/bottom-nav";
import { QuickActionsFab } from "@/components/shortcuts/QuickActionsFab";
import { HomeScreen } from "@/components/home/HomeScreen";
import { toDateKey } from "@/lib/home/mockHomeData";
import type { StackCompound } from "@/lib/home/stack";
import type { Stack } from "@/lib/home/stacks";
import type { DayLogs } from "@/lib/home/doseLog";

/**
 * DEV-ONLY preview of the Home / Dashboard screen, viewable without signing in
 * or any Supabase env. Mirrors the (app) shell (wordmark header + fixed bottom
 * nav) so the sticky week strip behaves exactly as it does in the real app.
 * Returns 404 in production so it never ships.
 */
export default function PreviewHomePage() {
  if (process.env.NODE_ENV === "production") notFound();

  const todayKey = toDateKey(new Date());

  // Compounds for the day's log. Three of them are grouped into a STACK (Spec 05)
  // and one runs on a CYCLE (Spec 06), so both are reviewable here.
  const daily = (id: string, name: string, category: StackCompound["category"],
                 method: StackCompound["method"], dose: number, unit: string,
                 time: string): StackCompound => ({
    id, name, category, method, dose, unit,
    schedule: { cadence: { type: "daily" }, timeOfDay: time, startDate: "2026-01-01" },
    rotationSites: [], rotationIndex: 0,
  });

  const sampleCompounds: StackCompound[] = [
    daily("c-test", "Testosterone E", "anabolic", "im", 250, "mg", "08:00"),
    daily("c-bpc", "BPC-157", "peptide", "subq", 250, "mcg", "08:00"),
    daily("c-tb", "TB-500", "peptide", "subq", 2, "mg", "08:00"),
    daily("c-anas", "Anastrozole", "ancillary", "po", 0.5, "mg", "20:00"),
    // On a 7-on / 7-off cycle — off-cycle days vanish from the log entirely.
    {
      ...daily("c-mk", "MK-677", "sarm", "po", 12.5, "mg", "22:00"),
      cycle: {
        pattern: { type: "onOff", onDays: 7, offDays: 7 },
        end: { type: "never" },
        colour: "moss",
        anchor: toDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 2)),
      },
    },
  ];

  // One stack: the three things taken together at 8am.
  const sampleStacks: Stack[] = [
    {
      id: "s-morning",
      name: "Morning shot",
      colour: "steel",
      memberIds: ["c-test", "c-bpc", "c-tb"],
    },
  ];

  // One member already logged, so the stack row shows PARTIAL state (1 of 3).
  const sampleLogs: DayLogs = {
    [todayKey]: {
      "c-bpc": { amount: "250", unit: "mcg", siteId: null, time24: "08:05" },
    },
  };



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
          Preview · Home
        </span>
      </header>

      <main className="flex-1">
        <HomeScreen
          previewStack={sampleCompounds}
          previewStacks={sampleStacks}
          previewLogs={sampleLogs}
          todayKey={todayKey}
          userId="preview-local"
          firstName="Adrian"
          injectionCatalogue={[]}
        bodySex="male"
        />
      </main>

      <BottomNav />
      <QuickActionsFab userId="preview-local" unit="kg" bodySex="male" />
    </div>
  );
}
