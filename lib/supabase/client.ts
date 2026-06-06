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
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
