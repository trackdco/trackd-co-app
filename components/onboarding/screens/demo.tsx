"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { Vial } from "@/components/containers";
import { Check, Plus } from "@/components/icons";
import { track } from "@/lib/onboarding/analytics";
import {
  DEMO_COMPOUND,
  DEMO_JOURNAL,
  DEMO_PHOTO_WEEKS,
  DEMO_RECENT_SITES,
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
import { sparkGeometry, sparkLastPoint } from "@/lib/progress/spark";
import { CARD_EYEBROW, DATA_MONO, METRIC_LABEL } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { FlowCta, FlowSub, FlowTitle } from "../chrome";
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

/**
 * The reveal is deliberately unhurried (Adrian, 2026-08-01: "it should be a
 * smooth slow animation"). Three beats, not one:
 *
 *   0ms     the tick pops
 *   HOLD    it just sits there, so the log registers as a thing that happened
 *   RECEDE  the card eases up and dims
 *   then    the next card rises, only once the one above has settled
 *
 * Rushing this is what made it read as a page swap rather than a consequence.
 */
const TICK_HOLD_MS = 620;
const RECEDE_MS = 520;

/**
 * The minimum gap between two ADVANCES. A second one inside this window is
 * refused.
 *
 * The flow has this protection for step changes (`SETTLE_MS` in `flow.tsx`) and
 * the demo sat underneath it: `advance` changes the STAGE, never the step, so
 * nothing was disabled and the footer button is never remounted — same node,
 * same place, four stages. A deliberate double tap ran twice, and measured, it
 * did so at every gap from 0 to 700ms. 900 rather than 700 because a two-click
 * sequence carries its own latency: at a nominal 690ms gap the second tap still
 * landed outside a 700ms window and skipped the stage. The worst version is reachable through
 * the site auto-advance: tap a region, the map sits still for 1600ms, tap Next,
 * tap Next again, and you leave the demo having seen the look-back for about
 * fifty milliseconds with `demo_completed` logged as though you had watched it.
 *
 * Rate-limiting the ADVANCE, not the stage's arrival. The first version keyed
 * off how long the current stage had been on screen, which also refused a
 * perfectly deliberate FIRST tap from anyone quicker than the animation —
 * measured: a tap 660ms after the stock card arrived did nothing at all, which
 * is a worse bug than the one it fixed.
 */
const DOUBLE_ADVANCE_MS = 900;

/**
 * How long a stage sits before the Next button nudges (see `.animate-flow-nudge`).
 *
 * Adrian, 2026-08-01: the site stage used to advance ITSELF 1.6s after a region
 * was tapped, and he asked for it to stop — a body map is the thing people
 * linger on, and taking the screen away mid-look is the opposite of what it is
 * for. The nudge does the job the auto-advance was there to do (tell you the
 * way out exists) without making the decision for you.
 *
 * Seven seconds: long enough that anyone reading or tapping around is not
 * interrupted, short enough that someone who has stalled gets an answer.
 */
const NUDGE_AFTER_MS = 7000;
/** After a site is tapped the stage is finished, so the nudge comes sooner. */
const NUDGE_AFTER_TAP_MS = 1800;

const HEADINGS: Record<Stage, { title: string; sub: string }> = {
  log: {
    title: "Log a dose.",
    // Says which control and what it does, and nothing else. The old line
    // ("One tap. Watch what it moves.") was telling them how to feel about it.
    sub: "Tap the plus to log the sample compound.",
  },
  stock: {
    title: "Always know your stock.",
    // "You never do the maths" is gone: for a dosing tool that reads as
    // "do not check your work" (Adrian, 2026-08-01).
    sub: "Every dose you log comes off the vial.",
  },
  site: {
    title: "Never lose your last site.",
    sub: "Log where you pinned, and see at a glance which sites have rested.",
  },
  history: {
    title: "It all compounds.",
    // "It is all still there in six months" was killed by Adrian (2026-08-01)
    // for sounding like a storage guarantee rather than a reason to care. What
    // replaces it stays a statement about the RECORD, not about the user's
    // results: Trackd shows you the run, it does not claim to improve it.
    sub: "Track photos, weight, bloods and notes. See the whole run, not just today.",
  },
};

/** A card that has been stepped past: still there, quieter, out of the way. */
const RECEDED = "scale-[0.97] opacity-45";

/** Sample weight series for the look-back graph. Fixed, so it never renders flat. */
const DEMO_WEIGHTS = [86.4, 86.1, 85.5, 85.7, 85.0, 84.4, 84.6, 83.9];

/** A week of three compounds' schedules, drawn as the app draws it: one row of
 *  dots per compound. Named generically on purpose, so the demo never looks
 *  like a recommendation of anything in particular. */
const DEMO_SCHEDULE = [
  { name: "Compound 1", days: [true, false, false, true, false, false, true] },
  { name: "Compound 2", days: [false, false, true, false, false, true, false] },
  { name: "Peptide 1", days: [true, true, true, true, true, true, true] },
];

/** Monday first, as `ScheduleGrid` has it. */
const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

/** What was running across the window, under the photos. */
const DEMO_RUNNING = [
  { name: "Compound 1", detail: "250 mg", colour: "var(--cat-anabolic)" },
  { name: "Compound 2", detail: "100 mg", colour: "var(--cat-anabolic)" },
  { name: "Peptide 1", detail: "250 mcg", colour: "var(--cat-peptide)" },
];
/**
 * Slow, then fast, then slow. `cubic-bezier(0.65, 0, 0.35, 1)` is a symmetric
 * ease-in-out: it leaves gently, covers the distance, and settles rather than
 * arriving. An ease-OUT (which this was) starts at full speed, which is what
 * made the card look like it snapped (Adrian, 2026-08-01).
 */
const CARD_EASE = "cubic-bezier(0.65,0,0.35,1)";
/**
 * Written out in full, NOT interpolated. Tailwind extracts candidates from raw
 * source text, so a class built by template literal is never generated and the
 * element ends up with a class that matches no rule — which is exactly what
 * happened: the comment above explained the easing at length while the cards
 * quietly transitioned on the browser default.
 */
const CARD_MOTION =
  "transition-all duration-[760ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none";

export function DemoScreen() {
  const { goNext, todayKey, setBackHandler } = useFlow();
  const [stage, setStage] = useState<Stage>("log");
  const [logged, setLogged] = useState(false);
  // Set the moment the card starts receding, so the card below can wait for it
  // rather than both moving at once.
  const [receding, setReceding] = useState(false);
  const [stock, setStock] = useState<DemoStock>(DEMO_START);
  const [view, setView] = useState<DemoView>("front");
  // The LABEL is kept alongside the id: it arrives with the tap, and looking
  // it up again is what made the confirmation line unreachable.
  const [site, setSite] = useState<{ id: string; label: string } | null>(null);
  const [recent, setRecent] = useState<readonly string[]>(DEMO_RECENT_SITES);
  const fired = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The card the current stage just added, and the footer under everything.
   *  Both are scroll TARGETS now that the page is what scrolls. */
  const newestCardRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);

  const index = STAGES.indexOf(stage);

  // Back walks the stages before it leaves the demo. Losing the whole demo
  // because you wanted to look at the previous card again is the wrong answer
  // (Adrian, 2026-08-01).
  useEffect(() => {
    setBackHandler(() => {
      if (index <= 0) return false;
      // Cancel any pending auto-advance, for the same reason `advance` does:
      // both the empty-vial chain and the site-tap chain schedule a `setStage`,
      // and a timer that lands after the user has stepped BACK would drag them
      // forwards again past the screen they just asked to see.
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      const back = STAGES[index - 1];
      // Returning to `log` has to put the card BACK. It kept `logged` and
      // `receding`, so stepping back landed on a dimmed card with a collapsed,
      // disabled tick, under the instruction "Tap the plus to log the sample
      // compound" and no plus to tap. Measured at 0.45 opacity.
      if (back === "log") {
        setLogged(false);
        setReceding(false);
        setStock(DEMO_START);
        fired.current = false;
      }
      setStage(back);
      return true;
    });
    return () => setBackHandler(null);
  }, [index, setBackHandler]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /**
   * THE PAGE is what scrolls, in two beats.
   *
   * This used to call `scrollTo` on the card column, which stopped being a
   * scroll container the moment the pinned layout came out — so it silently did
   * nothing, and on the site stage the Next button sat at 829px in an 844
   * viewport with nothing to bring it up. Measured. That is the "there's no
   * Next button" Adrian hit: it was there, 221px below the fold on his phone,
   * and the nudge pointing at it was off-screen too.
   *
   * Beat one, here: a new stage arrives, so bring the TOP of the new card into
   * view. You want to see the thing that just appeared, not the button under it.
   */
  useEffect(() => {
    if (index === 0) return;
    const el = newestCardRef.current;
    if (!el) return;
    const id = window.setTimeout(
      () => el.scrollIntoView({ block: "start", behavior: "smooth" }),
      140,
    );
    return () => window.clearTimeout(id);
  }, [index]);

  /**
   * Beat two: the stage's action is DONE, so bring the Next button into view.
   * Fires from the same places that arm the nudge, so the button glides up and
   * lifts rather than nudging somewhere nobody can see.
   */
  const revealNext = () => {
    window.setTimeout(
      () => footerRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }),
      420,
    );
  };

  /** The tap that starts everything. Guarded so a double-tap fires once. */
  const onLog = () => {
    if (fired.current) return;
    fired.current = true;
    setLogged(true);
    setStock(logDemoDose(DEMO_START));
    track("demo_dose_logged", { stage: "log" });
    // Let the tick be seen, then start the card moving, then bring in the next.
    timer.current = setTimeout(() => {
      setReceding(true);
      timer.current = setTimeout(() => setStage("stock"), RECEDE_MS);
    }, TICK_HOLD_MS);
  };

  /** When `advance` last ran. See `DOUBLE_ADVANCE_MS`. A ref, not state: it is
   *  read inside a handler and never rendered. */
  const lastAdvanceAt = useRef(0);

  /**
   * Which stage the nudge is armed for, rather than a bare boolean.
   *
   * Derived comparison (`nudgeFor === stage`) means a stage change disarms it
   * for free, with no `setState` in an effect body — which the lint rule
   * rightly forbids and which a boolean would have needed.
   */
  const [nudgeFor, setNudgeFor] = useState<Stage | null>(null);
  const nudging = nudgeFor === stage;
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armNudge = (forStage: Stage, delay: number) => {
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => setNudgeFor(forStage), delay);
  };

  // Every stage arms its own nudge on arrival.
  useEffect(() => {
    const id = setTimeout(() => setNudgeFor(stage), NUDGE_AFTER_MS);
    return () => clearTimeout(id);
  }, [stage]);

  useEffect(
    () => () => {
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    },
    [],
  );

  const advance = () => {
    // Refuse a SECOND advance inside the window. A first tap is never blocked,
    // however quick the user is.
    const now = Date.now();
    if (now - lastAdvanceAt.current < DOUBLE_ADVANCE_MS) return;
    lastAdvanceAt.current = now;
    // Taking the action the nudge was pointing at ends it.
    setNudgeFor(null);
    if (nudgeTimer.current) {
      clearTimeout(nudgeTimer.current);
      nudgeTimer.current = null;
    }
    // Cancel any pending auto-advance first. The tick chain, the vial-empty
    // chain and the site-tap chain all schedule a `setStage`, and a user who
    // taps the CTA inside that window used to be YANKED BACKWARDS when the
    // older timer landed after their tap. Measured: tap, Next, Next lands on
    // site then snaps to stock.
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
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
    <div className="flex flex-1 flex-col px-5 pt-2">
      <header
        className={cn(
          "shrink-0 space-y-3 text-center transition-[padding-top] duration-[760ms] motion-reduce:transition-none",
          // At the first stage the headline drops toward the card it belongs
          // to, instead of sitting alone at the top of an empty screen.
          // Far enough down that the headline and its card sit as one group in
          // the middle of the screen, rather than the pair hugging the top with
          // a hole beneath them.
          index === 0 ? "pt-32" : "pt-0",
        )}
        style={{ transitionTimingFunction: CARD_EASE }}
      >
        {/* No eyebrow. It was a label on a screen that does not need one, and
            the headline already says what this is (Adrian, 2026-08-01).
            Keyed so the headline cross-fades as the subject changes. */}
        <div key={stage} className="animate-flow-in space-y-3">
          <FlowTitle>{heading.title}</FlowTitle>
          <FlowSub className="mx-auto max-w-[20rem]">{heading.sub}</FlowSub>
        </div>
      </header>

      {/* The stack EASES UP rather than jumping. Flex alignment is not
          animatable, so the movement is carried by top padding, which is: at
          stage one the group sits low and centred under the headline, and as
          cards arrive the padding collapses and the whole column glides up on
          the same slow-fast-slow curve the cards use. */}
      <div
        className={cn(
          "flex flex-1 flex-col justify-start gap-3 pb-2",
          "transition-[padding-top] duration-[760ms] motion-reduce:transition-none",
          index === 0 ? "pt-6" : "pt-4",
        )}
        style={{ transitionTimingFunction: CARD_EASE }}
      >
        {!showHistory && (
          <>
            <CompoundCard
              logged={logged}
              receded={receding || index > 0}
              onLog={onLog}
            />

            {index >= 1 && (
              <StockCard
                cardRef={index === 1 ? newestCardRef : undefined}
                stock={stock}
                todayKey={todayKey}
                receded={index > 1}
                empty={empty}
                onLogAnother={() => {
                  if (empty) return;
                  const next = logDemoDose(stock);
                  setStock(next);
                  track("demo_dose_logged", { stage: "stock" });
                  // RUNNING OUT is what moves you on. Adrian's note was that a
                  // Next button at the foot of the screen is not obvious enough
                  // to be the way forward, and a vial emptying is a natural
                  // ending: you have seen the number fall to nothing, so there
                  // is nothing left to demonstrate here.
                  if (isDemoEmpty(next)) {
                    timer.current = setTimeout(() => setStage("site"), 1100);
                  }
                }}
              />
            )}

            {index >= 2 && (
              <SiteCard
                cardRef={index === 2 ? newestCardRef : undefined}
                view={view}
                setView={setView}
                site={site}
                recent={recent}
                onTap={(id, label) => {
                  setSite({ id, label });
                  setRecent((r) => pushRecentSite(r, label));
                  // Tapping a site FINISHES this stage, so the Next button
                  // nudges shortly after. It used to advance the stage itself,
                  // and Adrian killed that (2026-08-01): a body map is the
                  // thing people linger on, and taking it away mid-look is the
                  // opposite of what it is there for. The way out is offered,
                  // not taken for them.
                  armNudge("site", NUDGE_AFTER_TAP_MS);
                  revealNext();
                }}
              />
            )}
          </>
        )}

        {showHistory && <HistoryPanel cardRef={newestCardRef} />}
      </div>

      <footer
        ref={footerRef}
        className="shrink-0 space-y-3 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        {stage === "log" && !logged ? (
          <p className="text-center text-xs text-text-subtle">Tap to log</p>
        ) : (
          // Appears the moment there is somewhere to go. Adrian's note was that
          // he would not have known to press Continue, so it arrives WITH the
          // new card rather than sitting there through the whole screen.
          // TWO elements, not two classes on one. Both `animate-flow-in` and
          // `animate-flow-nudge` set the `animation` shorthand, so on a single
          // element one simply wins: measured, `flow-in` did, and the nudge
          // never played despite its class being present. The entrance owns the
          // outer node and the nudge owns the inner one.
          <div className="animate-flow-in">
            <div className={cn(nudging && "animate-flow-nudge")}>
              <FlowCta onClick={advance}>
                {stage === "history" ? "Continue" : "Next"}
              </FlowCta>
            </div>
          </div>
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
        "flow-card shrink-0 rounded-2xl bg-bg-surface p-5",
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
              // A plus, not the figure: the figure is already on the row, and
              // the control should say "add one of these" (Adrian, 2026-08-01).
              <Plus className="h-6 w-6" weight="bold" />
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
  cardRef,
}: {
  stock: DemoStock;
  todayKey: string;
  receded: boolean;
  empty: boolean;
  onLogAnother: () => void;
  cardRef?: React.Ref<HTMLDivElement>;
}) {
  const projected = formatDemoDate(demoProjectedEmpty(stock, todayKey));

  return (
    <div
      ref={cardRef}
      className={cn(
        "animate-flow-in flow-card shrink-0 rounded-2xl bg-bg-surface p-5",
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
  cardRef,
}: {
  view: DemoView;
  setView: (v: DemoView) => void;
  site: { id: string; label: string } | null;
  recent: readonly string[];
  onTap: (id: string, label: string) => void;
  cardRef?: React.Ref<HTMLDivElement>;
}) {
  // The label comes straight from the tap. It used to be looked up in
  // DEMO_SITES by id, but those ids ("l_delt") are a different scheme from the
  // real artwork's ("im-delt-l"), so the lookup never matched and this line
  // never rendered.
  const selectedLabel = site?.label ?? null;

  return (
    <div
      ref={cardRef}
      className="animate-flow-in flow-card shrink-0 space-y-4 rounded-2xl bg-bg-surface p-5"
    >
      <Segmented
        label="Body view"
        value={view}
        onChange={setView}
        options={[
          { value: "front", label: "Front" },
          { value: "back", label: "Back" },
        ]}
      />

      <DemoBody view={view} selected={site?.id ?? null} onTap={onTap} />

      <div aria-live="polite">
        {selectedLabel ? (
          <p className={cn(DATA_MONO, "uppercase tracking-[0.08em] text-foreground")}>
            {/* Not "rotation updated": the app RECORDS where you pinned, it
                does not manage a rotation for you (Invariant 4). Same reason
                the celebrate answer stopped saying it. */}
            Logged: {selectedLabel}
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

/* ------------------------------------------------------------------------- */

const SPARK_W = 132;
const SPARK_H = 44;
/** The real card's window. Same figure, so the two smooth identically. */
const TREND_WINDOW = 7;

/** Trailing simple moving average, exactly as `WeightGlanceCard` computes it. */
function movingAverage(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

/**
 * The demo's Weight card, with a WORKING Trend / Scale toggle (Adrian,
 * 2026-08-01).
 *
 * It is the app's own card, reduced to what fits in half a phone: the two
 * series crossfade by opacity rather than swapping, the trend keeps its 2.5
 * stroke over a tapered fill and the raw Scale line stays thinner and unfilled,
 * which is the one distinction `ui-context.md` → Charts says must never
 * collapse. Opening on `scale` matches the real card, which never auto-selects
 * the smoothed line.
 *
 * A dead control would have been the easier build and the worse demo: the whole
 * screen exists to say "this is the app", and the first thing a curious person
 * does is press the thing that looks pressable.
 */
function DemoWeightCard({ style }: { style: CSSProperties }) {
  const [mode, setMode] = useState<"trend" | "scale">("scale");

  const scale = DEMO_WEIGHTS;
  const trend = movingAverage(DEMO_WEIGHTS, TREND_WINDOW);
  const shown = mode === "trend" ? trend : scale;
  const last = shown[shown.length - 1];
  const delta = last - shown[0];

  return (
    <div className="animate-flow-in flow-card flex flex-col rounded-2xl bg-bg-surface p-4" style={style}>
      <p className={CARD_EYEBROW}>Weight</p>

      <p className="mt-2 font-mono text-xl font-light tabular-nums leading-none text-foreground">
        {last.toFixed(1)}
        <span className="ml-1 text-[11px] text-text-muted">kg</span>
      </p>
      <p className="mt-1 font-mono text-[11px] tabular-nums text-text-muted">
        {delta >= 0 ? "+" : "−"}
        {Math.abs(delta).toFixed(1)} kg <span className="font-sans">{mode}</span>
      </p>

      <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} className="mt-2 h-9 w-full" aria-hidden>
        <defs>
          <linearGradient id="demoWeightFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-trend)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-trend)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <DemoSpark vals={scale} colour="var(--chart-line)" active={mode === "scale"} raw />
        <DemoSpark vals={trend} colour="var(--chart-trend)" active={mode === "trend"} />
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-1 rounded-full border border-border-default bg-bg-input p-0.5 text-[11px]">
        {(["trend", "scale"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={cn(
              "rounded-full py-1 font-medium transition-colors duration-300 ease-out",
              // The real card's trick for keeping a 25px pill a 44px target.
              "relative before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-['']",
              mode === m ? "bg-bg-surface-raised text-foreground" : "text-text-muted",
            )}
          >
            {m === "trend" ? "Trend" : "Scale"}
          </button>
        ))}
      </div>
    </div>
  );
}

function DemoSpark({
  vals,
  colour,
  active,
  raw = false,
}: {
  vals: number[];
  colour: string;
  active: boolean;
  raw?: boolean;
}) {
  const geo = sparkGeometry(vals, SPARK_W, SPARK_H);
  const last = sparkLastPoint(vals, SPARK_W, SPARK_H);
  return (
    <g
      className={cn(
        "transition-opacity duration-300 ease-out motion-reduce:transition-none",
        active ? "opacity-100" : "opacity-0",
      )}
    >
      {raw ? null : <path d={geo.area} fill="url(#demoWeightFill)" stroke="none" />}
      <path
        d={geo.line}
        fill="none"
        stroke={colour}
        strokeWidth={raw ? 1.5 : 2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {last ? <circle cx={last.x} cy={last.y} r={2.5} fill="var(--accent-primary)" /> : null}
    </g>
  );
}

/** The look-back. A clean break: a different subject deserves its own surface. */
function HistoryPanel({ cardRef }: { cardRef?: React.Ref<HTMLDivElement> }) {
  // Each card arrives on its own, in the order you would read them. A block
  // that appears all at once reads as a page; one that assembles reads as
  // something being shown to you (Adrian, 2026-08-01).
  const rise = (i: number) => ({ animationDelay: `${i * 160}ms` });

  return (
    <div ref={cardRef} className="space-y-3">
      <div className="animate-flow-in flow-card rounded-2xl bg-bg-surface p-5" style={rise(0)}>
        <p className={CARD_EYEBROW}>Progress photos</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {DEMO_PHOTO_WEEKS.map((week, i) => (
            <div key={week} className="space-y-1.5">
              <MirrorPhoto index={i} />
              <p className="text-center text-[9px] font-sans uppercase tracking-[0.12em] text-text-subtle">
                {week}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* What was running across those weeks. This is `PhotoRunningList`'s row
          treatment verbatim (Adrian, 2026-08-01): a container leading, the name,
          the amount right-railed in mono, each row on its own raised pill rather
          than separated by a hairline. A demo that shows a Running list the user
          will not recognise an hour later is the one thing a demo must not do. */}
      <div className="animate-flow-in flow-card rounded-2xl bg-bg-surface p-5" style={rise(1)}>
        <p className={CARD_EYEBROW}>Running</p>
        <ul className="mt-2 space-y-1.5">
          {DEMO_RUNNING.map((c) => (
            <li
              key={c.name}
              className="flex items-center gap-3 rounded-xl bg-bg-surface-raised px-3 py-2.5"
            >
              <Vial colour={c.colour} fill={0.7} size={28} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {c.name}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">
                {c.detail}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Weight beside the schedule, the way Progress lays them out. */}
      <div className="grid grid-cols-2 gap-3">
        <DemoWeightCard style={rise(2)} />

        {/* The schedule, in `ScheduleGrid`'s language: day initials across the
            top, one row of marks per compound, logged as a solid white dot and
            a day with nothing due as the small `border-default` tick rather
            than a hollow ring. Half a phone wide, so the compound name sits
            above its row instead of in the app's 38% left column. */}
        <div className="animate-flow-in flow-card rounded-2xl bg-bg-surface p-4" style={rise(3)}>
          <p className={CARD_EYEBROW}>Schedule</p>

          <div className="mt-3 grid grid-cols-7 gap-1">
            {DAY_INITIALS.map((d, i) => (
              <span
                key={i}
                className="text-center text-[9px] font-medium uppercase tracking-wide text-text-subtle"
              >
                {d}
              </span>
            ))}
          </div>

          <div className="mt-1.5 space-y-2">
            {DEMO_SCHEDULE.map((row) => (
              <div key={row.name} className="space-y-1">
                <p className="text-[9px] font-sans uppercase tracking-[0.12em] text-text-subtle">
                  {row.name}
                </p>
                <div className="grid grid-cols-7 gap-1">
                  {row.days.map((on, c) => (
                    <span key={c} className="flex h-3 items-center justify-center">
                      <span
                        aria-hidden
                        className={cn(
                          "rounded-full",
                          on ? "h-2.5 w-2.5 bg-accent-primary" : "h-1 w-1 bg-border-default",
                        )}
                      />
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="animate-flow-in flow-card rounded-2xl bg-bg-surface p-5" style={rise(4)}>
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

/**
 * A progress photo, unreadably blurred.
 *
 * Adrian asked for something that reads as "someone taking a photo in a
 * mirror" rather than an empty tile, without shipping a picture of an actual
 * person. So it is drawn: a bright vertical band for the mirror, a soft mass
 * where a torso would be, a highlight where a phone would be held, and enough
 * blur that no detail survives. It suggests the shape of the thing and nothing
 * else.
 */
function MirrorPhoto({ index }: { index: number }) {
  // Each tile leans slightly differently so three in a row do not look stamped.
  const shift = [46, 52, 49][index % 3];
  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-bg-surface-raised">
      <div
        aria-hidden
        className="absolute inset-0 blur-[9px]"
        style={{
          background: `
            linear-gradient(100deg, transparent 0%, color-mix(in srgb, var(--text-primary) 6%, transparent) 38%, transparent 62%),
            radial-gradient(30% 16% at ${shift}% 20%, color-mix(in srgb, var(--text-muted) 46%, transparent), transparent 72%),
            radial-gradient(40% 34% at ${shift}% 52%, color-mix(in srgb, var(--text-muted) 40%, transparent), transparent 76%),
            radial-gradient(12% 8% at ${shift + 16}% 44%, color-mix(in srgb, var(--text-primary) 34%, transparent), transparent 80%),
            radial-gradient(34% 26% at ${shift}% 86%, color-mix(in srgb, var(--text-subtle) 44%, transparent), transparent 78%)
          `,
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-bg-surface-raised/70 to-transparent"
      />
    </div>
  );
}
