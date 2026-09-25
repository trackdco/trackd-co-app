"use client";

import { useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash } from "@/components/icons";

import { cn } from "@/lib/utils";
import { CARD_EYEBROW, DATA_MONO, FIELD_LABEL, PAGE_TITLE, PRESS, PRIMARY_BUTTON } from "@/lib/ui-presets";
import { BackLink } from "@/components/feel/BackLink";
import { ConfirmDialog } from "@/components/feel/ConfirmDialog";
import { dayShort } from "@/lib/format/date";
import { showToast } from "@/lib/toast";
import { NumberPad, PadInput } from "@/components/feel/NumberPad";
import { RouteHandoff, RouteTitle, WeightBlocks } from "@/components/feel/RouteSkeletons";
import { formatDateKeyNumeric } from "@/lib/calendar/calendar";
import { Input } from "@/components/ui/input";
import type { DateKey } from "@/lib/home/mockHomeData";
import {
  formatWeight,
  sanitizeWeightInput,
  unitForPreference,
  unitToKg,
} from "@/lib/weight";
import { WeightGraph } from "@/components/weight/WeightGraph";
import { deleteWeight, logWeight } from "@/app/(app)/weight/actions";
import { useWriteAccess } from "@/components/billing/ReadOnlyGate";

interface Entry {
  key: DateKey;
  kg: number;
}

/** Optimistic mutation applied to the entry list before the server confirms.
 *  `upsert` covers both a new log and an edit (one row per day, last write wins);
 *  `remove` is a delete. */
type OptimisticAction =
  | { type: "upsert"; key: DateKey; kg: number }
  | { type: "remove"; key: DateKey };

/** Apply an optimistic mutation, keeping the list sorted oldest → newest so the
 *  moving-average / chart stay correct. (`DateKey` is "YYYY-MM-DD", which sorts
 *  chronologically as a string.) */
function applyEntryMutation(state: Entry[], action: OptimisticAction): Entry[] {
  if (action.type === "remove") {
    return state.filter((e) => e.key !== action.key);
  }
  const next = state.filter((e) => e.key !== action.key);
  next.push({ key: action.key, kg: action.kg });
  next.sort((a, b) => a.key.localeCompare(b.key));
  return next;
}

/** A month bucket in the entry log — newest month first, entries newest-first. */
interface LogMonth {
  key: string; // "YYYY-MM"
  label: string; // "June 2026"
  rows: Entry[];
}

interface WeightViewProps {
  /** The user's weight_logs, oldest → newest. */
  entries: Entry[];
  /** "metric" | "imperial" from the profile. */
  unitPreference: string;
  todayKey: DateKey;
}

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "YYYY-MM" → "June 2026" — the entry-log month headers. */
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return `${MONTHS_FULL[m - 1]} ${y}`;
}

/**
 * The Weight view (Context/Feature Specs/08 → C, + 07). Three stacked cards that
 * fade up: log/back-date a reading; the Trend/Scale graph, which lives in
 * `WeightGraph` because a block's weight sheet draws the same one; and the full
 * entry log (edit by re-logging a day, or delete). Bodyweight only, presented
 * neutrally — no good/bad colouring, no paywall copy.
 */
export function WeightView({ entries, unitPreference, todayKey }: WeightViewProps) {
  /** Guarded: logging a weigh-in CREATES data. Deleting one is not guarded. */
  const { guard } = useWriteAccess();
  const router = useRouter();
  const unit = unitForPreference(unitPreference);

  // Optimistic view of the log: a save/edit/delete shows INSTANTLY, then either
  // commits (the server confirms and `router.refresh()` re-fetches the canonical
  // data, holding the optimistic value until it lands) or rolls back automatically
  // when the transition ends without a refresh (the failure path), surfacing an
  // error. Everything below derives from `viewEntries`, not the raw prop.
  const [viewEntries, applyOptimistic] = useOptimistic(entries, applyEntryMutation);
  const [, startTransition] = useTransition();

  // Track-weight form. Editing a past entry loads it here.
  const [dateKey, setDateKey] = useState<DateKey>(todayKey);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyDelete, setBusyDelete] = useState<string | null>(null);
  /** The entry a delete is asking about (consistency fix #5). */
  const [deleting, setDeleting] = useState<Entry | null>(null);
  // The weight is typed on the Trakabl pad (feel pass §3). Done on the pad is the
  // same save as the Done button below it.
  const [padOpen, setPadOpen] = useState(false);
  const weightRef = useRef<HTMLButtonElement>(null);

  // Entry log grouped by month — newest month first, newest entry first within.
  // Months simply stack and scroll (no dropdown), mirroring the journal feed.
  const logMonths = useMemo<LogMonth[]>(() => {
    const byMonth = new Map<string, Entry[]>();
    for (let i = viewEntries.length - 1; i >= 0; i--) {
      const e = viewEntries[i];
      const mk = e.key.slice(0, 7);
      const arr = byMonth.get(mk);
      if (arr) arr.push(e);
      else byMonth.set(mk, [e]);
    }
    return [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, rows]) => ({ key, label: monthLabel(key), rows }));
  }, [viewEntries]);

  function handleSave() {
    const n = parseFloat(value);
    if (!Number.isFinite(n)) {
      setError("Enter your weight.");
      return;
    }
    const kg = unitToKg(n, unit);
    if (kg < 30 || kg > 300) {
      // The pad's own sentence, so the two never disagree (fix #29).
      setError(`Enter a weight between ${formatWeight(30, unit)} and ${formatWeight(300, unit)} ${unit}.`);
      return;
    }
    const savedKey = dateKey;
    setSaving(true);
    setError(null);
    startTransition(async () => {
      // Show the new reading on the graph + log immediately.
      applyOptimistic({ type: "upsert", key: savedKey, kg });
      try {
        const res = await logWeight(kg, savedKey);
        if (res.ok) {
          // Confirmed by the toast, as every save is (consistency fix #27).
          showToast(`Weight logged: ${formatWeight(kg, unit)} ${unit}`);
          setValue("");
          setDateKey(todayKey);
          router.refresh(); // commit: holds the optimistic value until fresh data lands
        } else {
          // The transition ends here with no refresh → the optimistic entry rolls
          // back automatically. Keep the typed value so the user can retry.
          setError(res.error ?? "Couldn't save. Try again.");
        }
      } catch {
        // The action itself rejected (e.g. a network error before it could return
        // its { ok: false } contract). Optimistic entry rolls back; show an error.
        setError("Couldn't save. Try again.");
      } finally {
        setSaving(false); // always clear busy, even on a rejected promise
      }
    });
  }

  function handleDelete(entry: Entry) {
    const key = entry.key;
    setBusyDelete(key);
    setError(null);
    startTransition(async () => {
      // Drop the row from the list + graph immediately.
      applyOptimistic({ type: "remove", key });
      try {
        const res = await deleteWeight(key);
        if (res.ok) {
          router.refresh();
          // Undo logs the same reading back on the same day.
          showToast("Weight deleted", {
            undo: () =>
              void logWeight(entry.kg, key)
                .then((r) => (r.ok ? router.refresh() : showToast("Couldn’t undo. Try again.")))
                .catch(() => showToast("Couldn’t undo. Try again.")),
          });
        } else {
          // Transition ends with no refresh → the row reappears (rollback) + error.
          setError(res.error ?? "Couldn't delete that entry. Try again.");
        }
      } catch {
        setError("Couldn't delete that entry. Try again.");
      } finally {
        setBusyDelete(null); // always clear busy, even on a rejected promise
      }
    });
  }

  function editEntry(entry: Entry) {
    setDateKey(entry.key);
    setValue(formatWeight(entry.kg, unit));
    setError(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <div
      data-screen="weight"
      data-desktop-layout="wide"
      className="relative mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5"
    >
      <RouteTitle id="weight">
        {/* The one way back (consistency fix #23). */}
        <BackLink href="/progress" label="Progress" />
        <header className="mt-1 px-1">
          <h1 className={PAGE_TITLE}>Weight</h1>
        </header>
      </RouteTitle>
      <RouteHandoff id="weight">
        <WeightBlocks />
      </RouteHandoff>

      {/* ── Log weight ────────────────────────────────────────────── */}
      <section
        className="flow-card animate-home-up relative inst-card p-5"
        style={{ animationDelay: "0ms" }}
      >
        <h2 className={CARD_EYEBROW}>Log weight</h2>
        <div className="mt-4 flex gap-3">
          <label className="block flex-1 min-w-0">
            <span className={FIELD_LABEL}>Weight</span>
            <PadInput
              value={value}
              label={`Weight in ${unit}`}
              unit={unit}
              active={padOpen}
              onOpen={() => setPadOpen(true)}
              inputRef={weightRef}
              invalid={Boolean(error)}
              className="h-12 w-full"
              suffix={<span className="shrink-0 font-sans text-sm text-text-muted">{unit}</span>}
            />
            <NumberPad
              active={padOpen ? 0 : null}
              fields={[
                {
                  id: "weight",
                  // Back-dated: the pad covers the date field, so it names the day.
                  label: dateKey === todayKey ? "Weight" : `Weight for ${formatDateKeyNumeric(dateKey)}`,
                  unit,
                  value,
                  onChange: (v) => {
                    setError(null);
                    setValue(v);
                  },
                  sanitize: sanitizeWeightInput,
                },
              ]}
              onActiveChange={() => {}}
              onClose={() => setPadOpen(false)}
              onDone={() => {
                setPadOpen(false);
                guard(handleSave);
              }}
              returnFocusRef={weightRef}
              label="Weight"
            />
          </label>

          <label className="block w-[8.5rem] max-w-[44%] shrink-0">
            <span className={FIELD_LABEL}>Date</span>
            <Input
              type="date"
              value={dateKey}
              max={todayKey}
              onChange={(e) => {
                // An EMPTY change event is not "today". iOS fires one while the
                // picker wheels are still moving, and coercing it to today snapped
                // the field back mid-pick — so a back-dated entry saved silently
                // under today's date. Keep the last good value; the field is
                // required, so there is nothing it should clear to.
                if (e.target.value) setDateKey(e.target.value)
              }}
              aria-label="Date logged"
              className="h-12 rounded-xl border-border-default bg-bg-input px-3 font-mono text-sm [color-scheme:dark] dark:bg-bg-input"
            />
          </label>
        </div>

        {error && <p className="mt-2 px-1 text-sm text-state-error">{error}</p>}

        {/* "Log" is the verb (consistency fixes #12, #27). */}
        <button
          type="button"
          onClick={() => guard(handleSave)}
          disabled={saving}
          className={cn(PRIMARY_BUTTON, "mt-4 w-full")}
        >
          {saving
            ? "Saving…"
            : dateKey === todayKey
              ? "Log"
              : `Log for ${dayShort(dateKey)}`}
        </button>
      </section>

      {/* ── Trend / Scale graph ───────────────────────────────────── */}
      {/* Shared with the block weight sheet. `spanDays` null: this screen is the
          whole history, so every range stays on offer. */}
      <WeightGraph
        drawKey="weight:graph"
        entries={viewEntries}
        unit={unit}
        anchorKey={todayKey}
        spanDays={null}
        className="animate-home-up"
        style={{ animationDelay: "55ms" }}
      />

      {/* ── Entry log ─────────────────────────────────────────────── */}
      <section
        className="flow-card animate-home-up inst-card p-5"
        style={{ animationDelay: "110ms" }}
      >
        <h2 className={CARD_EYEBROW}>Entry log</h2>
        {logMonths.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">
            Nothing logged yet. Add today&apos;s weight above.
          </p>
        ) : (
          <div className="mt-3 space-y-5">
            {logMonths.map((group) => (
              <div key={group.key}>
                <h3 className={cn("px-1 pb-2", CARD_EYEBROW)}>
                  {group.label}
                </h3>
                <ul className="overflow-hidden inst-rows">
                  {group.rows.map((entry, i) => (
                    <li
                      key={entry.key}
                      className={cn(
                        "flex items-center",
                        i > 0 && "hairline-t",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => editEntry(entry)}
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-input/40"
                        aria-label={`Edit weight for ${dayShort(entry.key)}`}
                      >
                        <span className="truncate text-sm text-text-muted">
                          {dayShort(entry.key)}
                          {entry.key === todayKey && (
                            <span className="ml-2 text-xs text-text-muted">Today</span>
                          )}
                        </span>
                        <span className={cn(DATA_MONO, "shrink-0")}>
                          {formatWeight(entry.kg, unit)} {unit}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(entry)}
                        disabled={busyDelete === entry.key}
                        aria-label={`Delete weight for ${dayShort(entry.key)}`}
                        className={cn(PRESS.icon, "mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:text-foreground disabled:opacity-50")}
                      >
                        <Trash className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* A weight asks before it goes, like every delete (consistency fix #5). */}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this weight?"
        line={deleting ? `${formatWeight(deleting.kg, unit)} ${unit} on ${dayShort(deleting.key)}.` : undefined}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleting) handleDelete(deleting);
        }}
      />
    </div>
  );
}

