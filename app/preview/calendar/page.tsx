import Image from "next/image";
import { notFound } from "next/navigation";

import { BottomNav } from "@/components/navigation/bottom-nav";
import {
  CalendarScreen,
  type CalendarJournalDay,
} from "@/components/calendar/CalendarScreen";
import { toDateKey, type DoseLog } from "@/lib/home/mockHomeData";
import type { DayLogs } from "@/lib/home/doseLog";
import type { StackCompound } from "@/lib/home/stack";

/**
 * DEV-ONLY preview of the Calendar screen, viewable without signing in or any
 * Supabase env. Mirrors the (app) shell. 404s in production. The real `/calendar`
 * route reads live Supabase (weight + journal/markers) plus the device-local dose
 * log; this harness feeds representative sample data — anchored to the current
 * month — so the populated grid, day indicators, and the day-detail sheet render.
 */
export default function PreviewCalendarPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const today = new Date();
  const dk = (daysAgo: number) =>
    toDateKey(
      new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo),
    );

  // The protocol (resolves the Running row's names / units / category dots).
  const sampleStack: StackCompound[] = [
    {
      id: "c-test",
      name: "Testosterone E",
      category: "anabolic",
      method: "im",
      dose: 250,
      unit: "mg",
      schedule: { cadence: { type: "daysOfWeek", days: [1, 4] }, timeOfDay: "09:00", startDate: dk(60) },
      rotationSites: ["im-vglute-r", "im-vglute-l"],
      rotationIndex: 0,
    },
    {
      id: "c-tirz",
      name: "Tirzepatide",
      category: "peptide",
      method: "subq",
      dose: 5,
      unit: "mg",
      schedule: { cadence: { type: "daily" }, timeOfDay: "20:00", startDate: dk(60) },
      rotationSites: ["sq-abdo-lr", "sq-abdo-ll"],
      rotationIndex: 0,
    },
    {
      id: "c-arim",
      name: "Anastrozole",
      category: "ancillary",
      method: "po",
      dose: 0.5,
      unit: "mg",
      schedule: { cadence: { type: "everyOtherDay" }, timeOfDay: "09:00", startDate: dk(60) },
      rotationSites: [],
      rotationIndex: 0,
    },
  ];

  // Logged doses across the last few weeks — Tirzepatide ~daily, Test E a couple
  // of times a week, Anastrozole EOD; the gaps read as partials / rest days.
  const sampleLogs: DayLogs = {};
  for (let ago = 0; ago <= 24; ago++) {
    const day: Record<string, DoseLog> = {};
    if (ago % 9 !== 4) {
      day["c-tirz"] = {
        amount: "5",
        siteId: ago % 2 ? "sq-abdo-ll" : "sq-abdo-lr",
        time24: "20:10",
      };
    }
    if (ago % 3 === 0) {
      day["c-test"] = {
        amount: "250",
        siteId: ago % 6 === 0 ? "im-vglute-r" : "im-vglute-l",
        time24: "09:05",
      };
    }
    if (ago % 2 === 0) {
      day["c-arim"] = { amount: "0.5", siteId: null, time24: "09:00" };
    }
    if (Object.keys(day).length) sampleLogs[dk(ago)] = day;
  }

  // Weight on a scattering of days (drives the weight dot + the Weight row).
  const weightByDate: Record<string, number> = {};
  for (let ago = 0; ago <= 24; ago += 3) {
    weightByDate[dk(ago)] = Math.round((92 - ago * 0.08) * 10) / 10;
  }

  // A few journal entries (body and/or markers).
  const journalByDate: Record<string, CalendarJournalDay> = {
    [dk(0)]: {
      id: "j1",
      body: "Strong session, dialed in. Sleep's been great this week.",
      markers: [
        { markerId: "energy", name: "Energy", tierValue: 4, word: "Charged" },
        { markerId: "sleep", name: "Sleep Quality", tierValue: 5, word: "Deep" },
      ],
    },
    [dk(2)]: {
      id: "j2",
      body: null,
      markers: [
        { markerId: "mood", name: "Mood", tierValue: 4, word: "Good" },
        { markerId: "libido", name: "Libido", tierValue: 4, word: "High" },
      ],
    },
    [dk(5)]: {
      id: "j3",
      body: "Bit flat today, joints aching after legs.",
      markers: [],
    },
  };

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
          Preview · Calendar
        </span>
      </header>

      <main className="flex-1">
        <CalendarScreen
          weightByDate={weightByDate}
          journalByDate={journalByDate}
          userId="preview-local"
          todayKey={toDateKey(today)}
          unitPreference="metric"
          sampleStack={sampleStack}
          sampleLogs={sampleLogs}
        />
      </main>

      <BottomNav userId="preview-local" unit="kg" />
    </div>
  );
}
