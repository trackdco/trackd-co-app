"use server"

/**
 * Stacks ⇄ Postgres (Spec 05). The device store is the synchronous, offline read
 * path; `stacks` + `stack_members` (`supabase/protocol/007`) are the durable
 * source that survives a PWA reinstall.
 *
 * Identity always from the verified session, RLS the backstop, never the service
 * role (house pattern). Best-effort and never throws: the local write has
 * already succeeded by the time these run.
 *
 * Membership is written as `protocol_compounds.id`, which is NOT always the
 * client's `StackCompound.id` — the two legitimately diverge (see
 * `findProtocolCompoundId` in `protocolSync.ts`). Resolution goes through the
 * same lookup, so a stack can't end up pointing at a row that doesn't exist.
 */
import { createClient } from "@/lib/supabase/server"
import { resolveProtocolCompoundIds } from "@/lib/home/protocolSync"
import type { Stack } from "@/lib/home/stacks"

type Ok = { ok: boolean; skipped?: boolean }

async function ctx() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, userId: user.id }
}

/** The 007 tables may not exist yet in an environment that hasn't migrated. */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205"
}

/**
 * Replace the user's stacks with `stacks`. A full replace rather than a diff:
 * the list is tiny, and a replace is idempotent, so a re-run after an offline
 * gap converges instead of accumulating.
 */
export async function pushStacks(stacks: Stack[]): Promise<Ok> {
  try {
    const cx = await ctx()
    if (!cx) return { ok: false }

    // Resolve every client compound id to its protocol_compounds row up front.
    const clientIds = [...new Set(stacks.flatMap((s) => s.memberIds))]
    const idMap = await resolveProtocolCompoundIds(clientIds)

    const { error: delErr } = await cx.supabase
      .from("stacks")
      .delete()
      .eq("user_id", cx.userId)
      .not("id", "in", `(${stacks.map((s) => `"${s.id}"`).join(",") || '""'})`)
    if (delErr && isMissingTable(delErr)) return { ok: true, skipped: true }

    if (stacks.length === 0) return { ok: true }

    const { error: upErr } = await cx.supabase.from("stacks").upsert(
      stacks.map((s) => ({
        id: s.id,
        user_id: cx.userId,
        name: s.name,
        colour: s.colour,
      })),
      { onConflict: "id" }
    )
    if (upErr) {
      if (isMissingTable(upErr)) return { ok: true, skipped: true }
      console.error("pushStacks failed", upErr)
      return { ok: false }
    }

    // Membership: clear this user's rows then re-insert, so a removal is a
    // removal. Scoped by user_id, and RLS is the backstop.
    const { error: clearErr } = await cx.supabase
      .from("stack_members")
      .delete()
      .eq("user_id", cx.userId)
    if (clearErr && !isMissingTable(clearErr)) {
      console.error("pushStacks failed", clearErr)
      return { ok: false }
    }

    const rows = stacks.flatMap((s) =>
      s.memberIds
        .map((clientId, position) => {
          const pcId = idMap[clientId]
          // A member with no Postgres row yet (an unmigrated custom) is skipped
          // rather than faked — the device store still holds the membership.
          return pcId ? { stack_id: s.id, protocol_compound_id: pcId, user_id: cx.userId, position } : null
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
    )
    if (rows.length === 0) return { ok: true }

    const { error: memErr } = await cx.supabase.from("stack_members").insert(rows)
    if (memErr) {
      if (isMissingTable(memErr)) return { ok: true, skipped: true }
      console.error("pushStacks failed", memErr)
      return { ok: false }
    }
    return { ok: true }
  } catch (e) {
    console.error("pushStacks failed", e)
    return { ok: false }
  }
}

/**
 * The user's stacks from Postgres, keyed back to CLIENT compound ids. Returns an
 * empty array when signed out, offline, or unmigrated — a failed pull must never
 * wipe the local cache, so callers treat empty as "no news".
 */
export async function pullStacks(): Promise<Stack[]> {
  try {
    const cx = await ctx()
    if (!cx) return []
    const { data, error } = await cx.supabase
      .from("stacks")
      .select("id, name, colour, stack_members(protocol_compound_id, position)")
      .eq("user_id", cx.userId)
      .order("created_at", { ascending: true })
    if (error) {
      if (!isMissingTable(error)) console.error("pullStacks failed", error)
      return []
    }

    type Row = {
      id: string
      name: string
      colour: string
      stack_members: { protocol_compound_id: string; position: number }[] | null
    }
    return ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      name: r.name,
      colour: r.colour as Stack["colour"],
      memberIds: (r.stack_members ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((m) => m.protocol_compound_id),
    }))
  } catch (e) {
    console.error("pullStacks failed", e)
    return []
  }
}
