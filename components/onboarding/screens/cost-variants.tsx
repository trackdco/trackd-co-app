"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { formatPrice, PLANS } from "@/lib/onboarding/pricing";
import { CARD_EYEBROW, DATA_MONO, FLOW_TITLE } from "@/lib/ui-presets";
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
      title="The tracking is the cheap part."
      sub="Everything above the line, you are already paying for."
      footer={<FlowCta onClick={onContinue}>See plans</FlowCta>}
    >
      <div className="flex flex-1 flex-col justify-center">
        <div className="flow-card rounded-2xl bg-bg-surface p-5">
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
          Only one figure on this screen is ours to know.
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

/**
 * A shower of dollar signs lifting off the top of a bar and falling away.
 *
 * `count` is the whole point of the comparison: the expensive bar sheds a lot
 * and the Trackd bar sheds one. Deterministic scatter, so it is identical on
 * every render and cannot differ between server and client.
 */
function DollarFall({ count, delay }: { count: number; delay: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = Math.abs(Math.sin((i + 1) * 12.9898) * 43758.5453) % 1;
        const b = Math.abs(Math.sin((i + 41) * 78.233) * 12345.678) % 1;
        return {
          left: 12 + a * 76,
          dx: (b - 0.5) * 54,
          dy: 70 + b * 70,
          fall: 2000 + a * 1200,
          delay: delay + i * 130 + b * 220,
          size: 11 + Math.round(b * 4),
        };
      }),
    [count, delay],
  );

  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="animate-dollar-fall absolute font-mono text-text-subtle"
          style={
            {
              left: `${p.left}%`,
              fontSize: p.size,
              animationDelay: `${p.delay}ms`,
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--fall-ms": `${p.fall}ms`,
            } as CSSProperties
          }
        >
          $
        </span>
      ))}
    </span>
  );
}

export function CostVariantD({ onContinue }: { onContinue: () => void }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <StepFrame footer={<FlowCta onClick={onContinue}>See plans</FlowCta>}>
      <div className="flex flex-1 flex-col justify-center">
        <div className="flow-card rounded-2xl bg-bg-surface p-5">
          <div className="flex h-56 items-end justify-center gap-10">
            {BARS.map((bar, i) => (
              <div key={bar.label} className="relative flex h-full flex-1 flex-col justify-end">
                <div
                  className={cn(
                    "relative w-full rounded-t-lg",
                    // Slower than it was. The bar climbing is the argument, so
                    // it is worth watching (Adrian: "slow is premium").
                    "transition-[height] duration-[1500ms] ease-[var(--motion-ease)]",
                    "motion-reduce:transition-none",
                    bar.accent ? "bg-accent-amber" : "bg-bg-surface-raised",
                  )}
                  style={{
                    height: grown ? `${bar.height}%` : "0%",
                    transitionDelay: `${i * 260}ms`,
                  }}
                >
                  {/* The money leaving. Nine off the expensive one, one off
                      ours, which is the comparison made without a figure. */}
                  {grown ? (
                    <DollarFall
                      count={bar.accent ? 1 : 9}
                      delay={bar.accent ? 1900 : 700}
                    />
                  ) : null}
                </div>
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

        {/* No figure here, deliberately. The bars make the whole argument, and
            a price on this screen would be a GUESS: the amount actually charged
            depends on the customer's region and only the billing provider knows
            it. Saying $70 here and AU$110 at the sheet is a broken promise at
            the worst possible moment. The price appears once, at the paywall,
            from whatever is really going to charge the card.

            The words sit UNDER the bars for the same reason as the payoff
            screen: the graph is the argument, the sentence is the conclusion. */}
        <div className="mt-8 space-y-3 px-1 text-center">
          <h1 className={cn(FLOW_TITLE, "text-balance")}>
            The tracking is the cheap part.
          </h1>
          <p className="mx-auto max-w-[21rem] text-[0.9rem] leading-relaxed text-text-muted">
            Compounds, pins, bloods, supplements. It all adds up. This is the
            bit that doesn&apos;t.
          </p>
        </div>
      </div>
    </StepFrame>
  );
}


/* ===========================================================================
   E — Itemised, redacted, one real figure  (Adrian's synthesis)
   His note: compare what things cost WITHOUT showing an amount, framed "per
   year", with Trackd's real price at the bottom. The bars carry relative
   magnitude, so the comparison still lands; only the numbers are withheld.
   =========================================================================== */
const LINE_ITEMS = [
  { label: "Compounds", weight: 100 },
  { label: "Pins and supplies", weight: 38 },
  { label: "Bloodwork", weight: 62 },
  { label: "Supplements", weight: 74 },
];

export function CostVariantE({ onContinue }: { onContinue: () => void }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <StepFrame
      title="The tracking is the cheap part."
      sub="Everything above the line, you are already paying for."
      footer={<FlowCta onClick={onContinue}>See plans</FlowCta>}
    >
      <div className="flex flex-1 flex-col justify-center">
        <div className="flow-card rounded-2xl bg-bg-surface p-5">
          <p className={CARD_EYEBROW}>Per year</p>

          <ul className="mt-5 space-y-4">
            {LINE_ITEMS.map((item, i) => (
              <li key={item.label} className="space-y-2">
                <span className="block text-[0.85rem] text-text-muted">
                  {item.label}
                </span>
                {/* Length without a figure: the shape of the spend, none of the
                    detail. Nothing here claims what anyone pays. */}
                <span className="block h-2 w-full rounded-full bg-bg-base">
                  <span
                    className="block h-full rounded-full bg-bg-surface-raised transition-[width] duration-[640ms] ease-[var(--motion-ease)] motion-reduce:transition-none"
                    style={{
                      width: grown ? `${item.weight}%` : "0%",
                      transitionDelay: `${i * 90}ms`,
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-6 space-y-2 border-t-[0.5px] border-border-strong pt-5">
            <div className="flex items-baseline justify-between">
              <span className="text-[0.85rem] text-foreground">Trackd</span>
              <span className="font-mono text-lg font-light tabular-nums text-accent-amber">
                {formatPrice(YEARLY.price)}
              </span>
            </div>
            <span className="block h-2 w-full rounded-full bg-bg-base">
              <span
                className="block h-full rounded-full bg-accent-amber transition-[width] duration-[640ms] ease-[var(--motion-ease)] motion-reduce:transition-none"
                style={{ width: grown ? "4%" : "0%", transitionDelay: "400ms" }}
              />
            </span>
          </div>
        </div>
      </div>
    </StepFrame>
  );
}

/* ===========================================================================
   F — Two rows. D, with the price on it.
   Adrian picked D as the best of the first four and asked for the $70 to show.
   This is that: one redacted bar for what a protocol costs, one amber sliver
   for Trackd, both under "per year", and only Trackd carries a figure.
   =========================================================================== */
export function CostVariantF({ onContinue }: { onContinue: () => void }) {
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
        <div className="flow-card rounded-2xl bg-bg-surface p-5">
          <p className={CARD_EYEBROW}>Per year</p>

          <div className="mt-6 space-y-6">
            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[0.9rem] text-foreground">What you run</span>
                <span className={cn(DATA_MONO, "text-[11px]")}>your number</span>
              </div>
              <span className="block h-3 w-full rounded-full bg-bg-base">
                <span
                  className="block h-full rounded-full bg-bg-surface-raised transition-[width] duration-[760ms] ease-[var(--motion-ease)] motion-reduce:transition-none"
                  style={{ width: grown ? "100%" : "0%" }}
                />
              </span>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[0.9rem] text-foreground">Trackd</span>
                <span className="font-mono text-lg font-light tabular-nums text-accent-amber">
                  {formatPrice(YEARLY.price)}
                </span>
              </div>
              <span className="block h-3 w-full rounded-full bg-bg-base">
                <span
                  className="block h-full rounded-full bg-accent-amber transition-[width] duration-[760ms] ease-[var(--motion-ease)] motion-reduce:transition-none"
                  style={{ width: grown ? "5%" : "0%", transitionDelay: "220ms" }}
                />
              </span>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-[0.8rem] text-text-subtle">
          We are not going to guess what you spend. We know what we charge.
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
  { id: "E", name: "Itemised + redacted + one figure", Component: CostVariantE },
  { id: "F", name: "Two rows, D with the price on it", Component: CostVariantF },
] as const;
