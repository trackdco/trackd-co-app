import { PageScrollTitle } from "@/components/layout/PageScrollTitle";
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
import type { DayLogs } from "@/lib/home/doseLog";
import type { StackCompound } from "@/lib/home/stack";

/**
 * The Progress tab — the "look back" screen (spec 08 · part two). Everything that
 * came off the dashboard lives here.
 *
 * Two blocks: the photo card at the top, then a two-by-two grid of Weight,
 * Journal, Bloods and Consistency. The widgets are the dashboard's Today /
 * Next Dose cards' footprint exactly (`grid-cols-2 gap-3`, `p-5`, eyebrow then
 * content), because a screen that invents its own grid is how two tabs stop
 * looking like one app.
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
  previewLogs,
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
}) {
  const unit = unitForPreference(unitPreference);

  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5">
      <div className="animate-home-up" style={{ animationDelay: "0ms" }}>
        <PageScrollTitle title="Progress" />
      </div>

      {/* Photos lead: the card, then what was running on that photo's date. */}
      <div className="animate-home-up" style={{ animationDelay: "55ms" }}>
        <ProgressPhotoSection
          photos={progressPhotos}
          userId={userId}
          todayKey={todayKey}
          unit={unit}
          previewStack={previewStack}
          previewLogs={previewLogs}
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
