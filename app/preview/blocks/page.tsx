import Image from "next/image";
import { notFound } from "next/navigation";

import { BottomNav } from "@/components/navigation/bottom-nav";
import { BlocksScreen } from "@/components/blocks/BlocksScreen";
import { toDateKey } from "@/lib/home/mockHomeData";
import type { Block } from "@/lib/blocks/block";
import type { BloodworkPhoto } from "@/lib/progress/bloodwork";
import type { DayLogs } from "@/lib/home/doseLog";
import type { JournalEntry } from "@/lib/progress/journal";
import type { StackCompound } from "@/lib/home/stack";
import { formatPhotoDateShort, poseLabel, type ProgressPhoto } from "@/lib/progress/photos";

/** A portrait placeholder so the first/last compare renders in preview. */
function mockPhoto(pose: string, dateKey: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='400'>` +
    `<rect width='100%' height='100%' fill='#242422'/>` +
    `<circle cx='150' cy='150' r='110' fill='#2A2A28'/>` +
    `<text x='150' y='44' fill='#F0EFE9' font-family='sans-serif' font-size='16' text-anchor='middle'>${poseLabel(pose)}</text>` +
    `<text x='150' y='366' fill='#7A7A74' font-family='monospace' font-size='15' text-anchor='middle'>${formatPhotoDateShort(dateKey)}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * DEV-ONLY preview of `/blocks`, viewable without signing in or any Supabase
 * env. 404s in production.
 *
 * Three states, because the whole feature turns on which one you are in:
 *  - default: a live block plus two finished ones (the look-back list)
 *  - `?state=empty`: nothing ever started, so the create affordance is alone
 *  - `?state=ended`: the live block is PAST its end date, which is the state the
 *    banner's dot and the Extend / Close / Leave running prompt exist for
 *
 * Append `&block=blk-past` to open a finished block's retrospective directly.
 */
export default async function PreviewBlocksPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; block?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state, block: selected } = await searchParams;

  const today = new Date();
  const dk = (daysAgo: number) =>
    toDateKey(
      new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo),
    );

  // Weight: eighteen weeks of readings, so a block's window genuinely clips it.
  const weight = Array.from({ length: 126 }, (_, i) => {
    const daysAgo = 125 - i;
    const noise = i % 3 === 0 ? 0.4 : i % 2 === 0 ? -0.3 : 0.1;
    return { key: dk(daysAgo), kg: Math.round((96 - i * 0.07 + noise) * 10) / 10 };
  });

  const session = (prefix: string, daysAgo: number, poses: string[]): ProgressPhoto[] =>
    poses.map((pose, i) => ({
      id: `${prefix}-${i}`,
      pose,
      date: dk(daysAgo),
      url: mockPhoto(pose, dk(daysAgo)),
      weightKg: null,
      note: null,
    }));
  // Sessions on both sides of the finished block's close date, so every state
  // exercises its own window rather than borrowing the live block's data.
  const photos: ProgressPhoto[] = [
    ...session("s1", 3, ["front", "side", "back"]),
    ...session("s2", 30, ["front", "side"]),
    ...session("s3", 74, ["front", "back"]),
    ...session("s4", 118, ["front", "side", "back"]),
    ...session("s5", 160, ["front", "side"]),
    ...session("s6", 280, ["front", "back"]),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const bloods: BloodworkPhoto[] = [
    { id: "lp1", date: dk(20), url: null, note: "Mid-block bloods." },
    { id: "lp2", date: dk(96), url: null, note: null },
    { id: "lp3", date: dk(200), url: null, note: "Off-season baseline." },
  ];

  const journal: JournalEntry[] = [
    {
      id: "j1",
      date: dk(2),
      body: "Conditioning is coming in. Sleep has been the difference this block.",
      markers: [
        { markerId: "energy", name: "Energy", tierValue: 4, word: "Charged" },
        { markerId: "sleep", name: "Sleep Quality", tierValue: 5, word: "Deep" },
      ],
      attachments: [],
    },
    {
      id: "j2",
      date: dk(9),
      body: null,
      markers: [{ markerId: "energy", name: "Energy", tierValue: 2, word: "Flat" }],
      attachments: [],
    },
    {
      id: "j3",
      date: dk(24),
      body: "Flat all week, joints aching after legs.",
      markers: [
        { markerId: "energy", name: "Energy", tierValue: 2, word: "Flat" },
        { markerId: "joint-pain", name: "Joint Pain", tierValue: 3, word: "Aching" },
      ],
      attachments: [],
    },
    {
      id: "j4",
      date: dk(200),
      body: "Off-season is going well. Eating is the hard part, not the training.",
      markers: [{ markerId: "appetite", name: "Appetite", tierValue: 2, word: "Low" }],
      attachments: [],
    },
    {
      id: "j5",
      date: dk(250),
      body: null,
      markers: [{ markerId: "appetite", name: "Appetite", tierValue: 2, word: "Low" }],
      attachments: [],
    },
  ];

  const sampleStack: StackCompound[] = [
    {
      id: "p-test",
      name: "Testosterone E",
      category: "anabolic",
      method: "im",
      dose: 250,
      unit: "mg",
      schedule: {
        cadence: { type: "everyNDays", n: 3 },
        timeOfDay: "08:00",
        startDate: dk(320),
      },
      rotationSites: [],
      rotationIndex: 0,
    },
    {
      id: "p-bpc",
      name: "BPC-157",
      category: "peptide",
      method: "subq",
      dose: 250,
      unit: "mcg",
      schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: dk(60) },
      rotationSites: [],
      rotationIndex: 0,
    },
    {
      id: "p-mk",
      name: "MK-677",
      category: "sarm",
      method: "po",
      dose: 12.5,
      unit: "mg",
      schedule: { cadence: { type: "daily" }, timeOfDay: "22:00", startDate: dk(140) },
      rotationSites: [],
      rotationIndex: 0,
    },
  ];

  // Doses across the last twenty weeks, so "what you ran" has real counts and
  // the window genuinely excludes the ones outside it.
  const sampleLogs: DayLogs = {};
  for (let daysAgo = 0; daysAgo <= 320; daysAgo++) {
    const key = dk(daysAgo);
    const day: Record<string, unknown> = {};
    if (daysAgo % 3 === 0) day["p-test"] = { id: `t-${daysAgo}` };
    if (daysAgo <= 60 && daysAgo % 7 !== 5) day["p-bpc"] = { id: `b-${daysAgo}` };
    if (daysAgo % 5 !== 0) day["p-mk"] = { id: `m-${daysAgo}` };
    if (Object.keys(day).length > 0) sampleLogs[key] = day as DayLogs[string];
  }

  const liveEnded = state === "ended";
  const live: Block = {
    id: "blk-live",
    name: liveEnded ? "Comp prep" : "First bodybuilding prep",
    startedOn: dk(liveEnded ? 118 : 46),
    // `?state=ended` puts the end date in the past, which is the whole point of
    // that state: the banner's dot and the Extend / Close / Leave running prompt
    // only exist once a block has reached its end.
    endsOn: liveEnded ? dk(4) : dk(-66),
    targets: [{ variable: "weight", value: 84, direction: "down" }],
    status: "active",
    closedOn: null,
    reflection: null,
  };
  const past: Block[] = [
    {
      id: "blk-past",
      name: "Off-season",
      startedOn: dk(300),
      endsOn: null,
      targets: [],
      status: "completed",
      closedOn: dk(126),
      reflection:
        "Best off-season I have run. Ate more than I wanted to and it worked. Next time I would keep cardio in rather than dropping it entirely in week six.",
    },
    {
      id: "blk-past-2",
      name: "First cut",
      startedOn: dk(430),
      endsOn: dk(320),
      targets: [{ variable: "weight", value: 88, direction: "down" }],
      status: "completed",
      closedOn: dk(318),
      reflection: null,
    },
  ];

  const blocks =
    state === "empty" ? [] : state === "past" ? past : [live, ...past];

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
          Preview · Blocks
        </span>
      </header>

      <main className="flex-1">
        <BlocksScreen
          blocks={blocks}
          selectedId={selected}
          todayKey={toDateKey(today)}
          userId="preview-local"
          weight={weight}
          photos={photos}
          bloods={bloods}
          journal={journal}
          sampleStack={sampleStack}
          sampleLogs={sampleLogs}
        />
      </main>

      <BottomNav />
    </div>
  );
}
