"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

import { PAYOFF_VARIANTS } from "./screens/payoff-variants";

/**
 * Review harness for the payoff-screen candidates. Same shape as the cost and
 * welcome-effect pickers, deliberately — three harnesses that behave the same
 * way are three fewer things to work out.
 *
 * The CURRENT screen ("The longer you track, the more you see") is not in the
 * list: it is one tap away in the real flow, and putting a fifth option in here
 * would have implied it is still a candidate when Adrian has already rejected
 * it.
 */
export function PayoffVariantPicker() {
  const [index, setIndex] = useState(0);
  const active = PAYOFF_VARIANTS[index];
  const Screen = active.Component;

  return (
    <div className="flow-canvas flow-viewport flex flex-col">
      <div className="shrink-0 border-b-[0.5px] border-border-default px-5 py-3">
        <p className="text-[10px] font-sans uppercase tracking-[0.18em] text-text-subtle">
          Payoff screen · pick one
        </p>
        <div className="mt-2 flex gap-1.5">
          {PAYOFF_VARIANTS.map((v, i) => (
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
          <Screen onContinue={() => {}} />
        </div>
      </div>
    </div>
  );
}
