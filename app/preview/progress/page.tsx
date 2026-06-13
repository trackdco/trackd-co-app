import Image from "next/image";
import { notFound } from "next/navigation";

import { BottomNav } from "@/components/navigation/bottom-nav";
import { ProgressScreen } from "@/components/progress/ProgressScreen";
import { toDateKey } from "@/lib/home/mockHomeData";
import {
  formatBloodworkDate,
  type BloodworkPhoto,
} from "@/lib/progress/bloodwork";
import type { JournalEntry, MarkerCatalogueItem } from "@/lib/progress/journal";
import type { AdherencePoint } from "@/lib/progress/consistency";
import {
  formatPhotoDateShort,
  poseLabel,
  type ProgressPhoto,
} from "@/lib/progress/photos";

/** A simple portrait placeholder so the photo gallery/compare render in preview. */
function mockPhoto(pose: string, dateKey: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='400'>` +
    `<rect width='100%' height='100%' fill='#242422'/>` +
    `<rect x='0' y='0' width='300' height='400' fill='none' stroke='#2E2E2C' stroke-width='2'/>` +
    `<circle cx='150' cy='150' r='110' fill='#2A2A28'/>` +
    `<text x='150' y='44' fill='#F0EFE9' font-family='sans-serif' font-size='16' text-anchor='middle'>${poseLabel(pose)}</text>` +
    `<text x='150' y='366' fill='#7A7A74' font-family='monospace' font-size='15' text-anchor='middle'>${formatPhotoDateShort(dateKey)}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** A simple inline "blood report" image so the gallery/viewer render in preview. */
function mockReport(dateKey: string): string {
  const label = formatBloodworkDate(dateKey);
  const rows = ["Total Testosterone", "Estradiol", "Hematocrit", "HDL", "LDL", "ALT", "TSH"]
    .map(
      (n, i) =>
        `<text x='24' y='${150 + i * 34}' fill='#7A7A74' font-family='monospace' font-size='15'>${n}</text>` +
        `<text x='276' y='${150 + i * 34}' fill='#F0EFE9' font-family='monospace' font-size='15' text-anchor='end'>${(8 + i * 3.1).toFixed(1)}</text>`,
    )
    .join("");
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='400'>` +
    `<rect width='100%' height='100%' fill='#1C1C1A'/>` +
    `<text x='24' y='52' fill='#F0EFE9' font-family='serif' font-size='22'>Blood Panel</text>` +
    `<text x='24' y='78' fill='#C8861A' font-family='monospace' font-size='13'>${label}</text>` +
    `<line x1='24' y1='104' x2='276' y2='104' stroke='#2E2E2C'/>` +
    rows +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * DEV-ONLY preview of the Progress screen, viewable without signing in or any
 * Supabase env. Mirrors the (app) shell. 404s in production. The real `/progress`
 * route reads live Supabase data; this harness feeds representative sample data so
 * the populated UI renders. Add `?demo=1` to see bloodwork with photos; the
 * default shows the empty "attach" state.
 */
export default async function PreviewProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { demo } = await searchParams;

  const today = new Date();
  const dk = (daysAgo: number) =>
    toDateKey(
      new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo),
    );

  // Weight: a gentle ~4-week downward trend for the hero sparkline.
  const sampleWeight = Array.from({ length: 28 }, (_, i) => {
    const noise = i % 3 === 0 ? 0.4 : i % 2 === 0 ? -0.3 : 0.1;
    return { key: dk(27 - i), kg: Math.round((92 - i * 0.12 + noise) * 10) / 10 };
  });

  // Bloodwork: empty by default (the "attach a screenshot" card); ?demo shows photos.
  const notes = ["Mid-cycle bloods — felt great this week.", "", "Baseline before starting."];
  const photos: BloodworkPhoto[] = demo
    ? [dk(12), dk(86), dk(168)].map((d, i) => ({
        id: `demo-${i}`,
        date: d,
        url: mockReport(d),
        note: notes[i] || null,
      }))
    : [];

  // Journal: a small marker catalogue + a couple of sample entries.
  const mk = (
    id: string,
    name: string,
    isDefault: boolean,
    tierLabels: string[],
  ): MarkerCatalogueItem => ({ id, name, polarity: "neutral", isDefault, tierLabels });
  // The full live catalogue (14 preset + 22 optional) so the dropdown matches prod.
  const markerCatalogue: MarkerCatalogueItem[] = [
    mk("acne", "Acne", true, ["None", "Mild", "Moderate", "Severe"]),
    mk("appetite", "Appetite", true, ["Suppressed", "Low", "Normal", "High", "Ravenous"]),
    mk("bloating", "Bloating", true, ["None", "Slight", "Puffy", "Heavy"]),
    mk("energy", "Energy", true, ["Drained", "Flat", "Coasting", "Charged", "Wired"]),
    mk("focus", "Focus", true, ["Foggy", "Scattered", "Clear", "Sharp", "Dialed-In"]),
    mk("injection-site-pain", "Injection Site Pain", true, ["None", "Tender", "Sore", "Painful"]),
    mk("joint-pain", "Joint Pain", true, ["None", "Niggle", "Aching", "Sharp"]),
    mk("libido", "Libido", true, ["Dormant", "Low", "Steady", "High", "Relentless"]),
    mk("mood", "Mood", true, ["Low", "Flat", "Even", "Good", "Elevated"]),
    mk("motivation", "Motivation", true, ["Checked-Out", "Low", "Steady", "Driven", "Locked-In"]),
    mk("pumps", "Pumps", true, ["None", "Faint", "Decent", "Full", "Skin-Splitting"]),
    mk("recovery", "Recovery", true, ["Trashed", "Sore", "Adequate", "Fresh", "Bulletproof"]),
    mk("sleep", "Sleep Quality", true, ["Wrecked", "Restless", "Broken", "Solid", "Deep"]),
    mk("strength", "Strength", true, ["Weak", "Off", "Baseline", "Strong", "PR-Setting"]),
    mk("aggression", "Aggression", false, ["Subdued", "Calm", "Baseline", "Heightened", "Volatile"]),
    mk("anxiety", "Anxiety", false, ["None", "Mild", "Moderate", "Severe"]),
    mk("back-pumps", "Back Pumps", false, ["None", "Mild", "Bad", "Crippling"]),
    mk("breathlessness", "Breathlessness", false, ["None", "Winded", "Laboured", "Gasping"]),
    mk("clitoral-enlargement", "Clitoral Enlargement", false, ["None", "Mild", "Moderate", "Marked"]),
    mk("cycle-changes", "Cycle Changes", false, ["None", "Light Changes", "Irregular", "Absent"]),
    mk("erection-quality", "Erection Quality", false, ["Nonexistent", "Weak", "Decent", "Strong", "Rock-Solid"]),
    mk("facial-body-hair", "Facial / Body Hair", false, ["None", "Slight", "Noticeable", "Marked"]),
    mk("gyno-symptoms", "Gyno Symptoms", false, ["None", "Present"]),
    mk("hair-shedding", "Hair Shedding", false, ["None", "Present"]),
    mk("hand-tremors", "Hand Tremors", false, ["None", "Faint", "Shaky", "Severe"]),
    mk("headaches", "Headaches", false, ["None", "Mild", "Moderate", "Severe"]),
    mk("hot-flushes", "Hot Flushes", false, ["None", "Mild", "Frequent", "Severe"]),
    mk("insomnia", "Insomnia", false, ["None", "Mild", "Moderate", "Severe"]),
    mk("irritability", "Irritability", false, ["None", "Mild", "Moderate", "Severe"]),
    mk("muscle-cramps", "Muscle Cramps", false, ["None", "Twitchy", "Cramping", "Seizing"]),
    mk("muscle-fullness", "Muscle Fullness", false, ["Flat", "Soft", "Filling", "Full", "Spilling-Over"]),
    mk("night-sweats", "Night Sweats", false, ["None", "Mild", "Moderate", "Drenching"]),
    mk("oily-skin", "Oily Skin", false, ["None", "Mild", "Moderate", "Severe"]),
    mk("vascularity", "Vascularity", false, ["Smooth", "Faint", "Visible", "Mapped", "Shredded"]),
    mk("voice-deepening", "Voice Deepening", false, ["None", "Slight", "Noticeable", "Marked"]),
    mk("water-retention", "Water Retention", false, ["Dry", "Tight", "Normal", "Holding", "Watery"]),
  ];
  const journalEntries: JournalEntry[] = [
    {
      id: "j1",
      date: dk(0),
      body: "Strong session, felt dialed in. Sleep's been great this week.",
      markers: [
        { markerId: "energy", name: "Energy", tierValue: 4, word: "Charged" },
        { markerId: "sleep", name: "Sleep Quality", tierValue: 5, word: "Deep" },
      ],
    },
    {
      id: "j2",
      date: dk(2),
      body: null,
      markers: [
        { markerId: "mood", name: "Mood", tierValue: 4, word: "Good" },
        { markerId: "libido", name: "Libido", tierValue: 4, word: "High" },
      ],
    },
    {
      id: "j3",
      date: dk(5),
      body: "Bit flat today, joints aching after legs.",
      markers: [],
    },
  ];

  // Consistency: ~45 days of adherence — mostly logged, some partials/misses/rest.
  const consistencySample: AdherencePoint[] = Array.from({ length: 45 }, (_, i) => {
    const key = dk(44 - i); // oldest → newest
    if (i % 7 === 3) return { key, due: 0, logged: 0, pct: null }; // rest day
    const due = 2;
    let logged = 2;
    if (i % 11 === 0) logged = 0;
    else if (i % 5 === 0) logged = 1;
    return { key, due, logged, pct: Math.round((logged / due) * 100) };
  });

  // Progress photos: full sessions across months, weight-linked, plus customs.
  const w = (daysAgo: number) => Math.round((92 + daysAgo * 0.03) * 10) / 10;
  const session = (prefix: string, daysAgo: number, poses: string[]): ProgressPhoto[] =>
    poses.map((pose, i) => ({
      id: `${prefix}-${i}`,
      pose,
      date: dk(daysAgo),
      url: mockPhoto(pose, dk(daysAgo)),
      weightKg: w(daysAgo),
    }));
  const progressPhotos: ProgressPhoto[] = [
    ...session("d1", 4, ["front-relaxed", "side-relaxed", "back-relaxed"]),
    ...session("d2", 12, ["front-relaxed", "side-relaxed", "back-relaxed", "most-muscular"]),
    ...session("d3", 40, ["front-relaxed", "side-chest"]),
    ...session("d4", 70, ["front-relaxed", "front-double-biceps"]),
    ...session("d5", 124, ["front-relaxed", "side-relaxed", "back-relaxed"]),
  ].sort((a, b) => b.date.localeCompare(a.date)); // newest first, like the page

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
          Preview · Progress
        </span>
      </header>

      <main className="flex-1">
        <ProgressScreen
          weight={sampleWeight}
          unitPreference="metric"
          todayKey={toDateKey(today)}
          userId="preview-local"
          bloodworkPhotos={photos}
          journalEntries={journalEntries}
          markerCatalogue={markerCatalogue}
          consistencySample={consistencySample}
          progressPhotos={progressPhotos}
        />
      </main>

      <BottomNav userId="preview-local" unit="kg" />
    </div>
  );
}
