import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase auth session on every matched request.
 *
 * Critical invariants (do not change):
 *  - Do NOT run any code between createServerClient(...) and
 *    supabase.auth.getClaims(). Doing so can cause users to be randomly
 *    logged out and is very hard to debug.
 *  - Return the SAME `supabaseResponse` object whose cookies were mutated by
 *    setAll. If you ever build a new response, copy the cookies across
 *    unchanged, or the browser and server sessions will desync.
 *
 * This is refresh-only: getClaims() validates the JWT (against the published
 * public keys) and triggers the token refresh + cookie write via setAll.
 * No redirects are performed yet.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // Fail open: if Supabase isn't configured for this environment (e.g. the
  // NEXT_PUBLIC_ keys aren't set on a given Vercel env, or a build cached an
  // earlier compile), skip the optimistic session refresh instead of throwing
  // and 500-ing every route — including public pages. This is refresh-only and
  // optimistic; the authoritative auth check is getUser() inside protected
  // pages, so passing through here is safe.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          // Reflect the new cookies onto the incoming request...
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          // ...then rebuild the response bound to the mutated request...
          supabaseResponse = NextResponse.next({ request })
          // ...and write the refreshed cookies plus the cache-control headers
          // (Cache-Control/Expires/Pragma no-store) so CDNs/proxies never cache
          // one user's session cookie and serve it to another.
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
          Object.entries(headers).forEach(([key, value]) => {
            supabaseResponse.headers.set(key, value)
          })
        },
      },
    }
  )

  // IMPORTANT: no code between createServerClient and getClaims.
  // This refreshes the session and writes any new auth cookies via setAll.
  await supabase.auth.getClaims()

  return supabaseResponse
}
