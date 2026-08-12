import { describe, expect, it } from "vitest";

import {
  REMINDER_DAY,
  TRIAL_DAYS,
  TRIAL_REMINDER_LEAD_DAYS,
} from "@/lib/onboarding/pricing";
import { shiftDateKey } from "@/lib/notifications/reminders";
import {
  trialNoticeFor,
  trialNoticeLine,
  trialReminderDateKey,
  trialReminderMessage,
  trialReminderVerdict,
  type TrialForReminder,
} from "@/lib/notifications/trialReminder";

const SYD = "Australia/Sydney";
const LA = "America/Los_Angeles";

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
    expect(trialReminderVerdict(trial(), tz, REMIND_ON, null)).toEqual({
      send: true,
      forDate: REMIND_ON,
    });
  });

  it("says nothing before the promised day", () => {
    const v = trialReminderVerdict(trial(), tz, shiftDateKey(REMIND_ON, -1), null);
    expect(v).toEqual({ send: false, reason: "too-early" });
  });

  it("CATCHES UP if the cron missed the day", () => {
    // A deploy, an outage, a phone with no subscription registered that morning.
    // A late warning is worth a lot; a missed one is the thing the screen
    // promised would not happen. It still stamps the PROMISED day.
    const v = trialReminderVerdict(trial(), tz, shiftDateKey(REMIND_ON, 1), null);
    expect(v).toEqual({ send: true, forDate: REMIND_ON });
  });

  it("still sends on the trial's last local day", () => {
    expect(trialReminderVerdict(trial(), tz, LAST_DAY, null)).toEqual({
      send: true,
      forDate: REMIND_ON,
    });
  });

  it("stops once the trial is over", () => {
    // Past that instant the money has moved. "Your trial is ending" would be a
    // notification about the past.
    const v = trialReminderVerdict(trial(), tz, shiftDateKey(LAST_DAY, 1), null);
    expect(v).toEqual({ send: false, reason: "trial-over" });
  });

  it("sends once and only once", () => {
    const first = trialReminderVerdict(trial(), tz, REMIND_ON, null);
    expect(first.send).toBe(true);
    // The stamp is the reminder's own date, so the next tick sees its own work.
    const second = trialReminderVerdict(trial(), tz, REMIND_ON, REMIND_ON);
    expect(second).toEqual({ send: false, reason: "already-sent" });
    // And so does every tick for the rest of the trial.
    expect(trialReminderVerdict(trial(), tz, LAST_DAY, REMIND_ON)).toEqual({
      send: false,
      reason: "already-sent",
    });
  });

  it("a catch-up send suppresses itself the next day", () => {
    // The regression this shape exists to prevent: stamping "today" on a
    // catch-up would leave the promised day unstamped and fire again tomorrow.
    const late = shiftDateKey(REMIND_ON, 1);
    const v = trialReminderVerdict(trial(), tz, late, null);
    expect(v).toEqual({ send: true, forDate: REMIND_ON });
    expect(trialReminderVerdict(trial(), tz, late, REMIND_ON).send).toBe(false);
  });

  it("a NEW trial gets its own reminder despite an old stamp", () => {
    // A returning customer. The old stamp is a different date, so it cannot
    // suppress a genuinely new trial.
    const second = trial({ trialEndsAt: "2026-12-14T15:39:23.000Z" });
    const v = trialReminderVerdict(second, tz, "2026-12-13", REMIND_ON);
    expect(v).toEqual({ send: true, forDate: "2026-12-13" });
  });

  it("says nothing to somebody who has already cancelled", () => {
    // Nothing is about to change for them, and telling them billing starts
    // would send them rushing to cancel a thing they already cancelled.
    const v = trialReminderVerdict(trial({ cancelAtPeriodEnd: true }), tz, REMIND_ON, null);
    expect(v).toEqual({ send: false, reason: "already-cancelled" });
  });

  it("says nothing when there is no trial at all", () => {
    expect(trialReminderVerdict(null, tz, REMIND_ON, null)).toEqual({
      send: false,
      reason: "no-trial",
    });
  });

  it("says nothing once the subscription has converted", () => {
    const v = trialReminderVerdict(trial({ status: "active" }), tz, REMIND_ON, null);
    expect(v).toEqual({ send: false, reason: "status-active" });
  });

  it("says nothing when the trial has no end date", () => {
    const v = trialReminderVerdict(trial({ trialEndsAt: null }), tz, REMIND_ON, null);
    expect(v).toEqual({ send: false, reason: "no-trial-end" });
  });

  it("gives two users in different zones their own promised day", () => {
    // Same subscription, same instant. Neither is sent on the other's day.
    expect(trialReminderVerdict(trial(), SYD, "2026-08-13", null).send).toBe(true);
    expect(trialReminderVerdict(trial(), LA, "2026-08-13", null).send).toBe(true); // catch-up
    expect(trialReminderVerdict(trial(), LA, "2026-08-12", null)).toEqual({
      send: true,
      forDate: "2026-08-12",
    });
    expect(trialReminderVerdict(trial(), SYD, "2026-08-12", null)).toEqual({
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
    const notice = trialNoticeFor(trial(), tz, REMIND_ON, null);
    expect(notice?.forDate).toBe(REMIND_ON);
    expect(trialReminderVerdict(trial(), tz, REMIND_ON, null)).toEqual({
      send: true,
      forDate: REMIND_ON,
    });
  });

  it("is absent before the promised day", () => {
    expect(trialNoticeFor(trial(), tz, "2026-08-12", null)).toBeNull();
  });

  it("stays up for the whole final stretch, unlike the push", () => {
    // The push fires once. The banner is the standing statement of the fact.
    expect(trialNoticeFor(trial(), tz, "2026-08-13", null)?.daysLeft).toBe(2);
    expect(trialNoticeFor(trial(), tz, "2026-08-14", null)?.daysLeft).toBe(1);
    expect(trialNoticeFor(trial(), tz, LAST_DAY, null)?.daysLeft).toBe(0);
  });

  it("goes once the trial is over", () => {
    expect(trialNoticeFor(trial(), tz, "2026-08-16", null)).toBeNull();
  });

  it("says nothing to somebody who has already cancelled", () => {
    expect(
      trialNoticeFor(trial({ cancelAtPeriodEnd: true }), tz, REMIND_ON, null),
    ).toBeNull();
  });

  it("a dismissal is scoped to ONE trial", () => {
    expect(trialNoticeFor(trial(), tz, REMIND_ON, REMIND_ON)).toBeNull();
    // A returning customer's second trial has its own date, so it is announced
    // again rather than being silenced by a stamp from months ago.
    const second = trial({ trialEndsAt: "2026-12-14T15:39:23.000Z" });
    expect(trialNoticeFor(second, tz, "2026-12-13", REMIND_ON)?.forDate).toBe(
      "2026-12-13",
    );
  });

  it("gives two zones their own window", () => {
    expect(trialNoticeFor(trial(), LA, "2026-08-12", null)?.forDate).toBe("2026-08-12");
    expect(trialNoticeFor(trial(), SYD, "2026-08-12", null)).toBeNull();
  });
});

describe("trialNoticeLine", () => {
  const tz = SYD;

  it("states when the trial ends, and nothing else", () => {
    const line = trialNoticeLine(trialNoticeFor(trial(), tz, "2026-08-13", null)!);
    expect(line).toBe("Your free trial ends 15 Aug.");
  });

  it("reads naturally on the last two days", () => {
    expect(trialNoticeLine(trialNoticeFor(trial(), tz, "2026-08-14", null)!)).toBe(
      "Your free trial ends tomorrow.",
    );
    expect(trialNoticeLine(trialNoticeFor(trial(), tz, "2026-08-15", null)!)).toBe(
      "Your free trial ends today.",
    );
  });

  it("is ONE sentence, with no tail of any kind", () => {
    // Two drafts died here. "Everything you've logged stays." was reassurance
    // nobody asked for; "Billing starts then." was the app explaining its own
    // warning. A banner is a glance, and everything after the first full stop is
    // something the reader has to decide whether to care about.
    for (const day of ["2026-08-13", "2026-08-14", "2026-08-15"]) {
      const line = trialNoticeLine(trialNoticeFor(trial(), tz, day, null)!);
      expect(line).toMatch(/^Your free trial ends [^.]+\.$/);
      expect(line.toLowerCase()).not.toContain("cancel");
      expect(line.toLowerCase()).not.toContain("stays");
      expect(line.toLowerCase()).not.toContain("billing");
      expect(line).not.toContain("—");
    }
  });

  it("names the date in the user's own zone", () => {
    expect(trialNoticeLine(trialNoticeFor(trial(), LA, "2026-08-12", null)!)).toContain(
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
