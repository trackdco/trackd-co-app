/**
 * WHETHER THIS BROWSER HAS SEEN THE BETA NOTICE — a COOKIE, for the reason
 * `trialNoticeStore.ts` documents at length and paid for once already.
 *
 * ## Why not `localStorage`
 *
 * A cold review measured what `localStorage` cost the trial banner: the server
 * cannot read a device, so its snapshot was null, so the server rendered the
 * notice EVERY time and the client removed it after hydration. Measured at a
 * ~166ms paint of an already-dismissed billing notice and a 68px page jump, on
 * every dashboard load, for the whole window.
 *
 * This notice is a MODAL. The same mistake here would flash a dialog about
 * somebody's billing across the screen on every single load and then snatch it
 * away, which is worse than the banner's version by a distance.
 *
 * A cookie is readable in `cookies()` before the page is built, so a notice
 * already seen is never sent to the browser at all. Nothing to correct, no
 * flash, no hydration mismatch.
 *
 * ## Scoped to the ACCOUNT
 *
 * The value is the user id. Keyed on nothing, a shared browser would have shown
 * one person's notice being dismissed by another's — the exact defect the trial
 * banner's first fix failed to close (matching by date suffix looked equivalent
 * and matched any account with the same date).
 *
 * ## Once ever, not once per trial
 *
 * The trial notice's cookie carries a `forDate` so a returning customer's SECOND
 * trial is announced again. This one deliberately does not: there is only one
 * moment when Trackd starts charging, it happens once, and re-announcing it
 * would be an interruption with nothing new to say.
 */

const COOKIE = "trackd_beta_notice_seen";

/**
 * A year. Comfortably longer than the grace period plus any plausible delay in
 * somebody getting round to opening the app, and short enough that it is not a
 * permanent record of anything.
 */
const MAX_AGE_DAYS = 365;

/** Has THIS account seen it in THIS browser? */
export function betaNoticeSeen(
  cookieValue: string | null | undefined,
  userId: string,
): boolean {
  return Boolean(cookieValue) && cookieValue === userId;
}

/** Mark it seen. Called when the notice is closed, however it is closed. */
export function markBetaNoticeSeen(userId: string): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${COOKIE}=${encodeURIComponent(userId)}` +
    `; path=/; max-age=${MAX_AGE_DAYS * 24 * 60 * 60}; SameSite=Lax${secure}`;
}

/** The cookie's name, so the server reader and the writer cannot drift. */
export const BETA_NOTICE_COOKIE = COOKIE;
