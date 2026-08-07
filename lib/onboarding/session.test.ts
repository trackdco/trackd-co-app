import { describe, expect, it } from "vitest";

import {
  ageInYears,
  ageVerdict,
  ATTRIBUTION_DETAIL_MAX,
  canLeaveHousekeeping,
  DETAIL_MAX,
  EMPTY_SESSION,
  firstIncompleteHousekeeping,
  hasAgeAndConsent,
  normaliseAttributionDetail,
  normaliseDetail,
  normaliseName,
  normaliseSession,
  parseDateKey,
  RUNNING_TAGS,
  STRUGGLE_TAGS,
} from "./session";

/**
 * The age gate is load-bearing (Spec 3-01 §3.2): a user must never be able to
 * pay and then fail the 18+ check. These pin the gate itself, not the screen.
 */

describe("parseDateKey", () => {
  it("accepts a real date", () => {
    expect(parseDateKey("1994-02-28")).toEqual({ year: 1994, month: 2, day: 28 });
  });

  it("rejects a date that does not exist", () => {
    expect(parseDateKey("2026-02-30")).toBeNull();
    expect(parseDateKey("2025-02-29")).toBeNull();
    expect(parseDateKey("2026-04-31")).toBeNull();
  });

  it("accepts a real leap day", () => {
    expect(parseDateKey("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it("rejects malformed and empty input", () => {
    for (const bad of ["", "not-a-date", "2026-1-1", "20260101", null, undefined]) {
      expect(parseDateKey(bad as string)).toBeNull();
    }
  });
});

describe("ageInYears", () => {
  it("counts whole years", () => {
    expect(ageInYears("2000-07-31", "2026-07-31")).toBe(26);
  });

  it("does not count a birthday that has not happened yet", () => {
    expect(ageInYears("2008-08-01", "2026-07-31")).toBe(17);
  });

  it("counts the birthday itself", () => {
    expect(ageInYears("2008-07-31", "2026-07-31")).toBe(18);
  });

  it("handles a 29 February birthday in a common year", () => {
    // Turning 18 on the 29th: on 28 Feb 2026 they are still 17.
    expect(ageInYears("2008-02-29", "2026-02-28")).toBe(17);
    expect(ageInYears("2008-02-29", "2026-03-01")).toBe(18);
  });
});

describe("ageVerdict", () => {
  const today = "2026-07-31";

  it("passes an adult", () => {
    expect(ageVerdict("1994-02-28", today)).toBe("ok");
  });

  it("blocks a minor", () => {
    expect(ageVerdict("2010-01-01", today)).toBe("under");
  });

  it("blocks the day before the eighteenth birthday", () => {
    expect(ageVerdict("2008-08-01", today)).toBe("under");
  });

  it("passes on the eighteenth birthday exactly", () => {
    expect(ageVerdict("2008-07-31", today)).toBe("ok");
  });

  it("reports an empty or malformed field as unknown, never as a pass", () => {
    expect(ageVerdict(null, today)).toBe("unknown");
    expect(ageVerdict("", today)).toBe("unknown");
    expect(ageVerdict("2026-02-30", today)).toBe("unknown");
  });

  it("reports a future date as a typo rather than a refusal", () => {
    expect(ageVerdict("2030-01-01", today)).toBe("future");
  });
});

describe("canLeaveHousekeeping", () => {
  const today = "2026-07-31";
  const adult = {
    name: "Adrian",
    dob: "1994-02-28",
    sex: "male" as const,
    consent: true,
  };

  it("opens only when name, consent, sex and an 18+ DOB are all present", () => {
    expect(canLeaveHousekeeping(adult, today)).toBe(true);
  });

  it("stays shut without consent", () => {
    expect(canLeaveHousekeeping({ ...adult, consent: false }, today)).toBe(false);
  });

  it("stays shut without a sex", () => {
    expect(canLeaveHousekeeping({ ...adult, sex: null }, today)).toBe(false);
  });

  it("stays shut for a minor even with consent ticked", () => {
    expect(canLeaveHousekeeping({ ...adult, dob: "2012-01-01" }, today)).toBe(false);
  });

  it("stays shut with no DOB at all", () => {
    expect(canLeaveHousekeeping({ ...adult, dob: null }, today)).toBe(false);
  });

  it("stays shut without a name, and treats whitespace as no name", () => {
    expect(canLeaveHousekeeping({ ...adult, name: null }, today)).toBe(false);
    expect(canLeaveHousekeeping({ ...adult, name: "   " }, today)).toBe(false);
  });
});

describe("normaliseSession", () => {
  it("returns the empty session for junk", () => {
    expect(normaliseSession(null)).toEqual(EMPTY_SESSION);
    expect(normaliseSession("nope")).toEqual(EMPTY_SESSION);
    expect(normaliseSession(42)).toEqual(EMPTY_SESSION);
  });

  it("drops a tampered consent flag that is not literally true", () => {
    expect(normaliseSession({ consent: "true" }).consent).toBe(false);
    expect(normaliseSession({ consent: 1 }).consent).toBe(false);
  });

  it("drops a tampered DOB so a hand-edited key cannot pass the gate", () => {
    expect(normaliseSession({ dob: "not-a-date" }).dob).toBeNull();
    expect(normaliseSession({ dob: "2026-02-30" }).dob).toBeNull();
  });

  it("trims a name and drops one that is only whitespace", () => {
    expect(normaliseSession({ name: "  Adrian  " }).name).toBe("Adrian");
    expect(normaliseSession({ name: "   " }).name).toBeNull();
    expect(normaliseSession({ name: 42 }).name).toBeNull();
  });

  it("keeps only recognised tags and de-duplicates them", () => {
    const s = normaliseSession({
      running: ["trt", "trt", "nonsense", 7],
      struggle: ["notes_app", "made_up"],
    });
    expect(s.running).toEqual(["trt"]);
    expect(s.struggle).toEqual(["notes_app"]);
  });

  it("defaults an unrecognised plan to yearly", () => {
    expect(normaliseSession({ plan: "lifetime" }).plan).toBe("yearly");
    expect(normaliseSession({ plan: "monthly" }).plan).toBe("monthly");
  });
});

describe("attribution detail", () => {
  it("keeps a typed answer, tidied", () => {
    expect(normaliseAttributionDetail("  the lift club  podcast ")).toBe(
      "the lift club podcast",
    );
    // A paste out of a chat app arrives full of newlines.
    expect(normaliseAttributionDetail("my\ncoach\t Sam")).toBe("my coach Sam");
  });

  it("treats empty and whitespace-only as no answer", () => {
    expect(normaliseAttributionDetail("")).toBeNull();
    expect(normaliseAttributionDetail("   ")).toBeNull();
    expect(normaliseAttributionDetail(null)).toBeNull();
    expect(normaliseAttributionDetail(42)).toBeNull();
  });

  it("caps the length, because this ends up in an aggregate someone reads", () => {
    const long = "x".repeat(500);
    expect(normaliseAttributionDetail(long)).toHaveLength(ATTRIBUTION_DETAIL_MAX);
  });

  it("normalises what comes back out of storage", () => {
    expect(
      normaliseSession({ attribution: "elsewhere", attributionDetail: "  a  podcast  " })
        .attributionDetail,
    ).toBe("a podcast");
    expect(normaliseSession({}).attributionDetail).toBeNull();
  });

  it("drops a detail that is not attached to the catch-all", () => {
    // The same rule `signup_attribution_detail_scope` enforces in Postgres. A
    // hand-edited session must not be able to file free text under a source
    // that never asked for any, which would put "the lift club" in the
    // Instagram bucket the first time this is written to the database.
    expect(
      normaliseSession({ attribution: "instagram", attributionDetail: "the lift club" })
        .attributionDetail,
    ).toBeNull();
    expect(
      normaliseSession({ attribution: null, attributionDetail: "the lift club" })
        .attributionDetail,
    ).toBeNull();
  });
});

describe("the retired struggle tag", () => {
  it("drops `units_to_draw` from a session written before it was removed", () => {
    // Adrian removed "converting a dose into syringe units" on 2026-08-01. A
    // device that answered the old question must not carry a tag the celebrate
    // screen has no answer for.
    const s = normaliseSession({ struggle: ["whats_left", "units_to_draw"] });
    expect(s.struggle).toEqual(["whats_left"]);
  });
});

describe("the age gate and a date input's intermediate states", () => {
  const TODAY = "2026-08-01";

  it("an empty DOB never passes the gate", () => {
    const base = { name: "Testy", sex: "male" as const, consent: true };
    expect(canLeaveHousekeeping({ ...base, dob: null }, TODAY)).toBe(false);
    expect(canLeaveHousekeeping({ ...base, dob: "" }, TODAY)).toBe(false);
  });

  it("a complete DOB passes and a partial one does not parse", () => {
    // The housekeeping field commits to the session only when `parseDateKey`
    // accepts the value, which is what stops iOS's wheel — it fires `change`
    // with empty and partial values while it is still turning, and one of those
    // used to wipe a date the user had already committed and lock them out of
    // the flow entirely.
    expect(parseDateKey("1990-05-20")).not.toBeNull();
    expect(parseDateKey("")).toBeNull();
    expect(parseDateKey("1990-05")).toBeNull();
    expect(parseDateKey("1990")).toBeNull();
    // A single-digit year is rejected, and by accident rather than by design:
    // `new Date(1, …)` maps years 0-99 onto 1900-1999, so the round-trip check
    // that catches 31 February catches this too. Recorded because it looks like
    // a gap and is not one — nobody's date of birth is in year 1.
    expect(parseDateKey("0001-05-20")).toBeNull();

    const base = { name: "Testy", sex: "male" as const, consent: true };
    expect(canLeaveHousekeeping({ ...base, dob: "1990-05-20" }, TODAY)).toBe(true);
  });
});

/**
 * `firstIncompleteHousekeeping` is the ONE function deciding where an untrusted
 * `?step=` may land once housekeeping became four screens. It replaced a bare
 * boolean, so the risk it introduces is a session being sent to a LATER screen
 * with a hole behind it — every case below exists to make that impossible.
 */
describe("firstIncompleteHousekeeping", () => {
  const TODAY = "2026-08-05";
  const complete = {
    name: "Testy",
    dob: "1990-05-20",
    sex: "male" as const,
    consent: true,
  };

  it("returns null only when every screen is answered", () => {
    expect(firstIncompleteHousekeeping(complete, TODAY)).toBeNull();
  });

  it("walks to the EARLIEST hole, not the last one", () => {
    // Nothing answered at all: it must be `name`, the first screen, even though
    // the age and the sex are also missing.
    expect(
      firstIncompleteHousekeeping(
        { name: null, dob: null, sex: null, consent: false },
        TODAY,
      ),
    ).toBe("name");
  });

  it("holds at birthday for an unproven age OR a missing consent", () => {
    expect(firstIncompleteHousekeeping({ ...complete, dob: null }, TODAY)).toBe(
      "birthday",
    );
    expect(
      firstIncompleteHousekeeping({ ...complete, dob: "2012-01-01" }, TODAY),
    ).toBe("birthday");
    expect(
      firstIncompleteHousekeeping({ ...complete, consent: false }, TODAY),
    ).toBe("birthday");
  });

  it("holds at gender for a missing sex", () => {
    expect(firstIncompleteHousekeeping({ ...complete, sex: null }, TODAY)).toBe(
      "gender",
    );
  });

  it("treats a whitespace-only name as no name", () => {
    expect(firstIncompleteHousekeeping({ ...complete, name: "   " }, TODAY)).toBe(
      "name",
    );
  });

  it("agrees with canLeaveHousekeeping on every combination", () => {
    // The two predicates must never disagree: one drives the buttons, the other
    // drives the URL clamp, and a divergence is a bypass. Exhaustive over the
    // four inputs rather than spot-checked.
    for (const name of ["Testy", null]) {
      for (const dob of ["1990-05-20", "2012-01-01", null]) {
        for (const sex of ["male", null] as const) {
          for (const consent of [true, false]) {
            const session = { name, dob, sex, consent };
            expect(firstIncompleteHousekeeping(session, TODAY) === null).toBe(
              canLeaveHousekeeping(session, TODAY),
            );
          }
        }
      }
    }
  });
});

describe("hasAgeAndConsent", () => {
  const TODAY = "2026-08-05";

  it("is the legal half only, and ignores name and sex", () => {
    // The birthday screen gates on this alone. Requiring a sex that has not
    // been asked for yet would leave its button dead with nothing on screen to
    // explain why.
    expect(
      hasAgeAndConsent({ dob: "1990-05-20", consent: true }, TODAY),
    ).toBe(true);
  });

  it("refuses an under-18, a missing date, or an unticked consent", () => {
    expect(hasAgeAndConsent({ dob: "2012-01-01", consent: true }, TODAY)).toBe(false);
    expect(hasAgeAndConsent({ dob: null, consent: true }, TODAY)).toBe(false);
    expect(hasAgeAndConsent({ dob: "1990-05-20", consent: false }, TODAY)).toBe(false);
  });
});

/**
 * `struggleDetail` mirrors `attributionDetail` exactly, including the scope
 * rule. These exist because the two fields are easy to let drift, and because
 * the struggle tag list shipped a CRITICAL on the day this was added.
 */
describe("struggleDetail", () => {
  it("keeps a typed answer when the catch-all is picked", () => {
    expect(
      normaliseSession({ struggle: ["other"], struggleDetail: "  my   coach  " })
        .struggleDetail,
    ).toBe("my coach");
  });

  it("drops a detail that is not attached to the catch-all", () => {
    // A user types something, changes their mind, unticks "Something else".
    // The orphan must not be filed against whatever they kept.
    expect(
      normaliseSession({ struggle: ["whats_left"], struggleDetail: "my coach" })
        .struggleDetail,
    ).toBeNull();
    expect(
      normaliseSession({ struggle: [], struggleDetail: "my coach" }).struggleDetail,
    ).toBeNull();
  });

  it("caps the length, because this ends up in an aggregate someone reads", () => {
    expect(
      normaliseSession({ struggle: ["other"], struggleDetail: "x".repeat(500) })
        .struggleDetail,
    ).toHaveLength(DETAIL_MAX);
  });

  it("treats empty and non-string as no answer", () => {
    for (const bad of ["", "   ", null, 42, {}]) {
      expect(
        normaliseSession({ struggle: ["other"], struggleDetail: bad }).struggleDetail,
      ).toBeNull();
    }
  });
});

/**
 * THE OMISSION THAT CAUSED THE LOCKOUT, pinned.
 *
 * Every tag offered on a screen must survive a storage round-trip. When
 * `took_today` and `cant_compare` were missing from `STRUGGLE_TAGS`, a user who
 * picked only those was bounced back to the screen forever. tsc was clean and
 * the suite was green, because `satisfies` checks assignability and not
 * exhaustiveness.
 */
describe("every tag survives a round-trip", () => {
  it("keeps each struggle tag individually", () => {
    for (const tag of STRUGGLE_TAGS) {
      expect(normaliseSession({ struggle: [tag] }).struggle).toEqual([tag]);
    }
  });

  it("keeps each running tag individually", () => {
    for (const tag of RUNNING_TAGS) {
      expect(normaliseSession({ running: [tag] }).running).toEqual([tag]);
    }
  });

  it("keeps a retired-from-the-UI tag that a device may still hold", () => {
    // `off_season` is no longer offered but is still parsed, so a device that
    // answered it before 2026-08-05 does not silently lose its answer.
    expect(normaliseSession({ running: ["off_season"] }).running).toEqual([
      "off_season",
    ]);
  });
});

/**
 * WHAT POSTGRES WILL NOT STORE, PINNED.
 *
 * Both of these were live defects found by a cold review of spec w2b-14, and
 * both are the same shape: `normaliseSession` accepted a value the database
 * then rejected, which is the exact contract this file's caps exist to hold.
 * The failure was not a validation message — it was `status: "error"` from the
 * claim, a retry banner, and every retry failing identically, so the answers
 * never landed and the notice never went away.
 */
describe("normaliseName / normaliseDetail — values Postgres refuses", () => {
  it("strips a NUL byte, which trim() does not", () => {
    // Postgres: 22P05 unsupported Unicode escape sequence.
    expect(normaliseName("a\u0000b")).toBe("ab");
    expect(normaliseDetail("a\u0000b")).toBe("ab");
  });

  it("strips other control characters without touching the joiner", () => {
    expect(normaliseName("a\u0007b\u001Fc")).toBe("abc");
    // U+200D ZERO WIDTH JOINER is Cf, not a control. Stripping the whole \p{C}
    // class would take it and break every multi-part emoji.
    expect(normaliseName("\u{1F468}\u200D\u{1F4BB}")).toBe("\u{1F468}\u200D\u{1F4BB}");
  });

  it("never cuts an emoji in half into a lone surrogate", () => {
    // 23 chars + an astral emoji + a tail. A UTF-16 slice at 24 lands INSIDE
    // the surrogate pair; PostgREST answers PGRST102 Empty or invalid json.
    const name = normaliseName("a".repeat(23) + "\u{1F600}" + "tail");
    expect(name).not.toBeNull();
    expect(isWellFormed(name!)).toBe(true);
    expect([...name!]).toHaveLength(24);
  });

  it("caps by CHARACTER, which is what Postgres char_length counts", () => {
    // 24 emoji is 48 UTF-16 units and 24 Postgres characters, so it must pass.
    const name = normaliseName("\u{1F600}".repeat(30));
    expect([...name!]).toHaveLength(24);
    expect(isWellFormed(name!)).toBe(true);

    const detail = normaliseDetail("\u{1F600}".repeat(100));
    expect([...detail!]).toHaveLength(DETAIL_MAX);
    expect(isWellFormed(detail!)).toBe(true);
  });

  it("still treats an empty or whitespace-only value as absent", () => {
    expect(normaliseName("   ")).toBeNull();
    expect(normaliseName("\u0000")).toBeNull();
    expect(normaliseName(null)).toBeNull();
    expect(normaliseName(7)).toBeNull();
  });

  it("carries the same protection through a full session round-trip", () => {
    const session = normaliseSession({
      name: "Adrian\u0000",
      struggle: ["other"],
      struggleDetail: "two\u0000vials",
    });
    expect(session.name).toBe("Adrian");
    expect(session.struggleDetail).toBe("twovials");
  });
});

/** Does this string contain a lone surrogate? (Node 20 lacks isWellFormed.) */
function isWellFormed(value: string): boolean {
  return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
    value,
  );
}
