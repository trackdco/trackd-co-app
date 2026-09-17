"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

import { useInView } from "./use-in-view";

/**
 * KYLE, FLEXING, WITH THE APP FLOATING AROUND HIM (spec 3-03 §3.5).
 *
 * ⚠️ Kyle is a VIAL. That is settled and is not to be re-raised.
 *
 * He rises in when the section arrives and flexes once. The chips around him
 * are small pieces of the app rather than labels, which is what Adrian's
 * sketch draws (a chart, a little site map, a calculator), and they drift
 * slowly. Decorative throughout: `aria-hidden`, `pointer-events-none`, and all
 * of it collapses under reduced motion.
 *
 * Six chips on a laptop, four on a phone, where six crowded him.
 */
export function KyleCloser() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { threshold: 0.3 });
  const shown = inView ? "" : undefined;

  return (
    <div ref={ref} aria-hidden className="relative mx-auto h-[22rem] w-full max-w-[40rem] md:h-[30rem]">
      {/* The pool of light he stands in. */}
      <div
        className="absolute left-1/2 top-1/2 h-[20rem] w-[20rem] -translate-x-1/2 -translate-y-1/2 rounded-full md:h-[28rem] md:w-[28rem]"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--accent-amber) 20%, transparent) 0%, transparent 65%)",
        }}
      />

      <div
        data-in={shown}
        className="lp-reveal absolute left-1/2 top-1/2 w-[13.5rem] -translate-x-1/2 -translate-y-1/2 md:w-[19rem]"
      >
        <div data-in={shown} className="lp-kyle">
          <Image
            src="/onboarding/kyle-flex.png"
            alt=""
            width={720}
            height={900}
            sizes="(min-width: 800px) 19rem, 13.5rem"
            className="h-auto w-full drop-shadow-[0_24px_40px_rgb(0_0_0/0.6)]"
          />
        </div>
      </div>

      <Chip at="left-0 top-[6%] md:left-[2%] md:top-[8%]" drift={["4px", "-6px", "8800ms"]} delay={250} shown={shown}>
        <SiteChip />
      </Chip>
      <Chip at="right-0 top-[10%] md:right-[1%] md:top-[6%]" drift={["-5px", "6px", "10400ms"]} delay={380} shown={shown}>
        <WeightChip />
      </Chip>
      <Chip at="left-0 bottom-[10%] md:left-[4%] md:bottom-[14%]" drift={["6px", "5px", "11200ms"]} delay={510} shown={shown}>
        <CalcChip />
      </Chip>
      <Chip at="right-0 bottom-[6%] md:right-[3%] md:bottom-[12%]" drift={["-4px", "-7px", "9600ms"]} delay={640} shown={shown}>
        <StockChip />
      </Chip>
      <Chip at="hidden md:block md:left-[-6%] md:top-[44%]" drift={["5px", "-5px", "10000ms"]} delay={770} shown={shown}>
        <JournalChip />
      </Chip>
      <Chip at="hidden md:block md:right-[-5%] md:top-[42%]" drift={["-6px", "4px", "9200ms"]} delay={900} shown={shown}>
        <BlockChip />
      </Chip>
    </div>
  );
}

function Chip({
  at,
  drift,
  delay,
  shown,
  children,
}: {
  at: string;
  drift: [string, string, string];
  delay: number;
  shown: string | undefined;
  children: ReactNode;
}) {
  return (
    <div
      data-in={shown}
      className={cn("lp-reveal pointer-events-none absolute", at)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div
        className="lp-drift lp-float rounded-2xl px-3 py-2.5"
        style={{ "--drift-x": drift[0], "--drift-y": drift[1], "--drift-ms": drift[2] } as CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}

const LABEL = "block text-[10px] uppercase tracking-[0.14em] text-text-secondary";
const VALUE = "block font-mono text-[13px] tabular-nums text-foreground";

function SiteChip() {
  return (
    <span className="flex items-center gap-2.5">
      <svg width="22" height="30" viewBox="0 0 30 44" aria-hidden>
        <g fill="none" strokeWidth="1.2" strokeLinejoin="round" className="stroke-text-secondary">
          <circle cx="15" cy="4.4" r="3.4" />
          <path d="M9 10 h12 l2.6 10.5 -3.2 1.2 -0.8 8.3 h-11.2 l-0.8 -8.3 -3.2 -1.2 z" />
          <path d="M10.6 31 h3.6 l-0.6 11.6 h-3.6 z M15.8 31 h3.6 l0.6 11.6 h-3.6 z" />
        </g>
        <circle cx="12.4" cy="24" r="2.2" className="fill-text-primary" />
      </svg>
      <span>
        <span className={LABEL}>Site</span>
        <span className={VALUE}>L abdomen</span>
      </span>
    </span>
  );
}

function WeightChip() {
  return (
    <span className="block">
      <span className={LABEL}>Weight</span>
      <span className="flex items-end gap-2.5">
        <span className={VALUE}>86.4 kg</span>
        <svg width="44" height="18" viewBox="0 0 44 18" aria-hidden>
          <path d="M1 4 C 8 5, 12 9, 20 9.5 S 34 14, 43 15" fill="none" strokeWidth="1.6" strokeLinecap="round" className="stroke-chart-trend" />
        </svg>
      </span>
    </span>
  );
}

function CalcChip() {
  return (
    <span className="block">
      <span className={LABEL}>Reconstitution</span>
      <span className="mt-0.5 flex items-center gap-2.5">
        <span className={VALUE}>20 units</span>
        <span className="relative h-2.5 w-12 overflow-hidden rounded-[3px] bg-bg-input ring-1 ring-border-strong">
          <span className="absolute inset-y-0 left-0 w-[40%] bg-text-primary/80" />
        </span>
      </span>
    </span>
  );
}

function StockChip() {
  return (
    <span className="flex items-center gap-2.5">
      <svg width="14" height="24" viewBox="0 0 20 34" aria-hidden>
        <rect x="6" y="1" width="8" height="3.4" rx="1" className="fill-border-strong" />
        <rect x="3.2" y="4.6" width="13.6" height="28" rx="3.4" fill="none" strokeWidth="1.3" className="stroke-text-secondary" />
        <rect x="4.6" y="16" width="10.8" height="15.2" rx="2" className="fill-text-primary/70" />
      </svg>
      <span>
        <span className={LABEL}>Stock</span>
        <span className={VALUE}>16 doses left</span>
      </span>
    </span>
  );
}

function JournalChip() {
  return (
    <span className="block">
      <span className={LABEL}>Journal</span>
      <span className="mt-1 flex gap-1">
        {["Rested", "Focused"].map((t) => (
          <span key={t} className="rounded-full border border-border-strong px-2 py-0.5 text-[11px] text-foreground">
            {t}
          </span>
        ))}
      </span>
    </span>
  );
}

function BlockChip() {
  return (
    <span className="block w-32">
      <span className={LABEL}>Block</span>
      <span className={VALUE}>Week 7 of 16</span>
      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-bg-input">
        <span className="block h-full w-[44%] rounded-full bg-text-primary" />
      </span>
    </span>
  );
}
