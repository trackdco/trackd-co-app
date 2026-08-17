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
 *
 * ## ⚠️ D90 — IT HOLDS EVERY ACCOUNT THAT HAS DISMISSED IT, NOT THE LAST ONE
 *
 * This was one slot holding one id, and a drive on 2026-08-17 found what that
 * cost on a shared browser: A dismisses (value = A), B signs in and dismisses
 * (value = B), and **A's notice comes back** — its own notice, its own date,
 * because A's record had been overwritten.
 *
 * D30 decided the marker is a per-browser cookie rather than a database row. It
 * did NOT decide that one person's dismissal consumes another's notice, and D90
 * (Adrian, 2026-08-17) closes that: "two mechanisms doing the same job should not
 * disagree."
 *
 * ⚠️ **Rejecting a mismatch on read was never the missing half.** {@link
 * betaNoticeSeen} already did exactly that, which is why B never inherited A's
 * dismissal — the leak direction was closed from the start. The half that was
 * missing is that a WRITE destroyed the other account's answer. So the value is a
 * SET of ids, and dismissing appends rather than replaces.
 *
 * `~` separates them: it is a legal cookie-octet (RFC 6265), `encodeURIComponent`
 * leaves it alone, and no UUID contains one. Deliberately not `:`, which
 * `trialNoticeStore` uses to separate FIELDS within one value — two different
 * jobs should not share a delimiter.
 */

const COOKIE = "trackd_beta_notice_seen";

/** Separator between ids. See the note above on why not `:`. */
const SEP = "~";

/**
 * How many accounts one browser remembers.
 *
 * Eight is far past any real shared device and keeps the cookie under ~300 bytes.
 * Past it the OLDEST is evicted, so the ninth account to use one browser re-shows
 * the notice for the first — which is the harmless direction and the one §7
 * already argues for: "a re-shown notice is a second notice, which is harmless,
 * while a never-shown one is the real gap".
 */
const MAX_ACCOUNTS = 8;

/**
 * The ids in a raw cookie value, in the order they were written.
 *
 * ⚠️ ABSENT AND UNREADABLE BOTH COME BACK EMPTY, AND THAT IS THE SAFE DIRECTION
 * HERE RATHER THAN A SHRUG. An empty list means "nobody has dismissed it", so the
 * notice SHOWS. For this one surface that is the correct failure: showing a
 * going-paid notice twice costs an interruption, while suppressing one costs a
 * person their only warning. Anywhere a nullish default feeds a decision that
 * could WITHHOLD something, it has to be a third state instead.
 */
function idsIn(cookieValue: string | null | undefined): string[] {
  if (!cookieValue) return [];
  /**
   * ⚠️ `decodeURIComponent` THROWS ON A MALFORMED VALUE, AND THIS RUNS INSIDE A
   * SERVER COMPONENT. Caught by this module's own test on the first run:
   * `decodeURIComponent("%%%not-decodable")` raises `URIError`, and an uncaught
   * throw here does not degrade to "not seen" — it takes the whole dashboard
   * render down for anybody holding a cookie a browser extension, a proxy or a
   * console fiddle had mangled.
   *
   * The cookie is user-writable, so a value that cannot be parsed is an ordinary
   * input rather than an impossible one. Undecodable falls through to the raw
   * string, which then simply contains no matching id.
   */
  let decoded: string;
  try {
    decoded = decodeURIComponent(cookieValue);
  } catch {
    decoded = cookieValue;
  }
  return decoded
    .split(SEP)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * A year. Comfortably longer than the grace period plus any plausible delay in
 * somebody getting round to opening the app, and short enough that it is not a
 * permanent record of anything.
 */
const MAX_AGE_DAYS = 365;

/**
 * Has THIS account seen it in THIS browser?
 *
 * A mismatch is still rejected — another account's id in the list is not this
 * account's answer — which is what stops a shared browser silencing the next
 * person. The change under D90 is that other accounts' ids are now BESIDE this
 * one rather than instead of it.
 */
export function betaNoticeSeen(
  cookieValue: string | null | undefined,
  userId: string,
): boolean {
  if (!userId) return false;
  return idsIn(cookieValue).includes(userId);
}

/**
 * The cookie value that remembers `userId` on top of whoever is already there.
 *
 * Pure and exported so the append, the de-duplication and the cap are testable
 * without a browser — the parts most likely to go quietly wrong.
 */
export function withBetaNoticeSeen(
  cookieValue: string | null | undefined,
  userId: string,
): string {
  const existing = idsIn(cookieValue).filter((id) => id !== userId);
  // Newest last, so eviction takes the oldest from the front.
  return [...existing, userId].slice(-MAX_ACCOUNTS).join(SEP);
}

/**
 * Mark it seen. Called when the notice is closed, however it is closed.
 *
 * ⚠️ IT READS BEFORE IT WRITES. Writing `userId` alone is what erased the other
 * account's dismissal (D90).
 */
export function markBetaNoticeSeen(userId: string): void {
  if (typeof document === "undefined") return;
  const current = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${COOKIE}=${encodeURIComponent(withBetaNoticeSeen(current, userId))}` +
    `; path=/; max-age=${MAX_AGE_DAYS * 24 * 60 * 60}; SameSite=Lax${secure}`;
}

/** The cookie's name, so the server reader and the writer cannot drift. */
export const BETA_NOTICE_COOKIE = COOKIE;
