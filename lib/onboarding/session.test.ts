import { describe, expect, it } from "vitest";

import {
  ageInYears,
  ageVerdict,
  ATTRIBUTION_DETAIL_MAX,
  canLeaveHousekeeping,
  EMPTY_SESSION,
  normaliseAttributionDetail,
  normaliseSession,
  parseDateKey,
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
