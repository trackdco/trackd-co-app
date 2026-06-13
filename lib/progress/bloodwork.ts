/**
 * Bloodwork = a dated photo store (Context/Feature Specs/09 → Step 4, revised).
 * No structured metrics/charts: the user attaches a screenshot or photo of their
 * blood report, dated to the draw day, and can look back over the periods. Photos
 * live in the private `bloodwork` Storage bucket; each one is a `lab_panels` row
 * (its `source_file_path` + `drawn_on`). Pure types + a date formatter — no React.
 */

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

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "12 August 2025" for a 'YYYY-MM-DD' key. */
export function formatBloodworkDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
