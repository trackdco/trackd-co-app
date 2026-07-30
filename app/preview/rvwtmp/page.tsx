// TEMPORARY REVIEW HARNESS — delete after the audit. Renders ProgressScreen with
// NO preview props so PhotoRunningList exercises the real device stores.
import { notFound } from "next/navigation";

import { ProgressScreen } from "@/components/progress/ProgressScreen";
import { toDateKey } from "@/lib/home/mockHomeData";
import type { ProgressPhoto } from "@/lib/progress/photos";

function mockPhoto(pose: string, dateKey: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='400'>` +
    `<rect width='100%' height='100%' fill='#242422'/>` +
    `<text x='150' y='44' fill='#F0EFE9' font-size='16' text-anchor='middle'>${pose}</text>` +
    `<text x='150' y='366' fill='#7A7A74' font-size='15' text-anchor='middle'>${dateKey}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default async function RvwTmp({
  searchParams,
}: {
  searchParams: Promise<{ ago?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { ago } = await searchParams;
  const today = new Date();
  const dk = (d: number) =>
    toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - d));
  const daysAgo = Number(ago ?? "4");

  const progressPhotos: ProgressPhoto[] = ["front", "side", "back"].map((pose, i) => ({
    id: `x-${i}`,
    pose,
    date: dk(daysAgo),
    url: mockPhoto(pose, dk(daysAgo)),
    weightKg: 90,
    note: null,
  }));

  return (
    <main>
      <ProgressScreen
        weight={[{ key: dk(1), kg: 90 }, { key: dk(0), kg: 90.2 }]}
        unitPreference="metric"
        todayKey={toDateKey(today)}
        userId="rvw-user"
        bloodworkPhotos={[]}
        journalEntries={[]}
        markerOptions={[]}
        progressPhotos={progressPhotos}
      />
    </main>
  );
}
