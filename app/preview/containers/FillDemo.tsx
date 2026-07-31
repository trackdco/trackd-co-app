"use client";

import { useState } from "react";

import { Vial } from "@/components/containers";
import { CARD_EYEBROW, DATA_MONO } from "@/lib/ui-presets";

/**
 * TEMPORARY review harness (Spec 01 · part two, step 8) — remove before merge.
 *
 * Drops the vial by one dose worth per tap so the 400ms ease-out settle can be
 * checked, including under `prefers-reduced-motion` (where it must jump).
 */
const DOSES_PER_VIAL = 8;

export function FillDemo({ colour }: { colour: string }) {
  const [dosesLeft, setDosesLeft] = useState(DOSES_PER_VIAL);
  const fill = dosesLeft / DOSES_PER_VIAL;

  return (
    <div className="flex items-center gap-5">
      <Vial colour={colour} fill={fill} size={112} />
      <div className="space-y-3">
        <p className={CARD_EYEBROW}>Log a dose</p>
        <p className={DATA_MONO}>
          {dosesLeft} / {DOSES_PER_VIAL} doses · {Math.round(fill * 100)}%
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDosesLeft((d) => Math.max(0, d - 1))}
            className="rounded-full bg-accent-primary px-4 py-2 text-sm text-bg-base transition active:scale-[0.98] disabled:opacity-40"
            disabled={dosesLeft === 0}
          >
            Log
          </button>
          <button
            type="button"
            onClick={() => setDosesLeft(DOSES_PER_VIAL)}
            className="rounded-full bg-bg-input px-4 py-2 text-sm text-text-muted transition active:scale-[0.98]"
          >
            Refill
          </button>
        </div>
      </div>
    </div>
  );
}
