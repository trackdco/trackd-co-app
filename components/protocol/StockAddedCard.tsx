"use client";

import { useEffect, useRef, useState } from "react";

import { AnimatedContainer } from "@/components/containers";
import { cn } from "@/lib/utils";
import { DATA_MONO, SHEET_TITLE } from "@/lib/ui-presets";

/** How long the container takes to fill. Longer than `FILL_EASE_MS`, because
 *  here the fill IS the confirmation rather than a level quietly correcting
 *  itself — it has to be watchable. */
const FILL_MS = 900;
/** The beat after it settles, before the sheet goes. Adrian, 2026-08-07. */
const HOLD_MS = 500;

/**
 * The moment after stock is added.
 *
 * Adding stock used to close the sheet and drop you back on a card that had
 * silently changed. `ui-context.md` → Motion already says the log action "gets a
 * moment", for the same reason: it is the line between entering data and
 * tracking something. This is that, for stock — the container fills from empty
 * to what you just put in it, and only then does the sheet leave.
 *
 * **Tapping anywhere dismisses it immediately** (Adrian, 2026-08-07). A
 * confirmation you cannot skip is a confirmation that will be in the way the
 * fiftieth time. The whole card is the target, so there is nothing to aim at.
 */
export function StockAddedCard({
  compoundName,
  category,
  inventoryType,
  /** Where the container ends up: `remaining / total` for what was just added.
   *  A fresh vial is 1; a partly-used one entered as such is less. */
  fill,
  /** What was added, worded — "10 mL", "60 tablets", "300 g". */
  amountLabel,
  onDone,
}: {
  compoundName: string;
  category?: string | null;
  inventoryType?: string | null;
  fill: number;
  amountLabel?: string | null;
  onDone: () => void;
}) {
  // Starts EMPTY and is retargeted on the next frame, which is what gives
  // `useAnimatedFill` a previous value to ease from. Setting it in an effect
  // rather than during render is the difference between a fill and a jump.
  const [target, setTarget] = useState(0);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setTarget(fill));
    return () => cancelAnimationFrame(raf);
  }, [fill]);

  // The dismiss timer is armed ONCE. `onDone` is an inline arrow at every call
  // site, so a dependency on it would restart the timer on each parent render —
  // and a sheet whose auto-close keeps being deferred is a sheet that never
  // closes. The ref carries the latest callback without re-arming, and is
  // written from an EFFECT rather than during render (`react-hooks/refs`: a ref
  // written while rendering is a mutation the reconciler may run twice).
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    const t = setTimeout(() => onDoneRef.current(), FILL_MS + HOLD_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    // A DIV with a click handler, not a button: it wraps a heading and a figure,
    // and a button may not contain a heading. The keyboard path out is the
    // sheet's own Escape, which is already there.
    <div
      onClick={onDone}
      className="flex flex-col items-center gap-4 px-6 pt-2 pb-[calc(env(safe-area-inset-bottom)+2rem)]"
    >
      <AnimatedContainer
        name={compoundName}
        inventoryType={inventoryType}
        category={category}
        fill={target}
        durationMs={FILL_MS}
        size={120}
      />
      <div className="space-y-1 text-center">
        <p className={cn(SHEET_TITLE, "text-foreground")}>Stock added</p>
        <p className={DATA_MONO}>
          {amountLabel ? `${amountLabel} · ${compoundName}` : compoundName}
        </p>
      </div>
      <p className="text-xs text-text-subtle">Tap anywhere to close</p>
    </div>
  );
}
