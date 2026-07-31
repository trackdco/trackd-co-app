/**
 * The ANONYMOUS onboarding session (Spec 3-01 · §6).
 *
 * Everything captured before the paywall lives here, on the DEVICE only. It is
 * never written to Postgres while the user is anonymous: there is no account to
 * own the rows, and `architecture.md` → Auth and Access Model is explicit that
 * every row is owned by exactly one user. After auth the whole object is merged
 * onto the real account in one pass (see `mergeSessionOntoAccount`).
 *
 * Storage key follows the house convention (`trackd.<thing>.v<n>`), and is NOT
 * suffixed with a uid because by definition there is no uid yet.
 *
 * Pure functions + a thin storage wrapper, so the age gate can be tested
 * without a browser. Every read is defensive: this is untrusted input by the
 * time it comes back out of `localStorage` (a user can edit it).
 */

export const ONBOARDING_SESSION_KEY = "trackd.onboarding.v1";

export type Sex = "male" | "female";

/**
 * Screen 2 options. The value is the stable key; the label lives in the screen.
 * These describe the USER, never a goal or an outcome (TGA, §3.1).
 */
export type RunningTag =
  | "comp_prep"
  | "trt"
  | "peptides"
  | "first_cycle"
  | "blast_cruise"
  | "recomp";

/** Screen 3 options. All of these are TRACKING pains, never dosing pains. */
export type StruggleTag =
  | "whats_left"
  | "recon_maths"
  | "last_site"
  | "spreadsheet"
  | "no_history";

/** Screen 15 options. */
export type AttributionTag =
  | "instagram"
  | "tiktok"
  | "mate"
  | "community"
  | "elsewhere";

export interface OnboardingSession {
  /** "YYYY-MM-DD". Captured manually: Google OAuth does not reliably return it. */
  dob: string | null;
  sex: Sex | null;
  /** Single consent covering ToS + Medical Disclaimer + Privacy. */
  consent: boolean;
  running: RunningTag[];
  struggle: StruggleTag[];
  attribution: AttributionTag | null;
  /** Creator code captured from `?code=` on first load, or typed at the paywall. */
  affiliateCode: string | null;
  /** Which plan the paywall has selected. Yearly is the pre-selected hero. */
  plan: "yearly" | "monthly";
  /** Set once the flow is entered, so re-entry can be told from first run. */
  startedAt: string | null;
}

export const EMPTY_SESSION: OnboardingSession = {
  dob: null,
  sex: null,
  consent: false,
  running: [],
  struggle: [],
  attribution: null,
  affiliateCode: null,
  plan: "yearly",
  startedAt: null,
};

/* ---------------------------------------------------------------------------
   Age gate (§3.2) — load-bearing. DOB must resolve to 18+ before the demo and
   before any payment path. Parsed by CALENDAR COMPONENTS, never by
   `new Date(string)`: an ISO date string is parsed as UTC and would shift the
   birthday by a day for anyone east of Greenwich, which is every Australian
   user. This is the same trap `logged_for` was fixed for (protocol/012).
   --------------------------------------------------------------------------- */

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/** Parse a "YYYY-MM-DD" key, or null if it is not one / is not a real date. */
export function parseDateKey(key: string | null | undefined): CalendarDate | null {
  if (!key) return null;
  const m = DATE_KEY.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Reject a day that does not exist in that month (31 Feb, 31 Apr, 29 Feb in a
  // common year). Constructed locally, so no timezone shift.
  const probe = new Date(year, month - 1, day);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/**
 * Whole years between two calendar dates. No `Date` arithmetic and no
 * milliseconds, so daylight saving and leap years cannot move the answer.
 */
export function ageInYears(dobKey: string, todayKey: string): number | null {
  const dob = parseDateKey(dobKey);
  const today = parseDateKey(todayKey);
  if (!dob || !today) return null;

  let age = today.year - dob.year;
  const hadBirthdayThisYear =
    today.month > dob.month || (today.month === dob.month && today.day >= dob.day);
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

export const MINIMUM_AGE = 18;

export type AgeVerdict = "ok" | "under" | "unknown" | "future";

/**
 * The gate's verdict on a DOB. "unknown" covers an empty or malformed field
 * (the user has not answered yet); "future" covers a date that has not
 * happened, which is a typo rather than a refusal.
 */
export function ageVerdict(dobKey: string | null, todayKey: string): AgeVerdict {
  if (!dobKey) return "unknown";
  const age = ageInYears(dobKey, todayKey);
  if (age === null) return "unknown";
  if (age < 0) return "future";
  return age >= MINIMUM_AGE ? "ok" : "under";
}

/**
 * The single predicate the Continue button reads (§9 Screen 1 Logic): consent
 * ticked AND DOB resolves to 18+. Sex is required data (§8) so it is part of
 * the gate too. Anything short of all three leaves the button disabled and no
 * onward path exists.
 */
export function canLeaveHousekeeping(
  session: Pick<OnboardingSession, "dob" | "sex" | "consent">,
  todayKey: string,
): boolean {
  return (
    session.consent === true &&
    session.sex !== null &&
    ageVerdict(session.dob, todayKey) === "ok"
  );
}

/* ---------------------------------------------------------------------------
   Storage
   --------------------------------------------------------------------------- */

/**
 * Coerce whatever came back out of storage into a valid session. Anything
 * unrecognised falls back to the empty value rather than throwing: a corrupt
 * key must never be able to brick the flow (the lesson from the calculator's
 * syringe gate, `progress-tracker.md`).
 */
export function normaliseSession(raw: unknown): OnboardingSession {
  if (!raw || typeof raw !== "object") return { ...EMPTY_SESSION };
  const o = raw as Record<string, unknown>;

  const asArray = <T extends string>(v: unknown, allowed: readonly T[]): T[] => {
    if (!Array.isArray(v)) return [];
    const seen = new Set<T>();
    for (const item of v) {
      if (typeof item === "string" && (allowed as readonly string[]).includes(item)) {
        seen.add(item as T);
      }
    }
    return [...seen];
  };

  return {
    dob: parseDateKey(typeof o.dob === "string" ? o.dob : null) ? (o.dob as string) : null,
    sex: o.sex === "male" || o.sex === "female" ? o.sex : null,
    consent: o.consent === true,
    running: asArray(o.running, RUNNING_TAGS),
    struggle: asArray(o.struggle, STRUGGLE_TAGS),
    attribution: (ATTRIBUTION_TAGS as readonly string[]).includes(o.attribution as string)
      ? (o.attribution as AttributionTag)
      : null,
    affiliateCode: typeof o.affiliateCode === "string" ? o.affiliateCode : null,
    plan: o.plan === "monthly" ? "monthly" : "yearly",
    startedAt: typeof o.startedAt === "string" ? o.startedAt : null,
  };
}

export const RUNNING_TAGS = [
  "comp_prep",
  "trt",
  "peptides",
  "first_cycle",
  "blast_cruise",
  "recomp",
] as const satisfies readonly RunningTag[];

export const STRUGGLE_TAGS = [
  "whats_left",
  "recon_maths",
  "last_site",
  "spreadsheet",
  "no_history",
] as const satisfies readonly StruggleTag[];

export const ATTRIBUTION_TAGS = [
  "instagram",
  "tiktok",
  "mate",
  "community",
  "elsewhere",
] as const satisfies readonly AttributionTag[];

/** Read the session off the device. Safe to call during SSR (returns empty). */
export function readSession(): OnboardingSession {
  if (typeof window === "undefined") return { ...EMPTY_SESSION };
  try {
    const raw = window.localStorage.getItem(ONBOARDING_SESSION_KEY);
    if (!raw) return { ...EMPTY_SESSION };
    return normaliseSession(JSON.parse(raw));
  } catch {
    // Private mode, a quota error, or malformed JSON. The flow still runs; it
    // just does not remember. Never throw from a read.
    return { ...EMPTY_SESSION };
  }
}

/** Persist the session. A refused write is not fatal (see `readSession`). */
export function writeSession(session: OnboardingSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDING_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Ignore: storage is a convenience here, never the source of truth for the
    // screen the user is looking at.
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ONBOARDING_SESSION_KEY);
  } catch {
    // Ignore.
  }
}
