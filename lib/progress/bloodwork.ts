/**
 * Bloodwork = a dated photo store (Context/Feature Specs/09 → Step 4, revised).
 * No structured metrics/charts: the user attaches a screenshot or photo of their
 * blood report, dated to the draw day, and can look back over the periods. Photos
 * live in the private `bloodwork` Storage bucket; each one is a `lab_panels` row
 * (its `source_file_path` + `drawn_on`). Pure types + a date formatter — no React.
 */

import { dayShort } from "@/lib/format/date";

export interface BloodworkPhoto {
  /** lab_panels.id */
  id: string;
  /** Draw date key 'YYYY-MM-DD' (drawn_on, else the upload date). */
  date: string;
  /** Short-lived signed URL for the image (null if it couldn't be signed). */
  url: string | null;
  /** Optional free-text note the user attached (lab_panels.notes). */
  note: string | null;
}

/**
 * The day a report is filed under (W42: "the date drawn on bloods"): the draw
 * date the user picked, read straight off the `date` column's key, never
 * through a `Date` (which would move it a day for anyone east or west of the
 * server). A row with no draw date, which the attach sheet never writes, falls
 * back to the UTC day it was uploaded, the one day the server can know.
 */
export function bloodworkDateKey(drawnOn: string | null | undefined, createdAt: string): string {
  if (typeof drawnOn === "string" && /^\d{4}-\d{2}-\d{2}/.test(drawnOn)) return drawnOn.slice(0, 10);
  const uploaded = new Date(createdAt);
  return Number.isNaN(uploaded.getTime()) ? "" : uploaded.toISOString().slice(0, 10);
}

/**
 * The date under a report on the Bloods card, "12 Sep", or "12 Sep 2025" when
 * it is not this year: the photo card's rule, so an old panel is never read as
 * a recent one. The card sets it in the uppercase mono line every card uses.
 */
export function bloodworkDateText(date: string, todayKey: string): string {
  const year = Number(todayKey.slice(0, 4));
  return dayShort(date, Number.isInteger(year) && year > 0 ? year : undefined);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * "12 August 2025" for a 'YYYY-MM-DD' key.
 *
 * @deprecated Use `dayShort` from `lib/format/date.ts` (consistency fix #26).
 * Kept for the dev preview page's placeholder art.
 */
export function formatBloodworkDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
