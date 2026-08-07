"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { formatPrice, PLANS } from "@/lib/onboarding/pricing";
import { CARD_EYEBROW, DATA_MONO, FLOW_EMPHASIS, FLOW_TITLE } from "@/lib/ui-presets";
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
function DollarFall({
  count,
  delay,
  amber = false,
}: {
  count: number;
  delay: number;
  /** The Trackd bar's money is AMBER (Adrian, 2026-08-01), and there is barely
   *  any of it. Two amber glyphs against nine muted ones is the whole argument
   *  in colour. This is not a new meaning for amber: the glyphs belong to the
   *  amber bar they fall from, so the bar and its money are ONE beat, which is
   *  the screen's only one. */
  amber?: boolean;
}) {
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
          className={cn(
            "animate-dollar-fall absolute font-mono",
            amber ? "text-accent-amber" : "text-text-subtle",
          )}
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
                    // Slower again (Adrian, 2026-08-01: "go up a bit slow").
                    // The tall bar climbing IS the argument, and the money has
                    // to be falling off it while it climbs rather than after
                    // it lands, or the two read as separate events.
                    "transition-[height] ease-[var(--motion-ease)]",
                    "motion-reduce:transition-none",
                    bar.accent ? "bg-accent-amber" : "bg-bg-surface-raised",
                  )}
                  style={{
                    height: grown ? `${bar.height}%` : "0%",
                    // The expensive bar takes its time; the sliver has almost
                    // no distance to cover, so an equal duration made it look
                    // stalled.
                    transitionDuration: bar.accent ? "1100ms" : "2600ms",
                    transitionDelay: `${i * 260}ms`,
                  }}
                >
                  {/* The money leaving. Nine off the expensive one, TWO off
                      ours and in amber, which is the comparison made without a
                      figure. Ours falls last, once its bar has arrived. */}
                  {grown ? (
                    <DollarFall
                      count={bar.accent ? 2 : 9}
                      delay={bar.accent ? 2400 : 500}
                      amber={bar.accent}
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
            The tracking is{" "}
            {/* Same preset as the payoff headline. */}
            <em className={FLOW_EMPHASIS}>the cheap part</em>.
          </h1>
          {/* Wider than the payoff screen's equivalent (Adrian, 2026-08-01):
              at 21rem "up" wrapped onto a line of its own, which reads as a
              typo rather than a sentence. */}
          <p className="mx-auto max-w-[23.5rem] text-[0.9rem] leading-relaxed text-text-muted">
            Compounds, pins, bloods and supplements all add up. This is the bit
            that doesn&apos;t.
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

/* ===========================================================================
   G — The stack that builds. ADRIAN'S OWN IDEA (2026-08-05): "different levels
   ... compounds, needles, BAC water, etc, and the costs go up and up and it
   keeps unlocking the new tiers, and then Trackd is the smallest one."

   Built as a CUMULATIVE bar rather than four bars of different lengths, and
   that is the whole design decision. Four separate lengths would be a claim
   about which of these costs more than which — a fabricated statistic, which
   §14 bans outright and which we could not stand behind anyway. A stack that
   GROWS only claims that these things add up, which is true by construction and
   is the actual argument. Nothing carries a figure except Trackd.
   =========================================================================== */
/**
 * `masked` is A REDACTED AMOUNT — one dollar sign, then literal capital X's
 * standing in for digits (Adrian, 2026-08-05: "a dollar sign and then literal
 * capital Xs, so $1,000 a year").
 *
 * The first pass used repeated dollar signs, restaurant-style, and he was right
 * to reject it: `$$$$` is a rating, which invites the question "compared to
 * what", where `$X,XXX` is plainly a number we have covered up. It carries
 * MAGNITUDE by digit count — four X's reads as thousands — while stating no
 * figure at all, so nothing here is a claim about what anyone spends. §14 bans
 * fabricated statistics and this cannot become one.
 *
 * Trackd is the only row with an actual price on it, and that contrast is the
 * entire screen.
 */
/**
 * THE SHARES SUM TO 94, AND TRACKD'S 6 COMPLETES THE BAR (Adrian, 2026-08-05:
 * "make the little bar for Trackd go all the way to the end ... right now it's
 * a bit of a cutoff").
 *
 * They used to total 98, leaving a 2% gap of empty track at the right-hand end.
 * That gap was doing real damage to the argument: an unfilled bar reads as
 * "there is more to come", which is the opposite of a total. Filled exactly to
 * the end, the amber sliver is visibly the last and smallest part of a whole.
 *
 * Keep the sum at 100 if these are ever edited.
 */
/**
 * THE WIDTHS MUST SURVIVE DIVISION. Two cold reviews caught this screen in a
 * row (2026-08-05), and the second one is the reason these numbers look odd.
 *
 * Round one: compounds labelled `$X,XXX` drawn at 34%, BAC water labelled `$XX`
 * drawn at 12% — the picture said BAC water was a third of a compound spend
 * while the text said a hundredth. Fixed by making the shares MONOTONIC.
 *
 * Round two found monotonic was not enough, and it is right. Trackd's segment
 * sits on the SAME TRACK carrying the screen's one real figure, `$69.99`. That
 * supplies a SCALE, and a scale can be divided. At the round-one numbers
 * (Trackd 6%) the implied total was $1,166, which made compounds $676 — three
 * digits, under a label promising four.
 *
 * So the shares are now solved against the real price rather than eyeballed.
 * With Trackd at 2.3%, the implied total is 69.99 / 0.023 ≈ $3,043:
 *
 *   Compounds          70%   -> ~$2,130   four digits  ✓ $X,XXX
 *   Bloodwork          24%   -> ~$730     three digits ✓ $XXX
 *   Pins and supplies   2%   -> ~$61      two digits   ✓ $XX
 *   BAC water          1.7%  -> ~$52      two digits   ✓ $XX
 *   Trackd             2.3%  -> $69.99    the real one
 *
 * Every row now divides to a figure with the number of digits its label claims,
 * so there is no reading of this bar that contradicts its own text. §14 bans
 * fabricated statistics, and a diagram that implies a number nobody could stand
 * behind is one.
 *
 * THE SMALL SEGMENTS ARE MEANT TO BE SLIVERS. Pins, water and Trackd are thin
 * because they genuinely are, and that IS the argument the screen is making.
 * Fattening them for legibility is exactly the fudge that produced round one.
 *
 * Keep the sum at 100, and re-solve these against `PLANS.yearly.price` if the
 * price ever moves.
 */
const TIERS = [
  { label: "Compounds", share: 70, masked: "$X,XXX" },
  { label: "Bloodwork", share: 20, masked: "$XXX" },
  { label: "Supplements", share: 5, masked: "$XXX" },
  { label: "Pins and supplies", share: 2.7, masked: "$XX" },
];
/** What is left of the track once the tiers have taken their share. */
const TRACKD_SHARE = 100 - TIERS.reduce((sum, t) => sum + t.share, 0);

/** How long each tier waits before it lands. The build IS the point. */
const TIER_STAGGER_MS = 520;

export function CostVariantG({ onContinue }: { onContinue: () => void }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= TIERS.length + 1) return;
    const id = setTimeout(() => setShown((n) => n + 1), TIER_STAGGER_MS);
    return () => clearTimeout(id);
  }, [shown]);

  const trackdShown = shown > TIERS.length;

  return (
    <StepFrame
      footer={<FlowCta onClick={onContinue}>See plans</FlowCta>}
    >
      {/* THE CARD FILLS THE SCREEN (Adrian, 2026-08-05) and the type sits lower
          than the flow's default rhythm, so the headline is not hard against
          the header row. `flex-1` on the card rather than a fixed height: it
          takes whatever the scroll port has on any phone. */}
      <div className="flex flex-1 flex-col pt-8">
        <header className="shrink-0 space-y-3.5">
          <h1 className={cn(FLOW_TITLE, "text-balance")}>
            The tracking is the{" "}
            {/* Bold AND italic, and WHITE (Adrian, 2026-08-05 — he had it amber
                for one round and killed it). White is right: the amber on this
                screen is the price, which is the thing being pointed at, and
                two amber beats compete. Emphasis by weight and slant instead. */}
            <em className="font-semibold italic text-text-primary">cheap part</em>.
          </h1>
          <p className="text-[0.95rem] leading-relaxed text-text-muted">
            It all adds up. This is the bit that doesn&apos;t.
          </p>
        </header>

        <div className="mt-8 flex flex-1 flex-col rounded-2xl bg-bg-surface p-6">
          <p className={CARD_EYEBROW}>Per year</p>

          {/* The accumulating bar. One track, four segments arriving in turn.
              Taller than it was (h-4), because at h-3 the segment divisions had
              nowhere to read. */}
          <div className="mt-5 flex h-4 w-full overflow-hidden rounded-full bg-bg-base">
            {TIERS.map((tier, i) => (
              <span
                key={tier.label}
                /* LIGHTER GREY, MORE PRONOUNCED DIVISIONS (Adrian,
                   2026-08-05). `--bg-surface-raised` sat only a few points off
                   the track behind it, so four segments read as one grey smear
                   and the hairline between them was invisible. Mixed from
                   `--text-primary` instead, which lifts it clear of both the
                   track and the card, and the divider is 2px of the CARD colour
                   so it reads as a real gap rather than a drawn line. */
                className="block h-full transition-[width] duration-[480ms] ease-[var(--motion-ease)] motion-reduce:transition-none"
                style={{
                  width: i < shown ? `${tier.share}%` : "0%",
                  background:
                    "color-mix(in srgb, var(--text-primary) 22%, var(--bg-surface-raised))",
                  borderRight:
                    i < shown && i < TIERS.length - 1
                      ? "2px solid var(--bg-surface)"
                      : "none",
                }}
              />
            ))}
            {/* Trackd's share, last and smallest, and it FINISHES the track —
                the shares are chosen to total exactly 100. A 2px gap before it
                so it reads as its own thing rather than as more of the grey. */}
            <span
              className="block h-full bg-accent-amber transition-[width] duration-[480ms] ease-[var(--motion-ease)] motion-reduce:transition-none"
              style={{
                width: trackdShown ? `${TRACKD_SHARE}%` : "0%",
                borderLeft: trackdShown ? "2px solid var(--bg-surface)" : "none",
              }}
            />
          </div>

          {/* `flex-1` + `justify-center` so the rows use the height the card
              gained by filling the screen, rather than bunching at the top.
              `gap-6` between rows and a wider gap before the Trackd rule: the
              masked figures are the thing being compared, so they need air
              around them more than the labels do. */}
          <ul className="flex flex-1 flex-col justify-center gap-6 py-4">
            {TIERS.map((tier, i) => (
              <li
                key={tier.label}
                className={cn(
                  "flex items-baseline justify-between gap-6 transition-opacity duration-[420ms] motion-reduce:transition-none",
                  i < shown ? "opacity-100" : "opacity-0",
                )}
              >
                <span className="min-w-0 text-[0.95rem] text-text-muted">
                  {tier.label}
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5">
                  {/* Tabular figures so the X's in every row sit on the same
                      grid and the column reads as one set of amounts. */}
                  <span
                    className={cn(
                      DATA_MONO,
                      "text-[1.05rem] tabular-nums tracking-[0.06em] text-foreground",
                    )}
                  >
                    {tier.masked}
                  </span>
                  <span className="text-[11px] text-text-subtle">/yr</span>
                </span>
              </li>
            ))}

            {/* Trackd, on the same rail so the comparison is like for like:
                same column, same units, and the only uncovered figure. */}
            <li
              className={cn(
                "mt-2 flex items-baseline justify-between gap-6 border-t-[0.5px] border-border-strong pt-6 transition-opacity duration-[420ms] motion-reduce:transition-none",
                trackdShown ? "opacity-100" : "opacity-0",
              )}
            >
              <span className="text-[0.95rem] text-foreground">Trackd</span>
              <span className="flex shrink-0 items-baseline gap-1.5">
                <span
                  className={cn(
                    DATA_MONO,
                    "text-[1.05rem] tabular-nums tracking-[0.06em] text-accent-amber",
                  )}
                >
                  {formatPrice(YEARLY.price)}
                </span>
                <span className="text-[11px] text-text-subtle">/yr</span>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </StepFrame>
  );
}

/* ===========================================================================
   H — No diagram at all.
   The line is the argument and it does not need illustrating. Every other
   variant spends most of the screen drawing a picture of a sentence that
   already lands; this one gives the sentence the room instead. It is also the
   only variant that cannot go stale, cannot imply a statistic, and cannot be
   misread — there is nothing on it to misread.
   =========================================================================== */
export function CostVariantH({ onContinue }: { onContinue: () => void }) {
  return (
    <StepFrame center footer={<FlowCta onClick={onContinue}>See plans</FlowCta>}>
      <div className="space-y-9 text-center">
        <p className={cn(FLOW_TITLE, "text-[2.5rem] leading-[1.08]")}>
          The tracking is the{" "}
          <span className={FLOW_EMPHASIS}>cheap part</span>.
        </p>

        {/* Three words, not a list of features: this screen is about money, and
            naming what you already buy is the whole argument. */}
        <p className="mx-auto max-w-[17rem] text-[0.95rem] leading-relaxed text-text-muted">
          Compounds. Pins. Bloodwork. You are already paying for all of it.
        </p>

        <p className={cn(DATA_MONO, "text-sm uppercase tracking-[0.08em]")}>
          Trackd · {formatPrice(YEARLY.price)} / year
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
  { id: "G", name: "The stack that builds — SHIPPING NOW", Component: CostVariantG },
  { id: "H", name: "No diagram, type only", Component: CostVariantH },
] as const;
