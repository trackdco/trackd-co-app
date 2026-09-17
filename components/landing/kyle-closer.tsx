"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
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
 * the top is a stock card whose vial runs down and fills back up, the way he
 * described it; the others are the injection-site map, the calculator's
 * syringe, weight and a running block, each drawn with the app's own
 * components and classes.
 *
 * He rises in when the section arrives and flexes once; the cards arrive after
 * him and drift slowly. Decorative throughout: `aria-hidden`,
 * `pointer-events-none`, and all of it stills under reduced motion (the stock
 * card simply sits full).
 *
 * Laptop: five cards, two either side and one above. Phone: three, one above
 * and two below, where cards beside him covered his arms.
 */
export function KyleCloser() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { threshold: 0.3 });
  const shown = inView ? "" : undefined;

  return (
    <div ref={ref} aria-hidden className="relative mx-auto h-[33rem] w-full max-w-[21rem] md:h-[38rem] md:max-w-[54rem]">
      {/* The pool of light he stands in. */}
      <div
        className="absolute left-1/2 top-[54%] h-[20rem] w-[20rem] -translate-x-1/2 -translate-y-1/2 rounded-full md:h-[30rem] md:w-[30rem]"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--accent-amber) 18%, transparent) 0%, transparent 65%)",
        }}
      />

      <div
        data-in={shown}
        className="lp-reveal absolute left-1/2 top-[48%] w-[12rem] -translate-x-1/2 -translate-y-1/2 md:top-[56%] md:w-[17rem]"
      >
        <div data-in={shown} className="lp-kyle">
          <Image
            src="/onboarding/kyle-flex.png"
            alt=""
            width={720}
            height={900}
            sizes="(min-width: 800px) 17rem, 12rem"
            className="h-auto w-full drop-shadow-[0_24px_40px_rgb(0_0_0/0.6)]"
          />
        </div>
      </div>

      <Card at="left-1/2 top-0 -translate-x-1/2" drift={["0px", "-5px", "9000ms"]} delay={250} shown={shown}>
        <StockPreview live={inView} />
      </Card>
      <Card at="left-0 bottom-0 md:bottom-auto md:left-[2%] md:top-[26%]" drift={["4px", "-6px", "8800ms"]} delay={420} shown={shown}>
        <SitePreview />
      </Card>
      <Card at="right-0 bottom-0 md:bottom-auto md:right-[2%] md:top-[26%]" drift={["-5px", "6px", "10400ms"]} delay={560} shown={shown}>
        <CalcPreview />
      </Card>
      <Card at="hidden md:block md:left-[7%] md:bottom-[6%]" drift={["6px", "5px", "11200ms"]} delay={700} shown={shown}>
        <BlockPreview />
      </Card>
      <Card at="hidden md:block md:right-[7%] md:bottom-[6%]" drift={["-4px", "-7px", "9600ms"]} delay={840} shown={shown}>
        <WeightPreview />
      </Card>
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

function subscribeReduce(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const FULL = 0.9;
const LOW = 0.28;
/** Doses in a full vial, for the figure under it. */
const DOSES_FULL = 20;

/**
 * The stock card: a vial that runs down as doses are logged and fills back up
 * when a new one goes in, on a slow loop. Only while it is on screen, and never
 * under reduced motion.
 */
function StockPreview({ live }: { live: boolean }) {
  const reduce = useSyncExternalStore(
    subscribeReduce,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
  const [target, setTarget] = useState(FULL);

  useEffect(() => {
    if (!live || reduce) return;
    const id = window.setInterval(() => setTarget((t) => (t === FULL ? LOW : FULL)), 3200);
    return () => window.clearInterval(id);
  }, [live, reduce]);

  const fill = useAnimatedFill(target, 1600) ?? target;
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
