"use client";

import { useId, type ReactNode } from "react";

import { CaretDown, CaretLeft, CaretRight, MagnifyingGlass, Plus } from "@/components/icons";
import { CalculatorInputs } from "@/components/calculator/CalculatorInputs";
import { SyringeGraphic } from "@/components/calculator/SyringeGraphic";
import { CategoryIcon } from "@/components/compounds/CategoryIcon";
import { AnimatedContainer, Container } from "@/components/containers";
import { BodySilhouette } from "@/components/sites/BodySilhouette";
import { routeRegions, routeTransform } from "@/components/sites/bodyArtwork";
import { syringeSize } from "@/lib/calculator/syringe";
import {
  CATEGORY_DISPLAY_ORDER,
  CATEGORY_META,
  type CompoundCategory,
} from "@/lib/compound-categories";
import { siteHeat } from "@/lib/home/siteRecency";
import { sparkGeometry } from "@/lib/progress/spark";
import {
  CARD_EYEBROW,
  COLUMN_EYEBROW,
  DATA_MONO,
  METRIC_VALUE,
  PAGE_TITLE,
  SHEET_TITLE,
  UNIT_SUFFIX,
} from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

/*
 * THE SEVEN SCREENS BEHIND THE FEATURES WIDGET (spec 3-03 §3.4).
 *
 * Each is one of the app's real screens, drawn with the app's own components
 * where they are presentational (the containers, the body artwork, the syringe,
 * the calculator's input sheet, the category icons) and with the app's own
 * classes where they are not. `Phone` renders them at 390 x 844 and scales them,
 * and makes the whole screen `inert`, which is what lets a real input sheet sit
 * in a picture without being tabbable.
 *
 * Each has ONE moment, played when `live` turns on (the row is open and on
 * screen): a dose comes off the vial, a site is logged, a line draws. The base
 * styles are the finished state, so reduced motion shows the result.
 *
 * Real compound names (Adrian, 2026-09-17, reversing the generic labels: it is
 * a preview with made-up data). No score, no streak, no evaluative colour:
 * the only amber is the app's own (a due count, a run-dry date inside its
 * window, the insulin figure, the injection-site recency ramp, which carries
 * its day labels).
 */

export interface ScreenProps {
  live: boolean;
  /** Compounds per category, for the library. Ignored by the other screens. */
  counts?: Partial<Record<CompoundCategory, number>>;
}

function Title({ children }: { children: ReactNode }) {
  return <h4 className={cn(PAGE_TITLE, "text-[32px]")}>{children}</h4>;
}

/** A figure that changes when the moment plays: old fades out, new fades in. */
function Swap({ live, from, to, className }: { live: boolean; from: string; to: string; className?: string }) {
  return (
    <span className={cn("relative inline-grid", className)}>
      <span
        className={cn(
          "col-start-1 row-start-1 transition-opacity duration-300 motion-reduce:transition-none",
          live ? "opacity-0 delay-500" : "opacity-100",
        )}
      >
        {from}
      </span>
      <span
        className={cn(
          "col-start-1 row-start-1 transition-opacity duration-300 motion-reduce:transition-none",
          live ? "opacity-100 delay-700" : "opacity-0",
        )}
      >
        {to}
      </span>
    </span>
  );
}

/* ----------------------------------------------------------------- Stock */

export function StockScreen({ live }: ScreenProps) {
  return (
    <div className="space-y-5 px-5 pt-4">
      <Title>Protocol</Title>
      <section className="space-y-3">
        <h5 className={cn(CARD_EYEBROW, "px-1")}>Compounds</h5>
        {/* ⚠️ A 2x2 GRID, AND THE SCHEDULE STRIP BELOW IT IS GONE (2026-09-18).
            Adrian asked for a supplement on the shelf so it is obvious this
            counts more than injectables. As a fourth card in the old single
            row it sat entirely outside the phone, and its note collided with
            the note beside it. Four cards in a grid show all four containers
            at full size instead: an oil vial, a peptide vial, a tablet bottle
            and a tub. That needs the height the schedule strip was using, and
            the strip was the weaker half of the screen anyway: the Stacks
            feature draws a real cycle calendar two rows down this same list. */}
        <div className="grid grid-cols-2 gap-3">
          <StockCard
            mark="stock-1"
            name="Testosterone Enanthate"
            category="anabolic"
            type="preconcentrated"
            fill={live ? 0.8 : 0.85}
            left={<Swap live={live} from="8.5 mL left" to="8.0 mL left" />}
            doses={<Swap live={live} from="17 doses" to="16 doses" />}
            runsDry="4 Nov"
            pct={live ? 80 : 85}
          />
          <StockCard
            mark="stock-2"
            name="BPC-157"
            category="peptide"
            type="reconstituted"
            fill={0.3}
            left="0.6 mL left"
            doses="3 doses"
            runsDry="in 3 days"
            soon
            pct={30}
          />
          <StockCard
            mark="stock-3"
            name="Oxandrolone"
            category="oral"
            type="oral_solid"
            fill={0.55}
            left="44 tablets"
            doses="22 doses"
            runsDry="25 Oct"
            pct={55}
          />
          <StockCard
            mark="stock-4"
            name="Creatine"
            category="supplement"
            type="oral_solid"
            fill={0.65}
            left="260 g left"
            doses="52 doses"
            runsDry="9 Nov"
            pct={65}
          />
        </div>
      </section>
    </div>
  );
}

function StockCard({
  name,
  category,
  type,
  fill,
  left,
  doses,
  runsDry,
  soon = false,
  pct,
  mark,
}: {
  mark: string;
  name: string;
  category: string;
  type: string;
  fill: number;
  left: ReactNode;
  doses: ReactNode;
  runsDry: string;
  soon?: boolean;
  pct: number;
}) {
  return (
    <div className="flex h-[252px] w-full flex-col items-center gap-2 rounded-2xl bg-bg-surface p-4">
      <span data-mark={`${mark}-vial`} className="flex">
        <AnimatedContainer
          name={name}
          category={category}
          inventoryType={type}
          fill={fill}
          size={80}
          durationMs={700}
        />
      </span>
      <span className="flex h-9 w-full items-center justify-center">
        <span className="line-clamp-2 text-center text-sm leading-tight text-foreground">{name}</span>
      </span>
      <span className="flex w-full flex-col items-center gap-1">
        <span className={cn(DATA_MONO, "w-full text-center")}>{left}</span>
        <span className={cn(DATA_MONO, "w-full text-center")}>{doses}</span>
        <span className="mt-0.5 flex w-full flex-col items-center leading-tight">
          <span className="text-[10px] lowercase text-text-subtle">runs dry</span>
          <span
            data-mark={`${mark}-dry`}
            className={cn(
              "font-mono text-[11px] tabular-nums",
              soon ? "text-accent-amber" : "text-text-muted",
            )}
          >
            {runsDry}
          </span>
        </span>
        <span className="mt-1 flex w-full items-center gap-2">
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-bg-surface-raised">
            <span
              className="block h-full rounded-full bg-accent-primary transition-[width] delay-300 duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-text-subtle">{pct}%</span>
        </span>
      </span>
    </div>
  );
}

/* --------------------------------------------------------- Injection sites */

/** The two sites in Adrian's example: one used two days ago, one just done. */
export const SITE_RECENT = "sq-abdo-l";
export const SITE_NOW = "sq-abdo-r";
const RECENT_DAYS = 2;

export function SitesScreen({ live }: ScreenProps) {
  // The app's own decay and visibility floor (`InjectionSitesGlanceCard`).
  const recent = Math.max(0.14, siteHeat(RECENT_DAYS, "subq"));
  const regions = routeRegions("subq", "anterior", "male");

  return (
    <div className="px-4 pt-3">
      {/* No page title: the map is the screen, drawn as large as the phone
          allows so the sites read at landing-page size (Adrian, 2026-09-17:
          "a bit hard to view"). */}
      <section className="rounded-2xl bg-bg-surface">
        <div className="flex items-center justify-between gap-3 px-5 pb-1.5 pt-5">
          <p className={CARD_EYEBROW}>Injection sites</p>
          <span className="inline-flex shrink-0 rounded-full border border-border-default bg-bg-input p-0.5 text-[11px]">
            <span className="rounded-full px-2.5 py-1 text-text-muted">IM</span>
            <span className="rounded-full bg-bg-surface-raised px-2.5 py-1 font-medium text-foreground">
              Sub-Q
            </span>
          </span>
        </div>

        <div className="px-5 pb-5 pt-2">
          {/* The body map's own Front / Back pill (`BodyMap`). */}
          <div className="flex justify-center">
            <span className="inline-flex rounded-full border border-border-default bg-bg-input p-0.5 text-xs">
              <span className="rounded-full bg-bg-surface-raised px-4 py-1 font-medium text-foreground">Front</span>
              <span className="rounded-full px-4 py-1 text-text-muted">Back</span>
            </span>
          </div>
          <svg viewBox="22 1 56 98" className="mx-auto mt-2 block h-[462px] w-auto">
            <BodySilhouette aspect="anterior" route="subq" />
            <g transform={routeTransform("subq")}>
              {regions.map((r) => (
                <g key={r.siteId} data-mark={r.siteId}>
                  <path d={r.d} style={{ fill: "var(--muscle-region)" }} />
                  {r.siteId === SITE_RECENT ? (
                    <path d={r.d} style={{ fill: "var(--accent-amber)", opacity: recent }} />
                  ) : null}
                  {r.siteId === SITE_NOW ? (
                    <path
                      d={r.d}
                      className="transition-opacity delay-300 duration-700 ease-out motion-reduce:transition-none"
                      style={{ fill: "var(--accent-amber)", opacity: live ? 1 : 0 }}
                    />
                  ) : null}
                </g>
              ))}
            </g>
          </svg>

          <div className="mt-2 w-full pt-3 hairline-t">
            <p className="mb-2.5 text-[10.4px] font-medium uppercase tracking-[0.14em] text-text-muted">
              Last logged
            </p>
            <ul className="flex flex-col gap-2.5">
              <li
                className={cn(
                  "grid transition-[grid-template-rows,opacity] delay-500 duration-500 ease-out motion-reduce:transition-none",
                  live ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                )}
              >
                <div className="min-h-0 overflow-hidden">
                  <SiteRow site="Side Abdomen, Right" when="today" who="Ipamorelin" />
                </div>
              </li>
              <li>
                <SiteRow site="Side Abdomen, Left" when="2d" who="BPC-157" />
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function SiteRow({ site, when, who }: { site: string; when: string; who: string }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm text-foreground">{site}</span>
        <span className="shrink-0 font-mono text-[11.2px] text-text-muted">{when}</span>
      </div>
      <p className="truncate text-[11.2px] text-text-muted">{who}</p>
    </>
  );
}

/* --------------------------------------------------------------- Progress */

const WEIGHT_SCALE = [89.6, 89.9, 89.2, 89.4, 88.9, 89.1, 88.5, 88.7, 88.2, 88.4, 87.8, 88.0, 87.5, 87.6, 87.1, 87.3, 86.9, 86.8, 86.5, 86.6];
const WEIGHT_TREND = [89.7, 89.6, 89.4, 89.3, 89.1, 88.9, 88.8, 88.6, 88.4, 88.2, 88.0, 87.9, 87.7, 87.5, 87.3, 87.2, 87.0, 86.9, 86.8, 86.6];

export function ProgressScreen({ live }: ScreenProps) {
  // Unique per instance: the phone accordion and the laptop stage can both
  // render this screen at once, and an SVG id must be unique in the document.
  const gradientId = `lp-trend-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const W = 310;
  const H = 120;
  const trend = sparkGeometry(WEIGHT_TREND, W, H, 6);
  const scale = sparkGeometry(WEIGHT_SCALE, W, H, 6);
  return (
    <div className="space-y-5 px-5 pt-4" data-live={live ? "" : undefined}>
      <Title>Progress</Title>

      <section className="rounded-2xl bg-bg-surface p-5">
        <div className="flex items-center justify-between">
          <p className={CARD_EYEBROW}>Weight</p>
          <span className="inline-flex rounded-full border border-border-default bg-bg-input p-0.5 text-[11px]">
            <span className="rounded-full bg-bg-surface-raised px-2.5 py-1 font-medium text-foreground">Trend</span>
            <span className="rounded-full px-2.5 py-1 text-text-muted">Scale</span>
          </span>
        </div>
        <p className="mt-2 flex items-baseline gap-2">
          <span className={METRIC_VALUE}>86.6</span>
          <span className={UNIT_SUFFIX}>kg</span>
        </p>
        <p className={cn(DATA_MONO, "mt-0.5")}>-3.1 kg over this range</p>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-trend)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--chart-trend)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={scale.line} fill="none" strokeWidth="2.5" strokeLinecap="round" className="stroke-chart-line" opacity={0.3} />
          <path d={trend.area} fill={`url(#${gradientId})`} className="lp-draw-area" />
          <path
            d={trend.line}
            pathLength={1}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="lp-draw-line stroke-chart-trend"
            data-mark="trend"
          />
        </svg>
        <div className="mt-4 grid grid-cols-5 gap-1 rounded-full bg-bg-input p-0.5 text-center text-[11px]">
          {["1M", "3M", "6M", "1Y", "All"].map((r) => (
            <span
              key={r}
              className={cn(
                "rounded-full py-1",
                r === "3M" ? "bg-bg-surface-raised font-medium text-foreground" : "text-text-muted",
              )}
            >
              {r}
            </span>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <section className="rounded-2xl bg-bg-surface p-5">
          <p className={CARD_EYEBROW}>Progress photos</p>
          <div data-mark="photos" className="mt-3 grid grid-cols-2 gap-2">
            {["1 Aug", "3 Oct"].map((d) => (
              <div key={d} className="flex flex-col items-center rounded-xl bg-bg-surface-raised px-1 pb-1.5 pt-2">
                <svg viewBox="22 1 56 98" className="h-20 w-auto">
                  <BodySilhouette aspect="anterior" />
                </svg>
                <span className="mt-1 font-mono text-[10px] text-text-muted">{d}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl bg-bg-surface p-5">
          <p className={CARD_EYEBROW}>Journal</p>
          <p className="mt-2 text-sm text-foreground">3 October</p>
          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-text-muted">
            Slept well. Energy steady through the afternoon session.
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {["Rested", "Focused"].map((t) => (
              <span key={t} className="rounded-full border border-border-default px-2 py-0.5 text-[10px] text-text-muted">
                {t}
              </span>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl bg-bg-surface p-5">
        <p className={CARD_EYEBROW}>Bloodwork</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm text-foreground">Panel, 12 September</span>
          <span className={DATA_MONO}>3 pages</span>
        </div>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------- Training blocks */

/** The seven weeks of the block on screen, week 1 to week 7. */
const BLOCK_WEIGHT = [88.7, 88.3, 88.0, 87.6, 87.2, 86.9, 86.6];

/**
 * ONE BLOCK, ALREADY OPENED (Adrian, 2026-09-18).
 *
 * This used to be the Blocks LIST: a "Running now" summary, a New block
 * button, and two past blocks underneath. Adrian's verdict was that the
 * feature "didn't look as valuable to me" from that screen, and he is right
 * about why: a list of blocks shows that blocks exist, not what one is FOR.
 * What a block is for is that a prep's weight, photos and bloods sit together
 * under the weeks they happened in, and only the opened block shows that.
 *
 * ⚠️ NOTHING HERE IS TAPPABLE, and the back caret is not a control. Every
 * screen in this widget is a drawing of the app, so "already clicked in" is
 * simply the state it is drawn in; the caret is there to say this is a screen
 * you got to from somewhere, which is what makes the look-back strip beneath
 * read as the rest of them rather than as a menu.
 */
export function BlocksScreen({ live }: ScreenProps) {
  const gradientId = `lp-block-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const W = 310;
  const H = 74;
  const trend = sparkGeometry(BLOCK_WEIGHT, W, H, 6);
  return (
    <div className="space-y-3 px-5 pt-4" data-live={live ? "" : undefined}>
      <div>
        <div className="flex items-center gap-1.5">
          <CaretLeft className="h-4 w-4 shrink-0 text-text-subtle" />
          <Title>Summer cut</Title>
        </div>
        <p className={cn(DATA_MONO, "mt-1")}>Week 7 of 16 · ends 5 Dec</p>
        <div data-mark="block-bar" className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-bg-input">
          <div className="lp-bar h-full rounded-full bg-accent-primary" style={{ "--to": 0.44 } as React.CSSProperties} />
        </div>
      </div>

      {/* The point of the screen: one prep's numbers, under its own weeks. */}
      <section data-mark="block-data" className="rounded-2xl bg-bg-surface p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className={CARD_EYEBROW}>Weight</p>
          <span className={DATA_MONO}>2.1 kg down</span>
        </div>
        <p className="mt-2 flex items-baseline gap-2">
          <span className={METRIC_VALUE}>86.6</span>
          <span className={UNIT_SUFFIX}>kg</span>
        </p>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-trend)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--chart-trend)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={trend.area} fill={`url(#${gradientId})`} className="lp-draw-area" />
          <path
            d={trend.line}
            pathLength={1}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="lp-draw-line stroke-chart-trend"
          />
        </svg>
        <div className="mt-1 flex justify-between">
          <span className="font-mono text-[10px] text-text-subtle">Week 1</span>
          <span className="font-mono text-[10px] text-text-subtle">Week 7</span>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <section className="rounded-2xl bg-bg-surface p-4">
          <p className={CARD_EYEBROW}>Photos</p>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            {["Wk 1", "Wk 7"].map((d) => (
              <div key={d} className="flex flex-col items-center rounded-xl bg-bg-surface-raised px-1 pb-1 pt-1.5">
                <svg viewBox="22 1 56 98" className="h-12 w-auto">
                  <BodySilhouette aspect="anterior" />
                </svg>
                <span className="mt-0.5 font-mono text-[10px] text-text-muted">{d}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl bg-bg-surface p-4">
          <p className={CARD_EYEBROW}>Bloods</p>
          <p className="mt-2.5 text-sm text-foreground">Panel</p>
          <p className={cn(DATA_MONO, "mt-0.5")}>12 Sep</p>
          <p className="mt-2 text-sm text-foreground">Panel</p>
          <p className={cn(DATA_MONO, "mt-0.5")}>4 Aug</p>
        </section>
      </div>

      {/* The rest of them, so the history is visible without leaving. */}
      <div data-mark="lookback" className="space-y-1.5 pb-1">
        <p className={CARD_EYEBROW}>Look back</p>
        {[
          { name: "Off-season", line: "25 weeks · 4.8 kg up" },
          { name: "First cut", line: "16 weeks · 6.2 kg down" },
        ].map((b) => (
          <div key={b.name} className="flex items-center gap-3 rounded-2xl bg-bg-surface px-4 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-foreground">{b.name}</span>
              <span className={cn(DATA_MONO, "mt-0.5 block")}>{b.line}</span>
            </span>
            <CaretRight className="h-4 w-4 text-text-subtle" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- Stacks and cycles */

export function StacksScreen({ live }: ScreenProps) {
  // Cycle days for the month strip: 7 on, 7 off, starting on a Monday (Adrian,
  // 2026-09-18). A fortnight-long cycle is the one people actually run, and it
  // reads as a cycle on the calendar rather than as a working week.
  const days = Array.from({ length: 28 }, (_, i) => ({ n: i + 1, on: i % 14 < 7 }));
  return (
    <div className="space-y-5 px-5 pt-4">
      <Title>Protocol</Title>

      <section className="space-y-3">
        <h5 className={cn(CARD_EYEBROW, "px-1")}>Stacks</h5>
        <div className="rounded-2xl bg-bg-surface p-5">
          <div className="flex items-center gap-3">
            <span data-mark="stack-dot" className="h-2.5 w-2.5 rounded-full bg-palette-teal" />
            <span className="min-w-0 flex-1 text-base text-foreground">Morning stack</span>
            <span className={DATA_MONO}>
              <Swap live={live} from="0 of 3" to="3 of 3" />
            </span>
          </div>
          <ul data-mark="stack-list" className="mt-3 pl-1">
            {["BPC-157", "TB-500", "Creatine Monohydrate"].map((n, i) => (
              <li key={n} className="flex items-center gap-3 py-1.5">
                <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong">
                  <span
                    className={cn(
                      "absolute inset-[-1px] flex items-center justify-center rounded-full bg-accent-primary transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
                      live ? "scale-100 opacity-100" : "scale-50 opacity-0",
                    )}
                    style={{ transitionDelay: `${600 + i * 140}ms` }}
                  >
                    <svg width="12" height="12" viewBox="0 0 18 18" aria-hidden>
                      <path d="M4 9.3 L7.5 12.9 L14 5.6" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="stroke-bg-base" />
                    </svg>
                  </span>
                </span>
                <Container
                  name={n}
                  category={i === 2 ? "supplement" : "peptide"}
                  inventoryType={i === 2 ? "oral_solid" : "reconstituted"}
                  stackColour="var(--palette-teal)"
                  fill={0.7 - i * 0.12}
                  size={26}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{n}</span>
                <span className={DATA_MONO}>7:30 AM</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 pt-3 text-xs text-text-muted hairline-t">Taken together, logged in one tap.</p>
        </div>
      </section>

      <section className="space-y-3">
        <h5 className={cn(CARD_EYEBROW, "px-1")}>Cycles</h5>
        <div className="rounded-2xl bg-bg-surface p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-base text-foreground">Ipamorelin</span>
            <span className={DATA_MONO}>7 on · 7 off</span>
          </div>
          <div data-mark="cycle" className="mt-3 grid grid-cols-7 gap-1.5 text-center">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i} className="text-[10px] uppercase tracking-wide text-text-subtle">
                {d}
              </span>
            ))}
            {days.map((d) => (
              <span
                key={d.n}
                className={cn(
                  "relative flex aspect-square items-center justify-center rounded-full font-mono text-[11px] tabular-nums",
                  d.on ? "text-foreground" : "text-text-subtle",
                  d.n === 17 && "ring-1 ring-foreground",
                )}
              >
                {d.on ? <span className="absolute inset-0 rounded-full bg-palette-plum/45" /> : null}
                <span className="relative">{d.n}</span>
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ----------------------------------------------------------------- Library */

export function LibraryScreen({ live, counts = {} }: ScreenProps) {
  return (
    <div className="relative h-[750px]">
      {/* The dashboard, dimmed behind the sheet. */}
      <div className="space-y-5 px-5 pt-4 opacity-40">
        <Title>Dashboard</Title>
        <div className="h-40 rounded-2xl bg-bg-surface" />
      </div>
      <div className="absolute inset-0 bg-bg-base/60" />

      <div className="absolute inset-x-0 bottom-0 top-6 flex flex-col overflow-hidden rounded-t-3xl bg-bg-surface shadow-lg hairline-t">
        <span className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong" />
        <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 pb-3 pt-3">
          <span className="text-base text-text-muted">Cancel</span>
          <span className={cn(SHEET_TITLE, "text-base font-medium")}>Add compound</span>
          <span />
        </div>
        <div className="px-4 pb-4">
          <div data-mark="search" className="relative flex h-12 items-center rounded-xl bg-bg-input pl-11 pr-4">
            <MagnifyingGlass className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <span className="text-base text-text-muted">Search compounds…</span>
          </div>
        </div>
        <div className="flex-1 px-4">
          <p className="px-1 pb-2 pt-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">
            Browse by category
          </p>
          <div data-mark="library" className="space-y-2">
            {CATEGORY_DISPLAY_ORDER.map((c, i) => (
              <div
                key={c}
                className={cn(
                  "flex items-center gap-3 rounded-2xl bg-bg-surface-raised px-4 py-2.5 transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none",
                  live ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
                )}
                style={{ transitionDelay: `${150 + i * 55}ms` }}
              >
                <CategoryIcon category={c} className="h-3.5 w-3.5" />
                <span className="min-w-0 flex-1 truncate text-base font-medium text-foreground">
                  {CATEGORY_META[c].label}
                </span>
                <span className="font-mono text-xs tabular-nums text-text-subtle">{counts[c] ?? 0}</span>
                <CaretDown className="h-4 w-4 -rotate-90 text-text-subtle" />
              </div>
            ))}
          </div>
          <div data-mark="custom" className="mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-border-strong px-4 py-3.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-input text-foreground">
              <Plus className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-base font-medium text-foreground">Make your own</span>
              <span className="block text-sm text-text-muted">Anything the library does not have</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Calculator */

const NOOP = () => {};
const HALF_ML = syringeSize("0.5");

export function CalculatorScreen({ live }: ScreenProps) {
  // 10 mg in 2 mL, a 1 mg dose: 5 mg/mL, 0.2 mL, 20 units. The same figures the
  // app's own calculator returns for these inputs (`lib/calculator/recon`).
  return (
    <div className="space-y-5 px-5 pt-4">
      <Title>Calculator</Title>
      <section className="space-y-3 pb-1">
        <h5 className={cn(CARD_EYEBROW, "px-1")}>Draw</h5>
        <div className="flex h-[34px] items-baseline gap-2">
          <span className={METRIC_VALUE}>20</span>
          <span className={UNIT_SUFFIX}>units</span>
        </div>
        <div data-mark="syringe" className="-mx-2">
          <SyringeGraphic size={HALF_ML} fill={live ? 0.4 : 0} label="" />
        </div>
      </section>

      <section data-mark="figures" className="grid grid-cols-3 divide-x divide-border-default rounded-2xl bg-bg-surface py-3">
        {[
          { l: "Concentration", v: "5", u: "mg/mL" },
          { l: "Per dose", v: "0.2", u: "mL" },
          { l: "Insulin", v: "20", u: "U", accent: true },
        ].map((f) => (
          <div key={f.l} className="px-2 text-center">
            <p className={COLUMN_EYEBROW}>{f.l}</p>
            <p className="mt-1 font-mono text-base tabular-nums">
              <span className={f.accent ? "text-accent-amber" : "text-foreground"}>{f.v}</span>{" "}
              <span className="text-[11px] text-text-muted">{f.u}</span>
            </p>
          </div>
        ))}
      </section>

      <CalculatorInputs
        sizeId="0.5"
        onSizeChange={NOOP}
        powder="10"
        onPowderChange={NOOP}
        powderUnit="mg"
        onPowderUnitChange={NOOP}
        bac="2"
        onBacChange={NOOP}
        dose="1000"
        onDoseChange={NOOP}
        doseUnit="mcg"
        onDoseUnitChange={NOOP}
        onReset={NOOP}
        resettable
      />
    </div>
  );
}
