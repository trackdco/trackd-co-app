import { CalendarBlank, CaretDown, Check, User } from "@/components/icons";
import { CategoryIcon } from "@/components/compounds/CategoryIcon";
import { Vial } from "@/components/containers";
import { sparkGeometry } from "@/lib/progress/spark";
import { CARD_EYEBROW, METRIC_VALUE, PAGE_TITLE, UNIT_SUFFIX } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

/**
 * THE DASHBOARD, FOR THE HERO PHONE.
 *
 * The screen a Trackd user opens every day, drawn with the app's own classes
 * (`TodaysCycleCard`'s rows and dividers, `WeekStrip`'s cells, the glance
 * cards) at the app's own size; `Phone` scales it.
 *
 * One thing moves: the due dose is LOGGED while you watch. Its amber ring
 * settles to the white tick at 900ms and the group's amber "1 due" becomes
 * "Logged". That is the app's heartbeat and the one moment the hero is built
 * around.
 *
 * REAL COMPOUND NAMES (Adrian, 2026-09-17: "instead of saying compound 1,
 * compound 2 ... make it actually say what it says"). This reverses his
 * 2026-09-16 call for generic labels; it is a preview with made-up data.
 * No score, streak or percentage anywhere.
 */

const WEEK = [
  { d: "29", w: "Mon", dot: true },
  { d: "30", w: "Tue", dot: true },
  { d: "1", w: "Wed", dot: true },
  { d: "2", w: "Thu", dot: true },
  { d: "3", w: "Fri", today: true },
  { d: "4", w: "Sat" },
  { d: "5", w: "Sun" },
];

const WEIGHT = [88.4, 88.1, 88.3, 87.9, 87.6, 87.8, 87.3, 87.1, 86.9, 87.0, 86.6, 86.4];

export function TodayScreen() {
  const spark = sparkGeometry(WEIGHT, 132, 40);
  return (
    <div className="space-y-5 px-5 pt-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">Friday, 3 October</p>
        <div className="mt-1 flex items-center justify-between">
          <h3 className={cn(PAGE_TITLE, "text-[32px]")}>Dashboard</h3>
          <span className="flex items-center gap-4 text-text-muted">
            <CaretDown className="h-5 w-5" />
            <CalendarBlank className="h-5 w-5" />
            <User className="h-5 w-5" />
          </span>
        </div>
      </div>

      <div className="grid grid-cols-7">
        {WEEK.map((c) => (
          <span key={c.d} className="flex flex-col items-center">
            <span
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5",
                c.today && "bg-bg-input",
              )}
            >
              <span
                className={cn(
                  "font-mono text-lg tabular-nums",
                  c.today ? "text-foreground" : "text-text-muted",
                )}
              >
                {c.d}
              </span>
              <span className="text-[9px] uppercase tracking-wide text-text-subtle">{c.w}</span>
              <span
                className={cn(
                  "mt-0.5 h-1 w-1 rounded-full",
                  c.today ? "bg-foreground" : c.dot ? "bg-text-muted" : "bg-transparent",
                )}
              />
            </span>
          </span>
        ))}
      </div>

      <section className="rounded-2xl bg-bg-surface p-5">
        <p className="text-2xl font-light tracking-[-0.02em] text-foreground">Good morning</p>
        <p className={cn(CARD_EYEBROW, "mt-3")}>Today&apos;s log</p>

        <div className="mt-4">
          <Group cat="anabolic" label="Anabolics" settled>
            <Row name="Testosterone Enanthate" detail="150mg · 7:00 AM" logged />
          </Group>
          <Group cat="peptide" label="Peptides">
            <Row name="BPC-157" detail="250mcg · 7:30 AM" logged />
            <DueRow name="Ipamorelin" detail="200mcg · 8:00 AM" />
          </Group>
          <Group cat="supplement" label="Supplements" settled>
            <Row name="Creatine Monohydrate" detail="5g · 8:15 AM" logged />
          </Group>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <section className="rounded-2xl bg-bg-surface p-5">
          <p className={CARD_EYEBROW}>Weight</p>
          <p className="mt-2 flex items-baseline gap-1.5">
            <span className={METRIC_VALUE}>86.4</span>
            <span className={UNIT_SUFFIX}>kg</span>
          </p>
          <svg viewBox="0 0 132 40" className="mt-3 w-full overflow-visible">
            <defs>
              <linearGradient id="lp-hero-weight" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-trend)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="var(--chart-trend)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={spark.area} fill="url(#lp-hero-weight)" />
            <path d={spark.line} fill="none" strokeWidth="2.5" strokeLinecap="round" className="stroke-chart-trend" />
          </svg>
        </section>
        <section className="flex flex-col items-center rounded-2xl bg-bg-surface p-5 text-center">
          <p className={cn(CARD_EYEBROW, "self-start")}>Next dose</p>
          <Vial colour="var(--cat-peptide)" fill={0.62} size={64} className="mt-3" />
          <p className="mt-2 text-sm text-foreground">BPC-157</p>
          <p className="font-mono text-xs tabular-nums text-text-muted">7:30 PM · 250mcg</p>
        </section>
      </div>
    </div>
  );
}

function Group({
  cat,
  label,
  settled = false,
  children,
}: {
  cat: string;
  label: string;
  /** Already logged. Otherwise it reads "1 due" until the due row is logged. */
  settled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 first:mt-2">
      <div className="flex items-center gap-2 px-1 pb-1">
        <CategoryIcon category={cat} className="h-3.5 w-3.5" />
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
          {label}
        </span>
        <span aria-hidden className="h-[0.5px] flex-1 bg-border-default" />
        {settled ? (
          <span className="text-[11px] text-text-subtle">Logged</span>
        ) : (
          <span className="relative">
            {/* "1 due" hands over to "Logged" as the due row is ticked. The base
                style of each is its FINAL state, so reduced motion shows the
                finished screen. */}
            <span
              className="lp-swap-out absolute right-0 whitespace-nowrap font-mono text-[11px] tabular-nums text-accent-amber"
              style={{ animationDelay: "900ms" }}
            >
              1 due
            </span>
            <span className="lp-swap-in text-[11px] text-text-subtle" style={{ animationDelay: "1000ms" }}>
              Logged
            </span>
          </span>
        )}
      </div>
      <ul className="px-1">{children}</ul>
    </div>
  );
}

function Row({ name, detail, logged }: { name: string; detail: string; logged?: boolean }) {
  return (
    <li className={cn("flex items-center gap-3 py-2", logged && "opacity-60")}>
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
          logged ? "border-accent-primary bg-accent-primary text-bg-base" : "border-border-strong",
        )}
      >
        {logged ? <Check className="h-3.5 w-3.5" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{name}</span>
        <span className="mt-0.5 block font-mono text-xs tabular-nums text-text-muted">{detail}</span>
      </span>
      <Dots />
    </li>
  );
}

/** The due dose, logged at 900ms. The ring and tick are `landing-ring` and the
 *  app's own `home-tick-*` keyframes; the row dims once it is done, as a logged
 *  row does in the app. */
function DueRow({ name, detail }: { name: string; detail: string }) {
  return (
    <li className="lp-row-done flex items-center gap-3 py-2" style={{ animationDelay: "1000ms" }}>
      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
        <span
          className="landing-ring absolute inset-0 rounded-full border border-accent-amber"
          style={{ animationDelay: "900ms" }}
        />
        <span
          className="animate-home-tick-ring absolute inset-0 rounded-full border border-accent-amber"
          style={{ animationDelay: "900ms" }}
        />
        <Check
          className="animate-home-tick-pop relative h-3.5 w-3.5 text-bg-base"
         
          style={{ animationDelay: "940ms" }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{name}</span>
        <span className="mt-0.5 block font-mono text-xs tabular-nums text-text-muted">{detail}</span>
      </span>
      <Dots />
    </li>
  );
}

function Dots() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center gap-[3px]">
      <span className="h-[3px] w-[3px] rounded-full bg-text-muted" />
      <span className="h-[3px] w-[3px] rounded-full bg-text-muted" />
      <span className="h-[3px] w-[3px] rounded-full bg-text-muted" />
    </span>
  );
}
