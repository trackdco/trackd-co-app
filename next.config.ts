import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
