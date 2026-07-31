"use client";

import { useEffect, useRef, useState } from "react";

import { Vial } from "@/components/containers";
import { Check, ImageSquare } from "@/components/icons";
import { track } from "@/lib/onboarding/analytics";
import {
  DEMO_COMPOUND,
  DEMO_CONSISTENCY,
  DEMO_JOURNAL,
  DEMO_PHOTO_WEEKS,
  DEMO_RECENT_SITES,
  DEMO_SITES,
  DEMO_START,
  demoFill,
  demoProjectedEmpty,
  formatDemoDate,
  isDemoEmpty,
  logDemoDose,
  pushRecentSite,
  type DemoStock,
  type DemoView,
} from "@/lib/onboarding/demo";
import { CARD_EYEBROW, DATA_MONO, METRIC_LABEL } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { FlowCta } from "../chrome";
import { Segmented } from "../controls";
import { DemoBody } from "../demo-body";
import { useFlow } from "../flow-context";

/**
 * The demo, on ONE surface (Spec 3-01 §9 screens 5-8, restructured by Adrian
 * 2026-07-31).
 *
 * It used to be four routes. His note was that walking between pages broke the
 * illusion the demo exists to create: tapping log should MOVE the thing next to
 * it, not navigate somewhere. So logging a dose now slides the compound card up
 * into a compact logged row and floats the stock card in underneath it, on the
 * same screen, exactly as the real dashboard behaves.
 *
 * Stages accumulate: log, then stock beneath it, then the body map beneath
 * that. History is the one clean break, because it is a different subject: the
 * three cards fade away together and the look-back rises in their place.
 *
 * Everything is throwaway state. Nothing here writes to a cycle, a schedule, a
 * log table, or either device store.
 */

const STAGES = ["log", "stock", "site", "history"] as const;
type Stage = (typeof STAGES)[number];

/** How long the tick is allowed to land before the stock card arrives. */
const REVEAL_MS = 560;

const HEADINGS: Record<Stage, { title: string; sub: string }> = {
  log: {
    title: "Log a dose.",
    sub: "One tap. Watch what it moves.",
  },
  stock: {
    title: "Always know your stock.",
    sub: "Every dose comes off the vial. You never do the maths.",
  },
  site: {
    title: "Never lose your last site.",
    sub: "Tap where you pinned. Trackd keeps the record, you set the rotation.",
  },
  history: {
    title: "It all compounds.",
    sub: "Photos, bloods and notes, against the protocol that produced them.",
  },
};

/** A card that has been stepped past: still there, quieter, out of the way. */
const RECEDED = "scale-[0.97] opacity-45";
const CARD_MOTION =
  "transition-all duration-[var(--motion-slow)] ease-[var(--motion-ease)] motion-reduce:transition-none";

export function DemoScreen() {
  const { goNext, todayKey } = useFlow();
  const [stage, setStage] = useState<Stage>("log");
  const [logged, setLogged] = useState(false);
  const [stock, setStock] = useState<DemoStock>(DEMO_START);
  const [view, setView] = useState<DemoView>("front");
  const [site, setSite] = useState<string | null>(null);
  const [recent, setRecent] = useState<readonly string[]>(DEMO_RECENT_SITES);
  const fired = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const index = STAGES.indexOf(stage);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Each new stage arrives below the last, so bring it into view.
  useEffect(() => {
    if (index === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    const id = window.setTimeout(
      () => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }),
      120,
    );
    return () => window.clearTimeout(id);
  }, [index]);

  /** The tap that starts everything. Guarded so a double-tap fires once. */
  const onLog = () => {
    if (fired.current) return;
    fired.current = true;
    setLogged(true);
    setStock(logDemoDose(DEMO_START));
    track("demo_dose_logged", { stage: "log" });
    timer.current = setTimeout(() => setStage("stock"), REVEAL_MS);
  };

  const advance = () => {
    const next = STAGES[index + 1];
    if (next) {
      setStage(next);
      return;
    }
    track("demo_completed");
    goNext();
  };

  const heading = HEADINGS[stage];
  const empty = isDemoEmpty(stock);
  const showHistory = stage === "history";

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pt-2">
      <header className="shrink-0 space-y-3 text-center">
        <p className={cn(CARD_EYEBROW, "text-center")}>Try it</p>
        {/* Keyed so the headline cross-fades as the subject changes. */}
        <div key={stage} className="animate-flow-in space-y-3">
          <h1 className="text-balance text-[2rem] font-light leading-[1.05] tracking-[-0.02em] text-foreground">
            {heading.title}
          </h1>
          <p className="mx-auto max-w-[20rem] text-pretty text-[0.95rem] leading-relaxed text-text-muted">
            {heading.sub}
          </p>
        </div>
      </header>

      <div
        ref={scrollRef}
        className={cn(
          "mt-7 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2",
          // One card on its own centres; once they start stacking they run
          // from the top so each new one arrives BELOW the last rather than
          // shoving the whole group around.
          index === 0 ? "justify-center" : "justify-start",
        )}
      >
        {!showHistory && (
          <>
            <CompoundCard
              logged={logged}
              receded={index > 0}
              onLog={onLog}
            />

            {index >= 1 && (
              <StockCard
                stock={stock}
                todayKey={todayKey}
                receded={index > 1}
                empty={empty}
                onLogAnother={() => {
                  if (empty) return;
                  setStock(logDemoDose(stock));
                  track("demo_dose_logged", { stage: "stock" });
                }}
              />
            )}

            {index >= 2 && (
              <SiteCard
                view={view}
                setView={setView}
                site={site}
                recent={recent}
                onTap={(id, label) => {
                  setSite(id);
                  setRecent((r) => pushRecentSite(r, label));
                }}
              />
            )}
          </>
        )}

        {showHistory && <HistoryPanel />}
      </div>

      <footer className="shrink-0 space-y-3 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {stage === "log" ? (
          <p className="text-center text-xs text-text-subtle">
            Tap the circle to log
          </p>
        ) : (
          <FlowCta onClick={advance}>Continue</FlowCta>
        )}
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function CompoundCard({
  logged,
  receded,
  onLog,
}: {
  logged: boolean;
  receded: boolean;
  onLog: () => void;
}) {
  return (
    <div
      className={cn(
        "shrink-0 rounded-2xl bg-bg-surface p-5",
        CARD_MOTION,
        receded && RECEDED,
      )}
    >
      <div className="flex items-center gap-4">
        <Vial
          colour="var(--cat-anabolic)"
          fill={logged ? 0.95 : 1}
          size={receded ? 38 : 52}
          className={CARD_MOTION}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.95rem] text-foreground">
            {DEMO_COMPOUND.name}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {DEMO_COMPOUND.concentrationMgPerMl} mg/mL
          </p>
        </div>

        {/* The control collapses into the app's own logged-dose tick once it
            has been used, which is what makes the card read as a row in a real
            log rather than a demo prop. */}
        <div className="relative flex shrink-0 items-center justify-center">
          {logged && !receded ? (
            <span
              aria-hidden
              className="animate-home-tick-ring pointer-events-none absolute h-14 w-14 rounded-full border border-accent-primary"
            />
          ) : null}

          <button
            type="button"
            onClick={onLog}
            disabled={logged}
            aria-label={`Log ${DEMO_COMPOUND.doseMl} mL of the sample compound`}
            className={cn(
              "flex items-center justify-center rounded-full",
              CARD_MOTION,
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-bg-base",
              receded ? "h-6 w-6" : "h-14 w-14",
              logged
                ? "bg-accent-primary text-bg-base"
                : "border-2 border-accent-amber bg-transparent text-accent-amber active:scale-95",
            )}
          >
            {logged ? (
              <Check
                className={cn(receded ? "h-3.5 w-3.5" : "h-6 w-6", "animate-home-tick-pop")}
                weight="bold"
              />
            ) : (
              <span className="font-mono text-[11px] tabular-nums">
                {DEMO_COMPOUND.doseMl.toFixed(1)}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function StockCard({
  stock,
  todayKey,
  receded,
  empty,
  onLogAnother,
}: {
  stock: DemoStock;
  todayKey: string;
  receded: boolean;
  empty: boolean;
  onLogAnother: () => void;
}) {
  const projected = formatDemoDate(demoProjectedEmpty(stock, todayKey));

  return (
    <div
      className={cn(
        "animate-flow-in shrink-0 rounded-2xl bg-bg-surface p-5",
        CARD_MOTION,
        receded && RECEDED,
      )}
    >
      <div className="flex items-center gap-4">
        <Vial
          colour="var(--cat-anabolic)"
          fill={demoFill(stock)}
          size={receded ? 44 : 76}
          className={CARD_MOTION}
          title={`Sample vial, ${stock.remainingMl.toFixed(1)} millilitres remaining`}
        />

        <div className="min-w-0 flex-1 divide-y divide-border-default">
          <StatRow label="Remaining" value={stock.remainingMl.toFixed(1)} unit="mL" />
          <StatRow label="Doses left" value={String(stock.dosesLeft)} />
          <StatRow label="Projected empty" value={projected} />
        </div>
      </div>

      {!receded && (
        <button
          type="button"
          onClick={onLogAnother}
          disabled={empty}
          className={cn(
            "mt-4 h-11 w-full rounded-xl text-[0.85rem]",
            "transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "motion-reduce:transition-none",
            empty
              ? "bg-bg-base text-text-subtle"
              : "bg-bg-surface-raised text-foreground active:scale-[0.98]",
          )}
        >
          {empty ? "Vial empty" : `Log another ${DEMO_COMPOUND.doseMl.toFixed(1)} mL`}
        </button>
      )}
    </div>
  );
}

function StatRow({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className={METRIC_LABEL}>{label}</span>
      <span className="font-mono text-base font-light tabular-nums text-foreground">
        {value}
        {unit ? <span className="ml-1 text-[11px] text-text-muted">{unit}</span> : null}
      </span>
    </div>
  );
}

function SiteCard({
  view,
  setView,
  site,
  recent,
  onTap,
}: {
  view: DemoView;
  setView: (v: DemoView) => void;
  site: string | null;
  recent: readonly string[];
  onTap: (id: string, label: string) => void;
}) {
  const selectedLabel = DEMO_SITES.find((s) => s.id === site)?.label ?? null;

  return (
    <div className="animate-flow-in shrink-0 space-y-4 rounded-2xl bg-bg-surface p-5">
      <Segmented
        label="Body view"
        value={view}
        onChange={setView}
        options={[
          { value: "front", label: "Front" },
          { value: "back", label: "Back" },
        ]}
      />

      <DemoBody view={view} selected={site} onTap={onTap} />

      <div aria-live="polite">
        {selectedLabel ? (
          <p className={cn(DATA_MONO, "uppercase tracking-[0.08em] text-foreground")}>
            Logged: {selectedLabel} · rotation updated
          </p>
        ) : (
          <p className={cn(DATA_MONO, "uppercase tracking-[0.08em]")}>
            Last 3: {recent.join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

/** The look-back. A clean break: a different subject deserves its own surface. */
function HistoryPanel() {
  return (
    <div className="animate-flow-in space-y-3">
      <div className="rounded-2xl bg-bg-surface p-5">
        <p className={CARD_EYEBROW}>Progress photos</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {DEMO_PHOTO_WEEKS.map((week) => (
            <div key={week} className="space-y-1.5">
              {/* A deliberately unreadable stand-in: the shape of a posed photo
                  with none of a real one. A stock body shot would be the wrong
                  promise and a real one is not ours to show. */}
              <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl bg-bg-surface-raised">
                <div
                  aria-hidden
                  className="absolute inset-0 blur-[10px]"
                  style={{
                    background:
                      "radial-gradient(60% 45% at 50% 32%, color-mix(in srgb, var(--text-muted) 32%, transparent), transparent 70%), radial-gradient(46% 38% at 50% 74%, color-mix(in srgb, var(--text-subtle) 42%, transparent), transparent 72%)",
                  }}
                />
                <ImageSquare className="relative h-5 w-5 text-text-subtle" />
              </div>
              <p className="text-center text-[9px] font-sans uppercase tracking-[0.12em] text-text-subtle">
                {week}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-bg-surface p-5">
        <p className={CARD_EYEBROW}>Consistency · 28 days</p>
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {DEMO_CONSISTENCY.map((day, i) => (
            <span
              key={i}
              className={cn(
                "aspect-square rounded-[3px]",
                day === "logged" && "bg-accent-primary/85",
                day === "missed" && "border-[0.5px] border-border-strong",
                day === "off" && "bg-bg-surface-raised",
              )}
            />
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-bg-surface p-5">
        <p className={CARD_EYEBROW}>Journal</p>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-foreground">
          &ldquo;{DEMO_JOURNAL.quote}&rdquo;
        </p>
        <p className="mt-1.5 font-mono text-[11px] tabular-nums text-text-muted">
          {DEMO_JOURNAL.day}
        </p>
      </div>
    </div>
  );
}
