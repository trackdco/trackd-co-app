import Image from "next/image";

import { BUSINESS_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * THE COMPARISON TABLE (spec 3-03 §3.6).
 *
 * `Feature | A notes app | Trackd`, crosses down one column and ticks down the
 * other, and then a last row that turns it round on purpose: the feature is a
 * BAD one, so the notes app has it and Trackd does not.
 *
 * ## How the inversion reads as a point rather than a mistake
 *
 * The Trackd column is lit the whole way down. The MARK follows the symbol,
 * not the column (Adrian, 2026-09-17): a tick is always the filled white one
 * and a cross is always the muted outline one, so on the last row the two swap
 * sides, and the flip is the punchline.
 *
 * ## ⚠️ THE COLUMN USED TO SAY "OTHER APPS", AND THAT IS WHY IT DOES NOT
 *
 * Every row here is true OF TRACKD. What made the old column a problem was not
 * the wording of the rows, it was the cross beside them: "Other apps" turned
 * each line into a factual claim about competitors, and a market survey found
 * five of the seven falsified by rivals' own marketing. My TRT App sells "11
 * anatomical injection sites, colour-coded by rest level". StackTrax
 * "auto-decrements as you log doses". Peptide Deck markets itself on publishing
 * more than the units. TRT+ and Dose both cover peptides, anabolics and
 * supplements. app.peptiq.io serves a working PWA.
 *
 * Against a NOTES APP every cross is simply true, and the page finally agrees
 * with itself: the hero, the features heading and the closing line all name the
 * notes app as the thing you are leaving. This table was the one place that
 * switched enemy, and it switched to the one we cannot win on paper.
 *
 * ⚠️ SO THE TEST FOR A NEW ROW IS NOT "is this good about us". It is "would a
 * notes app plainly fail this". "Works on your laptop as well as your phone"
 * was dropped at the rename for exactly that reason: Apple Notes and Google
 * Keep sync across devices, so the cross would have been false on day one.
 */
const ROWS: { feature: string; notesApp: boolean; trackd: boolean }[] = [
  { feature: "Built-in injection site rotation that fades as sites rest", notesApp: false, trackd: true },
  { feature: "Active stock that changes with every dose you log", notesApp: false, trackd: true },
  { feature: "Built-in reconstitution calculator that shows more than the units", notesApp: false, trackd: true },
  { feature: "Training blocks that keep a whole prep in one place", notesApp: false, trackd: true },
  { feature: "One shelf for the pins, the tablets and the tubs", notesApp: false, trackd: true },
  { feature: "Charts your weight against what you were running", notesApp: false, trackd: true },
  { feature: "Leaves the maths to you", notesApp: true, trackd: false },
];

export function CompareTable() {
  const last = ROWS.length - 1;
  return (
    <div>
      <div className="lp-panel relative overflow-hidden rounded-[2rem]">
        {/* The lit column, drawn behind the table so the cells stay plain. */}
        {/* On a phone the two mark columns are a fixed 3.5rem each, so the
            feature names get every pixel that is left (they were wrapping to
            three lines in a 24% column). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-11 bg-text-primary/[0.045] shadow-[inset_1px_0_0_0_color-mix(in_srgb,var(--text-primary)_8%,transparent)] md:w-[22%]"
        />
        <table className="relative w-full table-fixed border-collapse text-left">
          <colgroup>
            <col />
            <col className="w-11 md:w-[22%]" />
            <col className="w-11 md:w-[22%]" />
          </colgroup>
          <caption className="sr-only">
            {BUSINESS_NAME} compared with a notes app, feature by feature.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="pb-4 pl-3 pr-1 pt-5 align-bottom md:px-8 md:pt-6">
                <span className="text-[9px] uppercase tracking-[0.12em] text-text-secondary md:text-[10px] md:tracking-[0.18em]">Feature</span>
              </th>
              <th scope="col" className="px-1 pb-4 pt-5 text-center align-bottom md:px-2 md:pt-6">
                <span className="text-[9px] uppercase tracking-normal text-text-secondary md:text-[10px] md:tracking-[0.18em]">
                  {/* One word on a phone: the column is 44px and "Notes app"
                      wrapped onto two lines, which threw the header row out of
                      line with FEATURE beside it. The section title two inches
                      up already says what this column is. */}
                  <span className="md:hidden">Notes</span>
                  <span className="hidden md:inline">A notes app</span>
                </span>
              </th>
              <th scope="col" className="px-1 pb-4 pt-5 text-center align-bottom md:px-2 md:pt-6">
                <span className="sr-only">{BUSINESS_NAME}</span>
                <Image
                  src="/trackd-wordmark.png"
                  alt=""
                  width={1049}
                  height={200}
                  className="mx-auto h-2 w-auto max-w-full object-contain md:h-4"
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, i) => (
              <tr
                key={r.feature}
                className={cn(
                  "border-t-[0.5px] border-border-default",
                  i === last && "border-t border-dashed border-border-strong",
                )}
              >
                <th
                  scope="row"
                  className="py-3 pl-3 pr-1 text-[0.82rem] font-normal leading-snug text-foreground md:px-8 md:py-5 md:text-base"
                >
                  {r.feature}
                </th>
                <td className="px-0.5 text-center md:px-2">
                  <Mark on={r.notesApp} />
                </td>
                <td className="px-0.5 text-center md:px-2">
                  <Mark on={r.trackd} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A tick (filled white) or a cross (muted outline), whichever column. */
function Mark({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "mx-auto flex h-5 w-5 items-center justify-center rounded-full md:h-7 md:w-7",
        on ? "bg-text-primary text-bg-base" : "text-text-muted ring-1 ring-inset ring-border-strong",
      )}
    >
      <span className="sr-only">{on ? "Yes" : "No"}</span>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {on ? <path d="M2.2 6.3l2.5 2.5 5-5.4" /> : <path d="M3 3l6 6M9 3l-6 6" />}
      </svg>
    </span>
  );
}
