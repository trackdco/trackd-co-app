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

/**
 * One line per struggle. Features, never outcomes (TGA §3.1).
 *
 * Rewritten 2026-08-01 on Adrian's note that they were too vague to be an
 * answer: each line now NAMES the thing that exists rather than gesturing at
 * the relief it brings. "What's left, without counting" describes a feeling;
 * "full stock tracking" is a feature you can go and look at.
 *
 * `other` has no line, deliberately. "Something else" names no feature, and the
 * tail below already covers it.
 */
const ANSWERS: Partial<Record<StruggleTag, string>> = {
  whats_left: "Full stock tracking, counted for you.",
  recon_maths: "A calculator that turns powder into units.",
  last_site: "Built-in injection site rotation.",
  notes_app: "One clean place instead of a notes app.",
  too_much: "Every compound in one simple place.",
  no_history: "Bloods against the protocol you're on.",
};

/**
 * ALWAYS the last line (Adrian, 2026-08-01). The list answers what they told
 * us, and it should never read as though that is the whole app. Muted and
 * unticked, so it reads as a tail rather than as a seventh feature claim.
 */
const TAIL = "And plenty more.";

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

  // "Something else" carries no feature line, so it cannot count toward the
  // minimum either. Filtering FIRST is what stops a user who picked only that
  // one from seeing a two-line answer.
  const chosen = session.struggle.filter((tag) => ANSWERS[tag] !== undefined);
  for (const tag of TOP_UP) {
    if (chosen.length >= MINIMUM_ANSWERS) break;
    if (!chosen.includes(tag)) chosen.push(tag);
  }
  const lines = chosen.map((tag) => ANSWERS[tag]).filter((l): l is string => Boolean(l));

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

              {/* The tail. Indented to the same text column as the lines above
                  by an empty tick-sized spacer, so it hangs off the list rather
                  than starting a new one. */}
              <li
                className="animate-flow-in flex items-start gap-3"
                style={{ animationDelay: `${160 + lines.length * 110}ms` }}
              >
                <span aria-hidden className="h-4 w-4 shrink-0" />
                <span className="text-[0.9rem] leading-snug text-text-muted">
                  {TAIL}
                </span>
              </li>
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
