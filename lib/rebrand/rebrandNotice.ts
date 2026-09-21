/**
 * WHO SEES THE REBRAND NOTICE, AND WHO MUST NEVER SEE IT.
 *
 * One announcement: the product was called Trackd Co and is now called Trakabl.
 * It is shown ONCE, to accounts that existed under the old name, and to nobody
 * else (Adrian, 2026-09-21).
 *
 * ## ⚠️ THE GATE IS THE POINT, NOT THE DECORATION
 *
 * A person who signs up tomorrow has never heard of Trackd. Telling them "the
 * name changed" announces a history they were never part of and makes a brand
 * new product feel like a renamed old one. So the notice is gated on the
 * ACCOUNT'S AGE, not merely on "have you dismissed it" — a fresh account has
 * dismissed nothing and would otherwise qualify on every check.
 *
 * ## The cookie machinery is REUSED, not rewritten
 *
 * `betaNoticeStore.ts` already solved this exact problem and paid for it twice:
 * a modal gated on `localStorage` flashed on every load (the server cannot read
 * a device), and a single-slot cookie let one account's dismissal destroy
 * another's on a shared browser (D90). Both fixes live in `markNoticeSeen` /
 * `betaNoticeSeen`, which are deliberately cookie-name-agnostic so a third
 * notice reuses them rather than growing a third copy of the same four
 * properties. This module supplies a name and a gate; it owns no storage logic.
 */
import { betaNoticeSeen, markNoticeSeen } from "@/lib/billing/betaNoticeStore";

/**
 * ⚠️ THIS COOKIE IS NEW, SO IT CARRIES THE NEW NAME — and its siblings
 * deliberately do NOT.
 *
 * `trackd_beta_notice_seen` and `trackd_grace_notice_seen` keep their spelling
 * forever: they are live on real browsers, and renaming a cookie does not
 * migrate it, it orphans it — every account holding one would be re-shown a
 * notice it had already dismissed. Nothing holds THIS one yet, so it starts on
 * the right side of the rename. The mixed prefixes across the three are the
 * correct outcome, not an oversight to tidy up later.
 */
export const REBRAND_NOTICE_COOKIE = "trakabl_rebrand_notice_seen";

/**
 * ⚠️ SET THIS TO THE ACTUAL DEPLOY TIMESTAMP BEFORE MERGING.
 *
 * Accounts created at or after this instant never see the notice. It is a
 * constant rather than a lookup because it is a fact about one deploy, and a
 * database round-trip to learn a date that will never change again is a cost
 * paid on every dashboard render forever.
 *
 * Getting it slightly EARLY is the safe direction: an account created in the
 * gap between this timestamp and the real deploy signed up under the old brand
 * and simply is not told the name changed, which costs them nothing they can
 * see. Getting it LATE is the bad direction — it announces a rename to people
 * who only ever knew the new name.
 */
export const RENAME_SHIPPED_AT = Date.parse("2026-09-22T00:00:00Z");

/**
 * Should this account be shown the rebrand notice?
 *
 * Pure, so the gate is testable without a browser, a cookie jar or a session.
 *
 * ⚠️ AN UNPARSEABLE OR MISSING `accountCreatedAt` RETURNS FALSE, and that is the
 * deliberate direction. Everywhere else in this codebase an unreadable marker
 * degrades to "show it", because a re-shown notice is harmless and a suppressed
 * one costs somebody their only warning. This one inverts: the failure here is
 * not a missed warning but a rename announced to a stranger, and there is no
 * warning in it to miss. Silence is the safe failure for an announcement that
 * only makes sense to people who were already here.
 */
export function shouldShowRebrandNotice(input: {
  seen: boolean;
  accountCreatedAt: string | null | undefined;
}): boolean {
  if (input.seen) return false;
  if (!input.accountCreatedAt) return false;
  const created = Date.parse(input.accountCreatedAt);
  if (Number.isNaN(created)) return false;
  return created < RENAME_SHIPPED_AT;
}

/** Has this account dismissed it in this browser? Reuses the shared reader. */
export function rebrandNoticeSeen(
  cookieValue: string | null | undefined,
  userId: string,
): boolean {
  return betaNoticeSeen(cookieValue, userId);
}

/** Mark it dismissed for this account, in this browser. Appends, never replaces. */
export function markRebrandNoticeSeen(userId: string): void {
  markNoticeSeen(REBRAND_NOTICE_COOKIE, userId);
}
