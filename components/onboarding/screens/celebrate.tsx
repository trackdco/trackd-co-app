"use client";

import { Check } from "@/components/icons";
import type { StruggleTag } from "@/lib/onboarding/session";
import { CARD_EYEBROW, FLOW_DISPLAY, FLOW_EMPHASIS } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { FlowCta, ScrollPort } from "../chrome";
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
  // NOT "built-in injection site rotation". The sites feature REPORTS, it does
  // not recommend (Invariant 4, and `ui-context.md` → the recency ramp): naming
  // rotation as a thing the app does implies it manages one for you. The
  // struggle this answers is "Can't remember my last site", so the honest
  // answer is the record, which is also what the demo screen already says.
  last_site: "Every injection site, logged and dated.",
  notes_app: "One clean place instead of a notes app.",
  // Deliberately NOT another "one place" line — `notes_app` above is already
  // that, and a user who picks both was getting the same sentence twice.
  too_much: "Compounds, peptides and supplements on one list.",
  // Features, not reassurance. Both name a thing that exists on a screen.
  took_today: "Today's log, ticked off as you go.",
  cant_compare: "Every past run kept, side by side.",
  no_history: "Bloods against the protocol you're on.",
};

/**
 * The line for "Something else", and ONLY for that (Adrian, 2026-08-01,
 * revising his own call from earlier the same day).
 *
 * It first shipped as an always-on tail. His correction is the better rule: if
 * someone told us exactly what their problem is, answering it and then adding
 * "and plenty more" waters down the answer. If they told us "something else",
 * this IS the answer to what they said. It is a normal ticked line now rather
 * than a muted afterthought, for the same reason.
 */
const SOMETHING_ELSE = "And plenty more.";

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
  const { goNext, playHandoff, session } = useFlow();

  // "Something else" has no feature line of its own, so it is held back and
  // appended at the end. It cannot count toward the minimum either, or picking
  // only that one would produce a two-line answer.
  const pickedSomethingElse = session.struggle.includes("other");
  const chosen = session.struggle.filter((tag) => ANSWERS[tag] !== undefined);
  for (const tag of TOP_UP) {
    if (chosen.length >= MINIMUM_ANSWERS) break;
    if (!chosen.includes(tag)) chosen.push(tag);
  }
  const lines = chosen.map((tag) => ANSWERS[tag]).filter((l): l is string => Boolean(l));
  if (pickedSomethingElse) lines.push(SOMETHING_ELSE);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Confetti />

      <div className="flex min-h-0 flex-1 flex-col px-5 pt-2">
        {/* Tighter than it was: Kyle's render carries its own padding, so the
            gap was reading as a hole between him and the headline. */}
        {/* Scroll port + `flex-1` wrapper, as every other screen has. Kyle is
            330px before the headline and the answer list even start, so this is
            the screen most likely to run out of room on a short phone. */}
        <ScrollPort>
          <div className="flex w-full flex-1 flex-col items-center justify-center gap-2 py-2">
          <Mascot pose="thumbs" size={330} className="-mb-4 shrink-0" />

          {/* NOT a uniform `space-y`: the eyebrow holds still while the title
              and the ticks come UP to meet it (Adrian, 2026-08-27: "keep 'Good
              news' where it is, and just move them closer"). Even spacing gave
              the eyebrow the same 20px as everything else and made it read as a
              third item in a list rather than as a lead-in to the line under
              it. */}
          <div className="shrink-0 text-center">
            {/* "GOOD NEWS," is an EYEBROW over the headline, not the headline
                itself (Adrian, 2026-08-27). The full line was briefly shrunk to
                caption size; he wanted only the first half small, with the
                claim itself back at display size.

                ⚠️ NO AMBER ON "exactly that", and that is a correction. It used
                to be `text-accent-amber`, which made this the second amber beat
                on a screen whose answer ticks are already amber — the sanctioned
                many-amber onboarding surface. Weight carries the emphasis now,
                which is what `FLOW_EMPHASIS` is for.

                The exclamation mark is his and deliberate: "not a full stop". */}
            <p className={cn(CARD_EYEBROW, "text-center")}>Good news,</p>

            <h1 className={cn(FLOW_DISPLAY, "mt-1.5 text-balance")}>
              We&apos;re built to solve{" "}
              <strong className={FLOW_EMPHASIS}>exactly that!</strong>
            </h1>

            {/* Staggered so the answers arrive one at a time rather than as a
                block, which is what makes it read as a reply. */}
            <ul className="mx-auto mt-4 max-w-[19rem] space-y-2.5 text-left">
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

            {/* NOTHING BELOW THE ANSWER LIST (Adrian, 2026-08-05).
                A paragraph here used to narrate the demo's three stages before
                you got to it. He cut it: the ticks are the reply to what they
                told us, and a summary of what happens next competes with them
                for the last thing read before the button. "Try it now" carries
                that job on its own. */}
          </div>
          </div>
        </ScrollPort>

        <footer className="shrink-0 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <FlowCta
            onClick={() => {
              // Cover the canvas, THEN advance. Reversed, the demo would paint
              // for a frame before the beat covered it; done this way the step
              // change happens behind a screen that is already opaque, and the
              // fade-out reveals the demo rather than this screen (Adrian,
              // 2026-08-27: "make it go to the next page while it says Here's
              // how it works ... it fades out to the next page").
              playHandoff();
              goNext();
            }}
          >
            Try it now
          </FlowCta>
        </footer>
      </div>
    </div>
  );
}
