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

/**
 * The Progress tab — the metric-first "look back" screen (Context/Feature
 * Specs/09). A single vertical scroll on the Obsidian canvas: weight is the hero,
 * followed by bloodwork (a dated photo store), the journal, and consistency. Kept
 * separate from Home ("today"), Protocol ("the schedule"), and the Calendar.
 *
 * Each section fades + rises in on load (the same staggered `animate-home-up`
 * idiom as Home), top → bottom: Title → Weight (hero) → Bloodwork (a dated photo
 * store) → Journal → Consistency (adherence over time).
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
}) {
  const unit = unitForPreference(unitPreference);

  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5">
      <div className="animate-home-up" style={{ animationDelay: "0ms" }}>
        <PageScrollTitle title="Progress" />
      </div>

      {/* Weight — the hero. A summary glance that taps into the canonical
          /weight view (full graph, range toggle, scrubber). */}
      <div className="animate-home-up" style={{ animationDelay: "55ms" }}>
        <WeightHero series={weight} unit={unit} />
      </div>

      {/* Progress photos — a posed photo log (latest session carousel), below Weight. */}
      <div className="animate-home-up" style={{ animationDelay: "100ms" }}>
        <ProgressPhotoSection
          photos={progressPhotos}
          userId={userId}
          todayKey={todayKey}
          unit={unit}
        />
      </div>

      {/* Bloodwork — a dated photo store: attach a screenshot, look back by date. */}
      <div className="animate-home-up" style={{ animationDelay: "110ms" }}>
        <BloodworkSection
          photos={bloodworkPhotos}
          userId={userId}
          todayKey={todayKey}
        />
      </div>

      {/* Journal — write notes and/or dial markers; one entry per day. */}
      <div className="animate-home-up" style={{ animationDelay: "165ms" }}>
        <JournalSection
          entries={journalEntries}
          options={markerOptions}
          userId={userId}
          todayKey={todayKey}
        />
      </div>

      {/* Consistency — adherence to the protocol over time. */}
      <div className="animate-home-up" style={{ animationDelay: "230ms" }}>
        <ConsistencySection
          userId={userId}
          todayKey={todayKey}
          sample={consistencySample}
        />
      </div>
    </div>
  );
}
