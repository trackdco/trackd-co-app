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
  last_site: "Your last site, remembered.",
  spreadsheet: "One place instead of a spreadsheet.",
  no_history: "Bloods against the protocol you were on.",
};

/** When they skipped the question, say the thing that covers all of it. */
const FALLBACK = ["Doses, stock, sites, bloods and notes. All in one place."];

export function CelebrateScreen() {
  const { goNext, session } = useFlow();

  const lines = session.struggle.length
    ? session.struggle.map((tag) => ANSWERS[tag])
    : FALLBACK;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Confetti />

      <div className="flex min-h-0 flex-1 flex-col px-5 pt-2">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-7 py-4">
          <Mascot pose="thumbs" size={330} />

          <div className="space-y-5 text-center">
            <h1 className={cn(FLOW_DISPLAY, "text-balance")}>
              Trackd&apos;s built to solve exactly that.
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
              Have a look. No account needed.
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
