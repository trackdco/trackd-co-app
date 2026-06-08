import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Server-side Supabase client for Server Components, Server Actions, and
 * Route Handlers. Create a NEW client per request (never cache it in a
 * module-level/global variable - matters under fluid/serverless compute).
 *
 * cookies() from next/headers is async in Next 16 and must be awaited.
 *
 * setAll is wrapped in try/catch because cookieStore.set() throws during
 * Server Component rendering (the request cookie store is read-only there).
 * The throw is safely ignored: the proxy (proxy.ts -> updateSession) refreshes
 * the auth cookies on every request, so the session stays in sync.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Called from a Server Component: cookies cannot be set here.
            // Safe to ignore - the proxy refreshes the session each request.
          }
        },
      },
    }
  )
}
