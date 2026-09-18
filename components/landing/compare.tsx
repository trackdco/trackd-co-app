import Image from "next/image";

import { BUSINESS_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * THE COMPARISON TABLE (spec 3-03 §3.6).
 *
 * `Feature | Other apps | Trackd`, crosses down one column and ticks down the
 * other, and then a last row that turns it round on purpose: the feature is a
 * BAD one, so other apps have it and Trackd does not.
 *
 * ## How the inversion reads as a point rather than a mistake
 *
 * The Trackd column is lit the whole way down. The MARK follows the symbol,
 * not the column (Adrian, 2026-09-17): a tick is always the filled white one
 * and a cross is always the muted outline one, so on the last row the two
 * swap sides, and the flip is the punchline. (A caption saying so was cut.)
 *
 * ## ⚠️ TODO(3-03): THESE ARE CLAIMS ABOUT COMPETITORS
 *
 * A cross under "Other apps" says other apps lack the feature. Some apps in
 * this space do have some of these, and a comparative claim on a live page has
 * to be true. Adrian rewrote all seven in the 2026-09-18 copy pass and STILL
 * has to confirm each one: row 5 ("peptides, anabolics and supplements in one
 * place") is the broadest of them. Nothing here names a competitor, and none of
 * it says anything about health.
 *
 * "Anabolics" is deliberate (Adrian, 2026-09-18): "juice" is slang on a page
 * Apple reads, and "steroids" reads worse than the thing it names.
 *
 * ⚠️ NO MEDICAL ROW HERE ANY MORE, and that is a decision rather than an
 * oversight. "Never gives you sketchy medical advice" and then "Built to track,
 * not to advise" both sat in row 6, and Adrian's ruling is that this table
 * compares FEATURES: a disclaimer scored against other apps reads as a feature
 * you are boasting about. The position is still stated twice on the page, in
 * the first FAQ answer and in the footer.
 *
 * The last row is deliberately an opinion rather than a checkable claim
 * (Adrian, 2026-09-18, chosen over "locks your history when you stop paying",
 * which would have been a factual assertion about other apps).
 */
const ROWS: { feature: string; others: boolean; trackd: boolean }[] = [
  { feature: "Built-in injection site rotation that fades as sites rest", others: false, trackd: true },
  { feature: "Active stock that changes with every dose you log", others: false, trackd: true },
  { feature: "Built-in reconstitution calculator that shows more than the units", others: false, trackd: true },
  { feature: "Training blocks that keep a whole prep in one place", others: false, trackd: true },
  { feature: "Peptides, anabolics and supplements in one place", others: false, trackd: true },
  { feature: "Works on your laptop as well as your phone", others: false, trackd: true },
  { feature: "Vibe coded in a weekend", others: true, trackd: false },
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
            {BUSINESS_NAME} compared with other tracking apps, feature by feature.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="pb-4 pl-3 pr-1 pt-5 align-bottom md:px-8 md:pt-6">
                <span className="text-[9px] uppercase tracking-[0.12em] text-text-secondary md:text-[10px] md:tracking-[0.18em]">Feature</span>
              </th>
              <th scope="col" className="px-1 pb-4 pt-5 text-center align-bottom md:px-2 md:pt-6">
                <span className="text-[9px] uppercase tracking-normal text-text-secondary md:text-[10px] md:tracking-[0.18em]">
                  <span className="md:hidden">Others</span>
                  <span className="hidden md:inline">Other apps</span>
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
                  <Mark on={r.others} />
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
