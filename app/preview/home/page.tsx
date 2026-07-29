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

  // A gentle ~4-week trend so the Weight card's Trend/Scale toggle has data.
  const today = new Date();
  const sampleWeight = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (27 - i));
    const noise = i % 3 === 0 ? 0.5 : i % 2 === 0 ? -0.4 : 0.1;
    return { key: toDateKey(d), kg: Math.round((92 - i * 0.12 + noise) * 10) / 10 };
  });

  // A latest session for the Progress-photos glance (mock portraits so the
  // compact card size is reviewable; the real app uses signed URLs).
  const mockPhoto = (label: string) =>
    `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='400'>` +
        `<rect width='100%' height='100%' fill='#242422'/>` +
        `<circle cx='150' cy='150' r='90' fill='#2A2A28'/>` +
        `<text x='150' y='380' fill='#7A7A74' font-family='sans-serif' font-size='16' text-anchor='middle'>${label}</text>` +
        `</svg>`,
    )}`;
  const sampleProgressPhotos = [
    { id: "p1", pose: "front-relaxed", date: todayKey, url: mockPhoto("Front"), weightKg: null, note: null },
    { id: "p2", pose: "side-relaxed", date: todayKey, url: mockPhoto("Side"), weightKg: null, note: null },
    { id: "p3", pose: "back-relaxed", date: todayKey, url: mockPhoto("Back"), weightKg: null, note: null },
  ];

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
          weight={sampleWeight}
          unit="kg"
          firstName="Adrian"
          progressPhotos={sampleProgressPhotos}
          injectionCatalogue={[]}
        bodySex="male"
        />
      </main>

      <BottomNav />
      <QuickActionsFab userId="preview-local" unit="kg" bodySex="male" />
    </div>
  );
}
