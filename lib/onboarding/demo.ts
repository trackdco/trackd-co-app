/**
 * The canned demo cycle (Spec 3-01 · §10).
 *
 * THROWAWAY STATE. Nothing here touches `protocol_compounds`, `dose_logs`,
 * `inventory_items`, or the device stores the real app writes
 * (`trackd.stack.v2.*`, `trackd.doselog.v1.*`). The demo is a rehearsal, not
 * the app: the user is anonymous, so there is no row for any of it to belong
 * to, and inventing one would violate the ownership model outright.
 *
 * The maths are deliberately the SAME SHAPE as `v_inventory_math` (remaining =
 * total minus consumed; doses left = remaining / dose) but they are not that
 * view and must never be confused with it. This is a sample vial with made-up
 * numbers, computed on read, stored nowhere.
 */

/** The sample compound the demo runs on. Generic on purpose: a "Custom
 *  compound" is the one name that cannot read as a recommendation. */
export const DEMO_COMPOUND = {
  name: "Custom compound",
  concentrationMgPerMl: 200,
  doseMl: 0.5,
  /** A fresh 10 mL vial. */
  vialMl: 10,
  /** Every third day, which is what makes the projected-empty date move. */
  everyNDays: 3,
} as const;

export interface DemoStock {
  /** mL left in the vial. */
  remainingMl: number;
  /** Whole doses left at the sample dose size. */
  dosesLeft: number;
  /** How many doses have been logged in this demo run. */
  logged: number;
}

export const DEMO_START: DemoStock = {
  remainingMl: DEMO_COMPOUND.vialMl,
  dosesLeft: Math.floor(DEMO_COMPOUND.vialMl / DEMO_COMPOUND.doseMl),
  logged: 0,
};

/** Round to 2dp without the float dust that makes 9.5 - 0.5 read as 8.999…. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Log one sample dose. Clamped at zero (§10) so a determined tapper cannot
 * drive the vial negative and see a nonsense figure on the aha screen.
 */
export function logDemoDose(stock: DemoStock): DemoStock {
  const remainingMl = round2(Math.max(0, stock.remainingMl - DEMO_COMPOUND.doseMl));
  return {
    remainingMl,
    dosesLeft: Math.max(0, Math.floor(remainingMl / DEMO_COMPOUND.doseMl)),
    logged: stock.logged + 1,
  };
}

/** Is there anything left to log? Drives the disabled state of the log button. */
export function isDemoEmpty(stock: DemoStock): boolean {
  return stock.remainingMl <= 0;
}

/** Fill fraction 0…1 for the vial artwork. */
export function demoFill(stock: DemoStock): number {
  return Math.max(0, Math.min(1, stock.remainingMl / DEMO_COMPOUND.vialMl));
}

/**
 * The projected-empty date: doses left, spread across the sample schedule,
 * counted forward from today. Computed from calendar components so it cannot
 * shift a day across a timezone boundary.
 *
 * Returns a "YYYY-MM-DD" key, or null when the vial is already empty (there is
 * no date on which an empty vial will run out).
 */
export function demoProjectedEmpty(stock: DemoStock, todayKey: string): string | null {
  if (stock.dosesLeft <= 0) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayKey);
  if (!m) return null;
  const daysOut = stock.dosesLeft * DEMO_COMPOUND.everyNDays;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + daysOut);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mo}-${day}`;
}

/** "12 Aug" for the projected-empty row. Australian order, no comma. */
export function formatDemoDate(key: string | null): string {
  if (!key) return "Empty";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return "Empty";
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]}`;
}

/* ---------------------------------------------------------------------------
   Demo 3 — injection sites. A RECORD of where the user says they pinned, with
   no guidance of any kind attached (TGA §3.1). The rotation is the user's; the
   app only remembers it.
   --------------------------------------------------------------------------- */

export type DemoView = "front" | "back";

export interface DemoSite {
  id: string;
  label: string;
  view: DemoView;
  /** Percent coordinates on the silhouette box, so the map scales freely. */
  x: number;
  y: number;
}

/**
 * Mirror-front convention, matching the real body maps: screen-left is the
 * viewer's LEFT side as though facing them, so an "R glute" sits on the right
 * of the drawing. Spec D-1 default applied: glutes live on the BACK view
 * rather than being pushed onto the front for tap-ability.
 */
export const DEMO_SITES: readonly DemoSite[] = [
  { id: "l_delt", label: "L delt", view: "front", x: 27, y: 25 },
  { id: "r_delt", label: "R delt", view: "front", x: 73, y: 25 },
  { id: "l_quad", label: "L quad", view: "front", x: 39, y: 66 },
  { id: "r_quad", label: "R quad", view: "front", x: 61, y: 66 },
  { id: "l_vg", label: "L ventroglute", view: "front", x: 33, y: 50 },
  { id: "r_vg", label: "R ventroglute", view: "front", x: 67, y: 50 },
  { id: "l_glute", label: "L glute", view: "back", x: 39, y: 50 },
  { id: "r_glute", label: "R glute", view: "back", x: 61, y: 50 },
  { id: "l_delt_b", label: "L delt", view: "back", x: 27, y: 25 },
  { id: "r_delt_b", label: "R delt", view: "back", x: 73, y: 25 },
] as const;

/** The seeded "last 3" the screen opens on, newest first. */
export const DEMO_RECENT_SITES: readonly string[] = ["R glute", "L delt", "R delt"];

/** Push a newly tapped site onto the recent list, newest first, capped at 3. */
export function pushRecentSite(
  recent: readonly string[],
  label: string,
): string[] {
  return [label, ...recent].slice(0, 3);
}

/* ---------------------------------------------------------------------------
   Demo 4 — history. A 28-day consistency grid, seeded so it reads like a real
   run rather than a chequerboard: mostly logged, a few gaps.
   --------------------------------------------------------------------------- */

export type DemoDay = "logged" | "off" | "missed";

/**
 * 28 days, oldest first. Fixed rather than random so the screen looks the same
 * in every screenshot and cannot accidentally render an all-empty grid.
 */
export const DEMO_CONSISTENCY: readonly DemoDay[] = [
  "logged", "off", "off", "logged", "off", "off", "logged",
  "off", "off", "logged", "off", "missed", "logged", "off",
  "off", "logged", "off", "off", "logged", "off", "off",
  "logged", "off", "off", "logged", "off", "off", "logged",
] as const;

export const DEMO_PHOTO_WEEKS: readonly string[] = ["Week 1", "Week 6", "Week 12"];

/** The journal sample (§9 Screen 8). Verbatim from the spec. */
export const DEMO_JOURNAL = {
  quote: "Sleep off this week, appetite up.",
  day: "day 12",
} as const;
