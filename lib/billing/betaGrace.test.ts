import { describe, expect, it } from "vitest";

import {
  BETA_GRACE_DAYS,
  betaGrantFor,
  COMP_EMAILS,
  graceAsTrial,
  grantExpiry,
  isBetaGrace,
} from "./betaGrace";
import { FOUNDER_EMAILS } from "../admin";

describe("betaGrantFor", () => {
  it("gives the comp list free access forever", () => {
    for (const email of COMP_EMAILS) {
      expect(betaGrantFor(email)).toEqual({ kind: "comp" });
    }
  });

  it("matches regardless of case or surrounding whitespace", () => {
    // Supabase stores what the user typed. Somebody who signed up as
    // "Adrian@..." must not silently fall into the fourteen-day bucket.
    expect(betaGrantFor("ADMIN@TRACKDCO.APP")).toEqual({ kind: "comp" });
    expect(betaGrantFor("  admin@trackdco.app  ")).toEqual({ kind: "comp" });
  });

  it("gives everybody else the grace period, and never nothing", () => {
    // There is deliberately no "nothing" branch. An account that gets nothing is
    // an account locked out on the day billing switches on, with no notice at
    // all, which is the whole thing this file exists to prevent.
    for (const email of ["someone@example.com", "", null, undefined]) {
      expect(betaGrantFor(email)).toEqual({ kind: "grace", days: BETA_GRACE_DAYS });
    }
  });

  it("is not fooled by a near-miss address", () => {
    expect(betaGrantFor("admin@trackdco.app.evil.com").kind).toBe("grace");
    expect(betaGrantFor("xadmin@trackdco.app").kind).toBe("grace");
    expect(betaGrantFor("admin@trackdco.apps").kind).toBe("grace");
  });

  it("gives DOUBLE the seven-day trial", () => {
    // Adrian's call. They agreed to nothing and have had the product for
    // months; a notice shorter than a stranger's trial would read as worse
    // treatment for having been early.
    expect(BETA_GRACE_DAYS).toBe(14);
  });
});

describe("the comp list is NOT the founder list", () => {
  it("is a separate array, even where the addresses coincide today", () => {
    // `FOUNDER_EMAILS` gates /admin (which shows everybody's waitlist sign-ups)
    // and is duplicated into an RLS SELECT policy in SQL. "Free forever" and
    // "may read everyone else's data" are different grants: adding a friend to
    // the comp list must not hand them the admin dashboard.
    expect(COMP_EMAILS).not.toBe(FOUNDER_EMAILS as unknown as readonly string[]);
  });

  it("every comp address is lowercase, so the lookup can be exact", () => {
    for (const email of COMP_EMAILS) {
      expect(email).toBe(email.toLowerCase());
      expect(email.trim()).toBe(email);
    }
  });
});

describe("grantExpiry", () => {
  const from = new Date("2026-08-13T00:00:00.000Z");

  it("never expires a comp", () => {
    expect(grantExpiry({ kind: "comp" }, from)).toBeNull();
  });

  it("puts a grace exactly BETA_GRACE_DAYS out", () => {
    const iso = grantExpiry({ kind: "grace", days: 14 }, from);
    expect(iso).toBe("2026-08-27T00:00:00.000Z");
  });
});

describe("isBetaGrace / graceAsTrial", () => {
  it("recognises comp WITH an expiry, and only that", () => {
    expect(isBetaGrace({ source: "comp", activeUntil: "2026-08-27T00:00:00Z" })).toBe(true);
    // A founder or a friend: free forever, nothing ending, no notice owed.
    expect(isBetaGrace({ source: "comp", activeUntil: null })).toBe(false);
    expect(isBetaGrace(null)).toBe(false);
  });

  it("⚠️ NEVER describes a paid subscription as a trial", () => {
    // The guard that matters. A paying customer's entitlement also carries an
    // `active_until`, so without the `comp` test their dashboard would have
    // announced "Your free trial ends 13 Aug 2027" and the day-5 push would
    // have told them their free trial was ending. Both would be false, and both
    // are about money.
    for (const source of ["stripe", "apple", "google"]) {
      expect(isBetaGrace({ source, activeUntil: "2027-08-13T00:00:00Z" })).toBe(false);
      expect(graceAsTrial({ source, activeUntil: "2027-08-13T00:00:00Z" })).toBeNull();
    }
  });

  it("describes a grace as the trial it functionally is", () => {
    // The shape both the banner and the push already take. Neither has to learn
    // a new concept, and neither can disagree with the other about the date.
    expect(graceAsTrial({ source: "comp", activeUntil: "2026-08-27T00:00:00Z" })).toEqual({
      status: "trialing",
      trialEndsAt: "2026-08-27T00:00:00Z",
      cancelAtPeriodEnd: false,
    });
  });

  it("never reports a grace as already cancelled", () => {
    // Nobody agreed to be charged, so nobody can have opted out of a charge.
    // `trialNoticeFor` and the push both go silent on `cancelAtPeriodEnd`, so a
    // true here would silence the only warning these accounts ever get.
    const grace = graceAsTrial({ source: "comp", activeUntil: "2026-08-27T00:00:00Z" });
    expect(grace?.cancelAtPeriodEnd).toBe(false);
  });
});
