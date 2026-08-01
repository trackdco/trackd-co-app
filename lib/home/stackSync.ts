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
import type { Stack, StackMembership } from "@/lib/home/stacks"

type Ok = { ok: boolean; skipped?: boolean }

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
export async function pushStacks(
  stacks: Stack[],
  /** Client compound id → its NAME. Needed because a client id can diverge from
   *  its `protocol_compounds` row id, and NAME is the only key that still
   *  resolves it (see `resolveProtocolCompoundIds`). Absent names fall back to
   *  id-only resolution, which is correct in the common case. */
  names: Record<string, string> = {}
): Promise<Ok> {
  try {
    const cx = await ctx()
    if (!cx) return { ok: false }

    // Resolve every client compound id to its protocol_compounds row up front.
    // PAST members count: a closed span is what keeps a historical day reading
    // the way it was lived, so it has to reach Postgres like any other row.
    const clientIds = [
      ...new Set(stacks.flatMap((s) => s.members.map((m) => m.compoundId))),
    ]
    const idMap = await resolveProtocolCompoundIds(
      clientIds.map((id) => ({ id, name: names[id] ?? null }))
    )

    // Drop stacks the device no longer has. With an EMPTY list this must be a
    // plain delete-all, not `NOT IN ('')` — Postgres cannot cast '' to uuid, so
    // the filtered form errors (22P02) and deleting your last stack would fail
    // server-side while reporting success.
    // Only uuid-shaped ids reach the filter string. A legacy `s_…` id, or one
    // carrying a comma or quote, would otherwise break the PostgREST parse and
    // permanently fail the mirror.
    const keep = stacks.map((s) => s.id).filter((id) => UUID_RE.test(id))
    const del = cx.supabase.from("stacks").delete().eq("user_id", cx.userId)
    const { error: delErr } = await (keep.length > 0
      ? del.not("id", "in", `(${keep.join(",")})`)
      : del)
    if (delErr) {
      if (isMissingTable(delErr)) return { ok: true, skipped: true }
      // Any other failure is real: the mirror is now wrong, so say so rather
      // than carrying on and reporting success.
      console.error("pushStacks failed", delErr)
      return { ok: false }
    }

    if (stacks.length === 0) return { ok: true }

    const { error: upErr } = await cx.supabase.from("stacks").upsert(
      stacks.map((s) => ({
        id: s.id,
        user_id: cx.userId,
        name: s.name,
        colour: s.colour,
        // The day the grouping began (supabase/protocol/009). Sent from the
        // device because only the device knows the user's local day; the column
        // defaults to the DATABASE's current date, which is a different day for
        // anyone far enough from UTC.
        effective_from: s.effectiveFrom,
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

    // Two client ids can resolve to the SAME protocol_compounds row (an offline
    // add of a name Postgres already has, before hydration de-dupes). Inserting
    // two OPEN spans for it violates `stack_members_one_current_stack_per_compound`,
    // and because the delete has already run that one collision would wipe EVERY
    // stack's membership — so collapse them here. First occurrence wins, matching
    // `dedupeMembership` on the read side.
    //
    // Only OPEN spans compete for that slot (009 scoped the index to the present).
    // A closed span is history and several may legitimately exist for the same
    // compound — a compound that moved from one stack to another has one in each —
    // so those are de-duplicated on the span itself, which only collapses rows
    // that are genuinely identical.
    const claimedOpen = new Set<string>()
    const seenClosed = new Set<string>()
    const rows = stacks.flatMap((s) =>
      s.members
        .map((m: StackMembership) => {
          // `Object.hasOwn`, not `idMap[clientId]`: a member id of "__proto__"
          // reads Object.prototype off an EMPTY map, which is truthy, so it was
          // counted as resolved and sent as `protocol_compound_id: {}`. The
          // membership delete runs first, so that one bad id wiped every stack's
          // membership in Postgres and then failed the insert.
          const pcId = Object.hasOwn(idMap, m.compoundId)
            ? idMap[m.compoundId]
            : undefined
          // A member with no Postgres row yet (an unmigrated custom) is skipped
          // rather than faked — the device store still holds the membership.
          if (!pcId) return null
          if (m.to === undefined) {
            if (claimedOpen.has(pcId)) return null
            claimedOpen.add(pcId)
          } else {
            const key = `${s.id}|${pcId}|${m.from}|${m.to}`
            if (seenClosed.has(key)) return null
            seenClosed.add(key)
          }
          return {
            stack_id: s.id,
            protocol_compound_id: pcId,
            user_id: cx.userId,
            position: m.position,
            effective_from: m.from,
            effective_to: m.to ?? null,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
    )
    // The honest success signal is "did every member RESOLVE", not "did every
    // member produce a row" — a duplicate collapsed just above is correct
    // behaviour, whereas a member whose Postgres row we could not find means the
    // mirror is incomplete and the next mutation should retry.
    const unresolved = clientIds.filter((id) => !Object.hasOwn(idMap, id)).length
    if (rows.length === 0) return { ok: unresolved === 0 }

    const { error: memErr } = await cx.supabase.from("stack_members").insert(rows)
    if (memErr) {
      if (isMissingTable(memErr)) return { ok: true, skipped: true }
      console.error("pushStacks failed", memErr)
      return { ok: false }
    }
    return { ok: unresolved === 0 }
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
      .select(
        "id, name, colour, effective_from, created_at, " +
          "stack_members(protocol_compound_id, position, effective_from, effective_to)"
      )
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
      effective_from: string | null
      created_at: string
      stack_members:
        | {
            protocol_compound_id: string
            position: number
            effective_from: string | null
            effective_to: string | null
          }[]
        | null
    }
    return ((data ?? []) as unknown as Row[]).map((r) => {
      // A database that has `stacks` but not yet 009 returns no `effective_from`.
      // Fall back to the creation DAY rather than to "no gate at all": an
      // ungated stack is the retroactive-grouping bug, whereas a creation-day
      // gate is the same answer 009's own backfill computes.
      const effectiveFrom = r.effective_from ?? r.created_at.slice(0, 10)
      return {
        id: r.id,
        name: r.name,
        colour: r.colour as Stack["colour"],
        effectiveFrom,
        members: (r.stack_members ?? [])
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((m, i) => ({
            compoundId: m.protocol_compound_id,
            from: m.effective_from ?? effectiveFrom,
            ...(m.effective_to ? { to: m.effective_to } : {}),
            position: typeof m.position === "number" ? m.position : i,
          })),
      }
    })
  } catch (e) {
    console.error("pullStacks failed", e)
    return []
  }
}
