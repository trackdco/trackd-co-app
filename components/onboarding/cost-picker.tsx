"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

import { COST_VARIANTS } from "./screens/cost-variants";

/**
 * The switcher for the four cost-screen candidates. Each renders at full size
 * in the real flow chrome, so what Adrian sees is what would ship.
 */
export function CostVariantPicker({ yearlyPrice }: { yearlyPrice?: number }) {
  const [index, setIndex] = useState(0);
  const active = COST_VARIANTS[index];
  const Screen = active.Component;

  return (
    <div className="flow-viewport flex flex-col bg-bg-base">
      {/* Harness chrome. Deliberately plain so it cannot be mistaken for part
          of the screen being judged. */}
      <div className="shrink-0 border-b-[0.5px] border-border-default px-5 py-3">
        <p className="text-[10px] font-sans uppercase tracking-[0.18em] text-text-subtle">
          Cost screen · pick one
        </p>
        <div className="mt-2 flex gap-1.5">
          {COST_VARIANTS.map((v, i) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                "h-9 flex-1 rounded-lg text-xs transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                i === index
                  ? "bg-accent-primary font-medium text-bg-base"
                  : "bg-bg-surface text-text-muted",
              )}
            >
              {v.id}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[0.8rem] text-text-muted">{active.name}</p>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        {/* Remounts per variant so entrance animations replay on each switch. */}
        <div key={active.id} className="animate-flow-in flex flex-1 flex-col">
          <Screen yearlyPrice={yearlyPrice} onContinue={() => {}} />
        </div>
      </div>
    </div>
  );
}
