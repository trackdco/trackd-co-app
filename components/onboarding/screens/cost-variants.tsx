"use client";

import { useEffect, useState } from "react";

import { formatPrice, PLANS } from "@/lib/onboarding/pricing";
import { CARD_EYEBROW, DATA_MONO } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { FlowCta, StepFrame } from "../chrome";

/**
 * FOUR CANDIDATES for the cost screen (Adrian, 2026-07-31). One of these ships
 * and the other three get deleted; they live in one file so the comparison is
 * honest and so removing three is one edit.
 *
 * The constraint that shapes all four: §14 bans fabricated statistics outright,
 * so none of them may assert what "people" spend. A wants no figure at all, B
 * refuses to guess yours, C asks you, D shows no numbers. Every one is TGA-safe
 * for a different reason.
 *
 * The Trackd price is always read from `lib/onboarding/pricing.ts`, never typed
 * in, so a pricing change moves all four at once.
 */

const YEARLY = PLANS.yearly;

/* ===========================================================================
   A — "Less than one vial a year"
   No graph and no statistic. It anchors to a thing the user already buys and
   already knows the price of, so we never have to claim a number.
   =========================================================================== */
export function CostVariantA({ onContinue }: { onContinue: () => void }) {
  return (
    <StepFrame
      center
      footer={<FlowCta onClick={onContinue}>See plans</FlowCta>}
    >
      <div className="space-y-8 text-center">
        <p className={CARD_EYEBROW}>A year of Trackd</p>

        <p className="text-[2.75rem] font-light leading-[1.05] tracking-[-0.03em] text-foreground">
          costs less than
          <br />
          <span className="text-accent-amber">one vial</span>
        </p>

        <p className="mx-auto max-w-[19rem] text-[0.95rem] leading-relaxed text-text-muted">
          You already spend more than this on the things you are trying to keep
          track of.
        </p>

        <p className={cn(DATA_MONO, "text-sm uppercase tracking-[0.08em]")}>
          {formatPrice(YEARLY.price)} / year
        </p>
      </div>
    </StepFrame>
  );
}

/* ===========================================================================
   B — The redacted receipt
   Says "we are not going to pretend we know your numbers" out loud, which is
   both the honest position and a stronger one than a made-up average.
   =========================================================================== */
const RECEIPT_ROWS = [
  { label: "Compounds", blocks: 6 },
  { label: "Pins and supplies", blocks: 4 },
  { label: "Bloodwork", blocks: 5 },
  { label: "Supplements", blocks: 6 },
];

export function CostVariantB({ onContinue }: { onContinue: () => void }) {
  return (
    <StepFrame
      title="You already know what this costs."
      sub="We are not going to guess your numbers. Only ours."
      footer={<FlowCta onClick={onContinue}>See plans</FlowCta>}
    >
      <div className="flex flex-1 flex-col justify-center">
        <div className="rounded-2xl bg-bg-surface p-5">
          <p className={CARD_EYEBROW}>What a protocol costs</p>

          <ul className="mt-4 divide-y divide-border-default">
            {RECEIPT_ROWS.map((row) => (
              <li
                key={row.label}
                className="flex items-center justify-between gap-4 py-3"
              >
                <span className="text-[0.9rem] text-text-muted">{row.label}</span>
                {/* Redacted rather than invented. */}
                <span className="flex gap-[3px]" aria-label="your figure">
                  {Array.from({ length: row.blocks }, (_, i) => (
                    <span
                      key={i}
                      className="block h-3 w-2 rounded-[1px] bg-bg-surface-raised"
                    />
                  ))}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-1 flex items-baseline justify-between gap-4 border-t-[0.5px] border-border-strong pt-4">
            <span className="text-[0.9rem] text-foreground">Trackd, per year</span>
            <span className="font-mono text-xl font-light tabular-nums text-accent-amber">
              {formatPrice(YEARLY.price)}
            </span>
          </div>
        </div>

        <p className="mt-4 text-center text-[0.8rem] leading-relaxed text-text-subtle">
          Your numbers are yours. Ours is the only one we will put a figure on.
        </p>
      </div>
    </StepFrame>
  );
}

/* ===========================================================================
   C — Their number, one slider
   Nothing is invented because the figure is theirs, and dragging it makes them
   do the arithmetic themselves, which lands harder than being told.
   =========================================================================== */
const MIN_SPEND = 50;
const MAX_SPEND = 600;

export function CostVariantC({ onContinue }: { onContinue: () => void }) {
  const [monthly, setMonthly] = useState(180);
  const theirYear = monthly * 12;
  // Both bars are drawn against THEIR yearly figure, so the Trackd bar shrinks
  // as they drag up. That is the whole argument, made without a word.
  const trackdWidth = Math.max(1.5, (YEARLY.price / theirYear) * 100);

  return (
    <StepFrame
      title="Put your own number on it."
      sub="Whatever you spend a month, on everything."
      footer={<FlowCta onClick={onContinue}>See plans</FlowCta>}
    >
      <div className="flex flex-1 flex-col justify-center gap-8">
        <div className="text-center">
          <p className="font-mono text-[2.5rem] font-light tabular-nums leading-none text-foreground">
            {formatPrice(monthly)}
            <span className="ml-1 text-sm text-text-muted">/mo</span>
          </p>
          <input
            type="range"
            min={MIN_SPEND}
            max={MAX_SPEND}
            step={10}
            value={monthly}
            onChange={(e) => setMonthly(Number(e.target.value))}
            aria-label="What you spend a month"
            className="mt-6 h-1 w-full appearance-none rounded-full bg-bg-input accent-[var(--accent-amber)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="mt-2 flex justify-between">
            <span className={cn(DATA_MONO, "text-[10px]")}>{formatPrice(MIN_SPEND)}</span>
            <span className={cn(DATA_MONO, "text-[10px]")}>{formatPrice(MAX_SPEND)}+</span>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl bg-bg-surface p-5">
          <p className={CARD_EYEBROW}>Over a year</p>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[0.85rem] text-text-muted">What you run</span>
              <span className="font-mono text-sm tabular-nums text-foreground">
                {formatPrice(theirYear)}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-bg-surface-raised" />
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[0.85rem] text-text-muted">Trackd</span>
              <span className="font-mono text-sm tabular-nums text-foreground">
                {formatPrice(YEARLY.price)}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-bg-surface-raised">
              <div
                className="h-full rounded-full bg-accent-amber transition-[width] duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none"
                style={{ width: `${trackdWidth}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </StepFrame>
  );
}

/* ===========================================================================
   D — Relative bars, no figures at all
   The safest of the four. Nothing can be challenged because nothing is stated.
   =========================================================================== */
const BARS = [
  { label: "What you run", height: 100, accent: false },
  { label: "Trackd", height: 6, accent: true },
];

export function CostVariantD({ onContinue }: { onContinue: () => void }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <StepFrame
      title="It is not the expensive part."
      sub="Next to what a protocol costs to run, the tracking is a rounding error."
      footer={<FlowCta onClick={onContinue}>See plans</FlowCta>}
    >
      <div className="flex flex-1 flex-col justify-center">
        <div className="rounded-2xl bg-bg-surface p-5">
          <div className="flex h-56 items-end justify-center gap-10">
            {BARS.map((bar, i) => (
              <div key={bar.label} className="flex h-full flex-1 flex-col justify-end">
                <div
                  className={cn(
                    "w-full rounded-t-lg",
                    "transition-[height] duration-[720ms] ease-[var(--motion-ease)]",
                    "motion-reduce:transition-none",
                    bar.accent ? "bg-accent-amber" : "bg-bg-surface-raised",
                  )}
                  style={{
                    height: grown ? `${bar.height}%` : "0%",
                    transitionDelay: `${i * 140}ms`,
                  }}
                />
                <p
                  className={cn(
                    "mt-3 text-center text-[10px] font-sans uppercase tracking-[0.12em]",
                    bar.accent ? "text-foreground" : "text-text-subtle",
                  )}
                >
                  {bar.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-4 text-center text-[0.8rem] text-text-subtle">
          {formatPrice(YEARLY.price)} a year.
        </p>
      </div>
    </StepFrame>
  );
}

export const COST_VARIANTS = [
  { id: "A", name: "Less than one vial", Component: CostVariantA },
  { id: "B", name: "The redacted receipt", Component: CostVariantB },
  { id: "C", name: "Their number, one slider", Component: CostVariantC },
  { id: "D", name: "Relative bars", Component: CostVariantD },
] as const;
