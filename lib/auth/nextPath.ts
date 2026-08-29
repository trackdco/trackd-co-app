/**
 * ⚠️ WHERE A POST-AUTH DESTINATION IS VALIDATED. ONE PARSER, FOUR DOORWAYS.
 *
 * A `next` is an internal path somebody should land on once they are signed in.
 * Four surfaces read one: `/login` (off the URL), its two server actions (off
 * the form), `/auth/callback` (Google's 302) and `/auth/confirm` (the emailed
 * link). Every one of them is a redirect built from untrusted input.
 *
 * ## ⚠️ A `startsWith` TEST IS NOT ENOUGH, AND THREE OF THE FOUR USED ONE
 *
 * The rule `/auth/callback` and `/auth/confirm` shipped with was "starts with
 * `/`, does not start with `//`". A cold review had already walked through the
 * identical rule in `app/login/actions.ts` by replaying the real Server Action
 * POST:
 *
 *     next=//evil.com       -> blocked
 *     next=https://evil.com -> blocked
 *     next=/\evil.com       -> PASSED, and the browser lands on evil.com
 *     next=/<TAB>/evil.com  -> PASSED (also LF, CR)
 *
 * The WHATWG URL parser folds a backslash to `/` and strips C0 controls, so
 * `/\` IS `//` by the time a browser reads it. A prefix test on the raw string
 * is checking a value nothing will ever use.
 *
 * `readNext` in `app/login/actions.ts` was hardened against exactly this, and
 * its own comment named the condition under which the other three would matter:
 * *"Not remotely triggerable today — `next` is a constant in `account.tsx` …
 * but the guarantee goes live the first time anything reads `next` off a URL."*
 *
 * ⚠️ **THAT DAY IS TODAY.** `/login` now reads `?next=` off the address bar so a
 * deep link survives sign-in, and hands it to the Google button, which threads
 * it to `/auth/callback`, and to sign-up, which threads it into the confirmation
 * email and back through `/auth/confirm`. The two weak checks are on the far end
 * of both of those threads. So the parser moved here and all four call it — the
 * hardening travels with the feature that made it reachable, rather than being
 * a separate job somebody notices later.
 *
 * The string is PARSED, against a base that cannot be escaped, and only its
 * path, query and fragment survive. Whatever host a caller tries to smuggle in
 * is discarded BY CONSTRUCTION rather than by a pattern someone has to keep
 * ahead of.
 */

/** Where `/login` sends someone when no destination was asked for. */
export const DEFAULT_NEXT = "/dashboard";

/**
 * The requested path, or `fallback` if it named anywhere but this origin.
 *
 * Anything unusable falls back rather than erroring: a mangled destination must
 * never cost somebody the account they just made, or the sign-in they just did.
 */
export function safeNextPath(
  raw: unknown,
  fallback: string = DEFAULT_NEXT,
): string {
  if (typeof raw !== "string" || !raw.startsWith("/")) return fallback;
  try {
    // The base is opaque and unreachable, so a successful parse that leaves it
    // behind proves the input named another origin.
    const base = "https://trackd.invalid";
    const url = new URL(raw, base);
    if (url.origin !== base) return fallback;
    const resolved = `${url.pathname}${url.search}${url.hash}`;
    // `new URL("/\\evil.com", base)` yields origin `https://evil.com`, caught
    // above. This second test catches nothing today and costs nothing; it is
    // here so a future change to the parse cannot silently re-open the hole.
    return resolved.startsWith("/") && !resolved.startsWith("//")
      ? resolved
      : fallback;
  } catch {
    return fallback;
  }
}

/**
 * ⚠️ THE HEADER THE PROXY STAMPS SO A LAYOUT CAN BUILD A `?next=`.
 *
 * Next 16 layouts CANNOT read the current path. That is not an oversight to work
 * around — `layout.md` §Pathname states it outright: *"Layouts do not re-render
 * on navigation, so they do not access pathname which would otherwise become
 * stale"*, and it points at `usePathname` in a Client Component. A client hook
 * is no use to `app/(app)/layout.tsx`, whose whole job is to decide, on the
 * server and before anything renders, that you may not be here.
 *
 * So the proxy — which does have the URL — stamps it onto the request headers,
 * which is the mechanism `proxy.md` §Setting Headers names for passing
 * information from the proxy to the application.
 *
 * ⚠️ IT IS A CONVENIENCE AND NOT A GUARD. Nothing decides access from it. If it
 * is absent — a request that missed the proxy matcher, a future config change —
 * the layout redirects to a bare `/login`, which is exactly what it did before
 * this existed. The failure mode is the old behaviour, not an open door.
 */
export const REQUESTED_PATH_HEADER = "x-trackd-path";
