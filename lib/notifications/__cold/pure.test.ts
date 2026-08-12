import { it } from "vitest";
import { dayNumber, shiftDateKey, localParts } from "@/lib/notifications/reminders";
import {
  trialReminderDateKey,
  trialReminderVerdict,
  trialNoticeFor,
  trialNoticeLine,
  trialReminderMessage,
} from "@/lib/notifications/trialReminder";
import { TRIAL_DAYS, REMINDER_DAY, TRIAL_REMINDER_LEAD_DAYS } from "@/lib/onboarding/pricing";

const T = (endsAt: string | null, over: Partial<{status:string;cancelAtPeriodEnd:boolean}> = {}) => ({
  status: "trialing", trialEndsAt: endsAt, cancelAtPeriodEnd: false, ...over,
});

it("A: shiftDateKey / dayNumber edge cases", () => {
  const cases: [string, number][] = [
    ["2026-03-01", -2], ["2024-03-01", -1], ["2024-02-29", 1], ["2027-01-01", -1],
    ["2026-01-01", -2], ["2100-03-01", -1], ["1970-01-01", -2], ["0099-03-01", -2],
    ["2026-12-31", 1], ["2026-08-15", -2],
  ];
  for (const [k, d] of cases) console.log(`shiftDateKey(${k}, ${d}) = ${shiftDateKey(k, d)}  dayNumber=${dayNumber(k)}`);
  console.log("dayNumber('99-03-01') =", dayNumber("99-03-01"), "-> shift", shiftDateKey("99-03-01", -2));
  console.log("shiftDateKey('275760-09-12', 1) =", (() => { try { return shiftDateKey("275760-09-12", 1); } catch (e) { return `THREW ${(e as Error).message}`; } })());
  console.log("shiftDateKey garbage:", (() => { try { return shiftDateKey("not-a-date", -2); } catch (e) { return `THREW ${(e as Error).message}`; } })());
});

it("B: the constants", () => {
  console.log({ TRIAL_DAYS, REMINDER_DAY, TRIAL_REMINDER_LEAD_DAYS });
});

it("C: extreme timezones, one trial instant", () => {
  const END = "2026-08-14T15:39:23.000Z";
  for (const tz of ["Pacific/Kiritimati","Pacific/Niue","Asia/Kathmandu","Australia/Lord_Howe","Australia/Sydney","America/Los_Angeles","UTC","Pacific/Chatham","Asia/Tokyo"]) {
    const endLocal = localParts(new Date(Date.parse(END)), tz);
    const rk = trialReminderDateKey(T(END), tz);
    const msg = trialReminderMessage(T(END), tz);
    console.log(`${tz.padEnd(22)} endLocal=${endLocal.dateKey} @${endLocal.minutes}min  reminderDay=${rk}  push="${msg?.body}"`);
  }
});

it("D: short trials — 1-day and 2-day", () => {
  const tz = "Australia/Sydney";
  for (const [label, end] of [["1-day","2026-08-13T02:00:00.000Z"],["2-day","2026-08-14T02:00:00.000Z"],["3-day","2026-08-15T02:00:00.000Z"]] as const) {
    const rk = trialReminderDateKey(T(end), tz);
    const endLocal = localParts(new Date(Date.parse(end)), tz).dateKey;
    const v = trialReminderVerdict(T(end), tz, "2026-08-12", null);
    console.log(`${label}: end=${end} endLocal=${endLocal} reminderDay=${rk} verdictOn 2026-08-12 = ${JSON.stringify(v)}`);
  }
});

it("E: trial_ends_at in the past / garbage / null", () => {
  const tz = "Australia/Sydney";
  for (const end of [null, "", "garbage", "2020-01-01T00:00:00Z", "2026-08-14T15:39:23+10:00"]) {
    console.log(`end=${JSON.stringify(end)} key=${JSON.stringify(trialReminderDateKey(T(end as string), tz))} verdict=${JSON.stringify(trialReminderVerdict(T(end as string), tz, "2026-08-13", null))}`);
  }
});

it("F: banner vs push — do they ever disagree about the date?", () => {
  const tz = "Pacific/Kiritimati";
  const END = "2026-08-14T15:39:23.000Z";
  console.log("push:", trialReminderMessage(T(END), tz)?.body);
  for (const today of ["2026-08-13","2026-08-14","2026-08-15","2026-08-16","2026-08-17"]) {
    const n = trialNoticeFor(T(END), tz, today, null);
    console.log(` today=${today} banner=${n ? trialNoticeLine(n) : "(none)"}  daysLeft=${n?.daysLeft} forDate=${n?.forDate}`);
  }
});

it("G: DST spans", () => {
  const rows: [string,string][] = [
    ["America/New_York", "2026-11-02T14:00:00.000Z"],
    ["America/New_York", "2027-03-15T13:00:00.000Z"],
    ["Europe/London",    "2026-10-26T00:30:00.000Z"],
    ["Australia/Sydney", "2026-10-05T13:30:00.000Z"],
    ["Australia/Lord_Howe","2026-10-04T15:30:00.000Z"],
  ];
  for (const [tz, end] of rows) {
    const endLocal = localParts(new Date(Date.parse(end)), tz).dateKey;
    console.log(`${tz} end=${end} endLocal=${endLocal} reminder=${trialReminderDateKey(T(end), tz)}`);
  }
});

it("H: verdict when trial already over / status variants", () => {
  const tz = "Australia/Sydney"; const END = "2026-08-14T15:39:23.000Z";
  for (const today of ["2026-08-12","2026-08-13","2026-08-14","2026-08-15","2026-08-16"]) {
    console.log(today, JSON.stringify(trialReminderVerdict(T(END), tz, today, null)));
  }
  for (const st of ["active","past_due","canceled","incomplete","paused","unpaid"]) {
    console.log(st, JSON.stringify(trialReminderVerdict(T(END, {status: st}), tz, "2026-08-13", null)));
  }
});
