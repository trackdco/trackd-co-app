import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { REQUESTED_PATH_HEADER } from '@/lib/auth/nextPath'

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
 * No redirects are performed here — the authoritative guard is `getUser()`
 * inside `app/(app)/layout.tsx`, and it stays the only thing deciding access.
 */
export async function updateSession(request: NextRequest) {
  /**
   * ⚠️ THE ONE THING THIS ADDS BESIDES THE REFRESH, AND IT DECIDES NOTHING.
   *
   * The path being requested, stamped onto the request headers so
   * `app/(app)/layout.tsx` can send an unauthenticated visitor to
   * `/login?next=<where they were going>` instead of dropping it. A Next 16
   * layout cannot read the pathname itself (`layout.md` §Pathname), and the
   * proxy is the mechanism `proxy.md` §Setting Headers names for handing
   * information from here to the application.
   *
   * Query string included — `/progress?tab=photos` is a different destination
   * from `/progress`, and the whole point is to land somebody back where they
   * were pointed. `safeNextPath` re-validates it on the way out regardless.
   */
  const requestedPath = `${request.nextUrl.pathname}${request.nextUrl.search}`

  /**
   * ⚠️ CLONES THE HEADERS AT CALL TIME, AND THAT TIMING IS THE INVARIANT.
   *
   * `request.cookies.set` writes through to the request's `cookie` header, which
   * is how the existing `NextResponse.next({ request })` pattern carries the
   * refreshed session. So the clone must be taken AFTER those writes, not once
   * up front — a stale clone would pin the OLD cookies onto the response and
   * desync the browser and server sessions, which is exactly what the second
   * invariant above warns about.
   *
   * Hence a function called at each build point rather than a value computed
   * once. A bare `NextResponse.next({ request })` would keep the cookies right
   * and silently drop the stamp; this keeps both.
   */
  const passThrough = () => {
    const headers = new Headers(request.headers)
    headers.set(REQUESTED_PATH_HEADER, requestedPath)
    return NextResponse.next({ request: { headers } })
  }

  let supabaseResponse = passThrough()

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
          supabaseResponse = passThrough()
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
