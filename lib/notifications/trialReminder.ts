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
  now: Date,
  sentFor: string | null,
): TrialReminderVerdict {
  if (!trial) return { send: false, reason: "no-trial" };
  if (trial.status !== "trialing") return { send: false, reason: `status-${trial.status}` };
  if (trial.cancelAtPeriodEnd) return { send: false, reason: "already-cancelled" };

  const forDate = trialReminderDateKey(trial, tz);
  if (!forDate) return { send: false, reason: "no-trial-end" };
  if (sentFor === forDate) return { send: false, reason: "already-sent" };

  /**
   * ⚠️ THE TRIAL IS OVER AT AN INSTANT, NOT AT THE END OF A CALENDAR DAY.
   *
   * This compared DAY NUMBERS, and a cold review measured what that costs: a
   * trial ending 01:39 local on the 15th, with a 09:00 reminder time, sent a
   * real push at 09:00 on the 15th — **seven hours and twenty-one minutes after
   * the card had been charged** — saying "your trial ends today, and billing
   * starts then". Every trial the app creates ends at the small hours of its
   * final local day, because the trial is seven times twenty-four hours from a
   * signup that could be any time, so this was not an edge case. It was most of
   * them, reachable through the deliberate catch-up path.
   *
   * The comparison is now against the instant Stripe will actually bill on.
   * A reminder about a charge that has already happened is worse than no
   * reminder: it tells somebody they still have time to decide when they do not.
   */
  const endsAt = Date.parse(trial.trialEndsAt!);
  if (now.getTime() >= endsAt) return { send: false, reason: "trial-over" };

  const today = dayNumber(localParts(now, tz).dateKey);
  if (today < dayNumber(forDate)) return { send: false, reason: "too-early" };

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
/**
 * WHICH OF THE THREE ENDINGS THIS IS (`07` §3.4).
 *
 * Every ending reaches the sender in the same shape — a status, an end date, no
 * pending cancellation — which costs the date arithmetic nothing and is a good
 * decision. **The copy is where it stops being one**, because the three endings
 * are different facts:
 *
 *   trial     a first free week, and billing starts when it ends
 *   grace     the beta fortnight; nothing is charged, writing stops
 *   courtesy  a save-offer free period on a subscription that HAS been paid for,
 *             and the plan resumes when it ends
 *
 * Telling a two-year customer on a courtesy month "Day 5 of 7. Your trial ends on
 * {date}" is false about the day, the length and the trial, and it is sent to
 * somebody about to be charged.
 */
export type EndingKind = "trial" | "grace" | "courtesy";

export interface Ending {
  kind: EndingKind;
  /** The granted period's noun. `courtesy` only; see {@link resolveEnding}. */
  noun?: "week" | "month";
}

/**
 * Decide the ending, with the fallback that cannot lie.
 *
 * ## ⚠️ THE FALLBACK IS NEUTRAL, NEVER THE TRIAL VARIANT (`07` §3.4)
 *
 * "Where a courtesy period cannot be distinguished, fall back to the grace
 * variant's neutral wording, never to the trial variant. The neutral wording is
 * true of all three endings; the trial wording is false of two. **A fallback that
 * degrades to a lie is not a fallback.**"
 *
 * ## The three states of `courtesyUntil`, and why `undefined` is not `null`
 *
 * They are different facts and collapsing them is the bug this signature exists
 * to prevent:
 *
 *   `undefined`  the column could NOT be read. `supabase/billing/003` may be
 *                unapplied, in which case PostgREST answers `42703` on the read.
 *                We do not know what this ending is -> NEUTRAL.
 *   `null`       read successfully, no courtesy period -> it is a real trial.
 *   a date       read successfully, a courtesy period is running -> courtesy.
 *
 * ## And an unknown NOUN also falls back to neutral
 *
 * `07` §3.4 signs "free week" or "free month" and nothing else, so a courtesy
 * variant with no noun cannot be rendered as approved copy. Guessing between them
 * would be a coin flip printed in a billing notice. Neutral is true either way.
 */
export function resolveEnding(input: {
  isBetaGrace: boolean;
  /** `undefined` = unreadable, `null` = read and absent. Not interchangeable. */
  courtesyUntil: string | null | undefined;
  noun: "week" | "month" | null;
}): Ending {
  if (input.isBetaGrace) return { kind: "grace" };
  // Unreadable column: cannot tell a courtesy period from a trial, so say the
  // thing that is true of both.
  if (input.courtesyUntil === undefined) return { kind: "grace" };
  if (input.courtesyUntil === null) return { kind: "trial" };
  if (Number.isNaN(Date.parse(input.courtesyUntil))) return { kind: "grace" };
  if (!input.noun) return { kind: "grace" };
  return { kind: "courtesy", noun: input.noun };
}

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
  now: Date,
  dismissedFor: string | null,
): TrialNotice | null {
  if (!trial || trial.status !== "trialing" || trial.cancelAtPeriodEnd) return null;

  const forDate = trialReminderDateKey(trial, tz);
  // `dismissedFor` is a plain date key. The caller has ALREADY checked that the
  // dismissal belongs to this account — see `dismissedTrialNoticeDate`. Matching
  // a `${userId}:${date}` cookie by its suffix here looked equivalent and was
  // not: it matches on the date alone, so a cold review's second account was
  // silenced by the first one's dismissal. The account check needs the account,
  // and this module deliberately does not know about accounts.
  if (!forDate || dismissedFor === forDate) return null;

  // Gone the moment the charge lands, not at the end of that calendar day. See
  // the same check in `trialReminderVerdict` — the banner said "Your free trial
  // ends today" for the whole of a day on which the money had already moved.
  const endsAt = Date.parse(trial.trialEndsAt!);
  if (now.getTime() >= endsAt) return null;

  const endDateKey = localParts(new Date(endsAt), tz).dateKey;
  const today = dayNumber(localParts(now, tz).dateKey);
  if (today < dayNumber(forDate)) return null; // not yet the promised day

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
export function trialNoticeLine(notice: TrialNotice, ending: Ending = { kind: "trial" }): string {
  const when =
    notice.daysLeft === 0
      ? "today"
      : notice.daysLeft === 1
        ? "tomorrow"
        : formatDateKey(notice.endDateKey);

  /**
   * ⚠️ THE BANNER HAD ONE VARIANT WHILE THE PUSH HAD TWO, AND THAT WAS A DEFECT.
   *
   * `trialNoticeFor` is fed `graceAsTrial(...)` by the dashboard, so a beta-grace
   * account reached this line and read **"Your free trial ends 28 Aug."** They
   * were never on a trial, have no card on file, and nothing is charged. It is
   * the identical falsehood `trialReminderMessage`'s grace variant was built to
   * stop, on the surface `07` §3.6 says reaches EVERYBODY who opens the app,
   * while the push it was supposed to agree with had already been corrected.
   *
   * Latent rather than live: the dashboard only builds `graceTrial` when
   * `billingGateEnabled()` is true, and the gate is off until launch morning. So
   * it would have appeared for ~90 real accounts on the morning it was flipped.
   */
  if (ending.kind === "grace") return `Your free access ends ${when}.`;

  /**
   * D33, signed and carried verbatim. The noun follows the granted period and is
   * never "trial". Re-signed after an em-dash catch: the full stop is deliberate
   * and "anytime" is one word.
   *
   * `on {date}` rather than the bare `{when}` the other two use, because the
   * signed line reads "ends on {date}" and signed copy is not reworded to match a
   * neighbouring string's shape.
   */
  if (ending.kind === "courtesy") {
    return `Your free ${ending.noun} ends on ${formatDateKey(notice.endDateKey)}.`;
  }

  return `Your free trial ends ${when}.`;
}

/**
 * The courtesy banner's SECOND line, which no other variant has.
 *
 * D33 signs a body beneath the courtesy banner: it names this message as the
 * promised reminder, which closes the loop with the offer's terms line in the
 * user's own reading, and that is the line's best move.
 *
 * `null` for the other two: the trial and grace banners are deliberately one bare
 * sentence, twice cut back by Adrian on the grounds that "everything after the
 * first full stop is something the reader has to decide whether to care about".
 */
export function trialNoticeBody(ending: Ending): string | null {
  if (ending.kind !== "courtesy") return null;
  return "Your plan starts then, and the reminder you were promised is this one. Cancel anytime before if you've changed your mind.";
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
  /**
   * ⚠️ IS THIS THE BETA GRACE RATHER THAN A REAL TRIAL?
   *
   * The two need different words, and a cold review found out how differently.
   * The grace is described to this module as a trial (`graceAsTrial`), which
   * costs the DATE maths nothing — but it made the copy say, to the ~90 accounts
   * that were here before billing:
   *
   *     "Day 5 of 7. Your trial ends on 28 Aug, and BILLING STARTS THEN."
   *
   * They are on day 12 of 14, they were never on a trial, they have no card on
   * file, and nothing will be charged. It also directly contradicts the notice
   * they were shown a fortnight earlier, which says "you just won't be able to
   * log anything new".
   *
   * Telling somebody money is about to move when it is not is the same class of
   * failure as not telling them when it is. Both end in a support ticket, and
   * this one ends in a support ticket from a person who has done nothing wrong.
   */
  ending: Ending = { kind: "trial" },
): PushMessage | null {
  if (!trial.trialEndsAt) return null;
  const endsAt = new Date(Date.parse(trial.trialEndsAt));
  if (Number.isNaN(endsAt.getTime())) return null;
  const isBetaGrace = ending.kind === "grace";

  // Formatted in the USER's zone, so the date in the body is the date on their
  // own calendar rather than the server's.
  const when = new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    day: "numeric",
    month: "short",
  }).format(endsAt);

  /**
   * D33's courtesy push. The BODY is signed verbatim in `07` §3.4.
   *
   * ⚠️ THE TITLE IS NOT IN THE SPEC, AND IS NOT INVENTED HERE.
   *
   * §3.4 signs a title for the trial ("Your trial ends soon") and for the grace
   * ("Your free access ends soon") but gives the courtesy variant only its body.
   * Rather than write one, this REUSES the grace title, which is already approved
   * and is true of this cohort: their free access does end soon. It is the same
   * move `02b` §3.2 made when it reused an approved button label rather than
   * inventing a second one.
   *
   * **Flagged for sign-off.** If the founder wants its own title, this is the one
   * line that changes.
   */
  if (ending.kind === "courtesy") {
    return {
      title: "Your free access ends soon",
      body: `Your free ${ending.noun} ends ${when}. Your plan starts then.`,
      url: "/profile",
      tag: "trackd-trial-ending",
    };
  }

  if (isBetaGrace) {
    return {
      title: "Your free access ends soon",
      /**
       * No day count: "day 5 of 7" is the trial's shape and the grace is
       * fourteen days. No "billing starts then", because it does not. What
       * happens instead is stated plainly, in the same words the notice and the
       * pop-up use, so the three surfaces agree.
       */
      body: `Trackd stays free until ${when}. After that you can still read everything, but not log anything new.`,
      url: "/profile",
      tag: "trackd-trial-ending",
    };
  }

  return {
    title: "Your free trial ends soon",
    body: `Day ${REMINDER_DAY} of ${TRIAL_DAYS}. Your trial ends on ${when}, and billing starts then.`,
    // Profile is where the Billing row states the plan. It is the closest thing
    // to a destination that exists today.
    url: "/profile",
    tag: "trackd-trial-ending",
  };
}
