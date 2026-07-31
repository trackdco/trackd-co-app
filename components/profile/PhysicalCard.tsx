"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleNotch } from "@/components/icons";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { CARD_EYEBROW } from "@/lib/ui-presets";
import { updatePhysical, type PhysicalState } from "@/app/(app)/profile/actions";

const initialState: PhysicalState = {};

/**
 * One field, used by all four controls so the card has ONE field language. The
 * height input used the bare `Input` default, which is transparent with 12px of
 * padding, so it read as an outline beside three filled pills.
 *
 * 16px text, not 14: iOS Safari zooms the viewport whenever a focused control is
 * under 16px, and this is a phone-first app. The Settings form this replaced was
 * 16px for the same reason.
 */
const FIELD =
  "h-11 w-full min-w-0 rounded-lg border border-border-default bg-bg-input px-2.5 text-base text-foreground outline-none transition-[color,box-shadow] [color-scheme:dark] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

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
  const actionsRef = useRef<HTMLDivElement | null>(null);

  // A successful save returns the card to its read state. Adjust-during-render
  // rather than an effect: an effect would paint one frame of the edit state
  // after the save had already landed.
  //
  // Keyed on `savedAt`, which changes per save, NOT on `success`, which
  // `useActionState` holds true from the first save onward — so this used to fire
  // once and never again, and every later save sat in edit mode with no signal
  // that anything had happened.
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  if (state.savedAt != null && state.savedAt !== lastSavedAt) {
    setLastSavedAt(state.savedAt);
    setEditing(false);
  }
  // A stale error must not outlive the edit that produced it: `useActionState`
  // holds the last result, so cancelling left a red message under a read-only
  // card showing the values the user never changed.
  const [errorDismissed, setErrorDismissed] = useState(false);
  const showError = state.error != null && !errorDismissed;

  useEffect(() => {
    if (pendingSex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingSex(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingSex]);

  const imperial = units === "imperial";

  /** Every editable value, back to what is actually saved. */
  function reseed() {
    setUnits(startUnits);
    setHeight(heightToDisplay(initial.heightCm, startUnits));
    setSex(initial.sex === "male" || initial.sex === "female" ? initial.sex : "");
    setGoal(initial.goal ?? "");
  }

  function startEditing() {
    // Re-seed from the saved values, so an abandoned edit never carries into the
    // next one.
    reseed();
    setErrorDismissed(true);
    setEditing(true);
    // Bring the Save row into view. The nav and the FAB are FIXED, so a card
    // opened low on the page put its own primary action underneath them — on a
    // 360px-tall-ish phone Save was entirely below the fold, and on a 390 the
    // bottom 60% of it was inside the nav band, where a tap navigated to another
    // tab and threw the edit away.
    requestAnimationFrame(() => {
      actionsRef.current?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    });
  }

  function cancelEditing() {
    // `units` is the one piece of edit state that also drives the READ rows, so
    // leaving it where the user left it made the card contradict itself: it read
    // "Units Metric" beside a weight in lbs, and the wrong-unit number was the
    // bodyweight.
    reseed();
    setErrorDismissed(true);
    setEditing(false);
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
            /* 44px of target. It was 37x32 — the only sub-44 control on the
               page, and the one that gates the whole card. The negative margin
               keeps the visual position unchanged. */
            className="-m-2 flex min-h-11 min-w-11 shrink-0 items-center justify-end whitespace-nowrap rounded-md p-2 text-xs text-text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
          >
            Edit
          </button>
        )}
      </div>

      {/* A fresh submit un-dismisses the error slot, so the NEXT failure is
          reported even if the previous one was cancelled away. */}
      <form action={formAction} onSubmit={() => setErrorDismissed(false)}>
        {/* The dim is on the CARD, so every row fades together as one surface
            rather than six things fading at slightly different times. */}
        <div
          className={cn(
            "overflow-hidden rounded-2xl bg-bg-surface transition-opacity duration-300 ease-out motion-reduce:transition-none",
            // "Slightly dimmed" (spec 09). 60% was not slight: composited, it
            // dragged the row labels to 2.2:1 against the card, well under the
            // 4.5:1 AA floor for 14px text, and the labels are what this spec
            // added. 85% keeps the read state visibly quieter than edit while
            // leaving the text where the rest of the app puts it.
            editing ? "opacity-100" : "opacity-85",
          )}
        >
          <Row label="Sex">
            {editing ? (
              <select
                name="sex"
                required
                aria-label="Sex"
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
                className={FIELD}
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
                aria-label="Goal"
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
                aria-label="Units"
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

        {showError && (
          <p role="alert" className="mt-2 px-1 text-sm text-state-error">
            {state.error}
          </p>
        )}

        {editing && (
          <div
            ref={actionsRef}
            /* Clear of the fixed bottom nav + FAB when scrolled to. */
            className="mt-3 flex scroll-mb-32 gap-3"
          >
            <button
              type="button"
              onClick={cancelEditing}
              className="min-h-11 rounded-xl border border-border-strong px-4 py-2.5 text-sm font-medium text-text-muted transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              aria-busy={isPending}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent-primary py-2.5 text-sm font-medium text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
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
                {/* "Change to" only when there is something to change FROM. A
                    profile that predates the welcome quiz has no sex at all, and
                    was being asked to confirm a change away from a value it
                    never had. */}
                {initial.sex === "male" || initial.sex === "female"
                  ? "Change to "
                  : "Set to "}
                {pendingSex === "female" ? "female" : "male"}?
              </h2>
              <p className="mt-1.5 text-sm text-text-muted">
                Your injection-site map will show the{" "}
                {pendingSex === "female" ? "female" : "male"} body. Your logged
                sites, markers and history stay exactly as they are.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  // Focus lands INSIDE the dialog on open, and on the
                  // non-destructive choice. Without it `document.activeElement`
                  // stayed on <body> and the first Tab went straight into the
                  // form behind the overlay.
                  autoFocus
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
