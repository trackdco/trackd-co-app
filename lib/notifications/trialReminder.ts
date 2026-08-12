/**
 * THE TRIAL REMINDER — the decision half. Pure, no I/O, no React.
 *
 * ## What this is keeping
 *
 * Two screens promise a reminder out loud, and until this existed nothing sent
 * one:
 *
 *   - the paywall timeline: "Day 5 · Reminder — We'll notify you that your
 *     trial is ending, before anything changes"
 *   - the checkout disclosure: "We'll remind you on day 5"
 *
 * ## THE TRAP: STRIPE FIRES ON DAY 4, THE SCREEN SAYS DAY 5
 *
 * `customer.subscription.trial_will_end` fires THREE days before the trial ends,
 * which on a 7-day trial is day 4. The screens promise day {@link REMINDER_DAY},
 * which is day 5. Sending on the webhook would be a day early, every time, and
 * at whatever hour of the user's night Stripe happened to fire.
 *
 * So the webhook is treated as a SIGNAL, not a schedule. It refreshes
 * `subscriptions.trial_ends_at` (see `app/api/stripe/webhook/route.ts`) and this
 * module decides the day, off that stored end date, in the user's own timezone,
 * fired by the existing reminder cron so it also lands after their reminder time
 * and outside their quiet hours.
 *
 * ## Why it reads the MIRROR, which nothing is supposed to gate on
 *
 * `subscriptions` is documented as a mirror of Stripe that no access check may
 * read, and this does read it. That rule is intact: this grants nothing and
 * gates nothing. It is exactly the use the mirror was built for — "so the app
 * can say 'renews on the 14th' without a network call" — and the alternative,
 * asking Stripe for every opted-in user every fifteen minutes, would be both
 * slower and no more true.
 */
import {
  REMINDER_DAY,
  TRIAL_DAYS,
  TRIAL_REMINDER_LEAD_DAYS,
} from "@/lib/onboarding/pricing";

import { dayNumber, localParts, shiftDateKey, type PushMessage } from "./reminders";

/**
 * The trialing subscription, as much of it as the decision needs.
 *
 * Shaped from `subscriptions` rather than from a Stripe object on purpose: this
 * runs in a cron over every opted-in user and must not make a network call to
 * decide that there is nothing to say.
 */
export interface TrialForReminder {
  /** The mirror's status. Only `trialing` can produce a reminder. */
  status: string;
  /** ISO instant, from `subscriptions.trial_ends_at`. */
  trialEndsAt: string | null;
  /** True when the user has already told Stripe not to charge them. */
  cancelAtPeriodEnd: boolean;
}

/**
 * The user-local calendar day the reminder is promised for, or null if there is
 * no trial to remind about.
 *
 * The end INSTANT is resolved into the user's own calendar day first and the
 * shift happens on that day. Doing it the other way round (subtract 48 hours,
 * then localise) is wrong across a DST boundary, and wrong by a whole day for
 * anyone whose trial ends near their local midnight — a trial ending
 * 15:39 UTC is the 15th in Sydney and the 14th in Los Angeles, and those two
 * users are promised different calendar days by the same subscription.
 */
export function trialReminderDateKey(
  trial: TrialForReminder,
  tz: string,
): string | null {
  if (trial.status !== "trialing") return null;
  if (!trial.trialEndsAt) return null;
  const endsAt = Date.parse(trial.trialEndsAt);
  if (Number.isNaN(endsAt)) return null;
  const endDateKey = localParts(new Date(endsAt), tz).dateKey;
  return shiftDateKey(endDateKey, -TRIAL_REMINDER_LEAD_DAYS);
}

/** Why a reminder is or is not going out. Returned rather than a bare boolean so
 *  the runner can log the reason, which is the only way to tell "nothing to send"
 *  apart from "something is broken" from outside. */
export type TrialReminderVerdict =
  | { send: true; forDate: string }
  | { send: false; reason: string };

/**
 * Should the trial reminder go out to this user today?
 *
 * ### It fires ON or AFTER the promised day, never after the charge
 *
 * The obvious rule is `today === reminderDate` and it silently breaks the
 * promise: the cron is not guaranteed to run (a deploy, an outage, a Vercel
 * incident, a user whose phone had no subscription registered that morning), and
 * an exact-match rule turns any one of those into no warning at all before a
 * charge. A late warning is worth a great deal; a missed one is the thing the
 * screen promised would not happen.
 *
 * It stops at the trial END, not after it. Past that instant the money has
 * moved, and "your trial is ending" would be a notification about the past.
 *
 * ### An already-cancelled trial gets nothing
 *
 * The promise on screen is "we'll notify you that your trial is ending, BEFORE
 * ANYTHING CHANGES". For someone who has already cancelled, nothing is about to
 * change: they will not be charged. Telling them their trial is ending and
 * billing is about to start would be false, and false in the direction that
 * makes somebody rush to cancel a thing they already cancelled.
 *
 * ### Once per trial, by identity rather than by "today"
 *
 * `sentFor` holds the reminder DATE a send was already made for, not the day it
 * was sent. That is what makes the catch-up above safe: a send on day 6 for a
 * day-5 reminder stamps `day 5`, so the next tick sees its own work and stops.
 * It also means a genuinely new trial (a returning customer) has a different
 * reminder date and correctly gets its own reminder.
 */
export function trialReminderVerdict(
  trial: TrialForReminder | null,
  tz: string,
  todayKey: string,
  sentFor: string | null,
): TrialReminderVerdict {
  if (!trial) return { send: false, reason: "no-trial" };
  if (trial.status !== "trialing") return { send: false, reason: `status-${trial.status}` };
  if (trial.cancelAtPeriodEnd) return { send: false, reason: "already-cancelled" };

  const forDate = trialReminderDateKey(trial, tz);
  if (!forDate) return { send: false, reason: "no-trial-end" };
  if (sentFor === forDate) return { send: false, reason: "already-sent" };

  const today = dayNumber(todayKey);
  if (today < dayNumber(forDate)) return { send: false, reason: "too-early" };

  // The last day it can still be true. `trial_ends_at` is an instant, so the
  // user's local day it lands on is the last day the trial is running at all.
  const endDateKey = localParts(new Date(Date.parse(trial.trialEndsAt!)), tz).dateKey;
  if (today > dayNumber(endDateKey)) return { send: false, reason: "trial-over" };

  return { send: true, forDate };
}

/**
 * THE SAME PROMISE, ON THE SCREEN INSTEAD OF IN A PUSH.
 *
 * A push only reaches somebody who granted notification permission, and today
 * that is 17 of 106 accounts. Everybody else would be told nothing at all before
 * a charge, which is the promise broken for the majority of users. So the final
 * stretch of a trial is also stated in the app.
 *
 * It lives in this file rather than in `lib/billing/` on purpose: the day it
 * starts is `trialReminderDateKey`, the identical calculation the push uses. Two
 * surfaces promising the same date must not be able to compute it differently,
 * and a second copy of the timezone maths is exactly how the push pipeline fell
 * out of step with the client once already.
 *
 * ## Shown to EVERYONE, not only to users who cannot be pushed
 *
 * The narrower rule looks tidier and is worse. "Can be pushed" is not "was
 * pushed": a permission granted months ago on a phone that has since been wiped
 * still reads as reachable until its endpoint 410s, and a push that was swiped
 * away at 9am is gone. The banner is passive, sits in the scroll flow, and
 * dismisses; the cost of somebody seeing the fact twice is far lower than the
 * cost of somebody being charged having seen it nowhere.
 *
 * ## It states two facts and stops
 *
 * The wording is the conversion lever, not the silence: a notice that leads with
 * the exit invites the exit. But the answer to that is NOT reassurance. A first
 * draft read "Your free trial ends 15 Aug. Everything you've logged stays." and
 * Adrian cut the second sentence on sight (2026-08-12) — it is filler, it
 * answers a question nobody asked, and softening a billing notice is how a
 * billing notice stops being believed.
 *
 * So: when it ends, and what happens then. The same two facts the push carries,
 * in the same order, so the two surfaces cannot read as different messages. The
 * word "cancel" appears on neither; the control is one tap away on `/billing`,
 * deliberately reachable and deliberately not the thing being offered here.
 */
export interface TrialNotice {
  /** The trial's last local day, `YYYY-MM-DD`. */
  endDateKey: string;
  /** Whole local days from today until then. 0 means it ends today. */
  daysLeft: number;
  /** The reminder day this notice belongs to, and its dismissal identity. */
  forDate: string;
}

/**
 * Is the trial in its final stretch for this user today?
 *
 * The window opens on the same promised day as the push and closes when the
 * trial does. `dismissedFor` carries the `forDate` of a notice the user has
 * already closed, so a dismissal is scoped to ONE trial rather than being a
 * permanent preference — a returning customer's second trial has a different
 * `forDate` and is announced again.
 *
 * An already-cancelled trial gets nothing, for the same reason the push does
 * not: nothing is about to change for them.
 */
export function trialNoticeFor(
  trial: TrialForReminder | null,
  tz: string,
  todayKey: string,
  dismissedFor: string | null,
): TrialNotice | null {
  if (!trial || trial.status !== "trialing" || trial.cancelAtPeriodEnd) return null;

  const forDate = trialReminderDateKey(trial, tz);
  if (!forDate || dismissedFor === forDate) return null;

  const endDateKey = localParts(new Date(Date.parse(trial.trialEndsAt!)), tz).dateKey;
  const today = dayNumber(todayKey);
  if (today < dayNumber(forDate)) return null; // not yet the promised day
  if (today > dayNumber(endDateKey)) return null; // the trial is over

  return { endDateKey, daysLeft: dayNumber(endDateKey) - today, forDate };
}

/**
 * The banner's one line. ONE SENTENCE, and that is the whole of it.
 *
 * It said "Your free trial ends 15 Aug. Billing starts then." and Adrian cut the
 * second sentence too (2026-08-12): "just your free trial ends whenever it ends.
 * A warning." He is right, and for the same reason he was right about the draft
 * before it — a banner is a glance, and everything after the first full stop is
 * something the reader has to decide whether to care about. The trial ending IS
 * the warning; spelling out the consequence is the app explaining its own joke.
 *
 * `/billing` is one tap away and states the money in full.
 *
 * The date is formatted from the already-local `endDateKey`, so no timezone is
 * needed here and none can be applied twice.
 */
export function trialNoticeLine(notice: TrialNotice): string {
  const when =
    notice.daysLeft === 0
      ? "today"
      : notice.daysLeft === 1
        ? "tomorrow"
        : formatDateKey(notice.endDateKey);
  return `Your free trial ends ${when}.`;
}

/** "2026-08-15" -> "15 Aug". Date-only in, date-only out: no zone involved. */
function formatDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * The push itself.
 *
 * ## It is NOT cut down to match the banner, and that is deliberate
 *
 * The banner is one bare sentence. This keeps "Day {@link REMINDER_DAY} of
 * {@link TRIAL_DAYS}" and the consequence, on Adrian's call (2026-08-12): "I
 * like the day count, so leave the day count."
 *
 * The two surfaces do different jobs. A push fires ONCE, arrives on a lock
 * screen with nothing around it, and has room to carry its own context. The
 * banner is persistent, sits inside a screen that explains itself, and earns its
 * brevity by being glanced at daily. Making them identical would cost the push
 * the only context it ever gets.
 *
 * ## What it still does not say
 *
 * No PRICE. The runner holds the subscription mirror, not the plan's amount and
 * currency, and a figure invented here could contradict the one the user
 * actually agreed to at checkout.
 *
 * No "cancel" either, though `/billing` can now do it (2026-08-12). Tapping the
 * push lands on Profile, a step from Billing; the notification's job is to make
 * sure the date is not a surprise, not to walk somebody towards the exit.
 *
 * No em dashes, per the house rule.
 */
export function trialReminderMessage(
  trial: TrialForReminder,
  tz: string,
): PushMessage | null {
  if (!trial.trialEndsAt) return null;
  const endsAt = new Date(Date.parse(trial.trialEndsAt));
  if (Number.isNaN(endsAt.getTime())) return null;

  // Formatted in the USER's zone, so the date in the body is the date on their
  // own calendar rather than the server's.
  const when = new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    day: "numeric",
    month: "short",
  }).format(endsAt);

  return {
    title: "Your free trial ends soon",
    body: `Day ${REMINDER_DAY} of ${TRIAL_DAYS}. Your trial ends on ${when}, and billing starts then.`,
    // Profile is where the Billing row states the plan. It is the closest thing
    // to a destination that exists today.
    url: "/profile",
    tag: "trackd-trial-ending",
  };
}
