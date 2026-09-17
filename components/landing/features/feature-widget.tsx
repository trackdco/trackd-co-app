"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";

import { ArrowRight } from "@/components/icons";
import type { CompoundCategory } from "@/lib/compound-categories";
import { cn } from "@/lib/utils";

import { Phone, type PhoneTab } from "../phone";
import {
  BlocksScreen,
  CalculatorScreen,
  LibraryScreen,
  ProgressScreen,
  SitesScreen,
  StacksScreen,
  StockScreen,
} from "../screens/features";
import { CALCULATOR_HREF } from "../site-header";
import { useInView } from "../use-in-view";
import {
  BlocksIcon,
  CalculatorIcon,
  LibraryIcon,
  ProgressIcon,
  SitesIcon,
  StacksIcon,
  StockIcon,
} from "./icons";

/**
 * A floating note on the phone.
 *
 * `x`/`y` are the point it describes, as percentages of the PHONE's box.
 * `side` is where the card sits, and its height is `py` on a phone (where the
 * cards overlap the device, so they are placed over the least important part
 * of the screen) and `ly` on a laptop (where they stand clear of it). A
 * hairline runs from the card's inner edge to the point.
 *
 * ⚠️ MEASURED, NOT GUESSED. Every target was read off the rendered screen
 * (each one carries a `data-mark`), so moving something inside a screen means
 * measuring its callout again.
 */
interface Callout {
  title: string;
  line?: string;
  x: number;
  y: number;
  side: "left" | "right";
  py: number;
  ly: number;
}

/** Where a card's inner edge sits, as a percentage across the phone. */
const PHONE_EDGE = 58;
const LAPTOP_EDGE = 80;

interface Feature {
  id: string;
  /** The pill label in the phone layout. */
  short: string;
  name: string;
  line: string;
  Icon: () => ReactNode;
  tab: PhoneTab;
  /** What the phone shows, for a screen reader. */
  label: string;
  callouts: Callout[];
  Screen: (props: { live: boolean; counts: Counts }) => ReactNode;
  /** False when the screen is a sheet that covers the tab bar. */
  chrome?: boolean;
  extra?: ReactNode;
}

type Counts = Partial<Record<CompoundCategory, number>>;

function features(total: number): Feature[] {
  return [
    {
      id: "stock",
      short: "Stock",
      name: "Stock",
      line: "Every dose you log comes off the vial, down to the day it runs dry.",
      Icon: StockIcon,
      tab: "protocol",
      label: "The Protocol screen: three compounds with what is left in each and the day each runs dry.",
      callouts: [
        { title: "Counts down as you log", line: "A dose comes straight off the vial", x: 23.3, y: 31, side: "right", py: 19, ly: 31 },
        { title: "Knows when it runs dry", line: "Before you are caught short", x: 60.2, y: 48.7, side: "left", py: 56, ly: 48.7 },
      ],
      Screen: StockScreen,
    },
    {
      id: "sites",
      short: "Sites",
      name: "Injection sites",
      line: "Where every shot went, and which sites have rested.",
      Icon: SitesIcon,
      tab: "dashboard",
      label:
        "The injection sites map: one site on the abdomen logged today in full amber, and one logged two days ago, lighter.",
      callouts: [
        { title: "Each injection is logged to its site", x: 57, y: 46.6, side: "right", py: 30, ly: 38 },
        { title: "The shading fades as the site rests", line: "Two days ago, already lighter", x: 43.1, y: 46.6, side: "left", py: 64, ly: 56 },
      ],
      Screen: SitesScreen,
    },
    {
      id: "progress",
      short: "Progress",
      name: "Progress",
      line: "Weight, photos, bloodwork and a journal, beside the protocol that made them.",
      Icon: ProgressIcon,
      tab: "progress",
      label: "The Progress screen: a weight trend line, progress photos side by side, a journal entry and a bloodwork panel.",
      callouts: [
        { title: "The trend, not the daily noise", x: 78, y: 48.5, side: "right", py: 57, ly: 44 },
        { title: "Photos lined up by date", x: 27.4, y: 73.2, side: "right", py: 86, ly: 73 },
      ],
      Screen: ProgressScreen,
    },
    {
      id: "blocks",
      short: "Blocks",
      name: "Training blocks",
      line: "Run a cut or a build as a block, then look back on how it went.",
      Icon: BlocksIcon,
      tab: "progress",
      label: "The Blocks screen: week 7 of a 16 week cut, with past blocks listed underneath.",
      callouts: [
        { title: "Where you are in the block", x: 45.4, y: 38.3, side: "right", py: 27, ly: 38.3 },
        { title: "Every block you have run, kept", x: 30, y: 66.5, side: "left", py: 86, ly: 70 },
      ],
      Screen: BlocksScreen,
    },
    {
      id: "stacks",
      short: "Stacks and cycles",
      name: "Stacks and cycles",
      line: "Group what you take together, and run compounds on and off.",
      Icon: StacksIcon,
      tab: "protocol",
      label: "The Protocol screen: a morning stack of three compounds ticked together, and a five on, two off cycle on a calendar.",
      callouts: [
        { title: "One tap logs the whole stack", x: 12.5, y: 28.3, side: "right", py: 19, ly: 28.3 },
        { title: "On days and off days at a glance", x: 30, y: 78, side: "left", py: 91, ly: 75 },
      ],
      Screen: StacksScreen,
    },
    {
      id: "library",
      short: "Library",
      name: "The compound library",
      line: `Over ${Math.floor(total / 100) * 100} compounds to pick from, or add your own.`,
      Icon: LibraryIcon,
      tab: "dashboard",
      label: "The Add compound sheet: a search box and the library browsed by category.",
      chrome: false,
      callouts: [
        { title: `Over ${Math.floor(total / 100) * 100} compounds, sorted by type`, x: 11, y: 35.4, side: "right", py: 13, ly: 38 },
        { title: "Not there? Make your own", x: 13.8, y: 85.9, side: "right", py: 96, ly: 86 },
      ],
      Screen: LibraryScreen,
    },
    {
      id: "calculator",
      short: "Calculator",
      name: "The reconstitution calculator",
      line: "Powder and water in. Units on the syringe out.",
      Icon: CalculatorIcon,
      tab: "calculator",
      label: "The Calculator screen: 20 units drawn on a half millilitre syringe, with the concentration and volume beside it.",
      callouts: [
        { title: "Drawn on the syringe you use", x: 40, y: 34, side: "right", py: 21, ly: 34 },
        { title: "Every figure shown", x: 6.8, y: 45.5, side: "left", py: 56, ly: 45.5 },
      ],
      Screen: CalculatorScreen,
      extra: (
        <Link
          href={CALCULATOR_HREF}
          className="group inline-flex items-center gap-1.5 rounded-sm text-sm text-foreground underline decoration-text-secondary underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          Try it free, no account needed
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </Link>
      ),
    },
  ];
}

/**
 * THE FEATURES WIDGET (spec 3-03 §3.4). One object, not a stack of cards.
 *
 * Two designed layouts, one state (`shown`, the feature on the phone):
 *
 * - **Laptop:** the list on the left and the phone on the right, in the same
 *   panel. Picking a row opens it to its notes as text, and the phone beside
 *   it changes to match.
 * - **Phone: pills and one phone** (Adrian, 2026-09-17, chosen over an
 *   accordion that jumped the page when you switched rows). A row of pills you
 *   can swipe sideways, the chosen feature's line, and one phone beneath it
 *   that you can also swipe to move along. Nothing opens or closes, so nothing
 *   moves under your thumb.
 *
 * Changing feature mounts a fresh screen, so its moment plays again. Both
 * layouts are in the DOM and CSS shows one; the hidden one is inert to
 * assistive tech by `display: none`.
 */
export function FeatureWidget({ counts, total }: { counts: Counts; total: number }) {
  const list = features(total);
  const [shown, setShown] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const inView = useInView(root, { threshold: 0.2 });
  const baseId = useId();
  const current = list[shown];

  return (
    <div ref={root}>
      {/* ---- Phone ---- */}
      <div className="lp-panel overflow-clip rounded-[2rem] pb-8 pt-4 lg:hidden">
        <PhonePills list={list} shown={shown} onPick={setShown} baseId={baseId} />
        <div
          id={`${baseId}-panel`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${current.id}`}
          className="px-5"
        >
          <p className="mx-auto mt-5 min-h-[2.75rem] max-w-[20rem] text-center text-sm leading-snug text-text-secondary">
            {current.line}
          </p>
          <SwipeArea
            onPrev={() => setShown((i) => Math.max(0, i - 1))}
            onNext={() => setShown((i) => Math.min(list.length - 1, i + 1))}
          >
            <div key={current.id} className="lp-stage-in mt-6">
              <Stage feature={current} counts={counts} active={inView} />
            </div>
          </SwipeArea>
          <div className="mt-6 flex items-center justify-center gap-1.5" aria-hidden>
            {list.map((f, i) => (
              <span
                key={f.id}
                className={cn(
                  "block h-1.5 rounded-full transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)] motion-reduce:transition-none",
                  i === shown ? "w-5 bg-foreground" : "w-1.5 bg-border-strong",
                )}
              />
            ))}
          </div>
          {current.extra ? <div className="mt-6 text-center">{current.extra}</div> : null}
        </div>
      </div>

      {/* ---- Laptop ---- */}
      <div className="lp-panel hidden overflow-clip rounded-[2rem] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ul className="divide-hairline divide-border-default p-3">
          {list.map((f, i) => {
            const isOpen = shown === i;
            const panelId = `${baseId}-${f.id}`;
            return (
              <li key={f.id}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setShown(i)}
                    className={cn(
                      "group flex w-full items-center gap-4 rounded-3xl px-4 py-4 text-left transition-colors",
                      "hover:bg-text-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
                    )}
                  >
                    <FeatureIcon Icon={f.Icon} on={isOpen} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[1.02rem] tracking-[-0.01em] text-foreground">{f.name}</span>
                      <span className="mt-0.5 block text-sm leading-snug text-text-secondary">{f.line}</span>
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full transition-colors motion-reduce:transition-none",
                        isOpen ? "bg-foreground" : "bg-border-strong",
                      )}
                    />
                  </button>
                </h3>

                <div id={panelId} className="lp-expand" style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}>
                  <div className="min-h-0 overflow-hidden" inert={!isOpen}>
                    <div className="pb-5 pl-[4.75rem] pr-6">
                      <ul className="space-y-1.5">
                        {f.callouts.map((c) => (
                          <li key={c.title} className="flex items-baseline gap-2.5 text-sm text-foreground">
                            <span aria-hidden className="relative top-[-2px] h-1 w-1 shrink-0 rounded-full bg-text-secondary" />
                            <span>
                              {c.title}
                              {c.line ? <span className="text-text-secondary">. {c.line}.</span> : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {f.extra ? <div className="mt-4">{f.extra}</div> : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {/* The phone for whichever row is open. Keyed, so switching rows mounts
            a fresh screen and its moment plays again. */}
        <div className="relative flex items-center justify-center border-l-[0.5px] border-border-default py-14">
          <StageGlow />
          <Stage key={current.id} feature={current} counts={counts} active={inView} />
        </div>
      </div>
    </div>
  );
}

function FeatureIcon({ Icon, on }: { Icon: () => ReactNode; on: boolean }) {
  return (
    <span
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset transition-colors motion-reduce:transition-none",
        on
          ? "bg-text-primary/10 text-foreground ring-text-primary/15"
          : "bg-text-primary/[0.04] text-text-secondary ring-text-primary/8",
      )}
    >
      <Icon />
    </span>
  );
}

/**
 * The phone layout's pills: a real tab list. Arrow keys move along it, the
 * chosen pill is scrolled into the middle of the row (the ROW only, never the
 * page), and the first render does not scroll at all.
 */
function PhonePills({
  list,
  shown,
  onPick,
  baseId,
}: {
  list: Feature[];
  shown: number;
  onPick: (i: number) => void;
  baseId: string;
}) {
  const row = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = row.current;
    const tab = tabs.current[shown];
    if (!el || !tab) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({
      left: tab.offsetLeft - (el.clientWidth - tab.offsetWidth) / 2,
      behavior: reduce ? "auto" : "smooth",
    });
  }, [shown]);

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = Math.max(0, Math.min(list.length - 1, shown + step));
    onPick(next);
    tabs.current[next]?.focus();
  };

  return (
    <div
      ref={row}
      role="tablist"
      aria-label="Features"
      onKeyDown={onKey}
      className="lp-snap flex gap-2 overflow-x-auto px-5 py-1"
    >
      {list.map((f, i) => {
        const on = i === shown;
        return (
          <button
            key={f.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            id={`${baseId}-tab-${f.id}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`${baseId}-panel`}
            tabIndex={on ? 0 : -1}
            onClick={() => onPick(i)}
            className={cn(
              "flex h-10 shrink-0 items-center gap-2 rounded-full pl-2 pr-4 text-sm transition-colors duration-[var(--motion-base)] motion-reduce:transition-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on
                ? "bg-text-primary text-bg-base"
                : "bg-text-primary/[0.05] text-text-secondary ring-1 ring-inset ring-text-primary/8",
            )}
          >
            <span className="flex h-7 w-7 items-center justify-center [&_svg]:h-[18px] [&_svg]:w-[18px]">
              <f.Icon />
            </span>
            {f.short}
          </button>
        );
      })}
    </div>
  );
}

/** A horizontal swipe on the phone moves to the next or previous feature.
 *  Vertical movement is left to the page. */
function SwipeArea({
  children,
  onPrev,
  onNext,
}: {
  children: ReactNode;
  onPrev: () => void;
  onNext: () => void;
}) {
  const from = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      className="touch-pan-y"
      onPointerDown={(e) => {
        from.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const f = from.current;
        from.current = null;
        if (!f) return;
        const dx = e.clientX - f.x;
        const dy = e.clientY - f.y;
        if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return;
        if (dx < 0) onNext();
        else onPrev();
      }}
      onPointerCancel={() => {
        from.current = null;
      }}
    >
      {children}
    </div>
  );
}

/**
 * Turns `active` into `live` a beat later, so a screen is painted in its
 * starting state before its moment plays. Without the beat a freshly mounted
 * screen would render already finished and nothing would move.
 */
function useLive(active: boolean): boolean {
  const [live, setLive] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setLive(active), active ? 280 : 0);
    return () => window.clearTimeout(t);
  }, [active]);
  return live;
}

function Stage({ feature, counts, active }: { feature: Feature; counts: Counts; active: boolean }) {
  const live = useLive(active);
  const { Screen } = feature;
  return (
    <div
      className="lp-stage relative mx-auto w-fit"
      data-live={live ? "" : undefined}
    >
      <Phone label={feature.label} tab={feature.tab} chrome={feature.chrome ?? true}>
        <Screen live={live} counts={counts} />
      </Phone>
      {feature.callouts.map((c, n) => (
        <CalloutMark key={c.title} callout={c} order={n} />
      ))}
    </div>
  );
}

function CalloutMark({ callout, order }: { callout: Callout; order: number }) {
  const { x, y, side, py, ly } = callout;
  const delay = { transitionDelay: `${700 + order * 260}ms` } as CSSProperties;
  const phoneEdge = side === "right" ? PHONE_EDGE : 100 - PHONE_EDGE;
  const laptopEdge = side === "right" ? LAPTOP_EDGE : 100 - LAPTOP_EDGE;
  const place = (edge: number, top: number): CSSProperties =>
    side === "right" ? { left: `${edge}%`, top: `${top}%` } : { right: `${100 - edge}%`, top: `${top}%` };

  return (
    // The notes repeat what the phone's label already says, and the laptop
    // list says it again in text, so they are hidden from assistive tech.
    <div aria-hidden className="lp-co pointer-events-none absolute inset-0" style={delay}>
      <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1={phoneEdge} y1={py} x2={x} y2={y} className="lp-co-line lg:hidden" vectorEffect="non-scaling-stroke" />
        <line x1={laptopEdge} y1={ly} x2={x} y2={y} className="lp-co-line hidden lg:block" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="lp-co-dot" style={{ left: `${x}%`, top: `${y}%` }} />
      <Card callout={callout} className="lg:hidden" style={place(phoneEdge, py)} />
      <Card callout={callout} className="hidden lg:block" style={place(laptopEdge, ly)} />
    </div>
  );
}

function Card({ callout, className, style }: { callout: Callout; className: string; style: CSSProperties }) {
  return (
    <span className={cn("lp-co-card lp-float rounded-2xl px-3 py-2 lg:px-3.5 lg:py-2.5", className)} style={style}>
      {/* In rem, not px, so the notes grow with the rest of the page on a
          large monitor (see "A large monitor" in `globals.css`). */}
      <span className="block text-[0.75rem] leading-snug text-foreground lg:text-[0.8125rem]">{callout.title}</span>
      {callout.line ? (
        <span className="mt-0.5 hidden text-[0.75rem] leading-snug text-text-secondary lg:block">{callout.line}</span>
      ) : null}
    </span>
  );
}

function StageGlow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--text-primary) 6%, transparent) 0%, transparent 62%)",
        }}
      />
    </div>
  );
}
