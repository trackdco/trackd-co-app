"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CaretLeft, CaretRight } from "@/components/icons";
import { TESTIMONIALS, nearestIndex } from "@/lib/landing/testimonials";
import { cn } from "@/lib/utils";

/**
 * THE TESTIMONIAL CAROUSEL (spec 3-03 §3.3), after Pep AI's.
 *
 * A native horizontal scroller with snap points, so a thumb swipes it and a
 * trackpad scrolls it with no gesture code at all. Cards snap to the CENTRE and
 * the dots sit centred under them (Adrian, 2026-09-17: "I want the reviews to
 * be in the middle"); on a laptop two arrows flank the dots, because a mouse
 * has no swipe.
 *
 * Centring needs room either side of the first and last card, so the track's
 * side padding is half the screen less half a card (`.lp-snap-center`).
 *
 * ⚠️ THE QUOTES ARE PLACEHOLDERS. See `lib/landing/testimonials.ts`, which also
 * holds the guard that keeps them off the production deployment.
 *
 * The stars are WHITE, not amber: amber on this page is kept for the call to
 * action, the drawn underline and the FAQ vials, and a row of gold stars per
 * card would be four more beats of it.
 */
export function Testimonials() {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const offsets = useCallback(() => {
    const el = scroller.current;
    if (!el) return [];
    // The cards only: the trailing spacer is a child too, and counting it
    // made the end of the track a fifth "card" with no dot to light.
    const cards = Array.from(el.querySelectorAll<HTMLElement>(":scope > figure"));
    const base = cards[0]?.offsetLeft ?? 0;
    return cards.map((c) => c.offsetLeft - base);
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setActive(nearestIndex(el.scrollLeft, offsets(), el.scrollWidth - el.clientWidth));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [offsets]);

  const go = (i: number) => {
    const el = scroller.current;
    if (!el) return;
    const target = Math.max(0, Math.min(TESTIMONIALS.length - 1, i));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: offsets()[target] ?? 0, behavior: reduce ? "auto" : "smooth" });
  };

  const atEnd = active === TESTIMONIALS.length - 1;

  return (
    <div>
      <div
        ref={scroller}
        role="region"
        aria-roledescription="carousel"
        aria-label="What people say"
        tabIndex={0}
        className={cn(
          "lp-snap lp-snap-center flex gap-4 overflow-x-auto pb-6 pt-2",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        )}
      >
        {TESTIMONIALS.map((t, i) => (
          <figure
            key={t.name}
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${TESTIMONIALS.length}`}
            className="lp-panel flex w-[var(--lp-card)] shrink-0 snap-center flex-col rounded-3xl p-6"
          >
            {/* ⚠️ NO VERIFIED TICK AND NO STAR RATING. NOT AN OMISSION.
                An alias over a real customer's opinion is anonymity, which is
                ordinary and is Adrian's call to make. A tick whose aria-label
                reads "Verified" claims a checking step that does not exist, and
                five filled stars claim a score nobody gave: those are claims
                about our process rather than about what a customer thinks, and
                they are what a regulator would actually pick at. Adrian settled
                it on 2026-09-19: the quotes go live, these two stay off. Bring
                them back only if a real verification step and a real rating
                ever exist. Both are in git. */}
            <figcaption className="flex items-center gap-3">
              <Avatar initials={t.initials} index={i} />
              <span className="min-w-0 text-[0.95rem] text-foreground">{t.name}</span>
            </figcaption>
            <blockquote className="mt-5 text-[1.02rem] font-light leading-relaxed text-foreground">
              {t.quote}
            </blockquote>
          </figure>
        ))}
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
          <ArrowButton label="Next review" disabled={atEnd} onClick={() => go(active + 1)}>
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
 *  rather than four copies. TODO(3-03): real photos replace these. */
const AVATAR_TONES = [
  ["var(--palette-steel)", "var(--palette-slate)"],
  ["var(--palette-clay)", "var(--palette-rosewood)"],
  ["var(--palette-moss)", "var(--palette-teal)"],
  ["var(--palette-plum)", "var(--palette-indigo)"],
] as const;

function Avatar({ initials, index }: { initials: string; index: number }) {
  const [a, b] = AVATAR_TONES[index % AVATAR_TONES.length];
  return (
    <span
      aria-hidden
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[0.8rem] font-medium tracking-wide text-foreground ring-1 ring-text-primary/10"
      style={{ backgroundImage: `linear-gradient(145deg, ${a}, ${b})` }}
    >
      {initials}
    </span>
  );
}

