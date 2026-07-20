"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CircleNotch } from "@/components/icons";

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
      <SexField initial={initial.sex} />

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
          min={imperial ? 47 : 120}
          max={imperial ? 91 : 230}
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
          <CircleNotch className="size-5 animate-spin" aria-hidden="true" />
        ) : null}
        {isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

/**
 * Sex — the one setting that changes what the app DRAWS: the injection-site body
 * map switches between the male and female figure, so a mis-tap on a select is
 * worth a confirm step. The pending choice is held until confirmed; Cancel puts
 * the select back. The value still saves with the rest of the form (Save changes)
 * — this only guards the change, it doesn't commit it.
 *
 * There's no "prefer not to say": the welcome quiz makes it a required choice.
 * Profiles that predate the quiz have no sex, so those (and only those) get a
 * "Select…" placeholder and must pick one — otherwise a select defaulting to the
 * first option would quietly save "male" for someone who never chose it.
 */
function SexField({ initial }: { initial: string | null }) {
  const start = initial === "male" || initial === "female" ? initial : "";
  const [sex, setSex] = useState(start);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (pending === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPending(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  const nextLabel = pending === "female" ? "female" : "male";

  return (
    <>
      <Field label="Sex">
        <select
          name="sex"
          required
          // Controlled by `sex`, which only moves once a change is confirmed —
          // so Cancel snaps the select straight back to the saved value.
          value={sex}
          onChange={(e) => setPending(e.target.value)}
          className={SELECT_CLASS}
        >
          {start === "" ? (
            <option value="" disabled>
              Select…
            </option>
          ) : null}
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </Field>

      {/* Portaled to <body> for the same reason as the sign-out confirm: a fixed
          overlay inside a transformed ancestor gets trapped in its stacking
          context and lands behind the bottom nav. */}
      {pending !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] grid place-items-center bg-overlay-backdrop p-6 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
            onClick={() => setPending(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="sex-confirm-title"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs rounded-3xl border border-border-default bg-bg-surface p-5 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
            >
              <h2
                id="sex-confirm-title"
                className="text-base font-semibold text-foreground"
              >
                Change to {nextLabel}?
              </h2>
              <p className="mt-1.5 text-sm text-text-muted">
                Your injection-site map will show the {nextLabel} body. Your
                logged sites and history stay exactly as they are.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  className="flex-1 rounded-xl border border-border-strong py-2.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSex(pending);
                    setPending(null);
                  }}
                  className="flex-1 rounded-xl bg-accent-amber py-2.5 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
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
