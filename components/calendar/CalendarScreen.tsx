"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { BackLink } from "@/components/feel/BackLink";
import { useLogRows } from "@/components/home/log/useLogRows";
import { useDrawSources } from "@/components/home/log/useDrawSources";
import { dayDoseRows } from "@/lib/home/logRows";
import { parseSlotKey } from "@/lib/home/doseLog";

import { useMounted } from "@/components/home/useMounted";
import { CalendarBlocks, RouteHandoff, RouteTitle } from "@/components/feel/RouteSkeletons";
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
import { setSelectedDay } from "@/lib/home/selectedDay";
import {
  addOneOff,
  getOneOffsSnapshot,
  hasOneOffOn,
  oneOffsOn,
  recentOneOffLabels,
  removeOneOff,
  subscribeOneOffs,
  type OneOffDays,
} from "@/lib/home/oneOffLogs";
import { OneOffSheet } from "@/components/home/OneOffSheet";
import { OneOffDaySheet } from "@/components/calendar/OneOffDaySheet";
import { dayLong } from "@/lib/format/date";
import { showToast } from "@/lib/toast";

/** Stable empty reference for the one-off store's server snapshot. */
const EMPTY_ONE_OFFS: OneOffDays = {};
import { commitDoseOn, unlogDose } from "@/lib/home/doseLog";
import type { EntryMarker } from "@/lib/progress/journal";
import { unitForPreference } from "@/lib/weight";
import type { BodySex } from "@/lib/db/types";
import { useWriteAccess } from "@/components/billing/ReadOnlyGate";

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
 * white — the primary accent. Tap any day for its sheet: the day's doses as the
 * same Flow B rows Home draws (log one on THAT day), then what else was logged
 * (off-plan, weight, markers, journal, photos); Weight and Journal deep-link to
 * their canonical editors. A "June 2026 ⌄" month/year picker pages the months;
 * the footer has a Today button and the ⓘ Calendar key.
 *
 * Weight / journal / markers arrive as props (Supabase, RLS-scoped); the doses
 * and the scheduled/logged ring states come from the same device-local stack +
 * dose log Home uses, read after mount so SSR stays deterministic.
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
  /**
   * Guarded: back-logging a dose, and adding an off-plan one-off. Both CREATE.
   * Removing either is not guarded.
   */
  const { guard } = useWriteAccess();
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
  /** The day's off-plan list (the "⋯" beside Also logged). */
  const [oneOffDayOpen, setOneOffDayOpen] = useState(false);
  /** The form that records one. Opened from that menu. */
  const [oneOffOpen, setOneOffOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  /** A one-off sheet was opened from the day sheet: closing it goes back
   *  there, so no sheet ever opens over another (consistency fix #1). */
  const [backToDay, setBackToDay] = useState(false);

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
  // One-offs: their own store, because they are their own thing. Keeping them
  // out of `logs` is what keeps them out of consistency, the runway and stock
  // without a single filter being written.
  const oneOffs = useSyncExternalStore(
    subscribeOneOffs,
    () => getOneOffsSnapshot(userId),
    () => EMPTY_ONE_OFFS,
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
    // ⚠️ `hasOneOff` is deliberately NOT part of `logged`. The ring answers
    // "did I do what I planned", and a one-off is not part of any plan — folding
    // it in would let an off-plan supplement read as protocol adherence, and
    // would fill the ring on a day where nothing was ever scheduled.
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
    return { status, kind, oneOff: deviceReady && hasOneOffOn(oneOffs, key) };
  }

  // The selected day's detail.
  const selJournal = journalByDate[selectedKey];
  const running = useMemo(
    () => buildRunning(deviceReady ? logs[selectedKey] : undefined, stackById),
    [deviceReady, logs, selectedKey, stackById],
  );

  // The selected day's doses as Flow B rows (consistency fix #0): the same rows,
  // words and Track bar as Home, writing to THIS day.
  const dayDoses = useMemo(
    () => (deviceReady ? dayDoseRows(stack, logs, selectedKey) : []),
    [deviceReady, stack, logs, selectedKey],
  );
  // A log whose compound is gone from the protocol entirely still shows, read
  // only: the dose happened.
  const orphans = useMemo(
    () => running.filter((r) => !stackById.has(parseSlotKey(r.id).compoundId)),
    [running, stackById],
  );
  const drawSources = useDrawSources(
    dayDoses.map((d) => d.id),
    selectedKey,
    sheetOpen,
  );
  const rows = useLogRows({
    day: selectedKey,
    todayKey,
    logs,
    guard,
    commit: (id, log, day, slot) => guard(() => commitDoseOn(userId, id, log, day, day, slot)),
    remove: (id, day, slot) => unlogDose(userId, day, id, slot),
    // Read by the row itself when it opens. No Add stock from a row here: it
    // would open a sheet over the day sheet.
    catalogue: [],
    bodySex,
  });

  /** Leave the day sheet for a one-off sheet, and come back to it after. */
  function toOneOffs(open: () => void) {
    rows.close();
    setSheetOpen(false);
    setBackToDay(true);
    open();
  }
  function backFromOneOffs() {
    if (!backToDay) return;
    setBackToDay(false);
    setSheetOpen(true);
  }

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
    <div
      data-screen="calendar"
      className="relative mx-auto w-full max-w-md px-5 pt-4 pb-5"
    >
      {/* The back link and the month fade without moving; only the cards
          below rise. `relative z-10`: the month picker's panel and scrim live
          in here, and the cards below are their own layers while they rise
          (a transform), so without it the panel opened UNDER the grid. */}
      <RouteTitle id="calendar" className="relative z-10">
        {/* The one back link (consistency fix #23). A phone reaches Calendar
            from the Dashboard; on desktop Calendar IS a sidebar item, so a back
            link to somewhere you did not come from is just wrong. `desktop:` is
            the custom variant declared in desktop.css. */}
        <div className="desktop:hidden">
          <BackLink href="/dashboard" label="Dashboard" />
        </div>

        <header className="mt-3 px-1">
          <MonthYearPicker year={view.year} month0={view.month0} onChange={setView} />
        </header>
      </RouteTitle>

      <RouteHandoff id="calendar">
        <CalendarBlocks />
      </RouteHandoff>
      <div className="animate-home-up mt-5" style={{ animationDelay: "0ms" }}>
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
        <section
          className="flow-card animate-home-up mt-5 inst-card px-5 py-4"
          style={{ animationDelay: "55ms" }}
        >
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

      {/* The day's off-plan entries, behind the "⋯" beside Also logged. */}
      <OneOffDaySheet
        open={oneOffDayOpen}
        onOpenChange={(o) => {
          setOneOffDayOpen(o);
          if (!o) backFromOneOffs();
        }}
        dateLabel={dayLong(selectedKey)}
        logs={deviceReady ? oneOffsOn(oneOffs, selectedKey) : []}
        onAdd={() =>
          guard(() => {
            setOneOffDayOpen(false);
            setOneOffOpen(true);
          })
        }
        onRemove={(id) => removeOneOff(userId, selectedKey, id)}
      />

      {/* Off-plan logging, against the day being VIEWED. It writes to its own
          store and its own table, so nothing here can reach consistency, the
          runway or stock. */}
      <OneOffSheet
        open={oneOffOpen}
        onOpenChange={(o) => {
          setOneOffOpen(o);
          if (!o) backFromOneOffs();
        }}
        todayKey={todayKey}
        dateKey={selectedKey}
        recents={recentOneOffLabels(oneOffs, todayKey)}
        onSave={(log) =>
          guard(() => {
            if (addOneOff(userId, log)) showToast("Logged");
          })
        }
      />

      <DayDetailSheet
        open={sheetOpen}
        onOpenChange={(o) => {
          // An open row does not outlive its sheet.
          if (!o) rows.close();
          setSheetOpen(o);
        }}
        dateKey={selectedKey}
        log={{ flow: rows.flow, bar: rows.bar, doses: dayDoses, drawSources }}
        orphans={orphans}
        weightKg={weightByDate[selectedKey] ?? null}
        unit={unit}
        markers={selJournal?.markers ?? []}
        journalBody={selJournal?.body ?? null}
        hasJournalEntry={Boolean(selJournal)}
        photos={photosByDate[selectedKey] ?? []}
        cycles={cyclesOnSelected}
        // Off-plan entries for the day being viewed, plus the way to add one.
        // The CALENDAR is the entry point (Adrian, 2026-08-07): you record a
        // one-off against the day you are looking at, which is usually not today.
        oneOffs={deviceReady ? oneOffsOn(oneOffs, selectedKey) : []}
        onAddOneOff={() => guard(() => toOneOffs(() => setOneOffOpen(true)))}
        onManageOneOffs={() => toOneOffs(() => setOneOffDayOpen(true))}
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

      <LegendSheet open={legendOpen} onOpenChange={setLegendOpen} />
    </div>
  );
}
