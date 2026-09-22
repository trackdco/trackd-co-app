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

/**
 * ⚠️ THE SENTINEL ID THE PREVIEW HARNESS MOUNTS THE NOTICE WITH, AND THE REASON
 * IT HAS TO BE CHECKED RATHER THAN MERELY LOOKED AT.
 *
 * `/preview/rebrand` renders the REAL component so a copy change cannot land in
 * one place and not the other. Dismissing it there does two things, and only
 * one of them respects the fake id it was handed:
 *
 *   · `markRebrandNoticeSeen(userId)` writes the sentinel into a cookie. Honest
 *     — no real account's notice is consumed.
 *   · `recordDocumentAcceptance()` takes NO ARGUMENTS. It resolves the account
 *     from the session, so a signed-in reviewer tapping OK to check the button
 *     upserts real `consent_records` rows for `tos` and `privacy`, at the live
 *     versions, against their own account — attributed to a click on a harness.
 *
 * That is the exact artefact `legal-acceptance.ts` exists to prevent:
 * "recording an acceptance the user was never told they were giving". And it is
 * a REPEAT — commit 768b967 ("The preview harness was writing its fixture into
 * the signed-in account") is the same bug class, and cost three rows in a
 * founder's production protocol.
 *
 * ⚠️ The guard lives HERE, beside the notice, rather than in the preview page,
 * because the page cannot enforce it: the write happens inside the component.
 * A future preview surface that mounts this notice gets the protection for
 * free, which is the half 768b967's fix could not cover — `sessionClaim.ts`
 * checks a user id, and `recordDocumentAcceptance` has none to check.
 */
export const PREVIEW_USER_ID = "preview-not-a-real-account";

/**
 * Should dismissing the notice write a legal acceptance row?
 *
 * False only for the preview sentinel. Everything else — including an empty or
 * malformed id — returns true, because the failure direction that matters is
 * the opposite one: silently NOT recording a real user's acceptance would make
 * Terms §25's "we record which version you accepted" false, and the write is
 * already idempotent and already fails quietly.
 */
export function shouldRecordAcceptance(userId: string): boolean {
  return userId !== PREVIEW_USER_ID;
}
