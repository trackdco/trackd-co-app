"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Calculator, Layers, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

type Slide = {
  heading: string;
  body: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  signature?: boolean;
};

/**
 * Copy is written to move someone from curiosity → account, applying a few
 * persuasion levers in the founders' plain voice (not hype):
 *  - presupposition: "Everything you're running", "Your whole stack"
 *  - loss aversion: "Stop scattering…", "Never guess what's left", "run dry"
 *  - future pacing: "one place you'll actually open", "Log a dose and it…"
 *  - open loop / curiosity: the swipe itself + each heading teasing the next
 *  - authority / in-group: "Built by people who run real protocols"
 *  - scarcity: "Free while it's in beta"
 */
const SLIDES: Slide[] = [
  {
    heading: "Track the whole protocol",
    body: "Everything you're running — in one place you'll actually open.",
  },
  {
    heading: "Your whole stack, together",
    body: "Gear, peptides, supps, ancillaries. Stop scattering it across notes and spreadsheets.",
    icon: Layers,
  },
  {
    heading: "Never guess what's left",
    body: "Log a dose and it works out what's left and when you'll run dry — instantly.",
    icon: Calculator,
  },
  {
    heading: "Rotate every site right",
    body: "See where your last shots landed and what's due, so each site gets time to recover.",
    icon: RotateCcw,
    signature: true,
  },
];

export function FirstRun() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function handleScroll() {
    const el = trackRef.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }

  function goTo(index: number) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div
      className="flex h-dvh flex-col px-6 pt-6"
      style={{ paddingBottom: "max(1.5rem, calc(0.75rem + env(safe-area-inset-bottom)))" }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <span className="font-display text-xl tracking-tight text-foreground">trackd co</span>
        <Link href="/login" className="text-sm text-text-muted transition-colors hover:text-foreground">
          Skip
        </Link>
      </div>

      {/* Swipeable slides */}
      <div
        ref={trackRef}
        onScroll={handleScroll}
        aria-roledescription="carousel"
        className="-mx-6 flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SLIDES.map((slide) => {
          const Icon = slide.icon;
          return (
            <section
              key={slide.heading}
              className="flex w-full shrink-0 snap-center flex-col items-center justify-center px-10 text-center"
            >
              {Icon ? (
                <Icon
                  className={`mb-8 size-10 ${slide.signature ? "text-accent-amber" : "text-text-muted"}`}
                  strokeWidth={1.5}
                />
              ) : null}
              <h1 className="font-display text-4xl leading-[1.05] text-foreground">{slide.heading}</h1>
              <p className="mt-5 max-w-xs text-base leading-relaxed text-text-muted">{slide.body}</p>
            </section>
          );
        })}
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-2 pt-6">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.heading}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`size-1.5 rounded-full transition-colors ${
              i === active ? "bg-accent-amber" : "bg-text-subtle"
            }`}
          />
        ))}
      </div>

      {/* Sign in */}
      <div className="pt-8 text-center">
        <p className="mb-4 text-xs text-text-subtle">Built by people who run real protocols.</p>
        <Button asChild size="lg" className="w-full">
          <Link href="/login">
            <GoogleMark />
            Continue with Google
          </Link>
        </Button>
        <p className="mt-3 text-xs text-text-subtle">
          Free while it&apos;s in beta · 18+ ·{" "}
          <Link href="/terms" className="transition-colors hover:text-text-muted">
            Terms
          </Link>
        </p>
        <p className="mt-3 text-sm text-text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-foreground transition-colors hover:text-text-muted">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

/**
 * Official Google "G" mark — the four brand colours are mandated by Google and
 * can't be tokenised (third-party logo, the one allowed colour exception).
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
