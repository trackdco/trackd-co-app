/**
 * ⚠️ IS THIS THROWN VALUE NEXT'S REDIRECT SIGNAL, OR A REAL FAILURE?
 *
 * ## Why the presence of `digest` is not the test
 *
 * `redirect()` reports itself by throwing, and a client `catch` around a server
 * action sees it. The obvious test is `"digest" in e`. **It is wrong, and it was
 * wrong here**, because React attaches a `digest` to server errors too. Measured
 * against the installed Next 16.2.7:
 *
 *     redirect      digest = "NEXT_REDIRECT;replace;/;307;"
 *     server crash  digest = "3849572013"
 *     `"digest" in e`   TRUE for BOTH
 *
 * So a server action that crashed was being read as a completed deletion. In
 * this flow that meant {@link clearDeviceDataFor} wiping somebody's on-device
 * health data at the moment their account had NOT been deleted, and the failure
 * message never rendering. Next's own `isBailoutToCSRError` compares the VALUE
 * for exactly this reason.
 *
 * ## Why a local prefix check rather than importing Next's `isRedirectError`
 *
 * `isRedirectError` lives at `next/dist/client/components/redirect-error`, which
 * is an internal path with no public export. Importing it would move a silent
 * breakage into the RUNTIME on a version bump. This checks the same discriminant
 * - the `NEXT_REDIRECT` code that opens the digest - and
 * `redirectSignal.test.ts` builds its fixture with **Next's own
 * `getRedirectError`**, so a format change breaks a TEST loudly instead of
 * breaking the erasure promise quietly. The fragility is deliberately parked
 * where it fails safe.
 *
 * ## Which way it errs
 *
 * A false NEGATIVE leaves a device copy behind, which is the behaviour that
 * existed before D116 and is recoverable by clearing site data. A false POSITIVE
 * destroys data for somebody whose account still exists. They are not
 * symmetrical, so the test is the narrow one.
 */

/** The code Next opens a redirect digest with. `redirect.js:48`. */
const REDIRECT_CODE = "NEXT_REDIRECT";

export function isRedirectSignal(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if (!("digest" in error)) return false;

  const { digest } = error as { digest?: unknown };
  // ⚠️ A non-string digest is not a redirect. React's digests are strings, but
  // an object shaped by something else must not fall through to `startsWith`.
  if (typeof digest !== "string") return false;

  // `NEXT_REDIRECT;<type>;<url>;<status>;` - the separator is required, so a
  // digest that merely begins with those letters cannot pass by accident.
  return digest === REDIRECT_CODE || digest.startsWith(`${REDIRECT_CODE};`);
}
