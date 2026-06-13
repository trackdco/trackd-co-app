/**
 * Progress photos = a dated, posed photo log (Spec 09 addendum — founder
 * directed). MacroFactor-style: grouped by month → by day, with a thumbnail per
 * pose. Three default poses (Front / Side / Back relaxed) shown up front; the
 * rest of the standard bodybuilding poses are added via a searchable catalogue
 * (so names stay consistent and comparable), and a user can still add a fully
 * custom pose. Photos live in the private `progress-photos` bucket; each is a
 * `progress_photos` row (pose + date + path) and carries the weight logged that
 * day. Pure types + helpers — no React.
 */

export interface ProgressPhoto {
  /** progress_photos.id */
  id: string;
  /** a catalogue pose id (see POSE_CATALOGUE) OR a custom pose label */
  pose: string;
  /** date taken, 'YYYY-MM-DD' */
  date: string;
  /** short-lived signed URL for the image (null if it couldn't be signed) */
  url: string | null;
  /** bodyweight (kg) logged on this date, if any — links weight ↔ photo */
  weightKg: number | null;
}

export type PoseShape = "relaxed" | "side" | "biceps" | "lat" | "abs" | "crab";

export interface Pose {
  id: string;
  label: string;
  shape: PoseShape;
}

/** The standard bodybuilding poses, each with an illustration shape. The first
 *  three are the relaxed mandatories shown up front. */
export const POSE_CATALOGUE: Pose[] = [
  { id: "front-relaxed", label: "Front relaxed", shape: "relaxed" },
  { id: "side-relaxed", label: "Side relaxed", shape: "side" },
  { id: "back-relaxed", label: "Back relaxed", shape: "relaxed" },
  { id: "front-double-biceps", label: "Front double biceps", shape: "biceps" },
  { id: "front-lat-spread", label: "Front lat spread", shape: "lat" },
  { id: "side-chest", label: "Side chest", shape: "side" },
  { id: "side-triceps", label: "Side triceps", shape: "side" },
  { id: "back-double-biceps", label: "Back double biceps", shape: "biceps" },
  { id: "back-lat-spread", label: "Back lat spread", shape: "lat" },
  { id: "abdominal-thigh", label: "Abdominal & thigh", shape: "abs" },
  { id: "most-muscular", label: "Most muscular", shape: "crab" },
];

/** Shown up front; everything else comes from the catalogue dropdown or custom. */
export const DEFAULT_POSES: Pose[] = POSE_CATALOGUE.slice(0, 3);

const CATALOGUE_BY_ID = new Map(POSE_CATALOGUE.map((p) => [p.id, p]));
const ORDER = new Map(POSE_CATALOGUE.map((p, i) => [p.id, i]));
const DEFAULT_IDS = new Set(DEFAULT_POSES.map((p) => p.id));

export function isDefaultPose(pose: string): boolean {
  return DEFAULT_IDS.has(pose);
}

/** True if the pose is one of the known catalogue poses (vs a user custom). */
export function isCataloguePose(pose: string): boolean {
  return CATALOGUE_BY_ID.has(pose);
}

/** A catalogue pose's friendly label, or the custom pose's own text. */
export function poseLabel(pose: string): string {
  return CATALOGUE_BY_ID.get(pose)?.label ?? pose;
}

/** Illustration shape for a catalogue pose, or null for a custom one. */
export function poseShape(pose: string): PoseShape | null {
  return CATALOGUE_BY_ID.get(pose)?.shape ?? null;
}

/** Catalogue order first, then custom poses. */
export function posePriority(pose: string): number {
  return ORDER.get(pose) ?? 100;
}

/** Catalogue poses matching a query, excluding any already chosen. */
export function searchPoses(query: string, exclude: string[] = []): Pose[] {
  const ex = new Set(exclude);
  const q = query.trim().toLowerCase();
  return POSE_CATALOGUE.filter((p) => !ex.has(p.id)).filter(
    (p) => q === "" || p.label.toLowerCase().includes(q),
  );
}

function comparePose(a: string, b: string): number {
  const pa = posePriority(a);
  const pb = posePriority(b);
  if (pa !== pb) return pa - pb;
  return poseLabel(a).localeCompare(poseLabel(b));
}

export interface DayGroup {
  date: string;
  /** photos that day, ordered by the catalogue then custom */
  photos: ProgressPhoto[];
}

export interface MonthGroup {
  /** 'YYYY-MM' */
  key: string;
  /** "June 2026" */
  label: string;
  /** days, newest first */
  days: DayGroup[];
}

/** Group photos by day (newest first), poses ordered within each day. */
export function groupByDate(photos: ProgressPhoto[]): DayGroup[] {
  const byDate = new Map<string, ProgressPhoto[]>();
  for (const p of photos) {
    const arr = byDate.get(p.date);
    if (arr) arr.push(p);
    else byDate.set(p.date, [p]);
  }
  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, ps]) => ({
      date,
      photos: ps.slice().sort((a, b) => comparePose(a.pose, b.pose)),
    }));
}

/** Group photos by month → day (both newest first). */
export function groupByMonth(photos: ProgressPhoto[]): MonthGroup[] {
  const days = groupByDate(photos);
  const byMonth = new Map<string, DayGroup[]>();
  for (const d of days) {
    const key = d.date.slice(0, 7); // YYYY-MM
    const arr = byMonth.get(key);
    if (arr) arr.push(d);
    else byMonth.set(key, [d]);
  }
  return [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, ds]) => ({ key, label: monthLabel(key), days: ds }));
}

/** The latest day's photos (newest session), front-relaxed first. */
export function latestDay(photos: ProgressPhoto[]): DayGroup | null {
  return groupByDate(photos)[0] ?? null;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return `${MONTHS[m - 1]} ${y}`;
}

function dateFromKey(key: string): Date | null {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function formatPhotoDate(key: string): string {
  const d = dateFromKey(key);
  if (!d) return key;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatPhotoDateShort(key: string): string {
  const d = dateFromKey(key);
  if (!d) return key;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Sat, 6 June" — the date-row format. */
export function formatPhotoDateRow(key: string): string {
  const d = dateFromKey(key);
  if (!d) return key;
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Whole days between two 'YYYY-MM-DD' keys (absolute). */
export function dateKeyDaysApart(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.round(Math.abs(db - da) / 86_400_000);
}

/** Distinct custom (non-catalogue) poses the user has used. */
export function customPosesIn(photos: ProgressPhoto[]): string[] {
  const set = new Set<string>();
  for (const p of photos) if (!isCataloguePose(p.pose)) set.add(p.pose);
  return [...set].sort((a, b) => a.localeCompare(b));
}
