"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";

import { SyringeGraphic } from "@/components/calculator/SyringeGraphic";
import { Container, useAnimatedFill } from "@/components/containers";
import { BodySilhouette } from "@/components/sites/BodySilhouette";
import { routeRegions, routeTransform } from "@/components/sites/bodyArtwork";
import { syringeSize } from "@/lib/calculator/syringe";
import { sparkGeometry } from "@/lib/progress/spark";
import { CARD_EYEBROW, DATA_MONO } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { useInView } from "./use-in-view";

/**
 * KYLE, FLEXING, WITH PIECES OF THE APP AROUND HIM (spec 3-03 §3.5).
 *
 * ⚠️ Kyle is a VIAL. That is settled and is not to be re-raised.
 *
 * The things around him are small previews of the app's own cards, not labels
 * (Adrian, 2026-09-17: "make it like little previews of the UI"). The one at
 * the top is a stock card whose vial runs down ONCE as the section arrives and
 * holds there (his call: "just change once"); the others are the
 * injection-site map, the calculator's syringe, weight and a running block,
 * each drawn with the app's own components and classes.
 *
 * ON A PHONE IT IS SIMPLER (his call, same day): no cards, just five small
 * circles round Kyle, each holding one piece of the app, with a word under it.
 * The cards beside and below him looked awkward at phone width.
 *
 * He rises in when the section arrives and flexes once; the cards arrive after
 * him and drift slowly. Decorative throughout: `aria-hidden`,
 * `pointer-events-none`, and all of it stills under reduced motion (the stock
 * card simply sits full).
 *
 * Laptop: five cards, two either side and one above. Phone: five circles.
 */
export function KyleCloser() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { threshold: 0.3 });
  const shown = inView ? "" : undefined;

  return (
    <div ref={ref} aria-hidden className="relative mx-auto h-[25rem] w-full max-w-[21rem] md:h-[38rem] md:max-w-[54rem]">
      {/* The pool of light he stands in. */}
      <div
        className="absolute left-1/2 top-[54%] h-[17rem] w-[17rem] -translate-x-1/2 -translate-y-1/2 rounded-full md:h-[30rem] md:w-[30rem]"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--accent-amber) 18%, transparent) 0%, transparent 65%)",
        }}
      />

      <div
        data-in={shown}
        className="lp-reveal absolute left-1/2 top-[54%] w-[10.5rem] -translate-x-1/2 -translate-y-1/2 md:top-[56%] md:w-[17rem]"
      >
        <div data-in={shown} className="lp-kyle">
          <Image
            src="/onboarding/kyle-flex.png"
            alt=""
            width={720}
            height={900}
            sizes="(min-width: 800px) 17rem, 10.5rem"
            className="h-auto w-full drop-shadow-[0_24px_40px_rgb(0_0_0/0.6)]"
          />
        </div>
      </div>

      {/* Laptop: cards. */}
      <Card at="hidden md:block left-1/2 top-0 -translate-x-1/2" drift={["0px", "-5px", "9000ms"]} delay={250} shown={shown}>
        <StockPreview live={inView} />
      </Card>
      <Card at="hidden md:block md:left-[2%] md:top-[26%]" drift={["4px", "-6px", "8800ms"]} delay={420} shown={shown}>
        <SitePreview />
      </Card>
      <Card at="hidden md:block md:right-[2%] md:top-[26%]" drift={["-5px", "6px", "10400ms"]} delay={560} shown={shown}>
        <CalcPreview />
      </Card>
      <Card at="hidden md:block md:left-[7%] md:bottom-[6%]" drift={["6px", "5px", "11200ms"]} delay={700} shown={shown}>
        <BlockPreview />
      </Card>
      <Card at="hidden md:block md:right-[7%] md:bottom-[6%]" drift={["-4px", "-7px", "9600ms"]} delay={840} shown={shown}>
        <WeightPreview />
      </Card>

      {/* Phone: circles round him. */}
      <Orb at="left-1/2 top-0 -translate-x-1/2" label="Stock" drift={["0px", "-4px", "9000ms"]} delay={250} shown={shown}>
        <OrbVial live={inView} />
      </Orb>
      <Orb at="left-[2%] top-[14%]" label="Sites" drift={["3px", "-4px", "8800ms"]} delay={380} shown={shown}>
        <OrbBody />
      </Orb>
      <Orb at="right-[2%] top-[14%]" label="Draw" drift={["-3px", "4px", "10400ms"]} delay={500} shown={shown}>
        <OrbSyringe />
      </Orb>
      <Orb at="left-[6%] bottom-[4%]" label="Weight" drift={["4px", "3px", "11200ms"]} delay={620} shown={shown}>
        <OrbSpark />
      </Orb>
      <Orb at="right-[6%] bottom-[4%]" label="Blocks" drift={["-3px", "-4px", "9600ms"]} delay={740} shown={shown}>
        <OrbRing />
      </Orb>
    </div>
  );
}

function Card({
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
        className="lp-drift flow-card rounded-2xl bg-bg-surface p-3.5"
        style={{ "--drift-x": drift[0], "--drift-y": drift[1], "--drift-ms": drift[2] } as CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}

/** A small circle with one piece of the app in it, and a word beneath. */
function Orb({
  at,
  label,
  drift,
  delay,
  shown,
  children,
}: {
  at: string;
  label: string;
  drift: [string, string, string];
  delay: number;
  shown: string | undefined;
  children: ReactNode;
}) {
  return (
    <div
      data-in={shown}
      className={cn("lp-reveal pointer-events-none absolute md:hidden", at)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div
        className="lp-drift flex flex-col items-center gap-1.5"
        style={{ "--drift-x": drift[0], "--drift-y": drift[1], "--drift-ms": drift[2] } as CSSProperties}
      >
        <span className="flow-card flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-bg-surface ring-1 ring-inset ring-text-primary/8">
          {children}
        </span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-text-secondary">{label}</span>
      </div>
    </div>
  );
}

const FULL = 0.9;
const LOW = 0.42;
/** Doses in a full vial, for the figure under it. */
const DOSES_FULL = 20;

/**
 * The vial level: full, then runs down ONCE, about a second after the section
 * arrives, and holds. Under reduced motion the easing is instant, so it simply
 * shows the lower level.
 */
function useRunDownOnce(live: boolean): number {
  const [target, setTarget] = useState(FULL);
  useEffect(() => {
    if (!live) return;
    const t = window.setTimeout(() => setTarget(LOW), 900);
    return () => window.clearTimeout(t);
  }, [live]);
  return useAnimatedFill(target, 1800) ?? target;
}

function OrbVial({ live }: { live: boolean }) {
  const fill = useRunDownOnce(live);
  return <Container name="BPC-157" category="peptide" inventoryType="reconstituted" fill={fill} size={36} />;
}

function OrbBody() {
  const regions = routeRegions("subq", "anterior", "male");
  return (
    <svg viewBox="30 4 40 64" className="h-11 w-auto">
      <BodySilhouette aspect="anterior" route="subq" />
      <g transform={routeTransform("subq")}>
        {regions.map((r) => (
          <path
            key={r.siteId}
            d={r.d}
            style={{
              fill: r.siteId === "sq-abdo-r" || r.siteId === "sq-abdo-l" ? "var(--accent-amber)" : "var(--muscle-region)",
              opacity: r.siteId === "sq-abdo-l" ? 0.6 : 1,
            }}
          />
        ))}
      </g>
    </svg>
  );
}

function OrbSyringe() {
  return (
    <svg width="34" height="16" viewBox="0 0 34 16" aria-hidden>
      <rect x="7" y="4" width="20" height="8" rx="1.5" className="fill-bg-input stroke-border-strong" strokeWidth="0.8" />
      <rect x="7.4" y="4.4" width="8" height="7.2" rx="1.1" className="fill-accent-amber" />
      <path d="M1 8h6" className="stroke-border-strong" strokeWidth="1" />
      <path d="M27 3v10M27 8h4M31 5v6" className="stroke-text-secondary" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function OrbSpark() {
  const spark = sparkGeometry(WEIGHT, 34, 16);
  return (
    <svg width="34" height="16" viewBox="0 0 34 16" className="overflow-visible" aria-hidden>
      <path d={spark.line} fill="none" strokeWidth="1.8" strokeLinecap="round" className="stroke-chart-trend" />
    </svg>
  );
}

function OrbRing() {
  const r = 13;
  const c = 2 * Math.PI * r;
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
      <circle cx="17" cy="17" r={r} fill="none" strokeWidth="3" className="stroke-bg-input" />
      <circle
        cx="17"
        cy="17"
        r={r}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${c * 0.44} ${c}`}
        transform="rotate(-90 17 17)"
        className="stroke-foreground"
      />
      <text x="17" y="20.5" textAnchor="middle" className="fill-foreground font-mono text-[9px]">7</text>
    </svg>
  );
}

/** The stock card: a vial that runs down once as the section arrives, then holds. */
function StockPreview({ live }: { live: boolean }) {
  const fill = useRunDownOnce(live);
  const doses = Math.round((fill / FULL) * DOSES_FULL);

  return (
    <div className="flex w-[12.5rem] items-center gap-3">
      <Container name="BPC-157" category="peptide" inventoryType="reconstituted" fill={fill} size={58} />
      <div className="min-w-0 flex-1">
        <p className={CARD_EYEBROW}>Stock</p>
        <p className="mt-1 truncate text-sm text-foreground">BPC-157</p>
        <p className={cn(DATA_MONO, "mt-0.5")}>{doses} doses left</p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-bg-surface-raised">
          <div className="h-full rounded-full bg-accent-primary" style={{ width: `${Math.round((fill / FULL) * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

function SitePreview() {
  const regions = routeRegions("subq", "anterior", "male");
  return (
    <div className="flex w-[8.25rem] items-center gap-2 md:w-[11.5rem] md:gap-2.5">
      <svg viewBox="30 14 40 56" className="h-[4.5rem] w-auto shrink-0">
        <BodySilhouette aspect="anterior" route="subq" />
        <g transform={routeTransform("subq")}>
          {regions.map((r) => (
            <path
              key={r.siteId}
              d={r.d}
              style={{
                fill: r.siteId === "sq-abdo-r" || r.siteId === "sq-abdo-l" ? "var(--accent-amber)" : "var(--muscle-region)",
                opacity: r.siteId === "sq-abdo-l" ? 0.6 : 1,
              }}
            />
          ))}
        </g>
      </svg>
      <div className="min-w-0">
        <p className={CARD_EYEBROW}>Sites</p>
        <p className="mt-1 text-[13px] leading-snug text-foreground">Side Abdomen, Right</p>
        <p className={cn(DATA_MONO, "mt-0.5")}>today</p>
      </div>
    </div>
  );
}

const HALF_ML = syringeSize("0.5");

function CalcPreview() {
  return (
    <div className="w-[8.25rem] md:w-[11.5rem]">
      <p className={CARD_EYEBROW}>Draw</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="font-mono text-xl font-light tabular-nums text-foreground">20</span>
        <span className="text-xs text-text-muted">units</span>
      </p>
      <div className="-mx-1.5 mt-1">
        <SyringeGraphic size={HALF_ML} fill={0.4} label="" />
      </div>
    </div>
  );
}

const WEIGHT = [88.4, 88.1, 88.3, 87.9, 87.6, 87.8, 87.3, 87.1, 86.9, 87.0, 86.6, 86.4];

function WeightPreview() {
  const spark = sparkGeometry(WEIGHT, 120, 32);
  return (
    <div className="w-[11.5rem]">
      <p className={CARD_EYEBROW}>Weight</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-light tracking-[-0.02em] tabular-nums text-foreground">86.4</span>
        <span className="text-xs text-text-muted">kg</span>
      </p>
      <svg viewBox="0 0 120 32" className="mt-2 w-full overflow-visible">
        <defs>
          <linearGradient id="lp-kyle-weight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-trend)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--chart-trend)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={spark.area} fill="url(#lp-kyle-weight)" />
        <path d={spark.line} fill="none" strokeWidth="2" strokeLinecap="round" className="stroke-chart-trend" />
      </svg>
    </div>
  );
}

function BlockPreview() {
  return (
    <div className="w-[11.5rem]">
      <p className={CARD_EYEBROW}>Running now</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-light tracking-[-0.02em] tabular-nums text-foreground">7</span>
        <span className="text-xs text-text-muted">of 16 weeks</span>
      </p>
      <p className="mt-0.5 text-[13px] text-foreground">Summer cut</p>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-bg-input">
        <div className="h-full w-[44%] rounded-full bg-accent-primary" />
      </div>
    </div>
  );
}
