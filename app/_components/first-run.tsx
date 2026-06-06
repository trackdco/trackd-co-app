"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * First Run — app-style onboarding (mobile). Reads as professionally crafted:
 *  - each feature slide shows a true product mini-mock, not a stock icon
 *  - a segmented progress bar that fills (gold) with the swipe
 *  - scroll-coupled parallax + auto-advance tour (both respect reduced motion,
 *    autoplay stops the moment the user takes control)
 *  - restrained gold accents on every slide for a premium feel
 *
 * PLACEHOLDER NOTE: the mini-mocks below are stand-ins. When the real in-app UI
 * is designed, swap these to match the actual screens so onboarding mirrors the
 * product 1:1. Copy stays in the founders' plain voice; the whole flow funnels
 * to one action — create an account.
 */
type Slide = {
  eyebrow: string;
  title: string;
  heading: React.ReactNode;
  body: string;
  visual?: React.ReactNode;
};

const SLIDES: Slide[] = [
  {
    eyebrow: "Private beta",
    title: "Track the whole protocol",
    heading: (
      <>
        Track the whole <em className="font-medium italic">protocol</em>
      </>
    ),
    body: "Everything you're running, in one place.",
  },
  {
    eyebrow: "Your stack",
    title: "Your whole stack, together",
    heading: <>Your whole stack, together</>,
    body: "Gear, peptides, supps, ancillaries. Stop scattering it across notes and spreadsheets.",
    visual: <StackMock />,
  },
  {
    eyebrow: "Site rotation",
    title: "Rotate every site right",
    heading: <>Rotate every site right</>,
    body: "See where your last shots landed and what's due, so each site recovers.",
    visual: <SiteMapMock />,
  },
  {
    eyebrow: "Inventory",
    title: "Never guess what's left",
    heading: <>Never guess what&apos;s left</>,
    body: "Log a dose and it works out what's left and when you'll run dry.",
    visual: <InventoryMock />,
  },
];

const AUTOPLAY_MS = 3500;

export function FirstRun() {
  const trackRef = useRef<HTMLDivElement>(null);
  const contentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const segRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const ticking = useRef(false);
  const reduced = useRef(false);
  const autoplayOff = useRef(false);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);

  const update = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const w = el.clientWidth || 1;
    const p = el.scrollLeft / w;

    const idx = Math.round(p);
    if (idx !== activeRef.current) {
      activeRef.current = idx;
      setActive(idx);
    }

    for (let i = 0; i < segRefs.current.length; i++) {
      const seg = segRefs.current[i];
      if (seg) seg.style.transform = `scaleX(${Math.max(0, Math.min(1, p - i + 1))})`;
    }

    if (!reduced.current) {
      for (let i = 0; i < contentRefs.current.length; i++) {
        const node = contentRefs.current[i];
        if (!node) continue;
        const d = i - p;
        const ad = Math.min(Math.abs(d), 1);
        node.style.transform = `translate3d(${(d * 16).toFixed(2)}px,0,0) scale(${(1 - ad * 0.05).toFixed(3)})`;
        node.style.opacity = (1 - ad * 0.55).toFixed(3);
      }
    }
  }, []);

  const onScroll = useCallback(() => {
    if (ticking.current) return;
    ticking.current = true;
    requestAnimationFrame(() => {
      update();
      ticking.current = false;
    });
  }, [update]);

  // Drive the scroll frame-by-frame (direct scrollLeft writes). Reliable on iOS
  // Safari, where programmatic scrollTo({behavior:"smooth"}) fights scroll-snap.
  const animateTo = useCallback((i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const startLeft = el.scrollLeft;
    const dist = i * el.clientWidth - startLeft;
    if (Math.abs(dist) < 1) return;
    const duration = 600;
    let startTs = 0;
    const step = (ts: number) => {
      if (!startTs) startTs = ts;
      const t = Math.min(1, (ts - startTs) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      el.scrollLeft = startLeft + dist * eased;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, []);

  // User tapping a segment takes control → stop the auto tour.
  const goTo = useCallback(
    (i: number) => {
      autoplayOff.current = true;
      animateTo(i);
    },
    [animateTo],
  );

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    update();
    const onResize = () => update();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [update]);

  // Auto-advance tour: ping-pong through the slides, stop on first interaction.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = trackRef.current;
    const stop = () => {
      autoplayOff.current = true;
    };
    el?.addEventListener("pointerdown", stop);
    let dir = 1;
    const id = setInterval(() => {
      if (autoplayOff.current) {
        clearInterval(id);
        return;
      }
      let next = activeRef.current + dir;
      if (next >= SLIDES.length) {
        dir = -1;
        next = activeRef.current + dir;
      } else if (next < 0) {
        dir = 1;
        next = activeRef.current + dir;
      }
      animateTo(next);
    }, AUTOPLAY_MS);
    return () => {
      clearInterval(id);
      el?.removeEventListener("pointerdown", stop);
    };
  }, [animateTo]);

  return (
    <div
      className="relative isolate flex h-dvh flex-col overflow-hidden bg-background duration-500 animate-in fade-in"
      style={{
        paddingTop: "max(1.25rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.25rem, calc(0.5rem + env(safe-area-inset-bottom)))",
      }}
    >
      <h1 className="sr-only">Trackd Co — Track the whole protocol</h1>

      {/* Top bar */}
      <div className="flex items-center justify-between px-6">
        <span className="font-display text-lg font-medium tracking-[-0.01em] text-foreground">
          trackd<span className="text-text-muted"> co</span>
        </span>
        <Link
          href="/login"
          className="-mr-2 px-2 py-2 text-sm text-text-muted transition-transform duration-100 hover:text-foreground active:scale-95"
        >
          Skip
        </Link>
      </div>

      {/* Swipeable slides */}
      <div
        ref={trackRef}
        onScroll={onScroll}
        aria-roledescription="carousel"
        className="flex flex-1 snap-x snap-mandatory touch-pan-x overflow-x-auto overflow-y-hidden overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SLIDES.map((slide, i) => (
          <section
            key={slide.title}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${SLIDES.length}`}
            className="flex h-full w-full shrink-0 snap-center flex-col items-center justify-center px-8 text-center"
          >
            <div
              ref={(node) => {
                contentRefs.current[i] = node;
              }}
              className="flex flex-col items-center will-change-transform"
            >
              {slide.visual ? <div className="mb-9">{slide.visual}</div> : null}
              <p className="mb-3 inline-flex items-center gap-1.5 text-[0.7rem] uppercase tracking-[0.22em] text-text-muted">
                <span className="size-1 rounded-full bg-accent-amber" aria-hidden="true" />
                {slide.eyebrow}
              </p>
              <h2 className="text-balance font-display text-[2.25rem] font-medium leading-[1.03] tracking-[-0.02em] text-foreground">
                {slide.heading}
              </h2>
              <p className="mt-4 max-w-[17rem] text-pretty text-[0.95rem] leading-relaxed text-text-muted">
                {slide.body}
              </p>
            </div>
          </section>
        ))}
      </div>

      {/* Segmented progress (fills gold) */}
      <div className="flex justify-center gap-1.5 px-10 pt-7">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.title}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            className="-my-2 max-w-12 flex-1 py-2"
          >
            <span className="block h-[3px] w-full overflow-hidden rounded-full bg-text-subtle/40">
              <span
                ref={(node) => {
                  segRefs.current[i] = node;
                }}
                className="block h-full w-full origin-left rounded-full bg-accent-amber"
                style={{ transform: "scaleX(0)" }}
              />
            </span>
          </button>
        ))}
      </div>

      <div aria-live="polite" className="sr-only">
        {SLIDES[active].title}
      </div>

      {/* Sign in */}
      <div className="mt-7 border-t border-border/60 px-6 pt-6 text-center">
        <p className="mb-4 text-xs text-text-subtle">Built by people who run real protocols.</p>
        <Button
          asChild
          size="lg"
          className="h-12 w-full touch-manipulation select-none rounded-xl text-[0.95rem] transition-transform duration-100 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] motion-reduce:active:scale-100"
        >
          <Link href="/login">
            <GoogleMark />
            Continue with Google
          </Link>
        </Button>
        <p className="mt-3 text-[0.7rem] text-text-subtle">
          Free while it&apos;s in beta · 18+ ·{" "}
          <Link href="/terms" className="transition-colors hover:text-text-muted">
            Terms
          </Link>
        </p>
        <p className="mt-3 text-sm text-text-muted">
          Already have an account?{" "}
          <Link
            href="/login"
            className="inline-block text-foreground transition-transform duration-100 hover:text-text-muted active:scale-95"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

/* ---------- product mini-mocks (placeholders — match to real app UI later) ---------- */

function StackMock() {
  const rows = [
    { name: "Testosterone E", dose: "250mg · 2×/wk", tag: "Gear", due: true },
    { name: "Retatrutide", dose: "4mg · 1×/wk", tag: "Peptide", due: false },
    { name: "Aromasin", dose: "12.5mg · EOD", tag: "Ancillary", due: false },
    { name: "Vitamin D3", dose: "5000iu · daily", tag: "Supp", due: false },
  ];
  return (
    <div className="w-[17rem] rounded-2xl border border-border bg-card p-2.5 text-left">
      {rows.map((row, i) => (
        <div
          key={row.name}
          className={`flex items-center gap-3 rounded-xl bg-bg-surface-raised px-3 py-2.5 ${
            i < rows.length - 1 ? "mb-1.5" : ""
          }`}
        >
          <span
            className={`size-1.5 shrink-0 rounded-full ${row.due ? "bg-accent-amber" : "bg-text-subtle/40"}`}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] leading-none text-foreground">{row.name}</p>
            <p className="mt-1.5 text-[11px] text-text-muted">{row.dose}</p>
          </div>
          <span className="rounded-full border border-border-strong px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
            {row.tag}
          </span>
        </div>
      ))}
    </div>
  );
}

function InventoryMock() {
  return (
    <div className="w-[17rem] rounded-2xl border border-border bg-card p-4 text-left">
      <p className="text-[11px] uppercase tracking-wide text-text-muted">Testosterone E · 10mL vial</p>
      <p className="mt-2 font-display text-3xl text-foreground">
        6.4<span className="ml-1.5 font-sans text-base text-text-muted">mL left</span>
      </p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-bg-input">
        <div className="h-full rounded-full bg-text-muted" style={{ width: "64%" }} />
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[12px] text-text-muted">
        <CalendarDays className="size-3.5 text-accent-amber" strokeWidth={1.5} />
        Runs dry ~ 18 Jul
      </div>
    </div>
  );
}

function SiteMapMock() {
  const sites = [
    { label: "L delt", due: true },
    { label: "R delt", due: false },
    { label: "L glute", due: false },
    { label: "R glute", due: false },
    { label: "L quad", due: false },
    { label: "R quad", due: false },
  ];
  return (
    <div className="w-[17rem] rounded-2xl border border-border bg-card p-4 text-left">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-text-muted">Site rotation</p>
        <p className="text-[11px] text-text-subtle">auto-rotates</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {sites.map((site) => (
          <div
            key={site.label}
            className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 ${
              site.due ? "border-accent-amber/40 bg-accent-amber/5" : "border-border-strong/60"
            }`}
          >
            <span className="relative flex size-2.5 items-center justify-center">
              {site.due ? (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent-amber/60" />
              ) : null}
              <span
                className={`relative inline-flex size-2.5 rounded-full ${
                  site.due ? "bg-accent-amber" : "bg-text-subtle"
                }`}
              />
            </span>
            <span className={`text-[10px] ${site.due ? "text-accent-amber" : "text-text-muted"}`}>
              {site.label}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-accent-amber">Due now · L delt · 9 days rested</p>
    </div>
  );
}

/**
 * Official Google "G" mark — four brand colours mandated by Google, the one
 * allowed exception to the no-hardcoded-colour rule (third-party logo).
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
