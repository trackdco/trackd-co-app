import { describe, expect, it } from "vitest";

import {
  REMINDER_DAY,
  TRIAL_DAYS,
  TRIAL_REMINDER_LEAD_DAYS,
} from "@/lib/onboarding/pricing";
import { shiftDateKey } from "@/lib/notifications/reminders";
import {
  resolveEnding,
  trialNoticeBody,
  trialNoticeFor,
  trialNoticeLine,
  trialReminderDateKey,
  trialReminderMessage,
  trialReminderVerdict,
  type TrialForReminder,
} from "@/lib/notifications/trialReminder";

const SYD = "Australia/Sydney";
const LA = "America/Los_Angeles";

/**
 * 10:00 on a given LOCAL day, as a real instant.
 *
 * The verdict takes an instant now, not a date key, because `trial_ends_at` is
 * an instant and the old day-number comparison sent a reminder seven hours
 * AFTER the charge on the final day. Ten in the morning is after the default
 * 09:00 reminder time and safely inside the day in both test zones.
 */
function at(dateKey: string, tz: string): Date {
  const offset = tz === SYD ? "+10:00" : tz === LA ? "-07:00" : "Z";
  return new Date(`${dateKey}T10:00:00${offset}`);
}

/** An instant `minutes` before the trial actually ends. */
function before(t: TrialForReminder, minutes: number): Date {
  return new Date(Date.parse(t.trialEndsAt!) - minutes * 60_000);
}

function trial(over: Partial<TrialForReminder> = {}): TrialForReminder {
  return {
    status: "trialing",
    trialEndsAt: "2026-08-14T15:39:23.000Z",
    cancelAtPeriodEnd: false,
    ...over,
  };
}

describe("the promise the screens make", () => {
  it("counts back exactly as far as the screens count forward", () => {
    // The paywall says "Day 5 · Reminder" and "Day 7 · Billing starts", so the
    // gap between them is what the sender has to reproduce from the other end.
    expect(TRIAL_REMINDER_LEAD_DAYS).toBe(TRIAL_DAYS - REMINDER_DAY);
    expect(TRIAL_REMINDER_LEAD_DAYS).toBe(2);
  });

  it("does NOT land on the day Stripe's webhook fires", () => {
    // Stripe fires `trial_will_end` three days out. If the lead were ever three,
    // the whole feature would be pointless and the screens would be wrong.
    expect(TRIAL_REMINDER_LEAD_DAYS).not.toBe(3);
  });
});

describe("trialReminderDateKey", () => {
  it("resolves the trial end in the USER's calendar, not the server's", () => {
    // The same instant. 15:39Z is already the 15th in Sydney and still the 14th
    // in Los Angeles, so the two users are promised different calendar days.
    expect(trialReminderDateKey(trial(), SYD)).toBe("2026-08-13");
    expect(trialReminderDateKey(trial(), LA)).toBe("2026-08-12");
  });

  it("crosses a month boundary backwards", () => {
    expect(
      trialReminderDateKey(trial({ trialEndsAt: "2026-03-01T05:00:00.000Z" }), "UTC"),
    ).toBe("2026-02-27");
  });

  it("crosses a leap day", () => {
    expect(
      trialReminderDateKey(trial({ trialEndsAt: "2028-03-01T05:00:00.000Z" }), "UTC"),
    ).toBe("2028-02-28");
  });

  it("crosses a year boundary", () => {
    expect(
      trialReminderDateKey(trial({ trialEndsAt: "2027-01-01T05:00:00.000Z" }), "UTC"),
    ).toBe("2026-12-30");
  });

  it("is null for anything that is not a running trial", () => {
    expect(trialReminderDateKey(trial({ status: "active" }), SYD)).toBeNull();
    expect(trialReminderDateKey(trial({ status: "canceled" }), SYD)).toBeNull();
    expect(trialReminderDateKey(trial({ trialEndsAt: null }), SYD)).toBeNull();
    expect(trialReminderDateKey(trial({ trialEndsAt: "not a date" }), SYD)).toBeNull();
  });
});

describe("trialReminderVerdict", () => {
  const tz = SYD;
  // Sydney: the trial's last local day is the 15th, so the reminder is the 13th.
  const REMIND_ON = "2026-08-13";
  const LAST_DAY = "2026-08-15";

  it("sends on the promised day", () => {
    expect(trialReminderVerdict(trial(), tz, at(REMIND_ON, tz), null)).toEqual({
      send: true,
      forDate: REMIND_ON,
    });
  });

  it("says nothing before the promised day", () => {
    const v = trialReminderVerdict(trial(), tz, at(shiftDateKey(REMIND_ON, -1), tz), null);
    expect(v).toEqual({ send: false, reason: "too-early" });
  });

  it("CATCHES UP if the cron missed the day", () => {
    // A deploy, an outage, a phone with no subscription registered that morning.
    // A late warning is worth a lot; a missed one is the thing the screen
    // promised would not happen. It still stamps the PROMISED day.
    const v = trialReminderVerdict(trial(), tz, at(shiftDateKey(REMIND_ON, 1), tz), null);
    expect(v).toEqual({ send: true, forDate: REMIND_ON });
  });

  it("sends right up to the minute before the charge", () => {
    expect(trialReminderVerdict(trial(), tz, before(trial(), 1), null)).toEqual({
      send: true,
      forDate: REMIND_ON,
    });
  });

  it("STOPS AT THE INSTANT OF THE CHARGE, not at the end of that day", () => {
    /**
     * The critical defect a cold review measured. This compared DAY NUMBERS, so
     * on the trial's final local day it kept sending all day — and every trial
     * the app creates ends in the small hours of that day, because it is seven
     * times twenty-four hours from a signup at any time. Measured: a real push
     * delivered at 09:00 saying "your trial ends today, and billing starts then"
     * SEVEN HOURS AND TWENTY-ONE MINUTES after the card was charged.
     */
    const t = trial(); // ends 01:39 Sydney on the 15th
    expect(trialReminderVerdict(t, tz, before(t, -1), null)).toEqual({
      send: false,
      reason: "trial-over",
    });
    // 09:00 on the final local day is AFTER the charge, and must say nothing.
    expect(trialReminderVerdict(t, tz, at(LAST_DAY, tz), null)).toEqual({
      send: false,
      reason: "trial-over",
    });
    // And every later day, obviously.
    expect(
      trialReminderVerdict(t, tz, at(shiftDateKey(LAST_DAY, 1), tz), null),
    ).toEqual({ send: false, reason: "trial-over" });
  });

  it("sends once and only once", () => {
    const first = trialReminderVerdict(trial(), tz, at(REMIND_ON, tz), null);
    expect(first.send).toBe(true);
    // The stamp is the reminder's own date, so the next tick sees its own work.
    const second = trialReminderVerdict(trial(), tz, at(REMIND_ON, tz), REMIND_ON);
    expect(second).toEqual({ send: false, reason: "already-sent" });
    // And so does every tick for the rest of the trial.
    expect(trialReminderVerdict(trial(), tz, before(trial(), 60), REMIND_ON)).toEqual({
      send: false,
      reason: "already-sent",
    });
  });

  it("a catch-up send suppresses itself the next day", () => {
    // The regression this shape exists to prevent: stamping "today" on a
    // catch-up would leave the promised day unstamped and fire again tomorrow.
    const late = shiftDateKey(REMIND_ON, 1);
    const v = trialReminderVerdict(trial(), tz, at(late, tz), null);
    expect(v).toEqual({ send: true, forDate: REMIND_ON });
    expect(trialReminderVerdict(trial(), tz, at(late, tz), REMIND_ON).send).toBe(false);
  });

  it("a NEW trial gets its own reminder despite an old stamp", () => {
    // A returning customer. The old stamp is a different date, so it cannot
    // suppress a genuinely new trial.
    const second = trial({ trialEndsAt: "2026-12-14T15:39:23.000Z" });
    const v = trialReminderVerdict(second, tz, at("2026-12-13", tz), REMIND_ON);
    expect(v).toEqual({ send: true, forDate: "2026-12-13" });
  });

  it("says nothing to somebody who has already cancelled", () => {
    // Nothing is about to change for them, and telling them billing starts
    // would send them rushing to cancel a thing they already cancelled.
    const v = trialReminderVerdict(trial({ cancelAtPeriodEnd: true }), tz, at(REMIND_ON, tz), null);
    expect(v).toEqual({ send: false, reason: "already-cancelled" });
  });

  it("says nothing when there is no trial at all", () => {
    expect(trialReminderVerdict(null, tz, at(REMIND_ON, tz), null)).toEqual({
      send: false,
      reason: "no-trial",
    });
  });

  it("says nothing once the subscription has converted", () => {
    const v = trialReminderVerdict(trial({ status: "active" }), tz, at(REMIND_ON, tz), null);
    expect(v).toEqual({ send: false, reason: "status-active" });
  });

  it("says nothing when the trial has no end date", () => {
    const v = trialReminderVerdict(trial({ trialEndsAt: null }), tz, at(REMIND_ON, tz), null);
    expect(v).toEqual({ send: false, reason: "no-trial-end" });
  });

  it("gives two users in different zones their own promised day", () => {
    // Same subscription, same instant. Neither is sent on the other's day.
    expect(trialReminderVerdict(trial(), SYD, at("2026-08-13", SYD), null).send).toBe(true);
    expect(trialReminderVerdict(trial(), LA, at("2026-08-13", LA), null).send).toBe(true); // catch-up
    expect(trialReminderVerdict(trial(), LA, at("2026-08-12", LA), null)).toEqual({
      send: true,
      forDate: "2026-08-12",
    });
    expect(trialReminderVerdict(trial(), SYD, at("2026-08-12", SYD), null)).toEqual({
      send: false,
      reason: "too-early",
    });
  });
});

describe("the in-app notice", () => {
  const tz = SYD;
  const REMIND_ON = "2026-08-13";
  const LAST_DAY = "2026-08-15";

  it("opens on the SAME day the push is promised for", () => {
    // Two surfaces, one promise. If these could differ, one of them would be
    // lying about which day was committed to on the paywall.
    const notice = trialNoticeFor(trial(), tz, at(REMIND_ON, tz), null);
    expect(notice?.forDate).toBe(REMIND_ON);
    expect(trialReminderVerdict(trial(), tz, at(REMIND_ON, tz), null)).toEqual({
      send: true,
      forDate: REMIND_ON,
    });
  });

  it("is absent before the promised day", () => {
    expect(trialNoticeFor(trial(), tz, at("2026-08-12", tz), null)).toBeNull();
  });

  it("stays up for the whole final stretch, unlike the push", () => {
    // The push fires once. The banner is the standing statement of the fact.
    expect(trialNoticeFor(trial(), tz, at("2026-08-13", tz), null)?.daysLeft).toBe(2);
    expect(trialNoticeFor(trial(), tz, at("2026-08-14", tz), null)?.daysLeft).toBe(1);
    // The final day exists only between midnight and the 01:39 charge.
    expect(trialNoticeFor(trial(), tz, before(trial(), 30), null)?.daysLeft).toBe(0);
  });

  it("VANISHES THE MOMENT THE CHARGE LANDS", () => {
    // Not at the end of that calendar day. The banner said "Your free trial ends
    // today" for the whole of a day on which the money had already moved.
    const t = trial();
    expect(trialNoticeFor(t, tz, before(t, 1), null)).not.toBeNull();
    expect(trialNoticeFor(t, tz, before(t, -1), null)).toBeNull();
    expect(trialNoticeFor(t, tz, at(LAST_DAY, tz), null)).toBeNull();
    expect(trialNoticeFor(t, tz, at("2026-08-16", tz), null)).toBeNull();
  });

  it("says nothing to somebody who has already cancelled", () => {
    expect(
      trialNoticeFor(trial({ cancelAtPeriodEnd: true }), tz, at(REMIND_ON, tz), null),
    ).toBeNull();
  });

  it("a dismissal is scoped to ONE trial", () => {
    expect(trialNoticeFor(trial(), tz, at(REMIND_ON, tz), REMIND_ON)).toBeNull();
    // A returning customer's second trial has its own date, so it is announced
    // again rather than being silenced by a stamp from months ago.
    const second = trial({ trialEndsAt: "2026-12-14T15:39:23.000Z" });
    expect(trialNoticeFor(second, tz, at("2026-12-13", tz), REMIND_ON)?.forDate).toBe(
      "2026-12-13",
    );
  });

  it("gives two zones their own window", () => {
    expect(trialNoticeFor(trial(), LA, at("2026-08-12", LA), null)?.forDate).toBe("2026-08-12");
    expect(trialNoticeFor(trial(), SYD, at("2026-08-12", SYD), null)).toBeNull();
  });
});

describe("trialNoticeLine", () => {
  const tz = SYD;

  it("states when the trial ends, and nothing else", () => {
    const line = trialNoticeLine(trialNoticeFor(trial(), tz, at("2026-08-13", tz), null)!);
    expect(line).toBe("Your free trial ends 15 Aug.");
  });

  it("reads naturally on the last two days", () => {
    expect(trialNoticeLine(trialNoticeFor(trial(), tz, at("2026-08-14", tz), null)!)).toBe(
      "Your free trial ends tomorrow.",
    );
    expect(trialNoticeLine(trialNoticeFor(trial(), tz, before(trial(), 30), null)!)).toBe(
      "Your free trial ends today.",
    );
  });

  it("is ONE sentence, with no tail of any kind", () => {
    // Two drafts died here. "Everything you've logged stays." was reassurance
    // nobody asked for; "Billing starts then." was the app explaining its own
    // warning. A banner is a glance, and everything after the first full stop is
    // something the reader has to decide whether to care about.
    const moments = [
      at("2026-08-13", tz),
      at("2026-08-14", tz),
      before(trial(), 30), // the sliver of the final day before the charge
    ];
    for (const moment of moments) {
      const line = trialNoticeLine(trialNoticeFor(trial(), tz, moment, null)!);
      expect(line).toMatch(/^Your free trial ends [^.]+\.$/);
      expect(line.toLowerCase()).not.toContain("cancel");
      expect(line.toLowerCase()).not.toContain("stays");
      expect(line.toLowerCase()).not.toContain("billing");
      expect(line).not.toContain("—");
    }
  });

  it("names the date in the user's own zone", () => {
    expect(trialNoticeLine(trialNoticeFor(trial(), LA, at("2026-08-12", LA), null)!)).toContain(
      "14 Aug",
    );
  });
});

describe("trialReminderMessage", () => {
  it("states the day and the date in the user's own zone", () => {
    const m = trialReminderMessage(trial(), SYD)!;
    expect(m.title).toBe("Your free trial ends soon");
    expect(m.body).toContain(`Day ${REMINDER_DAY} of ${TRIAL_DAYS}`);
    expect(m.body).toContain("15 Aug"); // the 15th in Sydney
    expect(m.tag).toBe("trackd-trial-ending");
  });

  it("shows a different date to a user in a different zone", () => {
    expect(trialReminderMessage(trial(), LA)!.body).toContain("14 Aug");
  });

  it("carries NO em dash, per the house rule", () => {
    for (const tz of [SYD, LA, "UTC", "Europe/London"]) {
      const m = trialReminderMessage(trial(), tz)!;
      expect(m.title).not.toContain("—");
      expect(m.body).not.toContain("—");
    }
  });

  it("does not send anyone looking for a cancel button that does not exist", () => {
    // There is no billing portal and no cancel route in the app. The copy must
    // not imply one. If a cancel path is ever built, THIS test is the reminder
    // that the copy can then say so.
    const m = trialReminderMessage(trial(), SYD)!;
    expect(m.body.toLowerCase()).not.toContain("cancel");
  });

  it("quotes no price, because the runner does not hold one", () => {
    const m = trialReminderMessage(trial(), SYD)!;
    expect(m.body).not.toMatch(/\$|\d+\.\d{2}/);
  });

  it("is null for an unusable trial end", () => {
    expect(trialReminderMessage(trial({ trialEndsAt: null }), SYD)).toBeNull();
    expect(trialReminderMessage(trial({ trialEndsAt: "nope" }), SYD)).toBeNull();
  });
});

/**
 * THE THREE ENDINGS (`07` §3.4).
 *
 * The machinery hands all three to the sender in one shape, which is a good
 * decision and costs the date arithmetic nothing. The copy is where it stops
 * being one: a trial ends in a charge, a grace ends in read-only, and a courtesy
 * period ends in a charge to somebody who has already paid for two years.
 *
 * These are the assertions that stop the wrong one being sent. Note what they
 * pin: the fallback is NEUTRAL and never the trial variant, because the neutral
 * wording is true of all three endings and the trial wording is false of two.
 */
describe("resolveEnding", () => {
  it("reads a real trial when the column says there is no courtesy period", () => {
    expect(resolveEnding({ isBetaGrace: false, courtesyUntil: null, noun: null }))
      .toEqual({ kind: "trial" });
  });

  it("reads the beta grace first, whatever else is true", () => {
    expect(resolveEnding({ isBetaGrace: true, courtesyUntil: null, noun: "month" }))
      .toEqual({ kind: "grace" });
  });

  it("reads a courtesy period when the column and the noun are both known", () => {
    expect(resolveEnding({ isBetaGrace: false, courtesyUntil: "2026-09-15T00:00:00Z", noun: "month" }))
      .toEqual({ kind: "courtesy", noun: "month" });
  });

  it("⚠️ falls back to NEUTRAL when the column cannot be read, never to the trial", () => {
    // `undefined` is the unapplied-migration case: 003 not yet run, PostgREST
    // answers 42703, and we genuinely do not know which ending this is. Calling
    // it a trial would tell a paying customer their trial was ending.
    const ending = resolveEnding({ isBetaGrace: false, courtesyUntil: undefined, noun: "month" });
    expect(ending).toEqual({ kind: "grace" });
    expect(ending.kind).not.toBe("trial");
  });

  it("⚠️ treats undefined and null as DIFFERENT facts", () => {
    // Collapsing them is the bug the signature exists to prevent.
    expect(resolveEnding({ isBetaGrace: false, courtesyUntil: undefined, noun: null }).kind).toBe("grace");
    expect(resolveEnding({ isBetaGrace: false, courtesyUntil: null, noun: null }).kind).toBe("trial");
  });

  it("falls back to neutral when the noun is unknown rather than guessing", () => {
    // "free week" and "free month" are the only signed forms. A coin flip between
    // them is a coin flip printed in a billing notice.
    expect(resolveEnding({ isBetaGrace: false, courtesyUntil: "2026-09-15T00:00:00Z", noun: null }))
      .toEqual({ kind: "grace" });
  });

  it("falls back to neutral on an unparseable courtesy date", () => {
    expect(resolveEnding({ isBetaGrace: false, courtesyUntil: "nope", noun: "week" }))
      .toEqual({ kind: "grace" });
  });
});

describe("the banner's three variants", () => {
  const tz = SYD;
  const notice = () => trialNoticeFor(trial(), tz, at("2026-08-13", tz), null)!;

  it("⚠️ never calls the beta grace a trial", () => {
    // The defect this fixes: the banner had ONE variant while the push had two,
    // and the dashboard feeds it `graceAsTrial(...)`, so ~90 accounts with no
    // card on file would have read "Your free trial ends 15 Aug." on launch
    // morning. The push's grace variant already existed to prevent exactly this.
    const line = trialNoticeLine(notice(), { kind: "grace" });
    expect(line).toBe("Your free access ends 15 Aug.");
    expect(line).not.toContain("trial");
  });

  it("⚠️ never calls a courtesy period a trial, and follows the granted noun", () => {
    expect(trialNoticeLine(notice(), { kind: "courtesy", noun: "month" }))
      .toBe("Your free month ends on 15 Aug.");
    expect(trialNoticeLine(notice(), { kind: "courtesy", noun: "week" }))
      .toBe("Your free week ends on 15 Aug.");
    expect(trialNoticeLine(notice(), { kind: "courtesy", noun: "month" })).not.toContain("trial");
  });

  it("keeps the approved trial line unchanged, and defaults to it", () => {
    expect(trialNoticeLine(notice())).toBe("Your free trial ends 15 Aug.");
    expect(trialNoticeLine(notice(), { kind: "trial" })).toBe("Your free trial ends 15 Aug.");
  });

  it("carries D33's body on the courtesy variant and on neither other", () => {
    expect(trialNoticeBody({ kind: "courtesy", noun: "month" })).toBe(
      "Your plan starts then, and the reminder you were promised is this one. Cancel anytime before if you've changed your mind.",
    );
    expect(trialNoticeBody({ kind: "trial" })).toBeNull();
    expect(trialNoticeBody({ kind: "grace" })).toBeNull();
  });

  it("carries no em dash in any variant, line or body", () => {
    for (const ending of [
      { kind: "trial" as const },
      { kind: "grace" as const },
      { kind: "courtesy" as const, noun: "month" as const },
    ]) {
      expect(trialNoticeLine(notice(), ending)).not.toContain("—");
      expect(trialNoticeBody(ending) ?? "").not.toContain("—");
    }
  });
});

describe("the push's three variants", () => {
  it("⚠️ never tells a grace user that billing starts", () => {
    const m = trialReminderMessage(trial(), SYD, { kind: "grace" })!;
    expect(m.title).toBe("Your free access ends soon");
    expect(m.body).not.toContain("billing");
    expect(m.body).not.toContain("trial");
    expect(m.body).not.toContain(`Day ${REMINDER_DAY}`);
  });

  it("⚠️ never calls a courtesy period a trial, and says the plan resumes", () => {
    const m = trialReminderMessage(trial(), SYD, { kind: "courtesy", noun: "month" })!;
    expect(m.body).toBe("Your free month ends 15 Aug. Your plan starts then.");
    expect(m.body).not.toContain("trial");
    // A two-year customer must never read a day count from a seven-day shape.
    expect(m.body).not.toContain(`Day ${REMINDER_DAY} of ${TRIAL_DAYS}`);
  });

  it("keeps the approved trial push unchanged, and defaults to it", () => {
    const m = trialReminderMessage(trial(), SYD)!;
    expect(m.title).toBe("Your free trial ends soon");
    expect(m.body).toContain(`Day ${REMINDER_DAY} of ${TRIAL_DAYS}`);
  });

  it("carries no em dash in any variant", () => {
    for (const ending of [
      { kind: "trial" as const },
      { kind: "grace" as const },
      { kind: "courtesy" as const, noun: "week" as const },
    ]) {
      const m = trialReminderMessage(trial(), SYD, ending)!;
      expect(m.title).not.toContain("—");
      expect(m.body).not.toContain("—");
    }
  });
});
