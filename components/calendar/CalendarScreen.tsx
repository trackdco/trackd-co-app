"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@/components/icons";

import { useMounted } from "@/components/home/useMounted";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { MonthYearPicker } from "@/components/calendar/MonthYearPicker";
import { DayDetailSheet } from "@/components/calendar/DayDetailSheet";
import { LegendSheet } from "@/components/calendar/LegendSheet";
import {
  buildMonthMatrix,
  resolveDayStatus,
  type CalendarPhoto,
  type DayInfo,
  type LoggedCompound,
  type MonthCell,
} from "@/lib/calendar/calendar";
import {
  getStackSnapshot,
  isDueOnFor,
  subscribeStack,
  type StackCompound,
} from "@/lib/home/stack";
import {
  getDoseLogsSnapshot,
  subscribeDoseLogs,
  type DayLogs,
} from "@/lib/home/doseLog";
import {
  seedStack,
  dateKeyToDate,
  type DateKey,
  type DoseLog,
} from "@/lib/home/mockHomeData";
import { requestProgressAction } from "@/lib/progress/progressAction";
import { LogDoseSheet } from "@/components/home/LogDoseSheet";
import { setSelectedDay } from "@/lib/home/selectedDay";
import { logDose, unlogDose } from "@/lib/home/doseLog";
import type { EntryMarker } from "@/lib/progress/journal";
import { unitForPreference } from "@/lib/weight";
import type { BodySex } from "@/lib/db/types";

const EMPTY_LOGS: DayLogs = {};

/** That day's journal entry, stitched server-side and passed in. */
export interface CalendarJournalDay {
  id: string;
  body: string | null;
  markers: EntryMarker[];
}

interface CalendarScreenProps {
  /** kg, keyed by 'YYYY-MM-DD'. */
  weightByDate: Record<DateKey, number>;
  /** Journal entry (body + markers) keyed by day. */
  journalByDate: Record<DateKey, CalendarJournalDay>;
  /** Progress photos (signed) keyed by day. */
  photosByDate: Record<DateKey, CalendarPhoto[]>;
  /** Scopes the device-local stack + dose-log reads. */
  userId: string;
  todayKey: DateKey;
  /** "metric" | "imperial" from the profile. */
  unitPreference: string;
  /** Which figure the log-dose body map draws (from the user's profile). */
  bodySex: BodySex;
  /** Dev-preview-only: inject the device-local stack + dose log. */
  sampleStack?: StackCompound[];
  sampleLogs?: DayLogs;
}

/** Resolve the logged compounds for a day (pure — safe for memo + render). */
function buildRunning(
  day: Record<string, DoseLog> | undefined,
  stackById: Map<string, StackCompound>,
): LoggedCompound[] {
  if (!day) return [];
  return Object.entries(day)
    .map(([compoundId, log]) => {
      const c = stackById.get(compoundId);
      return {
        id: compoundId,
        name: c?.name ?? "Logged dose",
        category: c?.category ?? "",
        amount: log.amount,
        unit: c?.unit ?? "",
        time24: log.time24,
        siteId: log.siteId,
      };
    })
    .sort((a, b) => a.time24.localeCompare(b.time24));
}

/**
 * The Calendar screen — the date-first "look back" (Milligram-style). A month
 * grid of adherence rings: filled disc (logged: a dose, journal, or weight + a
 * tiny type icon), dotted ring (scheduled, unlogged), regular stroke (past,
 * nothing due), faint stroke (future / pre-protocol). The selected day reads
 * white — the primary accent. Tap any day for a read-only detail sheet (Running →
 * Weight → Markers → Journal → Photos); Weight and Journal deep-link to their canonical
 * editors. A "June 2026 ⌄" month/year picker pages the months; the footer has a
 * Today button and the ⓘ Calendar key.
 *
 * Weight / journal / markers arrive as props (Supabase, RLS-scoped); the dose
 * "Running" + the scheduled/logged ring states come from the same device-local
 * stack + dose log Home uses, read after mount so SSR stays deterministic.
 */
export function CalendarScreen({
  weightByDate,
  journalByDate,
  photosByDate,
  userId,
  todayKey,
  unitPreference,
  bodySex,
  sampleStack,
  sampleLogs,
}: CalendarScreenProps) {
  const router = useRouter();
  const mounted = useMounted();
  const unit = unitForPreference(unitPreference);
  const deviceReady = sampleStack || sampleLogs ? true : mounted;

  const [view, setView] = useState(() => {
    const d = dateKeyToDate(todayKey);
    return { year: d.getFullYear(), month0: d.getMonth() };
  });
  const [selectedKey, setSelectedKey] = useState<DateKey>(todayKey);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  // The compound being logged from the calendar, if any.
  const [logTarget, setLogTarget] = useState<StackCompound | null>(null);

  const liveStack = useSyncExternalStore(
    subscribeStack,
    () => getStackSnapshot(userId, seedStack),
    () => seedStack,
  );
  const liveLogs = useSyncExternalStore(
    subscribeDoseLogs,
    () => getDoseLogsSnapshot(userId),
    () => EMPTY_LOGS,
  );
  const stack = sampleStack ?? liveStack;
  const logs = sampleLogs ?? liveLogs;

  const cells = useMemo(
    () => buildMonthMatrix(view.year, view.month0),
    [view.year, view.month0],
  );
  const stackById = useMemo(() => new Map(stack.map((c) => [c.id, c])), [stack]);
  const activeStack = useMemo(() => stack.filter((c) => !c.archived), [stack]);

  // Per-day ring state + icon for the grid.
  function infoFor(key: DateKey): DayInfo {
    const j = journalByDate[key];
    const loggedDose = deviceReady && Boolean(logs[key]);
    const hasPhoto = (photosByDate[key]?.length ?? 0) > 0;
    const hasJournal = Boolean(j && (j.body?.trim() || j.markers.length));
    const hasWeight = weightByDate[key] != null;
    const scheduled =
      deviceReady &&
      activeStack.some((c) => isDueOnFor(c, dateKeyToDate(key)));
    const logged = loggedDose || hasPhoto || hasJournal || hasWeight;
    const status = resolveDayStatus(logged, scheduled, key > todayKey);
    const kind = loggedDose
      ? "dose"
      : hasPhoto
        ? "photo"
        : hasJournal
          ? "journal"
          : hasWeight
            ? "weight"
            : null;
    return { status, kind };
  }

  // The selected day's detail.
  const selJournal = journalByDate[selectedKey];
  const running = useMemo(
    () => buildRunning(deviceReady ? logs[selectedKey] : undefined, stackById),
    [deviceReady, logs, selectedKey, stackById],
  );

  // Compounds due on the selected day that aren't logged yet — the calendar's
  // log path (Spec 01 → "any screen that has a selected date passes that date
  // into the logging action"). The calendar was read-only, so picking a past day
  // and logging simply wasn't possible from here.
  const dueOnSelected = useMemo(
    () =>
      deviceReady
        ? activeStack.filter(
            (c) =>
              !logs[selectedKey]?.[c.id] &&
              isDueOnFor(c, dateKeyToDate(selectedKey)),
          )
        : [],
    [deviceReady, activeStack, logs, selectedKey],
  );

  // Days since each site was last used, relative to the SELECTED day — the log
  // sheet's "last used here" rest hint. Same computation as the dashboard's.
  const siteLastUsedDays = useMemo(() => {
    const out: Record<string, number> = {};
    const selN = Math.floor(dateKeyToDate(selectedKey).getTime() / 86_400_000);
    for (const [key, dayLogObj] of Object.entries(logs)) {
      if (key > selectedKey) continue;
      const ago = selN - Math.floor(dateKeyToDate(key).getTime() / 86_400_000);
      if (ago < 0) continue;
      for (const [compoundId, dayLog] of Object.entries(dayLogObj)) {
        if (key === selectedKey && compoundId === logTarget?.id) continue;
        const sid = dayLog.siteId;
        if (sid && (out[sid] === undefined || ago < out[sid])) out[sid] = ago;
      }
    }
    return out;
  }, [logs, selectedKey, logTarget]);

  // Publish the day the calendar is parked on, so the quick-actions FAB writes
  // here too rather than to today. Cleared on unmount (see selectedDay.ts).
  useEffect(() => {
    setSelectedDay(selectedKey);
    return () => setSelectedDay(null);
  }, [selectedKey]);

  function handleSelect(cell: MonthCell) {
    if (!cell.inMonth) {
      setView({ year: cell.date.getFullYear(), month0: cell.date.getMonth() });
    }
    setSelectedKey(cell.key);
    setSheetOpen(true);
  }
  function goToday() {
    const d = dateKeyToDate(todayKey);
    setView({ year: d.getFullYear(), month0: d.getMonth() });
    setSelectedKey(todayKey);
  }

  return (
    <div className="mx-auto w-full max-w-md px-5 pt-4 pb-5 animate-home-up">
      <Link
        href="/dashboard"
        className="-ml-1 inline-flex items-center gap-1.5 text-sm text-text-muted outline-none transition-colors hover:text-foreground focus-visible:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Dashboard
      </Link>

      <header className="mt-5 px-1">
        <MonthYearPicker year={view.year} month0={view.month0} onChange={setView} />
      </header>

      <div className="mt-5">
        <MonthGrid
          cells={cells}
          todayKey={todayKey}
          selectedKey={selectedKey}
          infoFor={infoFor}
          onSelect={handleSelect}
          onToday={goToday}
          onOpenLegend={() => setLegendOpen(true)}
        />
      </div>

      <DayDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        dateKey={selectedKey}
        running={running}
        weightKg={weightByDate[selectedKey] ?? null}
        unit={unit}
        markers={selJournal?.markers ?? []}
        journalBody={selJournal?.body ?? null}
        hasJournalEntry={Boolean(selJournal)}
        photos={photosByDate[selectedKey] ?? []}
        dueToLog={dueOnSelected}
        onLogDose={(c) => {
          setSheetOpen(false);
          setLogTarget(c);
        }}
        onOpenWeight={() => {
          setSheetOpen(false);
          router.push("/weight");
        }}
        onOpenJournal={() => {
          setSheetOpen(false);
          requestProgressAction("journal-open", selectedKey);
          router.push("/progress");
        }}
        onOpenPhotos={() => {
          setSheetOpen(false);
          requestProgressAction("photos-gallery");
          router.push("/progress");
        }}
      />

      {/* Logging from the calendar writes to the SELECTED day — the same
          LogDoseSheet the dashboard uses, handed `selectedKey` as its dateKey so
          nothing can fall back to "now". */}
      <LogDoseSheet
        open={logTarget !== null}
        compound={logTarget}
        existing={logTarget ? (logs[selectedKey]?.[logTarget.id] ?? null) : null}
        dateKey={selectedKey}
        todayKey={todayKey}
        siteLastUsedDays={siteLastUsedDays}
        bodySex={bodySex}
        onOpenChange={(o) => {
          if (!o) setLogTarget(null);
        }}
        onTracked={(compoundId, log) => logDose(userId, selectedKey, compoundId, log)}
        onRemove={(compoundId) => unlogDose(userId, selectedKey, compoundId)}
      />

      <LegendSheet open={legendOpen} onOpenChange={setLegendOpen} />
    </div>
  );
}
