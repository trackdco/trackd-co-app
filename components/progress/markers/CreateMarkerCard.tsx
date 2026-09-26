"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CaretLeft, CircleNotch } from "@/components/icons";

import { createCustomMarker } from "@/app/(app)/progress/actions";
import { useWriteAccess } from "@/components/billing/ReadOnlyGate";
import { reducedMotion, useSideSwap } from "@/components/progress/markers/motion";
import type { MarkerOption } from "@/lib/progress/journal";
import {
  OWN_WORD_SLOTS,
  READY_SCALES,
  asksBetterEnd,
  markerNamed,
  polarityFor,
  scaleWords,
  titleCaseMarkerName,
  type BetterEnd,
  type ScaleKey,
} from "@/lib/progress/markerPick";
import { HIT_Y_TEXT, PRESS, PRIMARY_BUTTON } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

/**
 * CREATE YOUR OWN (markers7): a header row ("Cancel", or "Back" after the first
 * step, and "New marker"), two or three thin dashes that fill white step by
 * step, then the steps, which slide sideways as you move (14px with a fade,
 * 120ms out, 240ms in):
 * - "Name it": the name, title-cased on save.
 * - "Pick its steps": a ready-made scale (each card shows a mini five-bar
 *   preview and its words) or your own words.
 * - "Which end is better?", only for Level and your own words. It orients
 *   future charts; it is never drawn as a good or bad colour (architecture
 *   Invariant 3).
 * Nothing is disabled without a reason: a step that is not ready says why.
 */
export function CreateMarkerCard({
  initialName,
  options,
  onCancel,
  onCreated,
}: {
  initialName: string;
  options: MarkerOption[];
  onCancel: () => void;
  onCreated: (marker: MarkerOption) => void;
}) {
  const { guard } = useWriteAccess();
  const nameId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  const swap = useSideSwap(stepRef);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);
  const [scale, setScale] = useState<ScaleKey>("severity");
  const [own, setOwn] = useState<string[]>(() => Array<string>(OWN_WORD_SLOTS).fill(""));
  const [better, setBetter] = useState<BetterEnd | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const asks = asksBetterEnd(scale);
  const steps = asks ? 3 : 2;
  const words = scaleWords(scale, own);
  const lo = words[0] ?? "The low end";
  const hi = words[words.length - 1] ?? "The high end";
  const last = step === steps - 1;

  useEffect(() => {
    if (step === 0) nameRef.current?.focus({ preventScroll: true });
  }, [step]);

  function go(to: number) {
    swap(to > step ? 1 : -1, () => {
      setError(null);
      setStep(to);
    });
  }

  function back() {
    if (busy) return;
    if (step === 0) onCancel();
    else go(step - 1);
  }

  function pickBetter(b: BetterEnd) {
    setBetter(b);
    setError(null);
  }

  function chooseScale(next: ScaleKey) {
    setScale(next);
    setBetter(null);
    setError(null);
  }

  /** The name field shakes (markers7) as its error appears. */
  function shake() {
    const el = nameRef.current;
    if (!el || reducedMotion()) return;
    el.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-6px)" },
        { transform: "translateX(6px)" },
        { transform: "none" },
      ],
      { duration: 280 },
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await createCustomMarker({
      name: titleCaseMarkerName(name),
      labels: words,
      polarity: polarityFor(scale, better ?? "neither"),
    }).catch(() => ({ ok: false as const, error: undefined, marker: undefined }));
    setBusy(false);
    if (res.ok && res.marker) onCreated(res.marker);
    else setError(res.error ?? "Couldn’t save. Try again.");
  }

  function primary() {
    if (busy) return;
    if (step === 0) {
      const n = titleCaseMarkerName(name);
      if (!n) {
        setError("Give it a name.");
        nameRef.current?.focus();
        shake();
        return;
      }
      const taken = markerNamed(options, n);
      if (taken) {
        setError(`${taken.name} is already a marker.`);
        shake();
        return;
      }
      go(1);
      return;
    }
    if (step === 1) {
      if (scale === "own" && words.length < 2) {
        setError("Add at least two words.");
        return;
      }
      if (asks) {
        go(2);
        return;
      }
    }
    if (step === 2 && better === null) {
      setError("Pick which end is better.");
      return;
    }
    guard(() => void save());
  }

  return (
    <div>
      <div className="mb-2.5 grid grid-cols-[1fr_auto_1fr] items-center">
        <button
          type="button"
          onClick={back}
          className={cn(
            PRESS.text,
            HIT_Y_TEXT,
            "flex items-center gap-1 justify-self-start pr-3 text-[12px] text-text-muted transition-colors hover:text-foreground",
          )}
        >
          {step === 0 ? (
            "Cancel"
          ) : (
            <>
              <CaretLeft className="h-3 w-3" aria-hidden />
              Back
            </>
          )}
        </button>
        <span className="text-[13px] text-foreground">New marker</span>
        <span aria-hidden />
      </div>

      <div className="mb-3 flex gap-[5px]" aria-hidden>
        {Array.from({ length: steps }, (_, i) => (
          <i key={i} className="relative block h-[3px] flex-1 overflow-hidden rounded-[2px] bg-bg-surface-raised">
            <i className="md-fade absolute inset-0 bg-text-primary" style={{ opacity: i <= step ? 1 : 0 }} />
          </i>
        ))}
      </div>

      <div ref={stepRef}>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            primary();
          }}
        >
          {step === 0 ? (
            <>
              <label htmlFor={nameId} className="mb-2 block text-[15px] font-light text-foreground">
                Name it
              </label>
              <input
                id={nameId}
                ref={nameRef}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Neck pain"
                maxLength={40}
                autoComplete="off"
                enterKeyHint="next"
                aria-invalid={error ? true : undefined}
                className="inset-focus block w-full rounded-xl bg-bg-input px-3 py-[11px] text-[13.5px] text-foreground outline-none placeholder:text-text-muted"
              />
            </>
          ) : null}

          {step === 1 ? (
            <>
              <p className="mb-2 text-[15px] font-light text-foreground">Pick its steps</p>
              <div role="radiogroup" aria-label="Steps" className="flex flex-col gap-1.5">
                {READY_SCALES.map((s) => (
                  <OptionCard key={s.key} on={scale === s.key} onClick={() => chooseScale(s.key)}>
                    <MiniSteps />
                    <span className="mt-[5px] block text-[10.5px] text-text-muted">{s.words.join(" · ")}</span>
                  </OptionCard>
                ))}
                <OptionCard on={scale === "own"} onClick={() => chooseScale("own")}>
                  <span className="text-[12px]">Your own words</span>
                </OptionCard>
              </div>
              {scale === "own" ? (
                <div className="mt-2 grid grid-cols-5 gap-1">
                  {own.map((w, i) => (
                    <input
                      key={i}
                      value={w}
                      onChange={(e) => {
                        setOwn((prev) => prev.map((x, j) => (j === i ? e.target.value : x)));
                        if (error) setError(null);
                      }}
                      placeholder={String(i + 1)}
                      aria-label={`Word ${i + 1}, low to high`}
                      maxLength={24}
                      autoComplete="off"
                      className="inset-focus min-w-0 rounded-sm bg-bg-input px-1 py-2 text-center text-[11px] text-foreground outline-none placeholder:text-text-muted"
                    />
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <p className="mb-2 text-[15px] font-light text-foreground">Which end is better?</p>
              <div role="radiogroup" aria-label="Which end is better" className="flex flex-col gap-1.5">
                <OptionCard on={better === "low"} onClick={() => pickBetter("low")}>
                  <span className="text-[12.5px]">“{lo}” is better</span>
                </OptionCard>
                <OptionCard on={better === "high"} onClick={() => pickBetter("high")}>
                  <span className="text-[12.5px]">“{hi}” is better</span>
                </OptionCard>
                <OptionCard on={better === "neither"} onClick={() => pickBetter("neither")}>
                  <span className="text-[12.5px]">Neither</span>
                </OptionCard>
              </div>
            </>
          ) : null}

          {error ? (
            <p role="alert" className="mt-2.5 text-[12.5px] text-state-error">
              {error}
            </p>
          ) : null}

          <button type="submit" aria-busy={busy || undefined} className={cn(PRIMARY_BUTTON, "mt-3 w-full")}>
            {busy ? <CircleNotch className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {busy ? "Saving…" : last ? "Save marker" : "Next"}
          </button>
        </form>
      </div>
    </div>
  );
}

/** A ready-made scale's picture: five bars, the first three white fading up
 *  in brightness (markers7). */
function MiniSteps() {
  return (
    <span className="flex gap-1" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <i
          key={i}
          className={cn("block h-[14px] flex-1 rounded-[5px]", i < 3 ? "bg-text-primary" : "bg-bg-input")}
          style={i < 3 ? { opacity: 0.35 + 0.22 * i } : undefined}
        />
      ))}
    </span>
  );
}

/** One choice in the card (its steps, which end is better): raised grey,
 *  radius 12; the chosen one takes a 1.5px white ring inside. */
function OptionCard({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        PRESS.card,
        "relative block w-full rounded-xl bg-bg-surface-raised px-3 py-2.5 text-left text-foreground",
      )}
    >
      {children}
      <span
        aria-hidden
        className="md-fade pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_1.5px_var(--text-primary)]"
        style={{ opacity: on ? 1 : 0 }}
      />
    </button>
  );
}
