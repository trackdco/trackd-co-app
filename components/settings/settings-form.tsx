"use client";

import { useActionState } from "react";
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

export type SettingsInitial = {
  sex: string | null;
  goal: string | null;
  units_preference: string;
  height_cm: number | null;
  weight_kg: number | null;
};

/**
 * Editable personalisation. Saves to the user's own profile via updateSettings
 * (server-validated, RLS-scoped). Optional fields default to a blank "—" option
 * that clears them.
 */
export function SettingsForm({ initial }: { initial: SettingsInitial }) {
  const [state, formAction, isPending] = useActionState(
    updateSettings,
    initialState,
  );

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

      <Field label="Height (cm)">
        <Input
          name="height_cm"
          type="number"
          inputMode="decimal"
          min={100}
          max={250}
          step="0.1"
          placeholder="e.g. 180"
          defaultValue={initial.height_cm ?? ""}
          className="h-12 rounded-xl"
        />
      </Field>

      <Field label="Weight (kg)">
        <Input
          name="weight_kg"
          type="number"
          inputMode="decimal"
          min={30}
          max={300}
          step="0.1"
          placeholder="e.g. 90"
          defaultValue={initial.weight_kg ?? ""}
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

      <Field label="Units">
        <select
          name="units_preference"
          defaultValue={initial.units_preference || "metric"}
          className={SELECT_CLASS}
        >
          <option value="metric">Metric (kg, cm)</option>
          <option value="imperial">Imperial (lb, in)</option>
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
