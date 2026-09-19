"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CaretLeft, CaretRight } from "@/components/icons";
import { TESTIMONIALS } from "@/lib/landing/testimonials";
import { cn } from "@/lib/utils";

/**
 * THE TESTIMONIAL CAROUSEL (spec 3-03 §3.3).
 *
 * COVERFLOW: the active card faces you in the centre, the ones either side are
 * turned away, tucked behind and dimmed (Adrian, 2026-09-19, chosen over a
 * centre-stage peek, a single card with arrows, and a stacked deck). It
 * replaced a native snap-scroller, which could centre a card but only ever
 * left-aligned the track, so the section never looked centred at rest.
 *
 * ## ⚠️ THE CARDS ARE STACKED IN ONE GRID CELL, NOT ABSOLUTELY POSITIONED
 *
 * Every card sits in the same `grid-area`, so the grid row is as tall as the
 * TALLEST card while each card keeps ITS OWN height. That is the whole point:
 * Adrian chose natural heights over a uniform one, because a short quote in a
 * card sized for the longest reads half empty. Absolute positioning would have
 * collapsed the stage to nothing and needed the height measured in JS, which
 * then has to be re-measured on every font load and resize. Do not "simplify"
 * this to `position: absolute`.
 *
 * Depth is `translateX` + `rotateY` + `scale`, so nothing reflows while it
 * moves and the browser can keep it on the compositor.
 *
 * ## Reaching it without a mouse
 *
 * The region takes focus and answers the arrow keys, the dots below jump
 * straight to a card, and on a laptop two arrows flank the dots. A swipe is
 * handled by pointer events rather than native scrolling, which is the cost of
 * leaving the scroller behind. Cards that are not the active one are
 * `pointer-events: none`, so a swipe always lands on the stage and never on a
 * card that happens to be underneath the finger.
 *
 * ⚠️ THE QUOTES ARE PLACEHOLDERS, and `lib/landing/testimonials.ts` holds the
 * guard that keeps them off production. No verified tick and no star rating:
 * the same file says why.
 */
export function Testimonials() {
  const [active, setActive] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const last = TESTIMONIALS.length - 1;

  const go = useCallback(
    (i: number) => setActive(Math.max(0, Math.min(last, i))),
    [last],
  );

  // A swipe on the stage. Horizontal only: a vertical drag is the page
  // scrolling and must not be stolen.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    let from: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      from = { x: e.clientX, y: e.clientY };
    };
    const up = (e: PointerEvent) => {
      if (!from) return;
      const dx = e.clientX - from.x;
      const dy = e.clientY - from.y;
      from = null;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
      setActive((i) => Math.max(0, Math.min(TESTIMONIALS.length - 1, i + (dx < 0 ? 1 : -1))));
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", () => { from = null; });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
    };
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    go(active + step);
  };

  return (
    <div>
      <div
        ref={stage}
        role="region"
        aria-roledescription="carousel"
        aria-label="What people say"
        tabIndex={0}
        onKeyDown={onKey}
        className={cn(
          "lp-flow grid touch-pan-y place-items-center px-4 pb-8 pt-2",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        )}
      >
        {TESTIMONIALS.map((t, i) => {
          const d = i - active;
          const away = Math.abs(d);
          return (
            <figure
              key={t.name}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${TESTIMONIALS.length}`}
              data-on={d === 0 ? "" : undefined}
              className="lp-flow-card lp-panel flex w-[min(74vw,20rem)] flex-col rounded-3xl p-6 lg:w-[25rem]"
              style={{
                // ⚠️ THESE NUMBERS ARE BOUNDED BY THE SCREEN EDGE, not by taste.
                // A neighbour sits translateX across plus its own half width,
                // shrunk by the scale and again by the rotation. Push the
                // offset past about a quarter and that edge lands outside a
                // 390px phone, and the card is guillotined mid-word, which
                // reads as a bug rather than as depth. The stage also clips, so
                // the far cards cannot spill into the section either way.
                transform: `translateX(${d * 24}%) rotateY(${-d * 42}deg) scale(${1 - away * 0.14})`,
                opacity: away > 2 ? 0 : 1 - away * 0.5,
                zIndex: 10 - away,
              }}
            >
              <figcaption className="flex items-center gap-3">
                <Avatar index={i} />
                <span className="min-w-0 text-[0.95rem] text-foreground">{t.name}</span>
              </figcaption>
              <blockquote className="mt-5 text-[1.02rem] font-light leading-relaxed text-foreground">
                {t.quote}
              </blockquote>
            </figure>
          );
        })}
      </div>

      <div className="lp-wide flex items-center justify-center gap-4">
        <span className="hidden md:block">
          <ArrowButton label="Previous review" disabled={active === 0} onClick={() => go(active - 1)}>
            <CaretLeft className="h-4 w-4" />
          </ArrowButton>
        </span>
        <div className="flex items-center gap-1.5">
          {TESTIMONIALS.map((t, i) => (
            <button
              key={t.name}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show review ${i + 1}`}
              aria-current={i === active ? "true" : undefined}
              className="group flex h-6 items-center focus-visible:outline-none"
            >
              <span
                className={cn(
                  "block h-1.5 rounded-full transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)] group-focus-visible:ring-2 group-focus-visible:ring-ring motion-reduce:transition-none",
                  i === active ? "w-6 bg-foreground" : "w-1.5 bg-border-strong",
                )}
              />
            </button>
          ))}
        </div>
        <span className="hidden md:block">
          <ArrowButton label="Next review" disabled={active === last} onClick={() => go(active + 1)}>
            <CaretRight className="h-4 w-4" />
          </ArrowButton>
        </span>
      </div>
    </div>
  );
}

function ArrowButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="lp-float flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35 motion-reduce:transition-none"
    >
      {children}
    </button>
  );
}

/** Two tones per avatar from the user palette, so four cards are four people
 *  rather than four copies. */
const AVATAR_TONES = [
  ["var(--palette-steel)", "var(--palette-slate)"],
  ["var(--palette-clay)", "var(--palette-rosewood)"],
  ["var(--palette-moss)", "var(--palette-teal)"],
  ["var(--palette-plum)", "var(--palette-indigo)"],
] as const;

/**
 * A DRAWN FIGURE, NOT INITIALS AND NOT A PHOTOGRAPH (Adrian, 2026-09-19).
 *
 * He asked for photographs so the cards would stop looking anonymous, and
 * settled on this instead. The reasoning is worth keeping, because the request
 * will come back: an ALIAS hides a real person who really said this, which is
 * ordinary. A FACE asserts a person, and a stock or generated face asserts one
 * who does not exist, which is the single most effective way to make a review
 * read as real. A drawn figure is warmer than two letters and cannot be
 * mistaken for a photograph of anybody.
 *
 * If the three ever send their own photographs, this is the component to
 * replace, and nothing else has to move.
 */
function Avatar({ index }: { index: number }) {
  const [a, b] = AVATAR_TONES[index % AVATAR_TONES.length];
  return (
    <span
      aria-hidden
      className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-text-primary/10"
      style={{ backgroundImage: `linear-gradient(145deg, ${a}, ${b})` }}
    >
      <svg viewBox="0 0 40 40" className="h-full w-full">
        <circle cx="20" cy="15.5" r="6.2" className="fill-text-primary/55" />
        <path d="M6.6 40c0-8.2 6-13.2 13.4-13.2S33.4 31.8 33.4 40z" className="fill-text-primary/55" />
      </svg>
    </span>
  );
}
