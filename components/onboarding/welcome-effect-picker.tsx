"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

import { FlowCta } from "./chrome";
import { WELCOME_EFFECTS, WelcomeStage } from "./welcome-effects";

/**
 * A REVIEW HARNESS, not a shipping screen. Same shape as the cost picker.
 *
 * Each effect renders at full size in the real flow chrome, so what Adrian sees
 * is what would ship. Whichever wins becomes the `EFFECT` constant in
 * `screens/greeting.tsx` and the rest come out with this route.
 *
 * The name is typed in rather than read from the session: the harness is
 * reachable without walking the flow, so there is no session to read, and
 * seeing a long name in a 40px headline is half of what is being judged.
 */
const SAMPLE_SUB =
  "Let's learn a bit more, so Trackd can be built around what you actually run.";

export function WelcomeEffectPicker() {
  const [index, setIndex] = useState(0);
  const [name, setName] = useState("Adrian");
  const active = WELCOME_EFFECTS[index];
  // Remounting on either change is what replays the effect — without it,
  // switching tabs would show a finished animation and judge nothing.
  const runKey = `${active.id}:${name}`;

  return (
    <div className="flow-canvas flow-viewport flex flex-col">
      <div className="shrink-0 border-b-[0.5px] border-border-default px-5 py-3">
        <p className="text-[10px] font-sans uppercase tracking-[0.18em] text-text-subtle">
          Welcome effect · pick one
        </p>
        <div className="mt-2 flex gap-1.5">
          {WELCOME_EFFECTS.map((e, i) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                "h-9 flex-1 rounded-lg text-xs capitalize transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                i === index
                  ? "bg-accent-primary font-medium text-bg-base"
                  : "bg-bg-surface text-text-muted",
              )}
            >
              {e.id}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[0.8rem] text-text-muted">{active.name}</p>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Try a name"
          aria-label="Sample name"
          className="mt-2 h-10 w-full rounded-lg bg-bg-input px-3 text-sm text-foreground outline-none placeholder:text-text-subtle focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
        <div key={runKey} className="flex min-h-0 flex-1 flex-col px-5 pt-2">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
            <WelcomeStage
              effect={active.id}
              name={name.trim() || null}
              sub={SAMPLE_SUB}
            />
          </div>
          <footer className="shrink-0 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <FlowCta onClick={() => setIndex((i) => i)}>Let&apos;s go</FlowCta>
          </footer>
        </div>
      </div>
    </div>
  );
}
