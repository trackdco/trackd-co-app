"use server"

/**
 * Data access for the injection-site catalogue (Spec 19). `injection_sites` is a
 * read-only, coordinate-bearing catalogue — every injectable site plus the (x, y)
 * the body map plots it at. The dose-log flow lets a user pick ANY site when they
 * log; there's no pre-set "working set" (that concept was dropped). Historical
 * `dose_logs.injection_site` is untouched by anything here.
 *
 * RLS-scoped; identity from the verified session only (the house pattern, see
 * `lib/db/cycles.ts` / `doseLogs.ts`). The catalogue is a shared read (SELECT
 * granted to `authenticated`).
 */
import { createClient } from "@/lib/supabase/server"
import type { InjectionSiteRoute, InjectionSiteRow } from "@/lib/db/types"

async function sessionCtx() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, userId: user.id }
}

/**
 * The full injection-site catalogue, ordered for display, optionally scoped to a
 * single route. Shared read — still requires an authed session (the SELECT grant
 * is to `authenticated`). Empty array (never throws) when signed out / on error.
 */
export async function listInjectionSiteCatalogue(
  route?: InjectionSiteRoute
): Promise<InjectionSiteRow[]> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return []
    let query = ctx.supabase.from("injection_sites").select("*")
    if (route) query = query.eq("route", route)
    const { data, error } = await query.order("sort_order", { ascending: true })
    if (error) {
      console.error("listInjectionSiteCatalogue failed", error)
      return []
    }
    return (data ?? []) as InjectionSiteRow[]
  } catch (e) {
    console.error("listInjectionSiteCatalogue failed", e)
    return []
  }
}
