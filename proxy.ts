import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Next.js 16 renamed the "middleware" file convention to "proxy".
 * This runs on every matched request and refreshes the Supabase session.
 *
 * Note: do NOT set `export const runtime` here - the runtime option is not
 * allowed in proxy files and will throw. Proxy defaults to the Node.js
 * runtime, which is correct for @supabase/ssr.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - image asset extensions
     * Always re-verify auth inside Server Functions / a DAL - the proxy is
     * optimistic session refresh only.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
