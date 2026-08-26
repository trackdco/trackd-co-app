import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
        ],
      },
    ];
  },
};

export default nextConfig;
