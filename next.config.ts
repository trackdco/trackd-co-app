import type { NextConfig } from "next";

/**
 * Content-Security-Policy, shipped in REPORT-ONLY mode (Audit 2026-09, M-1/L-8).
 *
 * ⚠️ REPORT-ONLY MEANS IT BLOCKS NOTHING YET. The browser evaluates this policy
 * and logs anything that would be refused to the console, but every resource
 * still loads, so it CANNOT break checkout, image loading, or push. It is here so
 * the policy can be verified against the real Stripe/Supabase flows on a preview
 * deploy, then switched to enforcing (rename the header key to
 * "Content-Security-Policy") once the console is clean. Until that flip it is
 * documentation + monitoring, not protection - see SECURITY-AUDIT.md.
 *
 * Origins are the ones this app actually uses:
 *   - Stripe: js.stripe.com (Elements script + iframes), hooks.stripe.com
 *     (3DS/redirect frames), api.stripe.com + r.stripe.com (calls/telemetry).
 *   - Supabase: *.supabase.co over https (Data API + Storage) and wss (Realtime).
 *   - Google Fonts: the Payment Element pulls a Geist stylesheet
 *     (payment-sheet.tsx). App fonts are next/font self-hosted, so 'self' covers.
 * 'unsafe-inline' on script-src is Next's inline bootstrap; tightening it to a
 * nonce needs proxy plumbing and is deferred - noted in the audit.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://r.stripe.com",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

/**
 * DEV ESCAPE HATCH for running this repo from a git WORKTREE.
 *
 * Turbopack refuses to resolve anything above its project root, so a worktree
 * whose `node_modules` is a symlink back into the main checkout dies with
 * "Symlink [project]/node_modules is invalid, it points out of the filesystem
 * root". Pointing the root at the directory that CONTAINS both checkouts makes
 * the symlink legal again, which is what lets a parallel branch run its own dev
 * server without a second 1GB install.
 *
 * Unset by default, so `next build`, Vercel and CI are byte-identical to before:
 * the `turbopack` key is not merely empty, it is absent. Set it only to run dev
 * from a worktree:
 *
 *   TRACKD_TURBOPACK_ROOT=/path/that/contains/both npx next dev -p 3200
 */
const TURBOPACK_ROOT = process.env.TRACKD_TURBOPACK_ROOT;

const nextConfig: NextConfig = {
  // Don't advertise the framework/version in every response (fingerprinting).
  poweredByHeader: false,
  ...(TURBOPACK_ROOT ? { turbopack: { root: TURBOPACK_ROOT } } : {}),
  // DEV ONLY, and ignored entirely by `next build` / `next start`. Next blocks
  // cross-origin requests to dev assets unless the requesting host is listed
  // here, which otherwise makes previewing on a real phone impossible: you run
  // `next dev -H 0.0.0.0` and open the Mac's LAN address, and every HMR and
  // dev-asset request is refused. This is a phone-first PWA, so looking at it on
  // an actual phone is not an optional nicety.
  //
  // Scoped to the RFC 1918 private ranges, not a wildcard: the patterns match
  // segment by segment, so `192.168.*.*` covers a home network without also
  // allowing any public host. It grants nothing in production, and in dev only
  // to machines already on the same LAN as the running dev server.
  //
  // ⚠️ THE 172 RANGE IS SIXTEEN /16s AND THE MATCHER IS A GLOB, NOT CIDR.
  //
  // This read `"172.16.*.*"`, which looks like it covers RFC 1918's
  // `172.16.0.0/12` and does not: the pattern matches segment by segment, so it
  // grants only the FIRST of the sixteen /16s in that block (172.16.x.x), while
  // the range actually runs 172.16 through 172.31.
  //
  // That gap has a specific, common victim. An iPhone Personal Hotspot always
  // hands out `172.20.10.x` — so previewing on a phone tethered to its own
  // hotspot, which is the most convenient way to do it, was the one case that
  // could not work. The page itself returned 200 (HTML is not gated) while every
  // dev asset and HMR request was refused, so the phone showed a blank screen
  // and the server log showed nothing but success. Found 2026-08-27.
  //
  // Enumerated rather than widened to `172.*.*.*`, which would also grant the
  // public 172.0-15 and 172.32-255 space.
  allowedDevOrigins: [
    // ⚠️ LOCALHOST IS NOT IMPLICIT ONCE YOU BIND TO 0.0.0.0.
    //
    // While the server binds to 127.0.0.1 these two are same-origin and need no
    // entry, which is why the list went so long without them. Bind to 0.0.0.0
    // to let a phone in — the entire reason this setting exists — and the
    // origin no longer matches the bind host, so your OWN browser is refused
    // and the page renders blank. Listing them costs nothing and removes a trap
    // that only springs when someone does the thing this config is for.
    "127.0.0.1",
    "localhost",
    "192.168.*.*",
    "10.*.*.*",
    ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`),
    "*.local",
  ],

  // The floating "N" badge in dev. It is Next's own route indicator, not ours,
  // and it never ships — but it is pinned bottom-left, which is exactly where a
  // phone-first flow puts its consent tick and its primary button. Reviewing on
  // a real phone means it sits ON TOP of the two controls you are trying to
  // judge (and, worse, on top of ones you are trying to TAP). Off, so what is on
  // the screen in dev is what is on the screen in production.
  devIndicators: false,

  // Compress text/JSON responses (gzip/brotli). On Vercel this is handled at the
  // edge — verified live: HTML/RSC + JS chunks serve `content-encoding: br`
  // (~75–80% smaller), Supabase's Data API serves gzip JSON, and tiny/already-
  // compressed payloads are left alone (no double-compression). This explicit
  // flag keeps compression on for the self-hosted `next start` path too.
  // Negotiated via the client's `Accept-Encoding`.
  compress: true,

  // Phosphor's main entry re-exports 1512 icons (`export * from './csr/*'`).
  // optimizePackageImports rewrites `{ Plus }` to the direct module path so the
  // whole barrel never loads — keeps dev compile + prod tree-shaking fast.
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
    // THE ROUTER CACHE FOR DYNAMIC PAGES (feel pass §1: "a revisit shows the
    // screen at once"). Every (app) page is dynamic (the layout reads the
    // session), and Next 16 keeps none of them on the client by default, so a
    // tab you had just left went back to the server and its skeleton. Five
    // minutes: long enough that moving between tabs never waits, short enough
    // that a change made on another device shows up soon. A change made HERE
    // is not stale for even that long: the server actions behind every
    // server-rendered figure call `revalidatePath`, which clears this cache.
    staleTimes: {
      dynamic: 300,
    },
  },

  /**
   * THE QUIZ MOVED FROM `/onboarding` TO `/start` (spec 3-02, step 2), and this
   * is what keeps every address that ever pointed at it working.
   *
   * The move is a pure rename: `app/onboarding/` became `app/start/` with its
   * contents unchanged. But the OLD address is not ours to retire. It is sitting
   * in shared links, in bookmarks, in the `return_url` of Stripe intents that
   * were created before this deploy and will redirect back AFTER it, and in the
   * `?next=` of auth round-trips already in flight. All of those have to land on
   * the quiz, on the right step.
   *
   * ## Why `redirects()` here and not the proxy or a route file
   *
   * `redirecting.md` gives three mechanisms. This is the one for "the URL
   * structure changed and the new location is known ahead of time":
   *
   *   - **`redirects()` (this)** — matched before the filesystem and BEFORE the
   *     proxy, so it costs no render and no Supabase session refresh. `permanent:
   *     true` is a 308, which unlike a 301 PRESERVES THE REQUEST METHOD, and
   *     query values are carried to the destination automatically: *"When a
   *     redirect is applied, any query values provided in the request will be
   *     passed through to the redirect destination."* That is the `?step=` the
   *     whole flow is addressed by, and it is why nothing here has to rebuild a
   *     query string by hand.
   *   - **Proxy (`proxy.ts`)** — for redirects decided by a CONDITION (auth,
   *     session) or for thousands of rules read from a store. This is neither. It
   *     would also put a static rename inside the file whose one job is
   *     refreshing the Supabase session, and run it on every matched request.
   *   - **A route file calling `permanentRedirect()`** — would mean re-creating
   *     `app/onboarding/` as a stub the moment we finished deleting it, plus a
   *     catch-all segment, and `permanentRedirect` takes a URL string, so the
   *     `?step=` would have to be read out of `searchParams` and re-serialised by
   *     hand. More code, a render per hit, and a new way to get the query wrong.
   *
   * ## ⚠️ WHY THREE EXPLICIT SOURCES AND NOT `/onboarding/:path*`
   *
   * The wildcard is the obvious spelling and it is WRONG HERE, because
   * `redirects.md` states that *"Redirects are checked before the filesystem
   * which includes pages and `/public` files."* `public/onboarding/` is a real
   * and heavily-used asset directory — Kyle's two renders, the app carousel
   * screenshots, the progress photos, and the nineteen `install/<flow>/NN.webp`
   * walkthrough frames. A wildcard would match every one of those, 308 them to
   * `/start/...` where no file exists, and turn the install walkthrough and the
   * mascot into broken images. The assets are STATIC FILES that merely share a
   * prefix with the old route; they are not moving and must not be rewritten.
   *
   * So each of the three addresses that ever served HTML under `/onboarding` is
   * listed by name. That is the complete set — the route tree held `page.tsx`,
   * `cost/page.tsx` and `welcome-effects/page.tsx` and nothing else. (The
   * long-deleted `/onboarding/payoff` is deliberately absent: it 404s today and
   * would 404 at `/start/payoff` too, so a redirect would only launder a 404 into
   * a slower one.)
   */
  async redirects() {
    return [
      // The flow itself. Carries `?step=` through untouched, which is what makes
      // a pre-move Stripe `return_url` and a shared deep link still land right.
      { source: "/onboarding", destination: "/start", permanent: true },
      // The two review harnesses. Both 404 in production by their own
      // `VERCEL_ENV` check; these keep the PREVIEW links in Adrian's notes alive.
      { source: "/onboarding/cost", destination: "/start/cost", permanent: true },
      {
        source: "/onboarding/welcome-effects",
        destination: "/start/welcome-effects",
        permanent: true,
      },
    ];
  },

  // Cross-origin posture (CORS review, Spec 13 §2.5):
  //  - CORS itself is safe by DEFAULT. The app exposes no JSON API for other
  //    origins — all data flows through Server Components + Server Actions (the
  //    one route handler, /auth/callback, only does same-origin redirects). No
  //    code sets any `Access-Control-*` header, so there is NO wildcard origin,
  //    no `Origin` reflection, and no credentialed cross-origin access.
  //  - Server Actions (the credentialed surface — they carry the session cookie)
  //    are locked to SAME-ORIGIN by Next's built-in CSRF check: `allowedOrigins`
  //    is intentionally left unset, since unset = same-origin only. Adding an
  //    origin here would only loosen it, so we don't.
  // Below: baseline protective response headers (defense-in-depth, all routes).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Don't let other origins frame the (credentialed) app — clickjacking.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Never MIME-sniff a response into an executable type.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Don't leak full URLs (which can carry ids) to other origins.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Force HTTPS for a year (no includeSubDomains — a future auth.* subdomain
          // is on the roadmap and shouldn't be pre-committed to HSTS here).
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          // Turn off browser features this app never uses. `payment` and
          // `publickey-credentials-*` are deliberately NOT restricted: Stripe's
          // Payment Element uses the Payment Request API for Apple/Google Pay, and
          // restricting it would break wallet checkout.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          // CSP in REPORT-ONLY mode — blocks nothing, logs would-be violations to
          // the console. See the CONTENT_SECURITY_POLICY note above for how to
          // verify then flip to enforcing.
          {
            key: "Content-Security-Policy-Report-Only",
            value: CONTENT_SECURITY_POLICY,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
