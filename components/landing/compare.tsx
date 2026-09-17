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
 * to be true. The rows were chosen to be the ones Trackd is most distinctive
 * on, but Adrian should confirm each before this ships. Nothing here names a
 * competitor, and none of it says anything about health.
 */
const ROWS: { feature: string; others: boolean; trackd: boolean }[] = [
  { feature: "Injection site map that fades as sites rest", others: false, trackd: true },
  { feature: "Stock that counts down with every dose", others: false, trackd: true },
  { feature: "Calculator drawn on your own syringe", others: false, trackd: true },
  { feature: "Training blocks you can look back on", others: false, trackd: true },
  { feature: "Works on your laptop as well as your phone", others: false, trackd: true },
  { feature: "Never tells you what to take", others: false, trackd: true },
  { feature: "AI slop", others: true, trackd: false },
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
          className="pointer-events-none absolute inset-y-0 right-0 w-14 bg-text-primary/[0.045] shadow-[inset_1px_0_0_0_color-mix(in_srgb,var(--text-primary)_8%,transparent)] md:w-[22%]"
        />
        <table className="relative w-full table-fixed border-collapse text-left">
          <colgroup>
            <col />
            <col className="w-14 md:w-[22%]" />
            <col className="w-14 md:w-[22%]" />
          </colgroup>
          <caption className="sr-only">
            {BUSINESS_NAME} compared with other tracking apps, feature by feature.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="px-4 pb-4 pt-5 align-bottom md:px-8 md:pt-6">
                <span className="text-[10px] uppercase tracking-[0.18em] text-text-secondary">Feature</span>
              </th>
              <th scope="col" className="px-1 pb-4 pt-5 text-center align-bottom md:px-2 md:pt-6">
                <span className="text-[10px] uppercase tracking-[0.12em] text-text-secondary md:tracking-[0.18em]">
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
                  className="mx-auto h-2.5 w-auto md:h-4"
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
                  className="px-4 py-3.5 text-[0.88rem] font-normal leading-snug text-foreground md:px-8 md:py-5 md:text-base"
                >
                  {r.feature}
                </th>
                <td className="px-2 text-center">
                  <Mark on={r.others} />
                </td>
                <td className="px-2 text-center">
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
        "mx-auto flex h-6 w-6 items-center justify-center rounded-full md:h-7 md:w-7",
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
