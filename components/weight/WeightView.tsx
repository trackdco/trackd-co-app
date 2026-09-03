"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Trash } from "@/components/icons";

import { cn } from "@/lib/utils";
import { CARD_EYEBROW, DATA_MONO, PAGE_TITLE } from "@/lib/ui-presets";
import { Input } from "@/components/ui/input";
import {
  dateKeyToDate,
  type DateKey,
} from "@/lib/home/mockHomeData";
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

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function shortDate(key: DateKey): string {
  const d = dateKeyToDate(key);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function longDate(key: DateKey): string {
  const d = dateKeyToDate(key);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
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
  const [savedFlash, setSavedFlash] = useState(false);
  const [busyDelete, setBusyDelete] = useState<string | null>(null);

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
      setError(
        unit === "lbs"
          ? "Weight must be between 66 and 661 lbs."
          : "Weight must be between 30 and 300 kg.",
      );
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
          setSavedFlash(true);
          window.setTimeout(() => setSavedFlash(false), 1400);
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

  function handleDelete(key: DateKey) {
    setBusyDelete(key);
    setError(null);
    startTransition(async () => {
      // Drop the row from the list + graph immediately.
      applyOptimistic({ type: "remove", key });
      try {
        const res = await deleteWeight(key);
        if (res.ok) {
          router.refresh();
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
    <div className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5">
      <header className="animate-home-up px-1" style={{ animationDelay: "0ms" }}>
        <h1 className={PAGE_TITLE}>Weight</h1>
        <p className="mt-0.5 text-sm text-text-muted">
          Log your bodyweight and watch the trend.
        </p>
      </header>

      {/* ── Track your weight ─────────────────────────────────────── */}
      <section
        className="animate-home-up relative rounded-2xl bg-bg-surface p-5"
        style={{ animationDelay: "70ms" }}
      >
        <h2 className={CARD_EYEBROW}>Track your weight</h2>
        <div className="mt-4 flex gap-3">
          <label className="block flex-1 min-w-0">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              Weight
            </span>
            <div className="relative">
              <Input
                inputMode="decimal"
                value={value}
                onChange={(e) => {
                  setError(null);
                  setValue(sanitizeWeightInput(e.target.value));
                }}
                placeholder={unit === "lbs" ? "e.g. 198" : "e.g. 90"}
                aria-label={`Weight in ${unit}`}
                aria-invalid={error ? true : undefined}
                className="h-12 rounded-xl border-border-default bg-bg-input pr-12 font-mono text-base dark:bg-bg-input"
              />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-text-muted">
                {unit}
              </span>
            </div>
          </label>

          <label className="block w-[8.5rem] max-w-[44%] shrink-0">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              Date
            </span>
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

        <button
          type="button"
          onClick={() => guard(handleSave)}
          disabled={saving}
          className="mt-4 w-full rounded-xl bg-accent-primary py-3 text-sm font-medium text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
        >
          {saving
            ? "Saving…"
            : dateKey === todayKey
              ? "Done"
              : `Log for ${shortDate(dateKey)}`}
        </button>

        {/* Brief saved tick — UI feedback only (sanctioned green). */}
        {savedFlash && (
          <div
            aria-hidden
            className="animate-shortcut-fade pointer-events-none absolute right-5 top-5 flex items-center gap-1.5 rounded-full bg-accent-green/15 px-2.5 py-1 text-xs font-medium text-accent-green"
          >
            <Check className="h-3.5 w-3.5" /> Saved
          </div>
        )}
      </section>

      {/* ── Trend / Scale graph ───────────────────────────────────── */}
      {/* Shared with the block weight sheet. `spanDays` null: this screen is the
          whole history, so every range stays on offer. */}
      <WeightGraph
        entries={viewEntries}
        unit={unit}
        anchorKey={todayKey}
        spanDays={null}
        className="animate-home-up"
        style={{ animationDelay: "140ms" }}
      />

      {/* ── Entry log ─────────────────────────────────────────────── */}
      <section
        className="animate-home-up rounded-2xl bg-bg-surface p-5"
        style={{ animationDelay: "210ms" }}
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
                <ul className="overflow-hidden rounded-2xl bg-bg-surface-raised">
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
                        aria-label={`Edit weight for ${longDate(entry.key)}`}
                      >
                        <span className="truncate text-sm text-text-muted">
                          {longDate(entry.key)}
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
                        onClick={() => handleDelete(entry.key)}
                        disabled={busyDelete === entry.key}
                        aria-label={`Delete weight for ${longDate(entry.key)}`}
                        className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:text-state-error disabled:opacity-50"
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
    </div>
  );
}

