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

// Storage is always metric (height_cm / weight_kg). Imperial is a display/entry
// preference only: height shows in inches, weight in lbs — converted on save.
type Units = "metric" | "imperial";
const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;
const round1 = (n: number) => Math.round(n * 10) / 10;

function heightToDisplay(cm: number | null, units: Units): string {
  if (cm == null) return "";
  return String(units === "imperial" ? round1(cm / CM_PER_IN) : round1(cm));
}
function weightToDisplay(kg: number | null, units: Units): string {
  if (kg == null) return "";
  return String(units === "imperial" ? round1(kg / KG_PER_LB) : round1(kg));
}
// Keep what the user already typed when they flip units: re-express the number.
function reexpress(
  value: string,
  kind: "height" | "weight",
  from: Units,
  to: Units,
): string {
  if (from === to || value.trim() === "") return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  const factor = kind === "height" ? CM_PER_IN : KG_PER_LB;
  const metric = from === "imperial" ? n * factor : n;
  const out = to === "imperial" ? metric / factor : metric;
  return String(round1(out));
}

export type SettingsInitial = {
  sex: string | null;
  goal: string | null;
  units_preference: string;
  height_cm: number | null;
  weight_kg: number | null;
};

/**
 * Editable personalisation. Saves to the user's own profile via updateSettings
 * (server-validated, RLS-scoped). Height/weight display + accept the user's
 * chosen units (cm/kg or in/lbs); the server converts to metric for storage.
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
  const [weight, setWeight] = useState(() =>
    weightToDisplay(initial.weight_kg, startUnits),
  );

  const imperial = units === "imperial";

  function handleUnitsChange(next: Units) {
    setHeight((h) => reexpress(h, "height", units, next));
    setWeight((w) => reexpress(w, "weight", units, next));
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

      <Field label={imperial ? "Height (in)" : "Height (cm)"}>
        <Input
          name="height"
          type="number"
          inputMode="decimal"
          min={imperial ? 40 : 100}
          max={imperial ? 98 : 250}
          step="0.1"
          placeholder={imperial ? "e.g. 71" : "e.g. 180"}
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          className="h-12 rounded-xl"
        />
      </Field>

      <Field label={imperial ? "Weight (lbs)" : "Weight (kg)"}>
        <Input
          name="weight"
          type="number"
          inputMode="decimal"
          min={imperial ? 67 : 30}
          max={imperial ? 661 : 300}
          step="0.1"
          placeholder={imperial ? "e.g. 198" : "e.g. 90"}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
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
