import { PageScrollTitle } from "@/components/layout/PageScrollTitle";
import { BlockBanner } from "@/components/progress/BlockBanner";
import { CloudHydration } from "@/components/home/CloudHydration";
import { WeightHero } from "@/components/progress/WeightHero";
import { BloodworkSection } from "@/components/progress/BloodworkSection";
import { JournalSection } from "@/components/progress/JournalSection";
import { ConsistencySection } from "@/components/progress/ConsistencySection";
import { ProgressPhotoSection } from "@/components/progress/ProgressPhotoSection";
import type { DateKey } from "@/lib/home/mockHomeData";
import type { BloodworkPhoto } from "@/lib/progress/bloodwork";
import type { AdherencePoint } from "@/lib/progress/consistency";
import type { JournalEntry, MarkerOption } from "@/lib/progress/journal";
import type { ProgressPhoto } from "@/lib/progress/photos";
import { unitForPreference } from "@/lib/weight";
import type { StackCompound } from "@/lib/home/stack";
import type { Block } from "@/lib/blocks/block";
import type { DayLogs } from "@/lib/home/doseLog";

/**
 * The Progress tab — the "look back" screen (spec 08 · part two). Everything that
 * came off the dashboard lives here.
 *
 * The photo card, the live block, then a two-by-two grid of Weight, Journal,
 * Bloods and Consistency. The widgets share the dashboard's grid and card chrome
 * (`grid-cols-2 gap-3`, `p-5`, eyebrow then content) so the two tabs read as one
 * app. They are TALLER than the dashboard's Today / Next Dose cards — about 228px
 * against 183px — because a sparkline plus a toggle, or a graph plus a range
 * selector, does not fit in 183. The width and the chrome match; the height is
 * what the content needs. Whether they should be forced square is Adrian's call
 * and is parked in next-tasks.
 *
 * The photo card carries a "Running" list resolved against the PHOTO'S date
 * rather than today, so it says what you were on when that shot was taken. The
 * card itself shows the most recent day's set and swipes between the poses in
 * it (spec 08: the viewer and its swipe are unchanged), so the date it resolves
 * against is that day — scrolling back through older days happens in the
 * gallery, which has its own list.
 *
 * Each block fades + rises in on load (the same staggered `animate-home-up`
 * idiom as Home and Protocol).
 */
export function ProgressScreen({
  weight,
  unitPreference,
  todayKey: serverTodayKey,
  userId,
  bloodworkPhotos,
  journalEntries,
  markerOptions,
  consistencySample,
  progressPhotos,
  blocks,
  previewStack,
  previewLogs,
  previewBlocks,
}: {
  /** Bodyweight points from `weight_logs`, oldest → newest. */
  weight: { key: DateKey; kg: number }[];
  /** "metric" | "imperial" from the profile. */
  unitPreference: string;
  todayKey: DateKey;
  /** Scopes the bloodwork photo uploads to the signed-in user. */
  userId: string;
  /** The user's bloodwork photos, newest first. */
  bloodworkPhotos: BloodworkPhoto[];
  /** The user's journal entries, newest first. */
  journalEntries: JournalEntry[];
  /** The markers the journal dialer offers: the global catalogue + the user's own custom markers. */
  markerOptions: MarkerOption[];
  /** Dev-preview-only adherence series (real data is read device-side). */
  consistencySample?: AdherencePoint[];
  /** The user's progress photos, newest first. */
  progressPhotos: ProgressPhoto[];
  /** Dev-preview-only: inject the device stack + dose log, so `/preview/progress`
   *  can exercise the photo card's Running list without signing in. The real
   *  screen reads both from the device store. */
  previewStack?: StackCompound[];
  previewLogs?: DayLogs;
  /** The user's blocks from Postgres, newest start first. */
  blocks?: Block[];
  /** Dev-preview-only: render the block banner without a signed-in read. */
  previewBlocks?: Block[];
}) {
  const unit = unitForPreference(unitPreference);
  // This component is NOT a client component, so the correction cannot happen
  // here: `todayKey` arrives as the SERVER's date (UTC on Vercel, a day out for
  // most of the world for part of every day) and each client child corrects it.
  // `BlockBanner` does, since a block turns the date into "days left" and a
  // target reading.
  const todayKey = serverTodayKey;

  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5">
      <div className="animate-home-up" style={{ animationDelay: "0ms" }}>
        <PageScrollTitle title="Progress" />
      </div>

      {/* Fills the device stores this screen READS from (consistency, the
          running list). Renders nothing. */}
      <CloudHydration userId={userId} />

      {/* Photos lead the screen (Adrian, 2026-07-31). They are the thing people
          open Progress for, and the block used to push them down the page. */}
      {/* Photos: the card, then what was running on that photo's date. */}
      <div className="animate-home-up" style={{ animationDelay: "75ms" }}>
        <ProgressPhotoSection
          photos={progressPhotos}
          userId={userId}
          todayKey={todayKey}
          unit={unit}
          previewStack={previewStack}
          previewLogs={previewLogs}
        />
      </div>

      <div className="animate-home-up" style={{ animationDelay: "110ms" }}>
        <BlockBanner
          todayKey={todayKey}
          userId={userId}
          blocks={previewBlocks ?? blocks ?? []}
          weight={weight}
          unit={unit}
        />
      </div>

      {/* Weight · Journal / Bloods · Consistency. */}
      <div
        className="animate-home-up grid grid-cols-2 items-stretch gap-3"
        style={{ animationDelay: "145ms" }}
      >
        <WeightHero series={weight} unit={unit} compact />
        <JournalSection
          entries={journalEntries}
          options={markerOptions}
          userId={userId}
          todayKey={todayKey}
          compact
        />
        <BloodworkSection
          photos={bloodworkPhotos}
          userId={userId}
          todayKey={todayKey}
          compact
        />
        <ConsistencySection
          userId={userId}
          todayKey={todayKey}
          sample={consistencySample}
          compact
        />
      </div>
    </div>
  );
}
