import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase client for use in Client Components.
 *
 * createBrowserClient returns a singleton and manages auth cookies via
 * document.cookie automatically, so no `cookies` option is configured here
 * (per the @supabase/ssr JSDoc, you should not configure options.cookies for
 * the browser client).
 *
 * Both env vars MUST keep the NEXT_PUBLIC_ prefix: Next.js inlines them into
 * the client bundle at build time. Never put the secret key here.
 *
 * cookieOptions.secure marks the sb-*-auth-token cookie Secure everywhere except
 * `next dev`, so the session cookie is never sent over plaintext HTTP. Mirrored
 * in server.ts and middleware.ts (the proxy actually writes the refreshed cookie,
 * so all three must agree). `httpOnly` is deliberately NOT set: this browser
 * client reads the token via document.cookie, so an httpOnly session cookie would
 * break auth - a documented trade-off, mitigated by the CSP in next.config.ts.
 * `NODE_ENV !== "development"` (not `=== "production"`) so a self-hosted
 * `next start` over https is Secure too; only http://localhost in `next dev` gets
 * a non-Secure cookie, without which local sign-in would silently fail.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: { secure: process.env.NODE_ENV !== 'development' },
    }
  )
}
