import { CARD_EYEBROW, DATA_MONO } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

/**
 * THE APP'S HEARTBEAT, RE-RENDERED FOR STRANGERS.
 *
 * Today's log is what a Trackd user opens the app to do, so it is what the
 * landing page shows: three doses, one of them due, and the due one being
 * logged while you watch.
 *
 * ## Every idiom here is the app's own, not a lookalike
 *
 * The rows are `components/home/TodaysCycleCard.tsx`'s row: a 24px circle, a
 * `text-sm font-medium` label, a `DATA_MONO` line under it, and a right-railed
 * mono figure. The week rail is `components/home/WeekStrip.tsx`'s cell:
 * `rounded-xl px-2 py-1.5` on `bg-bg-input` for today, mono numerals, 10px
 * tracked day letters — and NO amber on any day, which is WeekStrip's own rule,
 * because amber is reserved for what is actually due.
 *
 * ## ⚠️ GENERIC LABELS, DELIBERATELY (Adrian, 2026-09-16)
 *
 * "Injectable A" rather than a real compound name. This is a public page that
 * an Apple reviewer reads, and naming substances on it buys nothing.
 *
 * ## ⚠️ THE FIGURES ARE A TIME AND A DOSE, NEVER A SCORE
 *
 * There is no completion percentage, no streak and no consistency figure
 * anywhere in this panel. Adrian rejected exactly that artefact. A dose, a
 * time and a site are facts the app records; a score is one it would be making
 * up to sell itself.
 */

interface WeekCell {
  day: string;
  date: string;
  today?: boolean;
}

/**
 * ⚠️ TYPED, NOT `as const`. Under `as const` each entry gets its own literal
 * type and `today` exists on exactly one of them, so reading `d.today` in the
 * map is a compile error on the other six.
 */
const WEEK: readonly WeekCell[] = [
  { day: "M", date: "29" },
  { day: "T", date: "30" },
  { day: "W", date: "1" },
  { day: "T", date: "2" },
  { day: "F", date: "3", today: true },
  { day: "S", date: "4" },
  { day: "S", date: "5" },
];

export function TodayPanel() {
  return (
    <div className="flow-card rounded-2xl bg-bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className={CARD_EYEBROW}>Today</p>
        <p className={cn(DATA_MONO, "tracking-[0.08em]")}>WEEK 5</p>
      </div>

      <div className="mt-3 flex items-center justify-between">
        {WEEK.map((d) => (
          <div
            key={`${d.day}-${d.date}`}
            aria-current={d.today ? "date" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl px-2 py-1.5",
              d.today && "bg-bg-input",
            )}
          >
            <span
              className={cn(
                "font-mono text-base tabular-nums",
                d.today ? "text-foreground" : "text-text-muted",
              )}
            >
              {d.date}
            </span>
            <span
              className={cn(
                "text-[10px] uppercase tracking-wide",
                d.today ? "text-text-muted" : "text-text-subtle",
              )}
              aria-hidden
            >
              {d.day}
            </span>
          </div>
        ))}
      </div>

      <ul className="mt-3 divide-hairline divide-border-default border-border-default">
        {/* ⚠️ `animationDelay` as an inline LONGHAND, never the `animation`
            shorthand. An inline shorthand outranks the reduced-motion block in
            globals.css and cannot be switched off from the stylesheet, which is
            the one motion trap this codebase has written down twice. */}
        <li
          className="animate-home-up flex items-center gap-3 py-2.5"
          style={{ animationDelay: "0ms" }}
        >
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-primary"
          >
            <svg width="13" height="13" viewBox="0 0 18 18" aria-hidden focusable="false">
              <path
                d="M4 9.3 L7.5 12.9 L14 5.6"
                fill="none"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-bg-base"
              />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              Injectable A
            </span>
            <span className={cn(DATA_MONO, "mt-0.5 block text-[13px]")}>250 mg · 8:10 am</span>
          </span>
          <span className={cn(DATA_MONO, "shrink-0 tracking-[0.08em]")}>L DELT</span>
        </li>

        {/* The due dose. It arrives in an amber ring and is logged at 900ms:
            the ring settles to white, the tick pops, one pulse goes out. That
            single moment is the product, and it is the only thing on this page
            that moves without being asked.

            ⚠️ ITS DETAIL LINE IS A TIME, NOT "due now". The row ENDS as a
            logged dose, and the first render put a finished white tick beside
            the words "due now", which is a panel arguing with itself. The
            amber ring carries "due" for the second it is true; the time is
            what is true afterwards, and afterwards is how the page sits. */}
        <li
          className="animate-home-up flex items-center gap-3 py-2.5"
          style={{ animationDelay: "90ms" }}
        >
          <span aria-hidden className="relative flex h-6 w-6 shrink-0 items-center justify-center">
            <span
              className="landing-ring absolute inset-0 rounded-full border border-accent-amber"
              style={{ animationDelay: "900ms" }}
            />
            <span
              className="animate-home-tick-ring absolute inset-0 rounded-full border border-accent-amber"
              style={{ animationDelay: "900ms" }}
            />
            <svg
              width="13"
              height="13"
              viewBox="0 0 18 18"
              className="animate-home-tick-pop relative"
              style={{ animationDelay: "940ms" }}
              aria-hidden
              focusable="false"
            >
              <path
                d="M4 9.3 L7.5 12.9 L14 5.6"
                fill="none"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-bg-base"
              />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              Peptide B
            </span>
            <span className={cn(DATA_MONO, "mt-0.5 block text-[13px]")}>500 mcg · 5:10 pm</span>
          </span>
          <span className={cn(DATA_MONO, "shrink-0 tracking-[0.08em]")}>SUB-Q</span>
        </li>

        <li
          className="animate-home-up flex items-center gap-3 py-2.5"
          style={{ animationDelay: "180ms" }}
        >
          <span
            aria-hidden
            className="h-6 w-6 shrink-0 rounded-full border border-border-strong"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              Supplement C
            </span>
            <span className={cn(DATA_MONO, "mt-0.5 block text-[13px]")}>5 g · 8:00 pm</span>
          </span>
          <span className={cn(DATA_MONO, "shrink-0 tracking-[0.08em]")}>ORAL</span>
        </li>
      </ul>

      <div className="mt-3 flex items-center justify-between border-border-default pt-3 hairline-t">
        <p className={CARD_EYEBROW}>Stock</p>
        <p className={cn(DATA_MONO, "text-[13px] tracking-[0.08em]")}>18 D · 9 D · 31 D</p>
      </div>
    </div>
  );
}
