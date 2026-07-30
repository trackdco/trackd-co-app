"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CircleNotch } from "@/components/icons";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { CARD_EYEBROW } from "@/lib/ui-presets";
import { updatePhysical, type PhysicalState } from "@/app/(app)/profile/actions";

const initialState: PhysicalState = {};

const FIELD =
  "h-10 w-full min-w-0 rounded-lg border border-border-default bg-bg-input px-2.5 text-sm text-foreground outline-none transition-[color,box-shadow] [color-scheme:dark] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const GOALS: { value: string; label: string }[] = [
  { value: "bulk", label: "Bulk" },
  { value: "cut", label: "Cut" },
  { value: "recomp", label: "Recomp" },
  { value: "contest_prep", label: "Contest prep" },
  { value: "first_cycle", label: "First cycle" },
  { value: "blast_cruise", label: "Blast & cruise" },
  { value: "trt", label: "TRT" },
  { value: "other", label: "Other" },
];
const GOAL_LABELS = new Map(GOALS.map((g) => [g.value, g.label]));

type Units = "metric" | "imperial";
const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;
const round1 = (n: number) => Math.round(n * 10) / 10;

function heightToDisplay(cm: number | null, units: Units): string {
  if (cm == null) return "";
  return String(units === "imperial" ? round1(cm / CM_PER_IN) : round1(cm));
}

/** Digits plus one optional decimal, integer part capped at three digits. */
function sanitizeHeight(raw: string): string {
  let v = raw.replace(/[^0-9.]/g, "");
  const dot = v.indexOf(".");
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "");
  const [int = "", dec] = v.split(".");
  const clampedInt = int.slice(0, 3);
  return v.includes(".") ? `${clampedInt}.${(dec ?? "").slice(0, 1)}` : clampedInt;
}

/** Keep what the user typed when they flip units: re-express the height. */
function reexpressHeight(value: string, from: Units, to: Units): string {
  if (from === to || value.trim() === "") return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  const cm = from === "imperial" ? n * CM_PER_IN : n;
  return String(round1(to === "imperial" ? cm / CM_PER_IN : cm));
}

export interface PhysicalInitial {
  sex: string | null;
  goal: string | null;
  unitsPreference: string;
  heightCm: number | null;
  /** Derived from date of birth. Read-only here. */
  age: number | null;
  /** The latest logged reading in kg. Read-only here. */
  weightKg: number | null;
}

/**
 * Physical details, edited IN PLACE (spec 09 · part two).
 *
 * The card has two states and one layout. Read is dimmed and inert; Edit fades
 * the same rows into inputs where they already sit. That is the whole point of
 * the spec's wording — no layout swap, no second screen — so the rows keep their
 * grid and only their right-hand cell changes.
 *
 * TWO ROWS ARE READ-ONLY IN BOTH STATES, and deliberately so:
 *  - **Age** is derived from the date of birth captured by the 18+ gate. It is
 *    not a field, and offering it as one would imply you could disagree with
 *    your own birthday.
 *  - **Weight** is the latest reading from `weight_logs`, which the Weight view
 *    owns (`architecture.md`: `profiles.weight_kg` is a legacy onboarding
 *    snapshot and is no longer user-editable). A second place to type a
 *    bodyweight would be a second source of truth for the one number the app is
 *    most careful about.
 *
 * Both still render as rows, because the spec lists them and because a gap where
 * a fact should be is worse than a fact you cannot edit here.
 */
export function PhysicalCard({ initial }: { initial: PhysicalInitial }) {
  const [state, formAction, isPending] = useActionState(updatePhysical, initialState);
  const [editing, setEditing] = useState(false);

  const startUnits: Units =
    initial.unitsPreference === "imperial" ? "imperial" : "metric";
  const [units, setUnits] = useState<Units>(startUnits);
  const [height, setHeight] = useState(() =>
    heightToDisplay(initial.heightCm, startUnits),
  );
  const [sex, setSex] = useState(
    initial.sex === "male" || initial.sex === "female" ? initial.sex : "",
  );
  const [goal, setGoal] = useState(initial.goal ?? "");
  const [pendingSex, setPendingSex] = useState<string | null>(null);

  // A successful save returns the card to its read state. Adjust-during-render
  // rather than an effect: an effect would paint one frame of the edit state
  // after the save had already landed.
  const [sawSuccess, setSawSuccess] = useState(false);
  if (state.success && !sawSuccess) {
    setSawSuccess(true);
    setEditing(false);
  }
  if (!state.success && sawSuccess) setSawSuccess(false);

  useEffect(() => {
    if (pendingSex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingSex(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingSex]);

  const imperial = units === "imperial";

  function startEditing() {
    // Re-seed from the saved values, so an abandoned edit never carries into the
    // next one.
    setUnits(startUnits);
    setHeight(heightToDisplay(initial.heightCm, startUnits));
    setSex(initial.sex === "male" || initial.sex === "female" ? initial.sex : "");
    setGoal(initial.goal ?? "");
    setEditing(true);
  }

  function handleUnitsChange(next: Units) {
    setHeight((h) => reexpressHeight(h, units, next));
    setUnits(next);
  }

  const heightRead = formatMeasure(initial.heightCm, imperial, "cm", "in", CM_PER_IN);
  const weightRead = formatMeasure(initial.weightKg, imperial, "kg", "lbs", KG_PER_LB);

  return (
    <div>
      {/* The Edit control sits on the SECTION HEADER, not inside the card. */}
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className={CARD_EYEBROW}>Physical</p>
        {!editing && (
          <button
            type="button"
            onClick={startEditing}
            className="-m-2 shrink-0 whitespace-nowrap rounded-md p-2 text-xs text-text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
          >
            Edit
          </button>
        )}
      </div>

      <form action={formAction}>
        {/* The dim is on the CARD, so every row fades together as one surface
            rather than six things fading at slightly different times. */}
        <div
          className={cn(
            "overflow-hidden rounded-2xl bg-bg-surface transition-opacity duration-300 ease-out motion-reduce:transition-none",
            editing ? "opacity-100" : "opacity-60",
          )}
        >
          <Row label="Sex">
            {editing ? (
              <select
                name="sex"
                required
                // Controlled by `sex`, which only moves once a change is
                // confirmed, so Cancel snaps the select straight back.
                value={sex}
                onChange={(e) => setPendingSex(e.target.value)}
                className={FIELD}
              >
                {sex === "" && (
                  <option value="" disabled>
                    Select…
                  </option>
                )}
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            ) : (
              <ReadValue>{capital(initial.sex)}</ReadValue>
            )}
          </Row>

          {/* Read-only in both states — see the component docstring. */}
          <Divider />
          <Row label="Age">
            <ReadValue>{initial.age != null ? `${initial.age} yrs` : "—"}</ReadValue>
          </Row>

          <Divider />
          <Row label={editing ? (imperial ? "Height (in)" : "Height (cm)") : "Height"}>
            {editing ? (
              <Input
                name="height"
                type="number"
                inputMode="decimal"
                min={imperial ? 47 : 120}
                max={imperial ? 91 : 230}
                step="0.1"
                placeholder={imperial ? "71" : "180"}
                value={height}
                onChange={(e) => setHeight(sanitizeHeight(e.target.value))}
                aria-label={imperial ? "Height in inches" : "Height in centimetres"}
                className="h-10 rounded-lg text-sm"
              />
            ) : (
              <ReadValue>{heightRead}</ReadValue>
            )}
          </Row>

          <Divider />
          <Row label="Weight">
            <ReadValue>{weightRead}</ReadValue>
          </Row>

          <Divider />
          <Row label="Goal">
            {editing ? (
              <select
                name="goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className={FIELD}
              >
                <option value="">Not set</option>
                {GOALS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            ) : (
              <ReadValue>
                {initial.goal ? (GOAL_LABELS.get(initial.goal) ?? capital(initial.goal)) : "—"}
              </ReadValue>
            )}
          </Row>

          <Divider />
          <Row label="Units">
            {editing ? (
              <select
                name="units_preference"
                value={units}
                onChange={(e) => handleUnitsChange(e.target.value as Units)}
                className={FIELD}
              >
                <option value="metric">Metric</option>
                <option value="imperial">Imperial</option>
              </select>
            ) : (
              <ReadValue>
                {initial.unitsPreference === "imperial"
                  ? "Imperial"
                  : initial.unitsPreference === "metric"
                    ? "Metric"
                    : "—"}
              </ReadValue>
            )}
          </Row>
        </div>

        {state.error && (
          <p role="alert" className="mt-2 px-1 text-sm text-state-error">
            {state.error}
          </p>
        )}

        {editing && (
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-xl border border-border-strong px-4 py-2.5 text-sm font-medium text-text-muted transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              aria-busy={isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-primary py-2.5 text-sm font-medium text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
            >
              {isPending && <CircleNotch className="h-4 w-4 animate-spin" aria-hidden />}
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </form>

      {/* Sex confirm — kept from Spec 19, where it exists because sex changes
          what the app DRAWS: the injection-site body map switches figure. Spec
          09's "no warning, no confirmation" is about the MARKER filtering (do
          not add a second prompt about that), and spec 04 recorded this one as
          untouched. Removing a deliberate guard on an ambiguous line would be
          the larger mistake, so it stays and is flagged for Adrian.

          Portaled to <body> for the same reason as the sign-out confirm: a fixed
          overlay inside a transformed ancestor is trapped in its stacking
          context and lands behind the bottom nav. */}
      {pendingSex !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] grid place-items-center bg-overlay-backdrop p-6 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
            onClick={() => setPendingSex(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="sex-confirm-title"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs rounded-3xl border border-border-default bg-bg-surface p-5 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
            >
              <h2 id="sex-confirm-title" className="text-base font-medium text-foreground">
                Change to {pendingSex === "female" ? "female" : "male"}?
              </h2>
              <p className="mt-1.5 text-sm text-text-muted">
                Your injection-site map will show the{" "}
                {pendingSex === "female" ? "female" : "male"} body. Your logged
                sites, markers and history stay exactly as they are.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setPendingSex(null)}
                  className="flex-1 rounded-xl border border-border-strong py-2.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSex(pendingSex);
                    setPendingSex(null);
                  }}
                  className="flex-1 rounded-xl bg-accent-primary py-2.5 text-sm font-medium text-bg-base transition-opacity hover:opacity-90"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ── Row scaffolding, shared by both states so nothing shifts ─────── */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[3.25rem] items-center justify-between gap-4 px-4 py-2.5">
      <span className="shrink-0 text-sm text-text-muted">{label}</span>
      <div className="flex min-w-0 max-w-[9.5rem] flex-1 justify-end">{children}</div>
    </div>
  );
}

function ReadValue({ children }: { children: React.ReactNode }) {
  return (
    <span className="truncate text-sm font-medium tabular-nums text-foreground">
      {children}
    </span>
  );
}

function Divider() {
  return <div className="mx-4 hairline-t" aria-hidden />;
}

const capital = (v?: string | null) => (v ? v[0].toUpperCase() + v.slice(1) : "—");

// Storage is metric; show in the user's preferred units (imperial = display
// only). perImperialUnit = metric units per 1 imperial unit.
function formatMeasure(
  value: number | string | null | undefined,
  imperial: boolean,
  metricUnit: string,
  imperialUnit: string,
  perImperialUnit: number,
): string {
  if (value == null) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  const v = imperial ? n / perImperialUnit : n;
  const rounded = Math.round(v * 10) / 10;
  const text = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
  return `${text} ${imperial ? imperialUnit : metricUnit}`;
}
