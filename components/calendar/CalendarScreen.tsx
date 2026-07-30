"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
  buildRunning,
  type MonthCell,
} from "@/lib/calendar/calendar";
import {
  getStackSnapshot,
  isDueOnFor,
  resolveScheduleOn,
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
  toDateKey,
  type DateKey,
} from "@/lib/home/mockHomeData";
import { requestProgressAction } from "@/lib/progress/progressAction";
import {
  cycleBandsForDays,
  cycleKeyRows,
  describeCycleEnd,
} from "@/lib/calendar/cycleBands";
import { cycleColourVar, formatCyclePattern } from "@/lib/protocol/cycleRule";
import { CARD_EYEBROW, DATA_MONO } from "@/lib/ui-presets";
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
  todayKey: serverTodayKey,
  unitPreference,
  bodySex,
  sampleStack,
  sampleLogs,
}: CalendarScreenProps) {
  const router = useRouter();
  const mounted = useMounted();
  const unit = unitForPreference(unitPreference);
  const deviceReady = sampleStack || sampleLogs ? true : mounted;

  // `serverTodayKey` is the SERVER's date. Vercel runs UTC, so for an AU user it
  // is the previous day for ten hours of every day — the grid highlighted the
  // wrong cell, "today" was a day behind, and every future/past judgement below
  // (`key > todayKey`) shifted with it. Home already corrects this to the device
  // clock and keeps ticking so an open page rolls over at LOCAL midnight; the
  // calendar, a screen whose entire subject is which day it is, did not.
  const [todayKey, setTodayKey] = useState<DateKey>(serverTodayKey);

  const [view, setView] = useState(() => {
    const d = dateKeyToDate(serverTodayKey);
    return { year: d.getFullYear(), month0: d.getMonth() };
  });
  const [selectedKey, setSelectedKey] = useState<DateKey>(serverTodayKey);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  // The compound being logged from the calendar, if any.
  const [logTarget, setLogTarget] = useState<StackCompound | null>(null);

  // Correct "today" to the DEVICE clock, then keep it correct: on focus, on
  // becoming visible again, and once a minute so a page left open overnight rolls
  // over at local midnight. Same rule as Home — if the user is parked on today we
  // follow the rollover, and if they have navigated to another day their selection
  // is left alone. `setState` only fires when the day actually changes.
  const todayKeyRef = useRef(todayKey);
  useEffect(() => {
    todayKeyRef.current = todayKey;
  }, [todayKey]);
  const selectedKeyRef = useRef(selectedKey);
  useEffect(() => {
    selectedKeyRef.current = selectedKey;
  }, [selectedKey]);
  useEffect(() => {
    function syncToday() {
      const local = toDateKey(new Date());
      const previous = todayKeyRef.current;
      if (local === previous) return;
      const d = dateKeyToDate(local);
      // Follow the month ONLY when the user was parked on today. Testing "is
      // the view on today's month" instead meant that rolling over on the 31st
      // moved the grid to September while the user's selection stayed on the
      // 4th of August — the selection scrolled off screen, and the FAB kept
      // writing to a day the grid was no longer showing.
      const wasOnToday = selectedKeyRef.current === previous;
      setSelectedKey((sel) => (sel === previous ? local : sel));
      if (wasOnToday) setView({ year: d.getFullYear(), month0: d.getMonth() });
      setTodayKey(local);
    }
    syncToday();
    const onVisible = () => {
      if (document.visibilityState === "visible") syncToday();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", syncToday);
    const id = window.setInterval(syncToday, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", syncToday);
      window.clearInterval(id);
    };
  }, []);

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

  // Cycle bands behind the grid (Spec 03 · part two). Only repeating on/off
  // cycles render; a month with none produces an empty map and the grid is
  // byte-for-byte what it was before cycles existed.
  const cycleBands = useMemo(
    () => cycleBandsForDays(stack, cells.map((c) => c.key), todayKey),
    [stack, cells, todayKey],
  );
  /** One row per cycle for the key below the grid, in the same stable order. */
  const cycleKey = useMemo(() => cycleKeyRows(stack), [stack]);
  /** The cycles covering the open day, for the day-detail sheet. End dates live
   *  there rather than on the grid, which would clutter every on-day. */
  const cyclesOnSelected = useMemo(
    () =>
      (cycleBands.get(selectedKey) ?? []).flatMap((seg) => {
        const compound = stackById.get(seg.compoundId);
        if (!compound) return [];
        // The cycle in force ON THAT DAY, not the compound's current one — the
        // grid resolves per day, so reading `compound.cycle` here would describe
        // a past band with a rule the user only adopted later.
        const cycle = resolveScheduleOn(compound, selectedKey).cycle;
        if (!cycle) return [];
        return [{
          compoundId: seg.compoundId,
          compoundName: seg.compoundName,
          colour: seg.colour,
          pattern: formatCyclePattern(cycle.pattern),
          end: describeCycleEnd(cycle),
        }];
      }),
    [cycleBands, selectedKey, stackById],
  );

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
          cycleBands={cycleBands}
        />
      </div>

      {/* The cycle key — one row per drawn cycle. Omitted entirely when nothing
          is cycled, so a user without cycles sees the calendar unchanged. */}
      {cycleKey.length > 0 && (
        <section className="mt-5 rounded-2xl bg-bg-surface px-5 py-4">
          <h2 className={CARD_EYEBROW}>Cycles</h2>
          <ul className="mt-3 space-y-2">
            {cycleKey.map((row) => (
              <li key={row.compoundId} className="flex items-center gap-3">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: cycleColourVar(row.colour) }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {row.compoundName}
                </span>
                <span className={DATA_MONO}>{row.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
        cycles={cyclesOnSelected}
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
        onTracked={(compoundId, log, landsOn, openedOn) => {
          // The Date row is editable, so a dose can land on a day other than the
          // one the sheet was opened on. Move it rather than copying it, and
          // follow it, exactly as Home does.
          if (landsOn !== openedOn) unlogDose(userId, openedOn, compoundId)
          logDose(userId, landsOn, compoundId, log)
          if (landsOn !== openedOn) {
            const d = dateKeyToDate(landsOn as DateKey)
            setSelectedKey(landsOn as DateKey)
            setView({ year: d.getFullYear(), month0: d.getMonth() })
          }
        }}
        onRemove={(compoundId) => unlogDose(userId, selectedKey, compoundId)}
      />

      <LegendSheet open={legendOpen} onOpenChange={setLegendOpen} />
    </div>
  );
}
