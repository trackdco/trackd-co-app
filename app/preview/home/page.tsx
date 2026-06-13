import Image from "next/image";
import { notFound } from "next/navigation";

import { BottomNav } from "@/components/navigation/bottom-nav";
import { HomeScreen } from "@/components/home/HomeScreen";
import { toDateKey } from "@/lib/home/mockHomeData";

/**
 * DEV-ONLY preview of the Home / Dashboard screen, viewable without signing in
 * or any Supabase env. Mirrors the (app) shell (wordmark header + fixed bottom
 * nav) so the sticky week strip behaves exactly as it does in the real app.
 * Returns 404 in production so it never ships.
 */
export default function PreviewHomePage() {
  if (process.env.NODE_ENV === "production") notFound();

  const todayKey = toDateKey(new Date());

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
          todayKey={todayKey}
          userId="preview-local"
          weight={sampleWeight}
          unit="kg"
          firstName="Adrian"
          progressPhotos={sampleProgressPhotos}
        />
      </main>

      <BottomNav userId="preview-local" unit="kg" />
    </div>
  );
}
