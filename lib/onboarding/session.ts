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

import { normaliseCode } from "./affiliate";
import { PLAN_ORDER, type PlanId } from "./pricing";

export const ONBOARDING_SESSION_KEY = "trackd.onboarding.v1";

export type Sex = "male" | "female";

/**
 * Screen 2 options. The value is the stable key; the label lives in the screen.
 * These describe the USER, never a goal or an outcome (TGA, §3.1).
 */
export type RunningTag =
  | "comp_prep"
  /**
   * RETIRED as an OPTION 2026-08-05, kept as a TAG.
   *
   * Both intent screens now offer seven, which is Adrian's call — an even pair
   * reads as two questions rather than a long list and a short one. "Off-season"
   * was the one to go: it is defined by what it is NOT, and anyone in it also
   * identifies with blast & cruise, TRT or peptides, so it was the least
   * distinct answer on the screen.
   *
   * The tag stays in the union and in `RUNNING_TAGS` on purpose. Devices that
   * already answered it hold `off_season` in `localStorage`, and removing it
   * from the runtime array would make `normaliseSession` strip it — which is
   * exactly the CRITICAL that shipped for `took_today` on this same day. A tag
   * is removed from the OFFER; it is never removed from the PARSER.
   */
  | "off_season"
  | "trt"
  | "peptides"
  | "first_cycle"
  | "blast_cruise"
  // Not everyone here is running gear (Adrian, 2026-08-05: "people will be
  // doing supplements as well, like I track creatine"). Without this the
  // screen implies the app is only for one kind of user, and the catalogue
  // already carries 84 supplements.
  | "health"
  | "nothing";

/**
 * Screen 3 options. All of these are TRACKING pains, never dosing pains.
 *
 * `units_to_draw` ("converting a dose into syringe units") was removed by Adrian
 * on 2026-08-01. It sat closer to the act of dosing than anything else on the
 * list, and the calculator answer already reads as "powder to units", so the
 * option was both the least on-message and the most redundant.
 */
export type StruggleTag =
  | "whats_left"
  | "recon_maths"
  | "last_site"
  | "notes_app"
  | "too_much"
  | "no_history"
  // Added 2026-08-05 on a customer review plus Adrian's note that the list had
  // nothing for someone tracking daily supplements.
  //
  // `took_today` is, by some distance, the most common real failure in this
  // whole category and was missing entirely: not "did I plan to", but "have I
  // already". It is also the one that applies to a creatine user and a TRT user
  // in exactly the same way.
  //
  // `cant_compare` is the careful one. Adrian asked for "I don't know what
  // compounds affect me", which is the right instinct and cannot be worded that
  // way — attributing an effect to a substance is an OUTCOME claim about a
  // prescription-only substance (§3.1). Phrased as a RECORD problem it is both
  // legal and truer: the thing missing is the ability to put one run beside
  // another, which is precisely what the app provides and what memory does not.
  | "took_today"
  | "cant_compare"
  | "other";

/** Screen 15 options. */
export type AttributionTag =
  | "instagram"
  | "tiktok"
  | "mate"
  | "community"
  | "elsewhere";

export interface OnboardingSession {
  /**
   * What to call them. Adrian overrode the spec's D-2 default (which kept
   * housekeeping lean and took the name from Google at the paywall): he wants
   * the user to feel they have already built something before the demo, so the
   * name is asked for up front and Welcome greets them with it.
   */
  name: string | null;
  /** "YYYY-MM-DD". Captured manually: Google OAuth does not reliably return it. */
  dob: string | null;
  sex: Sex | null;
  /** Single consent covering ToS + Medical Disclaimer + Privacy. */
  consent: boolean;
  /**
   * ⚠️ THE HEALTH-DATA CONSENT, AND IT IS ITS OWN TICK BECAUSE THE DOCUMENTS SAY
   * SO (v2.0, 2026-08-25).
   *
   * Privacy Policy §1: "we ask for your explicit, specific consent through a
   * separate consent step, distinct from accepting our Terms of Service. You
   * give this consent by ticking a dedicated box that reads: …". Terms, opening:
   * "we ask you to confirm three things through separate, affirmative steps".
   *
   * It was folded into `consent` above for one day. That made the Privacy Policy
   * false about its own signup, which is the same defect as recording a consent
   * nobody was shown — just pointing the other way. `/welcome` has always had
   * three separate boxes; this is onboarding catching up.
   *
   * ⚠️ ABSENT MEANS NOT GIVEN. A session stored before this field existed reads
   * `undefined`, which is falsy, so the gate is withheld and the user answers at
   * `/welcome` in the normal way. That is the safe direction to fail.
   */
  healthConsent: boolean;
  running: RunningTag[];
  struggle: StruggleTag[];
  attribution: AttributionTag | null;
  /**
   * The free text typed under the catch-all chip (Adrian, 2026-08-01): which
   * podcast, which forum, which coach. The whole point of the option is to
   * learn the answers we did not think to put on the list, so a bucket labelled
   * "other" with nothing in it would be the one useless answer on the screen.
   *
   * Capped hard on read. It is user input that ends up in an aggregate someone
   * reads, so its length is not the user's to decide.
   */
  attributionDetail: string | null;
  /**
   * The free text typed under "Something else" on the struggle screen (Adrian,
   * 2026-08-05).
   *
   * Same reasoning as `attributionDetail`, and the same scope rule: the whole
   * point of a catch-all is to collect the answers we did not think to put on
   * the list, and a bucket labelled "other" with nothing in it teaches us
   * nothing. This is the single most valuable field in the flow for deciding
   * what to build next, because it is the only one the user writes themselves.
   *
   * Capped on read. It is user input that ends up in an aggregate someone
   * reads, so its length is not the user's to decide.
   */
  struggleDetail: string | null;
  /** Creator code captured from `?code=` on first load, or typed at the paywall. */
  affiliateCode: string | null;
  /**
   * Which plan the paywall has selected. Yearly is the pre-selected hero.
   *
   * Typed as `PlanId` rather than spelled out, so adding a plan (weekly landed
   * 2026-08-05) cannot leave a second, narrower copy of the list here to drift
   * out of sync with `pricing.ts`.
   */
  plan: PlanId;
  /** Set once the flow is entered, so re-entry can be told from first run. */
  startedAt: string | null;
}

export const EMPTY_SESSION: OnboardingSession = {
  name: null,
  dob: null,
  sex: null,
  consent: false,
  healthConsent: false,
  running: [],
  struggle: [],
  attribution: null,
  attributionDetail: null,
  struggleDetail: null,
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

/**
 * The upper bound, and it exists to match `/welcome`.
 *
 * `app/welcome/actions.ts` rejects a birth year before 1900; this had no upper
 * bound at all, so a hand-edited `dob: "0001-01-01"` resolved to an age of two
 * thousand and passed the gate — and the claim then wrote that date into
 * `profiles.date_of_birth`. Self-inflicted only, but the two gates now write the
 * same column and disagreeing about what a date of birth is was the defect.
 *
 * An implausible date reads as "unknown" rather than "under": the user has not
 * given a usable answer, which is what that verdict already means.
 */
export const MAXIMUM_AGE = 120;

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
  if (age > MAXIMUM_AGE) return "unknown";
  return age >= MINIMUM_AGE ? "ok" : "under";
}

/**
 * The single predicate the Continue button reads (§9 Screen 1 Logic): consent
 * ticked AND DOB resolves to 18+. Sex is required data (§8) so it is part of
 * the gate too, and so is a name now that Welcome greets with it. Anything
 * short of all four leaves the button disabled and no onward path exists.
 *
 * The legally load-bearing part is the age and the consent; the name is a
 * product requirement sitting in the same check, which is fine because the
 * check is all-or-nothing either way.
 */
export function canLeaveHousekeeping(
  session: Pick<OnboardingSession, "name" | "dob" | "sex" | "consent" | "healthConsent">,
  todayKey: string,
): boolean {
  return (
    session.consent === true &&
    // ⚠️ BOTH TICKS. The documents require a separate health-data step, so a
    // session with only the documents tick may not leave housekeeping.
    session.healthConsent === true &&
    session.sex !== null &&
    typeof session.name === "string" &&
    session.name.trim().length > 0 &&
    ageVerdict(session.dob, todayKey) === "ok"
  );
}

/** A name that is actually a name, not a stray space. */
export function hasName(
  session: Pick<OnboardingSession, "name">,
): boolean {
  return typeof session.name === "string" && session.name.trim().length > 0;
}

/**
 * THE LEGALLY LOAD-BEARING HALF, on its own.
 *
 * Age proven AND consent given. Split out from `canLeaveHousekeeping` when
 * housekeeping became four screens, so the `birthday` screen can gate on
 * exactly the thing it asks for and nothing else — requiring a sex that has not
 * been asked for yet would leave its button dead with nothing on screen to
 * explain why.
 *
 * `canLeaveHousekeeping` remains the FULL check and is unchanged. This is a
 * strict subset of it, never a replacement: nothing downstream of the four
 * screens may use this in its place.
 */
export function hasAgeAndConsent(
  session: Pick<OnboardingSession, "dob" | "consent" | "healthConsent">,
  todayKey: string,
): boolean {
  return (
    session.consent === true &&
    /**
     * ⚠️ THE HEALTH TICK IS PART OF THE GATE, AND THAT GATES THE WRITE.
     *
     * `passGateFromSession` returns early when this is false, so no
     * `consent_records` row is written at all — including the
     * `health_data_consent` one. That is the property that matters: the row
     * exists only when the dedicated box was ticked.
     *
     * All-or-nothing matches `/welcome`, which refuses all three together.
     * Someone who ticks the documents but not the health box simply meets
     * `/welcome` and answers there; nothing is half-recorded.
     */
    session.healthConsent === true &&
    ageVerdict(session.dob, todayKey) === "ok"
  );
}

/**
 * Which housekeeping screen is the earliest one still unanswered, or null when
 * all of them are done.
 *
 * This is the ONE function that decides where an untrusted `?step=` is allowed
 * to land (see `clampStep`). It is ordered, so a session missing its name can
 * never be sent to `gender` — it goes back to the first hole, and every screen
 * between here and the demo is behind it.
 *
 * Returns step ids as plain strings rather than importing `StepId`, because
 * `steps.ts` imports from here and the cycle would be the only reason to move
 * the age rule out of this file. The ids are pinned by a test.
 */
export function firstIncompleteHousekeeping(
  session: Pick<OnboardingSession, "name" | "dob" | "sex" | "consent" | "healthConsent">,
  todayKey: string,
): "name" | "birthday" | "gender" | null {
  if (!hasName(session)) return "name";
  if (!hasAgeAndConsent(session, todayKey)) return "birthday";
  if (session.sex === null) return "gender";
  return null;
}

/* ---------------------------------------------------------------------------
   Storage
   --------------------------------------------------------------------------- */

/**
 * Cap a string at `max` CHARACTERS, not UTF-16 code units, and strip anything
 * Postgres will not store.
 *
 * ## Both halves of this were real defects, found by a cold review
 *
 * `.slice(n)` counts UTF-16 code units, so it can cut an emoji in half and
 * leave a **lone surrogate**. PostgREST rejects that outright
 * (`PGRST102 Empty or invalid json`). A **NUL byte** survives `trim()` and
 * Postgres refuses it too (`22P05 unsupported Unicode escape sequence`).
 *
 * Neither is a validation failure the app can report usefully — the claim
 * returns `error`, the retry banner appears, and **every retry fails
 * identically**, so the answers never land and the notice never goes away. A
 * value this file accepts must be a value the database accepts; that is the
 * whole contract between it and the CHECK constraints, and it was broken in the
 * two ways a name can carry text nobody typed deliberately.
 *
 * `Array.from` iterates by code point, which is also exactly what Postgres's
 * `char_length()` counts — so the cap here and the cap in the CHECK now agree
 * about what "24" means, rather than agreeing by luck on ASCII.
 */
function capCharacters(value: string, max: number): string {
  // C0/C1 controls and DEL. Deliberately NOT the whole `\p{C}` class: that
  // includes `Cf`, which is where the zero-width joiner lives, and stripping
  // those would break every multi-part emoji.
  const stripped = value.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
  return Array.from(stripped).slice(0, max).join("");
}

/** How long a name may be. Matches the `signup_intake` CHECK. */
export const NAME_MAX = 24;

/**
 * Clean up a typed name: strip what Postgres will not store, cap by CHARACTER,
 * and treat empty as absent.
 *
 * Exported so the SERVER validates with this same function rather than a second
 * copy of the rules — a cap enforced only in an input's `maxLength` is not
 * enforced at all, and `maxLength` is exactly what a paste, a hand-edited
 * `localStorage` key, or a direct call to the server action walks around.
 *
 * Trimmed AFTER the cap, so a name cut mid-word does not keep the space the cut
 * left behind.
 */
export function normaliseName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = capCharacters(raw, NAME_MAX).trim();
  return cleaned.length > 0 ? cleaned : null;
}

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

  // Resolved BEFORE the return, because `struggleDetail`'s scope rule depends
  // on it and reading it off the object again would be a second source of
  // truth for the same answer.
  const struggle = asArray(o.struggle, STRUGGLE_TAGS);

  const attribution = (ATTRIBUTION_TAGS as readonly string[]).includes(
    o.attribution as string,
  )
    ? (o.attribution as AttributionTag)
    : null;

  return {
    name: normaliseName(o.name),
    dob: parseDateKey(typeof o.dob === "string" ? o.dob : null) ? (o.dob as string) : null,
    sex: o.sex === "male" || o.sex === "female" ? o.sex : null,
    consent: o.consent === true,
    /**
     * ⚠️ `=== true`, SO A SESSION SAVED BEFORE THIS FIELD EXISTED READS FALSE.
     *
     * Every session in a real browser right now predates `healthConsent`, and
     * `o.healthConsent` is `undefined` for all of them. Strict equality makes
     * that "not consented", which sends the user to the tick rather than through
     * it. Anything looser (`!== false`, `Boolean(o.healthConsent ?? true)`) would
     * grant a health-data consent nobody gave — the exact defect v2.0 exists to
     * close, arriving through the back door.
     */
    healthConsent: o.healthConsent === true,
    running: asArray(o.running, RUNNING_TAGS),
    struggle,
    attribution,
    // The detail belongs to the catch-all and to nothing else, which is the
    // same rule `signup_attribution_detail_scope` enforces in Postgres. Without
    // this the two fields normalise independently, so a hand-edited session can
    // produce an orphan string filed under a source that never asked for one.
    attributionDetail:
      attribution === "elsewhere"
        ? normaliseAttributionDetail(o.attributionDetail)
        : null,
    // SCOPED TO THE CATCH-ALL, exactly as `attributionDetail` is. A struggle
    // list that no longer contains "other" must not carry a detail: otherwise
    // a user who types something, changes their mind and unticks it leaves an
    // orphan string that is filed against whatever they picked instead.
    struggleDetail: struggle.includes("other")
      ? normaliseDetail(o.struggleDetail)
      : null,
    // Through the SAME validator the URL path uses. This was the one field
    // that trusted whatever came out of storage, which contradicted this
    // file's own "untrusted input by the time it comes back out" contract.
    affiliateCode: normaliseCode(
      typeof o.affiliateCode === "string" ? o.affiliateCode : null,
    ),
    // Membership test against the real plan list, so a plan added to
    // `pricing.ts` survives a storage round-trip without being edited in here
    // too. Anything unrecognised falls back to the hero plan rather than
    // throwing — a hand-edited key must never brick the flow.
    plan: PLAN_ORDER.includes(o.plan as PlanId) ? (o.plan as PlanId) : "yearly",
    startedAt: typeof o.startedAt === "string" ? o.startedAt : null,
  };
}

export const RUNNING_TAGS = [
  "comp_prep",
  "off_season",
  "trt",
  "peptides",
  "first_cycle",
  "blast_cruise",
  "health",
  "nothing",
] as const satisfies readonly RunningTag[];

export const STRUGGLE_TAGS = [
  "whats_left",
  "recon_maths",
  "last_site",
  "notes_app",
  "too_much",
  "no_history",
  "took_today",
  "cant_compare",
  "other",
] as const satisfies readonly StruggleTag[];

/**
 * EXHAUSTIVENESS, ENFORCED AT COMPILE TIME. Do not delete these.
 *
 * `as const satisfies readonly StruggleTag[]` checks every member is a valid
 * tag. It does NOT check every tag is a member, and that asymmetry shipped a
 * CRITICAL on 2026-08-05: `took_today` and `cant_compare` were added to the
 * union, to the chips and to the celebrate answers, but not to the array above.
 *
 * `normaliseSession` filters against the ARRAY, so both tags were silently
 * stripped on every read back out of storage. A user who picked only those two
 * answered the screen, continued, and was then bounced back to it forever by
 * `clampIntent` — the same shape as the iPhone age-gate lockout, sitting in
 * front of the paywall. tsc was clean and 519 tests passed throughout.
 *
 * These lines make the same omission a BUILD failure. `Exclude<Union, Members>`
 * is `never` only when the array covers the union; anything left over is not
 * assignable to `never` and tsc stops.
 */
type UncoveredRunningTag = Exclude<RunningTag, (typeof RUNNING_TAGS)[number]>;
type UncoveredStruggleTag = Exclude<StruggleTag, (typeof STRUGGLE_TAGS)[number]>;
type UncoveredAttributionTag = Exclude<
  AttributionTag,
  (typeof ATTRIBUTION_TAGS)[number]
>;

const _runningTagsAreExhaustive: UncoveredRunningTag[] = [];
const _struggleTagsAreExhaustive: UncoveredStruggleTag[] = [];
const _attributionTagsAreExhaustive: UncoveredAttributionTag[] = [];
void _runningTagsAreExhaustive;
void _struggleTagsAreExhaustive;
void _attributionTagsAreExhaustive;

/** How long a typed attribution may be. Matches the DB CHECK, so a value that
 *  passes here cannot be rejected by Postgres. */
export const DETAIL_MAX = 80;

/** The attribution-specific name for the same cap. Matches the DB CHECK. */
export const ATTRIBUTION_DETAIL_MAX = DETAIL_MAX;

/**
 * Clean up a typed attribution: trim, collapse runs of whitespace (a paste out
 * of a chat app arrives full of newlines), cap, and treat empty as absent.
 *
 * Exported because the SERVER validates with this same function rather than a
 * second copy of the rules. A cap enforced only in the input's `maxLength` is
 * not enforced at all.
 */
export function normaliseDetail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Same two hazards as `normaliseName`, and the same fix: `capCharacters`
  // strips what Postgres refuses and cuts by CHARACTER, so an emoji cannot be
  // halved into a lone surrogate that PostgREST then rejects. Whitespace is
  // collapsed FIRST — a paste out of a chat app arrives full of newlines, and
  // those must not each eat one of the 80 characters.
  const cleaned = capCharacters(raw.replace(/\s+/g, " "), DETAIL_MAX).trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * The attribution-specific name, kept because the attribution screen and its
 * tests both use it and the two fields have identical rules. One
 * implementation, two names, so neither caller has to know about the other.
 */
export const normaliseAttributionDetail = normaliseDetail;

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
