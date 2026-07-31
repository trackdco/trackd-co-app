"use client";

import { Check } from "@/components/icons";
import type { StruggleTag } from "@/lib/onboarding/session";
import { FLOW_DISPLAY } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { FlowCta } from "../chrome";
import { Confetti } from "../confetti";
import { useFlow } from "../flow-context";
import { Mascot } from "../mascot";

/**
 * Screen 4 — Celebrate, and the handover into the demo.
 *
 * **It answers what they just told us** (Adrian, 2026-08-01). They named their
 * problems on the previous screen, so this names the thing that solves each
 * one. Every line is a real feature stated flatly, which is what keeps it
 * honest: nothing here promises an outcome, it just says what gets recorded.
 *
 * Kyle leads and the copy sits under him, so the screen reads as him answering
 * rather than as a titled page with a picture on it.
 */

/** One line per struggle. Features, never outcomes (TGA §3.1). */
const ANSWERS: Record<StruggleTag, string> = {
  whats_left: "What's left, without counting.",
  recon_maths: "Powder to units, worked out.",
  units_to_draw: "The draw for each dose, on the row.",
  last_site: "Your last site, remembered.",
  notes_app: "One place instead of a notes app.",
  too_much: "Compounds, peptides and supplements together.",
  no_history: "Bloods against the protocol you were on.",
  other: "And plenty more besides.",
};

/**
 * ALWAYS SHOW AT LEAST THREE (Adrian, 2026-08-01). One tick is a thin reply to
 * someone who just told you their problem, and this screen is the payoff for
 * answering. If they picked fewer, the list is topped up from the broadest
 * answers — the ones true for everybody — in this order.
 *
 * Nothing here is a promise; every line is a feature that exists. Padding with
 * a claim would be a different thing entirely.
 */
const MINIMUM_ANSWERS = 3;
const TOP_UP: StruggleTag[] = [
  "whats_left",
  "last_site",
  "no_history",
  "recon_maths",
  "too_much",
];

export function CelebrateScreen() {
  const { goNext, session } = useFlow();

  const chosen = [...session.struggle];
  for (const tag of TOP_UP) {
    if (chosen.length >= MINIMUM_ANSWERS) break;
    if (!chosen.includes(tag)) chosen.push(tag);
  }
  const lines = chosen.map((tag) => ANSWERS[tag]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Confetti />

      <div className="flex min-h-0 flex-1 flex-col px-5 pt-2">
        {/* Tighter than it was: Kyle's render carries its own padding, so the
            gap was reading as a hole between him and the headline. */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 py-2">
          <Mascot pose="thumbs" size={330} className="-mb-4" />

          <div className="space-y-5 text-center">
            <h1 className={cn(FLOW_DISPLAY, "text-balance")}>
              Trackd&apos;s built to solve{" "}
              <strong className="font-normal text-accent-amber">
                exactly that
              </strong>
              .
            </h1>

            {/* Staggered so the answers arrive one at a time rather than as a
                block, which is what makes it read as a reply. */}
            <ul className="mx-auto max-w-[19rem] space-y-2.5 text-left">
              {lines.map((line, i) => (
                <li
                  key={line}
                  className="animate-flow-in flex items-start gap-3"
                  style={{ animationDelay: `${160 + i * 110}ms` }}
                >
                  <span
                    aria-hidden
                    className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-amber text-bg-base"
                  >
                    <Check className="h-2.5 w-2.5" weight="bold" />
                  </span>
                  <span className="text-[0.9rem] leading-snug text-foreground">
                    {line}
                  </span>
                </li>
              ))}
            </ul>

            <p className="text-[0.85rem] text-text-muted">
              Test it out. No account needed.
            </p>
          </div>
        </div>

        <footer className="shrink-0 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <FlowCta onClick={goNext}>Try it now</FlowCta>
        </footer>
      </div>
    </div>
  );
}
