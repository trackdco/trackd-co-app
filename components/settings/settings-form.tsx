"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateSettings, type SettingsState } from "@/app/(app)/settings/actions";

const initialState: SettingsState = {};

const SELECT_CLASS =
  "h-12 w-full min-w-0 rounded-xl border border-input bg-transparent px-3 text-base text-foreground shadow-xs outline-none transition-[color,box-shadow] [color-scheme:dark] dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const GOALS: { value: string; label: string }[] = [
  { value: "bulk", label: "Bulk (mass / strength)" },
  { value: "cut", label: "Cut (fat loss)" },
  { value: "recomp", label: "Recomp" },
  { value: "contest_prep", label: "Contest prep" },
  { value: "first_cycle", label: "First cycle" },
  { value: "blast_cruise", label: "Blast & cruise" },
  { value: "trt", label: "TRT / hormone optimisation" },
  { value: "other", label: "Other" },
];

// Storage is always metric (height_cm). Imperial is a display/entry preference:
// height shows in inches, converted to cm on save. (Weight is tracked in the
// Weight view now — no weight field here.)
type Units = "metric" | "imperial";
const CM_PER_IN = 2.54;
const round1 = (n: number) => Math.round(n * 10) / 10;

function heightToDisplay(cm: number | null, units: Units): string {
  if (cm == null) return "";
  return String(units === "imperial" ? round1(cm / CM_PER_IN) : round1(cm));
}

// Input-side guard (B4): digits + an optional single decimal, integer part ≤3
// digits (height is integer by default; one decimal is tolerated).
function sanitizeHeight(raw: string): string {
  let v = raw.replace(/[^0-9.]/g, "");
  const dot = v.indexOf(".");
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "");
  const [int = "", dec] = v.split(".");
  const clampedInt = int.slice(0, 3);
  return v.includes(".") ? `${clampedInt}.${(dec ?? "").slice(0, 1)}` : clampedInt;
}

// Keep what the user typed when they flip units: re-express the height.
function reexpressHeight(value: string, from: Units, to: Units): string {
  if (from === to || value.trim() === "") return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  const cm = from === "imperial" ? n * CM_PER_IN : n;
  return String(round1(to === "imperial" ? cm / CM_PER_IN : cm));
}

export type SettingsInitial = {
  sex: string | null;
  goal: string | null;
  units_preference: string;
  height_cm: number | null;
};

/**
 * Editable personalisation. Saves to the user's own profile via updateSettings
 * (server-validated, RLS-scoped). Height displays + accepts the user's chosen
 * units (cm or in); the server converts to metric for storage. Bodyweight is
 * tracked in the Weight view, not here.
 */
export function SettingsForm({ initial }: { initial: SettingsInitial }) {
  const [state, formAction, isPending] = useActionState(
    updateSettings,
    initialState,
  );

  const startUnits: Units =
    initial.units_preference === "imperial" ? "imperial" : "metric";
  const [units, setUnits] = useState<Units>(startUnits);
  const [height, setHeight] = useState(() =>
    heightToDisplay(initial.height_cm, startUnits),
  );

  const imperial = units === "imperial";

  function handleUnitsChange(next: Units) {
    setHeight((h) => reexpressHeight(h, units, next));
    setUnits(next);
  }

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <Field label="Sex">
        <select
          name="sex"
          defaultValue={initial.sex ?? ""}
          className={SELECT_CLASS}
        >
          <option value="">Prefer not to say</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </Field>

      <Field label="Units">
        <select
          name="units_preference"
          value={units}
          onChange={(e) => handleUnitsChange(e.target.value as Units)}
          className={SELECT_CLASS}
        >
          <option value="metric">Metric (kg, cm)</option>
          <option value="imperial">Imperial (lb, in)</option>
        </select>
      </Field>

      {/* Height — integer by default; a single decimal is tolerated (B4). */}
      <Field label={imperial ? "Height (in)" : "Height (cm)"}>
        <Input
          name="height"
          type="number"
          inputMode="decimal"
          min={imperial ? 43 : 110}
          max={imperial ? 98 : 250}
          step="0.1"
          placeholder={imperial ? "e.g. 71" : "e.g. 180"}
          value={height}
          onChange={(e) => setHeight(sanitizeHeight(e.target.value))}
          className="h-12 rounded-xl"
        />
      </Field>

      <Field label="Goal">
        <select
          name="goal"
          defaultValue={initial.goal ?? ""}
          className={SELECT_CLASS}
        >
          <option value="">Not set</option>
          {GOALS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      </Field>

      {state.error ? (
        <p role="alert" className="text-sm text-[var(--state-error)]">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={isPending}
        aria-busy={isPending}
        className="h-12 w-full touch-manipulation select-none rounded-xl text-[0.95rem] transition-transform duration-100 active:scale-[0.98] motion-reduce:active:scale-100"
      >
        {isPending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : null}
        {isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
