/**
 * WHETHER THIS BROWSER HAS CLOSED THE TRIAL NOTICE — a COOKIE, not
 * `localStorage`, and that choice is the whole point of this file.
 *
 * ## What `localStorage` cost, measured
 *
 * The first version used `localStorage` behind `useSyncExternalStore`, with a
 * server snapshot of `null` because the server cannot read a device. Both
 * docstrings claimed that made SSR and the first client render agree. A cold
 * review measured the opposite, because a null server snapshot means the server
 * renders the banner **every time**:
 *
 *     appeared: 414ms   removed: 614ms   FCP: 448ms
 *     -> a DISMISSED banner sat in the DOM for 200ms, painted for ~166ms
 *     -> content below it then jumped 806px -> 738px, a 68px reflow
 *
 * Every dashboard load, for the whole three-day window, a notice about being
 * charged flashed up and vanished and the page lurched under the user's thumb.
 * In the one part of the product that has to look trustworthy.
 *
 * ## A cookie is readable on the server, so there is nothing to correct
 *
 * The dashboard reads it in `cookies()` and simply does not render the banner.
 * No flash, no reflow, no hydration mismatch, and no external store at all.
 *
 * ## It is scoped to the ACCOUNT as well as the trial
 *
 * The value is `${userId}:${forDate}`. Keyed on the date alone, a cold review
 * signed two accounts into one browser and account A's dismissal hid account
 * B's billing notice. Narrow, but the thing being suppressed is the only in-app
 * warning that a card is about to be charged.
 */

const COOKIE = "trackd_trial_notice_dismissed";

/** How long the dismissal outlives the trial it belongs to. */
const MAX_AGE_DAYS = 30;

/** The value a dismissal stores. */
export function trialNoticeDismissalValue(userId: string, forDate: string): string {
  return `${userId}:${forDate}`;
}

/**
 * The dismissed DATE from a cookie, but only if it belongs to THIS account.
 *
 * Split out and given the user id because the obvious shortcut is wrong: a
 * suffix match on `:${date}` looks equivalent and matches on the date alone, so
 * a second account signed into the same browser is silenced by the first one's
 * dismissal. A cold review measured exactly that. The account has to be
 * compared, so the account has to be passed.
 */
export function dismissedTrialNoticeDate(
  cookieValue: string | null | undefined,
  userId: string,
): string | null {
  if (!cookieValue) return null;
  const separator = cookieValue.indexOf(":");
  if (separator === -1) return null;
  const owner = cookieValue.slice(0, separator);
  return owner === userId ? cookieValue.slice(separator + 1) : null;
}

/**
 * Close the notice for one trial, on one account.
 *
 * `SameSite=Lax` and no `Secure` on localhost, so it works on a LAN dev server
 * over plain HTTP as well as in production. It carries no personal data beyond
 * an id the browser already holds a session for.
 */
export function dismissTrialNotice(userId: string, forDate: string): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${COOKIE}=${encodeURIComponent(trialNoticeDismissalValue(userId, forDate))}` +
    `; path=/; max-age=${MAX_AGE_DAYS * 24 * 60 * 60}; SameSite=Lax${secure}`;
}
