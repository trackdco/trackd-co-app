"use client";

import { useEffect, useState, type ReactNode } from "react";

import { CalendarDots, Check, Flask, Syringe } from "@/components/icons";
import { CARD_EYEBROW, DATA_MONO, FLOW_EMPHASIS, FLOW_TITLE } from "@/lib/ui-presets";
import { sparkGeometry } from "@/lib/progress/spark";
import { cn } from "@/lib/utils";

import { FlowCta, StepFrame } from "../chrome";

/**
 * FOUR CANDIDATES for the payoff screen (Adrian, 2026-08-05: he does not like
 * "the longer you track, the more you see", and asked for wider angles — "it
 * doesn't need to be exactly the same topic ... in the ideal mind of someone
 * who's an enhanced lifter").
 *
 * The shipped one (`screens/payoff.tsx`) argues COMPLETENESS: three bars, notes
 * app to spreadsheet to Trackd. It is fine and it is abstract, which is the
 * problem — it argues about tools when the person reading it is thinking about
 * their own run.
 *
 * ## The line every one of these has to stay behind
 *
 * §14 bans invented statistics and the TGA rule bans marketing an OUTCOME. So
 * none of these may say tracking makes your protocol work better, makes your
 * bloods better, or makes you bigger. Every one below argues about the RECORD:
 * what you will be able to answer later that you cannot answer now. That is
 * both the honest claim and, for this reader, the more interesting one.
 */

/* ===========================================================================
   A — "Next cycle, you'll know."
   The strongest angle available to us and the one the current screen misses:
   the value is not this run, it is the NEXT one. Everybody running anything
   has had the experience of not being able to reconstruct what they did.
   =========================================================================== */
const RECALL_ROWS = [
  { q: "What did you run last spring?", icon: Flask },
  { q: "What dose were you on when bloods came back best?", icon: Syringe },
  { q: "How long were you actually off?", icon: CalendarDots },
];

export function PayoffVariantA({ onContinue }: { onContinue: () => void }) {
  return (
    <StepFrame footer={<FlowCta onClick={onContinue}>Continue</FlowCta>}>
      <div className="flex flex-1 flex-col justify-center">
        <div className="space-y-3 text-center">
          <h1 className={cn(FLOW_TITLE, "text-balance")}>
            Next time, <em className={FLOW_EMPHASIS}>you&apos;ll know</em>.
          </h1>
          <p className="mx-auto max-w-[21rem] text-[0.9rem] leading-relaxed text-text-muted">
            Questions that are impossible to answer from memory, and trivial to
            answer from a log.
          </p>
        </div>

        <ul className="mt-8 space-y-3">
          {RECALL_ROWS.map(({ q, icon: Icon }, i) => (
            <li
              key={q}
              className="animate-flow-in flex items-start gap-3 rounded-2xl bg-bg-surface p-4"
              style={{ animationDelay: `${140 + i * 120}ms` }}
            >
              <Icon className="mt-[2px] h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
              <span className="text-[0.9rem] leading-snug text-foreground">{q}</span>
            </li>
          ))}
        </ul>
      </div>
    </StepFrame>
  );
}

/* ===========================================================================
   B — The record fills in.
   A calendar-ish grid populating as it lands. Shows accumulation as a THING
   rather than describing it, and says nothing at all about results.
   =========================================================================== */
const GRID_WEEKS = 12;
const GRID_DAYS = 7;

/**
 * THREE WORDINGS for the grid screen, to be compared rather than argued about
 * (Adrian, 2026-08-05: "give me some text change previews").
 *
 * All three obey the same constraint and it is the whole difficulty of this
 * screen: it may NOT claim an outcome. "What did it do to my body" is a health
 * claim about a prescription-only substance (§3.1), so every option below asks
 * about the RECORD — what you will be able to look up — and lets the reader
 * draw their own conclusion from it.
 *
 * They also may not restate the demo, which is what killed the last version.
 * Each of these points FORWARD, at a moment that has not happened yet.
 */
export type PayoffCopy = { id: string; title: ReactNode; sub: string };

export const PAYOFF_COPY: PayoffCopy[] = [
  {
    id: "B1",
    title: (
      <>
        Six months of this, and{" "}
        <em className={FLOW_EMPHASIS}>nothing is guesswork</em>.
      </>
    ),
    sub: "Every dose, every site, every reading. Kept in order, for as long as you want it.",
  },
  {
    id: "B2",
    title: (
      <>
        The run you&apos;re on now is{" "}
        <em className={FLOW_EMPHASIS}>next year&apos;s reference</em>.
      </>
    ),
    sub: "You only get to look back on what you bothered to write down.",
  },
  {
    id: "B3",
    title: (
      <>
        {/* Forced break, not `text-balance` (Adrian, 2026-08-05: "put the line
            down"). The two halves are a setup and a punchline, and balancing
            them by width put "A year of" on the first line, which lands the
            emphasis in the middle of a sentence instead of at the end. */}
        One tap a day.
        <br />
        <em className={FLOW_EMPHASIS}>A year of answers</em>.
      </>
    ),
    sub: "Bloods, weight and notes, sitting next to whatever you were running at the time.",
  },
];

export function PayoffVariantB({
  onContinue,
  copy = PAYOFF_COPY[0],
}: {
  onContinue: () => void;
  copy?: PayoffCopy;
}) {
  const [filled, setFilled] = useState(0);

  useEffect(() => {
    if (filled >= GRID_WEEKS) return;
    const id = setTimeout(() => setFilled((n) => n + 1), 130);
    return () => clearTimeout(id);
  }, [filled]);

  return (
    <StepFrame footer={<FlowCta onClick={onContinue}>Continue</FlowCta>}>
      <div className="flex flex-1 flex-col justify-center">
        <div className="rounded-2xl bg-bg-surface p-5">
          <p className={CARD_EYEBROW}>Three months in</p>

          <div className="mt-5 flex flex-col gap-1.5">
            {Array.from({ length: GRID_WEEKS }, (_, w) => (
              <div key={w} className="flex gap-1.5">
                {Array.from({ length: GRID_DAYS }, (_, d) => {
                  // A fixed, uneven pattern rather than random: it must look
                  // like a real run, and it must look the SAME every time so
                  // the screen cannot be judged on a lucky roll.
                  const on = (w * GRID_DAYS + d) % 3 !== 1;
                  const lit = w < filled && on;
                  return (
                    <span
                      key={d}
                      className={cn(
                        "h-3 flex-1 rounded-[3px] transition-colors duration-[420ms] motion-reduce:transition-none",
                        lit ? "bg-accent-amber/80" : "bg-bg-base",
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* A PAYOFF HAS TO BE FORWARD-LOOKING, not a caption on the demo.
            "Know what you ran, and when" was a restatement, and the customer
            review said so plainly: "it restates the demo I just watched." The
            grid stays — Adrian liked it, and it earns its place by showing the
            record accumulating — but the words under it now do the job the
            screen is named for.

            A QUESTION, not a claim. "What were you on last spring?" is
            something the reader genuinely cannot answer right now, and being
            unable to answer it is the feeling the product removes. It also
            stays clear of the line "what worked" would cross: it asks about the
            RECORD, never about a result, so nothing here is an outcome claim
            about a prescription-only substance (§3.1). */}
        <div className="mt-8 space-y-3 px-1 text-center">
          <h1 className={cn(FLOW_TITLE, "text-balance")}>{copy.title}</h1>
          <p className="mx-auto max-w-[21rem] text-[0.9rem] leading-relaxed text-text-muted">
            {copy.sub}
          </p>
        </div>
      </div>
    </StepFrame>
  );
}

/* ===========================================================================
   C — What you stop having to hold in your head.
   Argues RELIEF rather than accumulation. For a reader juggling several
   compounds, the appeal is not richer data, it is not having to remember.
   =========================================================================== */
const OFFLOADED = [
  "Which site you used last",
  "How much is left in the vial",
  "What day you're up to",
  "When bloods are due",
  "What you changed, and when",
];

export function PayoffVariantC({ onContinue }: { onContinue: () => void }) {
  return (
    <StepFrame footer={<FlowCta onClick={onContinue}>Continue</FlowCta>}>
      <div className="flex flex-1 flex-col justify-center">
        <div className="space-y-3 text-center">
          <h1 className={cn(FLOW_TITLE, "text-balance")}>
            Stop <em className={FLOW_EMPHASIS}>keeping track</em> of it.
          </h1>
          <p className="mx-auto max-w-[21rem] text-[0.9rem] leading-relaxed text-text-muted">
            All of this stops being your job.
          </p>
        </div>

        <ul className="mt-8 space-y-2.5">
          {OFFLOADED.map((line, i) => (
            <li
              key={line}
              className="animate-flow-in flex items-center gap-3"
              style={{ animationDelay: `${120 + i * 100}ms` }}
            >
              <span
                aria-hidden
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-amber text-bg-base"
              >
                <Check className="h-2.5 w-2.5" weight="bold" />
              </span>
              {/* Struck through: the point is that these come OFF the list. */}
              <span className="text-[0.9rem] leading-snug text-text-muted line-through decoration-text-subtle/50">
                {line}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </StepFrame>
  );
}

/* ===========================================================================
   D — One screen, the whole run.
   The least abstract of the four: a miniature of what Progress actually looks
   like after a few months. Sells the artefact instead of describing it.
   =========================================================================== */
const SPARK = [82.1, 82.6, 83.4, 83.1, 84.0, 84.8, 85.2, 86.0, 86.4, 87.1];

export function PayoffVariantD({ onContinue }: { onContinue: () => void }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Same geometry the real graphs use, so the artefact this screen sells looks
  // like the artefact the user gets — a monotone curve at 2.5 over a taper.
  const { line, area } = sparkGeometry(SPARK, 100, 100);

  return (
    <StepFrame footer={<FlowCta onClick={onContinue}>Continue</FlowCta>}>
      <div className="flex flex-1 flex-col justify-center gap-3">
        <div className="rounded-2xl bg-bg-surface p-5">
          <p className={CARD_EYEBROW}>Weight</p>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-3 h-16 w-full" aria-hidden>
            <defs>
              {/* Same stops as `consistencyFill`: 0.35 at the line, 0 at base. */}
              <linearGradient id="payoffSparkFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-trend)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--chart-trend)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <g
              className="transition-opacity duration-[900ms] motion-reduce:transition-none"
              style={{ opacity: grown ? 1 : 0 }}
            >
              <path d={area} fill="url(#payoffSparkFill)" stroke="none" />
              <path
                d={line}
                fill="none"
                stroke="var(--chart-trend)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          </svg>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-bg-surface p-4">
            <p className={CARD_EYEBROW}>Doses</p>
            <p className={cn(DATA_MONO, "mt-2 text-xl")}>128</p>
          </div>
          <div className="rounded-2xl bg-bg-surface p-4">
            <p className={CARD_EYEBROW}>Consistency</p>
            <p className={cn(DATA_MONO, "mt-2 text-xl text-accent-amber")}>96%</p>
          </div>
        </div>

        <div className="mt-5 space-y-3 px-1 text-center">
          <h1 className={cn(FLOW_TITLE, "text-balance")}>
            In six months, <em className={FLOW_EMPHASIS}>this is yours</em>.
          </h1>
          <p className="mx-auto max-w-[21rem] text-[0.9rem] leading-relaxed text-text-muted">
            Built from nothing but the doses you logged.
          </p>
        </div>
      </div>
    </StepFrame>
  );
}

/** B, once per wording, so the three can be compared side by side. */
const bWith = (copy: PayoffCopy) =>
  function BWithCopy({ onContinue }: { onContinue: () => void }) {
    return <PayoffVariantB onContinue={onContinue} copy={copy} />;
  };

export const PAYOFF_VARIANTS = [
  { id: "B1", name: "Grid — nothing is guesswork", Component: bWith(PAYOFF_COPY[0]) },
  { id: "B2", name: "Grid — next year's reference", Component: bWith(PAYOFF_COPY[1]) },
  { id: "B3", name: "Grid — a year of answers — SHIPPING", Component: bWith(PAYOFF_COPY[2]) },
  { id: "A", name: "Next time, you'll know (questions)", Component: PayoffVariantA },
  { id: "C", name: "Stop keeping track of it (relief)", Component: PayoffVariantC },
  { id: "D", name: "In six months, this is yours (artefact)", Component: PayoffVariantD },
] as const;
