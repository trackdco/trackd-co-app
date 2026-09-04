/**
 * ⚠️ HOW LONG A SIGNED STORAGE URL LIVES. ONE VALUE, ALL FOUR BUCKETS (D47).
 *
 * `bloodwork`, `progress-photos`, `journal` and `avatars` are all PRIVATE
 * buckets, so every image on Progress, Blocks, Calendar and Profile is displayed
 * through a signed URL minted on the server at render time.
 *
 * ## Five minutes, not an hour
 *
 * A signed URL carries no session. Anyone holding the string can fetch the
 * object until it expires, from any browser, with no account — so the TTL is the
 * whole of the exposure window for a link to somebody's blood report. An hour is
 * a long time for that to be forwardable, screenshot-able, or sitting in a
 * shared-device history. Five minutes is comfortably longer than a page needs
 * and short enough that a leaked URL is usually already dead.
 *
 * ## Why the value is HERE and not at the call sites
 *
 * It was four values, not one: three page-local `SIGNED_URL_TTL` constants at
 * `60 * 60`, plus a bare `3600` typed into the avatar read. The bare literal is
 * the reason this module exists — `16-account-deletion.md` §3.5 names it
 * exactly: *"a hardcoded duration is the one that survives a policy change and
 * nobody notices"*. A policy change applied to three named constants would have
 * left the avatar at an hour and nothing would have reported it.
 *
 * ## It does not need to cover the page's lifetime
 *
 * Each of these pages is a server component that mints fresh URLs on every
 * render, so shortening the window costs nothing on a normal visit. What it does
 * NOT survive is a tab left open past the expiry and then scrolled — the image
 * 400s rather than re-signing itself. That is the accepted trade at five
 * minutes; a client-side re-sign is not built and is not part of this change.
 *
 * ⚠️ SECONDS, because that is what `createSignedUrl` / `createSignedUrls` take.
 */
export const SIGNED_URL_TTL = 5 * 60;
