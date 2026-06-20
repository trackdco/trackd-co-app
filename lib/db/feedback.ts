"use server"

/**
 * Beta feedback capture (the + menu's "Beta notes & feedback"). Writes a single
 * `beta_feedback` row per submission; founders read them in `/admin`. Identity is
 * ALWAYS the verified session — `user_id` and `email` are taken server-side, never
 * trusted from the client (house pattern; RLS is the backstop). Best-effort and
 * never throws: a failed write returns `{ ok: false }` so the sheet can prompt a
 * retry without losing the typed note.
 */
import { createClient } from "@/lib/supabase/server"

const MAX_LEN = 4000

export async function submitBetaFeedback(
  message: string,
  context?: { path?: string; userAgent?: string }
): Promise<{ ok: boolean }> {
  try {
    const text = (message ?? "").trim()
    if (text.length < 1 || text.length > MAX_LEN) return { ok: false }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false }

    const { error } = await supabase.from("beta_feedback").insert({
      user_id: user.id,
      email: user.email ?? null,
      message: text,
      path: context?.path?.slice(0, 200) ?? null,
      user_agent: context?.userAgent?.slice(0, 500) ?? null,
    })
    if (error) {
      console.error("submitBetaFeedback failed", error)
      return { ok: false }
    }
    return { ok: true }
  } catch (e) {
    console.error("submitBetaFeedback failed", e)
    return { ok: false }
  }
}
