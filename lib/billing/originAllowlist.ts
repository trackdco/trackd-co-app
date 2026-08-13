/**
 * WHICH HOSTS WE WILL BUILD AN ABSOLUTE URL FOR — pure, so the rule can be
 * tested, which is the entire reason this file exists.
 *
 * ## Why it is not inline in the action any more
 *
 * It was, and a cold review found two holes in it by driving a real Stripe
 * portal session and reading the return link off the page Stripe served:
 *
 *   `/^192\.168\./.test(hostname)` matched any DOMAIN beginning "192.168."
 *     192.168.evil.com -> http://192.168.evil.com/billing
 *   and over PLAINTEXT, because the same test decided the scheme.
 *
 *   `.endsWith(".vercel.app")` accepted anybody's deployment
 *     attacker.vercel.app -> https://attacker.vercel.app/billing
 *
 * The comment beside them claimed "an unrecognised host falls back to
 * production". For those two it did not. A rule that can be wrong in a way a
 * comment cannot notice belongs in a file with tests next to it.
 *
 * It cannot live in `app/(app)/billing/actions.ts`: that is a `"use server"`
 * module, so every export is a dispatchable server action and a non-async export
 * fails the build outright.
 *
 * ## ⚠️ THERE IS A SECOND COPY OF THIS RULE, ON ANOTHER BRANCH
 *
 * `fix/host-header-allowlist` carries `lib/site-origin.ts`, which does the same
 * job for the password-reset and login paths — where the value becomes a LINK IN
 * AN EMAIL, a worse target than a Stripe return URL.
 *
 * That copy gets the private-IP test right (it anchors the regex) and has the
 * `.vercel.app` hole. **When that branch merges, one of the two has to go**, and
 * the survivor should be `lib/site-origin.ts` with this file's preview rule
 * folded into it. Carried in `next-tasks.md`.
 */

/** Production, and the fallback for anything not on the list. */
export const PRODUCTION_ORIGIN = "https://trackdco.app";

/**
 * A LAN address, matched as an IP rather than as a string that starts like one.
 *
 * Every label has to be numeric and in range, so a DNS name cannot satisfy it —
 * which `192.168.evil.com` did under the old prefix test, and was then handed a
 * plaintext `http://` URL because the same test also chose the scheme.
 */
export function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  if (!parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return false;
  if (parts[0] === "10") return true;
  if (parts[0] === "192" && parts[1] === "168") return true;
  // 172.16.0.0 - 172.31.255.255
  return parts[0] === "172" && Number(parts[1]) >= 16 && Number(parts[1]) <= 31;
}

/** A dev server, including one reached over the LAN from a phone. */
export function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    isPrivateIPv4(hostname)
  );
}

/**
 * THIS PROJECT'S preview deploys, not the whole `.vercel.app` namespace.
 *
 * Vercel gives every build its own hostname, so a fixed list is impossible — but
 * `.vercel.app` on its own is every Vercel customer on earth, and this value is
 * where a payment provider sends a signed-in user immediately after a billing
 * action. Vercel's generated names all begin with the project name.
 */
export function isOwnPreview(hostname: string): boolean {
  if (!hostname.endsWith(".vercel.app")) return false;
  const label = hostname.slice(0, -".vercel.app".length);
  return label === PROJECT || label.startsWith(`${PROJECT}-`);
}

const PROJECT = "trackd-co-app";

/** The whole decision. */
export function isAllowedHost(hostname: string): boolean {
  return (
    hostname === "trackdco.app" ||
    hostname === "www.trackdco.app" ||
    isOwnPreview(hostname) ||
    isLocalHost(hostname)
  );
}

/**
 * The absolute origin to hand a payment provider, from a Host header.
 *
 * FAILS TO PRODUCTION. An unrecognised host is never echoed back, which is the
 * property the old comment claimed and the old code did not have.
 */
export function originFromHost(host: string | null | undefined): string {
  if (!host) return PRODUCTION_ORIGIN;
  const hostname = host.split(":")[0].toLowerCase();
  if (!isAllowedHost(hostname)) return PRODUCTION_ORIGIN;
  return `${isLocalHost(hostname) ? "http" : "https"}://${host}`;
}
