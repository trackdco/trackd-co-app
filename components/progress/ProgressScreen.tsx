import { PageScrollTitle } from "@/components/layout/PageScrollTitle";
import { BlockBanner } from "@/components/progress/BlockBanner";
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

/**
 * The Progress tab — the "look back" screen (spec 08 · part two). Everything that
 * came off the dashboard lives here.
 *
 * The live block, the photo card, then a two-by-two grid of Weight, Journal,
 * Bloods and Consistency. The widgets share the dashboard's grid and card chrome
 * (`grid-cols-2 gap-3`, `p-5`, eyebrow then content) so the two tabs read as one
 * app. They are TALLER than the dashboard's Today / Next Dose cards — about 228px
 * against 183px — because a sparkline plus a toggle, or a graph plus a range
 * selector, does not fit in 183. The width and the chrome match; the height is
 * what the content needs. Whether they should be forced square is Adrian's call
 * and is parked in next-tasks.
 *
 * The photo card carries a "Running" list resolved against the PHOTO'S date, so
 * scrolling back tells you what you were on when the shot was taken.
 *
 * Each block fades + rises in on load (the same staggered `animate-home-up`
 * idiom as Home and Protocol).
 */
export function ProgressScreen({
  weight,
  unitPreference,
  todayKey,
  userId,
  bloodworkPhotos,
  journalEntries,
  markerOptions,
  consistencySample,
  progressPhotos,
  previewStack,
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
  /** Dev-preview-only: render the block banner without a device store. */
  previewBlocks?: Block[];
}) {
  const unit = unitForPreference(unitPreference);


  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5">
      <div className="animate-home-up" style={{ animationDelay: "0ms" }}>
        <PageScrollTitle title="Progress" />
      </div>

      {/* The live block frames everything under it, so it leads. Slim on
          purpose: a hero card here would push the photo below the fold. */}
      <div className="animate-home-up" style={{ animationDelay: "40ms" }}>
        <BlockBanner
          userId={userId}
          todayKey={todayKey}
          sampleBlocks={previewBlocks}
          weight={weight}
        />
      </div>

      {/* Photos: the card, then what was running on that photo's date. */}
      <div className="animate-home-up" style={{ animationDelay: "75ms" }}>
        <ProgressPhotoSection
          photos={progressPhotos}
          userId={userId}
          todayKey={todayKey}
          unit={unit}
          previewStack={previewStack}
        />
      </div>

      {/* Weight · Journal / Bloods · Consistency. */}
      <div
        className="animate-home-up grid grid-cols-2 items-stretch gap-3"
        style={{ animationDelay: "100ms" }}
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
